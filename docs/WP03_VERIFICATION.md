# WP03 verification record

**Date:** 2026-11-06
**Scope:** `design-002` browser editor implementation candidate

## Implemented

- Twelve named colors with Blue selected initially.
- Tap-to-fill using the reviewed hit map.
- Undo, Redo, and a confirmed Start over that is one undoable action.
- Fit, button zoom, one-pointer pan, two-pointer pinch zoom, and guarded tap detection.
- Reviewed keyboard region order/names, Previous/Next region, Fill selected area, arrow/Home/End/Enter/Space operation, visible selection overlay, and polite status text.
- Show/Hide original using the reviewed public `photo-002` record without changing coloring state or viewport.
- Worker-side package checksum/size/schema validation, gzip/raw checksum validation, region-map geometry validation, and accessibility-metadata validation before painting is enabled.
- Worker-side native composition and viewport rendering; the hit map is transferred once to the main thread for synchronous hit testing.
- One render in flight plus one replaceable latest render request; stale frames are rejected.
- Route abort/disposal terminates the worker and clears editor state.

## Checks completed in the build environment

1. `src/editor/reducer.ts`, `src/shared/coordinates.ts`, and `src/editor/compositor.ts` passed strict TypeScript checking with the available global TypeScript compiler.
2. A compiled runtime harness passed reducer, reset/undo, coordinate, zoom, blank-composition, and viewport-frame checks (`PURE_CHECKS_PASSED`).
3. Every TypeScript file in `src/` passed a TypeScript syntax/transpile diagnostic pass (`ALL_SRC_SYNTAX_OK`).
4. The real `design-002` package was checked directly: 45 hit-map regions are present; each geometry record matches its hit-map seed, count, bounds, and centroid; retained hit pixels preserve paint ownership; all three gzip files use zero timestamps; decoded sizes match the package.
5. The initial browser validator incorrectly compared geometry counts to the expanded paint map. The direct package check exposed that error; the validator was corrected to use the hit map, matching the existing Node validator.

## Checks that must be run in the project owner's Node 24 environment

The task container has Node 22 and cannot resolve the npm registry, so it could not complete a clean dependency installation or execute the existing Vitest/Vite suite. This is an environment limitation, not a recorded pass.

Run from the project root in Windows PowerShell:

```powershell
npm.cmd ci
npm.cmd run typecheck
npm.cmd test
npm.cmd run validate -- --stage catalog
npm.cmd run validate -- --stage assets --id design-002
npm.cmd run dev
```

Then smoke-test `#/coloring/design-002`:

1. Select Red and tap a pane. Only that region changes.
2. Undo and Redo.
3. Start over; choose Keep coloring. Repeat and choose Remove colors; Undo should restore the whole prior coloring in one step.
4. Pan and pinch without creating a fill. Use Zoom in, Zoom out, and Fit picture.
5. Show original, then Hide original. The coloring, selected color, history, and coloring viewport must remain unchanged.
6. Focus the drawing. Use arrow keys, Home/End, and Enter/Space. Tab must leave the drawing normally.
7. Navigate away during loading and return. An old worker/session must not repaint the new page.
8. Repeat with `npm.cmd run dev -- --base=/fcc-stained-glass/` and open `/fcc-stained-glass/#/coloring/design-002`.

Physical-phone, screen-reader, and production-release checks remain pending until performed.
