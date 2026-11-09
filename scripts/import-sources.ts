import { lstat, open, readFile } from 'node:fs/promises';
import path from 'node:path';
import { TextDecoder } from 'node:util';
import sharp from 'sharp';
import { z } from 'zod';
import { SourceEntrySchema, SourceManifestSchema, type SourceEntry, type SourceManifest } from './lib/contracts.js';
import { PROJECT_ROOT, assertRegularProjectFile, assertSafeProjectPath, resolveProjectPath } from './lib/paths.js';
import { canonicalJson, jsonBytes, sha256File } from './lib/digests.js';
import { promoteBatch, withOperationLock, type FileUpdate } from './lib/atomic-files.js';
import { CliError, isMain, parseNamedArgs, runCli, type RunReport } from './lib/cli.js';

const AcquisitionFileSchema = z.object({
  id: SourceEntrySchema.shape.id,
  role: SourceEntrySchema.shape.role,
  path: SourceEntrySchema.shape.path,
  originalFilename: SourceEntrySchema.shape.originalFilename,
  provenance: SourceEntrySchema.shape.provenance,
  expectedBytes: z.number().int().positive().optional(),
  expectedSha256: SourceEntrySchema.shape.sha256.optional(),
  acquisition: z.object({
    group: z.enum(['photos', 'coloring', 'history', 'cover', 'included']),
    relativePath: z.string().min(1).optional(),
  }).strict().optional(),
}).strict();

const AcquisitionSchema = z.object({ schemaVersion: z.literal(1), files: z.array(AcquisitionFileSchema) }).strict();
type AcquisitionFile = z.infer<typeof AcquisitionFileSchema>;

export interface ImportOptions {
  verifyExisting?: boolean;
  sourceRoot?: string;
  historyRoot?: string;
  coverFile?: string;
  replaceSource?: string;
  replacementFile?: string;
}

export interface ImportResult {
  selectedFiles: number;
  copiedFiles: number;
  unchangedFiles: number;
  manifestEntries: number;
  addedIds: string[];
  archivedIds: string[];
  notSelectedIds: string[];
  recoveredTransaction: boolean;
  manifestChanged: boolean;
}

async function fileExists(filename: string): Promise<boolean> {
  try { await lstat(filename); return true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
}

function validateOptions(options: ImportOptions): void {
  const external = options.sourceRoot || options.historyRoot || options.coverFile;
  const replacement = options.replaceSource || options.replacementFile;
  if (options.verifyExisting && (external || replacement)) throw new CliError('E_ARGUMENT', '--verify-existing cannot be combined with acquisition or replacement options.', 2);
  if (replacement && (!options.replaceSource || !options.replacementFile || external)) throw new CliError('E_ARGUMENT', 'Replacement requires --replace-source ID --replacement-file PATH, without other import options.', 2);
  if (!options.verifyExisting && !external && !replacement) throw new CliError('E_ARGUMENT', 'Use --verify-existing, --source-root PATH, --history-root PATH, --cover-file PATH, or an explicit source replacement.', 2);
}

function ensureUnique(entries: Array<{ id: string; path: string }>, label: string): void {
  const ids = new Set<string>();
  const paths = new Set<string>();
  for (const entry of entries) {
    if (ids.has(entry.id)) throw new CliError('E_DUPLICATE_ID', `${label} repeats source ID ${entry.id}.`);
    // Windows is case-insensitive: reject ambiguous portable target names.
    const portablePath = entry.path.toLowerCase();
    if (paths.has(portablePath)) throw new CliError('E_DUPLICATE_PATH', `${label} repeats a source path: ${entry.path}`);
    ids.add(entry.id); paths.add(portablePath);
  }
}

async function readJsonFile(relativePath: string, root: string): Promise<unknown> {
  const filename = await assertRegularProjectFile(relativePath, root);
  try { return JSON.parse(await readFile(filename, 'utf8')); }
  catch (error) { throw new CliError('E_JSON', `Cannot parse ${relativePath}: ${error instanceof Error ? error.message : String(error)}`); }
}

async function selectedInput(entry: AcquisitionFile, options: ImportOptions, root: string): Promise<string | null> {
  if (options.verifyExisting) return assertRegularProjectFile(entry.path, root);
  const group = entry.acquisition?.group ?? ({ photo: 'photos', coloring: 'coloring', history: 'history', cover: 'cover', font: 'included' } as const)[entry.role];
  let inputRoot: string | undefined;
  let relativePath: string | undefined;
  if ((group === 'photos' || group === 'coloring') && options.sourceRoot) {
    inputRoot = path.resolve(options.sourceRoot);
    relativePath = entry.acquisition?.relativePath ?? (group === 'coloring' ? `Coloring Pages/${entry.originalFilename}` : entry.originalFilename);
  } else if (group === 'history' && options.historyRoot) {
    inputRoot = path.resolve(options.historyRoot);
    relativePath = entry.acquisition?.relativePath ?? path.posix.basename(entry.path);
  } else if (group === 'cover' && options.coverFile) {
    const absolute = path.resolve(options.coverFile);
    inputRoot = path.dirname(absolute); relativePath = path.basename(absolute);
  }
  if (inputRoot && relativePath) return assertRegularProjectFile(relativePath, inputRoot);
  // Already included files (fonts, transcriptions, or previously acquired
  // materials) may be inventoried without requiring their external location.
  const included = await assertSafeProjectPath(entry.path, root, { allowMissing: true });
  return await fileExists(included) ? assertRegularProjectFile(entry.path, root) : null;
}

async function measuredEntry(entry: AcquisitionFile, filename: string, enforceExpected = true): Promise<SourceEntry> {
  const stat = await lstat(filename);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new CliError('E_FILE_TYPE', `Source ${entry.id} must be a regular file.`);
  if (stat.size === 0) throw new CliError('E_SOURCE_EMPTY', `Source ${entry.id} is empty.`);
  if (enforceExpected && entry.expectedBytes !== undefined && stat.size !== entry.expectedBytes) throw new CliError('E_SOURCE_SIZE', `${entry.id}: expected ${entry.expectedBytes} bytes, found ${stat.size}. Verify the source or use an explicit replacement.`);
  const sha256 = await sha256File(filename);
  if (enforceExpected && entry.expectedSha256 !== undefined && sha256 !== entry.expectedSha256) throw new CliError('E_SOURCE_HASH', `${entry.id}: bytes do not match the recorded acquisition hash.`);
  const image = entry.role === 'photo' || entry.role === 'coloring' || /\.(png|jpe?g|webp)$/i.test(entry.path);
  let dimensions: { width: number; height: number } | undefined;
  if (image) {
    try {
      const metadata = await sharp(filename, { failOn: 'error' }).metadata();
      if (!metadata.width || !metadata.height) throw new Error('Image dimensions are unavailable.');
      if (entry.role === 'photo' && metadata.format !== 'jpeg') throw new Error('Original photograph must be a JPEG.');
      if (entry.role === 'coloring' && metadata.format !== 'png') throw new Error('Coloring source must be a PNG.');
      dimensions = { width: metadata.width, height: metadata.height };
    } catch (error) { throw new CliError('E_SOURCE_IMAGE', `${entry.id}: ${error instanceof Error ? error.message : String(error)}`); }
  } else if (/\.txt$/i.test(entry.path)) {
    try { new TextDecoder('utf-8', { fatal: true }).decode(await readFile(filename)); }
    catch { throw new CliError('E_SOURCE_TEXT', `${entry.id}: text source is not valid UTF-8.`); }
  } else if (/\.(docx|ttf|otf|woff2)$/i.test(entry.path)) {
    const handle = await open(filename, 'r');
    const header = Buffer.alloc(4);
    try { await handle.read(header, 0, 4, 0); } finally { await handle.close(); }
    const extension = path.extname(entry.path).toLowerCase();
    const valid = extension === '.docx' ? header[0] === 0x50 && header[1] === 0x4b
      : extension === '.ttf' ? header.equals(Buffer.from([0, 1, 0, 0])) || header.toString('ascii') === 'true'
      : extension === '.otf' ? header.toString('ascii') === 'OTTO'
      : header.toString('ascii') === 'wOF2';
    if (!valid) throw new CliError('E_SOURCE_TYPE', `${entry.id}: contents do not match the ${extension} source type.`);
  }
  return SourceEntrySchema.parse({
    id: entry.id, role: entry.role, path: entry.path, originalFilename: entry.originalFilename,
    bytes: stat.size, sha256, ...dimensions, provenance: entry.provenance,
  });
}

async function assertReceiptCurrent(entry: SourceEntry, root: string): Promise<string> {
  const filename = await assertRegularProjectFile(entry.path, root);
  const stat = await lstat(filename);
  if (stat.size !== entry.bytes || await sha256File(filename) !== entry.sha256) {
    throw new CliError('E_SOURCE_CHANGED', `${entry.id}: existing source bytes differ from source/manifest.json. Restore the recorded file before importing a replacement.`);
  }
  return filename;
}

export async function importSources(root: string, options: ImportOptions, report?: RunReport): Promise<ImportResult> {
  validateOptions(options);
  return withOperationLock(root, 'import', async recovered => {
    const acquisitionParsed = AcquisitionSchema.safeParse(await readJsonFile('source/acquisition.json', root));
    if (!acquisitionParsed.success) throw new CliError('E_ACQUISITION_SCHEMA', 'source/acquisition.json has invalid fields.', 3, acquisitionParsed.error.issues);
    const acquisition = acquisitionParsed.data;
    ensureUnique(acquisition.files, 'Acquisition map');
    const manifestFilename = await assertSafeProjectPath('source/manifest.json', root, { allowMissing: true });
    const manifestExists = await fileExists(manifestFilename);
    const parsed = SourceManifestSchema.safeParse(manifestExists ? await readJsonFile('source/manifest.json', root) : { schemaVersion: 1, files: [] });
    if (!parsed.success) throw new CliError('E_MANIFEST_SCHEMA', 'source/manifest.json has invalid fields.', 3, parsed.error.issues);
    const oldManifest = parsed.data;
    ensureUnique(oldManifest.files, 'Source manifest');
    const nextEntries = new Map(oldManifest.files.map(entry => [entry.id, entry]));
    const updates: FileUpdate[] = [];
    const addedIds: string[] = [];
    const archivedIds: string[] = [];
    const notSelectedIds: string[] = [];
    let selectedFiles = 0;
    let copiedFiles = 0;
    let unchangedFiles = 0;
    let acquisitionChanged = false;

    if (options.replaceSource) {
      const item = acquisition.files.find(entry => entry.id === options.replaceSource);
      const prior = nextEntries.get(options.replaceSource);
      if (!item || !prior) throw new CliError('E_SOURCE_ID', `Replacement source ID is not present in both acquisition and manifest: ${options.replaceSource}`);
      if (item.path !== prior.path || item.role !== prior.role) throw new CliError('E_SOURCE_ID_CONFLICT', `Acquisition and manifest disagree about ${prior.id}. Resolve that conflict first.`);
      const original = await assertReceiptCurrent(prior, root);
      const incomingAbsolute = path.resolve(options.replacementFile!);
      const incoming = await assertRegularProjectFile(path.basename(incomingAbsolute), path.dirname(incomingAbsolute));
      const measured = await measuredEntry(item, incoming, false);
      selectedFiles = 1;
      if (measured.sha256 === prior.sha256) unchangedFiles = 1;
      else {
        const archivePath = `source/archive/${prior.id}/${prior.sha256}/${path.posix.basename(prior.path)}`;
        const hashArchiveId = `archived-source-${prior.sha256}`;
        // Two active IDs may legitimately contain equal bytes. Retain each
        // source's own archive path and receipt, using an ID suffix only when
        // the shared digest already identifies another source's archive.
        const hashArchive = nextEntries.get(hashArchiveId);
        const archiveId = hashArchive && hashArchive.path !== archivePath ? `${hashArchiveId}-${prior.id}` : hashArchiveId;
        if (!nextEntries.has(archiveId)) {
          const archived: SourceEntry = { ...prior, id: archiveId, path: archivePath };
          const archiveTarget = await assertSafeProjectPath(archivePath, root, { allowMissing: true });
          if (await fileExists(archiveTarget) && await sha256File(archiveTarget) !== prior.sha256) throw new CliError('E_ARCHIVE_COLLISION', `An archive path contains different bytes: ${archivePath}`);
          updates.push({ path: archivePath, fromFile: original, expectedSha256: prior.sha256 });
          updates.push({ path: `${path.posix.dirname(archivePath)}/source-entry.json`, bytes: jsonBytes(prior) });
          nextEntries.set(archiveId, archived);
          archivedIds.push(archiveId);
        } else {
          const archived = nextEntries.get(archiveId)!;
          if (archived.path !== archivePath) throw new CliError('E_ARCHIVE_COLLISION', `Archive ID ${archiveId} is already bound to a different source path.`);
          await assertReceiptCurrent(archived, root);
        }
        // A replacement is supplied locally; its old Drive URL is no longer
        // evidence of these new bytes. The collection/source identity stays.
        const replacement: SourceEntry = {
          ...measured,
          originalFilename: path.basename(incoming),
          provenance: { sourceId: item.provenance.sourceId, form: item.provenance.form },
        };
        nextEntries.set(item.id, replacement);
        updates.push({ path: item.path, fromFile: incoming, expectedSha256: measured.sha256 });
        Object.assign(item, { originalFilename: replacement.originalFilename, provenance: replacement.provenance, expectedBytes: measured.bytes, expectedSha256: measured.sha256 });
        acquisitionChanged = true;
        copiedFiles = 1;
      }
    } else {
      for (const item of acquisition.files) {
        const input = await selectedInput(item, options, root);
        if (input === null) { notSelectedIds.push(item.id); continue; }
        selectedFiles += 1;
        const measured = await measuredEntry(item, input);
        const prior = nextEntries.get(item.id);
        if (prior && (prior.path !== item.path || prior.role !== item.role)) throw new CliError('E_SOURCE_ID_CONFLICT', `${item.id}: stable ID is already bound to a different source path or role.`);
        if (prior) {
          await assertReceiptCurrent(prior, root);
          if (prior.sha256 !== measured.sha256) throw new CliError('E_SOURCE_REPLACEMENT_REQUIRED', `${item.id}: incoming bytes differ. Use --replace-source ${item.id} --replacement-file PATH for an explicit replacement.`);
        }
        const target = await assertSafeProjectPath(item.path, root, { allowMissing: true });
        if (await fileExists(target)) {
          await assertRegularProjectFile(item.path, root);
          if (await sha256File(target) !== measured.sha256) throw new CliError('E_SOURCE_COLLISION', `${item.id}: ${item.path} already contains different bytes; it was preserved.`);
          unchangedFiles += 1;
        } else {
          updates.push({ path: item.path, fromFile: input, expectedSha256: measured.sha256 });
          copiedFiles += 1;
        }
        if (!prior) addedIds.push(item.id);
        nextEntries.set(item.id, measured);
      }
      if (selectedFiles === 0) throw new CliError('E_IMPORT_EMPTY', 'No acquisition entries matched the supplied import options.', 2);
      if (options.verifyExisting) {
        for (const entry of oldManifest.files) if (entry.id.startsWith('archived-source-')) await assertReceiptCurrent(entry, root);
      }
    }

    const nextManifest: SourceManifest = { schemaVersion: 1, files: [...nextEntries.values()].sort((a, b) => a.id.localeCompare(b.id, 'en')) };
    ensureUnique(nextManifest.files, 'Updated source manifest');
    SourceManifestSchema.parse(nextManifest);
    const manifestChanged = !manifestExists || canonicalJson(oldManifest) !== canonicalJson(nextManifest);
    if (acquisitionChanged) updates.push({ path: 'source/acquisition.json', bytes: jsonBytes(acquisition) });
    // Manifest is the last authoritative write. No authored content is touched.
    if (manifestChanged) updates.push({ path: 'source/manifest.json', bytes: jsonBytes(nextManifest) });
    await promoteBatch(root, 'import', updates);
    const result: ImportResult = { selectedFiles, copiedFiles, unchangedFiles, manifestEntries: nextManifest.files.length, addedIds, archivedIds, notSelectedIds, recoveredTransaction: recovered, manifestChanged };
    if (report) {
      report.inputs.push('source/acquisition.json');
      report.outputs.push(...updates.map(update => update.path));
      report.digests['source/manifest.json'] = await sha256File(resolveProjectPath('source/manifest.json', root));
      if (recovered) report.warnings.push('Recovered an interrupted file promotion before importing.');
      if (notSelectedIds.length) report.warnings.push(`${notSelectedIds.length} acquisition entries were not selected and are not yet present locally.`);
      report.summary = result;
    }
    return result;
  });
}

async function main(): Promise<void> {
  await runCli({ operation: 'import' }, async report => {
    const args = parseNamedArgs(process.argv.slice(2), {
      'verify-existing': 'boolean', 'source-root': 'value', 'history-root': 'value', 'cover-file': 'value',
      'replace-source': 'value', 'replacement-file': 'value', help: 'boolean',
    });
    if (args.help) {
      console.log('Import existing local materials: npm run import -- --verify-existing\nAcquire photos and drawings: npm run import -- --source-root "C:\\Path\\To\\Coloring Book"\nOptional: --history-root PATH --cover-file PATH\nExplicit replacement: --replace-source ID --replacement-file PATH');
      return;
    }
    const options: ImportOptions = {
      verifyExisting: args['verify-existing'] as boolean | undefined,
      sourceRoot: args['source-root'] as string | undefined,
      historyRoot: args['history-root'] as string | undefined,
      coverFile: args['cover-file'] as string | undefined,
      replaceSource: args['replace-source'] as string | undefined,
      replacementFile: args['replacement-file'] as string | undefined,
    };
    report.scope = options.replaceSource ?? (options.verifyExisting ? 'included sources' : 'local acquisition');
    await importSources(PROJECT_ROOT, options, report);
  });
}

if (isMain(import.meta.url)) await main();
