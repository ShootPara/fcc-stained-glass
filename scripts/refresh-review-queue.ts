import { readFile, readdir } from 'node:fs/promises';
import { withOperationLock,promoteBatch } from './lib/atomic-files.js';
import { PROJECT_ROOT,assertRegularProjectFile } from './lib/paths.js';
import { jsonBytes } from './lib/digests.js';
import { computeKeyboardMetadataDigest,hasCurrentSegmentationReview } from './lib/asset-identity.js';
import { AccessibilityMetadataSchema } from '../src/shared/assets.js';
import { ReviewReceiptSchema } from '../src/shared/validation.js';
import { isMain,runCli } from './lib/cli.js';

if(isMain(import.meta.url))await runCli({operation:'review-queue'},async report=>{
  await withOperationLock(PROJECT_ROOT,'review-queue',async()=>{
    const read=async(p:string)=>JSON.parse(await readFile(await assertRegularProjectFile(p,PROJECT_ROOT),'utf8'));
    const queue=await read('docs/WP05_COLORING_REVIEW_QUEUE.json'),registry=await read('generated/assets.json');
    const reviews=await Promise.all((await readdir(`${PROJECT_ROOT}/content/reviews`)).filter(f=>f.endsWith('.json')).map(async f=>ReviewReceiptSchema.parse(await read(`content/reviews/${f}`))));
    for(const item of queue.items){
      const version=registry.artworks[item.artworkId].activeVersion;
      const pkg=await read(`public/art/${item.artworkId}/${version}/package.json`);
      const regions=(await read(`public/art/${item.artworkId}/${version}/regions.json`)).regions;
      let complete=false;
      try{
        const metadata=AccessibilityMetadataSchema.parse(await read(`content/accessibility/${item.artworkId}/${version}.json`));
        complete=hasCurrentSegmentationReview(reviews,item.artworkId,version,computeKeyboardMetadataDigest(metadata));
      }catch(error){if(!['ENOENT','E_FILE_MISSING'].includes((error as NodeJS.ErrnoException).code??''))throw error;}
      Object.assign(item,{contentVersion:version,width:pkg.width,height:pkg.height,regionCount:pkg.regionCount,
        tinyComponentCount:regions.filter((r:{pixelCount:number})=>r.pixelCount<25).length,
        status:complete?'complete':'detailed-segmentation-and-keyboard-review-pending',reviewDirectory:`.work/review/${item.artworkId}/${version}`});
    }
    queue.completed=queue.items.filter((i:{status:string})=>i.status==='complete').length;
    queue.notes='Completion is derived from exact active geometry, authored keyboard metadata and matching review receipts. Corrections preserve earlier packages and source pixels. See docs/region-reviews for authored observations and explicit plans. Preparation alone never completes a review.';
    await promoteBatch(PROJECT_ROOT,'review-queue',[{path:'docs/WP05_COLORING_REVIEW_QUEUE.json',bytes:jsonBytes(queue)}]);
    report.summary={completed:queue.completed,total:queue.total};
  });
});
