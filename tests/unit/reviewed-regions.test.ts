import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { decodeCanonical, decodeBinaryMask } from '../../scripts/lib/algorithms/gray-v1.js';
import { segmentRegions, compositeRgba } from '../../scripts/lib/algorithms/regions-v1.js';
import { SHOULDER_BRIDGE } from '../../scripts/repair-monkey-shoulder.js';

describe('reviewed coloring topology', () => {
  it('connects the creature lip and eye while keeping teeth and mouth independent', async () => {
    const image=await decodeCanonical(await readFile('source/coloring/009.png'));
    const load=async(name:string)=>decodeBinaryMask(await readFile(`content/segmentation/design-009/${name}.png`),image.width,image.height);
    const before=segmentRegions(image,{inkThreshold:180,excludedSeedPoints:[[0,0]]});
    const after=segmentRegions(image,{inkThreshold:180,excludedSeedPoints:[[0,0]],barrierAddMask:await load('barrier-add'),barrierRemoveMask:await load('barrier-remove')});
    const owner=(id:number)=>{const r=before.regions[id-1]!;return after.hitLabels[r.seed[1]*image.width+r.seed[0]]!;};
    expect(new Set([102,104,105,109,111,113,116,119,120,121,122,123,124,128].map(owner))).toEqual(new Set([owner(116)]));
    expect(new Set([107,110,112,115,117].map(owner))).toEqual(new Set([owner(107)]));
    const distinct=[100,101,106,108,114,118,125,130,131,132,134,107,116].map(owner);
    expect(new Set(distinct).size).toBe(distinct.length);expect(distinct.every(Boolean)).toBe(true);
    for(const id of [25,27,28,37,53,58])expect(owner(id)).toBeGreaterThan(0);
    expect(after.inkAlpha).toEqual(before.inkAlpha);
    expect(Buffer.from(compositeRgba(image.width,image.height,after.paintLabels,after.inkAlpha,new Map())))
      .toEqual(Buffer.from(compositeRgba(image.width,image.height,before.paintLabels,before.inkAlpha,new Map())));
    const old='9a565b7e4b846201cfa73b88ecd84b6a98cb6644a86a39c0dcd1f84060bbdb49';
    expect(JSON.parse(await readFile(`public/art/design-009/${old}/package.json`,'utf8')).contentVersion).toBe(old);
  });
  it('reconnects shaft and fold fragments without merging the separate shapes', async () => {
    const image=await decodeCanonical(await readFile('source/coloring/007.png'));
    const load=async(name:string)=>decodeBinaryMask(await readFile(`content/segmentation/design-007/${name}.png`),image.width,image.height);
    const before=segmentRegions(image,{inkThreshold:180,excludedSeedPoints:[[0,0]]});
    const after=segmentRegions(image,{inkThreshold:180,excludedSeedPoints:[[0,0]],barrierAddMask:await load('barrier-add'),barrierRemoveMask:await load('barrier-remove')});
    const owners=(ids:number[])=>new Set(before.regions.filter(r=>ids.includes(r.id)).map(r=>after.hitLabels[r.seed[1]*image.width+r.seed[0]]));
    const shaft=owners([33,34,36,37,38,39,40]), fold=owners([80,81,82,83,84,85]);
    expect(shaft.size).toBe(1);expect(fold.size).toBe(1);
    expect(shaft.has(0)).toBe(false);expect(fold.has(0)).toBe(false);
    expect([...shaft][0]).not.toBe([...fold][0]);
    expect(after.regions).toHaveLength(76);
    expect(after.inkAlpha).toEqual(before.inkAlpha);
    expect(Buffer.from(compositeRgba(image.width,image.height,after.paintLabels,after.inkAlpha,new Map())))
      .toEqual(Buffer.from(compositeRgba(image.width,image.height,before.paintLabels,before.inkAlpha,new Map())));
    // A fill of the shaft must not also color the adjacent closed fold.
    const shaftId=[...shaft][0]!,foldRegion=after.regions.find(r=>r.id===[...fold][0])!;
    const index=(foldRegion.seed[1]*image.width+foldRegion.seed[0])*4;
    const colored=compositeRgba(image.width,image.height,after.paintLabels,after.inkAlpha,new Map([[shaftId,[200,0,0] as [number,number,number]]]));
    const blank=compositeRgba(image.width,image.height,after.paintLabels,after.inkAlpha,new Map());
    expect(Array.from(colored.slice(index,index+4))).toEqual(Array.from(blank.slice(index,index+4)));
  });
  it('isolates the monkey body without changing the visible source drawing', async () => {
    const image = await decodeCanonical(await readFile('source/coloring/005.png'));
    const mask = await decodeBinaryMask(await readFile('content/segmentation/design-005/barrier-add.png'), image.width, image.height);
    const after = segmentRegions(image, { inkThreshold: 180, excludedSeedPoints: [[0,0]], barrierAddMask: mask });
    const old = new Uint8Array(await readFile('generated/recipes/design-005/7a6fc27f97b9e47489f0ecf22449ab31d3f8b1df2ae6ddf0de252ca668cc265e/add.bin'));
    const before = segmentRegions(image, { inkThreshold: 180, excludedSeedPoints: [[0,0]], barrierAddMask: old });
    const body = 475*image.width+280, background = 470*image.width+150;
    expect(before.hitLabels[body]).toBe(before.hitLabels[background]);
    expect(after.hitLabels[body]).toBeGreaterThan(0);
    expect(after.hitLabels[background]).toBeGreaterThan(0);
    expect(after.hitLabels[body]).not.toBe(after.hitLabels[background]);
    expect(after.regions).toHaveLength(112);
    expect(after.inkAlpha).toEqual(before.inkAlpha);
    expect(Buffer.from(compositeRgba(image.width,image.height,after.paintLabels,after.inkAlpha,new Map())))
      .toEqual(Buffer.from(compositeRgba(image.width,image.height,before.paintLabels,before.inkAlpha,new Map())));
    const colored = compositeRgba(image.width,image.height,after.paintLabels,after.inkAlpha,new Map([[after.hitLabels[body]!,[0,100,200] as [number,number,number]]]));
    expect(Array.from(colored.slice(body*4,body*4+3))).toEqual([0,100,200]);
    const blank=compositeRgba(image.width,image.height,after.paintLabels,after.inkAlpha,new Map());
    // The source background is slightly gray here; preserving it means matching
    // the original blank composition, not forcing every unfilled pixel to 255.
    expect(Array.from(colored.slice(background*4,background*4+4))).toEqual(Array.from(blank.slice(background*4,background*4+4)));
    expect(SHOULDER_BRIDGE.every(([x,y])=>mask[y*image.width+x]===255)).toBe(true);
  });
  it.each([
    { id: '003', count: 66, tips: [[351,672],[352,673],[776,804],[408,856],[360,909],[698,920],[481,1157],[221,1176],[310,1323],[309,1324]], details: [[597,826]], oldVersion: '21bc98c4b5c660497231765a8b53303711f0aec53739d68ae4a90b61ba7b6b54' },
    { id: '004', count: 112, tips: [[618,58],[452,103],[194,244]], details: [[518,250],[677,520],[380,177],[455,208]], oldVersion: '2883438d6f3368f14ff2dbaf8b17aae5b99635929a4d3a7d84d2c4572b1054bc' },
    { id: '006', count: 74, tips: [[364,119],[604,230],[504,1368]], details: [[284,966],[179,969],[182,978],[725,1048],[108,1089]], oldVersion: '0eb9a36e8c5bcdae211cfd752e40c702235a27c5c0ae4f1891aae60556c20e53' },
    { id: '008', count: 49, tips: [[722,215],[408,259],[244,745]], details: [[100,930],[118,972],[293,973],[281,993],[205,1114]], oldVersion: '3a467c04b9ba9eabca57ace71536072cdec067e61b34b0be9eb90f4495ea5ac7' },
    { id: '011', count: 71, remove: true, tips: [[697,356],[232,617]], details: [[641,426],[691,443],[698,445],[213,802]], oldVersion: '6f831e8b0f9204469cc4f0313e10c72cd00ae7a5df4239acb00bb45ddd436d51' },
    { id: '012', count: 77, remove: true, tips: [[497,161],[310,1278]], details: [[63,1260],[65,1262],[74,1272],[75,1273]], oldVersion: 'a245b4b5aa6319d71b7e92d435f2661265660ac6ce5860f20b83590b257f4625' },
  ])('keeps real enclosed details and source appearance for design-$id', async ({ id, count, tips, details, oldVersion, remove }) => {
    const image = await decodeCanonical(await readFile(`source/coloring/${id}.png`));
    const config=JSON.parse(await readFile(`content/segmentation/design-${id}/config.json`,'utf8'));
    const before = segmentRegions(image, { inkThreshold: 180, excludedSeedPoints: config.excludedSeedPoints });
    const mask = await decodeBinaryMask(await readFile(`content/segmentation/design-${id}/barrier-add.png`), image.width, image.height);
    const after = segmentRegions(image, { inkThreshold: 180, excludedSeedPoints: config.excludedSeedPoints, barrierAddMask: mask,
      ...(remove?{barrierRemoveMask:await decodeBinaryMask(await readFile(`content/segmentation/design-${id}/barrier-remove.png`),image.width,image.height)}:{}) });
    expect(after.regions).toHaveLength(count);
    for (const [x,y] of tips) {
      expect(before.hitLabels[y!*image.width+x!]!).toBeGreaterThan(0);
      expect(after.hitLabels[y!*image.width+x!]).toBe(0);
    }
    for (const [x,y] of details) expect(after.hitLabels[y!*image.width+x!]!).toBeGreaterThan(0);
    expect(after.inkAlpha).toEqual(before.inkAlpha);
    expect(Buffer.from(compositeRgba(image.width, image.height, after.paintLabels, after.inkAlpha, new Map())))
      .toEqual(Buffer.from(compositeRgba(image.width, image.height, before.paintLabels, before.inkAlpha, new Map())));
    // Old local saves must still have their exact immutable geometry and recipe.
    const oldPackage = JSON.parse(await readFile(`public/art/design-${id}/${oldVersion}/package.json`, 'utf8'));
    expect(oldPackage.contentVersion).toBe(oldVersion);
    const oldRecipe = JSON.parse(await readFile(`generated/recipes/design-${id}/${oldVersion}/recipe.json`, 'utf8'));
    expect(oldRecipe.contentVersion).toBe(oldVersion);
  });
});
