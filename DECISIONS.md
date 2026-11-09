# Implementation decisions

## D-WP05-03 — Finish print downloads and the book before deployment

**Date:** 2026-11-09. The owner clarified that the goal is completed WP05, including print downloads and the book, with deployment last.

**Effect:** Generalize the existing lossless Letter-sheet generator to all 48 drawings, reuse those exact pages in a 51-page book, and expose verified downloads in the gallery. Use the supplied cover through deterministic black-on-white conversion; no redraw or source replacement. Keep unknown historical locations and media credits explicit. Print input digests bind captions, canonical pixels, font, cover, order and front/back matter; catalog generation rejects stale print files. Blank PDF eligibility does not depend on keyboard maps, so these downloads can be completed while interactive-region reviews remain honestly pending. Full site release gates remain in place. All 51 renders and exact copied interior pixels were checked; physical printing stays pending. No repository creation, push or deployment occurred.

## D-WP05-01 — Collection preparation and publication discretion

**Date:** 2026-11-09. The owner authorized WP05, starting with the remaining 47 coloring pages, and publishing/deployment at agent discretion. Local-only IndexedDB saves and the November 9 studio layout remain requirements.

**Effect:** All 48 drawings are prepared and locally available. Candidate pages explicitly show Region review pending; generating packages and draft keyboard names does not approve segmentation. Coarse comparison sheets were inspected, and all 47 new media pairings were separately compared and source-bound receipts recorded from the authored observations in `docs/WP05_PAIRING_REVIEW.json`. Historical identities and church locations were not inferred. The exact detailed-review queue is `docs/WP05_COLORING_REVIEW_QUEUE.json`. Publication is deferred while those reviews and the remaining print/history/book/release work are incomplete; no production gate is weakened.

## D-WP05-02 — Version exact photo rounding; preserve existing derivatives

**Date:** 2026-11-09. Full preparation exposed eight thumbnail dimensions one pixel smaller than the validator's required nearest-integer sizes. Sharp's implicit inside-fit rounding differed from the explicit source-ratio rounding contract.

**Effect:** `web-images-v2` computes both oriented dimensions with Math.round and resamples the entire source to that exact integer rectangle without cropping or enlargement. The media algorithm version changes the preparation digest and output directory; v1 regeneration remains supported and all existing outputs remain intact. Validation remains strict. Regression tests cover portrait/rotated JPEG dimensions, recipe identity separation and photo-only batch scope. `--all --photos-only` refreshes derivatives without rerunning or changing drawing geometry.

## D-WP04-01 — November 9 studio and local-only progress

**Date:** 2026-11-09. The owner approved the revised standalone studio as a design reference, followed by WP04. Its actual local filename is `../Coloring Page New Layout CODEX PLEASE USE.html`; it is not the application's entry point.

**Effect:** Remove the coloring-screen heading and visible region chooser; use accessible icon-only swatches, arrow Undo/Redo beside the colors, and Clear with the existing confirmation/one-step Undo. Preserve keyboard region metadata and operation. The working worker, maps, and hidden-layer guard remain. IndexedDB is the only save backend: no account, upload, cloud sync, or application server. Namespaces include the deployment path; browser origins isolate hosts and ports. Browser data can be cleared, so downloads remain the portable copy.

## D-WP04-02 — Representative print receipt alongside asset receipts

**Date:** 2026-11-09. WP04 prepares only `design-002`'s individual blank PDF. `npm.cmd run pdf -- --id design-002` builds it with the included Liberation Sans font and the reviewed canonical PNG using the shared operation lock/promotion helpers. Its separate receipt binds title, honest location label, canonical bytes, font, page size, and layout revision. Development catalog generation checks freshness and output hash before exposing the PDF. The native 1024 x 1536 image yields approximately 173 effective dpi in this layout; no 300 dpi claim or source upscaling is made. Full collection/book/release gates remain later work.

Requirements baseline: v1.0. Technical-design baseline: v1.0.

## D-WP01-01 — Include supplied history documents as well as readable text

**Date:** 2026-11-06. **Reason:** Preserve the full supplied material while making
historical evidence easy to search and cite. The source set includes the two
unchanged DOCX transcriptions and their full extracted UTF-8 text. Stable
`[P0001]` paragraph markers give the text a usable locator; they are not printed
book page numbers. No scanned original book has been added or implied.

**Effect:** The initial manifest has 110 source files. Original image counts
remain 55 photographs and 48 coloring pages. Source preservation and history
traceability requirements are unchanged. See `docs/SOURCE_PROVENANCE.md` for
the extraction method. No migration is needed.

## D-WP01-02 — Run TypeScript scripts through the Node preload integration

**Date:** 2026-11-06. **Reason:** `node --import tsx scripts/<file>.ts` executes the
same pinned transpiler without the standalone tsx CLI's extra IPC server.
The initial CLI invocation failed to create its IPC socket in the execution
environment. The documented preload route ran successfully.

**Effect:** npm command names and arguments remain those in the technical
design. The package script values use `node --import tsx`. The lifecycle test
launches this route from an unrelated directory containing spaces. This is an
implementation detail, not a new user prerequisite.

**Reference:** [tsx Node.js CLI integration](https://tsx.hirok.io/dev-api/node-cli).

## D-WP01-03 — Use the included Liberation Sans regular font

**Date:** 2026-11-06. **Reason:** Provide a real, local font for later print
generation. `LiberationSans-Regular.ttf` reports version 2.1.5 and is accompanied
by the SIL Open Font License 1.1 text. Actual bytes and hashes are pinned in the
source inventory. No runtime font download is needed.

**Effect:** The initial book configuration references
`font-liberation-sans-regular`. Font changes later invalidate print-input
digests as required by the technical design. See `ASSET_CREDITS.md`.

## D-WP01-04 — Keep the development preview and unfinished release explicit

**Date:** 2026-11-06. **Reason:** Make `npm run dev` useful for checking installation
now, while keeping readiness truthful. The initial shell has the two home
choices and complete record lists. It has no prepared image assets or editor.
All designs are unavailable and candidate photo associations are withheld.

**Effect:** The WP01 catalog builder refuses to ignore newly added prepared
assets or review receipts: WP02 must implement their validated joins. Selected
preparation, production build, and assets/release validation return exit code
4 until their specified implementations exist. The no-argument npm prepare
lifecycle succeeds without changing source or prepared files. No release
requirement is relaxed.

## D-WP01-05 — Preserve recovery state through cleanup

**Date:** 2026-11-06. **Reason:** A rolled-back file transaction can be interrupted
again while deleting its temporary backups. Record `rolled-back` durably before
cleanup so the next command resumes cleanup instead of requiring deleted
backups. Equal-byte sources under different IDs also retain their separate
archive paths and receipts.

**Effect:** Implements the existing recovery contract. Child-process termination
tests cover interruption during promotion and after rollback cleanup begins.

## D-WP01-06 — Let clear navigation lead the interface

**Date:** 2026-11-06. **Reason:** The owner requested a straightforward interface
whose buttons explain what visitors can do.

**Effect:** Home keeps a modest church-name heading and the two main selections.
Remove promotional headlines, taglines, teaser copy, and redundant instructions.
Other pages retain functional headings without introductory filler. Factual
artwork/history descriptions, necessary instructions, and useful errors or
availability statuses remain appropriate. This direction applies to all later
work packages. It changes presentation only; no data migration is needed.

## D-WP02-01 — Correct eight isolated raster tips without changing line art

**Date:** 2026-11-06. **Reason:** At threshold 180, `design-002` produced 45 intended
closed regions and eight isolated one-pixel fragments at acute pane tips. Visual
inspection of the complete colored overlay and enlarged source crops established
that these eight pixels were not separate intended panes.

**Effect:** `content/segmentation/design-002/barrier-add.png` selects exactly those
eight pixels. The configuration records their coordinates and rationale. The
external page margin is excluded through seed `[0,0]`. All 45 real regions remain,
including the smallest at 1,533 pixels. The canonical drawing is unchanged; an
unfilled composition reproduces all 1,572,864 grayscale pixels exactly. This is a
reviewed correction, not a general rule to discard small components.

## D-WP02-02 — Keep visual matching separate from historical identification

**Date:** 2026-11-06. **Reason:** Direct comparison of drawing `design-002` and
photograph `photo-002` confirms the star, crescent, distinctive curled sun rays,
curved foreground band, and lower waves. This does not establish a book passage,
symbolic meaning, or a location in the church.

**Effect:** The media pairing is confirmed with a source-bound receipt. The title
and description name visible shapes. Subject and location assessments remain
pending. The development site shows the photo and factual visual description,
with location identified as not yet known. Other filename candidates stay private.

## D-WP02-03 — Freeze geometry inputs and bind reviews to the inspected version

**Date:** 2026-11-06. **Reason:** Future saved colorings will assign colors to
integer region IDs. Regeneration or editorial edits must not reinterpret them.

**Effect:** Region packages and their four raw recipe inputs are immutable and
versioned. `fflate` 0.8.3 writes gzip maps with timestamp zero. Content identity
uses decoded pixels, effective settings, masks, and raw maps; source-container
freshness is recorded separately. Keyboard names live outside geometry packages;
the segmentation receipt binds the exact content version and semantic keyboard
metadata digest. Preparing a drawing never writes a completed review. Tests cover
unchanged reruns, source re-encoding, stale metadata, and archive regeneration.

## D-WP02-04 — Make the prepared page inspectable before the editor

**Date:** 2026-11-06. **Reason:** The owner needs a visible checkpoint and simple
handoff instructions while the editor is implemented in WP03.

**Effect:** The stable drawing route displays the prepared PNG, its factual
description, a PNG download, and a link to the reviewed original. The original
photo route displays its web derivative. The plain two-choice home remains.
This is an uncolored source download; colored export and print PDFs remain WP04.
README uses `npm.cmd` for Windows and distinguishes the small update ZIP from the
complete source ZIP. No source migration is needed.
