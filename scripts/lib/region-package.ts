import { gzipSync } from 'fflate';
import {
  FrozenRecipeSchema, RegionPackageSchema,
  type EffectiveSegmentation, type FileReceipt, type FrozenRecipe,
  type PreparedVersion, type RegionBinary, type RegionPackage,
} from '../../src/shared/assets.js';
import { encodeCanonical, type CanonicalImage } from './algorithms/gray-v1.js';
import { segmentRegions } from './algorithms/regions-v1.js';
import { computeContentVersion, computePreparationDigest, type ContentIdentityInput } from './asset-identity.js';
import { jsonBytes, sha256Bytes } from './digests.js';
import { encodeU32le, validateRegionPackageBytes, type RegionPackageBytes } from './validate-assets.js';

export type SegmentationResult = ReturnType<typeof segmentRegions>;

export interface AssembledArtwork {
  image: CanonicalImage;
  segmentation: SegmentationResult;
  identity: ContentIdentityInput;
  regionPackage: RegionPackage;
  packageBytes: Buffer;
  bytes: RegionPackageBytes;
  version: PreparedVersion;
  recipe: FrozenRecipe;
  recipeBytes: Record<'canonical.bin' | 'domain.bin' | 'add.bin' | 'remove.bin', Uint8Array>;
}

export function fileReceipt(relativePath: string, bytes: Uint8Array): FileReceipt {
  return { path: relativePath, bytes: bytes.byteLength, sha256: sha256Bytes(bytes) };
}

/** Always encode explicitly. A Uint32Array's backing buffer is host-endian. */
export function uint32LittleEndian(values: Uint32Array): Uint8Array {
  return encodeU32le(values);
}

function compressedReceipt(path: string, encoding: RegionBinary['encoding'], raw: Uint8Array) {
  const bytes = gzipSync(raw, { level: 9, mtime: 0 });
  const receipt: RegionBinary = {
    path, encoding, compressedBytes: bytes.byteLength, compressedSha256: sha256Bytes(bytes),
    uncompressedBytes: raw.byteLength, rawSha256: sha256Bytes(raw),
  };
  return { bytes, receipt };
}

/** Build and validate an entire proposed version before it reaches public/. */
export async function assembleArtwork(
  artworkId: string, sourceId: string, sourceDigest: string,
  image: CanonicalImage, segmentation: SegmentationResult, inkThreshold: number,
): Promise<AssembledArtwork> {
  const hitRaw = uint32LittleEndian(segmentation.hitLabels);
  const paintRaw = uint32LittleEndian(segmentation.paintLabels);
  const settings: EffectiveSegmentation = {
    algorithmVersion: 'regions-v1', normalizationVersion: 'gray-v1', inkThreshold,
    excludedSeedPoints: segmentation.excludedSeedPoints,
  };
  const identity: ContentIdentityInput = {
    width: image.width, height: image.height, settings,
    canonicalSha256: sha256Bytes(image.pixels),
    domainMaskSha256: sha256Bytes(segmentation.domainMask),
    barrierAddMaskSha256: sha256Bytes(segmentation.barrierAddMask),
    barrierRemoveMaskSha256: sha256Bytes(segmentation.barrierRemoveMask),
    hitLabelsSha256: sha256Bytes(hitRaw),
    paintLabelsSha256: sha256Bytes(paintRaw),
    inkAlphaSha256: sha256Bytes(segmentation.inkAlpha),
  };
  const contentVersion = computeContentVersion(identity);
  const directory = `public/art/${artworkId}/${contentVersion}`;
  const recipeDirectory = `generated/recipes/${artworkId}/${contentVersion}`;
  const canonical = await encodeCanonical(image);
  const regions = jsonBytes({ schemaVersion: 1, regions: segmentation.regions });
  const hit = compressedReceipt('hit.bin', 'gzip-u32le', hitRaw);
  const paint = compressedReceipt('paint.bin', 'gzip-u32le', paintRaw);
  const ink = compressedReceipt('ink.bin', 'gzip-u8', segmentation.inkAlpha);
  const regionPackage = RegionPackageSchema.parse({
    schemaVersion: 1, algorithmVersion: 'regions-v1', artworkId, contentVersion,
    width: image.width, height: image.height, regionCount: segmentation.regions.length,
    canonical: fileReceipt('canonical.png', canonical), regions: fileReceipt('regions.json', regions),
    hitLabels: hit.receipt, paintLabels: paint.receipt, inkAlpha: ink.receipt,
  });
  const bytes: RegionPackageBytes = {
    canonical, regions, hitLabels: hit.bytes, paintLabels: paint.bytes, inkAlpha: ink.bytes,
  };
  await validateRegionPackageBytes(regionPackage, bytes);
  const packageBytes = jsonBytes(regionPackage);
  const recipe = FrozenRecipeSchema.parse({
    schemaVersion: 1, artworkId, contentVersion, sourceId, sourceDigest,
    width: image.width, height: image.height, settings,
    canonical: fileReceipt('canonical.bin', image.pixels),
    domainMask: fileReceipt('domain.bin', segmentation.domainMask),
    barrierAddMask: fileReceipt('add.bin', segmentation.barrierAddMask),
    barrierRemoveMask: fileReceipt('remove.bin', segmentation.barrierRemoveMask),
    expected: {
      hitLabelsSha256: identity.hitLabelsSha256, paintLabelsSha256: identity.paintLabelsSha256,
      inkAlphaSha256: identity.inkAlphaSha256, regionCount: segmentation.regions.length,
    },
  });
  return {
    image, segmentation, identity, regionPackage, packageBytes, bytes,
    version: {
      contentVersion, sourceId, sourceDigest,
      preparationDigest: computePreparationDigest(sourceDigest, identity),
      package: fileReceipt(`${directory}/package.json`, packageBytes),
      archiveRecipe: `${recipeDirectory}/recipe.json`,
    },
    recipe,
    recipeBytes: {
      'canonical.bin': image.pixels, 'domain.bin': segmentation.domainMask,
      'add.bin': segmentation.barrierAddMask, 'remove.bin': segmentation.barrierRemoveMask,
    },
  };
}
