import { lstat, readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import sharp from 'sharp';
import type { z } from 'zod';
import {
  AccessibilityMetadataSchema, AssetRegistrySchema, FrozenRecipeSchema,
  MAX_ASSET_FILE_BYTES, MAX_REGION_PIXELS, RegionGeometryFileSchema,
  RegionPackageSchema, SegmentationConfigSchema,
  type AccessibilityMetadata, type AssetRegistry, type EffectiveSegmentation,
  type FileReceipt, type FrozenRecipe, type PhotoDerivative, type PreparedVersion,
  type RegionBinary, type RegionGeometry, type RegionPackage,
} from '../../src/shared/assets.js';
import type { ArtworkRecord, ValidationIssue } from '../../src/shared/contracts.js';
import type { CatalogData } from '../validate-content.js';
import { assertNoPendingTransaction } from './atomic-files.js';
import { CliError } from './cli.js';
import { canonicalJson, sha256Bytes } from './digests.js';
import { assertRegularProjectFile, assertSafeProjectPath, PROJECT_ROOT } from './paths.js';
import { decodeBinaryMask, decodeCanonical } from './algorithms/gray-v1.js';
import { normalizeExcludedSeedPoints, segmentRegions } from './algorithms/regions-v1.js';
import {
  computeContentVersion, computeKeyboardMetadataDigest, computePhotoPreparationDigest,
  computePreparationDigest, hasCurrentEditorialReview, hasCurrentSegmentationReview,
  type PreparationIdentityInput,
} from './asset-identity.js';

export interface RegionPackageBytes {
  canonical: Uint8Array;
  regions: Uint8Array;
  hitLabels: Uint8Array;
  paintLabels: Uint8Array;
  inkAlpha: Uint8Array;
}
export interface LoadedRegionPackage {
  package: RegionPackage;
  canonical: Uint8Array;
  regions: RegionGeometry[];
  hitLabels: Uint32Array;
  paintLabels: Uint32Array;
  inkAlpha: Uint8Array;
}
export interface ValidatedVersion {
  package: RegionPackage;
  regions: RegionGeometry[];
  accessibility?: AccessibilityMetadata;
  keyboardMetadataDigest?: string;
  segmentationReview: 'pending' | 'complete';
}
export interface AssetValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
  warnings: string[];
  registry?: AssetRegistry;
  artworks: Record<string, { activeVersion: string; versions: Record<string, ValidatedVersion> }>;
  photos: Record<string, PhotoDerivative>;
  stats: { validatedArtworks: number; validatedVersions: number; validatedPhotos: number; pendingSegmentationReviews: number; pendingPairingReviews: number };
}

function fail(code: string, message: string, file?: string, field?: string): never {
  throw new CliError(code, message, 3, { ...(file ? { file } : {}), ...(field ? { field } : {}) });
}
function parsed<T>(schema: z.ZodType<T>, value: unknown, file: string): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new CliError('E_ASSET_SCHEMA', `${file}: ${result.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`, 3, { file });
  return result.data;
}
function parseJson(bytes: Uint8Array, file: string): unknown {
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown; }
  catch (error) { return fail('E_ASSET_JSON', `${file} is not valid UTF-8 JSON: ${error instanceof Error ? error.message : String(error)}`, file); }
}
async function readBounded(relative: string, root: string, maxBytes = MAX_ASSET_FILE_BYTES): Promise<Buffer> {
  const absolute = await assertRegularProjectFile(relative, root);
  const size = (await lstat(absolute)).size;
  if (size <= 0 || size > maxBytes) fail('E_ASSET_SIZE', `${relative} has unsupported size ${size}; expected 1 through ${maxBytes} bytes.`, relative);
  return readFile(absolute);
}
function verifyBytes(bytes: Uint8Array, receipt: Pick<FileReceipt, 'bytes' | 'sha256'>, file: string): void {
  if (bytes.byteLength !== receipt.bytes) fail('E_ASSET_LENGTH', `${file}: expected ${receipt.bytes} bytes, found ${bytes.byteLength}.`, file);
  if (sha256Bytes(bytes) !== receipt.sha256) fail('E_ASSET_HASH', `${file}: SHA-256 does not match its receipt.`, file);
}
async function readReceipt(relative: string, receipt: Pick<FileReceipt, 'bytes' | 'sha256'>, root: string): Promise<Buffer> {
  const bytes = await readBounded(relative, root, receipt.bytes);
  verifyBytes(bytes, receipt, relative);
  return bytes;
}

function decodeBinary(bytes: Uint8Array, spec: RegionBinary, expectedBytes: number): Buffer {
  const file = spec.path;
  verifyBytes(bytes, { bytes: spec.compressedBytes, sha256: spec.compressedSha256 }, file);
  if (spec.uncompressedBytes !== expectedBytes) fail('E_ASSET_RAW_LENGTH', `${file}: raw length does not match the canonical dimensions.`, file);
  if (bytes.length < 18 || bytes[0] !== 0x1f || bytes[1] !== 0x8b || bytes[2] !== 8) fail('E_ASSET_GZIP', `${file}: expected a gzip stream.`, file);
  if (bytes[4] !== 0 || bytes[5] !== 0 || bytes[6] !== 0 || bytes[7] !== 0) fail('E_ASSET_GZIP_MTIME', `${file}: gzip timestamp must be zero.`, file);
  let raw: Buffer;
  try { raw = gunzipSync(bytes, { maxOutputLength: expectedBytes }); }
  catch (error) { return fail('E_ASSET_GZIP', `${file}: decompression failed or exceeds its exact byte bound (${error instanceof Error ? error.message : String(error)}).`, file); }
  if (raw.byteLength !== expectedBytes) fail('E_ASSET_RAW_LENGTH', `${file}: expected ${expectedBytes} decoded bytes, found ${raw.byteLength}.`, file);
  if (sha256Bytes(raw) !== spec.rawSha256) fail('E_ASSET_RAW_HASH', `${file}: decoded SHA-256 does not match.`, file);
  return raw;
}
export function decodeU32le(bytes: Uint8Array): Uint32Array {
  if (bytes.byteLength % 4 !== 0) fail('E_ASSET_U32_LENGTH', 'A u32 little-endian map needs a multiple of four bytes.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const result = new Uint32Array(bytes.byteLength / 4);
  for (let i = 0; i < result.length; i += 1) result[i] = view.getUint32(i * 4, true);
  return result;
}
export function encodeU32le(values: Uint32Array): Uint8Array {
  const bytes = new Uint8Array(values.length * 4);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < values.length; i += 1) view.setUint32(i * 4, values[i]!, true);
  return bytes;
}

async function decodeCanonicalPackage(bytes: Uint8Array, pkg: RegionPackage): Promise<Uint8Array> {
  const image = sharp(Buffer.from(bytes), { limitInputPixels: MAX_REGION_PIXELS, failOn: 'error' });
  const metadata = await image.metadata();
  if (metadata.format !== 'png' || metadata.width !== pkg.width || metadata.height !== pkg.height || metadata.depth !== 'uchar'
      || metadata.hasAlpha || (metadata.orientation !== undefined && metadata.orientation !== 1)) {
    fail('E_CANONICAL_IMAGE', 'canonical.png must be opaque 8-bit PNG at the exact canonical dimensions, without an orientation transform.', 'canonical.png');
  }
  const { data, info } = await image.raw({ depth: 'uchar' }).toBuffer({ resolveWithObject: true });
  if (info.width !== pkg.width || info.height !== pkg.height || ![1, 3].includes(info.channels)) fail('E_CANONICAL_IMAGE', 'canonical.png has unexpected decoded dimensions/channels.', 'canonical.png');
  const pixels = new Uint8Array(pkg.width * pkg.height);
  for (let i = 0; i < pixels.length; i += 1) {
    const offset = i * info.channels;
    const value = data[offset]!;
    if (info.channels === 3 && (data[offset + 1] !== value || data[offset + 2] !== value)) fail('E_CANONICAL_COLOR', `canonical.png contains a nongrayscale pixel at index ${i}.`, 'canonical.png');
    pixels[i] = value;
  }
  return pixels;
}

/** Validate proposed output bytes before any public path or registry is changed. */
export async function validateRegionPackageBytes(input: RegionPackage, bytes: RegionPackageBytes): Promise<LoadedRegionPackage> {
  const pkg = parsed(RegionPackageSchema, input, 'package.json');
  const pixels = pkg.width * pkg.height;
  verifyBytes(bytes.canonical, pkg.canonical, 'canonical.png');
  verifyBytes(bytes.regions, pkg.regions, 'regions.json');
  const canonical = await decodeCanonicalPackage(bytes.canonical, pkg);
  const hitLabels = decodeU32le(decodeBinary(bytes.hitLabels, pkg.hitLabels, pixels * 4));
  const paintLabels = decodeU32le(decodeBinary(bytes.paintLabels, pkg.paintLabels, pixels * 4));
  const inkAlpha = new Uint8Array(decodeBinary(bytes.inkAlpha, pkg.inkAlpha, pixels));
  const regions = parsed(RegionGeometryFileSchema, parseJson(bytes.regions, 'regions.json'), 'regions.json').regions;
  if (regions.length !== pkg.regionCount) fail('E_REGION_COVERAGE', `regions.json has ${regions.length} records for ${pkg.regionCount} positive IDs.`, 'regions.json');

  interface Geometry { first: number; count: number; minX: number; minY: number; maxX: number; maxY: number; sumX: number; sumY: number }
  const geometry = new Map<number, Geometry>();
  for (let i = 0; i < pixels; i += 1) {
    const hit = hitLabels[i]!;
    const paint = paintLabels[i]!;
    if (hit > pkg.regionCount || paint > pkg.regionCount) fail('E_REGION_RANGE', `Map pixel ${i} refers to ID ${Math.max(hit, paint)} above ${pkg.regionCount}.`);
    if (inkAlpha[i] !== 255 - canonical[i]!) fail('E_INK_ALPHA', `ink.bin pixel ${i} does not reproduce canonical grayscale when unfilled.`, 'ink.bin');
    if (hit > 0 && paint !== hit) fail('E_PAINT_INTERIOR', `paint.bin changes retained interior ownership at pixel ${i}.`, 'paint.bin');
    if (hit === 0) continue;
    const x = i % pkg.width;
    const y = Math.floor(i / pkg.width);
    const current = geometry.get(hit);
    if (!current) geometry.set(hit, { first: i, count: 1, minX: x, maxX: x, minY: y, maxY: y, sumX: x + 0.5, sumY: y + 0.5 });
    else {
      current.count += 1;
      current.minX = Math.min(current.minX, x); current.maxX = Math.max(current.maxX, x);
      current.minY = Math.min(current.minY, y); current.maxY = Math.max(current.maxY, y);
      current.sumX += x + 0.5; current.sumY += y + 0.5;
    }
  }
  let priorFirst = -1;
  for (let index = 0; index < regions.length; index += 1) {
    const region = regions[index]!;
    const measured = geometry.get(index + 1);
    if (region.id !== index + 1 || !measured) fail('E_REGION_IDS', `regions.json must contain each positive hit ID exactly once, ordered from 1; missing or misplaced ${index + 1}.`, 'regions.json');
    if (measured.first <= priorFirst) fail('E_REGION_ORDER', 'Positive region IDs are not in first-pixel row-major order.', 'regions.json');
    priorFirst = measured.first;
    const bbox = { x: measured.minX, y: measured.minY, width: measured.maxX - measured.minX + 1, height: measured.maxY - measured.minY + 1 };
    if (region.seed[0] !== measured.first % pkg.width || region.seed[1] !== Math.floor(measured.first / pkg.width)
        || region.pixelCount !== measured.count || canonicalJson(region.bbox) !== canonicalJson(bbox)
        || Math.abs(region.centroid[0] - measured.sumX / measured.count) > 1e-9
        || Math.abs(region.centroid[1] - measured.sumY / measured.count) > 1e-9) {
      fail('E_REGION_GEOMETRY', `Region ${region.id} seed, count, bounds, or centroid does not agree with its hit map.`, 'regions.json');
    }
  }
  return { package: pkg, canonical, regions, hitLabels, paintLabels, inkAlpha };
}

export async function loadAssetRegistry(root = PROJECT_ROOT): Promise<AssetRegistry> {
  const file = 'generated/assets.json';
  return parsed(AssetRegistrySchema, parseJson(await readBounded(file, root), file), file);
}

export async function readRegionPackage(root: string, artworkId: string, prepared: PreparedVersion): Promise<LoadedRegionPackage> {
  const directory = `public/art/${artworkId}/${prepared.contentVersion}`;
  const file = `${directory}/package.json`;
  if (prepared.package.path !== file) fail('E_PACKAGE_PATH', `Registered package must be ${file}.`, prepared.package.path);
  const pkg = parsed(RegionPackageSchema, parseJson(await readReceipt(file, prepared.package, root), file), file);
  if (pkg.artworkId !== artworkId || pkg.contentVersion !== prepared.contentVersion) fail('E_PACKAGE_IDENTITY', `${file} disagrees with its artwork/version registry key.`, file);
  return validateRegionPackageBytes(pkg, {
    canonical: await readBounded(`${directory}/${pkg.canonical.path}`, root, pkg.canonical.bytes),
    regions: await readBounded(`${directory}/${pkg.regions.path}`, root, pkg.regions.bytes),
    hitLabels: await readBounded(`${directory}/${pkg.hitLabels.path}`, root, pkg.hitLabels.compressedBytes),
    paintLabels: await readBounded(`${directory}/${pkg.paintLabels.path}`, root, pkg.paintLabels.compressedBytes),
    inkAlpha: await readBounded(`${directory}/${pkg.inkAlpha.path}`, root, pkg.inkAlpha.compressedBytes),
  });
}

export interface LoadedFrozenRecipe {
  recipe: FrozenRecipe;
  canonical: Uint8Array;
  domainMask: Uint8Array;
  barrierAddMask: Uint8Array;
  barrierRemoveMask: Uint8Array;
  identity: PreparationIdentityInput;
}

export async function readFrozenRecipe(root: string, artworkId: string, contentVersion: string, recipePath: string): Promise<LoadedFrozenRecipe> {
  const directory = `generated/recipes/${artworkId}/${contentVersion}`;
  const expectedPath = `${directory}/recipe.json`;
  if (recipePath !== expectedPath) fail('E_RECIPE_PATH', `Frozen recipe must be ${expectedPath}.`, recipePath);
  const recipe = parsed(FrozenRecipeSchema, parseJson(await readBounded(recipePath, root), recipePath), recipePath);
  if (recipe.artworkId !== artworkId || recipe.contentVersion !== contentVersion || recipe.sourceId !== artworkId) fail('E_RECIPE_IDENTITY', `${recipePath} disagrees with its artwork/version identity.`, recipePath);
  const canonical = new Uint8Array(await readReceipt(`${directory}/${recipe.canonical.path}`, recipe.canonical, root));
  const domainMask = new Uint8Array(await readReceipt(`${directory}/${recipe.domainMask.path}`, recipe.domainMask, root));
  const barrierAddMask = new Uint8Array(await readReceipt(`${directory}/${recipe.barrierAddMask.path}`, recipe.barrierAddMask, root));
  const barrierRemoveMask = new Uint8Array(await readReceipt(`${directory}/${recipe.barrierRemoveMask.path}`, recipe.barrierRemoveMask, root));
  for (let i = 0; i < canonical.length; i += 1) {
    if (![0, 255].includes(domainMask[i]!) || ![0, 255].includes(barrierAddMask[i]!) || ![0, 255].includes(barrierRemoveMask[i]!)) fail('E_RECIPE_MASK', `Frozen masks must contain only binary decoded pixels; invalid pixel ${i}.`, recipePath);
    if (barrierAddMask[i] && barrierRemoveMask[i]) fail('E_MASK_OVERLAP', `Frozen add/remove corrections overlap at pixel ${i}.`, recipePath);
  }
  const identity: PreparationIdentityInput = {
    width: recipe.width, height: recipe.height, settings: recipe.settings,
    canonicalSha256: sha256Bytes(canonical), domainMaskSha256: sha256Bytes(domainMask),
    barrierAddMaskSha256: sha256Bytes(barrierAddMask), barrierRemoveMaskSha256: sha256Bytes(barrierRemoveMask),
  };
  const content = computeContentVersion({ ...identity, ...recipe.expected });
  if (content !== contentVersion) fail('E_RECIPE_CONTENT_VERSION', `Frozen recipe content identity computes ${content}, not ${contentVersion}.`, recipePath);
  return { recipe, canonical, domainMask, barrierAddMask, barrierRemoveMask, identity };
}

function certifyRecipe(loaded: LoadedRegionPackage, frozen: LoadedFrozenRecipe, file: string): void {
  const { recipe, canonical, domainMask, barrierAddMask, barrierRemoveMask } = frozen;
  if (loaded.package.width !== recipe.width || loaded.package.height !== recipe.height || loaded.package.regionCount !== recipe.expected.regionCount
      || sha256Bytes(loaded.canonical) !== sha256Bytes(canonical)) fail('E_RECIPE_OUTPUT', 'Package dimensions, count, or canonical pixels disagree with the frozen recipe.', file);
  const regenerated = segmentRegions({ width: recipe.width, height: recipe.height, pixels: canonical }, {
    inkThreshold: recipe.settings.inkThreshold, domainMask, barrierAddMask, barrierRemoveMask,
    excludedSeedPoints: recipe.settings.excludedSeedPoints,
  });
  const actual = {
    hitLabelsSha256: sha256Bytes(encodeU32le(regenerated.hitLabels)),
    paintLabelsSha256: sha256Bytes(encodeU32le(regenerated.paintLabels)),
    inkAlphaSha256: sha256Bytes(regenerated.inkAlpha),
  };
  if (actual.hitLabelsSha256 !== recipe.expected.hitLabelsSha256 || actual.paintLabelsSha256 !== recipe.expected.paintLabelsSha256
      || actual.inkAlphaSha256 !== recipe.expected.inkAlphaSha256 || regenerated.regions.length !== recipe.expected.regionCount) {
    fail('E_RECIPE_REGENERATION', 'Frozen inputs no longer reproduce their expected map hashes/count. Preserve the recipe and use its recorded algorithm.', file);
  }
  if (actual.hitLabelsSha256 !== loaded.package.hitLabels.rawSha256 || actual.paintLabelsSha256 !== loaded.package.paintLabels.rawSha256
      || actual.inkAlphaSha256 !== loaded.package.inkAlpha.rawSha256 || canonicalJson(regenerated.regions) !== canonicalJson(loaded.regions)) {
    fail('E_RECIPE_OUTPUT', 'Prepared hit/paint/ink maps or geometry differ from the exact frozen algorithm result.', file);
  }
}

export async function readCurrentPreparationIdentity(root: string, data: CatalogData, artwork: ArtworkRecord): Promise<{ sourceDigest: string; identity: PreparationIdentityInput }> {
  const source = data.manifest.files.find(file => file.id === artwork.sourceId);
  if (!source) fail('E_SOURCE_MISSING', `No source is recorded for ${artwork.id}.`, 'source/manifest.json');
  const bytes = await readReceipt(source.path, source, root);
  const canonical = await decodeCanonical(bytes);
  const directory = `content/segmentation/${artwork.id}`;
  const configPath = `${directory}/config.json`;
  const config = parsed(SegmentationConfigSchema, parseJson(await readBounded(configPath, root), configPath), configPath);
  const count = canonical.width * canonical.height;
  async function readMask(name: string | undefined, fallback: number): Promise<Uint8Array> {
    if (!name) return new Uint8Array(count).fill(fallback);
    // RelativePathSchema rejects traversal before the configuration directory is joined.
    const filename = `${directory}/${name}`;
    return decodeBinaryMask(await readBounded(filename, root), canonical.width, canonical.height);
  }
  const domainMask = await readMask(config.domainMask, 255);
  const barrierAddMask = await readMask(config.barrierAddMask, 0);
  const barrierRemoveMask = await readMask(config.barrierRemoveMask, 0);
  for (let i = 0; i < count; i += 1) if (barrierAddMask[i] && barrierRemoveMask[i]) fail('E_MASK_OVERLAP', `Add/remove corrections overlap at pixel ${i}.`, configPath);
  const settings: EffectiveSegmentation = {
    algorithmVersion: config.algorithmVersion, normalizationVersion: 'gray-v1', inkThreshold: config.inkThreshold,
    excludedSeedPoints: normalizeExcludedSeedPoints(config.excludedSeedPoints, canonical.width, canonical.height),
  };
  return {
    sourceDigest: source.sha256,
    identity: { width: canonical.width, height: canonical.height, settings,
      canonicalSha256: sha256Bytes(canonical.pixels), domainMaskSha256: sha256Bytes(domainMask),
      barrierAddMaskSha256: sha256Bytes(barrierAddMask), barrierRemoveMaskSha256: sha256Bytes(barrierRemoveMask) },
  };
}

export function validateAccessibilityMetadata(input: unknown, artworkId: string, contentVersion: string, regionCount: number, file = 'accessibility.json'): AccessibilityMetadata {
  const metadata = parsed(AccessibilityMetadataSchema, input, file);
  if (metadata.artworkId !== artworkId || metadata.contentVersion !== contentVersion) fail('E_ACCESSIBILITY_IDENTITY', `${file} belongs to a different artwork/version.`, file);
  const ids = new Set(metadata.regions.map(region => region.id));
  const orders = new Set(metadata.regions.map(region => region.order));
  if (metadata.regions.length !== regionCount || ids.size !== regionCount || orders.size !== regionCount
      || metadata.regions.some(region => region.id > regionCount || region.order > regionCount)) {
    fail('E_ACCESSIBILITY_COVERAGE', `${file} must name every positive region ID exactly once, with unique navigation order 1 through ${regionCount}.`, file);
  }
  return metadata;
}

async function optionalAccessibility(root: string, artworkId: string, version: string, regionCount: number): Promise<AccessibilityMetadata | undefined> {
  const file = `content/accessibility/${artworkId}/${version}.json`;
  const target = await assertSafeProjectPath(file, root, { allowMissing: true });
  try { await lstat(target); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined; throw error; }
  return validateAccessibilityMetadata(parseJson(await readBounded(file, root), file), artworkId, version, regionCount, file);
}

async function validatePhoto(root: string, data: CatalogData, id: string, derivative: PhotoDerivative): Promise<void> {
  const photo = data.photos.find(item => item.id === id);
  const source = data.manifest.files.find(item => item.id === photo?.sourceId);
  if (!photo || !source) fail('E_PHOTO_REFERENCE', `Photo derivative ${id} does not reference an existing photograph/source.`, 'generated/assets.json');
  const sourceBytes = await readReceipt(source.path, source, root);
  if (derivative.sourceDigest !== source.sha256 || derivative.preparationDigest !== computePhotoPreparationDigest(source.sha256, data.media)) {
    fail('E_PHOTO_STALE', `${id} derivative is stale against its source, processing policy, or encoder. Run npm run prepare -- --all.`, 'generated/assets.json');
  }
  const sourceMetadata = await sharp(sourceBytes, { failOn: 'error' }).metadata();
  if (!sourceMetadata.width || !sourceMetadata.height) fail('E_PHOTO_SOURCE', `${id} source dimensions are unavailable.`, source.path);
  const rotated = [5, 6, 7, 8].includes(sourceMetadata.orientation ?? 1);
  const sourceWidth = rotated ? sourceMetadata.height : sourceMetadata.width;
  const sourceHeight = rotated ? sourceMetadata.width : sourceMetadata.height;
  for (const kind of ['web', 'thumbnail'] as const) {
    const file = derivative[kind];
    const expectedPath = `public/photos/${id}/${derivative.preparationDigest}/${kind === 'web' ? 'web' : 'thumbnail'}.webp`;
    if (file.path !== expectedPath) fail('E_PHOTO_PATH', `${id} ${kind} must be stored at ${expectedPath}.`, file.path);
    const image = await readReceipt(file.path, file, root);
    const metadata = await sharp(image, { failOn: 'error' }).metadata();
    const policy = kind === 'web' ? data.media.photo : data.media.thumbnail;
    const scale = Math.min(1, policy.maxLongEdge / Math.max(sourceWidth, sourceHeight));
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    if (metadata.format !== 'webp' || metadata.width !== width || metadata.height !== height
        || (metadata.orientation !== undefined && metadata.orientation !== 1)) fail('E_PHOTO_DIMENSIONS', `${id} ${kind} does not preserve the oriented full composition at ${width} × ${height}.`, file.path);
    if (kind === 'web' && (derivative.width !== metadata.width || derivative.height !== metadata.height)) fail('E_PHOTO_DIMENSIONS', `${id} registry dimensions disagree with its web image.`, 'generated/assets.json');
  }
}

function addIssue(result: AssetValidationResult, error: unknown, file: string, recordId?: string): void {
  const failure = error instanceof CliError ? error : new CliError('E_ASSET_PROCESSING', error instanceof Error ? error.message : String(error), 3);
  const detail = failure.details && typeof failure.details === 'object' ? failure.details as { file?: string; field?: string } : {};
  result.issues.push({
    code: failure.code, file: detail.file ?? file, message: failure.message,
    ...(recordId ? { recordId } : {}), ...(detail.field ? { field: detail.field } : {}),
    command: recordId?.startsWith('design-') ? `npm run prepare -- --id ${recordId}` : 'npm run prepare -- --all',
  });
}

/** data must come from a valid catalog. allowPartial is for the development
 * projection: every registered version is checked, but absent designs are OK. */
export async function validateAssets(options: {
  root?: string;
  data: CatalogData;
  id?: string;
  allowPartial?: boolean;
  requireReviews?: boolean;
}): Promise<AssetValidationResult> {
  const root = options.root ?? PROJECT_ROOT;
  const data = options.data;
  const result: AssetValidationResult = {
    ok: false, issues: [], warnings: [], artworks: Object.create(null) as AssetValidationResult['artworks'],
    photos: Object.create(null) as AssetValidationResult['photos'],
    stats: { validatedArtworks: 0, validatedVersions: 0, validatedPhotos: 0, pendingSegmentationReviews: 0, pendingPairingReviews: 0 },
  };
  try { await assertNoPendingTransaction(root); result.registry = await loadAssetRegistry(root); }
  catch (error) { addIssue(result, error, 'generated/assets.json'); return result; }
  const registry = result.registry;
  const artworkIds = new Set(data.artworks.map(item => item.id));
  const photoIds = new Set(data.photos.map(item => item.id));
  for (const id of Object.keys(registry.artworks)) if (!artworkIds.has(id as `design-${string}`)) addIssue(result, new CliError('E_ASSET_ARTWORK_ID', `Registry names unknown artwork ${id}.`), 'generated/assets.json', id);
  for (const id of Object.keys(registry.photos)) if (!photoIds.has(id as `photo-${string}`)) addIssue(result, new CliError('E_ASSET_PHOTO_ID', `Registry names unknown photograph ${id}.`), 'generated/assets.json', id);
  const selected = options.id ? [options.id] : options.allowPartial ? Object.keys(registry.artworks) : data.artworks.map(item => item.id);
  const selectedPhotos = new Set<string>(options.id ? [] : options.allowPartial ? Object.keys(registry.photos) : data.photos.map(photo => photo.id));

  for (const id of selected) {
    const artwork = data.artworks.find(item => item.id === id);
    if (!artwork) { addIssue(result, new CliError('E_ASSET_ARTWORK_ID', `Unknown artwork ${id}.`), 'generated/assets.json', id); continue; }
    const registration = registry.artworks[id];
    if (!registration) { addIssue(result, new CliError('E_ASSET_MISSING', `${id} has no prepared region package.`, 4), 'generated/assets.json', id); continue; }
    try {
      const current = await readCurrentPreparationIdentity(root, data, artwork);
      const active = registration.versions[registration.activeVersion]!;
      if (active.sourceId !== artwork.sourceId || active.sourceDigest !== current.sourceDigest
          || active.preparationDigest !== computePreparationDigest(current.sourceDigest, current.identity)) {
        fail('E_ASSET_STALE', `${id} active package is stale against the current source/settings. Run npm run prepare -- --id ${id}.`, 'generated/assets.json');
      }
      const versions: Record<string, ValidatedVersion> = Object.create(null) as Record<string, ValidatedVersion>;
      for (const [version, prepared] of Object.entries(registration.versions)) {
        if (prepared.sourceId !== artwork.sourceId) fail('E_PACKAGE_SOURCE', `${id}/${version} has a different source identity.`, 'generated/assets.json');
        const knownSource = data.manifest.files.find(source => source.sha256 === prepared.sourceDigest
          && (source.id === artwork.sourceId || source.path.startsWith(`source/archive/${artwork.sourceId}/`)));
        if (!knownSource) fail('E_VERSION_SOURCE_MISSING', `${id}/${version} source digest is absent from the preserved source inventory.`, 'source/manifest.json');
        const loaded = await readRegionPackage(root, id, prepared);
        if (!prepared.archiveRecipe) fail('E_RECIPE_MISSING', `${id}/${version} has no frozen regeneration recipe.`, 'generated/assets.json');
        const frozen = await readFrozenRecipe(root, id, version, prepared.archiveRecipe);
        const recipeSource = data.manifest.files.find(source => source.sha256 === frozen.recipe.sourceDigest
          && (source.id === artwork.sourceId || source.path.startsWith(`source/archive/${artwork.sourceId}/`)));
        if (!recipeSource) fail('E_RECIPE_SOURCE_MISSING', `${id}/${version} frozen original source is absent from the preserved source inventory.`, prepared.archiveRecipe);
        certifyRecipe(loaded, frozen, prepared.archiveRecipe);
        const identity = version === registration.activeVersion ? current.identity : frozen.identity;
        if (computeContentVersion({ ...identity, hitLabelsSha256: loaded.package.hitLabels.rawSha256,
          paintLabelsSha256: loaded.package.paintLabels.rawSha256, inkAlphaSha256: loaded.package.inkAlpha.rawSha256 }) !== version) {
          fail('E_CONTENT_VERSION', `${id}/${version} does not match its decoded content identity.`, prepared.package.path);
        }
        if (version !== registration.activeVersion && prepared.preparationDigest !== computePreparationDigest(prepared.sourceDigest, frozen.identity)) {
          fail('E_VERSION_PREPARATION', `${id}/${version} preparation digest disagrees with its source and frozen recipe.`, 'generated/assets.json');
        }
        const accessibility = await optionalAccessibility(root, id, version, loaded.package.regionCount);
        const keyboardMetadataDigest = accessibility ? computeKeyboardMetadataDigest(accessibility) : undefined;
        const reviewed = keyboardMetadataDigest !== undefined && hasCurrentSegmentationReview(data.reviews, id, version, keyboardMetadataDigest);
        versions[version] = {
          package: loaded.package, regions: loaded.regions,
          ...(accessibility ? { accessibility, keyboardMetadataDigest } : {}),
          segmentationReview: reviewed ? 'complete' : 'pending',
        };
        if (!reviewed) {
          result.stats.pendingSegmentationReviews += 1;
          result.warnings.push(`${id}/${version}: segmentation review is pending${accessibility ? '.' : '; authored keyboard names are also missing.'}`);
          if (options.requireReviews) fail('E_SEGMENTATION_REVIEW_PENDING', `${id}/${version} needs a current segmentation receipt and complete keyboard metadata.`, `content/reviews/${id}`);
        }
        if (options.requireReviews && accessibility?.regions.some(region => /^Area\s+\d+$/i.test(region.name.trim()))) {
          fail('E_KEYBOARD_NAMES_DRAFT', `${id}/${version} still has generic draft keyboard names.`, `content/accessibility/${id}/${version}.json`);
        }
        result.stats.validatedVersions += 1;
      }
      const paired = hasCurrentEditorialReview(data, id, 'photo-pairing');
      if (!paired) {
        result.stats.pendingPairingReviews += 1;
        result.warnings.push(`${id}: media-pairing review is pending.`);
        if (options.requireReviews) fail('E_PAIRING_REVIEW_PENDING', `${id} needs a current media-pairing receipt; a reviewed unidentified result is acceptable.`, `content/reviews/${id}`);
      } else if (artwork.originalPhoto.value && artwork.originalPhoto.confidence !== 'unidentified') {
        selectedPhotos.add(artwork.originalPhoto.value);
      }
      result.artworks[id] = { activeVersion: registration.activeVersion, versions };
      result.stats.validatedArtworks += 1;
    } catch (error) { addIssue(result, error, 'generated/assets.json', id); }
  }

  for (const id of selectedPhotos) {
    const derivative = registry.photos[id];
    if (!derivative) { addIssue(result, new CliError('E_PHOTO_DERIVATIVE_MISSING', `${id} has no current web and thumbnail derivatives.`, 4), 'generated/assets.json', id); continue; }
    try { await validatePhoto(root, data, id, derivative); result.photos[id] = derivative; result.stats.validatedPhotos += 1; }
    catch (error) { addIssue(result, error, 'generated/assets.json', id); }
  }
  result.ok = result.issues.length === 0;
  return result;
}
