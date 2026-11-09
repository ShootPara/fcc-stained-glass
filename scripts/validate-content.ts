import { open, readFile, readdir } from 'node:fs/promises';
import sharp from 'sharp';
import type { z } from 'zod';
import {
  EXPECTED_ARTWORK_IDS, EXPECTED_PHOTO_IDS,
  type ArtworkRecord, type BookConfig, type CitationSource, type EvidenceRef,
  type HistoricalSubject, type MediaConfig, type PhotoRecord, type ProjectConfig,
  type ReviewReceipt, type ValidationIssue,
} from '../src/shared/contracts.js';
import {
  ArtworkCollectionSchema, BookConfigSchema, CitationSourceCollectionSchema,
  HistoricalSubjectCollectionSchema, MediaConfigSchema, PhotoCollectionSchema,
  ProjectConfigSchema, ReviewReceiptSchema,
} from '../src/shared/validation.js';
import { SourceManifestSchema, type SourceEntry, type SourceManifest } from './lib/contracts.js';
import { assertNoPendingTransaction } from './lib/atomic-files.js';
import { CliError, isMain, parseNamedArgs, runCli } from './lib/cli.js';
import { sha256File } from './lib/digests.js';
import { assertRegularProjectFile, assertSafeProjectPath, PROJECT_ROOT } from './lib/paths.js';
import { validateAssets } from './lib/validate-assets.js';
import { assertReleaseReady } from './lib/release.js';

export interface CatalogInput {
  project: unknown;
  manifest: unknown;
  photos: unknown;
  artworks: unknown;
  subjects: unknown;
  sources: unknown;
  book: unknown;
  media: unknown;
  reviews?: unknown[];
}

export interface CatalogData {
  project: ProjectConfig;
  manifest: SourceManifest;
  photos: PhotoRecord[];
  artworks: ArtworkRecord[];
  subjects: HistoricalSubject[];
  sources: CitationSource[];
  book: BookConfig;
  media: MediaConfig;
  reviews: ReviewReceipt[];
}

export interface CatalogStats {
  photoCount: number;
  artworkCount: number;
  sourceCount: number;
  sourceBytes: number;
  verifiedSourceCount: number;
}

export interface CatalogValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
  warnings: string[];
  data?: CatalogData;
  stats: CatalogStats;
}

const FILES = {
  project: 'project.json',
  manifest: 'source/manifest.json',
  photos: 'content/photos.json',
  artworks: 'content/artworks.json',
  subjects: 'content/historical-subjects.json',
  sources: 'content/sources.json',
  book: 'content/book.json',
  media: 'content/media.json',
} as const;

function emptyStats(): CatalogStats {
  return { photoCount: 0, artworkCount: 0, sourceCount: 0, sourceBytes: 0, verifiedSourceCount: 0 };
}

function parseValue<T>(schema: z.ZodType<T>, input: unknown, file: string, issues: ValidationIssue[]): T | undefined {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  for (const issue of result.error.issues) {
    issues.push({ code: 'E_SCHEMA', file, field: issue.path.map(String).join('.'), message: issue.message });
  }
  return undefined;
}

function checkUnique<T>(items: readonly T[], key: (item: T) => string | number, file: string, field: string, issues: ValidationIssue[]) {
  const seen = new Set<string | number>();
  for (const item of items) {
    const value = key(item);
    if (seen.has(value)) {
      issues.push({ code: 'E_DUPLICATE', file, field, message: `Duplicate ${field}: ${String(value)}.` });
    }
    seen.add(value);
  }
}

function checkExpectedIds(actual: string[], expected: readonly string[], file: string, field: string, issues: ValidationIssue[]) {
  const actualSet = new Set(actual);
  const expectedSet = new Set(expected);
  for (const id of expected) {
    if (!actualSet.has(id)) issues.push({ code: 'E_MISSING_ID', file, field, recordId: id, message: `Missing required ${id}.` });
  }
  for (const id of actualSet) {
    if (!expectedSet.has(id)) issues.push({ code: 'E_UNEXPECTED_ID', file, field, recordId: id, message: `Unexpected collection ID ${id}.` });
  }
  if (actual.length !== expected.length) {
    issues.push({ code: 'E_COLLECTION_COUNT', file, field, message: `Expected ${expected.length} records; found ${actual.length}.` });
  }
}

/** Validate authored JSON and relationships without reading or changing any files. */
export function validateCatalogData(input: CatalogInput): CatalogValidationResult {
  const issues: ValidationIssue[] = [];
  const warnings: string[] = [];
  const project = parseValue(ProjectConfigSchema, input.project, FILES.project, issues);
  const manifest = parseValue(SourceManifestSchema, input.manifest, FILES.manifest, issues);
  const photoCollection = parseValue(PhotoCollectionSchema, input.photos, FILES.photos, issues);
  const artworkCollection = parseValue(ArtworkCollectionSchema, input.artworks, FILES.artworks, issues);
  const subjectCollection = parseValue(HistoricalSubjectCollectionSchema, input.subjects, FILES.subjects, issues);
  const sourceCollection = parseValue(CitationSourceCollectionSchema, input.sources, FILES.sources, issues);
  const book = parseValue(BookConfigSchema, input.book, FILES.book, issues);
  const media = parseValue(MediaConfigSchema, input.media, FILES.media, issues);
  const reviews: ReviewReceipt[] = [];
  for (const [index, raw] of (input.reviews ?? []).entries()) {
    const receipt = parseValue(ReviewReceiptSchema, raw, `content/reviews (entry ${index + 1})`, issues);
    if (receipt) reviews.push(receipt);
  }
  if (!project || !manifest || !photoCollection || !artworkCollection || !subjectCollection || !sourceCollection || !book || !media) {
    return { ok: false, issues, warnings, stats: emptyStats() };
  }

  const photos = photoCollection.photos;
  const artworks = artworkCollection.artworks;
  const subjects = subjectCollection.subjects;
  const sources = sourceCollection.sources;
  const data: CatalogData = { project, manifest, photos, artworks, subjects, sources, book, media, reviews };
  const stats: CatalogStats = {
    photoCount: photos.length, artworkCount: artworks.length, sourceCount: manifest.files.length,
    sourceBytes: manifest.files.reduce((sum, file) => sum + file.bytes, 0), verifiedSourceCount: 0,
  };

  checkUnique(manifest.files, (record) => record.id, FILES.manifest, 'id', issues);
  checkUnique(manifest.files, (record) => record.path.toLowerCase(), FILES.manifest, 'path (case-insensitive)', issues);
  checkUnique(photos, (record) => record.id, FILES.photos, 'id', issues);
  checkUnique(photos, (record) => record.sourceId, FILES.photos, 'sourceId', issues);
  checkUnique(photos, (record) => record.displayOrder, FILES.photos, 'displayOrder', issues);
  checkUnique(artworks, (record) => record.id, FILES.artworks, 'id', issues);
  checkUnique(artworks, (record) => record.sourceId, FILES.artworks, 'sourceId', issues);
  checkUnique(artworks, (record) => record.bookNumber, FILES.artworks, 'bookNumber', issues);
  checkUnique(subjects, (record) => record.id, FILES.subjects, 'id', issues);
  checkUnique(sources, (record) => record.id, FILES.sources, 'id', issues);
  checkUnique(reviews, (record) => `${record.recordId}/${record.reviewKind}/${record.contentVersion ?? 'current'}`, 'content/reviews', 'review identity', issues);
  checkExpectedIds(photos.map((record) => record.id), EXPECTED_PHOTO_IDS, FILES.photos, 'photos', issues);
  checkExpectedIds(artworks.map((record) => record.id), EXPECTED_ARTWORK_IDS, FILES.artworks, 'artworks', issues);
  checkExpectedIds(manifest.files.filter((record) => record.id.startsWith('photo-')).map((record) => record.id), EXPECTED_PHOTO_IDS, FILES.manifest, 'active photo IDs', issues);
  checkExpectedIds(manifest.files.filter((record) => record.id.startsWith('design-')).map((record) => record.id), EXPECTED_ARTWORK_IDS, FILES.manifest, 'active design IDs', issues);

  const sourceFiles = new Map(manifest.files.map((record) => [record.id, record]));
  const photoIds = new Set<string>(photos.map((record) => record.id));
  const artworkIds = new Set<string>(artworks.map((record) => record.id));
  const subjectIds = new Set(subjects.map((record) => record.id));
  const citationIds = new Set(sources.map((record) => record.id));

  function requireSource(id: string, role: SourceEntry['role'] | null, file: string, recordId: string, field: string) {
    const source = sourceFiles.get(id);
    if (!source) {
      issues.push({ code: 'E_SOURCE_REFERENCE', file, recordId, field, message: `Source ${id} is not in source/manifest.json.` });
    } else if (role && source.role !== role) {
      issues.push({ code: 'E_SOURCE_ROLE', file, recordId, field, message: `Source ${id} must have role ${role}; found ${source.role}.` });
    }
    return source;
  }

  function checkEvidence(evidence: EvidenceRef[], file: string, recordId: string, field: string) {
    for (const [index, ref] of evidence.entries()) {
      if (!citationIds.has(ref.sourceId) && !sourceFiles.has(ref.sourceId)) {
        issues.push({ code: 'E_EVIDENCE_REFERENCE', file, recordId, field: `${field}.${index}.sourceId`, message: `Unknown evidence source ${ref.sourceId}.` });
      }
    }
  }

  function checkSubjects(ids: string[] | null, file: string, recordId: string) {
    if (!ids) return;
    checkUnique(ids, (id) => id, file, `${recordId}.subjects.value`, issues);
    for (const id of ids) {
      if (!subjectIds.has(id)) issues.push({ code: 'E_SUBJECT_REFERENCE', file, recordId, field: 'subjects.value', message: `Unknown historical subject ${id}. Media filename numbers do not identify book subjects.` });
    }
  }

  for (const record of photos) {
    const source = requireSource(record.sourceId, 'photo', FILES.photos, record.id, 'sourceId');
    if (record.sourceId !== record.id) {
      issues.push({ code: 'E_PHOTO_SOURCE', file: FILES.photos, recordId: record.id, field: 'sourceId', message: `${record.id} must retain its matching stable source ID. Change gallery order or captions without rebinding the photograph.` });
    }
    if (source && !source.path.startsWith('source/photos/')) {
      issues.push({ code: 'E_SOURCE_LOCATION', file: FILES.manifest, recordId: source.id, field: 'path', message: 'Active photographs belong under source/photos/.' });
    }
    checkSubjects(record.subjects.value, FILES.photos, record.id);
    checkEvidence(record.subjects.evidence, FILES.photos, record.id, 'subjects.evidence');
    checkEvidence(record.location.evidence, FILES.photos, record.id, 'location.evidence');
    checkEvidence(record.historicalEvidence, FILES.photos, record.id, 'historicalEvidence');
  }
  for (const record of artworks) {
    const source = requireSource(record.sourceId, 'coloring', FILES.artworks, record.id, 'sourceId');
    if (source && (source.id !== record.id || source.path !== `source/coloring/${record.id.slice(7)}.png`)) {
      issues.push({ code: 'E_DESIGN_SOURCE', file: FILES.artworks, recordId: record.id, field: 'sourceId', message: `${record.id} must refer to its supplied ${record.id.slice(7)}.png through the matching source ID.` });
    }
    if (record.originalPhoto.value !== null && !photoIds.has(record.originalPhoto.value)) {
      issues.push({ code: 'E_PHOTO_REFERENCE', file: FILES.artworks, recordId: record.id, field: 'originalPhoto.value', message: `Unknown photograph ${record.originalPhoto.value}.` });
    }
    checkSubjects(record.subjects.value, FILES.artworks, record.id);
    checkEvidence(record.originalPhoto.evidence, FILES.artworks, record.id, 'originalPhoto.evidence');
    checkEvidence(record.subjects.evidence, FILES.artworks, record.id, 'subjects.evidence');
    checkEvidence(record.location.evidence, FILES.artworks, record.id, 'location.evidence');
    checkEvidence(record.citations, FILES.artworks, record.id, 'citations');
  }
  for (const record of subjects) {
    if (!citationIds.has(record.sourceId) && !sourceFiles.has(record.sourceId)) {
      issues.push({ code: 'E_EVIDENCE_REFERENCE', file: FILES.subjects, recordId: record.id, field: 'sourceId', message: `Unknown historical source ${record.sourceId}.` });
    }
    checkEvidence(record.evidence, FILES.subjects, record.id, 'evidence');
  }
  for (const record of sources) {
    if (record.sourceFileId) {
      const source = requireSource(record.sourceFileId, null, FILES.sources, record.id, 'sourceFileId');
      if (source && record.form === 'transcription' && source.provenance.form !== 'transcription') {
        issues.push({ code: 'E_SOURCE_FORM', file: FILES.sources, recordId: record.id, field: 'form', message: 'The citation and included source must both identify this material as a transcription.' });
      }
    } else if (record.form !== 'collection') {
      issues.push({ code: 'E_SOURCE_REFERENCE', file: FILES.sources, recordId: record.id, field: 'sourceFileId', message: 'A non-collection source needs an included sourceFileId.' });
    }
  }
  for (const id of ['H28', 'H35']) {
    const source = requireSource(id, 'history', FILES.manifest, id, 'id');
    if (source && (source.provenance.form !== 'transcription' || !source.path.endsWith('.txt'))) {
      issues.push({ code: 'E_HISTORY_TRANSCRIPTION', file: FILES.manifest, recordId: id, field: 'provenance.form', message: 'Include the full local .txt transcription and label it as a transcription.' });
    }
    if (!citationIds.has(id)) issues.push({ code: 'E_HISTORY_CITATION', file: FILES.sources, recordId: id, message: 'Include a readable citation for this history.' });
  }

  requireSource(book.coverSourceId, 'cover', FILES.book, book.coverSourceId, 'coverSourceId');
  if (book.printableCoverSourceId) requireSource(book.printableCoverSourceId, 'cover', FILES.book, book.printableCoverSourceId, 'printableCoverSourceId');
  const font = requireSource(book.fontSourceId, 'font', FILES.book, book.fontSourceId, 'fontSourceId');
  if (font && !/\.(ttf|otf)$/iu.test(font.path)) {
    issues.push({ code: 'E_FONT_FILE', file: FILES.book, recordId: font.id, field: 'fontSourceId', message: 'The PDF font must point to an included TTF or OTF file.' });
  }
  if (!manifest.files.some((record) => record.role === 'font' && /(?:licen[cs]e|ofl|copying|copyright)/iu.test(record.path) && /\.(txt|md)$/iu.test(record.path))) {
    issues.push({ code: 'E_FONT_LICENSE', file: FILES.manifest, field: 'files', message: 'Include the font license as a tracked font-role .txt or .md source.' });
  }
  checkUnique(book.artworkOrder, (id) => id, FILES.book, 'artworkOrder', issues);
  checkExpectedIds(book.artworkOrder, EXPECTED_ARTWORK_IDS, FILES.book, 'artworkOrder', issues);
  const artworkById = new Map(artworks.map((record) => [record.id, record]));
  for (const [index, id] of book.artworkOrder.entries()) {
    const artwork = artworkById.get(id);
    if (artwork && artwork.bookNumber !== index + 1) {
      issues.push({ code: 'E_BOOK_ORDER', file: FILES.book, recordId: id, field: `artworkOrder.${index}`, message: `Book position ${index + 1} disagrees with bookNumber ${artwork.bookNumber}. Update authored order and numbering together.` });
    }
  }
  if (media.thumbnail.maxLongEdge > media.photo.maxLongEdge) {
    issues.push({ code: 'E_MEDIA_SIZE', file: FILES.media, field: 'thumbnail.maxLongEdge', message: 'Thumbnail size must not exceed the full web-photo size.' });
  }
  for (const record of reviews) {
    if (!photoIds.has(record.recordId) && !artworkIds.has(record.recordId) && !subjectIds.has(record.recordId)) {
      issues.push({ code: 'E_REVIEW_REFERENCE', file: 'content/reviews', recordId: record.recordId, message: 'The review names no catalog record.' });
    }
    if (['photo-pairing', 'segmentation'].includes(record.reviewKind) && !artworkIds.has(record.recordId)) {
      issues.push({ code: 'E_REVIEW_KIND', file: 'content/reviews', recordId: record.recordId, field: 'reviewKind', message: 'Pairing and segmentation reviews belong to a design ID.' });
    }
  }

  if (subjects.length === 0) warnings.push('Historical subjects are not yet cataloged; initial unidentified assessments remain valid. Complete the evidence review in WP05.');
  if (book.printableCoverSourceId === null) warnings.push('The printable cover is pending WP05; the selected cover source is included.');
  if (reviews.length === 0) warnings.push('No completed review receipts exist yet. Catalog validation does not certify historical pairing, segmentation, or print readiness.');
  return { ok: issues.length === 0, issues, warnings, data, stats };
}

export async function verifySourceFiles(manifest: SourceManifest, root = PROJECT_ROOT) {
  const issues: ValidationIssue[] = [];
  let verifiedSourceCount = 0;
  for (const entry of manifest.files) {
    const before = issues.length;
    try {
      const file = await assertRegularProjectFile(entry.path, root);
      const handle = await open(file, 'r');
      let bytes: number;
      try {
        bytes = (await handle.stat()).size;
        const prefix = Buffer.alloc(128);
        const { bytesRead } = await handle.read(prefix, 0, prefix.length, 0);
        if (prefix.subarray(0, bytesRead).toString('utf8').startsWith('version https://git-lfs.github.com/spec/v1')) {
          issues.push({ code: 'E_SOURCE_LFS', file: entry.path, recordId: entry.id, message: 'This is an LFS pointer, not the required source bytes.' });
        }
      } finally { await handle.close(); }
      if (bytes !== entry.bytes) issues.push({ code: 'E_SOURCE_BYTES', file: entry.path, recordId: entry.id, field: 'bytes', message: `Manifest records ${entry.bytes} bytes; file has ${bytes}.` });
      const digest = await sha256File(file);
      if (digest !== entry.sha256) issues.push({ code: 'E_SOURCE_HASH', file: entry.path, recordId: entry.id, field: 'sha256', message: 'Source SHA-256 does not match the recorded bytes. Restore the source or use an explicit source replacement.' });
      if (entry.width !== undefined || entry.height !== undefined) {
        const metadata = await sharp(file, { failOn: 'error' }).metadata();
        if (metadata.width !== entry.width || metadata.height !== entry.height) {
          issues.push({ code: 'E_SOURCE_DIMENSIONS', file: entry.path, recordId: entry.id, message: `Recorded ${entry.width}×${entry.height}; measured native ${metadata.width}×${metadata.height}.` });
        }
        if ((entry.role === 'photo' && metadata.format !== 'jpeg') || (entry.role === 'coloring' && metadata.format !== 'png')) {
          issues.push({ code: 'E_SOURCE_FORMAT', file: entry.path, recordId: entry.id, message: `A ${entry.role} source has unexpected decoded format ${metadata.format}.` });
        }
      }
      if (issues.length === before) verifiedSourceCount += 1;
    } catch (error) {
      issues.push({ code: 'E_SOURCE_FILE', file: entry.path, recordId: entry.id, message: error instanceof Error ? error.message : String(error) });
    }
  }
  return { issues, verifiedSourceCount };
}

async function readReviews(root: string): Promise<{ values: unknown[]; issues: ValidationIssue[] }> {
  const values: unknown[] = [];
  const issues: ValidationIssue[] = [];
  async function visit(relativeDirectory: string) {
    let entries;
    try {
      const absolute = await assertSafeProjectPath(relativeDirectory, root, { allowMissing: true });
      entries = await readdir(absolute, { withFileTypes: true });
    }
    catch (error) {
      if (relativeDirectory === 'content/reviews' && (error as NodeJS.ErrnoException).code === 'ENOENT') return;
      issues.push({ code: 'E_REVIEW_DIRECTORY', file: relativeDirectory, message: error instanceof Error ? error.message : String(error) });
      return;
    }
    for (const entry of entries) {
      const relative = `${relativeDirectory}/${entry.name}`;
      if (entry.isSymbolicLink()) {
        issues.push({ code: 'E_REVIEW_SYMLINK', file: relative, message: 'Review material must be a regular project file.' });
      } else if (entry.isDirectory()) await visit(relative);
      else if (entry.name.endsWith('.json')) {
        try {
          const absolute = await assertRegularProjectFile(relative, root);
          values.push(JSON.parse(await readFile(absolute, 'utf8')) as unknown);
        } catch (error) {
          issues.push({ code: 'E_REVIEW_FILE', file: relative, message: error instanceof Error ? error.message : String(error) });
        }
      }
    }
  }
  await visit('content/reviews');
  return { values, issues };
}

/** Read the included project only. It never fetches a provenance URL. */
export async function validateCatalog(options: { root?: string; verifyFiles?: boolean } = {}): Promise<CatalogValidationResult> {
  const root = options.root ?? PROJECT_ROOT;
  await assertNoPendingTransaction(root);
  const input: Partial<CatalogInput> = {};
  const readIssues: ValidationIssue[] = [];
  for (const [key, relative] of Object.entries(FILES)) {
    try {
      const absolute = await assertRegularProjectFile(relative, root);
      input[key as keyof Omit<CatalogInput, 'reviews'>] = JSON.parse(await readFile(absolute, 'utf8')) as unknown;
    } catch (error) {
      readIssues.push({ code: 'E_CATALOG_FILE', file: relative, message: error instanceof Error ? error.message : String(error) });
    }
  }
  const reviewFiles = await readReviews(root);
  input.reviews = reviewFiles.values;
  readIssues.push(...reviewFiles.issues);
  if (readIssues.length) return { ok: false, issues: readIssues, warnings: [], stats: emptyStats() };
  const result = validateCatalogData(input as CatalogInput);
  if (result.data && options.verifyFiles !== false) {
    const sources = await verifySourceFiles(result.data.manifest, root);
    result.issues.push(...sources.issues);
    result.stats.verifiedSourceCount = sources.verifiedSourceCount;
    result.ok = result.issues.length === 0;
  }
  return result;
}

export function parseValidationArgs(args: string[]) {
  const parsed = parseNamedArgs(args, { stage: 'value', id: 'value', help: 'boolean' });
  const stage = (parsed.stage as string | undefined) ?? 'release';
  const id = parsed.id as string | undefined;
  if (!['catalog', 'assets', 'release'].includes(stage)) throw new CliError('E_STAGE', 'Use --stage catalog, assets, or release.', 2);
  if (id && (stage !== 'assets' || !EXPECTED_ARTWORK_IDS.includes(id as `design-${string}`))) {
    throw new CliError('E_SCOPE', '--id is supported only with --stage assets and an existing design-002 through design-049.', 2);
  }
  return { stage: stage as 'catalog' | 'assets' | 'release', id, help: parsed.help === true };
}

async function main() {
  await runCli({ operation: 'validate-content' }, async (report) => {
    const options = parseValidationArgs(process.argv.slice(2));
    if (options.help) {
      console.log('Usage: npm run validate -- --stage catalog|assets|release [--id design-002]');
      report.summary = { help: true };
      return;
    }
    report.inputs.push(...Object.values(FILES), 'content/reviews');
    const result = await validateCatalog();
    report.warnings.push(...result.warnings);
    report.summary = { stage: options.stage, id: options.id ?? null, ...result.stats };
    for (const issue of result.issues) {
      console.error(`${issue.code} ${issue.file}${issue.recordId ? ` [${issue.recordId}]` : ''}${issue.field ? ` (${issue.field})` : ''}\n${issue.message}`);
      report.errors.push({ code: issue.code, message: issue.message, details: issue });
    }
    if (!result.ok) throw new CliError('E_VALIDATION_FAILED', `Catalog validation failed with ${result.issues.length} issue(s).`, 3);
    if (options.stage === 'assets') {
      report.inputs.push('generated/assets.json', 'content/segmentation', 'content/accessibility', 'generated/recipes', 'public/art', 'public/photos');
      const assets = await validateAssets({ data: result.data!, ...(options.id ? { id: options.id } : {}) });
      report.warnings.push(...assets.warnings);
      report.summary = { stage: options.stage, id: options.id ?? null, ...result.stats, ...assets.stats };
      for (const issue of assets.issues) {
        console.error(`${issue.code} ${issue.file}${issue.recordId ? ` [${issue.recordId}]` : ''}\n${issue.message}${issue.command ? `\nRun: ${issue.command}` : ''}`);
        report.errors.push({ code: issue.code, message: issue.message, details: issue });
      }
      if (!assets.ok) {
        const incomplete = assets.issues.every(issue => /(?:MISSING|STALE|PENDING)$/.test(issue.code));
        throw new CliError('E_ASSETS_INVALID', `Asset validation failed with ${assets.issues.length} issue(s).`, incomplete ? 4 : 3);
      }
      console.log(`Assets valid: ${assets.stats.validatedArtworks} artwork(s), ${assets.stats.validatedVersions} version(s), ${assets.stats.validatedPhotos} photo derivative(s).`);
      for (const warning of assets.warnings) console.log(`Pending: ${warning}`);
      return;
    }
    if (options.stage === 'release') {
      const release = await assertReleaseReady(PROJECT_ROOT, result);
      report.summary = {stage:'release',...release.summary};
      console.log('Release valid: all source, package, editorial and print reviews are current.');
      return;
    }
    console.log(`Catalog valid: ${result.stats.photoCount} photographs, ${result.stats.artworkCount} designs, ${result.stats.verifiedSourceCount} source files verified (${result.stats.sourceBytes} bytes).`);
  });
}

if (isMain(import.meta.url)) await main();
