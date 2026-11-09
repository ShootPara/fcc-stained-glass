# Project status

**Project:** FCC Stained Glass · version 0.1.0
**Checkpoint:** WP05 content and local release checks complete; portability/publication verification in progress, 9 November 2026.
**Owner direction:** finish WP05, then deploy. Keep saves local and preserve the current studio.

## Implemented and reviewed

All 48 coloring drawings and 55 photographs are available. The remaining 47
detailed region reviews are complete: the exact-version queue confirms **47/47**.
There are **6,961 active named regions**. The 49 earlier packages and frozen
recipes remain available for local-save restoration, with 8,853 names describing
their actual original panes. Old combined panes are identified honestly.
Preparation alone never completes a review.

Design-009's lip and eye repair is verified: 167 → 117 regions, without merging
teeth, pupil, tongue or mouth or losing intentional tiny dot centers. Source
pixels and canonical ink remain unchanged. The owner-approved design-005 shoulder
barrier and design-007 shaft/fold corrections remain intact.

All 103 artwork/photo records have historical subject/location reviews (206
receipts). Visual interpretations are labeled likely. Design-048 remains
unidentified because two guide entries fit it; present-day locations remain
unconfirmed. No historical identity is inferred from filenames. Unknown modern
photographer/artist credits remain explicit.

The studio retains icon-only accessible swatches, arrow Undo/Redo beside colors,
Clear confirmation with one-Undo recovery, no coloring heading or visible region
chooser, worker rendering, original-photo toggle and zoom/Fit. IndexedDB saves,
restoration and history remain browser-local. No server save or account system
has been added. Native colored PNG export works while viewing the original.

All **48 individual Letter PDFs** and the **51-page book** are implemented,
linked and reviewed. The book uses the supplied two-building cover, introduction,
all numbered sheets and source/credit pages. Corrected captions for 009, 037 and
049 are included. Current book SHA-256:
`dd5a7680f42e45348e90940eb24475214d5f41c5dd8baaa0716b8b6add37b419`.

## Verified locally

Node **v24.13.0**, npm **11.6.2**, Windows.
- Typecheck passed; final full suite **306/306 tests across 23 files** passed.
- Catalog/source validation: all 110 originals, **258,074,562 bytes**, unchanged.
- Full assets: 48 drawings, **97 versions**, 55 derivatives, zero pending reviews.
- Strict release validation and production build passed, with current editorial,
  all retained-version names/reviews, print freshness and exact-hash print review.
- Actual loader, all blank pixels and native colored PNG audit passed for all 48.
- All **75,494,158** interior canonical PDF pixels match; individual/book streams
  match. All 51 rendered pages pass safe-area checks. Changed captions were viewed.
- Production desktop and 360×800 browser checks passed, including local restore,
  Clear/Undo, photo toggle, native PNG and print downloads.
- Root, renamed subpath and the extracted portable ZIP each served all 1,004
  audited files with exact hashes. Largest active design: 032, **581 regions**.
- Portable ZIP built: release-artifacts/fcc-stained-glass-site.zip, 304,142,959
  bytes; extracted and served successfully.
- Clean copy in a path with spaces: npm ci and all-source verification passed.
  Independent regeneration is running at this checkpoint.

The root production build is about 315 MB, below the 1 GiB hosting guard. Every
file is below the 95 MiB per-file guard. Raw source-tree size includes retained
frozen recipes; final repository/ZIP measurements accompany publication evidence.

## Publication

Repository identity: https://github.com/ShootPara/fcc-stained-glass
Intended site: https://shootpara.github.io/fcc-stained-glass/
**Not yet recorded as deployed.** Complete independent regeneration comparison,
anonymous source/ZIP checks, then deploy and verify the public runtime/downloads.

## Not physically tested

Physical touch/pinch, a physical screen reader and paper prints remain untested.
Simulated viewport and desktop automation are not physical-device evidence.
No independent browser-process worker/memory-leak count was measured.

## Evidence and continuation

Read docs/WP05_COMPLETION_RESULTS_2026-11-09.md for commands, outcomes, artifacts
and final publication updates. The queue and authored observations are under
docs/region-reviews and docs/WP05_COLORING_REVIEW_QUEUE.json. Print and historical
review JSON bind exact current content.

Next concrete action: finish the clean regeneration/anonymous-source checks,
publish and verify the reviewed site. Do not start a new work package or redesign
the studio. Preserve all sources, old saves and retained geometry.

Older checkpoint wording is preserved in
docs/STATUS_ARCHIVE_PRE_RELEASE_2026-11-09.md and the WP01–WP05 reports. Their
earlier WP03/WP05 continuation instructions and unresolved design-009 notes are
superseded by this status and the actual local files.
