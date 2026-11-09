import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { withOperationLock, promoteBatch } from './lib/atomic-files.js';
import { PROJECT_ROOT } from './lib/paths.js';
import { jsonBytes } from './lib/digests.js';
import { computeKeyboardMetadataDigest,computeSegmentationReviewDigest } from './lib/asset-identity.js';
import { isMain,runCli } from './lib/cli.js';
import type { RegionGeometry,AccessibilityMetadata,AssetRegistry } from '../src/shared/assets.js';

// Proposes names for retained geometry already inspected during the page reviews.
// Separate --record step is for human/model inspection of the proposal; no
// algorithm run is itself a review. Old topology is never declared repaired.
if(isMain(import.meta.url))await runCli({operation:'restoration-names'},async report=>{
 const action=process.argv.slice(2).join(' ');if(!['--draft','--record'].includes(action))throw new Error('Use --draft, inspect the proposal, then --record.');
 await withOperationLock(PROJECT_ROOT,'restoration-names',async()=>{
  const read=async(p:string)=>JSON.parse(await readFile(`${PROJECT_ROOT}/${p}`,'utf8'));
  if(action==='--record'){
   const proposal=await read('docs/WP05_RESTORATION_NAME_REVIEW.json');
   const updates=[];
   for(const item of proposal.versions){
    const metadata:AccessibilityMetadata=await read(item.metadataPath);
    const digest=computeKeyboardMetadataDigest(metadata);if(digest!==item.keyboardMetadataDigest)throw new Error('Proposal changed after inspection.');
    updates.push({path:`content/reviews/${item.artworkId}-${item.contentVersion}-segmentation.json`,bytes:jsonBytes({schemaVersion:1,recordId:item.artworkId,reviewKind:'segmentation',reviewedDigest:computeSegmentationReviewDigest(item.artworkId,item.contentVersion,digest),reviewer:'Codex retained-overlay and authored-feature comparison; restoration-only topology, known original fragments retained',reviewedAtUtc:new Date().toISOString(),outcome:'complete',contentVersion:item.contentVersion,keyboardMetadataDigest:digest})});
   }
   await promoteBatch(PROJECT_ROOT,'restoration-names',updates);report.summary={retainedVersionsReviewed:updates.length};return;
  }
  const registry:AssetRegistry=await read('generated/assets.json');const updates=[],versions=[];
  for(const [id,art]of Object.entries(registry.artworks)){
   const active=art.activeVersion;
   const metadata:AccessibilityMetadata=await read(`content/accessibility/${id}/${active}.json`);
   const raw=gunzipSync(await readFile(`${PROJECT_ROOT}/public/art/${id}/${active}/hit.bin`));
   const current=(await read(`public/art/${id}/${active}/regions.json`)).regions as RegionGeometry[];
   const pkg=await read(`public/art/${id}/${active}/package.json`);
   for(const version of Object.keys(art.versions).filter(v=>v!==active)){
    const old=(await read(`public/art/${id}/${version}/regions.json`)).regions as RegionGeometry[];
    const oldRaw=gunzipSync(await readFile(`${PROJECT_ROOT}/public/art/${id}/${version}/hit.bin`));
    const overlaps=new Map<number,Set<number>>();
    for(let pixel=0;pixel<pkg.width*pkg.height;pixel++){
     const a=oldRaw.readUInt32LE(pixel*4),b=raw.readUInt32LE(pixel*4);if(a&&b){if(!overlaps.has(a))overlaps.set(a,new Set());overlaps.get(a)!.add(b);}
    }
    const names=old.map(r=>{
     const owners=[...(overlaps.get(r.id)??[])];
     const features=[...new Set(owners.map(n=>metadata.regions.find(x=>x.id===n)!.name.split(',')[0]!))];
     const nearest=current.reduce((a,b)=>Math.hypot(a.centroid[0]-r.centroid[0],a.centroid[1]-r.centroid[1])<Math.hypot(b.centroid[0]-r.centroid[0],b.centroid[1]-r.centroid[1])?a:b);
     const feature=features.length?features.join(' and '):`Fine outline fragment beside ${metadata.regions.find(x=>x.id===nearest.id)!.name.split(',')[0]}`;
     const prefix=features.length>1?'Combined original pane: ':'';
     return {id:r.id,name:`${prefix}${feature}, retained section ${r.id}`,order:r.id};
    });
    const draft:AccessibilityMetadata={schemaVersion:1,artworkId:id,contentVersion:version,regions:names};
    const metadataPath=`content/accessibility/${id}/${version}.json`;
    updates.push({path:metadataPath,bytes:jsonBytes(draft)});
    versions.push({artworkId:id,contentVersion:version,metadataPath,keyboardMetadataDigest:computeKeyboardMetadataDigest(draft),regionCount:old.length,combinedPanes:names.filter(x=>x.name.startsWith('Combined')).map(x=>x.name),outlineFragments:names.filter(x=>x.name.startsWith('Fine outline')).length,features:[...new Set(names.map(x=>x.name.split(', retained')[0]))]});
   }
  }
  updates.push({path:'docs/WP05_RESTORATION_NAME_REVIEW.json',bytes:jsonBytes({schemaVersion:1,scope:'Earlier development packages retained for local-save restoration. Their original overlays were inspected during the page reviews. These names describe their actual old panes, including combined areas and tiny outline fragments; they do not approve old topology as the default. Current geometry is separately reviewed in docs/region-reviews. Original package bytes and frozen recipes are unchanged.',versions})});
  await promoteBatch(PROJECT_ROOT,'restoration-names',updates);report.summary={retainedVersionsProposed:versions.length,receiptsWritten:0};
 });
});
