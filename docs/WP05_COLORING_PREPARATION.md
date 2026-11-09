# WP05 coloring collection preparation — 9 November 2026

Historical preparation checkpoint. Later detailed reviews and current remaining work are recorded in `WP05_REGION_REVIEW_RESULTS_2026-11-09.md` and `WP05_COLORING_REVIEW_QUEUE.json`; 003–008 are now reviewed.

Project: `D:\Projects\ChatGPT\Coloring Book\fcc-stained-glass`.
Environment: Windows, Node v24.13.0 / npm 11.6.2.

## Result and limits

The remaining **47 drawings are prepared and locally colorable**, bringing the development catalog to **48/48 available drawings**. All **55 photographs** have validated derivatives. All 48 drawing/photo associations now have actual visual-comparison receipts, including the original baseline. The new pages retain the November 9 studio and browser-only IndexedDB saving/restoration and PNG export.

This is WP05 preparation progress, **not completed WP05 or a production release**. The 47 new segmentation and descriptive keyboard-name reviews are pending. The gallery and drawing details clearly label them as preparation previews. They use draft numbered area names until reviewed names are authored. There are **2,172 components under 25 pixels** across the new drawings; none was discarded automatically because of size. Detailed inspection must distinguish real small details from raster fragments before approval or corrective masks.

The owner granted publishing/deployment discretion. Deployment was deferred because these reviews and the remaining print/history/book/release requirements are unfinished. GitHub CLI access is available, but this folder still has no Git repository/remote and no public URL was created. Progress remains browser-local; there is no upload/sync/database backend.

## Preparation and visual evidence

1. Inspected original/candidate colored contact sheets for all 47 new drawings: `.work/wp05-survey/sheet-01.png` through `sheet-12.png`. The survey did not promote files or create reviews.
2. Recorded exterior exclusions at `[0,0]` only where a white margin lies outside the framed drawing. For 16 drawings whose corner is ink, no such exclusion was applied. A first diagnostic attempt correctly rejected an ink seed; the survey was changed to preserve those components and leave their detailed review pending.
3. Prepared versioned canonical PNGs, hit/paint/ink maps, measured geometry and frozen regeneration recipes. Full native/2x review artifacts, small-component lists and draft names are under `.work/review/<artworkId>/<contentVersion>/`.
4. Inspected 12 side-by-side drawing/photo sheets in `.work/wp05-pairings/`. All 47 candidates matched distinctive visible composition and features. Observations and exact sheet references are preserved in `docs/WP05_PAIRING_REVIEW.json`; the separate apply command recorded source-bound pairing receipts. No segmentation, historical-subject or church-location review was synthesized.
5. Added factual visible-shape titles/descriptions and useful photo alt text. Historical assessments remain unidentified/pending. Seven other photographs remain outside the current drawing-pair set.

The original `design-002` version remains `45e61ecb9662f4430786d85ea43b7edddeb2a8180b743d3f9c3e59dc3dd6a85e`; its 45 regions, raw maps, frozen recipe and completed segmentation receipt were preserved. Existing local colorings remain tied to that version. Original sources are unchanged: **110 files / 258,074,562 bytes**.

The new drawings contain **8,550 candidate regions** (8,595 including the baseline). The high-detail `design-032` has 612 regions. Native dimensions are read from each package; several drawings differ slightly from 1024 x 1536 and were not resized to force a common shape.

## Photo rounding fix

Initial full catalog validation found eight thumbnail dimension mismatches (`photo-006`, `020`, `022`, `027`, `030`, `039`, `049`, `052`). Sharp's implicit fit-inside sizing yielded a one-pixel difference from the strict validator's required rounded dimensions.

The versioned `web-images-v2` recipe explicitly calculates rounded oriented dimensions and resamples the complete image to them. It does not crop, enlarge, change source bytes or relax validation. Versioned digests keep all prior derivative directories intact. A photo-only batch rebuilt the 55 current derivatives without rerunning any drawing segmentation. Tests cover rotated/portrait dimensions, digest separation and batch scope.

## Commands and outcomes

| Command | Outcome |
| --- | --- |
| `node --import tsx scripts/survey-coloring.ts` | Passed: 47 diagnostic candidates, 12 sheets, no completed review receipts. |
| `npm.cmd run prepare -- --all` | Passed: 48 drawing versions, 55 photo derivatives; design-002 package reused; no reviews authored. Report `.work/reports/prepare-assets-2026-11-09T14-49-35-672Z-97892a4d.json`. |
| Initial `npm.cmd run catalog -- --mode development` | Failed on the eight photo sizing issues above; retained as evidence in `.work/reports/catalog-2026-11-09T14-54-49-486Z-efdb8d87.json`. |
| `npm.cmd run prepare -- --all --photos-only` | Passed with web-images-v2; zero drawing versions changed. Report `.work/reports/prepare-assets-2026-11-09T14-56-28-626Z-90998778.json`. |
| `node --import tsx scripts/survey-pairings.ts` | Passed: 47 comparison pairs / 12 sheets. |
| `node --import tsx scripts/record-pairing-reviews.ts --apply` | Passed after visual comparison and authored observations: 47 source-bound media receipts; zero segmentation receipts. Report `.work/reports/record-pairing-reviews-2026-11-09T15-01-29-848Z-cd78522f.json`. |
| Final `npm.cmd run catalog -- --mode development` | Passed: 55 photos, 48 artworks, 48 available. Report `.work/reports/catalog-2026-11-09T15-06-14-459Z-f83f3682.json`. |
| `node --import tsx scripts/audit-prepared.ts` | Passed against all 48 actual packages. Report `.work/reports/audit-prepared-2026-11-09T14-58-03-875Z-d95ad90c.json`. |
| `npm.cmd run typecheck` | Passed. |
| `npm.cmd test` | Passed: **291/291 tests across 20 files**. |
| `npm.cmd run validate -- --stage catalog` | Passed: all source counts/hashes preserved. Report `.work/reports/validate-content-2026-11-09T15-04-37-619Z-26458c04.json`. |
| `npm.cmd run validate -- --stage assets` | Passed: 48 artwork versions, 55 photo derivatives; **47 pending segmentation reviews, zero pending pairing reviews**. Report `.work/reports/validate-content-2026-11-09T15-02-23-049Z-75c53227.json`. Pending reviews are warnings at this development integrity stage, not completed approvals. |
| `npm.cmd run validate -- --stage assets --id design-002` | Passed: reviewed baseline still has zero pending reviews. Report `.work/reports/validate-content-2026-11-09T15-09-17-986Z-64cfd37c.json`. |
| `npm.cmd run build` | Blocked as designed: `E_RELEASE_PENDING`; no dist/release/deployment produced. Report `.work/reports/build-site-2026-11-09T15-09-18-070Z-9efa2aa1.json`. Gate wording updated to describe the actual WP05/06 state. |

No dependency change or reinstall was needed for this increment. The no-argument prepare lifecycle remains a no-op.

## Rendering audit and browser checks

The audit runs the actual browser package-loader module with a file-backed fetch adapter over local deployed bytes. It checks every package/map/accessibility receipt and geometry through that loader, then compares blank compositions and decoded exports. It is a Node audit of browser code, not a claim that 48 separate browser sessions were manually exercised.

- **75,494,158** canonical blank pixels compared across 48 drawings: exact match.
- **301,976,632** native PNG output channel bytes compared against expected color/ink compositions: exact match, with opaque alpha and native extent.
- Largest measured audit duration per drawing (loader + decode/composition/export checks): 911 ms in this Node environment. This is not a phone performance claim.
- Browser gallery: 48 cards and 48 coloring links; 47 honest review-pending notices.
- `design-003`: worker ready, keyboard fill, reload restoration, photo toggle, preserved studio layout; region 39 visibly colors the fish body. Evidence `.work/wp05-studio.jpg`.
- `design-032`: worker ready with 612 regions, End/Enter filled region 612, PNG download succeeded as `fcc-design-032-colored.png`, and reload restored both coloring and original-view state. Hide original and End announced Area 612 still Blue.
- Existing `design-002` geometry and save identity remain unchanged. Baseline tests and selected validation passed.

The main development server remains at `http://127.0.0.1:5173/` (PID 36616 when recorded). Runtime saves remain local to this browser/origin/base path. No server-side storage, upload, account, public repository or deployment was added.

## Changed files

- Authored data: `content/artworks.json`, `content/photos.json`, `content/media.json`, `content/segmentation/design-003/config.json` through `design-049/config.json`, and 47 new `content/reviews/design-<id>-photo-pairing.json` receipts.
- Prepared data: `generated/assets.json`, 47 new `generated/recipes/design-<id>/<version>/` directories, 47 new `public/art/design-<id>/<version>/` packages, versioned photo derivatives, draft public accessibility receipts and `public/catalog.dev.json`. Exact promoted paths are retained in the preparation reports.
- Tooling: `scripts/survey-coloring.ts`, `scripts/survey-pairings.ts`, `scripts/audit-prepared.ts`, `scripts/record-pairing-reviews.ts`, `scripts/lib/photo-derivatives.ts`, `scripts/lib/prepare-artwork.ts`, `scripts/prepare-assets.ts`, `scripts/build-site.ts`, `tsconfig.tools.json`.
- UI: review-pending text in `src/main.ts` and its small status style in `src/styles.css`. Editor, reducer, save coordinator and export implementation were preserved.
- Tests: `tests/unit/photo-rounding.test.ts` and one photo-only preparation test in `tests/unit/preparation.test.ts`.
- Documentation: this report, `WP05_PAIRING_REVIEW.json`, `WP05_COLORING_REVIEW_QUEUE.json`, `STATUS.md`, `AGENTS.md`, `README.md`, `DECISIONS.md`.

## Next WP05 work

Review the full-resolution region overlays and all retained small components, beginning with design-003. Author useful per-region keyboard names and order, then bind completed segmentation receipts to each actual reviewed geometry/name digest. Use `docs/WP05_COLORING_REVIEW_QUEUE.json`, which records all 47 versions, dimensions, region counts and small-component counts.

After region review, complete remaining PDFs, historical content and anniversary book; then production/portability/release validation and deployment can proceed under the owner's existing authorization. Physical-phone/pinch, screen-reader and print evidence remain separately pending. No geometry/name review, release readiness or historical identification is implied by successful preparation or pixel tests.
