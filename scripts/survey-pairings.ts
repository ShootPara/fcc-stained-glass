import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { withOperationLock } from './lib/atomic-files.js';
import { PROJECT_ROOT, assertRegularProjectFile, assertSafeProjectPath } from './lib/paths.js';
import { isMain, runCli } from './lib/cli.js';
import { DevelopmentCatalogSchema } from '../src/shared/public-catalog.js';

/** Compare filename candidates visually; this diagnostic never approves a match. */
if (isMain(import.meta.url)) await runCli({ operation: 'survey-pairings' }, async report => {
  await withOperationLock(PROJECT_ROOT, 'survey-pairings', async () => {
    const directory = await assertSafeProjectPath('.work/wp05-pairings', PROJECT_ROOT, { allowMissing: true });
    await mkdir(directory, { recursive: true });
    const catalog = DevelopmentCatalogSchema.parse(JSON.parse(await readFile(await assertRegularProjectFile('public/catalog.dev.json', PROJECT_ROOT), 'utf8')));
    const authored = JSON.parse(await readFile(await assertRegularProjectFile('content/artworks.json', PROJECT_ROOT), 'utf8'));
    const tiles: Buffer[] = [];
    for (const artwork of catalog.artworks) {
      if (artwork.id === 'design-002' || !artwork.activeVersion) continue;
      const candidate = authored.artworks.find((item: { id: string }) => item.id === artwork.id)?.originalPhoto.value;
      const photo = catalog.photos.find(item => item.id === candidate);
      if (!photo?.image) throw new Error(`${artwork.id}: photo candidate unavailable.`);
      const version = artwork.versions[artwork.activeVersion]!;
      const original = await sharp(await readFile(await assertRegularProjectFile(`public/${version.canonical.path}`, PROJECT_ROOT)))
        .resize(230, 345, { fit: 'contain', background: 'white' }).png().toBuffer();
      const reference = await sharp(await readFile(await assertRegularProjectFile(`public/${photo.image.web.path}`, PROJECT_ROOT)))
        .resize(230, 345, { fit: 'contain', background: 'white' }).png().toBuffer();
      const label = Buffer.from(`<svg width="470" height="30"><rect width="470" height="30" fill="white"/><text x="8" y="21" font-size="16">${artwork.id} / ${photo.id} (candidate)</text></svg>`);
      tiles.push(await sharp({ create: { width: 470, height: 380, channels: 3, background: 'white' } }).composite([
        { input: label, left: 0, top: 0 }, { input: original, left: 0, top: 30 }, { input: reference, left: 240, top: 30 },
      ]).png().toBuffer());
    }
    for (let start = 0; start < tiles.length; start += 4) {
      await sharp({ create: { width: 960, height: 780, channels: 3, background: '#ddd' } })
        .composite(tiles.slice(start, start + 4).map((input, index) => ({ input, left: (index % 2) * 480, top: Math.floor(index / 2) * 390 })))
        .png().toFile(path.join(directory, `sheet-${String(start / 4 + 1).padStart(2, '0')}.png`));
    }
    report.summary = { candidates: tiles.length, reviewReceiptsCreated: 0 }; report.outputs.push('.work/wp05-pairings');
  });
});
