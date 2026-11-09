import { readFile } from 'node:fs/promises';
import { validateCatalog, type CatalogValidationResult } from '../validate-content.js';
import { validateAssets, type AssetValidationResult } from './validate-assets.js';
import { hasCurrentEditorialReview } from './asset-identity.js';
import { printContextFromValidated } from './printable.js';
import { validatePrintCollection } from './print-book.js';
import { assertRegularProjectFile, PROJECT_ROOT } from './paths.js';
import { assertNoPendingTransaction } from './atomic-files.js';
import { CliError } from './cli.js';

/** Release gate includes every retained package; no pending-review exception. */
export async function assertReleaseReady(root=PROJECT_ROOT, catalog?:CatalogValidationResult, assets?:AssetValidationResult) {
 await assertNoPendingTransaction(root);
 const c=catalog??await validateCatalog({root});
 if(!c.ok||!c.data)throw new CliError('E_RELEASE_CATALOG','Source/catalog validation failed.',3,c.issues);
 const data=c.data;
 if(!data.project.repositoryUrl?.match(/^https:\/\/github\.com\/[^/]+\/[^/]+\/?$/))throw new CliError('E_RELEASE_REPOSITORY','Set the actual public HTTPS repository URL in project.json.',4);
 const a=assets??await validateAssets({root,data,requireReviews:true});
 if(!a.ok||!a.registry)throw new CliError('E_RELEASE_ASSETS','Prepared packages failed validation.',3,a.issues);
 if(a.stats.validatedArtworks!==48||a.stats.validatedPhotos!==55||a.stats.pendingSegmentationReviews||a.stats.pendingPairingReviews)
  throw new CliError('E_RELEASE_REVIEWS','Every current and retained package and all media pairings need current reviews.',4);
 for(const artwork of Object.values(a.artworks))for(const version of Object.values(artwork.versions))
  if(!version.accessibility||version.accessibility.regions.some(r=>/^area\s+\d+$/i.test(r.name.trim())))
   throw new CliError('E_RELEASE_NAMES','Release packages require complete authored feature names, including restoration versions.',4);
 for(const record of [...data.artworks,...data.photos]) for(const kind of ['subject','location'] as const)
  if(!hasCurrentEditorialReview(data,record.id,kind))throw new CliError('E_RELEASE_EDITORIAL',`${record.id} needs a current ${kind} review. An honestly unidentified result is acceptable.`,4);
 const context=await printContextFromValidated(root,data,a.registry);
 const prints=await validatePrintCollection(root,context);
 const review=JSON.parse(await readFile(await assertRegularProjectFile('content/print-review.json',root),'utf8'));
 if(review.bookSha256!==prints.manifest.file.sha256||review.coverSha256!==prints.manifest.cover.sha256||review.observations?.length<100)
  throw new CliError('E_RELEASE_PRINT_REVIEW','Current book/cover require exact-hash visual review.',4);
 return {catalog:c,assets:a,prints,summary:{...c.stats,...a.stats,editorialReviews:206,individualPdfs:48,bookPages:prints.manifest.totalPages}};
}
