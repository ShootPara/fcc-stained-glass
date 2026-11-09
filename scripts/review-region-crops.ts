import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { PROJECT_ROOT, assertRegularProjectFile, assertSafeProjectPath } from './lib/paths.js';
import { withOperationLock } from './lib/atomic-files.js';
import { isMain, parseNamedArgs, runCli } from './lib/cli.js';

/** Diagnostic only: paired source/overlay crops, never review approval or removal. */
if (isMain(import.meta.url)) await runCli({ operation: 'review-region-crops' }, async report => {
  const args = parseNamedArgs(process.argv.slice(2), { id: 'value' });
  if (typeof args.id !== 'string' || !/^design-0[0-4][0-9]$/.test(args.id)) throw new Error('Use --id design-NNN.');
  const id = args.id;
  await withOperationLock(PROJECT_ROOT, 'review-region-crops', async () => {
    const queue = JSON.parse(await readFile(await assertRegularProjectFile('docs/WP05_COLORING_REVIEW_QUEUE.json', PROJECT_ROOT), 'utf8'));
    const item = queue.items.find((row: { artworkId: string }) => row.artworkId === id);
    if (!item) throw new Error('Drawing not in review queue.');
    const directory = await assertSafeProjectPath(`.work/region-crops/${id}`, PROJECT_ROOT, { allowMissing: true });
    await mkdir(directory, { recursive: true });
    const regions = JSON.parse(await readFile(await assertRegularProjectFile(`${item.reviewDirectory}/regions.json`, PROJECT_ROOT), 'utf8'));
    const rows = (Array.isArray(regions) ? regions : regions.regions) as { id: number; pixelCount: number; seed: [number, number] }[];
    const source = await readFile(await assertRegularProjectFile(`source/coloring/${id.slice(-3)}.png`, PROJECT_ROOT));
    const overlay = await readFile(await assertRegularProjectFile(`${item.reviewDirectory}/regions-colored.png`, PROJECT_ROOT));
    const tiles: Buffer[] = [];
    for (const region of rows.filter(row => row.pixelCount < 25)) {
      const left = Math.max(0, Math.min(item.width - 48, region.seed[0] - 24));
      const top = Math.max(0, Math.min(item.height - 48, region.seed[1] - 24));
      const crop = { left, top, width: 48, height: 48 };
      const inputs = await Promise.all([source, overlay].map(input => sharp(input).extract(crop).resize(192, 192, { kernel: 'nearest' }).png().toBuffer()));
      const label = Buffer.from(`<svg width="400" height="32"><rect width="400" height="32" fill="white"/><text x="5" y="22" font-size="16">${region.id}: ${region.pixelCount}px (${region.seed.join(',')})</text></svg>`);
      const cross = Buffer.from(`<svg width="192" height="192"><path d="M${(region.seed[0]-left)*4+2} ${(region.seed[1]-top)*4-7}v-8 M${(region.seed[0]-left)*4+2} ${(region.seed[1]-top)*4+11}v8" stroke="red" stroke-width="2"/></svg>`);
      const marked = await sharp(inputs[1]!).composite([{ input: cross }]).png().toBuffer();
      tiles.push(await sharp({ create: { width: 400, height: 228, channels: 3, background: 'white' } }).composite([
        { input: label, left: 0, top: 0 }, { input: inputs[0]!, left: 0, top: 34 }, { input: marked, left: 204, top: 34 },
      ]).png().toBuffer());
    }
    for (let start = 0; start < tiles.length; start += 12) {
      const file = path.join(directory, `small-${String(start / 12 + 1).padStart(2, '0')}.png`);
      await sharp({ create: { width: 800, height: Math.ceil(Math.min(12, tiles.length-start)/2)*228, channels: 3, background: '#ddd' } })
        .composite(tiles.slice(start, start+12).map((input,index) => ({ input, left: (index%2)*400, top: Math.floor(index/2)*228 }))).png().toFile(file);
      report.outputs.push(path.relative(PROJECT_ROOT, file));
    }
    report.summary = { artworkId: id, smallComponents: tiles.length, diagnosticOnly: true };
  });
});
