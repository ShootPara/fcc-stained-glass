# Project status

**Project:** FCC Stained Glass
**Requirements / technical design:** v1.0 / v1.0
**Project version:** 0.1.0
**Checkpoint:** WP05 completion run; all 47 new pages reviewed, 9 November 2026

## Current checkpoint

**WP05 is in progress.** All 48 drawings have versioned packages/frozen recipes, and all 55 photographs have validated derivatives. Detailed reviews and keyboard names are complete for design-003 through design-049; the receipt-derived queue confirms 47/47. Design-009's lip and eye are fixed without merging teeth, pupil, tongue or mouth. The owner-approved design-005 shoulder bridge and separate design-007 shaft/fold corrections remain intact. Exact-version observations and naming plans are in `docs/region-reviews/`. Earlier versions and local saves are retained; no source art or studio layout was changed. Typecheck passed again after the final plans. Historical association reviews, strict release tooling, final tests and deployment remain in progress. Continue until all release checks pass, then deploy as the owner instructed.

Completion-run checks so far: typecheck passed; focused topology tests **9/9 passed**. The 301-test full-suite evidence below predates this completion run; a fresh full suite, collection validation and browser checks will follow all reviews. The earlier unresolved design-009 note below is superseded by the successful repair and current exact-version receipt.

**Print downloads and the book are implemented.** All 48 one-page Letter PDFs are exposed in the gallery and editor. The 51-page anniversary book includes the supplied two-building cover, introduction, identical interior sheets and sources/credits. All page renders were inspected, margins checked, and every interior decoded back to exact canonical pixels. See `docs/WP05_PRINT_RESULTS_2026-11-09.md`. The owner clarified: complete WP05 first, deploy last. Nothing has been pushed or deployed.

The About page now has a cited introduction and descriptive captions for all 55 photos. The historical source catalog contains 64 numbered guide subjects and ten memorial subjects; these do not automatically identify photographs or confirm current locations. History integration passed typecheck, 301 tests and catalog/assets/PDF checks. Design-009's narrow lip/eye investigation remains unresolved; failed dry-run corrections were not applied. See `docs/WP05_HISTORY_PROGRESS_2026-11-09.md`.

Current checks: **301 tests / 22 files passed**, typecheck and catalog validation passed, full assets validation passed for all 55 retained versions and 55 photo derivatives (48 pending version reviews, comprising 41 active and seven retained earlier versions; zero pending pairing reviews). All 49 PDF files pass freshness/hash/dimension checks. All 48 print downloads and the book returned exact hashes at root and repository-base URLs. The loader/native PNG audit passed for all 48 active drawings. Local saves/restoration and the studio layout remain intact, including a 360-pixel portrait check. Production build remains gated until collection and release reviews pass. Evidence is in the region and print reports.

**WP04 is implemented for `design-002`.** The November 9 studio has accessible icon-only swatches, arrow Undo/Redo beside the palette, confirmed undoable Clear, no coloring-screen heading or visible region chooser, and the existing worker-based editor. IndexedDB saves/restores colors, palette, history, viewport, and original-photo state locally; revision checks protect against conflicting tabs. Native colored PNG export and the representative one-page blank Letter PDF are available.

The earlier WP04 run on Node v24.13.0 / npm 11.6.2 passed clean install, typecheck, 286 tests, selected validation and PDF checks. Its browser evidence covers reload restoration, history, Clear/cancel/Undo, export during original view, navigation, conflicts and 360/320-pixel reflow. See `docs/WP04_VERIFICATION.md` for that baseline. Physical touch/pinch, screen-reader and print checks remain pending.

**Implemented baseline:** WP04 plus WP05 collection and print/book features. **Current work:** WP05 detailed region and historical reviews. **Acceptance still pending:** 41 active detailed region/name reviews, remaining historical-content reviews, physical-device/print checks and release verification. No publication has occurred.

## Verified evidence

- Earlier collection-preparation run: **291 tests passed across 20 files.** TypeScript, catalog validation,
  full assets validation and development-catalog generation passed on Windows Node 24.
- Selected assets validation with `requireReviews: true` passed with **zero
  pending pairing or segmentation reviews**, no warnings, and no issues.
- The reviewed `design-002` content version, raw maps, recipe and segmentation
  receipt remain unchanged during collection expansion. Photo processing was
  separately versioned as web-images-v2; existing derivative files were retained.
- Blank rendering exactly matches all **1,572,864 canonical pixels**. Native
  checks found zero changed black pixels or white-halo candidates; complete
  colored/numbered overlays, the uniform fill, and correction masks were viewed.
- A clean folder with spaces, no `.git`, and no preinstalled dependencies passed
  `npm ci` and all checkpoint checks on Node **v24.22.1**, npm **11.9.0**, Linux.
  Repeated installation changed no project files. A task-environment transfer
  residue was verified and quarantined; the full evidence retains that first
  discrepancy and the successful strict repeat check.
- HTTP checks served the entry, transformed module, catalog, and every prepared
  drawing/photo file under both `/` and `/fcc-portability-check/`.
- All **110 original material files (258,074,562 bytes)** match the WP01 source
  bytes. Source inputs remain ordinary included files.

Details and exact commands are in [WP02 verification](docs/WP02_VERIFICATION.md).
The earlier [WP01 evidence](docs/WP01_VERIFICATION.md) remains a separate baseline.

## Representative identity

```text
artwork: design-002
photo: photo-002
book number: 1
contentVersion: 45e61ecb9662f4430786d85ea43b7edddeb2a8180b743d3f9c3e59dc3dd6a85e
keyboardMetadataDigest: bed7e48d8017e1d7af66b511be450728aafc5237f055b84759e7a9508f62b806
```

Review receipts are `content/reviews/design-002-photo-pairing.json` and
`content/reviews/design-002-segmentation.json`. Names are in
`content/accessibility/design-002/<contentVersion>.json`. Current geometry and
its recipe must remain available when WP03 loads the page.

## Next concrete action

Continue detailed review at design-009 through design-049. The design-005 owner choice has been implemented and verified; design-007 connectivity review is complete. No new owner approval is pending. Physical checks remain separately pending.

## Work remaining

| Work | State |
| --- | --- |
| Complete local source set, checksums, importer, shared transaction helpers | Complete |
| Schemas, source/catalog validation, public catalog, plain home | Complete |
| Representative preparation, map validation, frozen recipes, synthetic fixtures | Complete |
| Representative photo pairing, segmentation and keyboard names | Reviewed |
| Representative drawing/photo display and blank PNG download | Implemented |
| WP03 desktop editor, keyboard operation and worker lifecycle | Verified on Windows desktop; physical touch/pinch and screen-reader checks pending |
| WP04 device-local saves, colored PNG export and individual PDF | Implemented; automated and desktop checks passed; physical checks pending |
| WP05 remaining 47 designs and 54 photo derivatives | Prepared and locally available; media pairings reviewed; six new detailed reviews complete, 41 pending |
| WP05 48 individual PDFs and anniversary book | Implemented and visually reviewed; physical print samples pending |
| WP05 historical-content reviews | Pending; uncertainty remains explicit |
| WP06 anonymous clone, full regeneration, release packaging and publication | Pending |

## Commands and boundaries

Use `npm.cmd` in Windows PowerShell:

```powershell
npm.cmd ci
npm.cmd run typecheck
npm.cmd run validate -- --stage catalog
npm.cmd run validate -- --stage assets --id design-002
npm.cmd test
npm.cmd run dev
```

Normal setup uses included prepared files. Selected preparation now works:
`npm.cmd run prepare -- --id design-002`. No-argument prepare remains an
installation no-op. Full assets validation now passes package integrity and
reports 48 pending version reviews (41 active, seven retained earlier versions). Full release validation,
release catalog and build remain gated.

**Not yet exercised:** physical phone/pinch, screen reader, physical printing, public
anonymous Git clone, and production deployment. HTTP checks are not substitutes
for those acceptance checks. AT08's full 48-design review remains WP05; WP02
review covers only the representative.

**Source blockers:** None. **Public repository / published release:** None.
`repositoryUrl` remains null. The fixed development release-date field is not
evidence of publication. The source ZIP is a complete checkpoint, not a finished
release website. [WP02 files](docs/WP02_FILES.txt) lists its delivered files.
