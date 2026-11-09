import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { z } from 'zod';
import { withOperationLock, promoteBatch } from './lib/atomic-files.js';
import { PROJECT_ROOT, assertRegularProjectFile } from './lib/paths.js';
import { jsonBytes } from './lib/digests.js';
import { isMain, parseNamedArgs, runCli } from './lib/cli.js';
import type { RegionGeometry } from '../src/shared/assets.js';
import { decodeCanonical } from './lib/algorithms/gray-v1.js';
import { segmentRegions } from './lib/algorithms/regions-v1.js';
import { connectReviewedBands } from './lib/review-connections.js';

/** Applies explicit visual-review decisions. This never writes review receipts.
 * Repeated shapes get position + within-feature numbering, not generic Area IDs.
 * Inspect the resulting overlay and names before record-region-review is run.
 */
const ids=(text:string)=>text.split(',').flatMap(part=>{
  if(!/^\d+(-\d+)?$/.test(part.trim()))throw new Error('Invalid authored ID range.');
  const [a,b]=part.trim().split('-').map(Number);if(!a||(b!==undefined&&b<a))throw new Error('Invalid range.');
  return Array.from({length:(b??a)-a+1},(_,i)=>a+i);
});
if(isMain(import.meta.url))await runCli({operation:'region-review-plan'},async report=>{
  const args=parseNamedArgs(process.argv.slice(2),{id:'value',masks:'boolean',names:'boolean',revise:'boolean'});
  if(typeof args.id!=='string'||!/^design-\d{3}$/.test(args.id)||!!args.masks===!!args.names)throw new Error('Use --id design-NNN and exactly one of --masks or --names.');
  const id=args.id;
  await withOperationLock(PROJECT_ROOT,'region-review-plan',async()=>{
    const plan=z.object({schemaVersion:z.literal(1),artworkId:z.literal(id),sourceVersion:z.string().regex(/^[a-f0-9]{64}$/),
      observations:z.string().min(100),evidence:z.array(z.string()).min(2),tips:z.string(),joins:z.array(z.string()).default([]),
      groups:z.array(z.object({name:z.string().min(5),ids:z.string()})).min(1)}).strict()
      .parse(JSON.parse(await readFile(await assertRegularProjectFile(`docs/region-reviews/plans/${id}.json`,PROJECT_ROOT),'utf8')));
    const directory=`public/art/${id}/${plan.sourceVersion}`;
    const regions=(JSON.parse(await readFile(await assertRegularProjectFile(`${directory}/regions.json`,PROJECT_ROOT),'utf8')).regions) as RegionGeometry[];
    const pkg=JSON.parse(await readFile(await assertRegularProjectFile(`${directory}/package.json`,PROJECT_ROOT),'utf8'));
    const tips=new Set(plan.tips?ids(plan.tips):[]);
    const groups=plan.groups.map(g=>({...g,members:ids(g.ids).filter(id=>!tips.has(id))}));
    const members=groups.flatMap(g=>g.members);
    if(new Set(members).size!==members.length||members.some(n=>!regions[n-1]||tips.has(n))
      ||tips.size+members.length!==regions.length||[...tips].some(n=>!regions[n-1]))throw new Error('Every inspected region must be assigned once to a feature or explicit tip exclusion.');
    for(const p of plan.evidence)await assertRegularProjectFile(p,PROJECT_ROOT);
    const originalHit=await readFile(await assertRegularProjectFile(`${directory}/hit.bin`,PROJECT_ROOT));
    // Package raw maps are gzip encoded; the frozen recipe contains plain bytes.
    const {gunzipSync}=await import('node:zlib');const hit=gunzipSync(originalHit);
    if(args.masks){
      const configPath=`content/segmentation/${id}/config.json`;
      const config=JSON.parse(await readFile(await assertRegularProjectFile(configPath,PROJECT_ROOT),'utf8'));
      if(config.barrierAddMask||config.barrierRemoveMask){
        if(!args.revise||typeof config.notes!=='string'||!config.notes.includes('Explicit inspected tip IDs: '))
          throw new Error('Existing authored masks require an explicit revision of a previous review plan.');
        // Frozen recipes/packages preserve previous masks. Recompute the entire
        // authored plan from its retained source version, never compound masks.
        delete config.barrierAddMask;delete config.barrierRemoveMask;
      }
      const mask=new Uint8Array(pkg.width*pkg.height);
      for(let i=0;i<mask.length;i++)if(tips.has(hit.readUInt32LE(i*4)))mask[i]=255;
      const source=await decodeCanonical(await readFile(await assertRegularProjectFile(`source/coloring/${id.slice(-3)}.png`,PROJECT_ROOT)));
      const labels=new Uint32Array(mask.length);for(let i=0;i<labels.length;i++)labels[i]=hit.readUInt32LE(i*4);
      const joins=plan.joins.map(ids);
      const remove=connectReviewedBands(pkg.width,pkg.height,source.pixels,labels,joins);
      const after=segmentRegions(source,{inkThreshold:config.inkThreshold,excludedSeedPoints:config.excludedSeedPoints,barrierAddMask:mask,barrierRemoveMask:remove});
      const owners=new Set<number>();
      for(const group of joins){
        const mapped=new Set(group.map(old=>{const r=regions[old-1]!;return after.hitLabels[r.seed[1]*pkg.width+r.seed[0]]!;}));
        if(mapped.size!==1||mapped.has(0)||owners.has([...mapped][0]!))throw new Error('Reviewed bands did not stay distinct.');
        owners.add([...mapped][0]!);
      }
      for(const r of regions.filter(r=>!tips.has(r.id)&&!joins.some(g=>g.includes(r.id)))){
        const owner=after.hitLabels[r.seed[1]*pkg.width+r.seed[0]]!;
        if(!owner||owners.has(owner))throw new Error('Unrelated pane lost or merged.');owners.add(owner);
      }
      if(after.regions.length!==regions.length-tips.size-joins.reduce((sum,g)=>sum+g.length-1,0))throw new Error('Unexpected correction topology.');
      config.barrierAddMask='barrier-add.png';config.notes=plan.observations+' Explicit inspected tip IDs: '+[...tips].join(',')+'. Source/canonical drawing unchanged.';
      const bytes=await sharp(mask,{raw:{width:pkg.width,height:pkg.height,channels:1}}).png().toBuffer();
      const updates=[{path:`content/segmentation/${id}/barrier-add.png`,bytes}];
      if(joins.length){config.barrierRemoveMask='barrier-remove.png';updates.push({path:`content/segmentation/${id}/barrier-remove.png`,bytes:await sharp(remove,{raw:{width:pkg.width,height:pkg.height,channels:1}}).png().toBuffer()});}
      await promoteBatch(PROJECT_ROOT,'region-review-plan',[
        ...updates,{path:configPath,bytes:jsonBytes(config)},
      ]);
      report.summary={artworkId:id,explicitTipComponents:tips.size,reviewRecorded:false};return;
    }
    const registry=JSON.parse(await readFile(await assertRegularProjectFile('generated/assets.json',PROJECT_ROOT),'utf8'));
    const active=registry.artworks[id].activeVersion;
    const activeHit=gunzipSync(await readFile(await assertRegularProjectFile(`public/art/${id}/${active}/hit.bin`,PROJECT_ROOT)));
    const activeRegions=(JSON.parse(await readFile(await assertRegularProjectFile(`public/art/${id}/${active}/regions.json`,PROJECT_ROOT),'utf8')).regions) as RegionGeometry[];
    const names:string[]=[],navigationIds:number[]=[];
    for(const group of groups){
      const mapped=group.members.map(old=>{const r=regions[old-1]!;return {r,id:activeHit.readUInt32LE((r.seed[1]*pkg.width+r.seed[0])*4)};});
      const rows=mapped.filter((r,i)=>mapped.findIndex(x=>x.id===r.id)===i);
      rows.sort((a,b)=>a.r.centroid[1]-b.r.centroid[1]||a.r.centroid[0]-b.r.centroid[0]);
      rows.forEach(({r,id:regionId},index)=>{
        if(!regionId||names[regionId-1])throw new Error('Reviewed feature merged or disappeared.');
        const x=r.centroid[0]/pkg.width,y=r.centroid[1]/pkg.height;
        const vertical=y<.25?'top':y<.5?'upper-middle':y<.75?'lower-middle':'bottom';
        const horizontal=x<.33?'left':x>.67?'right':'center';
        names[regionId-1]=group.name+(rows.length>1?`, ${vertical} ${horizontal} section ${index+1}`:'');
        navigationIds.push(regionId);
      });
    }
    if(names.length!==activeRegions.length||activeRegions.some(r=>!names[r.id-1]))throw new Error('Active regions not fully covered.');
    const review={schemaVersion:1,artworkId:id,contentVersion:active,
      reviewer:'Codex visual inspection of source, numbered regions, paired small-component crops and final fill',
      observations:plan.observations,evidence:[...plan.evidence,
        `.work/review/${id}/${active}/regions-numbered-2x.png`,`.work/review/${id}/${active}/fill-sample.png`],namesById:names,navigationIds};
    await promoteBatch(PROJECT_ROOT,'region-review-plan',[{path:`docs/region-reviews/${id}.json`,bytes:jsonBytes(review)}]);
    report.summary={artworkId:id,namedRegions:names.length,reviewRecorded:false};
  });
});
