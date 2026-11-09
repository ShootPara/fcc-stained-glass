import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import {
  AssetRegistrySchema, FrozenRecipeSchema, SegmentationConfigSchema,
  type AssetRegistry, type FileReceipt, type FrozenRecipe, type PreparedVersion,
} from '../../src/shared/assets.js';
import type { ArtworkRecord } from '../../src/shared/contracts.js';
import { validateCatalog, type CatalogData } from '../validate-content.js';
import { withOperationLock, promoteBatch } from './atomic-files.js';
import { computePreparationDigest, hasCurrentEditorialReview } from './asset-identity.js';
import { decodeBinaryMask, decodeCanonical, type CanonicalImage } from './algorithms/gray-v1.js';
import { segmentRegions } from './algorithms/regions-v1.js';
import { CliError, type RunReport } from './cli.js';
import { canonicalJson, jsonBytes, sha256Bytes } from './digests.js';
import { assertRegularProjectFile, assertSafeProjectPath, PROJECT_ROOT } from './paths.js';
import { preparePhotoDerivative, type PreparedPhoto } from './photo-derivatives.js';
import { PreparationStage } from './preparation-stage.js';
import { assembleArtwork, fileReceipt, uint32LittleEndian, type AssembledArtwork } from './region-package.js';
import { writeReviewImages } from './review-images.js';
import { readRegionPackage } from './validate-assets.js';

export interface PreparationOptions {
  id?: string;
  all?: boolean;
  includeArchives?: boolean;
  photosOnly?: boolean;
}

export interface PreparedArtworkSummary {
  id: string;
  contentVersion: string;
  width: number;
  height: number;
  regionCount: number;
  reviewDirectory: string;
  reusedPackage: boolean;
  archive: boolean;
}

export interface PreparationResult {
  artworks: PreparedArtworkSummary[];
  photos: string[];
  skippedUnreviewedPhotoCandidates: string[];
  changedFiles: string[];
  unchangedFileCount: number;
  recoveredTransaction: boolean;
  registryChanged: boolean;
  reviewReceiptsWritten: 0;
}

function validateOptions(options: PreparationOptions): void {
  if (Boolean(options.id) === Boolean(options.all) || (options.includeArchives && !options.all)) {
    throw new CliError('E_ARGUMENTS', 'Choose exactly one --id or --all. --include-archives requires --all.', 2);
  }
  if (options.photosOnly && (!options.all || options.includeArchives)) throw new CliError('E_ARGUMENTS', '--photos-only requires --all and cannot include archives.', 2);
}

async function optionalFile(relativePath: string, root: string): Promise<Buffer | undefined> {
  try { return await readFile(await assertRegularProjectFile(relativePath, root)); }
  catch (error) {
    if (error instanceof CliError && error.code === 'E_FILE_MISSING') return undefined;
    throw error;
  }
}

function parseJson(bytes: Uint8Array, relativePath: string): unknown {
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown; }
  catch { throw new CliError('E_JSON', `${relativePath} must contain valid UTF-8 JSON.`, 3); }
}

async function registryAt(root: string): Promise<AssetRegistry> {
  const bytes = await optionalFile('generated/assets.json', root);
  const result = AssetRegistrySchema.safeParse(bytes ? parseJson(bytes, 'generated/assets.json') : { schemaVersion: 1, artworks: {}, photos: {} });
  if (!result.success) throw new CliError('E_ASSET_REGISTRY', 'generated/assets.json has invalid fields.', 3, result.error.issues);
  return result.data;
}

function sourceFor(data: CatalogData, id: string, role: 'coloring' | 'photo') {
  const entry = data.manifest.files.find(file => file.id === id);
  if (!entry || entry.role !== role) throw new CliError('E_PREPARATION_SOURCE', `Missing ${role} source ${id} in source/manifest.json.`, 3);
  return entry;
}

async function verifiedSource(data: CatalogData, id: string, role: 'coloring' | 'photo', stage: PreparationStage): Promise<Uint8Array> {
  const source = sourceFor(data, id, role);
  const bytes = await stage.observeInput(source.path);
  if (bytes.byteLength !== source.bytes || sha256Bytes(bytes) !== source.sha256) {
    throw new CliError('E_PREPARATION_SOURCE', `${id}: ${source.path} differs from its recorded byte count or SHA-256. Restore or explicitly import the intended source.`, 3);
  }
  return bytes;
}

async function currentArtwork(artwork: ArtworkRecord, data: CatalogData, stage: PreparationStage): Promise<AssembledArtwork> {
  const source = sourceFor(data, artwork.sourceId, 'coloring');
  const image = await decodeCanonical(await verifiedSource(data, artwork.sourceId, 'coloring', stage));
  const configDirectory = `content/segmentation/${artwork.id}`;
  const configPath = `${configDirectory}/config.json`;
  const parsed = SegmentationConfigSchema.safeParse(parseJson(await stage.observeInput(configPath), configPath));
  if (!parsed.success) throw new CliError('E_SEGMENTATION_CONFIG', `${artwork.id}: ${configPath} has invalid fields.`, 3, parsed.error.issues);
  const config = parsed.data;
  const loadMask = async (name: string | undefined) => name === undefined ? undefined
    : decodeBinaryMask(await stage.observeInput(`${configDirectory}/${name}`), image.width, image.height);
  const segmentation = segmentRegions(image, {
    inkThreshold: config.inkThreshold,
    excludedSeedPoints: config.excludedSeedPoints,
    domainMask: await loadMask(config.domainMask),
    barrierAddMask: await loadMask(config.barrierAddMask),
    barrierRemoveMask: await loadMask(config.barrierRemoveMask),
  });
  return assembleArtwork(artwork.id, source.id, source.sha256, image, segmentation, config.inkThreshold);
}

async function readRecipe(relativePath: string, stage: PreparationStage): Promise<{ recipe: FrozenRecipe; inputs: Uint8Array[] }> {
  const parsed = FrozenRecipeSchema.safeParse(parseJson(await stage.observeInput(relativePath), relativePath));
  if (!parsed.success) throw new CliError('E_RECIPE_SCHEMA', `${relativePath} is not a valid frozen regeneration recipe.`, 3, parsed.error.issues);
  const recipe = parsed.data;
  const expectedPath = `generated/recipes/${recipe.artworkId}/${recipe.contentVersion}/recipe.json`;
  if (relativePath !== expectedPath) throw new CliError('E_RECIPE_PATH', `Frozen recipe must be stored at ${expectedPath}.`, 3);
  const directory = path.posix.dirname(relativePath);
  const inputs: Uint8Array[] = [];
  for (const receipt of [recipe.canonical, recipe.domainMask, recipe.barrierAddMask, recipe.barrierRemoveMask]) {
    const bytes = await stage.observeInput(`${directory}/${receipt.path}`);
    if (bytes.byteLength !== receipt.bytes || sha256Bytes(bytes) !== receipt.sha256) {
      throw new CliError('E_RECIPE_INPUT', `${directory}/${receipt.path} differs from its frozen receipt.`, 3);
    }
    inputs.push(bytes);
  }
  return { recipe, inputs };
}

async function frozenArtwork(relativePath: string, stage: PreparationStage): Promise<AssembledArtwork> {
  const { recipe, inputs } = await readRecipe(relativePath, stage);
  const image: CanonicalImage = { width: recipe.width, height: recipe.height, pixels: inputs[0]! };
  const segmentation = segmentRegions(image, {
    inkThreshold: recipe.settings.inkThreshold, excludedSeedPoints: recipe.settings.excludedSeedPoints,
    domainMask: inputs[1], barrierAddMask: inputs[2], barrierRemoveMask: inputs[3],
  });
  const assembled = await assembleArtwork(recipe.artworkId, recipe.sourceId, recipe.sourceDigest, image, segmentation, recipe.settings.inkThreshold);
  if (assembled.version.contentVersion !== recipe.contentVersion
      || canonicalJson(assembled.recipe.expected) !== canonicalJson(recipe.expected)) {
    throw new CliError('E_RECIPE_REGENERATION', `${relativePath}: regenerated region identity or raw maps differ from the frozen expectation. No version was migrated.`, 3);
  }
  return assembled;
}

/** Keep the first recipe's source provenance even when a source is re-encoded
 * without changing any canonical pixel. Its semantic regeneration inputs match. */
async function stageRecipe(assembled: AssembledArtwork, existing: PreparedVersion | undefined, stage: PreparationStage): Promise<void> {
  const relativePath = assembled.version.archiveRecipe!;
  if (existing?.archiveRecipe && existing.archiveRecipe !== relativePath) {
    throw new CliError('E_RECIPE_PATH', `Registered recipe for ${assembled.regionPackage.artworkId} must be ${relativePath}.`, 3);
  }
  const existingBytes = await optionalFile(relativePath, stage.root);
  if (existing && existingBytes === undefined) throw new CliError('E_RECIPE_MISSING', `Retained version is missing its frozen recipe: ${relativePath}. Restore the tracked recipe before preparing it.`, 3);
  let recipeBytes = jsonBytes(assembled.recipe);
  if (existingBytes !== undefined) {
    const parsed = FrozenRecipeSchema.safeParse(parseJson(existingBytes, relativePath));
    if (!parsed.success) throw new CliError('E_RECIPE_SCHEMA', `${relativePath} has invalid fields.`, 3, parsed.error.issues);
    const semantic = (recipe: FrozenRecipe) => ({ ...recipe, sourceDigest: '' });
    if (canonicalJson(semantic(parsed.data)) !== canonicalJson(semantic(assembled.recipe))) {
      throw new CliError('E_RECIPE_COLLISION', `${relativePath} contains different immutable regeneration inputs.`, 3);
    }
    recipeBytes = existingBytes;
  }
  const directory = path.posix.dirname(relativePath);
  for (const [name, bytes] of Object.entries(assembled.recipeBytes)) await stage.add(`${directory}/${name}`, bytes, true);
  await stage.add(relativePath, recipeBytes, true);
}

async function reusablePackage(
  artworkId: string, assembled: AssembledArtwork, existing: PreparedVersion | undefined, root: string,
): Promise<FileReceipt | undefined> {
  let candidate = existing;
  if (!candidate) {
    const bytes = await optionalFile(assembled.version.package.path, root);
    if (bytes === undefined) return undefined;
    candidate = { ...assembled.version, package: fileReceipt(assembled.version.package.path, bytes) };
  }
  let loaded;
  try { loaded = await readRegionPackage(root, artworkId, candidate); }
  catch (error) {
    // A missing generated member can be regenerated from known inputs. Existing
    // different bytes still fail the immutable checks during staging.
    if (error instanceof CliError && error.code === 'E_FILE_MISSING') return undefined;
    throw error;
  }
  if (sha256Bytes(loaded.canonical) !== assembled.identity.canonicalSha256
      || sha256Bytes(uint32LittleEndian(loaded.hitLabels)) !== assembled.identity.hitLabelsSha256
      || sha256Bytes(uint32LittleEndian(loaded.paintLabels)) !== assembled.identity.paintLabelsSha256
      || sha256Bytes(loaded.inkAlpha) !== assembled.identity.inkAlphaSha256) {
    throw new CliError('E_PACKAGE_CONTENT_COLLISION', `${artworkId}: the existing package does not reproduce the proposed canonical pixels and raw maps.`, 3);
  }
  return candidate.package;
}

async function stageArtwork(
  assembled: AssembledArtwork, registry: AssetRegistry, stage: PreparationStage, archive: boolean,
): Promise<PreparedArtworkSummary> {
  const artworkId = assembled.regionPackage.artworkId;
  const contentVersion = assembled.version.contentVersion;
  const priorVersions = registry.artworks[artworkId];
  const prior = priorVersions?.versions[contentVersion];
  await stageRecipe(assembled, prior, stage);
  const reusable = await reusablePackage(artworkId, assembled, prior, stage.root);
  const version: PreparedVersion = archive && prior ? { ...prior } : { ...assembled.version };
  if (archive && prior && prior.preparationDigest !== computePreparationDigest(prior.sourceDigest, assembled.identity)) {
    throw new CliError('E_ARCHIVE_REGISTRY', `${artworkId}/${contentVersion}: the retained registry metadata disagrees with its frozen recipe.`, 3);
  }
  if (reusable) version.package = reusable;
  else {
    const directory = path.posix.dirname(assembled.version.package.path);
    for (const [name, bytes] of [
      ['canonical.png', assembled.bytes.canonical], ['regions.json', assembled.bytes.regions],
      ['hit.bin', assembled.bytes.hitLabels], ['paint.bin', assembled.bytes.paintLabels],
      ['ink.bin', assembled.bytes.inkAlpha], ['package.json', assembled.packageBytes],
    ] as const) await stage.add(`${directory}/${name}`, bytes, true);
    version.package = assembled.version.package;
  }
  version.archiveRecipe = assembled.version.archiveRecipe;
  const versions = { ...(priorVersions?.versions ?? {}), [contentVersion]: version };
  registry.artworks[artworkId] = {
    activeVersion: archive && priorVersions ? priorVersions.activeVersion : contentVersion,
    versions,
  };
  const review = await writeReviewImages(stage.root, artworkId, contentVersion, assembled.image, assembled.segmentation);
  return {
    id: artworkId, contentVersion, width: assembled.image.width, height: assembled.image.height,
    regionCount: assembled.segmentation.regions.length, reviewDirectory: review.directory,
    reusedPackage: reusable !== undefined, archive,
  };
}

async function existingPhotoIsValid(prepared: PreparedPhoto, registry: AssetRegistry, photoId: string, root: string): Promise<boolean> {
  const existing = registry.photos[photoId];
  if (!existing || existing.preparationDigest !== prepared.derivative.preparationDigest) return false;
  if (existing.sourceDigest !== prepared.derivative.sourceDigest
      || existing.web.path !== prepared.derivative.web.path || existing.thumbnail.path !== prepared.derivative.thumbnail.path
      || existing.width !== prepared.derivative.width || existing.height !== prepared.derivative.height) {
    throw new CliError('E_PHOTO_REGISTRY', `${photoId}: the photo derivative metadata is inconsistent with its preparation identity.`, 3);
  }
  let complete = true;
  for (const receipt of [existing.web, existing.thumbnail]) {
    const bytes = await optionalFile(receipt.path, root);
    if (bytes === undefined) { complete = false; continue; }
    if (bytes.byteLength !== receipt.bytes || sha256Bytes(bytes) !== receipt.sha256) {
      throw new CliError('E_PHOTO_OUTPUT_HASH', `${photoId}: existing derivative ${receipt.path} does not match its receipt.`, 3);
    }
  }
  return complete;
}

async function archiveRecipes(root: string, artworkIds: Set<string>): Promise<string[]> {
  const directory = 'generated/recipes';
  let absolute: string;
  try { absolute = await assertSafeProjectPath(directory, root); }
  catch (error) { if (error instanceof CliError && error.code === 'E_FILE_MISSING') return []; throw error; }
  const result: string[] = [];
  for (const artwork of await readdir(absolute, { withFileTypes: true })) {
    if (artwork.isSymbolicLink()) throw new CliError('E_RECIPE_SYMLINK', `Frozen recipes must not be symlinks: ${directory}/${artwork.name}.`, 3);
    if (!artwork.isDirectory()) throw new CliError('E_RECIPE_LAYOUT', `Expected an artwork directory in ${directory}: ${artwork.name}.`, 3);
    if (!artworkIds.has(artwork.name)) throw new CliError('E_RECIPE_ARTWORK', `Frozen recipe references unknown artwork ${artwork.name}.`, 3);
    const artworkDirectory = `${directory}/${artwork.name}`;
    const artworkAbsolute = await assertSafeProjectPath(artworkDirectory, root);
    for (const version of await readdir(artworkAbsolute, { withFileTypes: true })) {
      if (!version.isDirectory() || version.isSymbolicLink() || !/^[a-f0-9]{64}$/.test(version.name)) {
        throw new CliError('E_RECIPE_LAYOUT', `Invalid frozen version directory: ${artworkDirectory}/${version.name}.`, 3);
      }
      result.push(`${artworkDirectory}/${version.name}/recipe.json`);
    }
  }
  return result.sort();
}

async function prepareLockedBatch(
  root: string, data: CatalogData, options: PreparationOptions, recovered: boolean, report?: RunReport,
): Promise<PreparationResult> {
  validateOptions(options);
  const artworks = options.photosOnly ? [] : options.all ? data.artworks : data.artworks.filter(artwork => artwork.id === options.id);
  if (artworks.length === 0 && !options.photosOnly) throw new CliError('E_ARTWORK_ID', `No catalog artwork matches ${options.id ?? 'the requested batch'}.`, 2);
  const registry = await registryAt(root);
  const originalRegistry = canonicalJson(registry);
  const stage = new PreparationStage(root);
  const results: PreparedArtworkSummary[] = [];
  const preparedPhotos: string[] = [];
  const skippedUnreviewedPhotoCandidates: string[] = [];
  try {
    await stage.initialize();
    const currentVersions = new Set<string>();
    for (const artwork of artworks) {
      try {
        const assembled = await currentArtwork(artwork, data, stage);
        results.push(await stageArtwork(assembled, registry, stage, false));
        currentVersions.add(`${artwork.id}/${assembled.version.contentVersion}`);
      } catch (error) {
        if (error instanceof CliError) throw new CliError(error.code, `${artwork.id}: ${error.message}`, error.exitCode, error.details);
        throw error;
      }
    }
    if (options.includeArchives) {
      for (const recipePath of await archiveRecipes(root, new Set(data.artworks.map(artwork => artwork.id)))) {
        const parts = recipePath.split('/');
        if (currentVersions.has(`${parts[2]}/${parts[3]}`)) continue;
        const assembled = await frozenArtwork(recipePath, stage);
        results.push(await stageArtwork(assembled, registry, stage, true));
      }
    }
    const photoIds = new Set<string>();
    if (options.all) for (const photo of data.photos) photoIds.add(photo.id);
    else for (const artwork of artworks) {
      const association = artwork.originalPhoto;
      if (association.value && (association.confidence === 'confirmed' || association.confidence === 'likely')
          && hasCurrentEditorialReview(data, artwork.id, 'photo-pairing')) photoIds.add(association.value);
      else if (association.value) skippedUnreviewedPhotoCandidates.push(artwork.id);
    }
    for (const photoId of [...photoIds].sort()) {
      const photo = data.photos.find(item => item.id === photoId);
      if (!photo) throw new CliError('E_PHOTO_ID', `Reviewed photo association references missing ${photoId}.`, 3);
      const source = sourceFor(data, photo.sourceId, 'photo');
      const bytes = await verifiedSource(data, source.id, 'photo', stage);
      const prepared = await preparePhotoDerivative(photo.id, source.sha256, bytes, data.media);
      if (!await existingPhotoIsValid(prepared, registry, photo.id, root)) {
        for (const file of prepared.files) await stage.add(file.path, file.bytes, true);
        registry.photos[photo.id] = prepared.derivative;
      }
      preparedPhotos.push(photo.id);
    }
    AssetRegistrySchema.parse(registry);
    await stage.verifyInputs();
    const registryChanged = originalRegistry !== canonicalJson(registry);
    // Authoritative registry is always the last promotion target for the batch.
    if (registryChanged || await optionalFile('generated/assets.json', root) === undefined) {
      await stage.add('generated/assets.json', jsonBytes(registry), false);
    }
    const changedFiles = stage.updates.map(update => update.path);
    await promoteBatch(root, 'prepare', stage.updates);
    const result: PreparationResult = {
      artworks: results, photos: preparedPhotos, skippedUnreviewedPhotoCandidates,
      changedFiles, unchangedFileCount: stage.unchanged.length,
      recoveredTransaction: recovered, registryChanged, reviewReceiptsWritten: 0,
    };
    if (report) {
      report.inputs.push(...stage.inputs.keys());
      report.outputs.push(...changedFiles, ...results.map(artwork => artwork.reviewDirectory));
      for (const artwork of results) report.digests[`${artwork.id}/${artwork.contentVersion}`] = artwork.contentVersion;
      if (recovered) report.warnings.push('Recovered an interrupted file promotion before preparing assets.');
      if (skippedUnreviewedPhotoCandidates.length) report.warnings.push('Unreviewed or unidentified photo candidates were not prepared by this selected run.');
      report.summary = result;
    }
    return result;
  } finally { await stage.dispose(); }
}

/** Public command path: validate the full real catalog before preparation. */
export async function prepareAssets(options: PreparationOptions, root = PROJECT_ROOT, report?: RunReport): Promise<PreparationResult> {
  validateOptions(options);
  return withOperationLock(root, 'prepare', async recovered => {
    const validation = await validateCatalog({ root });
    if (!validation.ok || !validation.data) throw new CliError('E_CATALOG_INVALID', 'Catalog validation failed. Run npm run validate -- --stage catalog.', 3, validation.issues);
    return prepareLockedBatch(root, validation.data, options, recovered, report);
  });
}

/** Explicit fixture/programmatic path. The caller supplies parsed catalog data;
 * selected source bytes, configurations, packages and all paths are still checked. */
export async function prepareCatalogAssets(root: string, data: CatalogData, options: PreparationOptions): Promise<PreparationResult> {
  validateOptions(options);
  return withOperationLock(root, 'prepare', recovered => prepareLockedBatch(root, data, options, recovered));
}
