import { copyFile, lstat, mkdir, open, readFile, rename, rm, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { CliError } from './cli.js';
import { PROJECT_ROOT, assertRegularProjectFile, assertSafeProjectPath, resolveProjectPath } from './paths.js';
import { jsonBytes, sha256File } from './digests.js';

const LOCK = '.work/operation.lock';
const JOURNAL = '.work/promotion.json';
const heldLocks = new Map<string, string>();

interface LockOwner { token: string; pid: number; host: string; operation: string; startedAtUtc: string }
interface JournalEntry {
  target: string;
  staged: string;
  backup: string;
  temporary: string;
  existed: boolean;
  originalSha256: string | null;
  expectedSha256: string;
}
interface Journal {
  schemaVersion: 1;
  transactionId: string;
  operation: string;
  state: 'prepared' | 'committed' | 'rolled-back';
  entries: JournalEntry[];
}

export type FileUpdate = {
  path: string;
  expectedSha256?: string;
} & ({ bytes: Uint8Array | string; fromFile?: never } | { fromFile: string; bytes?: never });

async function exists(filename: string): Promise<boolean> {
  try { await lstat(filename); return true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
}

async function ensureParent(relativePath: string, root: string): Promise<void> {
  const parent = path.posix.dirname(relativePath);
  if (parent !== '.') await mkdir(await assertSafeProjectPath(parent, root, { allowMissing: true }), { recursive: true });
}

async function syncFile(filename: string): Promise<void> {
  const handle = await open(filename, 'r+');
  try { await handle.sync(); } finally { await handle.close(); }
}

// Rename a verified same-directory temporary file over a regular file. Never
// unlink the old target first: a failed rename must preserve the last version.
async function replaceFromFile(source: string, target: string, temporary: string, expectedHash: string): Promise<void> {
  await copyFile(source, temporary);
  await syncFile(temporary);
  if (await sha256File(temporary) !== expectedHash) throw new CliError('E_STAGE_HASH', `Staged file hash changed before promotion: ${path.basename(target)}`, 3);
  await rename(temporary, target);
}

export async function atomicWriteJson(relativePath: string, value: unknown, root = PROJECT_ROOT): Promise<void> {
  const target = await assertSafeProjectPath(relativePath, root, { allowMissing: true });
  await ensureParent(relativePath, root);
  const temporary = `${target}.tmp-${randomUUID()}`;
  try {
    const handle = await open(temporary, 'wx');
    try { await handle.writeFile(jsonBytes(value)); await handle.sync(); }
    finally { await handle.close(); }
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true });
  }
}

export async function assertNoPendingTransaction(root = PROJECT_ROOT): Promise<void> {
  const journal = await assertSafeProjectPath(JOURNAL, root, { allowMissing: true });
  if (await exists(journal)) {
    throw new CliError('E_TRANSACTION_PENDING', 'A file promotion was interrupted. Run the original mutating command again to recover .work/promotion.json before validation.', 4);
  }
}

function processAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; }
  catch (error) { return (error as NodeJS.ErrnoException).code !== 'ESRCH'; }
}

async function acquireLock(root: string, operation: string): Promise<LockOwner> {
  await ensureParent(LOCK, root);
  const directory = await assertSafeProjectPath(LOCK, root, { allowMissing: true });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await mkdir(directory);
      const owner: LockOwner = { token: randomUUID(), pid: process.pid, host: hostname(), operation, startedAtUtc: new Date().toISOString() };
      try { await atomicWriteJson(`${LOCK}/owner.json`, owner, root); }
      catch (error) { await rm(directory, { recursive: true, force: true }); throw error; }
      return owner;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
    await assertSafeProjectPath(LOCK, root);
    const ownerPath = resolveProjectPath(`${LOCK}/owner.json`, root);
    let owner: LockOwner | null = null;
    if (await exists(ownerPath)) {
      await assertRegularProjectFile(`${LOCK}/owner.json`, root);
      try { owner = JSON.parse(await readFile(ownerPath, 'utf8')) as LockOwner; }
      catch { throw new CliError('E_OPERATION_LOCKED', 'Operation lock has an unreadable owner record; preserve it for inspection.', 2); }
      if (!owner || typeof owner.token !== 'string' || !Number.isSafeInteger(owner.pid) || owner.pid <= 0 || typeof owner.host !== 'string') {
        throw new CliError('E_OPERATION_LOCKED', 'Operation lock has an invalid owner record; preserve it for inspection.', 2);
      }
      if (owner.host !== hostname() || processAlive(owner.pid)) {
        throw new CliError('E_OPERATION_LOCKED', `Project is locked by ${owner.operation} (PID ${owner.pid}, host ${owner.host}). Wait for it to finish, then retry.`, 2);
      }
    } else if (Date.now() - (await lstat(directory)).mtimeMs < 30_000) {
      throw new CliError('E_OPERATION_LOCKED', 'Another command is acquiring the operation lock. Retry after it finishes.', 2);
    }
    // A claim inside the dead owner's directory allows only one recovery.
    const claimPath = path.join(directory, 'recovery-claim');
    let claim;
    try { claim = await open(claimPath, 'wx'); await claim.close(); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new CliError('E_OPERATION_LOCKED', 'Another process is recovering a stale operation lock. Retry after it finishes.', 2);
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw error;
    }
    const current = await exists(ownerPath) ? JSON.parse(await readFile(ownerPath, 'utf8')) as LockOwner : null;
    if (current?.token !== owner?.token) {
      await rm(claimPath, { force: true });
      continue;
    }
    const quarantine = resolveProjectPath(`.work/retired-lock-${randomUUID()}`, root);
    await rename(directory, quarantine);
    await rm(quarantine, { recursive: true, force: true });
  }
  throw new CliError('E_OPERATION_LOCKED', 'Could not acquire the project operation lock. Retry after other commands finish.', 2);
}

function requireLock(root: string): void {
  if (!heldLocks.has(path.resolve(root))) throw new CliError('E_LOCK_REQUIRED', 'A mutating operation must acquire withOperationLock before promoting files.', 5);
}

export async function withOperationLock<T>(
  root: string,
  operation: string,
  execute: (recovered: boolean) => Promise<T>,
): Promise<T> {
  const key = path.resolve(root);
  if (heldLocks.has(key)) throw new CliError('E_OPERATION_LOCKED', 'This process already holds the project operation lock.', 2);
  const owner = await acquireLock(root, operation);
  heldLocks.set(key, owner.token);
  try {
    const recovered = await recoverPendingTransaction(root);
    return await execute(recovered);
  } finally {
    heldLocks.delete(key);
    const filename = resolveProjectPath(`${LOCK}/owner.json`, root);
    if (await exists(filename)) {
      const current = JSON.parse(await readFile(filename, 'utf8')) as LockOwner;
      if (current.token === owner.token) await rm(resolveProjectPath(LOCK, root), { recursive: true });
    }
  }
}

function parseJournal(raw: unknown): Journal {
  const journal = raw as Journal;
  if (!journal || journal.schemaVersion !== 1 || !/^[a-f0-9-]{36}$/.test(journal.transactionId) || !['prepared', 'committed', 'rolled-back'].includes(journal.state) || !Array.isArray(journal.entries) || journal.entries.length > 10_000) {
    throw new CliError('E_TRANSACTION_INVALID', 'The promotion journal is invalid. Preserve .work/promotion.json and its staging files for recovery.', 5);
  }
  const targets = new Set<string>();
  for (const [index, entry] of journal.entries.entries()) {
    const base = `.work/staging/${journal.transactionId}`;
    if (!entry || typeof entry.target !== 'string' || targets.has(entry.target) || entry.staged !== `${base}/files/${index}` || entry.backup !== `${base}/backups/${index}` || entry.temporary !== `${entry.target}.fcc-${journal.transactionId}.tmp` || typeof entry.existed !== 'boolean' || !/^[a-f0-9]{64}$/.test(entry.expectedSha256) || (entry.existed ? !/^[a-f0-9]{64}$/.test(entry.originalSha256 ?? '') : entry.originalSha256 !== null)) {
      throw new CliError('E_TRANSACTION_INVALID', 'The promotion journal contains an invalid entry. Preserve it for recovery.', 5);
    }
    targets.add(entry.target);
  }
  return journal;
}

async function cleanupJournal(journal: Journal, root: string): Promise<void> {
  for (const entry of journal.entries) {
    const temporary = await assertSafeProjectPath(entry.temporary, root, { allowMissing: true });
    await rm(temporary, { force: true });
  }
  const staging = await assertSafeProjectPath(`.work/staging/${journal.transactionId}`, root, { allowMissing: true });
  await rm(staging, { recursive: true, force: true });
  await unlink(resolveProjectPath(JOURNAL, root));
}

async function rollback(journal: Journal, root: string): Promise<void> {
  for (const entry of [...journal.entries].reverse()) {
    const target = await assertSafeProjectPath(entry.target, root, { allowMissing: true });
    const temporary = await assertSafeProjectPath(entry.temporary, root, { allowMissing: true });
    const currentHash = await exists(target) ? await sha256File(await assertRegularProjectFile(entry.target, root)) : null;
    if (currentHash !== null && currentHash !== entry.expectedSha256 && currentHash !== entry.originalSha256) {
      throw new CliError('E_RECOVERY_CONFLICT', `File changed outside the interrupted operation: ${entry.target}. Preserve the journal; recovery will not overwrite those bytes.`, 5);
    }
    if (entry.existed) {
      const backup = await assertRegularProjectFile(entry.backup, root);
      if (await sha256File(backup) !== entry.originalSha256) throw new CliError('E_RECOVERY_BACKUP', `Recovery backup is damaged for ${entry.target}. Preserve the journal.`, 5);
      await ensureParent(entry.target, root);
      await replaceFromFile(backup, target, temporary, entry.originalSha256!);
    } else if (currentHash !== null) {
      await rm(target);
    }
  }
  // Persist completion before deleting backups. An interruption during cleanup
  // must resume cleanup, not attempt a second rollback from removed backups.
  journal.state = 'rolled-back';
  await atomicWriteJson(JOURNAL, journal, root);
  await cleanupJournal(journal, root);
}

export async function recoverPendingTransaction(root = PROJECT_ROOT): Promise<boolean> {
  requireLock(root);
  const filename = await assertSafeProjectPath(JOURNAL, root, { allowMissing: true });
  if (!await exists(filename)) return false;
  await assertRegularProjectFile(JOURNAL, root);
  let journal: Journal;
  try { journal = parseJournal(JSON.parse(await readFile(filename, 'utf8'))); }
  catch (error) {
    if (error instanceof CliError) throw error;
    throw new CliError('E_TRANSACTION_INVALID', 'Cannot read the promotion journal. Preserve it and its staging files for recovery.', 5);
  }
  if (journal.state === 'prepared') await rollback(journal, root);
  else await cleanupJournal(journal, root);
  return true;
}

export async function promoteBatch(
  root: string,
  operation: string,
  updates: FileUpdate[],
  options: { afterPromote?: (index: number, target: string) => void | Promise<void> } = {},
): Promise<void> {
  requireLock(root);
  await assertNoPendingTransaction(root);
  if (updates.length === 0) return;
  if (new Set(updates.map(update => update.path)).size !== updates.length) throw new CliError('E_DUPLICATE_OUTPUT', 'The promotion batch contains duplicate target paths.');
  const transactionId = randomUUID();
  const stagingRelative = `.work/staging/${transactionId}`;
  const staging = await assertSafeProjectPath(stagingRelative, root, { allowMissing: true });
  await mkdir(path.join(staging, 'files'), { recursive: true });
  await mkdir(path.join(staging, 'backups'), { recursive: true });
  const journal: Journal = { schemaVersion: 1, transactionId, operation, state: 'prepared', entries: [] };
  let journalWritten = false;
  try {
    for (const [index, update] of updates.entries()) {
      const target = await assertSafeProjectPath(update.path, root, { allowMissing: true });
      if (update.path.startsWith('.work/')) throw new CliError('E_OUTPUT_PATH', 'Promotion targets must not overwrite operation bookkeeping.');
      const staged = `${stagingRelative}/files/${index}`;
      const stagedAbsolute = resolveProjectPath(staged, root);
      if (update.fromFile !== undefined) await copyFile(update.fromFile, stagedAbsolute);
      else {
        const handle = await open(stagedAbsolute, 'wx');
        try { await handle.writeFile(update.bytes); } finally { await handle.close(); }
      }
      await syncFile(stagedAbsolute);
      const expectedSha256 = await sha256File(stagedAbsolute);
      if (update.expectedSha256 !== undefined && expectedSha256 !== update.expectedSha256) throw new CliError('E_STAGE_HASH', `Input changed while staging ${update.path}. Retry from stable source files.`);
      const existed = await exists(target);
      const backup = `${stagingRelative}/backups/${index}`;
      let originalSha256: string | null = null;
      if (existed) {
        await assertRegularProjectFile(update.path, root);
        await copyFile(target, resolveProjectPath(backup, root));
        await syncFile(resolveProjectPath(backup, root));
        originalSha256 = await sha256File(resolveProjectPath(backup, root));
      }
      journal.entries.push({ target: update.path, staged, backup, temporary: `${update.path}.fcc-${transactionId}.tmp`, existed, originalSha256, expectedSha256 });
    }
    await atomicWriteJson(JOURNAL, journal, root);
    journalWritten = true;
    // The caller puts its authoritative registry/manifest last in updates.
    for (const [index, entry] of journal.entries.entries()) {
      const target = await assertSafeProjectPath(entry.target, root, { allowMissing: true });
      const temporary = await assertSafeProjectPath(entry.temporary, root, { allowMissing: true });
      await ensureParent(entry.target, root);
      await replaceFromFile(resolveProjectPath(entry.staged, root), target, temporary, entry.expectedSha256);
      await options.afterPromote?.(index, entry.target);
    }
    journal.state = 'committed';
    await atomicWriteJson(JOURNAL, journal, root);
  } catch (error) {
    if (journalWritten) {
      try { await rollback(journal, root); }
      catch (recoveryError) {
        throw new CliError('E_RECOVERY_REQUIRED', `Promotion failed and recovery could not finish: ${recoveryError instanceof Error ? recoveryError.message : String(recoveryError)}. Preserve .work/promotion.json and rerun after resolving the named file.`, 5);
      }
    } else await rm(staging, { recursive: true, force: true });
    throw error;
  }
  try { await cleanupJournal(journal, root); }
  catch (error) {
    throw new CliError('E_TRANSACTION_CLEANUP', `Files committed, but operation cleanup failed: ${error instanceof Error ? error.message : String(error)}. Rerun the command to finish recovery.`, 5);
  }
}
