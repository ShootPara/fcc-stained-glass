# WP04 representative verification — 9 November 2026

Project root: `D:\Projects\ChatGPT\Coloring Book\fcc-stained-glass`.
Environment: Windows, Node v24.13.0, npm 11.6.2. This is a one-design development checkpoint, not a published release.

## Scope and design authority

Read the recovery handoff at `../Codex read these first.md` and the renamed latest reference `../Coloring Page New Layout CODEX PLEASE USE.html`. Both were in the workspace parent, not the application root. The preview remains separate from Vite's `index.html`.

The November 9 owner choices are implemented: no coloring-screen header text, no visible region chooser, no names beneath swatches, accessible icon-only swatches, arrow Undo/Redo beside the palette, and confirmed undoable Clear. The drawing stays first, with tools alongside it on desktop and beneath it on small portrait widths. The `[hidden]` visibility guard remains.

## Local saves and export

- IndexedDB is the sole persistence backend. No uploads, accounts, cloud sync, application database server, or external API are used. Runtime fetches retrieve this deployment's static artwork/catalog assets; Vite's development websocket is development tooling.
- Saves are keyed by site namespace (including resolved base path), artwork ID, and exact content version. Different browser origins, including localhost versus 127.0.0.1 and different ports, have separate saves.
- Records validate fills, colors, IDs, history consistency/limits, palette and viewport before restoration. Painting waits for both the worker and the initial storage read.
- Conditional writes compare the stored revision in one read/write transaction and report success after completion. Pending saves serialize and coalesce; the application-level cache survives route disposal. Failed reads never authorize replacement. Conflicts preserve the local snapshot and offer export/reload.
- Corrupt records remain intact until an explicit recovery-copy/fresh-start action; that action backs up the raw record and removes its active key in the same transaction. If the backup transaction fails, the record remains untouched. Other retained saved versions can be selected through the catalog archive index; no automatic region migration occurs.
- The worker encodes the full native composition via fast-png from an immutable fill snapshot. The view offers fresh Save image/Open image actions and revokes superseded/disposed Blob URLs. Export uses no display canvas, reference photo, selection overlay, or viewport crop.

## Final commands and results

All commands were run from the application root.

| Command | Result |
| --- | --- |
| `npm.cmd ci` | Passed; 69 packages installed, 70 audited, zero vulnerabilities; no-argument prepare reported No assets changed. |
| `npm.cmd run typecheck` | Passed. |
| `npm.cmd test -- tests/unit/storage.test.ts tests/unit/export.test.ts tests/unit/printable.test.ts` | Passed, 13 tests across 3 files. |
| `npm.cmd test` | Passed, **286/286** tests across **19 files**. |
| `npm.cmd run validate -- --stage catalog` | Passed: 55 photos, 48 designs, 110 source files / 258,074,562 bytes. Report `.work/reports/validate-content-2026-11-09T14-31-05-411Z-76f47219.json`. |
| `npm.cmd run validate -- --stage assets --id design-002` | Passed: one artwork/version/photo derivative; zero pending segmentation/pairing reviews. Report `.work/reports/validate-content-2026-11-09T14-31-05-348Z-17199003.json`. |
| `npm.cmd run pdf -- --id design-002` | Passed: new representative sheet and print-input receipt generated with operation lock and shared promotion. |
| `npm.cmd run pdf -- --id design-002 --validate` | Passed: current input digest, PDF bytes/hash, one page, 612 x 792 points. Report `.work/reports/pdf-2026-11-09T14-31-06-222Z-82c12b80.json`. |
| `npm.cmd run dev` | Passed; main preview remains at `http://127.0.0.1:5173/` (PID 36616 when recorded). |
| `npm.cmd run dev -- --base=/fcc-stained-glass/ --port=5174` | Passed; browser subpath smoke check completed, temporary server stopped. |

No final automated check failed or was blocked. Initial development type errors were corrected before these final runs. The first PNG comparison used the wrong inferred region ID; the corrected comparison used the actual exported sun-center region 27 and matched every channel of all 1,572,864 pixels.

## Browser evidence

In-app Chromium browser, desktop and explicit 360 x 800 / 320 x 800 portrait overrides:

- Fresh editor shows drawing, enabled accessible swatches, arrow history buttons and Clear; reference image and Retry remain hidden.
- A blue sun-center fill survives a full reload with Undo history intact. Palette changes and original-photo view also restore. Hide original returns to the saved coloring.
- Clear cancellation preserves coloring; confirmed Clear removes it as one command; one Undo restores it and the save completes.
- Navigating Back to pages and reopening restores the current local work, releasing/recreating the worker.
- Two tabs loaded the same revision. The first saved; the second reported the conflict and preserved its local palette/work with export available. An unnecessary initial resize write discovered during this check was removed and the flow was repeated successfully.
- Export while the original photograph was visible produced `fcc-design-002-colored.png`. Downloaded output: 1024 x 1536, 4 channels, all alpha 255, 8,300 exact Blue pixels. Recomposition from the real paint/ink maps and region 27 matched **all 6,291,456 output bytes**, demonstrating full extent and no reference/selection overlay pixels. Retained local evidence: `.work/wp04-export-verified.png`.
- At 320 pixels, document scroll width was 305 CSS pixels (no horizontal overflow). All twelve swatches had accessible names and empty visible text. Controls are reachable by ordinary vertical scrolling. Phone portrait screenshot: `.work/wp04-portrait.jpg`; final desktop: `.work/wp04-studio.jpg`.
- Repository-base preview loaded the worker/package/accessibility metadata, accepted Home/Enter keyboard filling, and displayed the original at 1324 x 2000. The PDF downloaded through that base and its hash matched the receipt.

## Printable sheet

`public/print/design-002.pdf`: one US Letter portrait page, included licensed Liberation Sans embedded, whole lossless canonical drawing, wrapped title area, and footer `Coloring page 1 | Location not yet identified`. Margins are at least 36 points. Effective native resolution is about **172.8 dpi**, not an asserted 300 dpi.

Size: 817,564 bytes. SHA-256: `288b6f2d16ffd538d57a387c4c5dd96ceaec3ba1f792acba8deb86dfbf02349d`. Receipt: `generated/print-design-002.json`. Development catalog checks that receipt before exposing Print drawing (PDF).

Rendered with Poppler to `.work/wp04-pdf.png` and visually inspected: full line art, readable title/footer, no clipping or overlap. Automated long-title test verifies wrapping retains a one-page Letter output. Physical printing was not performed.

## Changed files

- Editor/UI: `src/main.ts`, `src/styles.css`, `src/editor/view.ts`, `src/editor/storage.ts`, `src/editor/export.ts`, `src/editor/worker.ts`, `src/editor/worker-client.ts`, `src/shared/editor-protocol.ts`, `src/shared/public-catalog-schema.ts`.
- Print/catalog tooling: `scripts/build-pdf.ts`, `scripts/lib/printable.ts`, `scripts/build-catalog.ts`.
- Tests/config/dependencies: `tests/unit/storage.test.ts`, `tests/unit/export.test.ts`, `tests/unit/printable.test.ts`, `tsconfig.tools.json`, `tsconfig.worker.json`, `package.json`, `package-lock.json`.
- Generated outputs: `public/print/design-002.pdf`, `generated/print-design-002.json`, `public/catalog.dev.json` (existing artwork/accessibility packages reused).
- Documentation: `AGENTS.md`, `README.md`, `STATUS.md`, `DECISIONS.md`, `THIRD_PARTY_NOTICES.md`, this report, and a continuation pointer appended to the historical WP03 report.

All existing source art, histories, prepared geometry, recipes, stable IDs, and reviews were preserved. No WP05 work, commit, push, deployment, or publication was performed.

## Remaining evidence

- Not run: physical-phone/pinch tests, screen reader, physical print, or browser restart across an OS restart. Desktop reload restoration was tested.
- Simulated in automated tests: storage denial/failure, corrupt snapshot/recovery copy, and delayed saves. Actual browser quota exhaustion was not forced.
- Archived-version selection is implemented and version isolation is tested; there is currently only one reviewed production geometry version, so a real two-version browser journey remains untested.
- Full collection and production-release gates remain pending for later work packages.

Next action: owner review of the new studio in the normal browser, followed by physical-phone save/reload/PNG and an actual-size print check when available.
