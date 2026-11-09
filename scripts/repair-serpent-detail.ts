import { readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';
import { decodeCanonical } from './lib/algorithms/gray-v1.js';
import { segmentRegions } from './lib/algorithms/regions-v1.js';
import { withOperationLock, promoteBatch } from './lib/atomic-files.js';
import { PROJECT_ROOT, assertRegularProjectFile, assertSafeProjectPath } from './lib/paths.js';
import { jsonBytes } from './lib/digests.js';
import { isMain, parseNamedArgs, runCli } from './lib/cli.js';

// Authored after source/overlay comparison at 6x. The narrow upper lip and
// outer eye crescent are continuous bands; teeth, pupil and tongue are distinct.
const GROUPS=[new Set([102,104,105,109,111,113,116,119,120,121,122,123,124,128]),new Set([107,110,112,115,117])];
const TIPS=new Set([22,31,33,34,35,38,41,42,48,49,50,54,60,63,66,67,70,73,77,79,88,98,103,129,133,144,146,147,153,154,163,164,167]);
if(isMain(import.meta.url))await runCli({operation:'repair-serpent-detail'},async report=>{
  const apply=!!parseNamedArgs(process.argv.slice(2),{apply:'boolean'}).apply;
  await withOperationLock(PROJECT_ROOT,'repair-serpent-detail',async()=>{
    const image=await decodeCanonical(await readFile(await assertRegularProjectFile('source/coloring/009.png',PROJECT_ROOT)));
    const before=segmentRegions(image,{inkThreshold:180,excludedSeedPoints:[[0,0]]});
    if(before.regions.length!==167)throw new Error('Inspected source changed.');
    const add=new Uint8Array(image.pixels.length),remove=new Uint8Array(image.pixels.length);
    for(let i=0;i<add.length;i++)if(TIPS.has(before.hitLabels[i]!))add[i]=255;
    const neighbors=(i:number)=>[i-image.width,i+image.width,...(i%image.width?[i-1]:[]),...(i%image.width<image.width-1?[i+1]:[])].filter(n=>n>=0&&n<add.length);
    for(const group of GROUPS){
      const regions=before.regions.filter(r=>group.has(r.id));
      const bounds={left:Math.min(...regions.map(r=>r.bbox.x))-2,right:Math.max(...regions.map(r=>r.bbox.x+r.bbox.width))+2,
        top:Math.min(...regions.map(r=>r.bbox.y))-2,bottom:Math.max(...regions.map(r=>r.bbox.y+r.bbox.height))+2};
      const reached=new Set([regions[0]!.id]);
      while(reached.size<group.size){
        const distances=new Map<number,number>(),parents=new Map<number,number>();
        const queue:{index:number;cost:number}[]=[];
        for(let i=0;i<add.length;i++)if(reached.has(before.hitLabels[i]!)||remove[i]){distances.set(i,0);queue.push({index:i,cost:0});}
        let end:number|undefined;
        while(queue.length){
          queue.sort((a,b)=>b.cost-a.cost);const {index,cost}=queue.pop()!;
          if(cost!==distances.get(index))continue;
          const label=before.hitLabels[index]!;
          if(group.has(label)&&!reached.has(label)){end=index;break;}
          for(const n of neighbors(index)){
            const x=n%image.width,y=Math.floor(n/image.width),owner=before.hitLabels[n]!;
            if(x<bounds.left||x>bounds.right||y<bounds.top||y>bounds.bottom||owner&&!group.has(owner))continue;
            if(!owner&&neighbors(n).some(k=>before.hitLabels[k]!==0&&!group.has(before.hitLabels[k]!)))continue;
            const next=cost+(owner||remove[n]?0:1+((255-image.pixels[n]!)/32)**2);
            if(next<(distances.get(n)??Infinity)){distances.set(n,next);parents.set(n,index);queue.push({index:n,cost:next});}
          }
        }
        if(end===undefined)throw new Error('No interior-only path for group '+[...group]+'; reached '+[...reached]);
        reached.add(before.hitLabels[end]!);
        while(parents.has(end)){if(!before.hitLabels[end])remove[end]=255;end=parents.get(end)!;}
      }
    }
    const after=segmentRegions(image,{inkThreshold:180,excludedSeedPoints:[[0,0]],barrierAddMask:add,barrierRemoveMask:remove});
    const owners=new Set<number>();
    for(const group of GROUPS){
      const mapped=new Set(before.regions.filter(r=>group.has(r.id)).map(r=>after.hitLabels[r.seed[1]*image.width+r.seed[0]]!));
      if(mapped.size!==1||mapped.has(0)||owners.has([...mapped][0]!))throw new Error('Bands did not remain distinct and connected.');
      owners.add([...mapped][0]!);
    }
    for(const r of before.regions.filter(r=>!TIPS.has(r.id)&&!GROUPS.some(g=>g.has(r.id)))){
      const owner=after.hitLabels[r.seed[1]*image.width+r.seed[0]]!;
      if(!owner||owners.has(owner))throw new Error('Unrelated pane lost or merged.');owners.add(owner);
    }
    if(after.regions.length!==117)throw new Error('Unexpected topology '+after.regions.length);
    const points=Array.from(remove.entries()).filter(([,v])=>v).map(([i])=>[i%image.width,Math.floor(i/image.width)]);
    report.summary={regions:after.regions.length,maskedTips:TIPS.size,bridgePixels:points,applied:apply};
    const png=(v:Uint8Array)=>sharp(v,{raw:{width:image.width,height:image.height,channels:1}}).png().toBuffer();
    const maskPreview=await png(remove);
    await writeFile(await assertSafeProjectPath('.work/region-crops/design-009/bridge-mask.png',PROJECT_ROOT,{allowMissing:true}),maskPreview);
    const marked=Buffer.alloc(image.pixels.length*4);
    for(let i=0;i<remove.length;i++){marked[i*4]=255;marked[i*4+3]=remove[i]?220:0;}
    const annotated=await sharp(await readFile(await assertRegularProjectFile('source/coloring/009.png',PROJECT_ROOT)))
      .composite([{input:marked,raw:{width:image.width,height:image.height,channels:4}}]).png().toBuffer();
    await sharp(annotated).extract({left:440,top:910,width:245,height:140}).resize(1470,840,{kernel:'nearest'}).png()
      .toFile(await assertSafeProjectPath('.work/region-crops/design-009/bridge-overlay-6x.png',PROJECT_ROOT,{allowMissing:true}));
    if(!apply)return;
    const configPath='content/segmentation/design-009/config.json';
    const config=JSON.parse(await readFile(await assertRegularProjectFile(configPath,PROJECT_ROOT),'utf8'));
    config.barrierAddMask='barrier-add.png';config.barrierRemoveMask='barrier-remove.png';
    config.notes='Source and overlay inspected at 6x and all five small-component sheets reviewed. Explicit IDs in scripts/repair-serpent-detail.ts. Thirty-three isolated acute tips masked, six enclosed tree dot centers retained. Upper lip and eye crescent independently connected by brightest interior-only paths; foreign-pane adjacency prohibited and all unrelated panes verified one-to-one. Four teeth, pupil, tongue and mouth remain distinct. Original/canonical drawing unchanged; earlier package retained. Bridge pixels: '+JSON.stringify(points);
    await promoteBatch(PROJECT_ROOT,'repair-serpent-detail',[
      {path:'content/segmentation/design-009/barrier-add.png',bytes:await png(add)},
      {path:'content/segmentation/design-009/barrier-remove.png',bytes:maskPreview},{path:configPath,bytes:jsonBytes(config)},
    ]);
  });
});
