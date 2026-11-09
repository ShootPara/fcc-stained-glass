# WP05 completion and release results — 9 November 2026

Project root: `D:\Projects\ChatGPT\Coloring Book\fcc-stained-glass`.
Runtime: Node **v24.13.0**, npm **11.6.2**, Windows PowerShell.
Scope: finish WP05, preserve the studio and device-local saves, then publish.
Publication: **pending final public source-ZIP verification and Pages deployment**.

## Completed content

- All 48 drawings reviewed: baseline design-002 plus **47/47 new pages**.
- **6,961 active named regions**; complete exact-version keyboard metadata.
- **49 earlier packages / 8,853 restoration names** retained, not remapped or deleted.
  The original merged monkey/background pane is explicitly named as combined.
  The editor explains when an earlier saved drawing version is being used.
- All 48 media pairings reviewed; 55 photo derivatives validated.
- **103 historical subject/location reviews, 206 matching receipts.**
  Inferred subjects are labeled likely. Design-048 remains unidentified because
  both guide subjects 45 and 61 fit it. No present-day location is claimed.
- Every original source remains unchanged: **110 files, 258,074,562 bytes**.
- No accounts, backend, cloud save, analytics or upload API added. IndexedDB
  remains browser-local; origins have separate saves.

Design-009 is repaired from 167 to **117 regions**. Fourteen lip fragments and
five eye fragments are connected only inside the intended bands; teeth, pupil,
tongue and mouth remain independent. Six intentional tiny dot centers remain.
The canonical drawing/ink and earlier geometry are preserved. The caption now
describes the serpent. Captions for 037 and 049 were also corrected from visual
and historical review; all historical interpretations remain qualified.

## Commands and evidence

Commands were run separately; repository-reading tests were kept separate from
asset/catalog mutation for the final runs.

| Check | Result |
| --- | --- |
| npm.cmd run typecheck | Passed after final implementation changes |
| Focused topology suite | 9/9 passed |
| npm.cmd test | **306/306 passed, 23 files**, final run started 14:46:56 Eastern |
| npm.cmd run validate -- --stage catalog | Passed; all 110 source files verified |
| npm.cmd run validate -- --stage assets | Passed: 48 drawings, 97 versions, 55 photos; zero pending reviews |
| npm.cmd run validate -- --stage assets --id design-002 | Passed; zero pending reviews |
| npm.cmd run pdf | Passed; 48 sheets and 51-page book |
| npm.cmd run catalog -- --mode development | Passed; all 48 available |
| npm.cmd run validate -- --stage release | Passed; all retained packages, editorial and print gates |
| npm.cmd run build | Passed; audited production root build |
| node --import tsx scripts/audit-prepared.ts | Passed for all 48 actual loader/blank/native PNG paths |
| npm.cmd run package:site | Passed; relative-base portable ZIP |
| audit-site: root, renamed subpath, extracted portable ZIP | Passed; all 1,004 deployed file hashes at each URL |
| Clean-copy npm.cmd ci | Passed; no-op lifecycle, 69 packages, zero audit vulnerabilities |
| Clean-copy import --verify-existing | Passed; 110 unchanged sources |
| Clean-copy prepare --all --include-archives | Passed: 97 versions, 55 derivatives; 692 files match byte-for-byte |

The initial 304-test full run passed. One later run overlapped catalog promotion
and correctly failed its transaction guard (302 passed, four skipped); this was
an orchestration error, not an application failure. The subsequent isolated full
runs pass all 306. The release CLI initially exposed a circular dynamic-import
top-level-await deadlock; the import was corrected and the actual release command
then passed. Review-plan coverage and connection guards rejected incomplete or
cross-pane proposals before changes were promoted; corrected plans passed.

Machine-readable runs are under .work/reports, including:
- validate-content-2026-11-09T19-26-45-797Z-bbd5c579.json (all assets)
- validate-content-2026-11-09T19-36-14-929Z-891c8d85.json (strict release)
- build-site-2026-11-09T19-33-07-234Z-43d0b970.json
- audit-prepared-2026-11-09T19-34-47-511Z-6a067140.json
- audit-site-2026-11-09T19-38-54-122Z-d2e9123f.json (root)
- audit-site-2026-11-09T19-43-43-822Z-045c10bc.json (renamed path)
- audit-site-2026-11-09T19-45-56-950Z-bcafe944.json (extracted ZIP)

## Print downloads and book

48 individual blank Letter PDFs and the complete **51-page book** are linked
from the gallery/editor. Book: public/downloads/fcc-coloring-book.pdf.
SHA-256: `977a14b0a94ea8f2fd5ff7c4c93a3dcaa5b1d9ede3203cff2b8794516341432a`.
Size: **49,886,816 bytes**. Cover, introduction, 48 sheets, sources/credits.

All 51 final page rasters pass the safe-area check. Only the three corrected
caption pages (PDF 10, 38, 50) changed from the earlier inspected render set;
those were inspected again. Independent pypdf/Pillow decoding compares all
**75,494,158 native canonical drawing pixels** exactly and verifies identical
interior content streams with the individual sheets. Effective source resolution
is approximately 170–181 dpi; no invented 300-dpi claim or asset regeneration.

UI downloads from the extracted ZIP match current hashes:
- Book: C:\Users\brian\Downloads\fcc-coloring-book (1).pdf
- Sheet: C:\Users\brian\Downloads\fcc-design-009.pdf;
  SHA-256 `9edf6271166fb694ca8e3b741ddb88d0ea6bf7f3d0f01c5794216599510528cf`.

Final PDF evidence: .work/pdf-review/final-bounds.json,
final-pixel-audit.json, final-10.png, final-38.png, final-50.png.
Physical printing is **not tested**.

## Browser checks

ChatGPT in-app Chromium browser, production bundle served by the included static
server, separately from Vite.

Passed: fresh drawing visibility and hidden photo/Retry controls; 12 accessible
palette colors with no names beneath swatches; arrow Undo/Redo beside colors;
tap-to-fill; keyboard fill with authored names; design-009 body/lip/eye separation;
Undo/Redo; canceled Clear; confirmed Clear reversible by one Undo; zoom in/out/Fit;
Show original/Hide original; reload and navigation restoration, including palette;
native PNG download while viewing the original; gallery and PDF downloads.

The actual downloaded design-009 colored PNG is 1024×1536 RGBA and exactly matches
the expected composed coloring bytes (head Blue, lip and eye crescent Yellow).
It contains the coloring, not the displayed reference photograph.

The largest active design, design-032 (**581 regions**, 1024×1536), loads and
colors at a 360×800 viewport without horizontal overflow. This is a simulated
viewport, **not a physical phone test**. The loader/native export audit for it
took 677 ms in the concurrent audit run; that is not an isolated device benchmark.
Production console checks returned no errors or warnings.

Renamed-path design-049 worker rendering, keyboard fill and photo toggle passed.
All 48 full numbered/fill overlays and small-component details were visually
reviewed; this is distinct from the representative browser interactions.

Screenshots: .work/wp05-design-009-repaired.jpg,
wp05-design-009-restored.jpg, wp05-production-restored.jpg,
wp05-production-360.jpg. Existing local work was retained.

Not tested: physical touch/pinch, physical screen reader, physical paper prints,
and an independent browser process worker/memory-leak count. Worker bundling,
navigation and native rendering paths were exercised; do not equate that with
a measured worker leak audit.

Clean-copy portability: the disposable folder with spaces contains no .git.
All 97 packages and 55 derivatives were recreated from source/config/frozen
recipes; **692 files / 172,762,395 bytes** match exactly. All 48 PDF files,
48 print receipts and the book also regenerated exactly. A release build with
Git discovery disabled passed (845 required deployed files, 275,213,323 bytes;
the working checkout additionally retains older unreferenced public derivatives).
Normal npm run dev started at port 5181 and the design-005 browser fill passed.

The public HTTPS repository was cloned with credential helpers, global/system
Git config, extra authorization headers and interactive prompts disabled for
that process. Anonymous clone completed successfully; clean npm ci passed with
zero vulnerabilities and the no-op prepare lifecycle. Initial source commit:
`e909c516c80b34dcb865916f56b0303f3a146bff`.

The final book introduction now includes the online address required by the
specification. Only PDF page 2 changed; it was visually inspected, all 51 final
rasters pass margins, and the other 50 match the earlier inspected set exactly.
The final native-pixel/interior-stream audit also passes. Earlier downloaded
book evidence above predates this final introduction-only change; final live
download hashes will be recorded after deployment.

## Files and preservation

Changed areas: authored region plans/observations, tracked correction masks,
accessibility metadata and review receipts; prepared version registry/packages/
frozen recipes; historical descriptions/citations/reviews; corrected print PDFs
and book receipts; release catalog/schema, guarded build/release/static-server/
portable-package/audit tools; Pages/verification/portable workflows; source link
and earlier-save explanation in the existing studio; concise release tests and
documentation. Source originals and canonical ink were not edited.

Earlier packages and recipes are ordinary included files. Prior root README
and STATUS text is preserved in docs/README_ARCHIVE_PRE_WP05_2026-11-09.md and
docs/STATUS_ARCHIVE_PRE_RELEASE_2026-11-09.md. Existing backups remain in backups/
and are excluded from publication, along with .work and node_modules.

## Size and publication checkpoint

Root build: **314,691,234 bytes**, 1,004 files excluding its own receipt.
Final relative build: **314,691,376 bytes**, including the online address in the introduction.
Portable ZIP: release-artifacts/fcc-stained-glass-site.zip,
**304,143,114 bytes**, SHA-256
`dde3d72ff7ba4edde6dc47526c5bf9c174d750487318f3c4783c0756de1c51e7`.
It was extracted and independently served/hashed, not merely created.

Each tracked file is below the 95 MiB guard; the book is the largest runtime file.
The raw project includes substantial retained recipe data; final Git/ZIP size
measurements and actual deployed commit/URL will be appended after publication.

No software blocker is currently known. Remaining work at this checkpoint is
public source-ZIP verification,
publication and live verification. Physical-device/print checks stay explicitly
unperformed rather than being converted into passes.
