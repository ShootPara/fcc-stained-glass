import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { decodeCanonical } from './lib/algorithms/gray-v1.js';
import { segmentRegions, compositeRgba } from './lib/algorithms/regions-v1.js';
import { withOperationLock } from './lib/atomic-files.js';
import { PROJECT_ROOT, assertRegularProjectFile, assertSafeProjectPath } from './lib/paths.js';
import { jsonBytes } from './lib/digests.js';
import { isMain, runCli } from './lib/cli.js';

/** Diagnostic candidates only. Does not author configurations or completed reviews. */
if (isMain(import.meta.url)) await runCli({ operation: 'survey-coloring' }, async report => {
  await withOperationLock(PROJECT_ROOT, 'survey-coloring', async () => {
    const directory = await assertSafeProjectPath('.work/wp05-survey', PROJECT_ROOT, { allowMissing: true });
    await mkdir(directory, { recursive: true });
    const rows: unknown[] = []; const tiles: Buffer[] = [];
    for (let number = 3; number <= 49; number++) {
      const id = `design-${String(number).padStart(3, '0')}`;
      const source = `source/coloring/${String(number).padStart(3, '0')}.png`;
      const image = await decodeCanonical(await readFile(await assertRegularProjectFile(source, PROJECT_ROOT)));
      const excludedSeedPoints: [number, number][] = image.pixels[0]! > 180 ? [[0, 0]] : [];
      const regions = segmentRegions(image, { inkThreshold: 180, excludedSeedPoints });
      const colors = new Map<number, [number, number, number]>(regions.regions.map(r => [r.id,
        [65 + (r.id * 91) % 170, 65 + (r.id * 137) % 170, 65 + (r.id * 57) % 170]]));
      const rgba = compositeRgba(image.width, image.height, regions.paintLabels, regions.inkAlpha, colors);
      const colored = await sharp(rgba, { raw: { width: image.width, height: image.height, channels: 4 } }).png().toBuffer();
      await writeFile(path.join(directory, `${id}-candidate.png`), colored);
      const tiny = regions.regions.filter(r => r.pixelCount < 25);
      rows.push({ id, width: image.width, height: image.height, regionCount: regions.regions.length,
        tinyRegions: tiny, regions: regions.regions, proposedExteriorSeed: excludedSeedPoints });
      const original = await sharp(await readFile(path.join(PROJECT_ROOT, source))).resize(230, 345, { fit: 'contain', background: 'white' }).png().toBuffer();
      const overlay = await sharp(colored).resize(230, 345, { fit: 'contain', background: 'white' }).png().toBuffer();
      const label = Buffer.from(`<svg width="470" height="30"><rect width="470" height="30" fill="white"/><text x="8" y="21" font-size="16">${id}: ${regions.regions.length} regions; ${tiny.length} under 25 px</text></svg>`);
      tiles.push(await sharp({ create: { width: 470, height: 380, channels: 3, background: 'white' } }).composite([
        { input: label, left: 0, top: 0 }, { input: original, left: 0, top: 30 }, { input: overlay, left: 240, top: 30 },
      ]).png().toBuffer());
      console.log(`${id}: ${regions.regions.length} regions, ${tiny.length} tiny candidates`);
    }
    for (let start = 0; start < tiles.length; start += 4) {
      const inputs = tiles.slice(start, start + 4).map((input, index) => ({ input, left: (index % 2) * 480, top: Math.floor(index / 2) * 390 }));
      await sharp({ create: { width: 960, height: 780, channels: 3, background: '#ddd' } }).composite(inputs).png()
        .toFile(path.join(directory, `sheet-${String(start / 4 + 1).padStart(2, '0')}.png`));
    }
    await writeFile(path.join(directory, 'inventory.json'), jsonBytes(rows));
    report.summary = { drawings: rows.length, contactSheets: Math.ceil(tiles.length / 4), candidateOnly: true };
    report.outputs.push('.work/wp05-survey');
  });
});
