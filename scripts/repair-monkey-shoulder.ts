import { readFile } from 'node:fs/promises';
import sharp from 'sharp';
import { decodeCanonical, decodeBinaryMask } from './lib/algorithms/gray-v1.js';
import { segmentRegions } from './lib/algorithms/regions-v1.js';
import { withOperationLock, promoteBatch } from './lib/atomic-files.js';
import { PROJECT_ROOT, assertRegularProjectFile } from './lib/paths.js';
import { jsonBytes } from './lib/digests.js';
import { isMain, parseNamedArgs, runCli } from './lib/cli.js';

/** Owner-approved interpretation of the missing shoulder boundary; source is immutable. */
// Include the inside corner at 216,466 so the bridge does not enclose a new one-pixel island.
export const SHOULDER_BRIDGE = [[215,462],[215,463],[216,464],[216,465],[216,466],[217,466],[218,467],[218,468],[219,469],[220,470],[220,471],[221,472]] as const;
if (isMain(import.meta.url)) await runCli({ operation: 'repair-monkey-shoulder' }, async report => {
  if (!parseNamedArgs(process.argv.slice(2), { apply: 'boolean' }).apply) throw new Error('Use --apply for the owner-approved design-005 repair.');
  await withOperationLock(PROJECT_ROOT, 'repair-monkey-shoulder', async () => {
    const image = await decodeCanonical(await readFile(await assertRegularProjectFile('source/coloring/005.png', PROJECT_ROOT)));
    const maskPath = 'content/segmentation/design-005/barrier-add.png';
    const mask = await decodeBinaryMask(await readFile(await assertRegularProjectFile(maskPath, PROJECT_ROOT)), image.width, image.height);
    const before = segmentRegions(image, { inkThreshold: 180, excludedSeedPoints: [[0,0]], barrierAddMask: mask });
    let changedPixels = 0;
    for (const [x,y] of SHOULDER_BRIDGE) { const index = y*image.width+x; if (mask[index] !== 255) changedPixels++; mask[index] = 255; }
    const after = segmentRegions(image, { inkThreshold: 180, excludedSeedPoints: [[0,0]], barrierAddMask: mask });
    const body = after.hitLabels[475*image.width+280]!;
    const background = after.hitLabels[470*image.width+150]!;
    if (!body || !background || body === background || after.regions.length !== 112) throw new Error('Repair did not isolate exactly the intended monkey body.');
    if (changedPixels && (before.hitLabels[475*image.width+280] !== before.hitLabels[470*image.width+150] || before.regions.length !== 111)) throw new Error('Unexpected pre-repair geometry.');
    const configPath = 'content/segmentation/design-005/config.json';
    const config = JSON.parse(await readFile(await assertRegularProjectFile(configPath, PROJECT_ROOT), 'utf8'));
    const note = ' Owner approved closing the open monkey shoulder gap on 2026-11-09 while keeping the visible drawing unchanged. Explicit connectivity-only bridge follows (215,462) to (221,472); exact pixels are in scripts/repair-monkey-shoulder.ts. Monkey body and background now separate; canonical ink is unchanged.';
    if (!config.notes.includes('Owner approved closing')) config.notes += note;
    await promoteBatch(PROJECT_ROOT, 'repair-monkey-shoulder', [
      { path: maskPath, bytes: await sharp(mask, { raw: { width: image.width, height: image.height, channels: 1 } }).png().toBuffer() },
      { path: configPath, bytes: jsonBytes(config) },
    ]);
    report.summary = { changedMaskPixels: changedPixels, regionCount: after.regions.length, bodyRegion: body, backgroundRegion: background, sourceChanged: false };
  });
});
