import { readFile } from 'node:fs/promises';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import { decode } from 'fast-png';
import { DevelopmentCatalogSchema } from '../src/shared/public-catalog.js';
import { loadRegionPackage } from '../src/editor/package-loader.js';
import { composeNative } from '../src/editor/compositor.js';
import { exportColoring } from '../src/editor/export.js';
import { decodeCanonical } from './lib/algorithms/gray-v1.js';
import { PROJECT_ROOT, assertRegularProjectFile } from './lib/paths.js';
import { isMain, runCli } from './lib/cli.js';

/** Exercise the actual browser loader/encoder against local deployed bytes.
 * A file-backed fetch adapter replaces HTTP only for this read-only audit.
 * No editorial review receipt is created by pixel or checksum checks. */
if (isMain(import.meta.url)) await runCli({ operation: 'audit-prepared', scope: 'all prepared drawings' }, async report => {
  const catalog = DevelopmentCatalogSchema.parse(JSON.parse(await readFile(await assertRegularProjectFile('public/catalog.dev.json', PROJECT_ROOT), 'utf8')));
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async input => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    if (url.protocol !== 'file:') throw new Error('Audit fetch accepts local files only.');
    const relative = path.relative(PROJECT_ROOT, fileURLToPath(url)).split(path.sep).join('/');
    const bytes = await readFile(await assertRegularProjectFile(relative, PROJECT_ROOT));
    return new Response(bytes);
  };
  const results: unknown[] = [];
  try {
    for (const artwork of catalog.artworks) {
      if (!artwork.activeVersion) continue;
      const version = artwork.versions[artwork.activeVersion]!;
      const started = performance.now();
      const loaded = await loadRegionPackage({ type: 'load', sessionId: 1, requestId: 1, artworkId: artwork.id,
        contentVersion: version.contentVersion, packageUrl: pathToFileURL(path.join(PROJECT_ROOT, 'public', version.package.path)).href,
        packageReceipt: version.package, accessibilityUrl: pathToFileURL(path.join(PROJECT_ROOT, 'public', version.accessibility.path)).href,
        accessibilityReceipt: version.accessibility });
      const canonical = await decodeCanonical(await readFile(path.join(PROJECT_ROOT, 'public', version.canonical.path)));
      const blank = composeNative(loaded.paintLabels, loaded.inkAlpha, new Map(), version.width, version.height);
      for (let pixel = 0; pixel < canonical.pixels.length; pixel++) {
        const offset = pixel * 4; const value = canonical.pixels[pixel]!;
        if (blank[offset] !== value || blank[offset + 1] !== value || blank[offset + 2] !== value || blank[offset + 3] !== 255) {
          throw new Error(`${artwork.id}: blank composition differs at pixel ${pixel}.`);
        }
      }
      const fills: [number, string][] = [[1, '#D32F2F'], [version.regionCount, '#1976D2']];
      const png = exportColoring(loaded.paintLabels, loaded.inkAlpha, fills, version.width, version.height);
      const decoded = decode(png);
      const expected = composeNative(loaded.paintLabels, loaded.inkAlpha, new Map(fills), version.width, version.height);
      if (decoded.width !== version.width || decoded.height !== version.height || decoded.channels !== 4 || decoded.data.length !== expected.length) {
        throw new Error(`${artwork.id}: exported PNG dimensions differ.`);
      }
      for (let index = 0; index < expected.length; index++) if (decoded.data[index] !== expected[index]) throw new Error(`${artwork.id}: PNG export byte ${index} differs.`);
      const result = { id: artwork.id, width: version.width, height: version.height, regions: loaded.regions.length,
        blankPixelsCompared: canonical.pixels.length, exportBytesCompared: expected.length, pngBytes: png.length,
        elapsedMs: Math.round(performance.now() - started), editorialReview: version.reviewState, keyboardNamesDraft: version.keyboardNamesDraft };
      results.push(result); console.log(`${artwork.id}: loader, ${canonical.pixels.length} blank pixels and native PNG passed`);
    }
  } finally { globalThis.fetch = originalFetch; }
  report.summary = { preparedDrawings: results.length, results, editorialReviewsCreated: 0 };
});
