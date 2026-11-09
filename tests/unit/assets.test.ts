import { mkdtemp, mkdir, readFile, rm, writeFile, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gzipSync } from 'fflate';
import sharp from 'sharp';
import { afterEach, describe, expect, test } from 'vitest';
import {
  AssetRegistrySchema, FrozenRecipeSchema, RegionPackageSchema,
  type AccessibilityMetadata, type AssetRegistry, type FrozenRecipe, type RegionGeometry, type RegionPackage,
} from '../../src/shared/assets.js';
import type { ArtworkRecord, ReviewReceipt } from '../../src/shared/contracts.js';
import type { CatalogData } from '../../scripts/validate-content.js';
import {
  computeContentVersion, computeEditorialReviewDigest, computeKeyboardMetadataDigest,
  computePhotoPreparationDigest, computePreparationDigest, computeSegmentationReviewDigest,
  hasCurrentEditorialReview, hasCurrentSegmentationReview, type PreparationIdentityInput,
} from '../../scripts/lib/asset-identity.js';
import { jsonBytes, sha256Bytes } from '../../scripts/lib/digests.js';
import { encodeCanonical } from '../../scripts/lib/algorithms/gray-v1.js';
import {
  decodeU32le, encodeU32le, validateAccessibilityMetadata, validateAssets,
  validateRegionPackageBytes, type RegionPackageBytes,
} from '../../scripts/lib/validate-assets.js';

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true }))); });
const colors = Uint8Array.from([255, 0, 255]);
const domain = Uint8Array.from([255, 255, 255]);
const emptyMask = new Uint8Array(3);
const geometry: RegionGeometry[] = [
  { id: 1, seed: [0, 0], pixelCount: 1, bbox: { x: 0, y: 0, width: 1, height: 1 }, centroid: [0.5, 0.5] },
  { id: 2, seed: [2, 0], pixelCount: 1, bbox: { x: 2, y: 0, width: 1, height: 1 }, centroid: [2.5, 0.5] },
];
function receipt(filename: string, bytes: Uint8Array) { return { path: filename, bytes: bytes.length, sha256: sha256Bytes(bytes) }; }
function binary(filename: string, raw: Uint8Array, encoding: 'gzip-u8' | 'gzip-u32le') {
  const compressed = gzipSync(raw, { mtime: 0 });
  return { compressed, spec: { path: filename, encoding, compressedBytes: compressed.length, compressedSha256: sha256Bytes(compressed), uncompressedBytes: raw.length, rawSha256: sha256Bytes(raw) } };
}
async function packageFixture(threshold = 180, wrongTie = false) {
  const canonical = await encodeCanonical({ width: 3, height: 1, pixels: colors });
  const regions = jsonBytes({ schemaVersion: 1, regions: geometry });
  const hit = binary('hit.bin', encodeU32le(Uint32Array.from([1, 0, 2])), 'gzip-u32le');
  const paint = binary('paint.bin', encodeU32le(Uint32Array.from([1, wrongTie ? 2 : 1, 2])), 'gzip-u32le');
  const ink = binary('ink.bin', Uint8Array.from([0, 255, 0]), 'gzip-u8');
  const identity: PreparationIdentityInput = {
    width: 3, height: 1,
    settings: { algorithmVersion: 'regions-v1', normalizationVersion: 'gray-v1', inkThreshold: threshold, excludedSeedPoints: [] },
    canonicalSha256: sha256Bytes(colors), domainMaskSha256: sha256Bytes(domain),
    barrierAddMaskSha256: sha256Bytes(emptyMask), barrierRemoveMaskSha256: sha256Bytes(emptyMask),
  };
  const expected = { hitLabelsSha256: hit.spec.rawSha256, paintLabelsSha256: paint.spec.rawSha256, inkAlphaSha256: ink.spec.rawSha256, regionCount: 2 };
  const version = computeContentVersion({ ...identity, ...expected });
  const pkg: RegionPackage = {
    schemaVersion: 1, artworkId: 'design-002', algorithmVersion: 'regions-v1', contentVersion: version,
    width: 3, height: 1, regionCount: 2, canonical: { ...receipt('canonical.png', canonical), path: 'canonical.png' },
    regions: { ...receipt('regions.json', regions), path: 'regions.json' },
    hitLabels: { ...hit.spec, path: 'hit.bin', encoding: 'gzip-u32le' },
    paintLabels: { ...paint.spec, path: 'paint.bin', encoding: 'gzip-u32le' },
    inkAlpha: { ...ink.spec, path: 'ink.bin', encoding: 'gzip-u8' },
  };
  const bytes: RegionPackageBytes = { canonical, regions, hitLabels: hit.compressed, paintLabels: paint.compressed, inkAlpha: ink.compressed };
  return { pkg, bytes, identity, expected, version, canonical };
}
async function write(root: string, relative: string, bytes: Uint8Array | string) {
  const destination = path.join(root, relative);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, bytes);
}
const unreviewed = <T>(value: T | null = null) => ({ value, confidence: 'unidentified' as const, rationale: 'Review pending.', evidence: [] });

async function treeFixture(threshold = 180, wrongTie = false) {
  const fixture = await packageFixture(threshold, wrongTie);
  const { pkg, bytes, identity, expected, version, canonical } = fixture;
  const root = await mkdtemp(path.join(tmpdir(), 'fcc asset fixture with spaces '));
  directories.push(root);
  const sourceDigest = sha256Bytes(canonical);
  const sourcePath = 'source/coloring/002.png';
  await write(root, sourcePath, canonical);
  const config = { schemaVersion: 1, algorithmVersion: 'regions-v1', inkThreshold: threshold, excludedSeedPoints: [], notes: 'Test-only fixture.' };
  await write(root, 'content/segmentation/design-002/config.json', jsonBytes(config));
  const packageDirectory = `public/art/design-002/${version}`;
  for (const [filename, body] of Object.entries({ 'canonical.png': bytes.canonical, 'regions.json': bytes.regions, 'hit.bin': bytes.hitLabels, 'paint.bin': bytes.paintLabels, 'ink.bin': bytes.inkAlpha })) {
    await write(root, `${packageDirectory}/${filename}`, body);
  }
  const packageBytes = jsonBytes(pkg);
  await write(root, `${packageDirectory}/package.json`, packageBytes);
  const recipeDirectory = `generated/recipes/design-002/${version}`;
  for (const [filename, body] of Object.entries({ 'canonical.bin': colors, 'domain.bin': domain, 'add.bin': emptyMask, 'remove.bin': emptyMask })) {
    await write(root, `${recipeDirectory}/${filename}`, body);
  }
  const recipe: FrozenRecipe = {
    schemaVersion: 1, artworkId: 'design-002', contentVersion: version, sourceId: 'design-002', sourceDigest,
    width: 3, height: 1, settings: identity.settings,
    canonical: { ...receipt('canonical.bin', colors), path: 'canonical.bin' },
    domainMask: { ...receipt('domain.bin', domain), path: 'domain.bin' },
    barrierAddMask: { ...receipt('add.bin', emptyMask), path: 'add.bin' },
    barrierRemoveMask: { ...receipt('remove.bin', emptyMask), path: 'remove.bin' },
    expected,
  };
  await write(root, `${recipeDirectory}/recipe.json`, jsonBytes(recipe));
  const prepared = { contentVersion: version, sourceId: 'design-002', sourceDigest, preparationDigest: computePreparationDigest(sourceDigest, identity),
    package: receipt(`${packageDirectory}/package.json`, packageBytes), archiveRecipe: `${recipeDirectory}/recipe.json` };
  const registry: AssetRegistry = { schemaVersion: 1, artworks: { 'design-002': { activeVersion: version, versions: { [version]: prepared } } }, photos: {} };
  await write(root, 'generated/assets.json', jsonBytes(registry));
  const artwork: ArtworkRecord = {
    id: 'design-002', sourceId: 'design-002', bookNumber: 1, title: 'Test-only drawing', publicDescription: 'Test fixture.',
    originalPhoto: unreviewed<`photo-${string}`>(), subjects: unreviewed<string[]>(), location: unreviewed<string>(), citations: [],
  };
  const data: CatalogData = {
    project: { siteId: 'test', title: 'Test', projectVersion: '0.1.0', repositoryUrl: null, defaultBranch: 'main', releaseDateUtc: '2026-11-06T00:00:00.000Z' },
    manifest: { schemaVersion: 1, files: [{ id: 'design-002', role: 'coloring', path: sourcePath, originalFilename: '002.png', bytes: canonical.length, sha256: sourceDigest, width: 3, height: 1, provenance: { sourceId: 'COLORING-COLLECTION', form: 'original-file' } }] },
    artworks: [artwork], photos: [], subjects: [], sources: [{ id: 'COLORING-COLLECTION', title: 'Test collection', form: 'collection', citation: 'Test.' }], reviews: [],
    book: { schemaVersion: 1, title: 'Test', coverSourceId: 'cover', printableCoverSourceId: null, coverLines: ['Test'], intro: ['Test'], sourcesText: ['Test'], artworkOrder: ['design-002'], page: { width: 612, height: 792, margin: 36 }, layoutVersion: 'letter-v1', fontSourceId: 'font' },
    media: { schemaVersion: 1, photo: { maxLongEdge: 2000, format: 'webp', quality: 90 }, thumbnail: { maxLongEdge: 320, format: 'webp', quality: 85 }, withoutEnlargement: true, algorithmVersion: 'web-images-v1' },
  };
  return { ...fixture, root, data, config, registry, prepared, recipe, packageDirectory, recipeDirectory };
}

describe('package bytes and semantic metadata', () => {
  test('loads exact little-endian hit/paint data and independently measured geometry', async () => {
    const f = await packageFixture();
    const loaded = await validateRegionPackageBytes(f.pkg, f.bytes);
    expect([...loaded.hitLabels]).toEqual([1, 0, 2]);
    expect([...loaded.paintLabels]).toEqual([1, 1, 2]);
    expect(loaded.regions).toEqual(geometry);
    expect([...loaded.canonical]).toEqual([255, 0, 255]);
  });
  test('decodes unaligned u32 bytes explicitly as little-endian', () => {
    const buffer = Uint8Array.from([99, 0x78, 0x56, 0x34, 0x12, 2, 0, 0, 0, 99]);
    expect([...decodeU32le(buffer.subarray(1, 9))]).toEqual([0x12345678, 2]);
    expect(() => decodeU32le(buffer.subarray(1, 8))).toThrow(/multiple of four/);
  });
  test('rejects unsafe paths, dimensions and raw byte counts before decompression', async () => {
    const f = await packageFixture();
    for (const bad of [
      { ...f.pkg, width: Number.MAX_SAFE_INTEGER },
      { ...f.pkg, canonical: { ...f.pkg.canonical, path: '../canonical.png' } },
      { ...f.pkg, hitLabels: { ...f.pkg.hitLabels, uncompressedBytes: 16 } },
      { ...f.pkg, regionCount: 4 },
    ]) expect(RegionPackageSchema.safeParse(bad).success).toBe(false);
  });
  test('rejects a changed compressed hash even when dimensions look valid', async () => {
    const f = await packageFixture();
    f.bytes.hitLabels = Uint8Array.from(f.bytes.hitLabels);
    f.bytes.hitLabels[10] ^= 1;
    await expect(validateRegionPackageBytes(f.pkg, f.bytes)).rejects.toMatchObject({ code: 'E_ASSET_HASH' });
  });
  test('rejects gzip timestamps and decompression beyond the declared exact extent', async () => {
    const f = await packageFixture();
    f.bytes.hitLabels = gzipSync(encodeU32le(Uint32Array.from([1, 0, 2])), { mtime: 1000 });
    f.pkg.hitLabels.compressedBytes = f.bytes.hitLabels.length;
    f.pkg.hitLabels.compressedSha256 = sha256Bytes(f.bytes.hitLabels);
    await expect(validateRegionPackageBytes(f.pkg, f.bytes)).rejects.toMatchObject({ code: 'E_ASSET_GZIP_MTIME' });
    f.bytes.hitLabels = gzipSync(new Uint8Array(120), { mtime: 0 });
    f.pkg.hitLabels.compressedBytes = f.bytes.hitLabels.length;
    f.pkg.hitLabels.compressedSha256 = sha256Bytes(f.bytes.hitLabels);
    await expect(validateRegionPackageBytes(f.pkg, f.bytes)).rejects.toMatchObject({ code: 'E_ASSET_GZIP' });
  });
  test('rejects incorrect raw hashes', async () => {
    const f = await packageFixture();
    f.pkg.paintLabels.rawSha256 = sha256Bytes('different bytes');
    await expect(validateRegionPackageBytes(f.pkg, f.bytes)).rejects.toMatchObject({ code: 'E_ASSET_RAW_HASH' });
  });
  test.each(['range', 'interior', 'ink'] as const)('rejects re-receipted map corruption: %s', async kind => {
    const f = await packageFixture();
    if (kind === 'ink') {
      const changed = binary('ink.bin', Uint8Array.from([0, 254, 0]), 'gzip-u8');
      f.bytes.inkAlpha = changed.compressed;
      f.pkg.inkAlpha = { ...changed.spec, path: 'ink.bin', encoding: 'gzip-u8' };
    } else {
      const changed = binary('paint.bin', encodeU32le(Uint32Array.from([kind === 'range' ? 3 : 2, 1, 2])), 'gzip-u32le');
      f.bytes.paintLabels = changed.compressed;
      f.pkg.paintLabels = { ...changed.spec, path: 'paint.bin', encoding: 'gzip-u32le' };
    }
    await expect(validateRegionPackageBytes(f.pkg, f.bytes)).rejects.toMatchObject({ code: kind === 'range' ? 'E_REGION_RANGE' : kind === 'ink' ? 'E_INK_ALPHA' : 'E_PAINT_INTERIOR' });
  });
  test.each(['seed', 'count', 'bbox', 'centroid', 'duplicate'] as const)('rejects incorrect geometry: %s', async kind => {
    const f = await packageFixture();
    const changed = structuredClone(geometry);
    if (kind === 'seed') changed[0]!.seed = [1, 0];
    if (kind === 'count') changed[0]!.pixelCount = 2;
    if (kind === 'bbox') changed[0]!.bbox.width = 2;
    if (kind === 'centroid') changed[0]!.centroid = [0, 0];
    if (kind === 'duplicate') changed[1]!.id = 1;
    f.bytes.regions = jsonBytes({ schemaVersion: 1, regions: changed });
    f.pkg.regions = { ...receipt('regions.json', f.bytes.regions), path: 'regions.json' };
    await expect(validateRegionPackageBytes(f.pkg, f.bytes)).rejects.toMatchObject({ code: kind === 'duplicate' ? 'E_REGION_IDS' : 'E_REGION_GEOMETRY' });
  });
  test('rejects dimension-mismatched canonical image bytes with valid receipts', async () => {
    const f = await packageFixture();
    f.bytes.canonical = await encodeCanonical({ width: 1, height: 3, pixels: colors });
    f.pkg.canonical = { ...receipt('canonical.png', f.bytes.canonical), path: 'canonical.png' };
    await expect(validateRegionPackageBytes(f.pkg, f.bytes)).rejects.toMatchObject({ code: 'E_CANONICAL_IMAGE' });
  });
  test('rejects colored canonical pixels even when the PNG receipt matches', async () => {
    const f = await packageFixture();
    f.bytes.canonical = await sharp(Buffer.from([255, 0, 0, 0, 0, 0, 255, 255, 255]), { raw: { width: 3, height: 1, channels: 3 } }).png().toBuffer();
    f.pkg.canonical = { ...receipt('canonical.png', f.bytes.canonical), path: 'canonical.png' };
    await expect(validateRegionPackageBytes(f.pkg, f.bytes)).rejects.toMatchObject({ code: 'E_CANONICAL_COLOR' });
  });
});

describe('frozen recipes, freshness and development scope', () => {
  test('selected and partial validation permit unprepared records while checking present outputs', async () => {
    const f = await treeFixture();
    f.data.artworks.push({ ...f.data.artworks[0]!, id: 'design-003', sourceId: 'design-003', bookNumber: 2 });
    const selected = await validateAssets({ root: f.root, data: f.data, id: 'design-002' });
    expect(selected.ok).toBe(true);
    expect(selected.stats).toMatchObject({ validatedArtworks: 1, validatedVersions: 1, pendingSegmentationReviews: 1, pendingPairingReviews: 1 });
    expect((await validateAssets({ root: f.root, data: f.data, allowPartial: true })).ok).toBe(true);
    const full = await validateAssets({ root: f.root, data: f.data });
    expect(full.ok).toBe(false);
    expect(full.issues.some(issue => issue.code === 'E_ASSET_MISSING' && issue.recordId === 'design-003')).toBe(true);
  });
  test('registered corrupted content fails partial validation instead of disappearing', async () => {
    const f = await treeFixture();
    await write(f.root, `${f.packageDirectory}/hit.bin`, Uint8Array.from([1, 2, 3]));
    const result = await validateAssets({ root: f.root, data: f.data, allowPartial: true });
    expect(result.ok).toBe(false);
    expect(result.issues[0]).toMatchObject({ recordId: 'design-002' });
  });
  test('current source changes are stale even if registry files still exist', async () => {
    const f = await treeFixture();
    const changed = await encodeCanonical({ width: 3, height: 1, pixels: Uint8Array.from([240, 0, 255]) });
    await write(f.root, 'source/coloring/002.png', changed);
    Object.assign(f.data.manifest.files[0]!, { bytes: changed.length, sha256: sha256Bytes(changed) });
    const result = await validateAssets({ root: f.root, data: f.data, id: 'design-002' });
    expect(result.issues.some(issue => issue.code === 'E_ASSET_STALE')).toBe(true);
  });
  test('same canonical pixels with new source-container bytes retain the immutable first recipe', async () => {
    const f = await treeFixture();
    const original = { ...f.data.manifest.files[0]! };
    const archivePath = `source/archive/design-002/${original.sha256}/002.png`;
    await write(f.root, archivePath, f.canonical);
    f.data.manifest.files.push({ ...original, id: `archived-source-${original.sha256}`, path: archivePath });
    const recoded = await sharp(f.canonical).png({ compressionLevel: 0 }).toBuffer();
    const newHash = sha256Bytes(recoded);
    expect(newHash).not.toBe(original.sha256);
    await write(f.root, original.path, recoded);
    Object.assign(f.data.manifest.files[0]!, { bytes: recoded.length, sha256: newHash });
    Object.assign(f.prepared, { sourceDigest: newHash, preparationDigest: computePreparationDigest(newHash, f.identity) });
    await write(f.root, 'generated/assets.json', jsonBytes(f.registry));
    const result = await validateAssets({ root: f.root, data: f.data, id: 'design-002' });
    expect(result.ok).toBe(true);
    expect(result.registry!.artworks['design-002']!.activeVersion).toBe(f.version);
    expect(JSON.parse(await readFile(path.join(f.root, `${f.recipeDirectory}/recipe.json`), 'utf8')).sourceDigest).toBe(original.sha256);
  });
  test('notes and renamed unchanged correction files do not change effective identity', async () => {
    const f = await treeFixture();
    const mask = await encodeCanonical({ width: 3, height: 1, pixels: emptyMask });
    await write(f.root, 'content/segmentation/design-002/first.png', mask);
    await write(f.root, 'content/segmentation/design-002/renamed.png', mask);
    for (const filename of ['first.png', 'renamed.png']) {
      await write(f.root, 'content/segmentation/design-002/config.json', jsonBytes({ ...f.config, notes: filename, barrierAddMask: filename }));
      expect((await validateAssets({ root: f.root, data: f.data, id: 'design-002' })).ok).toBe(true);
    }
  });
  test('changed mask pixels make preparation stale', async () => {
    const f = await treeFixture();
    const mask = await encodeCanonical({ width: 3, height: 1, pixels: Uint8Array.from([255, 0, 0]) });
    await write(f.root, 'content/segmentation/design-002/add.png', mask);
    await write(f.root, 'content/segmentation/design-002/config.json', jsonBytes({ ...f.config, barrierAddMask: 'add.png' }));
    const result = await validateAssets({ root: f.root, data: f.data, id: 'design-002' });
    expect(result.issues.some(issue => issue.code === 'E_ASSET_STALE')).toBe(true);
  });
  test('hash-consistent but semantically wrong barrier ownership fails frozen regeneration', async () => {
    const f = await treeFixture(180, true);
    expect(await validateRegionPackageBytes(f.pkg, f.bytes)).toBeDefined();
    const result = await validateAssets({ root: f.root, data: f.data, id: 'design-002' });
    expect(result.issues.some(issue => issue.code === 'E_RECIPE_REGENERATION')).toBe(true);
  });
  test('retained archive versions are validated as well as the active version', async () => {
    const f = await treeFixture();
    const archived = await treeFixture(179);
    await cp(path.join(archived.root, archived.packageDirectory), path.join(f.root, archived.packageDirectory), { recursive: true });
    await cp(path.join(archived.root, archived.recipeDirectory), path.join(f.root, archived.recipeDirectory), { recursive: true });
    f.registry.artworks['design-002']!.versions[archived.version] = archived.prepared;
    await write(f.root, 'generated/assets.json', jsonBytes(f.registry));
    const valid = await validateAssets({ root: f.root, data: f.data, id: 'design-002' });
    expect(valid.ok).toBe(true);
    expect(valid.stats.validatedVersions).toBe(2);
    await write(f.root, `${archived.packageDirectory}/paint.bin`, Uint8Array.from([1, 2, 3]));
    expect((await validateAssets({ root: f.root, data: f.data, id: 'design-002' })).ok).toBe(false);
  });
  test('recipe and registry identity/path/schema disagreements are rejected', async () => {
    const f = await treeFixture();
    expect(FrozenRecipeSchema.safeParse({ ...f.recipe, canonical: { ...f.recipe.canonical, bytes: 4 } }).success).toBe(false);
    expect(AssetRegistrySchema.safeParse({ ...f.registry, unknownField: true }).success).toBe(false);
    f.registry.artworks['design-002']!.activeVersion = sha256Bytes('missing version');
    expect(AssetRegistrySchema.safeParse(f.registry).success).toBe(false);
  });
});

describe('review identity and keyboard coverage', () => {
  test('content versions exclude notes/paths while preparation separately binds source container bytes', async () => {
    const f = await packageFixture();
    const plain = { ...f.identity, ...f.expected };
    const changed = { ...plain, notes: 'changed', filename: 'elsewhere.png', settings: { ...plain.settings, notes: 'also changed' } };
    expect(computeContentVersion(changed)).toBe(computeContentVersion(plain));
    expect(computePreparationDigest(sha256Bytes('source one'), f.identity)).not.toBe(computePreparationDigest(sha256Bytes('source two'), f.identity));
    expect(computeContentVersion({ ...plain, settings: { ...plain.settings, inkThreshold: 181 } })).not.toBe(f.version);
  });
  test('photo policy and encoder changes invalidate derivative identity', async () => {
    const f = await treeFixture();
    const before = computePhotoPreparationDigest(f.prepared.sourceDigest, f.data.media, 'encoder-one');
    expect(computePhotoPreparationDigest(f.prepared.sourceDigest, f.data.media, 'encoder-two')).not.toBe(before);
    const changed = structuredClone(f.data.media);
    changed.photo.quality -= 1;
    expect(computePhotoPreparationDigest(f.prepared.sourceDigest, changed, 'encoder-one')).not.toBe(before);
  });
  test('direct manifest evidence and citation-source evidence both bind exact source bytes', async () => {
    const f = await treeFixture();
    const artwork = f.data.artworks[0]!;
    artwork.originalPhoto.evidence = [{ sourceId: 'design-002', section: 'Full source drawing' }];
    const direct = computeEditorialReviewDigest(f.data, artwork.id, 'photo-pairing');
    f.data.sources.push({ id: 'DRAWING', title: 'Drawing source', form: 'original-file', sourceFileId: 'design-002', citation: 'Drawing.' });
    artwork.originalPhoto.evidence = [{ sourceId: 'DRAWING', section: 'Full source drawing' }];
    const citation = computeEditorialReviewDigest(f.data, artwork.id, 'photo-pairing');
    expect(citation).not.toBe(direct);
    f.data.manifest.files[0]!.sha256 = sha256Bytes('different source pixels');
    expect(computeEditorialReviewDigest(f.data, artwork.id, 'photo-pairing')).not.toBe(citation);
  });
  test('unrelated caption/location edits preserve pairing review; assertion/source edits invalidate it', async () => {
    const f = await treeFixture();
    const artwork = f.data.artworks[0]!;
    const digest = computeEditorialReviewDigest(f.data, artwork.id, 'photo-pairing');
    f.data.reviews.push({ schemaVersion: 1, recordId: artwork.id, reviewKind: 'photo-pairing', reviewedDigest: digest, reviewer: 'Fixture reviewer', reviewedAtUtc: '2026-11-06T00:00:00.000Z', outcome: 'complete' });
    artwork.title = 'New display caption';
    artwork.location.rationale = 'A separate location edit';
    expect(hasCurrentEditorialReview(f.data, artwork.id, 'photo-pairing')).toBe(true);
    artwork.originalPhoto.rationale = 'A changed matching assertion';
    expect(hasCurrentEditorialReview(f.data, artwork.id, 'photo-pairing')).toBe(false);
  });
  test('subject and location assertions remain independent while historical source changes stale their evidence', async () => {
    const f = await treeFixture();
    f.data.manifest.files.push({ id: 'H28', role: 'history', path: 'source/histories/h28.txt', originalFilename: 'history.docx', bytes: 20, sha256: sha256Bytes('Fixture historical source'), provenance: { sourceId: 'H28', form: 'transcription' } });
    f.data.sources.push({ id: 'H28', title: 'Fixture history', form: 'transcription', sourceFileId: 'H28', citation: 'Test history.' });
    f.data.subjects.push({ id: 'fixture-sun', sourceId: 'H28', section: 'Fixture section', sourceLabel: 'Fixture label', title: 'Sun', evidence: [{ sourceId: 'H28', section: 'Fixture section' }] });
    const artwork = f.data.artworks[0]!;
    artwork.subjects = { value: ['fixture-sun'], confidence: 'confirmed', rationale: 'Fixture subject assertion.', evidence: [{ sourceId: 'H28', section: 'Fixture section' }] };
    artwork.location = { value: 'Fixture position', confidence: 'likely', rationale: 'Fixture location assertion.', evidence: [{ sourceId: 'H28', section: 'Fixture location section' }] };
    const subject = computeEditorialReviewDigest(f.data, artwork.id, 'subject');
    const location = computeEditorialReviewDigest(f.data, artwork.id, 'location');
    artwork.location.value = 'Different fixture position';
    expect(computeEditorialReviewDigest(f.data, artwork.id, 'subject')).toBe(subject);
    expect(computeEditorialReviewDigest(f.data, artwork.id, 'location')).not.toBe(location);
    f.data.manifest.files.find(file => file.id === 'H28')!.sha256 = sha256Bytes('Changed historical source');
    expect(computeEditorialReviewDigest(f.data, artwork.id, 'subject')).not.toBe(subject);
  });
  test('keyboard metadata requires exact IDs and unique navigation coverage', async () => {
    const f = await packageFixture();
    const metadata: AccessibilityMetadata = { schemaVersion: 1, artworkId: 'design-002', contentVersion: f.version, regions: [{ id: 1, name: 'Left pane', order: 2 }, { id: 2, name: 'Right pane', order: 1 }] };
    expect(validateAccessibilityMetadata(metadata, 'design-002', f.version, 2)).toEqual(metadata);
    for (const bad of [
      { ...metadata, regions: [metadata.regions[0]] },
      { ...metadata, regions: [metadata.regions[0], metadata.regions[0]] },
      { ...metadata, regions: [metadata.regions[0], { ...metadata.regions[1], order: 2 }] },
      { ...metadata, regions: [metadata.regions[0], { ...metadata.regions[1], name: ' ' }] },
    ]) expect(() => validateAccessibilityMetadata(bad, 'design-002', f.version, 2)).toThrow();
  });
  test('complete reviews bind the exact segmentation and keyboard names; name edits become pending', async () => {
    const f = await treeFixture();
    const metadata: AccessibilityMetadata = { schemaVersion: 1, artworkId: 'design-002', contentVersion: f.version, regions: [{ id: 1, name: 'Left pane', order: 1 }, { id: 2, name: 'Right pane', order: 2 }] };
    const metadataPath = `content/accessibility/design-002/${f.version}.json`;
    await write(f.root, metadataPath, jsonBytes(metadata));
    const keyboardDigest = computeKeyboardMetadataDigest(metadata);
    const segmentation: ReviewReceipt = { schemaVersion: 1, recordId: 'design-002', reviewKind: 'segmentation', contentVersion: f.version, keyboardMetadataDigest: keyboardDigest,
      reviewedDigest: computeSegmentationReviewDigest('design-002', f.version, keyboardDigest), reviewer: 'Fixture reviewer', reviewedAtUtc: '2026-11-06T00:00:00.000Z', outcome: 'complete' };
    f.data.reviews.push(segmentation, { schemaVersion: 1, recordId: 'design-002', reviewKind: 'photo-pairing', reviewedDigest: computeEditorialReviewDigest(f.data, 'design-002', 'photo-pairing'), reviewer: 'Fixture reviewer', reviewedAtUtc: '2026-11-06T00:00:00.000Z', outcome: 'complete' });
    expect(hasCurrentSegmentationReview(f.data.reviews, 'design-002', f.version, keyboardDigest)).toBe(true);
    const reviewed = await validateAssets({ root: f.root, data: f.data, id: 'design-002', requireReviews: true });
    expect(reviewed.ok).toBe(true);
    metadata.regions[0]!.name = 'Revised left-pane name';
    await write(f.root, metadataPath, jsonBytes(metadata));
    const stale = await validateAssets({ root: f.root, data: f.data, id: 'design-002', requireReviews: true });
    expect(stale.issues.some(issue => issue.code === 'E_SEGMENTATION_REVIEW_PENDING')).toBe(true);
    const stillDraftValid = await validateAssets({ root: f.root, data: f.data, id: 'design-002' });
    expect(stillDraftValid.ok).toBe(true);
    expect(stillDraftValid.stats.pendingSegmentationReviews).toBe(1);
  });
  test('validation is read-only for generated bytes and authored content', async () => {
    const f = await treeFixture();
    const filenames = ['generated/assets.json', `${f.packageDirectory}/package.json`, `${f.packageDirectory}/hit.bin`, `${f.recipeDirectory}/recipe.json`, 'content/segmentation/design-002/config.json'];
    const before = await Promise.all(filenames.map(name => readFile(path.join(f.root, name))));
    await validateAssets({ root: f.root, data: f.data, id: 'design-002' });
    const after = await Promise.all(filenames.map(name => readFile(path.join(f.root, name))));
    expect(after).toEqual(before);
  });
});

describe('reviewed photo derivatives', () => {
  async function photoFixture() {
    const f = await treeFixture();
    const source = await sharp({ create: { width: 6, height: 4, channels: 3, background: { r: 40, g: 120, b: 220 } } }).withMetadata({ orientation: 6 }).jpeg().toBuffer();
    const sourcePath = 'source/photos/002.jpg';
    const sourceDigest = sha256Bytes(source);
    await write(f.root, sourcePath, source);
    f.data.manifest.files.push({ id: 'photo-002', role: 'photo', path: sourcePath, originalFilename: '002.jpg', bytes: source.length, sha256: sourceDigest, width: 6, height: 4, provenance: { sourceId: 'PHOTO-COLLECTION', form: 'original-file' } });
    f.data.photos.push({ id: 'photo-002', sourceId: 'photo-002', displayOrder: 1, coverage: 'whole-window', title: 'Fixture photograph', alt: 'Fixture photograph', description: 'Fixture photograph.', subjects: unreviewed<string[]>(), location: unreviewed<string>(), historicalEvidence: [] });
    f.data.artworks[0]!.originalPhoto = { value: 'photo-002', confidence: 'confirmed', rationale: 'Fixture reviewed visual match.', evidence: [{ sourceId: 'photo-002', section: 'Full fixture photo' }] };
    f.data.reviews.push({ schemaVersion: 1, recordId: 'design-002', reviewKind: 'photo-pairing', reviewedDigest: computeEditorialReviewDigest(f.data, 'design-002', 'photo-pairing'), reviewer: 'Fixture reviewer', reviewedAtUtc: '2026-11-06T00:00:00.000Z', outcome: 'complete' });
    const preparationDigest = computePhotoPreparationDigest(sourceDigest, f.data.media);
    const directory = `public/photos/photo-002/${preparationDigest}`;
    const web = await sharp(source).autoOrient().toColourspace('srgb').resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true }).webp({ quality: 90 }).toBuffer();
    const thumbnail = await sharp(source).autoOrient().toColourspace('srgb').resize({ width: 320, height: 320, fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
    await write(f.root, `${directory}/web.webp`, web);
    await write(f.root, `${directory}/thumbnail.webp`, thumbnail);
    f.registry.photos['photo-002'] = { sourceDigest, preparationDigest, width: 4, height: 6, web: receipt(`${directory}/web.webp`, web), thumbnail: receipt(`${directory}/thumbnail.webp`, thumbnail) };
    await write(f.root, 'generated/assets.json', jsonBytes(f.registry));
    return f;
  }
  test('validates full oriented composition without enlarging a small source', async () => {
    const f = await photoFixture();
    const result = await validateAssets({ root: f.root, data: f.data, id: 'design-002' });
    expect(result.ok).toBe(true);
    expect(result.stats.validatedPhotos).toBe(1);
    expect(result.photos['photo-002']).toMatchObject({ width: 4, height: 6 });
  });
  test('a reviewed associated photograph requires its derivative even in selected scope', async () => {
    const f = await photoFixture();
    delete f.registry.photos['photo-002'];
    await write(f.root, 'generated/assets.json', jsonBytes(f.registry));
    const result = await validateAssets({ root: f.root, data: f.data, id: 'design-002' });
    expect(result.issues.some(issue => issue.code === 'E_PHOTO_DERIVATIVE_MISSING')).toBe(true);
  });
  test('photo output hashes and registry dimensions are checked', async () => {
    const f = await photoFixture();
    f.registry.photos['photo-002']!.width = 6;
    await write(f.root, 'generated/assets.json', jsonBytes(f.registry));
    const result = await validateAssets({ root: f.root, data: f.data, id: 'design-002' });
    expect(result.issues.some(issue => issue.code === 'E_PHOTO_DIMENSIONS')).toBe(true);
    f.registry.photos['photo-002']!.width = 4;
    f.registry.photos['photo-002']!.web.sha256 = sha256Bytes('different web bytes');
    await write(f.root, 'generated/assets.json', jsonBytes(f.registry));
    const wrongHash = await validateAssets({ root: f.root, data: f.data, id: 'design-002' });
    expect(wrongHash.issues.some(issue => issue.code === 'E_ASSET_HASH')).toBe(true);
  });
  test('changed processing policy invalidates otherwise readable photo files', async () => {
    const f = await photoFixture();
    f.data.media.thumbnail.maxLongEdge = 321;
    const result = await validateAssets({ root: f.root, data: f.data, id: 'design-002' });
    expect(result.issues.some(issue => issue.code === 'E_PHOTO_STALE')).toBe(true);
  });
});
