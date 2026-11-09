import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { withOperationLock, promoteBatch } from './lib/atomic-files.js';
import { computeKeyboardMetadataDigest, computeSegmentationReviewDigest } from './lib/asset-identity.js';
import { jsonBytes } from './lib/digests.js';
import { PROJECT_ROOT, assertRegularProjectFile } from './lib/paths.js';
import { isMain, parseNamedArgs, runCli } from './lib/cli.js';

/** Records explicitly authored observations/names after visual review. No automatic approvals. */
if (isMain(import.meta.url)) await runCli({ operation: 'record-region-review' }, async report => {
  const args = parseNamedArgs(process.argv.slice(2), { id: 'value', apply: 'boolean' });
  if (!args.apply || typeof args.id !== 'string' || !/^design-\d{3}$/.test(args.id)) throw new Error('Use --id design-NNN --apply after inspection.');
  const id = args.id;
  await withOperationLock(PROJECT_ROOT, 'record-region-review', async () => {
    const review = z.object({ schemaVersion: z.literal(1), artworkId: z.literal(id), contentVersion: z.string().regex(/^[a-f0-9]{64}$/),
      reviewer: z.string().min(10), observations: z.string().min(100), evidence: z.array(z.string()).min(2),
      namesById: z.array(z.string().min(5)), navigationIds: z.array(z.number().int().positive()),
    }).strict().parse(JSON.parse(await readFile(await assertRegularProjectFile(`docs/region-reviews/${id}.json`, PROJECT_ROOT), 'utf8')));
    for (const evidence of review.evidence) await assertRegularProjectFile(evidence, PROJECT_ROOT);
    const regions = JSON.parse(await readFile(await assertRegularProjectFile(`public/art/${id}/${review.contentVersion}/regions.json`, PROJECT_ROOT), 'utf8')).regions as { id: number }[];
    const ids = regions.map(region => region.id);
    if (review.namesById.length !== ids.length || new Set(review.namesById).size !== ids.length
        || review.navigationIds.length !== ids.length || new Set(review.navigationIds).size !== ids.length
        || ids.some((regionId, index) => regionId !== index+1 || !review.navigationIds.includes(regionId))
        || review.namesById.some(name => /^area\s+\d+$/i.test(name))) throw new Error('Names/order must uniquely and completely cover the exact package regions.');
    const metadata = { schemaVersion: 1 as const, artworkId: id, contentVersion: review.contentVersion,
      regions: ids.map(regionId => ({ id: regionId, name: review.namesById[regionId-1]!, order: review.navigationIds.indexOf(regionId)+1 })) };
    const keyboardMetadataDigest = computeKeyboardMetadataDigest(metadata);
    const receipt = { schemaVersion: 1, recordId: id, reviewKind: 'segmentation',
      reviewedDigest: computeSegmentationReviewDigest(id, review.contentVersion, keyboardMetadataDigest),
      reviewer: review.reviewer, reviewedAtUtc: new Date().toISOString(), outcome: 'complete', contentVersion: review.contentVersion, keyboardMetadataDigest };
    await promoteBatch(PROJECT_ROOT, 'record-region-review', [
      { path: `content/accessibility/${id}/${review.contentVersion}.json`, bytes: jsonBytes(metadata) },
      { path: `content/reviews/${id}-segmentation.json`, bytes: jsonBytes(receipt) },
    ]);
    report.summary = { artworkId: id, contentVersion: review.contentVersion, namedRegions: ids.length, keyboardMetadataDigest };
  });
});
