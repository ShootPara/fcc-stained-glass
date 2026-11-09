import { z } from 'zod';
import { NonEmptyTextSchema, RelativePathSchema, Sha256Schema, StableIdSchema } from './validation.js';

// Bounds are checked before buffer allocation or decompression. Current supplied
// coloring pages are about 1.6 million pixels; this leaves substantial headroom.
export const MAX_REGION_PIXELS = 64_000_000;
export const MAX_ASSET_FILE_BYTES = 300_000_000;
const DimensionSchema = z.number().int().positive().max(MAX_REGION_PIXELS);
const CoordinateSchema = z.number().int().nonnegative();
const PointSchema = z.tuple([CoordinateSchema, CoordinateSchema]);

export const FileReceiptSchema = z.object({
  path: RelativePathSchema,
  bytes: z.number().int().positive().max(MAX_ASSET_FILE_BYTES),
  sha256: Sha256Schema,
}).strict();
export type FileReceipt = z.infer<typeof FileReceiptSchema>;

export const RegionBinarySchema = z.object({
  path: RelativePathSchema,
  encoding: z.enum(['gzip-u32le', 'gzip-u8']),
  compressedBytes: z.number().int().positive().max(MAX_ASSET_FILE_BYTES),
  compressedSha256: Sha256Schema,
  uncompressedBytes: z.number().int().positive().max(MAX_REGION_PIXELS * 4),
  rawSha256: Sha256Schema,
}).strict();
export type RegionBinary = z.infer<typeof RegionBinarySchema>;

export const RegionGeometrySchema = z.object({
  id: z.number().int().positive().max(MAX_REGION_PIXELS),
  seed: PointSchema,
  pixelCount: z.number().int().positive().max(MAX_REGION_PIXELS),
  bbox: z.object({ x: CoordinateSchema, y: CoordinateSchema, width: DimensionSchema, height: DimensionSchema }).strict(),
  centroid: z.tuple([z.number().finite().nonnegative(), z.number().finite().nonnegative()]),
}).strict();
export type RegionGeometry = z.infer<typeof RegionGeometrySchema>;
export const RegionGeometryFileSchema = z.object({ schemaVersion: z.literal(1), regions: z.array(RegionGeometrySchema) }).strict();

export const RegionPackageSchema = z.object({
  schemaVersion: z.literal(1),
  algorithmVersion: z.literal('regions-v1'),
  artworkId: StableIdSchema,
  contentVersion: Sha256Schema,
  width: DimensionSchema,
  height: DimensionSchema,
  regionCount: z.number().int().positive().max(MAX_REGION_PIXELS),
  canonical: FileReceiptSchema.extend({ path: z.literal('canonical.png') }),
  regions: FileReceiptSchema.extend({ path: z.literal('regions.json') }),
  hitLabels: RegionBinarySchema.extend({ path: z.literal('hit.bin'), encoding: z.literal('gzip-u32le') }),
  paintLabels: RegionBinarySchema.extend({ path: z.literal('paint.bin'), encoding: z.literal('gzip-u32le') }),
  inkAlpha: RegionBinarySchema.extend({ path: z.literal('ink.bin'), encoding: z.literal('gzip-u8') }),
}).strict().superRefine((value, ctx) => {
  const count = value.width * value.height;
  if (!Number.isSafeInteger(count) || count > MAX_REGION_PIXELS) ctx.addIssue({ code: 'custom', path: ['width'], message: `The region image exceeds the ${MAX_REGION_PIXELS}-pixel processing bound.` });
  if (value.regionCount > count) ctx.addIssue({ code: 'custom', path: ['regionCount'], message: 'Region count cannot exceed pixel count.' });
  for (const field of ['hitLabels', 'paintLabels', 'inkAlpha'] as const) {
    if (value[field].uncompressedBytes !== count * (field === 'inkAlpha' ? 1 : 4)) {
      ctx.addIssue({ code: 'custom', path: [field, 'uncompressedBytes'], message: 'Raw byte count does not agree with the dimensions and encoding.' });
    }
  }
});
export type RegionPackage = z.infer<typeof RegionPackageSchema>;

export const PreparedVersionSchema = z.object({
  contentVersion: Sha256Schema,
  sourceId: StableIdSchema,
  sourceDigest: Sha256Schema,
  preparationDigest: Sha256Schema,
  package: FileReceiptSchema,
  archiveRecipe: RelativePathSchema.optional(),
}).strict();
export type PreparedVersion = z.infer<typeof PreparedVersionSchema>;

export const PhotoDerivativeSchema = z.object({
  sourceDigest: Sha256Schema,
  preparationDigest: Sha256Schema,
  web: FileReceiptSchema,
  thumbnail: FileReceiptSchema,
  width: DimensionSchema,
  height: DimensionSchema,
}).strict();
export type PhotoDerivative = z.infer<typeof PhotoDerivativeSchema>;

export const ArtworkVersionsSchema = z.object({
  activeVersion: Sha256Schema,
  versions: z.record(Sha256Schema, PreparedVersionSchema),
}).strict().superRefine((value, ctx) => {
  if (!Object.hasOwn(value.versions, value.activeVersion)) ctx.addIssue({ code: 'custom', path: ['activeVersion'], message: 'The active version is absent from the versions map.' });
  for (const [key, version] of Object.entries(value.versions)) {
    if (key !== version.contentVersion) ctx.addIssue({ code: 'custom', path: ['versions', key, 'contentVersion'], message: 'Version key and contentVersion disagree.' });
  }
});
export const AssetRegistrySchema = z.object({
  schemaVersion: z.literal(1),
  artworks: z.record(StableIdSchema, ArtworkVersionsSchema),
  photos: z.record(StableIdSchema, PhotoDerivativeSchema),
}).strict();
export type AssetRegistry = z.infer<typeof AssetRegistrySchema>;

export const SegmentationConfigSchema = z.object({
  schemaVersion: z.literal(1),
  algorithmVersion: z.literal('regions-v1'),
  inkThreshold: z.number().int().min(0).max(255),
  domainMask: RelativePathSchema.optional(),
  barrierAddMask: RelativePathSchema.optional(),
  barrierRemoveMask: RelativePathSchema.optional(),
  excludedSeedPoints: z.array(PointSchema),
  notes: z.string(),
}).strict();
export type SegmentationConfig = z.infer<typeof SegmentationConfigSchema>;

export const EffectiveSegmentationSchema = z.object({
  algorithmVersion: z.literal('regions-v1'),
  normalizationVersion: z.literal('gray-v1'),
  inkThreshold: z.number().int().min(0).max(255),
  excludedSeedPoints: z.array(PointSchema),
}).strict().superRefine((value, ctx) => {
  for (let i = 1; i < value.excludedSeedPoints.length; i += 1) {
    const prior = value.excludedSeedPoints[i - 1]!;
    const current = value.excludedSeedPoints[i]!;
    if (prior[1] > current[1] || (prior[1] === current[1] && prior[0] >= current[0])) {
      ctx.addIssue({ code: 'custom', path: ['excludedSeedPoints', i], message: 'Effective exclusions must be deduplicated and sorted by y then x.' });
    }
  }
});
export type EffectiveSegmentation = z.infer<typeof EffectiveSegmentationSchema>;

export const AccessibilityMetadataSchema = z.object({
  schemaVersion: z.literal(1),
  artworkId: StableIdSchema,
  contentVersion: Sha256Schema,
  regions: z.array(z.object({ id: z.number().int().positive(), name: NonEmptyTextSchema, order: z.number().int().positive() }).strict()),
}).strict();
export type AccessibilityMetadata = z.infer<typeof AccessibilityMetadataSchema>;

/** Frozen files are raw decoded u8 pixels, relative to recipe.json. Their own
 * hashes bind the regeneration inputs, independently of PNG container bytes. */
export const FrozenRecipeSchema = z.object({
  schemaVersion: z.literal(1),
  artworkId: StableIdSchema,
  contentVersion: Sha256Schema,
  sourceId: StableIdSchema,
  sourceDigest: Sha256Schema,
  width: DimensionSchema,
  height: DimensionSchema,
  settings: EffectiveSegmentationSchema,
  canonical: FileReceiptSchema.extend({ path: z.literal('canonical.bin') }),
  domainMask: FileReceiptSchema.extend({ path: z.literal('domain.bin') }),
  barrierAddMask: FileReceiptSchema.extend({ path: z.literal('add.bin') }),
  barrierRemoveMask: FileReceiptSchema.extend({ path: z.literal('remove.bin') }),
  expected: z.object({
    hitLabelsSha256: Sha256Schema,
    paintLabelsSha256: Sha256Schema,
    inkAlphaSha256: Sha256Schema,
    regionCount: z.number().int().positive().max(MAX_REGION_PIXELS),
  }).strict(),
}).strict().superRefine((value, ctx) => {
  const count = value.width * value.height;
  if (!Number.isSafeInteger(count) || count > MAX_REGION_PIXELS) ctx.addIssue({ code: 'custom', path: ['width'], message: 'Frozen recipe exceeds the supported pixel bound.' });
  for (const field of ['canonical', 'domainMask', 'barrierAddMask', 'barrierRemoveMask'] as const) {
    if (value[field].bytes !== count) ctx.addIssue({ code: 'custom', path: [field, 'bytes'], message: 'A raw u8 recipe input needs one byte per pixel.' });
  }
  for (const [index, point] of value.settings.excludedSeedPoints.entries()) {
    if (point[0] >= value.width || point[1] >= value.height) ctx.addIssue({ code: 'custom', path: ['settings', 'excludedSeedPoints', index], message: 'Exclusion coordinate is outside the canonical image.' });
  }
  if (value.expected.regionCount > count) ctx.addIssue({ code: 'custom', path: ['expected', 'regionCount'], message: 'Region count cannot exceed pixel count.' });
});
export type FrozenRecipe = z.infer<typeof FrozenRecipeSchema>;
