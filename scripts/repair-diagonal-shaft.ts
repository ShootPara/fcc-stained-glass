import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { decodeCanonical } from './lib/algorithms/gray-v1.js';
import { segmentRegions } from './lib/algorithms/regions-v1.js';
import { withOperationLock, promoteBatch } from './lib/atomic-files.js';
import { PROJECT_ROOT, assertRegularProjectFile } from './lib/paths.js';
import { jsonBytes } from './lib/digests.js';
import { isMain, parseNamedArgs, runCli } from './lib/cli.js';

// Authored after comparing every small component with source at 4x. These are
// interior fragments along the shaft and a SEPARATE thin shirt fold beneath it.
// The 8x shaft-and-fold crop confirms the two shapes must never be joined.
const SHAFT_IDS = new Set([33,34,36,37,38,39,40]);
const FOLD_IDS = new Set([80,81,82,83,84,85]);
const TARGET_IDS = new Set([...SHAFT_IDS,...FOLD_IDS]);
const TIP_IDS = new Set([15,16,17,22,23,24,25,26,27,29,30,31,51,52,55,62,65,69,71,77,78,79,86,88,89,101]);
if (isMain(import.meta.url)) await runCli({ operation: 'repair-diagonal-shaft' }, async report => {
  const apply = parseNamedArgs(process.argv.slice(2), { apply: 'boolean' }).apply;
  await withOperationLock(PROJECT_ROOT, 'repair-diagonal-shaft', async () => {
    const image = await decodeCanonical(await readFile(await assertRegularProjectFile('source/coloring/007.png', PROJECT_ROOT)));
    const before = segmentRegions(image, { inkThreshold: 180, excludedSeedPoints: [[0,0]] });
    if (before.regions.length !== 113) throw new Error('Source no longer matches the inspected version.');
    const add = new Uint8Array(image.pixels.length), remove = new Uint8Array(image.pixels.length);
    const bridges = new Set<number>();
    for (let i=0;i<add.length;i++) {
      if (TIP_IDS.has(before.hitLabels[i]!)) add[i]=255;
      if (!TARGET_IDS.has(before.hitLabels[i]!)) continue;
      const group=SHAFT_IDS.has(before.hitLabels[i]!)?SHAFT_IDS:FOLD_IDS;
      const x=i%image.width,y=Math.floor(i/image.width);
      for (const dx of [-1,1]) {
        if (x+dx<0 || x+dx>=image.width || y+1>=image.height) continue;
        const j=i+image.width+dx;
        if (!group.has(before.hitLabels[j]!) || before.hitLabels[i]===before.hitLabels[j]) continue;
        // Only fill a staircase corner between two reviewed shaft components.
        // Refuse any pixel adjacent to another pane; never bridge across it.
        const candidates=[i+dx,i+image.width].filter(k => [k-1,k+1,k-image.width,k+image.width]
          .every(n=>before.hitLabels[n]===0 || group.has(before.hitLabels[n]!)));
        candidates.sort((a,b)=>image.pixels[b]!-image.pixels[a]! || a-b);
        if (!candidates.length) throw new Error('A proposed connection touches an unrelated pane.');
        bridges.add(candidates[0]!);
      }
    }
    for (const i of bridges) remove[i]=255;
    const after=segmentRegions(image,{inkThreshold:180,excludedSeedPoints:[[0,0]],barrierAddMask:add,barrierRemoveMask:remove});
    const shaftOwners=new Set(before.regions.filter(r=>SHAFT_IDS.has(r.id)).map(r=>after.hitLabels[r.seed[1]*image.width+r.seed[0]]));
    const foldOwners=new Set(before.regions.filter(r=>FOLD_IDS.has(r.id)).map(r=>after.hitLabels[r.seed[1]*image.width+r.seed[0]]));
    if (shaftOwners.size!==1 || shaftOwners.has(0) || foldOwners.size!==1 || foldOwners.has(0)
        || [...shaftOwners].some(owner=>foldOwners.has(owner)) || after.regions.length!==76) throw new Error('Unexpected shaft/fold topology.');
    const owners=new Set<number>();
    for (const region of before.regions.filter(r=>!TARGET_IDS.has(r.id)&&!TIP_IDS.has(r.id))) {
      const owner=after.hitLabels[region.seed[1]*image.width+region.seed[0]]!;
      if (!owner || owners.has(owner) || shaftOwners.has(owner) || foldOwners.has(owner)) throw new Error('A retained pane merged or disappeared.');
      owners.add(owner);
    }
    const points=[...bridges].sort((a,b)=>a-b).map(i=>[i%image.width,Math.floor(i/image.width)]);
    report.summary={bridgePixels:points,removedTipComponents:TIP_IDS.size,regions:after.regions.length,applied:!!apply};
    if (!apply) return;
    const configPath='content/segmentation/design-007/config.json';
    const config=JSON.parse(await readFile(await assertRegularProjectFile(configPath,PROJECT_ROOT),'utf8'));
    config.barrierAddMask='barrier-add.png';config.barrierRemoveMask='barrier-remove.png';
    config.notes='Detailed source/overlay crops inspected in .work/region-crops/design-007/small-01.png through small-04.png and shaft-and-fold.png at 8x. Explicit tip IDs recorded in scripts/repair-diagonal-shaft.ts. Seven shaft-interior components reconnected, and six components in a SEPARATE thin shirt fold reconnected only within that fold. Diagonal staircase corners use the lighter interior pixel and refuse adjacency to unrelated panes. Shaft and fold remain distinct. Twenty-six disconnected acute tips masked; tiny closed hair curl, shoulder dot center, edge pane and toe detail retained. All unrelated panes verified one-to-one; source/canonical ink unchanged. Previous package retained. Bridge pixels: '+JSON.stringify(points);
    const png=async(bytes:Uint8Array)=>sharp(bytes,{raw:{width:image.width,height:image.height,channels:1}}).png().toBuffer();
    await promoteBatch(PROJECT_ROOT,'repair-diagonal-shaft',[
      {path:'content/segmentation/design-007/barrier-add.png',bytes:await png(add)},
      {path:'content/segmentation/design-007/barrier-remove.png',bytes:await png(remove)},
      {path:configPath,bytes:jsonBytes(config)},
    ]);
  });
});
