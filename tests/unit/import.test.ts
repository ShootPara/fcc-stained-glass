import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';
import { importSources } from '../../scripts/import-sources.js';
import { assertNoPendingTransaction, promoteBatch, withOperationLock } from '../../scripts/lib/atomic-files.js';
import { jsonBytes, sha256Bytes, sha256File } from '../../scripts/lib/digests.js';
import { PROJECT_ROOT } from '../../scripts/lib/paths.js';
import type { SourceManifest } from '../../scripts/lib/contracts.js';

const directories: string[] = [];
async function fixture(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'fcc import with spaces '));
  directories.push(root);
  return root;
}
async function put(root: string, relative: string, bytes: string | Buffer): Promise<void> {
  const filename = path.join(root, relative);
  await mkdir(path.dirname(filename), { recursive: true });
  await writeFile(filename, bytes);
}
async function readManifest(root: string): Promise<SourceManifest> {
  return JSON.parse(await readFile(path.join(root, 'source/manifest.json'), 'utf8')) as SourceManifest;
}
function history(id = 'H28', filename = 'history.txt', acquisitionPath = filename) {
  return {
    id, role: 'history', path: `source/histories/${filename}`, originalFilename: filename,
    provenance: { sourceId: id, form: 'transcription', referenceUrl: 'https://example.org/history' },
    acquisition: { group: 'history', relativePath: acquisitionPath },
  };
}

async function symlinkExternalFile(target: string, destination: string): Promise<void> {
  if (process.platform !== 'win32') {
    await mkdir(path.dirname(destination), { recursive: true });
    await symlink(target, destination, 'file');
    return;
  }
  // A junction preserves the external-path attack condition without requiring
  // the Windows privilege needed to create an ordinary file symlink.
  await symlink(path.dirname(target), path.dirname(destination), 'junction');
}
async function acquisition(root: string, entries: unknown[]): Promise<void> {
  await put(root, 'source/acquisition.json', jsonBytes({ schemaVersion: 1, files: entries }));
}
afterEach(async () => { await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true }))); });

describe('canonical source importer', () => {
  it('copies original JPEG and PNG bytes, measures native dimensions, and reruns without rewriting', async () => {
    const root = await fixture();
    const inputs = await fixture();
    const jpeg = await sharp({ create: { width: 7, height: 5, channels: 3, background: '#fcf4dd' } }).jpeg().toBuffer();
    const png = await sharp({ create: { width: 5, height: 9, channels: 4, background: '#ffffff' } }).png().toBuffer();
    await put(inputs, 'Photo with spaces.jpg', jpeg);
    await put(inputs, 'Coloring Pages/002.png', png);
    await acquisition(root, [
      { id: 'photo-001', role: 'photo', path: 'source/photos/Photo with spaces.jpg', originalFilename: 'Photo with spaces.jpg', provenance: { sourceId: 'PHOTO-COLLECTION', form: 'original-file' }, acquisition: { group: 'photos', relativePath: 'Photo with spaces.jpg' } },
      { id: 'design-002', role: 'coloring', path: 'source/coloring/002.png', originalFilename: '002.png', provenance: { sourceId: 'COLORING-COLLECTION', form: 'prepared-art' }, acquisition: { group: 'coloring', relativePath: 'Coloring Pages/002.png' } },
    ]);
    const result = await importSources(root, { sourceRoot: inputs });
    expect(result).toMatchObject({ selectedFiles: 2, copiedFiles: 2, manifestEntries: 2, manifestChanged: true });
    expect(await readFile(path.join(root, 'source/photos/Photo with spaces.jpg'))).toEqual(jpeg);
    expect(await readFile(path.join(root, 'source/coloring/002.png'))).toEqual(png);
    const manifest = await readManifest(root);
    expect(manifest.files.find(entry => entry.id === 'photo-001')).toMatchObject({ width: 7, height: 5, bytes: jpeg.length, sha256: sha256Bytes(jpeg) });
    expect(manifest.files.find(entry => entry.id === 'design-002')).toMatchObject({ width: 5, height: 9, bytes: png.length, sha256: sha256Bytes(png) });
    const receiptTime = (await stat(path.join(root, 'source/manifest.json'))).mtimeMs;
    expect(await importSources(root, { sourceRoot: inputs })).toMatchObject({ copiedFiles: 0, unchangedFiles: 2, manifestChanged: false });
    expect((await stat(path.join(root, 'source/manifest.json'))).mtimeMs).toBe(receiptTime);
    expect(await readdir(path.join(root, '.work/staging'))).toEqual([]);
  });

  it('inventories supplied local bytes and detects later corruption', async () => {
    const root = await fixture();
    await acquisition(root, [history()]);
    await put(root, 'source/histories/history.txt', 'History: original words.\n');
    const result = await importSources(root, { verifyExisting: true });
    expect(result).toMatchObject({ copiedFiles: 0, unchangedFiles: 1, manifestEntries: 1 });
    const receipt = await readFile(path.join(root, 'source/manifest.json'));
    await put(root, 'source/histories/history.txt', 'History: changed words.\n');
    await expect(importSources(root, { verifyExisting: true })).rejects.toMatchObject({ code: 'E_SOURCE_CHANGED' });
    expect(await readFile(path.join(root, 'source/manifest.json'))).toEqual(receipt);
  });

  it('validates the entire requested batch before copying any source', async () => {
    const root = await fixture();
    const inputs = await fixture();
    await acquisition(root, [history('H28', 'first.txt'), history('H35', 'missing.txt')]);
    await put(inputs, 'first.txt', 'Present first file');
    await expect(importSources(root, { historyRoot: inputs })).rejects.toMatchObject({ code: 'E_FILE_MISSING' });
    await expect(stat(path.join(root, 'source/histories/first.txt'))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(stat(path.join(root, 'source/manifest.json'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects different incoming bytes for an existing stable ID', async () => {
    const root = await fixture();
    const inputs = await fixture();
    await acquisition(root, [history()]);
    await put(inputs, 'history.txt', 'Original history.');
    await importSources(root, { historyRoot: inputs });
    await put(inputs, 'history.txt', 'Changed history.');
    await expect(importSources(root, { historyRoot: inputs })).rejects.toMatchObject({ code: 'E_SOURCE_REPLACEMENT_REQUIRED' });
    expect(await readFile(path.join(root, 'source/histories/history.txt'), 'utf8')).toBe('Original history.');
  });

  it('preserves an untracked destination with different bytes', async () => {
    const root = await fixture();
    const inputs = await fixture();
    await acquisition(root, [history()]);
    await put(inputs, 'history.txt', 'Incoming file');
    await put(root, 'source/histories/history.txt', 'Untracked existing file');
    await expect(importSources(root, { historyRoot: inputs })).rejects.toMatchObject({ code: 'E_SOURCE_COLLISION' });
    expect(await readFile(path.join(root, 'source/histories/history.txt'), 'utf8')).toBe('Untracked existing file');
  });

  it('archives original bytes and their receipt before an explicit replacement', async () => {
    const root = await fixture();
    const inputs = await fixture();
    await acquisition(root, [history()]);
    await put(root, 'source/histories/history.txt', 'Original history.');
    await importSources(root, { verifyExisting: true });
    const originalEntry = (await readManifest(root)).files[0]!;
    await put(inputs, 'replacement with spaces.txt', 'Corrected history.');
    const result = await importSources(root, { replaceSource: 'H28', replacementFile: path.join(inputs, 'replacement with spaces.txt') });
    expect(result).toMatchObject({ copiedFiles: 1, manifestEntries: 2, archivedIds: [`archived-source-${originalEntry.sha256}`] });
    const manifest = await readManifest(root);
    const archived = manifest.files.find(entry => entry.id.startsWith('archived-source-'))!;
    const current = manifest.files.find(entry => entry.id === 'H28')!;
    expect(await readFile(path.join(root, archived.path), 'utf8')).toBe('Original history.');
    expect(JSON.parse(await readFile(path.join(root, path.posix.dirname(archived.path), 'source-entry.json'), 'utf8'))).toEqual(originalEntry);
    expect(await readFile(path.join(root, current.path), 'utf8')).toBe('Corrected history.');
    expect(current.originalFilename).toBe('replacement with spaces.txt');
    expect(current.provenance.referenceUrl).toBeUndefined();
    expect(await importSources(root, { verifyExisting: true })).toMatchObject({ manifestChanged: false });
    expect(await importSources(root, { replaceSource: 'H28', replacementFile: path.join(inputs, 'replacement with spaces.txt') })).toMatchObject({ copiedFiles: 0, archivedIds: [], manifestChanged: false });
  });

  it('rejects duplicate IDs and Windows case-folding path collisions', async () => {
    const root = await fixture();
    await acquisition(root, [history('H28', 'first.txt'), history('H28', 'second.txt')]);
    await expect(importSources(root, { verifyExisting: true })).rejects.toMatchObject({ code: 'E_DUPLICATE_ID' });
    await acquisition(root, [history('H28', 'Case.txt'), history('H35', 'case.txt')]);
    await expect(importSources(root, { verifyExisting: true })).rejects.toMatchObject({ code: 'E_DUPLICATE_PATH' });
  });

  it('retains separate source receipts when two replaced sources originally had identical bytes', async () => {
    const root = await fixture();
    const inputs = await fixture();
    await acquisition(root, [history('H28', 'first.txt'), history('H35', 'second.txt')]);
    await put(root, 'source/histories/first.txt', 'Identical original bytes.');
    await put(root, 'source/histories/second.txt', 'Identical original bytes.');
    await importSources(root, { verifyExisting: true });
    await put(inputs, 'replacement.txt', 'New bytes.');
    for (const id of ['H28', 'H35']) {
      await importSources(root, { replaceSource: id, replacementFile: path.join(inputs, 'replacement.txt') });
    }
    const archives = (await readManifest(root)).files.filter(entry => entry.id.startsWith('archived-source-'));
    expect(archives).toHaveLength(2);
    expect(new Set(archives.map(entry => entry.id)).size).toBe(2);
    const sourceIds: string[] = [];
    for (const archive of archives) {
      expect(await readFile(path.join(root, archive.path), 'utf8')).toBe('Identical original bytes.');
      const receipt = JSON.parse(await readFile(path.join(root, path.posix.dirname(archive.path), 'source-entry.json'), 'utf8')) as { id: string };
      sourceIds.push(receipt.id);
    }
    expect(sourceIds.sort()).toEqual(['H28', 'H35']);
    expect(await importSources(root, { verifyExisting: true })).toMatchObject({ manifestChanged: false, manifestEntries: 4 });
  });

  it('rejects source path traversal and a symlink input', async () => {
    const root = await fixture();
    const inputs = await fixture();
    await acquisition(root, [{ ...history(), acquisition: { group: 'history', relativePath: '../outside.txt' } }]);
    await expect(importSources(root, { historyRoot: inputs })).rejects.toMatchObject({ code: 'E_PATH' });
    const outside = await fixture();
    await put(outside, 'history.txt', 'Original');
    await symlinkExternalFile(path.join(outside, 'history.txt'), path.join(inputs, 'linked', 'history.txt'));
    await acquisition(root, [history('H28', 'history.txt', 'linked/history.txt')]);
    await expect(importSources(root, { historyRoot: inputs })).rejects.toMatchObject({ code: 'E_PATH_SYMLINK' });
  });

  it('checks expected byte counts and hashes before committing an initial receipt', async () => {
    const root = await fixture();
    await put(root, 'source/histories/history.txt', 'original');
    await acquisition(root, [{ ...history(), expectedBytes: 999 }]);
    await expect(importSources(root, { verifyExisting: true })).rejects.toMatchObject({ code: 'E_SOURCE_SIZE' });
    await acquisition(root, [{ ...history(), expectedSha256: sha256Bytes('other') }]);
    await expect(importSources(root, { verifyExisting: true })).rejects.toMatchObject({ code: 'E_SOURCE_HASH' });
    await expect(stat(path.join(root, 'source/manifest.json'))).rejects.toMatchObject({ code: 'ENOENT' });
  });
});

describe('batch promotion and recovery', () => {
  it('rolls back promoted bytes and leaves the old registry intact after a failure', async () => {
    const root = await fixture();
    await put(root, 'source/existing.txt', 'old bytes');
    await put(root, 'source/manifest.json', 'old registry');
    await expect(withOperationLock(root, 'test', () => promoteBatch(root, 'test', [
      { path: 'source/existing.txt', bytes: 'new bytes' },
      { path: 'source/new.txt', bytes: 'new file' },
      { path: 'source/manifest.json', bytes: 'new registry' },
    ], { afterPromote: index => { if (index === 1) throw new Error('simulated disk failure'); } }))).rejects.toThrow('simulated disk failure');
    expect(await readFile(path.join(root, 'source/existing.txt'), 'utf8')).toBe('old bytes');
    expect(await readFile(path.join(root, 'source/manifest.json'), 'utf8')).toBe('old registry');
    await expect(stat(path.join(root, 'source/new.txt'))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(assertNoPendingTransaction(root)).resolves.toBeUndefined();
  });

  it('rejects changed staging inputs and concurrent mutations', async () => {
    const root = await fixture();
    await put(root, 'source/existing.txt', 'old bytes');
    await withOperationLock(root, 'first', async () => {
      await expect(withOperationLock(root, 'second', async () => undefined)).rejects.toMatchObject({ code: 'E_OPERATION_LOCKED', exitCode: 2 });
      await expect(promoteBatch(root, 'first', [{ path: 'source/existing.txt', bytes: 'changed', expectedSha256: sha256Bytes('expected') }])).rejects.toMatchObject({ code: 'E_STAGE_HASH' });
    });
    expect(await readFile(path.join(root, 'source/existing.txt'), 'utf8')).toBe('old bytes');
  });

  it.each(['promotion', 'rollback-cleanup'] as const)('recovers a process terminated during %s', async phase => {
    const root = await fixture();
    await put(root, 'source/existing.txt', 'old bytes');
    await put(root, 'source/manifest.json', 'old registry');
    const helperUrl = pathToFileURL(path.join(PROJECT_ROOT, 'scripts/lib/atomic-files.ts')).href;
    const loaderUrl = pathToFileURL(path.join(PROJECT_ROOT, 'node_modules/tsx/dist/loader.mjs')).href;
    const program = `
      import fs from 'node:fs/promises';
      import { syncBuiltinESMExports } from 'node:module';
      const root = process.argv[1];
      const phase = process.argv[2];
      if (phase === 'rollback-cleanup') {
        const originalRm = fs.rm;
        fs.rm = async (...args) => {
          await originalRm(...args);
          if (String(args[0]).split('\\\\').join('/').includes('/.work/staging/') && args[1]?.recursive) process.exit(77);
        };
        syncBuiltinESMExports();
      }
      const { withOperationLock, promoteBatch } = await import(${JSON.stringify(helperUrl)});
      await withOperationLock(root, 'interrupted-test', () => promoteBatch(root, 'interrupted-test', [
        {path: 'source/existing.txt', bytes: 'new bytes'},
        {path: 'source/manifest.json', bytes: 'new registry'}
      ], {afterPromote: () => {
        if (phase === 'promotion') process.exit(77);
        throw new Error('trigger rollback');
      }}));
    `;
    const child = spawnSync(process.execPath, ['--import', loaderUrl, '--input-type=module', '-e', program, root, phase], { cwd: PROJECT_ROOT, encoding: 'utf8', timeout: 10_000 });
    expect(child.status, child.stderr).toBe(77);
    await expect(assertNoPendingTransaction(root)).rejects.toMatchObject({ code: 'E_TRANSACTION_PENDING', exitCode: 4 });
    const journal = JSON.parse(await readFile(path.join(root, '.work/promotion.json'), 'utf8')) as { state: string; transactionId: string };
    expect(journal.state).toBe(phase === 'promotion' ? 'prepared' : 'rolled-back');
    if (phase === 'rollback-cleanup') await expect(stat(path.join(root, '.work/staging', journal.transactionId))).rejects.toMatchObject({ code: 'ENOENT' });
    let recovered = false;
    await withOperationLock(root, 'recovery-test', async wasRecovered => { recovered = wasRecovered; });
    expect(recovered).toBe(true);
    expect(await readFile(path.join(root, 'source/existing.txt'), 'utf8')).toBe('old bytes');
    expect(await readFile(path.join(root, 'source/manifest.json'), 'utf8')).toBe('old registry');
    expect(await sha256File(path.join(root, 'source/existing.txt'))).toBe(sha256Bytes('old bytes'));
    await expect(assertNoPendingTransaction(root)).resolves.toBeUndefined();
  });
});
