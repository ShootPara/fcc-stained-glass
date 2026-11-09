# WP05 history progress — 9 November 2026

Project: `D:\Projects\ChatGPT\Coloring Book\fcc-stained-glass`.

Current completion-run result: all 103 artwork/photo records have subject and location review receipts (206 total). Visual interpretations are explicitly likely; design-048 remains unidentified because two guide lamb entries fit it. Present-day locations remain unconfirmed rather than inferred from filenames. Photo-001's visible named figures match the 1935 south memorial description, while 050–055 visually match the north memorial and its scenes. Design-009's caption now says serpent; 037 describes the standing/kneeling figures; 049 describes a creature with fork and ram. `WP05_HISTORICAL_REVIEW.json` preserves the per-page reasoning. The older unresolved notes below are superseded by the completion report and exact current receipts.

## Implemented

The About page now presents a four-paragraph source-cited introduction. It distinguishes the building's 1928 dedication and 2028 centennial from the congregation's 1835 beginning, and separates the historical glass credits from modern photo/drawing credits. Its expandable Sources section cites transcription paragraphs, not invented printed pages.

`content/historical-subjects.json` now contains the 1928 guide's 64 numbered subjects and ten separately described memorial subjects. `scripts/catalog-history.ts --apply` transcribes the actual source paragraphs, checks the complete numbered sequence, preserves other authored records, and refuses to overwrite differing existing records. A second run passed its preservation/idempotency check. These 74 records do not create photo associations or confirm modern locations.

The seven previously numbered photo captions (001 and 050–055) now describe visible details after inspection of `.work/wp05-history-extra.png`. All 55 photographs remain included. Historical identities and modern locations remain explicitly unconfirmed where no matching review exists. Source files remain unchanged.

Files: `content/history-introduction.json`, `content/historical-subjects.json`, `content/photos.json`, `scripts/catalog-history.ts`, `scripts/build-catalog.ts`, `src/shared/public-catalog-schema.ts`, and `src/main.ts`.

## Checks

- `npm.cmd run typecheck`: passed after the history integration.
- `npm.cmd test`: **301 tests / 22 files passed**, 11:45:20 Eastern, 21.73 seconds.
- Catalog validation: passed; report `validate-content-2026-11-09T16-42-23-421Z-989c1983.json`.
- Development catalog: passed; report `catalog-2026-11-09T16-42-27-317Z-eb901ab7.json`.
- Full assets validation: passed, 48 artworks, 55 retained versions and 55 photo derivatives; 48 pending version reviews (41 active and seven retained), zero pending pairing reviews. Report `validate-content-2026-11-09T16-46-12-573Z-86cde65b.json`.
- Selected design-002 assets validation: passed, zero pending reviews; report `validate-content-2026-11-09T16-49-43-999Z-7aa70cae.json`.
- `npm.cmd run pdf -- --validate`: passed, 48 individual PDFs and the 51-page book; report `pdf-2026-11-09T16-49-10-427Z-b2530bc5.json`. Book SHA-256 remains `fb5fbd6f882cb0d555a5d72f35bc31601a46bdad6050f92c4b72355c31f1bf6f`.
- Desktop browser: introduction, expanded source citations, all 55 descriptive photo cards observed. Evidence `.work/wp05-history-introduction.jpg`.

## Detailed review investigation

Design-009's full overlay, five small-component contact sheets and a new 6x native head crop were inspected. Its narrow upper lip and eye crescent contain threshold-induced fragments; the four teeth, pupil and mouth must stay separate. Six tiny enclosed dot centers in the upper tree detail are genuine and must not be discarded by size.

Dry-run attempts to connect the reviewed lip/eye fragments conservatively failed the requirement that each band become one component. No masks, configuration, prepared package or review receipt were applied. The experimental script was removed. Failed diagnostic reports remain under `.work/reports/repair-serpent-detail-*`; head evidence is `.work/region-crops/design-009/head-6x.png`. This is an unresolved review task, not a successful repair.

## Remaining

WP05 remains incomplete: 41 active region/name reviews, historical association reviews, release catalog/build and final release verification remain. Physical printing, actual touch/pinch and screen-reader speech were not tested. Printing artifacts are complete and independently verified; see `WP05_PRINT_RESULTS_2026-11-09.md`.

No commit, push, publication or deployment occurred. Browser-local save/restore and the current studio layout remain intact. The existing project dev server remains at `http://127.0.0.1:5173/`; the temporary subpath server was stopped. Deployment remains last, following the owner's latest direction.
