import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { withOperationLock, promoteBatch } from './lib/atomic-files.js';
import { computeEditorialReviewDigest } from './lib/asset-identity.js';
import { validateCatalog } from './validate-content.js';
import { jsonBytes } from './lib/digests.js';
import { PROJECT_ROOT, assertRegularProjectFile } from './lib/paths.js';
import { isMain, parseNamedArgs, runCli } from './lib/cli.js';

/** Convert explicitly authored visual-review observations to source-bound receipts.
 * Preparation and surveys never call this command or create completed reviews. */
if (isMain(import.meta.url)) await runCli({ operation: 'record-pairing-reviews' }, async report => {
  const args = parseNamedArgs(process.argv.slice(2), { apply: 'boolean' });
  if (!args.apply) throw new Error('Explicit --apply is required after visually reviewing the authored observations.');
  await withOperationLock(PROJECT_ROOT, 'record-pairing-reviews', async () => {
    const review = z.object({ schemaVersion: z.literal(1), reviewer: z.string().min(10), reviewDate: z.string(), method: z.string(),
      pairs: z.array(z.object({ artworkId: z.string(), photoId: z.string(), comparisonSheet: z.string(), observations: z.string().min(50) }).strict()).min(1),
    }).strict().parse(JSON.parse(await readFile(await assertRegularProjectFile('docs/WP05_PAIRING_REVIEW.json', PROJECT_ROOT), 'utf8')));
    const validation = await validateCatalog({ root: PROJECT_ROOT });
    if (!validation.ok || !validation.data) throw new Error('Catalog/source validation failed.');
    if (new Set(review.pairs.map(pair => pair.artworkId)).size !== review.pairs.length) throw new Error('Duplicate pairing review.');
    const updates = [];
    for (const pair of review.pairs) {
      const artwork = validation.data.artworks.find(item => item.id === pair.artworkId);
      if (!artwork || artwork.originalPhoto.value !== pair.photoId || artwork.originalPhoto.confidence !== 'confirmed'
          || !artwork.originalPhoto.rationale.includes(pair.observations)) throw new Error(`Review does not match authored assertion: ${pair.artworkId}.`);
      await assertRegularProjectFile(pair.comparisonSheet, PROJECT_ROOT);
      const receipt = { schemaVersion: 1, recordId: artwork.id, reviewKind: 'photo-pairing',
        reviewedDigest: computeEditorialReviewDigest(validation.data, artwork.id, 'photo-pairing'),
        reviewer: review.reviewer, reviewedAtUtc: new Date().toISOString(), outcome: 'complete' };
      updates.push({ path: `content/reviews/${artwork.id}-photo-pairing.json`, bytes: jsonBytes(receipt) });
    }
    await promoteBatch(PROJECT_ROOT, 'record-pairing-reviews', updates);
    report.outputs.push(...updates.map(update => update.path));
    report.summary = { visualPairingReviewsRecorded: updates.length, segmentationReviewsCreated: 0 };
  });
});
