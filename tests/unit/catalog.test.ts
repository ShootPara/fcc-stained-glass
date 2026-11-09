import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';
import {
  EXPECTED_ARTWORK_IDS, EXPECTED_PHOTO_IDS,
  type Assessment, type ArtworkRecord, type BookConfig, type CitationSource,
  type HistoricalSubject, type MediaConfig, type PhotoId, type PhotoRecord, type ProjectConfig,
  type ReviewReceipt,
} from '../../src/shared/contracts.js';
import type { SourceEntry } from '../../scripts/lib/contracts.js';
import { sha256Bytes } from '../../scripts/lib/digests.js';
import {
  parseValidationArgs, validateCatalog, validateCatalogData, verifySourceFiles,
  type CatalogInput,
} from '../../scripts/validate-content.js';

const digest = 'a'.repeat(64);
function pending<T>(value: T | null = null): Assessment<T> {
  return { value, confidence: 'unidentified', rationale: 'Identification is pending.', evidence: [] };
}
function sourceEntry(id: string, role: SourceEntry['role'], relative: string): SourceEntry {
  return {
    id, role, path: relative, originalFilename: path.posix.basename(relative), bytes: 100,
    sha256: digest,
    ...(['photo', 'coloring', 'cover'].includes(role) ? { width: 20, height: 30 } : {}),
    provenance: { sourceId: `supplied-${id}`, form: role === 'history' ? 'transcription' : 'original-file' },
  };
}

/** A complete logical inventory with deliberately unreviewed assessments. */
function catalogFixture() {
  const photos: PhotoRecord[] = EXPECTED_PHOTO_IDS.map((id, index) => ({
    id, sourceId: id, displayOrder: index + 1, coverage: 'unreviewed',
    title: `Photograph ${index + 1}`, alt: `Church photograph ${index + 1}`,
    description: 'We are still identifying this picture.',
    subjects: pending<string[]>(), location: pending<string>(), historicalEvidence: [],
  }));
  const artworks: ArtworkRecord[] = EXPECTED_ARTWORK_IDS.map((id, index) => ({
    id, sourceId: id, bookNumber: index + 1, title: `Drawing ${index + 1}`,
    publicDescription: 'Choose your own colors.',
    originalPhoto: pending<PhotoId>(`photo-${id.slice(7)}`), subjects: pending<string[]>(),
    location: pending<string>(), citations: [],
  }));
  const files: SourceEntry[] = [
    ...photos.map((photo) => sourceEntry(photo.id, 'photo', `source/photos/${photo.id.slice(6)}.jpg`)),
    ...artworks.map((artwork) => sourceEntry(artwork.id, 'coloring', `source/coloring/${artwork.id.slice(7)}.png`)),
    sourceEntry('H28', 'history', 'source/histories/h28.txt'),
    sourceEntry('H35', 'history', 'source/histories/h35.txt'),
    sourceEntry('cover-front', 'cover', 'source/cover/Design_01_Front.png'),
    sourceEntry('font-main', 'font', 'source/fonts/main.ttf'),
    sourceEntry('font-license', 'font', 'source/fonts/LICENSE.txt'),
  ];
  const sources: CitationSource[] = ['H28', 'H35'].map((id) => ({
    id, title: `${id} church history`, sourceFileId: id, form: 'transcription',
    citation: `${id}, supplied history transcription.`,
  }));
  const project: ProjectConfig = {
    siteId: 'fcc-kalamazoo-stained-glass', title: 'Church windows', projectVersion: '0.1.0',
    repositoryUrl: null, defaultBranch: 'main', releaseDateUtc: '2026-11-06T00:00:00.000Z',
  };
  const book: BookConfig = {
    schemaVersion: 1, title: 'A Stained Glass Coloring Book', coverSourceId: 'cover-front',
    printableCoverSourceId: null, coverLines: ['First Congregational Church'],
    intro: ['Choose your colors.'], sourcesText: ['Supplied church histories and photographs.'],
    artworkOrder: [...EXPECTED_ARTWORK_IDS], page: { width: 612, height: 792, margin: 36 },
    layoutVersion: 'letter-v1', fontSourceId: 'font-main',
  };
  const media: MediaConfig = {
    schemaVersion: 1, photo: { maxLongEdge: 2000, format: 'webp', quality: 90 },
    thumbnail: { maxLongEdge: 320, format: 'webp', quality: 85 },
    withoutEnlargement: true, algorithmVersion: 'web-images-v1',
  };
  return {
    project, manifest: { schemaVersion: 1 as const, files },
    photos: { schemaVersion: 1 as const, photos }, artworks: { schemaVersion: 1 as const, artworks },
    subjects: { schemaVersion: 1 as const, subjects: [] as HistoricalSubject[] },
    sources: { schemaVersion: 1 as const, sources }, book, media, reviews: [] as ReviewReceipt[],
  };
}

function codes(input: CatalogInput): string[] {
  return validateCatalogData(input).issues.map((issue) => issue.code);
}

describe('complete catalog identities and references', () => {
  it('accepts all 55 photographs and 48 designs before reviews or preparation', () => {
    const input = catalogFixture();
    const before = JSON.stringify(input);
    const result = validateCatalogData(input);
    expect(result.issues).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.stats).toMatchObject({ photoCount: 55, artworkCount: 48, verifiedSourceCount: 0 });
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(JSON.stringify(input)).toBe(before);
  });

  it('separates supplied design numbers from coloring-book numbers', () => {
    const result = validateCatalogData(catalogFixture());
    expect(result.data?.artworks[0]).toMatchObject({ id: 'design-002', sourceId: 'design-002', bookNumber: 1 });
    expect(result.data?.artworks.at(-1)).toMatchObject({ id: 'design-049', bookNumber: 48 });
  });

  it('retains identities and associations after caption and gallery-order changes', () => {
    const input = catalogFixture();
    input.photos.photos.reverse();
    input.photos.photos.forEach((photo, index) => { photo.title = `New caption ${index}`; photo.displayOrder = index + 1; });
    input.artworks.artworks.reverse();
    const result = validateCatalogData(input);
    expect(result.issues).toEqual([]);
    expect(result.data?.artworks.find((artwork) => artwork.id === 'design-002')?.originalPhoto.value).toBe('photo-002');
    expect(result.data?.photos.find((photo) => photo.id === 'photo-001')?.sourceId).toBe('photo-001');
  });

  it('does not count archived source bytes as new active photographs', () => {
    const input = catalogFixture();
    input.manifest.files.push(sourceEntry(`archived-source-${digest}`, 'photo', `source/archive/photo-001/${digest}/001.jpg`));
    expect(validateCatalogData(input).ok).toBe(true);
  });

  it('rejects a missing photograph and an extra design instead of shrinking scope', () => {
    const input = catalogFixture();
    input.photos.photos.pop();
    input.artworks.artworks.push({ ...input.artworks.artworks[0]!, id: 'design-050' });
    expect(codes(input)).toEqual(expect.arrayContaining(['E_MISSING_ID', 'E_UNEXPECTED_ID', 'E_COLLECTION_COUNT']));
  });

  it('rejects duplicate record IDs, source IDs, and book numbers', () => {
    const input = catalogFixture();
    input.artworks.artworks[1] = { ...input.artworks.artworks[0]! };
    const issues = validateCatalogData(input).issues;
    expect(issues.filter((issue) => issue.code === 'E_DUPLICATE').map((issue) => issue.field))
      .toEqual(expect.arrayContaining(['id', 'sourceId', 'bookNumber']));
  });

  it('rejects photo source swaps that silently change stable identity', () => {
    const input = catalogFixture();
    input.photos.photos[0]!.sourceId = 'photo-002';
    input.photos.photos[1]!.sourceId = 'photo-001';
    expect(codes(input).filter((code) => code === 'E_PHOTO_SOURCE')).toHaveLength(2);
  });

  it('rejects design source swaps and incorrect original PNG filenames', () => {
    const input = catalogFixture();
    input.artworks.artworks[0]!.sourceId = 'design-003';
    input.manifest.files.find((source) => source.id === 'design-004')!.path = 'source/coloring/999.png';
    expect(codes(input).filter((code) => code === 'E_DESIGN_SOURCE')).toHaveLength(2);
  });

  it('requires book order and visible numbering to agree', () => {
    const input = catalogFixture();
    input.book.artworkOrder.reverse();
    expect(codes(input)).toContain('E_BOOK_ORDER');
    input.artworks.artworks.forEach((artwork) => { artwork.bookNumber = input.book.artworkOrder.indexOf(artwork.id) + 1; });
    expect(validateCatalogData(input).ok).toBe(true);
  });

  it('reports missing source, photograph, subject, and evidence references separately', () => {
    const input = catalogFixture();
    input.manifest.files = input.manifest.files.filter((source) => source.id !== 'photo-001');
    const artwork = input.artworks.artworks[0]!;
    artwork.originalPhoto.value = 'photo-999';
    artwork.subjects.value = ['book-subject-002'];
    artwork.citations.push({ sourceId: 'missing-book', section: 'Windows' });
    expect(codes(input)).toEqual(expect.arrayContaining([
      'E_SOURCE_REFERENCE', 'E_PHOTO_REFERENCE', 'E_SUBJECT_REFERENCE', 'E_EVIDENCE_REFERENCE',
    ]));
  });

  it('accepts an unpaired historical subject and keeps all assessment confidence independent', () => {
    const input = catalogFixture();
    const evidence = { sourceId: 'H28', section: 'The windows', locator: 'Window I' };
    input.subjects.subjects.push({
      id: 'H28-window-I', sourceId: 'H28', section: 'The windows', windowNumber: 1,
      sourceLabel: 'Window I', title: 'A historical subject', evidence: [evidence],
    });
    input.photos.photos[1]!.subjects = { value: ['H28-window-I'], confidence: 'confirmed', rationale: 'Source comparison.', evidence: [evidence] };
    input.artworks.artworks[0]!.originalPhoto = {
      value: 'photo-002', confidence: 'likely', rationale: 'Visual comparison.',
      evidence: [{ sourceId: 'photo-002', section: 'Visual comparison' }],
    };
    const result = validateCatalogData(input);
    expect(result.issues).toEqual([]);
    expect(result.data?.artworks[0]?.subjects.confidence).toBe('unidentified');
    expect(result.data?.artworks[0]?.location.confidence).toBe('unidentified');
  });

  it('checks source roles, citation targets, and history transcription labels', () => {
    const input = catalogFixture();
    input.manifest.files.find((source) => source.id === 'photo-001')!.role = 'cover';
    input.manifest.files.find((source) => source.id === 'H28')!.provenance.form = 'original-file';
    input.sources.sources[1]!.sourceFileId = 'missing-history-file';
    expect(codes(input)).toEqual(expect.arrayContaining(['E_SOURCE_ROLE', 'E_SOURCE_FORM', 'E_HISTORY_TRANSCRIPTION', 'E_SOURCE_REFERENCE']));
  });

  it('rejects case-insensitive path collisions for Windows clones', () => {
    const input = catalogFixture();
    input.manifest.files[1]!.path = input.manifest.files[0]!.path.toUpperCase().replace('SOURCE/', 'source/');
    expect(codes(input)).toContain('E_DUPLICATE');
  });

  it('requires the local PDF font and its license even before printing', () => {
    const input = catalogFixture();
    input.manifest.files = input.manifest.files.filter((source) => source.id !== 'font-license');
    input.book.fontSourceId = 'missing-font';
    expect(codes(input)).toEqual(expect.arrayContaining(['E_SOURCE_REFERENCE', 'E_FONT_LICENSE']));
  });

  it('rejects malformed source metadata through the pure boundary', () => {
    const input = catalogFixture();
    input.manifest.files[0]!.sha256 = '0'.repeat(64);
    expect(codes(input)).toContain('E_SCHEMA');
  });

  it('rejects completed reviews pointing to nonexistent records', () => {
    const input = catalogFixture();
    input.reviews.push({
      schemaVersion: 1, recordId: 'missing-design', reviewKind: 'photo-pairing',
      reviewedDigest: digest, reviewer: 'Reviewer', reviewedAtUtc: '2026-11-06T00:00:00.000Z', outcome: 'complete',
    });
    expect(codes(input)).toEqual(expect.arrayContaining(['E_REVIEW_REFERENCE', 'E_REVIEW_KIND']));
  });
});

const temporaryDirectories: string[] = [];
async function temporaryRoot() {
  const root = await mkdtemp(path.join(tmpdir(), 'fcc-catalog-'));
  temporaryDirectories.push(root);
  return root;
}

async function symlinkExternalFile(target: string, destination: string): Promise<void> {
  if (process.platform !== 'win32') {
    await symlink(target, destination, 'file');
    return;
  }
  // Windows file symlinks require a privilege that ordinary test sessions lack.
  // A junction is still a reparse-point escape and exercises the same path guard.
  await rm(path.dirname(destination), { recursive: true, force: true });
  await symlink(path.dirname(target), path.dirname(destination), 'junction');
}
afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function measuredPng() {
  const root = await temporaryRoot();
  const bytes = await sharp({ create: { width: 2, height: 3, channels: 4, background: '#ffffff' } }).png().toBuffer();
  const entry = { ...sourceEntry('design-002', 'coloring', 'source/coloring/002.png'), bytes: bytes.length, sha256: sha256Bytes(bytes), width: 2, height: 3 };
  await mkdir(path.join(root, 'source/coloring'), { recursive: true });
  await writeFile(path.join(root, entry.path), bytes);
  return { root, bytes, entry, manifest: { schemaVersion: 1 as const, files: [entry] } };
}

describe('read-only source byte verification', () => {
  it('verifies real file bytes, native dimensions, and a measured digest', async () => {
    const { root, bytes, entry, manifest } = await measuredPng();
    const result = await verifySourceFiles(manifest, root);
    expect(result).toEqual({ issues: [], verifiedSourceCount: 1 });
    expect(await readFile(path.join(root, entry.path))).toEqual(bytes);
  });

  it('detects changed source bytes without repairing or overwriting them', async () => {
    const { root, bytes, entry, manifest } = await measuredPng();
    const changed = Buffer.concat([bytes, Buffer.from('changed source bytes')]);
    await writeFile(path.join(root, entry.path), changed);
    const result = await verifySourceFiles(manifest, root);
    expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(['E_SOURCE_BYTES', 'E_SOURCE_HASH']));
    expect(result.verifiedSourceCount).toBe(0);
    expect(await readFile(path.join(root, entry.path))).toEqual(changed);
  });

  it('detects incorrect recorded dimensions and disguised image format', async () => {
    const { root, entry, manifest } = await measuredPng();
    entry.width = 3;
    entry.role = 'photo';
    const result = await verifySourceFiles(manifest, root);
    expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(['E_SOURCE_DIMENSIONS', 'E_SOURCE_FORMAT']));
  });

  it('rejects LFS pointers even if their pointer bytes match the recorded hash', async () => {
    const root = await temporaryRoot();
    const bytes = Buffer.from(`version https://git-lfs.github.com/spec/v1\noid sha256:${digest}\nsize 100\n`);
    const entry = { ...sourceEntry('H28', 'history', 'source/histories/h28.txt'), bytes: bytes.length, sha256: sha256Bytes(bytes) };
    await mkdir(path.join(root, 'source/histories'), { recursive: true });
    await writeFile(path.join(root, entry.path), bytes);
    expect((await verifySourceFiles({ schemaVersion: 1, files: [entry] }, root)).issues.map((issue) => issue.code)).toContain('E_SOURCE_LFS');
  });

  it('reports a missing source and rejects a symlink to an external file', async () => {
    const { root, bytes, entry, manifest } = await measuredPng();
    await rm(path.join(root, entry.path));
    expect((await verifySourceFiles(manifest, root)).issues[0]?.code).toBe('E_SOURCE_FILE');
    const outside = await temporaryRoot();
    const target = path.join(outside, '002.png');
    await writeFile(target, bytes);
    await symlinkExternalFile(target, path.join(root, entry.path));
    const result = await verifySourceFiles(manifest, root);
    expect(result.verifiedSourceCount).toBe(0);
    expect(result.issues[0]?.message).toMatch(/symlink/i);
  });

  it('rejects a symlinked review directory before reading external reviews', async () => {
    const root = await temporaryRoot();
    const input = catalogFixture();
    const paths: Record<string, unknown> = {
      'project.json': input.project, 'source/manifest.json': input.manifest,
      'content/photos.json': input.photos, 'content/artworks.json': input.artworks,
      'content/historical-subjects.json': input.subjects, 'content/sources.json': input.sources,
      'content/book.json': input.book, 'content/media.json': input.media,
    };
    for (const [relative, value] of Object.entries(paths)) {
      await mkdir(path.dirname(path.join(root, relative)), { recursive: true });
      await writeFile(path.join(root, relative), JSON.stringify(value));
    }
    expect((await validateCatalog({ root, verifyFiles: false })).ok).toBe(true);
    const outside = await temporaryRoot();
    await symlink(outside, path.join(root, 'content/reviews'), 'junction');
    const result = await validateCatalog({ root, verifyFiles: false });
    expect(result.ok).toBe(false);
    expect(result.issues[0]?.code).toBe('E_REVIEW_DIRECTORY');
  });
});

describe('validation stage arguments', () => {
  it('defaults to release and accepts a selected design only for assets', () => {
    expect(parseValidationArgs([]).stage).toBe('release');
    expect(parseValidationArgs(['--stage', 'catalog']).stage).toBe('catalog');
    expect(parseValidationArgs(['--stage=assets', '--id=design-002'])).toMatchObject({ stage: 'assets', id: 'design-002' });
  });

  it.each([
    ['--stage', 'unknown'], ['--stage', 'catalog', '--id', 'design-002'],
    ['--stage', 'assets', '--id', 'design-001'], ['--stage', 'assets', '--id', 'design-050'],
    ['--unknown'], ['--stage'], ['catalog'], ['--stage', 'catalog', '--stage', 'release'],
  ])('rejects unsupported arguments %j', (...args) => {
    expect(() => parseValidationArgs(args)).toThrow();
  });
});
