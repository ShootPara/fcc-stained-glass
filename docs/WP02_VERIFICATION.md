# WP02 verification record

**Date:** 6 November 2026. **Scope:** preparation and visual review of one
representative drawing, `design-002`, plus its development-site preview.
Requirements and Technical Design remain at v1.0; project version remains 0.1.0.

## 1. Delivered result

| Item | Observed result |
| --- | --- |
| Drawing | Sun, moon, star and waves; `design-002`; book number 1 |
| Canonical size | 1024 × 1536; 1,572,864 grayscale pixels |
| Colorable regions | 45; smallest 1,533 pixels; largest 275,971 pixels |
| Keyboard metadata | 45 distinct plain names, every positive ID once, unique order 1–45 |
| Original-photo pairing | Confirmed by direct visual comparison with `photo-002` |
| Photo derivative | 1324 × 2000 WebP; 778,290 bytes; thumbnail 23,412 bytes |
| Historical identification | Subject and location still pending |
| Development collection | 48 designs / 55 photographs; one prepared drawing and photo |
| Source preservation | All 110 original material files match WP01; 258,074,562 bytes |

The package's full content version is:

```text
45e61ecb9662f4430786d85ea43b7edddeb2a8180b743d3f9c3e59dc3dd6a85e
```

Canonical decoded-pixel SHA-256:

```text
d76d2e3b344c35345f260f1a1d759636e620bae7e3ff3525bb10c2be0c07b33e
```

Keyboard semantic digest:

```text
bed7e48d8017e1d7af66b511be450728aafc5237f055b84759e7a9508f62b806
```

The complete machine record is [representative.json](verification/wp02/representative.json).
Hash and length receipts for the package, maps, canonical image and photograph
also travel with the project in `generated/assets.json` and its referenced files.

## 2. What was visually inspected

ChatGPT inspected the original `source/coloring/002.png` and original photo
`source/photos/002 FCC Window Igp4048 Tu2.jpg`, then the exact prepared version's
full colored overlay, numbered overlay in three large sections, uniform-color
fill, and correction-mask image. This is an AI visual review, not a claim of
human curator or physical-device approval.

The star, crescent, small top ornament, distinctive curled sun rays, sweeping
foreground band, and lower waves support the photograph match. The drawing
simplifies some original textures and outlines. Matching filenames were not
used as evidence of historical identity. No church location or symbolic meaning
was inferred from this comparison.

At threshold 180, the initial uncorrected segmentation contained 53 regions:
45 intended areas and eight one-pixel fragments at acute pane tips. Enlarged
source crops were inspected. The add-barrier mask selects exactly:

```text
(41,397), (522,631), (727,695), (608,754),
(277,767), (748,824), (747,825), (746,826)
```

These corrections affect connectivity only. The source and canonical line art
remain unchanged. The outside page margin is explicitly excluded with seed
`[0,0]`. No blanket small-region deletion or edge-component deletion is used.
The complete accepted overlay retained all intended closed details, the large
background area, small ray curls, and the small bottom-center opening.

All 45 keyboard names were written against the numbered accepted version.
Navigation groups the upper motifs, sun details and lower waves. Names describe
position/shape, not the temporary review colors. The current segmentation
receipt was written only after those images and names were reviewed.

To reproduce the review aids:

```powershell
npm.cmd run prepare -- --id design-002
```

Open `.work/review/design-002/<contentVersion>/regions-numbered-2x.png`,
`regions-colored.png`, `fill-sample.png`, and `correction-masks.png`.
The same directory includes geometry JSON/CSV and an explicitly draft metadata
file. Prepared commands never write completed review receipts. Review aids are
reproducible temporary outputs; the package, frozen recipe, names, and receipts
are included in the source checkpoint.

## 3. Acceptance evidence

| Check | Evidence and scope |
| --- | --- |
| AT05 deterministic identity | Actual unchanged preparation preserved version, maps and registry. Synthetic tests prove notes, captions, exclusion ordering, and unchanged mask renaming do not change region identity; source re-encoding updates freshness without changing canonical identity. |
| AT06 validation failures | Tests reject unsafe paths, dimensions, byte lengths/hashes, corrupt compressed/raw bytes, region ranges/geometry, incorrect ownership, invalid seeds/masks and stale recipes/configuration. |
| AT07 synthetic fixtures | Diagonal contact, one-pixel gap, antialiasing, small pane, caption and exterior background; domain-before-labeling and global ownership ties including background are also covered. |
| AT08 representative review | All 45 areas and their keyboard names/order reviewed; current required-review validation passes. The other 47 designs and the full-collection acceptance check remain WP05. |
| AT09 rendering | Blank/native comparison: zero mismatches across 1,572,864 pixels. Colored composition: zero changed black pixels and zero halo candidates; uniform fill was visually inspected. |
| Archive compatibility | A fixture retains two region versions, removes generated packages and registry, rebuilds from local frozen recipes, and matches both canonical pixels and raw maps. Actual collection-wide PT04 is still later work. |
| Atomicity and lifecycle | Failed batch leaves old registry/files; corrupt immutable packages are not silently replaced; no-argument npm prepare performs no source access or writes. |
| Reviewed projection | Tests verify current/stale pairing/location receipts, cross-number and many-to-one associations, reverse links, confidence labels in data, private-field exclusion, safe URLs, and invalid public catalogs. |

The full unit suite passed **257 tests across 12 files**. TypeScript checking
passed for browser, worker/shared and Node projects.

## 4. Actual preparation and reviews

[Initial preparation report](verification/wp02/prepare-initial.json) and
[unchanged rerun report](verification/wp02/prepare-rerun.json) record the actual
45-region package. The unchanged rerun reports `reusedPackage: true`,
`changedFiles: []`, and `registryChanged: false`.

Selected validation with `requireReviews: true` returns:

```text
validatedArtworks: 1
validatedVersions: 1
validatedPhotos: 1
pendingSegmentationReviews: 0
pendingPairingReviews: 0
warnings: []
issues: []
```

This review mode requires media matching and segmentation/name review for the
representative. It does not pretend that historical subject/location research
is complete. See [required-review-result.json](verification/wp02/clean/required-review-result.json).

## 5. Clean installation and byte preservation

A separate filesystem copy was created in a path containing spaces, with no
`.git` and without copying `node_modules`. This was a **clean-folder test**, not
an assertion that GitHub clone or Download ZIP had been exercised.

Runtime: **Node v24.22.1**, **npm 11.9.0**, Linux. The following commands all
exited zero (use `npm.cmd` on Windows):

```text
npm ci
npm run typecheck
npm run validate -- --stage catalog
npm test
npm run validate -- --stage assets --id design-002
npm run catalog -- --mode development
```

The same process also ran required-review validation and unchanged selected
preparation. Preparation produced no project-file changes. The final Skip to
content handler and 48-pixel minimum control targets were copied deliberately
afterward; their separate full TypeScript check passed. All tested algorithm and
pipeline modules were unchanged by these UI changes. See
[final-ui-check.json](verification/wp02/clean/final-ui-check.json).

The first inventory comparison found an incomplete temporary photo copy from
the task environment's workspace transfer. Its exact size, checksum and source
prefix were verified before quarantining only that temporary file outside the
disposable project. This observation is preserved in the evidence, not hidden
by an ignore rule. The repeated default `npm ci` passed the same strict
comparison with **zero added, removed or changed files** across 264 files.

Start with [clean/verification.json](verification/wp02/clean/verification.json)
and [repeat-installation.json](verification/wp02/clean/repeat-installation.json).
The directory also includes command logs, full inventories, initial discrepancy,
quarantine, and final UI refresh evidence. Documentation and verification files
written after that copy are separately included in the final package inventory.

## 6. Development serving

Vite was launched and fetched within the same test process at both `/` and
`/fcc-portability-check/`. **12 requests per base** succeeded: HTML, transformed
main module, public catalog, package JSON, canonical PNG, accessibility JSON,
region geometry, three compressed maps, full photo and thumbnail. Every asset
body matched its byte count and SHA-256 receipt. The catalog exposed one
available design with completed segmentation and media reviews.

[http.json](verification/wp02/http.json) records the actual paths and responses.
These checks verify delivery and compilation, not DOM layout, touch input,
screen-reader operation or a physical phone.

## 7. Release boundaries and handoff

Full assets validation, full release validation, release catalog, and build
continue to return the expected pending-work exit code 4; see
[release-gates.json](verification/wp02/release-gates.json). The collection,
editor, saves, colored downloads, PDFs and production release are unfinished.

No physical phone, screen reader, printed proof, Windows execution, anonymous
public clone, or deployed GitHub Pages site was claimed. Those checks belong
to the later work packages. Public Git configuration remains unset.

Proceed with [WP03_HANDOFF.md](WP03_HANDOFF.md): reducer and coordinates first,
then validated worker loading/rendering, guarded lifecycle/gestures, and plain
portrait/keyboard/reference controls. Keep all 45 prepared region identities
and current source bytes intact.
