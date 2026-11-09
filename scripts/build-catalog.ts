import path from 'node:path';
import { z } from 'zod';
import { access, readFile } from 'node:fs/promises';
import { validatePrint, printContextFromValidated } from './lib/printable.js';
import { validatePrintCollection } from './lib/print-book.js';
import { DevelopmentCatalogSchema, type DevelopmentCatalog, type PublicFileReceipt, type PublicPreparedVersion } from '../src/shared/public-catalog.js';
import type { AccessibilityMetadata, AssetRegistry, FileReceipt } from '../src/shared/assets.js';
import type { EvidenceRef } from '../src/shared/contracts.js';
import { validateCatalog, type CatalogData } from './validate-content.js';
import { validateAssets } from './lib/validate-assets.js';
import { computeKeyboardMetadataDigest, hasCurrentEditorialReview, hasCurrentSegmentationReview } from './lib/asset-identity.js';
import { promoteBatch, withOperationLock } from './lib/atomic-files.js';
import type { FileUpdate } from './lib/atomic-files.js';
import { CliError, isMain, parseNamedArgs, runCli } from './lib/cli.js';
import { canonicalJson, jsonBytes, sha256Bytes } from './lib/digests.js';
import { PROJECT_ROOT } from './lib/paths.js';
import { assertRegularProjectFile } from './lib/paths.js';
import { EvidenceRefSchema, NonEmptyTextSchema } from '../src/shared/validation.js';

export interface CatalogResources {
  artworks: Record<string, { activeVersion: string; versions: Record<string, PublicPreparedVersion> }>;
  photos: AssetRegistry['photos'];
}

function publicReceipt(receipt: FileReceipt): PublicFileReceipt {
  if (!receipt.path.startsWith('public/')) throw new CliError('E_PUBLIC_PATH', `Generated file is not under public/: ${receipt.path}`, 3);
  return { path: receipt.path.slice('public/'.length), bytes: receipt.bytes, sha256: receipt.sha256 };
}

function currentReview(data: CatalogData, id: string, kind: 'photo-pairing' | 'subject' | 'location'): boolean {
  return data.reviews.some(receipt => receipt.recordId === id && receipt.reviewKind === kind)
    && hasCurrentEditorialReview(data, id, kind);
}

function publicCitations(data: CatalogData, evidence: EvidenceRef[]): string[] {
  const references = evidence.map(ref => {
    const source = data.sources.find(item => item.id === ref.sourceId);
    // A source file ID is valid authoring evidence but does not require exposing
    // its filename or acquisition URL to the browser.
    const title = source?.citation ?? source?.title ?? 'Included source material';
    return [title, ref.section, ref.locator, ref.printedPage ? `Page ${ref.printedPage}` : undefined].filter(Boolean).join(' — ');
  });
  return [...new Set(references)];
}

/** Whitelist public fields and derive every exposed relationship from current
 * receipts. Source paths, acquisition URLs and private rationale stay local. */
export function projectDevelopmentCatalog(
  data: CatalogData,
  resources: CatalogResources = { artworks: {}, photos: {} },
): DevelopmentCatalog {
  const catalog: DevelopmentCatalog = {
    schemaVersion: 1,
    mode: 'development',
    repositoryUrl: data.project.repositoryUrl,
    title: data.project.title,
    projectVersion: data.project.projectVersion,
    sourceSnapshotDigest: sha256Bytes(canonicalJson(data.manifest.files
      .map(({ id, sha256 }) => ({ id, sha256 }))
      .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0))),
    photos: [...data.photos].sort((a, b) => a.displayOrder - b.displayOrder).map(photo => {
      const derivative = resources.photos[photo.id];
      const locationReviewed = currentReview(data, photo.id, 'location');
      const subjectReviewed = currentReview(data, photo.id, 'subject');
      return {
        id: photo.id, displayOrder: photo.displayOrder, title: photo.title, alt: photo.alt,
        description: photo.description,
        image: derivative ? { web: publicReceipt(derivative.web), thumbnail: publicReceipt(derivative.thumbnail), width: derivative.width, height: derivative.height } : null,
        location: { value: locationReviewed ? photo.location.value : null, confidence: locationReviewed ? photo.location.confidence : 'unidentified', reviewState: locationReviewed ? 'complete' : 'pending' },
        citations: publicCitations(data, photo.historicalEvidence),
        relatedArtworkIds: [],
        reviewState: locationReviewed && subjectReviewed ? 'complete' : 'pending',
      };
    }),
    artworks: data.book.artworkOrder.map(id => {
      const artwork = data.artworks.find(item => item.id === id);
      if (!artwork) throw new CliError('E_BOOK_REFERENCE', `Book order references missing artwork ${id}.`, 3);
      const prepared = resources.artworks[id];
      const versions = prepared?.versions ?? {};
      const active = prepared ? versions[prepared.activeVersion] : undefined;
      const pairingReviewed = currentReview(data, id, 'photo-pairing');
      const candidate = artwork.originalPhoto.value;
      const showPhoto = pairingReviewed && candidate !== null
        && artwork.originalPhoto.confidence !== 'unidentified' && Boolean(resources.photos[candidate]);
      const locationReviewed = currentReview(data, id, 'location');
      return {
        id: artwork.id, bookNumber: artwork.bookNumber, title: artwork.title,
        description: artwork.publicDescription, available: Boolean(active),
        availabilityMessage: active ? null : 'This coloring page is not ready yet.',
        originalPhotoId: showPhoto ? candidate : null,
        originalPhotoConfidence: showPhoto ? artwork.originalPhoto.confidence : null,
        pairingReviewState: pairingReviewed ? 'complete' : 'pending',
        location: { value: locationReviewed ? artwork.location.value : null, confidence: locationReviewed ? artwork.location.confidence : 'unidentified', reviewState: locationReviewed ? 'complete' : 'pending' },
        citations: publicCitations(data, artwork.citations),
        activeVersion: active ? prepared!.activeVersion : null,
        versions,
        reviewState: active?.reviewState ?? 'pending',
      };
    }),
  };
  for (const artwork of catalog.artworks) {
    if (artwork.available && artwork.originalPhotoId) {
      catalog.photos.find(photo => photo.id === artwork.originalPhotoId)!.relatedArtworkIds.push(artwork.id);
    }
  }
  return DevelopmentCatalogSchema.parse(catalog);
}

export async function buildDevelopmentCatalog(root = PROJECT_ROOT, mode: 'development' | 'release' = 'development'): Promise<DevelopmentCatalog> {
  return withOperationLock(root, 'catalog', async () => {
    const result = await validateCatalog({ root });
    if (!result.ok || !result.data) {
      throw new CliError('E_CATALOG_INVALID', `Catalog inputs have ${result.issues.length} issue(s). Run npm run validate -- --stage catalog.`, 3, result.issues);
    }
    const validated = await validateAssets({ root, data: result.data, allowPartial: true });
    if (!validated.ok || !validated.registry) {
      throw new CliError('E_CATALOG_ASSETS', 'Prepared material is invalid or stale. Run npm run validate -- --stage assets for details.', 4, validated.issues);
    }
    const resources: CatalogResources = { artworks: {}, photos: validated.photos };
    const updates: FileUpdate[] = [];
    for (const [id, prepared] of Object.entries(validated.artworks)) {
      const publicVersions: Record<string, PublicPreparedVersion> = {};
      for (const [version, preparedVersion] of Object.entries(prepared.versions)) {
        const entry = validated.registry.artworks[id]!.versions[version]!;
        const pkg = preparedVersion.package;
        const metadata: AccessibilityMetadata = preparedVersion.accessibility ?? {
          schemaVersion: 1, artworkId: id, contentVersion: version,
          regions: preparedVersion.regions.map((region, index) => ({ id: region.id, name: `Area ${region.id}`, order: index + 1 })),
        };
        const metadataDigest = computeKeyboardMetadataDigest(metadata);
        const metadataBytes = jsonBytes(metadata);
        const metadataPath = `public/accessibility/${id}/${version}/${metadataDigest}.json`;
        updates.push({ path: metadataPath, bytes: metadataBytes });
        const draft = !preparedVersion.accessibility || metadata.regions.some(region => /^area\s+\d+$/iu.test(region.name.trim()));
        const reviewed = !draft && hasCurrentSegmentationReview(result.data.reviews, id, version, metadataDigest);
        const packageDirectory = path.posix.dirname(entry.package.path);
        publicVersions[version] = {
          contentVersion: version,
          package: publicReceipt(entry.package),
          canonical: publicReceipt({ ...pkg.canonical, path: path.posix.join(packageDirectory, pkg.canonical.path) }),
          accessibility: publicReceipt({ path: metadataPath, bytes: metadataBytes.length, sha256: sha256Bytes(metadataBytes) }),
          keyboardNamesDraft: draft,
          width: pkg.width, height: pkg.height, regionCount: pkg.regionCount,
          reviewState: reviewed ? 'complete' : 'pending',
        };
      }
      resources.artworks[id] = { activeVersion: prepared.activeVersion, versions: publicVersions };
    }
    const catalog = projectDevelopmentCatalog(result.data, resources);
    let hasHistory=false;
    try{await access(path.join(root,'content/history-introduction.json'));hasHistory=true;}
    catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
    if(hasHistory){
      const history=z.object({schemaVersion:z.literal(1),paragraphs:z.array(NonEmptyTextSchema).min(1),sources:z.array(EvidenceRefSchema).min(1)}).strict()
        .parse(JSON.parse(await readFile(await assertRegularProjectFile('content/history-introduction.json',root),'utf8')));
      if(history.sources.some(ref=>!result.data!.sources.some(source=>source.id===ref.sourceId)))throw new Error('History introduction references an unknown source.');
      catalog.history={paragraphs:history.paragraphs,citations:publicCitations(result.data,history.sources)};
    }
    const printIds:string[]=[];
    for(const artwork of catalog.artworks){
      try{await access(path.join(root,`generated/print-${artwork.id}.json`));printIds.push(artwork.id);}
      catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
    }
    if(printIds.length){
      const context=await printContextFromValidated(root,result.data,validated.registry);
      let hasBook=false;
      try{await access(path.join(root,'public/downloads/book-manifest.json'));hasBook=true;}
      catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
      const sheets=hasBook?(await validatePrintCollection(root,context)).sheets
        :await Promise.all(printIds.map(id=>validatePrint(root,id,context)));
      for(const receipt of sheets){
        const artwork=catalog.artworks.find(item=>item.id===receipt.artworkId);
        if(artwork)artwork.printable=receipt.file;
      }
      if(hasBook){
        const bytes=await readFile(path.join(root,'public/downloads/book-manifest.json'));
        const manifest=JSON.parse(bytes.toString('utf8'));
        catalog.book={file:manifest.file,manifest:{path:'downloads/book-manifest.json',bytes:bytes.length,sha256:sha256Bytes(bytes)},
          totalPages:manifest.totalPages,coloringPages:48};
      }
    }
    catalog.mode = mode;
    if (mode === 'release') {
      if (process.env.GITHUB_REPOSITORY && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(process.env.GITHUB_REPOSITORY))
        catalog.repositoryUrl = `https://github.com/${process.env.GITHUB_REPOSITORY}`;
      const { assertReleaseReady } = await import('./lib/release.js');
      await assertReleaseReady(root, result, validated);
    }
    updates.push({ path: mode === 'release' ? 'public/catalog.json' : 'public/catalog.dev.json', bytes: jsonBytes(catalog) });
    await promoteBatch(root, 'catalog', updates);
    return catalog;
  });
}

if (isMain(import.meta.url)) {
  await runCli({ operation: 'catalog' }, async report => {
    const args = parseNamedArgs(process.argv.slice(2), { mode: 'value', help: 'boolean' });
    if (args.help) {
      console.log('Usage: npm run catalog -- --mode development|release');
      return;
    }
    const mode = args.mode ?? 'development';
    if (mode !== 'development' && mode !== 'release') throw new CliError('E_ARGUMENT', '--mode must be development or release.', 2);
    report.scope = mode;
    const catalog = await buildDevelopmentCatalog(PROJECT_ROOT, mode);
    report.inputs.push('source/manifest.json', 'project.json', 'content', 'generated/assets.json');
    report.outputs.push(mode === 'release' ? 'public/catalog.json' : 'public/catalog.dev.json');
    report.digests.sourceSnapshot = catalog.sourceSnapshotDigest;
    report.summary = { mode, photos: catalog.photos.length, artworks: catalog.artworks.length, availableArtworks: catalog.artworks.filter(artwork => artwork.available).length };
  });
}
