import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { type FileUpdate } from './atomic-files.js';
import { CliError } from './cli.js';
import { sha256Bytes, sha256File } from './digests.js';
import { assertRegularProjectFile, assertSafeProjectPath } from './paths.js';

/** Hold a whole requested batch on disk so --all does not retain every raw map
 * in memory. The shared promotion helper creates the durable recovery journal. */
export class PreparationStage {
  readonly updates: FileUpdate[] = [];
  readonly unchanged: string[] = [];
  readonly inputs = new Map<string, string>();
  private readonly targets = new Set<string>();
  private readonly directory: string;
  private absoluteDirectory = '';

  constructor(readonly root: string) {
    this.directory = `.work/staging/prepare-${randomUUID()}`;
  }

  async initialize(): Promise<void> {
    this.absoluteDirectory = await assertSafeProjectPath(this.directory, this.root, { allowMissing: true });
    await mkdir(this.absoluteDirectory, { recursive: true });
  }

  async observeInput(relativePath: string): Promise<Uint8Array> {
    const filename = await assertRegularProjectFile(relativePath, this.root);
    const bytes = await readFile(filename);
    const digest = sha256Bytes(bytes);
    const previous = this.inputs.get(relativePath);
    if (previous !== undefined && previous !== digest) {
      throw new CliError('E_PREPARATION_INPUT_CHANGED', `Preparation input changed while the batch was running: ${relativePath}. Retry from stable files.`, 3);
    }
    this.inputs.set(relativePath, digest);
    return bytes;
  }

  async verifyInputs(): Promise<void> {
    for (const [relativePath, digest] of this.inputs) {
      const filename = await assertRegularProjectFile(relativePath, this.root);
      if (await sha256File(filename) !== digest) {
        throw new CliError('E_PREPARATION_INPUT_CHANGED', `Preparation input changed while the batch was running: ${relativePath}. Retry from stable files.`, 3);
      }
    }
  }

  async add(relativePath: string, bytes: Uint8Array, immutable: boolean): Promise<void> {
    if (this.targets.has(relativePath)) throw new CliError('E_DUPLICATE_OUTPUT', `Preparation scheduled a target twice: ${relativePath}.`, 5);
    this.targets.add(relativePath);
    const digest = sha256Bytes(bytes);
    const target = await assertSafeProjectPath(relativePath, this.root, { allowMissing: true });
    let existing: Uint8Array | undefined;
    try { existing = await readFile(await assertRegularProjectFile(relativePath, this.root)); }
    catch (error) {
      if (!(error instanceof CliError && error.code === 'E_FILE_MISSING')) throw error;
    }
    if (existing !== undefined) {
      if (sha256Bytes(existing) === digest) { this.unchanged.push(relativePath); return; }
      if (immutable) throw new CliError('E_IMMUTABLE_COLLISION', `Existing immutable output has different bytes: ${relativePath}. Preserve it for inspection; preparation has not replaced it.`, 3);
    }
    // target was checked above even when no write is needed, including symlinks.
    void target;
    const filename = path.join(this.absoluteDirectory, String(this.updates.length));
    await writeFile(filename, bytes, { flag: 'wx' });
    if (await sha256File(filename) !== digest) throw new CliError('E_STAGE_HASH', `Staged preparation output changed: ${relativePath}.`, 5);
    this.updates.push({ path: relativePath, fromFile: filename, expectedSha256: digest });
  }

  async dispose(): Promise<void> {
    if (this.absoluteDirectory) await rm(this.absoluteDirectory, { recursive: true, force: true });
  }
}
