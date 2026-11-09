# WP05 print downloads and book — 9 November 2026

Completion-run update: corrected captions for design-009, 037 and 049 were regenerated and visually inspected. Current 51-page book SHA-256 is `dd5a7680f42e45348e90940eb24475214d5f41c5dd8baaa0716b8b6add37b419` (49,886,701 bytes). All 51 final page rasters pass safe-area checks; only those three caption pages differ from the earlier inspected rasters. Independent PDF decoding compares all 75,494,158 native drawing pixels exactly and verifies identical interior streams with the 48 individual sheets. Browser downloads of the book and corrected design-009 sheet from the extracted portable site match the current hashes. Physical printing remains untested. Earlier hashes below are historical evidence; current publication status is in `WP05_COMPLETION_RESULTS_2026-11-09.md`.

Root: `D:\Projects\ChatGPT\Coloring Book\fcc-stained-glass`.
Windows; Node v24.13.0 / npm 11.6.2. Local saves and the November 9 studio are preserved. No repository was created, committed, pushed or deployed. The owner clarified that WP05 must be finished before deployment.

## Delivered locally

- All **48 individual one-page US Letter PDFs**, `public/print/design-002.pdf` through `design-049.pdf`.
- **51-page complete book**, `public/downloads/fcc-coloring-book.pdf`: cover, introduction, 48 identical interior sheets and sources/credits.
- Explicit one-based mapping in `public/downloads/book-manifest.json`: first design is PDF page 3; last is page 50; sources page 51.
- Print-friendly cover at `public/print/cover-line-art.png`, deterministically inverted from the supplied two-building illustration. Source bytes unchanged; cover text typeset separately.
- Gallery has 48 “Download this page (PDF)” links and “Download the whole book (PDF)” with the actual 51-page count. Each editor also has its sheet download.

Book: **49,887,447 bytes**, SHA-256 `fb5fbd6f882cb0d555a5d72f35bc31601a46bdad6050f92c4b72355c31f1bf6f`.
Book input digest: `fd781bbc701bd79040eeb000e2b01eeaf84808f64e1af7b1ff4d0a5ad144f887`.
Individual sheets total 49,024,312 bytes. Effective native resolution ranges **169.9875–181.125 dpi**; no claim of 300 dpi or invented detail.

The original representative PDF is byte-identical to its WP04 baseline: SHA-256 `288b6f2d16ffd538d57a387c4c5dd96ceaec3ba1f792acba8deb86dfbf02349d`.

## Implementation

- Generalized `scripts/lib/printable.ts` and `scripts/build-pdf.ts` to every drawing while retaining the existing sheet layout and baseline digest.
- Added `scripts/lib/print-book.ts`: embedded licensed font, cover conversion, readable front/back matter, exact reuse of individual interior pages, manifest and input-digest/hash validation.
- `npm.cmd run pdf` builds the complete collection; `--id design-NNN` builds a sheet; `--book-only` reuses verified sheets for front/back-matter edits; `--validate` verifies the collection without rewriting it.
- `scripts/build-catalog.ts` exposes only verified print receipts and the verified book. It reuses current asset validation rather than revalidating every map for every sheet.
- Added optional public book metadata and the gallery/detail links in `src/main.ts`. Editor controls, worker rendering, map IDs and local IndexedDB saving were not changed.
- Added `tests/unit/print-book.test.ts` covering the whole collection, stale introduction/title rejection and duplicate/shifted page-map rejection. Existing PDF tests remain.
- `scripts/review-print-render.ts` checks actual Poppler page rasters against the print-safe area and makes review sheets; it never creates completed content reviews automatically. Authored visual observations are recorded in `content/print-review.json` against exact book/cover hashes.

Blank print eligibility is independent of keyboard-region review: verified canonical blank pixels are embedded losslessly; region maps and accessibility labels are not printed. Pending region reviews remain pending and still prevent calling the full site release complete. No release gate was removed or bypassed to produce these blank downloads.

## Verification

| Check | Result |
| --- | --- |
| `npm.cmd run typecheck` | Passed |
| `npm.cmd test -- tests/unit/printable.test.ts tests/unit/print-book.test.ts` | Passed, 6 tests / 2 files |
| `npm.cmd test` | Passed, **301 tests / 22 files**, 11:23:24 Eastern, 22.62 seconds |
| `npm.cmd run pdf` | Passed: 48 individual sheets and 51-page book |
| `npm.cmd run pdf -- --book-only` | Passed after the cover-margin correction |
| `npm.cmd run catalog -- --mode development` | Passed: 48 available drawings, all 48 print receipts and whole book exposed |
| `npm.cmd run pdf -- --validate` | Passed: all 48 sheets, 51-page book, current inputs, hashes and dimensions |
| `npm.cmd run validate -- --stage assets` | Passed: 48 artworks / 55 retained versions / 55 photographs; pending region reviews remain explicit |
| Poppler rendering and `review-print-render.ts` | All 51 pages rendered, zero final safe-area violations |
| Direct PDF image/content audit with bundled pypdf | Every interior exactly matches canonical pixels and its individual page stream: **75,494,158 pixels**, 48 pages |
| Root HTTP downloads | All 48 PDFs plus book returned 200 and exact recorded hashes |
| Repository-base HTTP downloads | All 48 PDFs plus book returned 200 and exact hashes under `/fcc-portability-check/` |
| Desktop browser gallery | 48 sheet links, one book link; book downloaded successfully |
| Browser download hashes | Book and sample sheet match recorded hashes |
| 360×800 browser layout | Book action, count and cards fit; no horizontal overflow (document width 345, viewport 360) |
| Existing coloring | Baseline saved blue sun, palette/history and studio restored; individual PDF action present |
| Physical print / actual phone / screen-reader speech | Not tested |

The first generated cover heading was four points inside the required upper margin. Its baseline was moved down six points; the book was rebuilt and all pages rerendered. Final bounds pass. Original source art and all individual sheets were unchanged by that cover correction.

All thirteen final page contact sheets were inspected for sequence, omissions, clipped text and overlaps; the corrected cover and dense tower page were inspected separately. Pypdf also checked selectable captions, Letter dimensions, source image dimensions, exact canonical image bytes and identical interior content streams. This proves blank print integrity; it does not approve unfinished coloring segmentation.

Evidence: `.work/pdf-review/bounds.json`, `pixel-audit.json`, `sheet-01.png` through `sheet-13.png`, `book-01.png`, `fine-33.png`; browser screenshot `.work/wp05-print-gallery-phone.jpg`.
Command reports include `.work/reports/pdf-2026-11-09T16-13-51-119Z-1106badd.json`, `pdf-2026-11-09T16-17-30-916Z-2d0ad49e.json`, `review-print-render-2026-11-09T16-20-18-607Z-c5b0be02.json`, and `catalog-2026-11-09T16-22-09-075Z-c2e99735.json`.
Final validation reports: `pdf-2026-11-09T16-27-30-044Z-a54c7ca0.json` and `validate-content-2026-11-09T16-27-29-446Z-87996ac8.json`.

Browser downloads: `C:\Users\brian\Downloads\fcc-coloring-book.pdf` and `C:\Users\brian\Downloads\design-002 (1).pdf`. Their hashes match the project copies. The temporary subpath server on port 5174 was stopped; the existing project server remains at `http://127.0.0.1:5173/`.

## Remaining WP05 work

Print downloads and the complete book are implemented and visually reviewed. **WP05 as a whole is not complete**: 41 detailed region/name reviews (009–049) and the remaining historical-content reviews remain. Historical uncertainty stays explicit. Physical printing remains separately pending. Production/release verification and deployment follow completion; nothing was published during this work.
