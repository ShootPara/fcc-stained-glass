# WP03 handoff: first usable browser editor

## 1. Goal and authority

Make **one drawing, `design-002`, usable for coloring in the browser**. Implement
color selection, tap to fill, Undo, Redo, confirmed Start over, zoom, pan, Fit
picture, keyboard coloring, and Show/Hide original. Keep the other 47 drawings
visible as unavailable in the development collection.

Read [STATUS.md](../STATUS.md), [AGENTS.md](../AGENTS.md), and
[DECISIONS.md](../DECISIONS.md) first. The behavior comes from
[REQUIREMENTS.md](../REQUIREMENTS.md), especially §§4, 9 and AT10–14/AT22–24.
The implementation contracts come from
[TECHNICAL_DESIGN.md](../TECHNICAL_DESIGN.md), §§8–9 and WP03 in §15. Those
documents and subsequent owner decisions remain authoritative; this file is an
implementation sequence, not a replacement specification.

The owner has chosen a plain home: a modest church name and exactly **About the
stained glass** and **Coloring pages**. Preserve that choice. Keep useful editor
instructions and factual artwork descriptions; do not restore promotional home
copy from older examples in the requirements.

WP03 uses in-memory editing state. IndexedDB, cross-tab saving, restore choices,
colored PNG export, individual PDFs, the book, full-collection preparation, and
publication belong to later work packages. Keep the existing blank PNG download
working. Do not show a successful save status or a colored-download control
before those functions exist.

## 2. Starting inputs: preserve these

| Input | Current value or location |
| --- | --- |
| First printed coloring page | Book number **1**, stable ID **`design-002`**, source `source/coloring/002.png` |
| Visible title | **Sun, moon, star and waves** |
| Prepared drawing | **1024 × 1536**, **45** positive region IDs |
| Content version | `45e61ecb9662f4430786d85ea43b7edddeb2a8180b743d3f9c3e59dc3dd6a85e` |
| Package | `public/art/design-002/<contentVersion>/package.json` |
| Frozen recipe | `generated/recipes/design-002/<contentVersion>/recipe.json` and its four raw input files |
| Reviewed photo association | `photo-002`; use the association in the public catalog |
| Photo proportions | Web derivative **1324 × 2000**, distinct from the drawing proportions |
| Authored keyboard names | `content/accessibility/design-002/<contentVersion>.json`, supplied by the WP02 visual review |
| Browser keyboard names | Catalog `versions[contentVersion].accessibility` receipt; generated under `public/accessibility/` |

Here and below, `<contentVersion>` means the complete hash above. These are
baseline facts from `content/artworks.json` and `generated/assets.json`.
**Runtime code must read the selected version and paths from the public
catalog, not hardcode this table.**

Check the WP02 review handoff before finishing the editor: the selected version
must have complete keyboard metadata and a matching segmentation review. If an
expected authored file or receipt is absent, report that exact missing WP02
prerequisite and continue independent WP03 work. Do not manufacture review
completion or substitute guessed region names.

Do not resegment the drawing, renumber regions, edit its source, change its
mask, or mutate its version directory to solve a browser problem. The eight
explicit barrier corrections are already part of the frozen version. Source
and preparation code stay available for reproduction.

## 3. Existing code and new modules

| File or group | Status and intended use |
| --- | --- |
| `src/main.ts`, `src/styles.css`, `index.html` | Existing home, galleries, static drawing/photo details, retry UI and skip link. Refactor incrementally; retain functioning routes. |
| `src/config.ts` | Existing `assetUrl(relativePath)` resolves a public path against the application base and rejects unsafe paths. Keep this boundary. |
| `src/shared/public-catalog.ts` and `public-catalog-schema.ts` | Existing `DevelopmentCatalogSchema`, `PublicArtwork`, `PublicPreparedVersion`, `PublicPhoto`, and public file receipts. Public paths omit the `public/` prefix. |
| `src/shared/assets.ts` | Existing `RegionPackageSchema`, `RegionGeometryFileSchema`, `AccessibilityMetadataSchema`, binary receipts and allocation bounds. Safe shared contracts. |
| `scripts/lib/validate-assets.ts` | Existing **Node-only** reference for package, gzip, hash, geometry and metadata checks. Browser code must not import it, `sharp`, or Node built-ins. |
| `scripts/lib/algorithms/regions-v1.ts` | Existing preparation algorithm and tested `compositeRgba` reference. It imports Node-side helpers; do not bundle this file into the browser. |
| `src/router.ts`, `src/data/catalog.ts`, `src/screens/*` | New: extract routing, validated catalog loading and screens from `main.ts`; own navigation/disposal rather than pixel logic. |
| `src/shared/coordinates.ts`, `src/shared/editor-protocol.ts` | New: pure coordinate functions and typed worker message envelopes. No DOM or Node side effects. |
| `src/editor/reducer.ts`, `src/editor/controller.ts` | New: pure state/history transitions, then one guarded editing session. |
| `src/editor/package-loader.ts`, `src/editor/worker.ts`, `src/editor/worker-client.ts` | New: browser byte validation, worker map ownership, request tracking and render coalescing. |
| `src/editor/compositor.ts` | New: browser-safe native RGBA composition and viewport sampling. |
| `src/editor/gestures.ts`, `src/editor/keyboard.ts`, `src/editor/view.ts` | New: pointer state machine, keyboard commands, accessible controls, canvas and reference view. |
| `tests/unit/*`, `tests/fixtures/*` | Existing Node Vitest suite; add focused pure-state, coordinate, protocol and rendering tests. Add a browser test harness only when needed and record its exact command. |

`tsconfig.app.json`, `tsconfig.worker.json`, and `tsconfig.tools.json` already
separate environments. Keep strict checking. Worker dependencies must remain
usable with the WebWorker library and no `document`; shared modules must not
perform I/O on import. `fflate` is already an exact pinned runtime dependency.

## 4. Implement in this order

### Step A — Pure state and coordinates

Implement the reducer before connecting buttons. Store actual uppercase
`#RRGGBB` values by positive region ID; absence means uncolored, while explicit
white is a real assignment. Use the twelve named palette values in Requirements
§9.3, with Blue `#1976D2` selected initially.

Each meaningful fill records `{regionId, before, after}`. Reapplying the same
value does nothing. Keep the latest 100 meaningful history commands. A new fill
after Undo clears Redo. Confirmed reset is one batch of the previously filled
regions, so one Undo restores the whole coloring. Palette and viewport changes
do not enter coloring history.

Keep `paintRevision`, `viewportRevision`, and `localStateRevision` separate as
defined in Technical Design §9.1. Initialize blank in-memory state before
enabling painting; WP04 will add the restoration step at that readiness gate.

Implement the `Viewport` contract from §9.2. Fit scale is
`min(cssWidth / imageWidth, cssHeight / imageHeight)`; relative zoom is 1–8.
Preserve the image point at the zoom anchor, clamp pan so the image remains
reachable, and center any dimension that fits. Resize reconstructs the view
from relative zoom and normalized image center. Zero or nonfinite stage sizes
defer rendering.

For a hit, read the **current** stage rectangle, subtract its left/top from
`clientX/clientY`, invert translation and scale, floor, and reject outside
coordinates before indexing `hitLabels`. Never multiply pointer coordinates by
DPR. Rendering uses the corresponding output-pixel-center formula in §9.2 so
rounded backing dimensions and hit testing agree.

**Checkpoint:** reducer and transform tests pass before DOM integration.

### Step B — Validated package loading and rendering

Fetch `catalog.dev.json` with `cache: 'no-store'` and validate it with
`DevelopmentCatalogSchema`. Select `artwork.activeVersion` and its version
record. Resolve the package and accessibility receipts with `assetUrl`; resolve
package-member names against the **package URL**, never the worker bundle URL.
Only the selected drawing's full package is loaded.

Use `new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })`
from the worker client. Keep the message envelope from Technical Design §9.3:
`sessionId`, `requestId`, `artworkId`, `contentVersion`. Implement `load`,
`ready`, `render`, `frame`, and originating-request `error` messages in WP03;
reserve export behavior for WP04.

Before `ready`, validate all of the following:

1. Package receipt byte count/SHA-256, JSON schema, artwork/version identity,
   supported algorithm, dimensions and allocation bounds.
2. Every required member receipt, compressed size/hash, gzip format and zero
   timestamp, exact dimension-derived decoded byte count, and raw SHA-256.
   Use browser SHA-256 and bounded decompression with the pinned `fflate`;
   do not trust a gzip trailer or allocate from an unchecked declared size.
3. `hit.bin` and `paint.bin` as explicit **little-endian u32** maps; `ink.bin`
   as u8. Validate ID ranges, positive-ID coverage, seed/geometry consistency
   and retained interior ownership against `regions.json`.
4. The canonical image receipt and dimensions. Use the Node validator and
   fixtures as the reference for semantic checks; do not regenerate regions
   in the browser.
5. The accessibility receipt/schema, matching artwork/version, and exactly one
   named entry per positive ID with a valid unique navigation order. Join the
   names/order to generated geometry and seeds before returning `ready`.

Transfer the validated `hitLabels` buffer **once** to the main thread for
synchronous hit tests. The worker retains `paintLabels` and `inkAlpha` and
stops using the detached hit buffer. Transfer newly produced frame buffers,
never live paint/ink maps.

Build a native opaque RGBA composition from the small immutable fill snapshot.
For each pixel, choose white for owner 0 or an unfilled region; otherwise use
the assigned color. For every RGB channel calculate
`Math.round(fillChannel * (255 - inkAlpha) / 255)` and set alpha to 255.
An unfilled image must equal the canonical grayscale at every pixel.

The native cache starts **invalid**, even at paint revision 0; key it by session,
content version and paint revision. Use one viewport-sized display canvas with
DPR capped at 2. Downscale by area-averaging composed RGB; at native size or
above use nearest-neighbor sampling. Never interpolate region IDs. The typed
RGBA path must work without OffscreenCanvas. Display worker frames at canvas
`(0, 0)` without applying a second pan/zoom transform.

Permit one render request in flight and one replaceable latest pending request.
Accept a frame only when session, artwork, version, paint revision and viewport
revision match the desired view. A render error releases the in-flight slot
and permits Retry; disposal rejects pending work and terminates the worker.

**Checkpoint:** compare a blank browser composition to the real canonical
image; test filled antialiased edges, revision-zero initialization, malformed
maps, stale replies and a failed-render queue recovery.

### Step C — Controller, lifecycle and gestures

Implement the usable WP03 subset of `openEditor(artworkId, host, {signal,
contentVersion?})` from §8.2: `dispatch`, `setReferenceVisible`, `setViewport`,
and `dispose`. WP04 adds `prepareDownload` and saving services. Both touch and
keyboard must call the same controller `dispatch` guard. Reject fills until
loading/validation and initial-state setup finish, while the original is
visible, and for region 0, unknown IDs or outside coordinates.

Create a route AbortController **before** awaiting `openEditor`. Navigation
aborts unresolved loads, fetches, and event setup. Check the signal after each
async boundary; terminate the worker and dispose any partially created view.
Dispose the previous screen on every route change. Old replies must never
paint into a new screen. Loading/error states retain the blank drawing,
navigation and existing blank download. Retry creates a fresh session.

Implement Pointer Events states `idle`, `pendingTap`, `pan`, and `pinch`.
Capture pointers. Movement over **8 CSS pixels** cancels the tap and starts
pan. A second pointer cancels painting until **all** pointers have lifted;
lifting one pinch finger must not create a new pending tap. Cancellation,
lost capture, resize and navigation clear pending gesture state. Only an
eligible single-pointer release dispatches fill. Mouse primary input uses
this same path; no additional click-to-fill handler. Apply `touch-action:
none` only to the drawing stage so the surrounding page scrolls normally.

**Checkpoint:** delayed loading followed by navigation cleans up completely;
pan/pinch/cancellation tests produce zero accidental fill commands.

### Step D — Controls, original photo and keyboard

Use a short title and **Back to pages**, stage, named palette, then wrapping
action groups. Required working labels include **Undo**, **Redo**, **Start
over**, **Zoom in**, **Zoom out**, **Fit picture**, and **Show original / Hide
original**. Disable unavailable history actions. Start over asks **Remove the
colors from this picture?**, with **Keep coloring** and **Remove colors**.

Show original uses `artwork.originalPhotoId` and that public photo's web
receipt. Fit the photograph using its own proportions. Showing/hiding it
preserves fills, history, selected color and coloring viewport. Photo failure
offers Retry without losing coloring. Photo identity or church location must
not be inferred from a number; historical location remains unconfirmed.

Give the stage a visible focus indicator. Reviewed metadata supplies region
names and order. Provide **Previous region**, **Next region**, and **Fill
selected area** buttons. In the focused stage, Left/Up selects previous,
Right/Down next, Home/End first/last, Enter/Space fills, and Tab leaves normally.
Reveal the selected region in the viewport and show a selection outline as a
UI overlay, separate from composition. Announce the area/current color and
meaningful changes through a concise polite status. Keep the useful keyboard
instruction from Requirements §9.4.

Use visible color names plus a non-color selection cue and programmatic state.
Controls target 48 × 48 CSS pixels. Reflow at 320 pixels and enlarged text;
avoid a fixed-height page that clips the controls. Preserve the skip link,
semantic headings, readable contrast and normal scrolling. Preserve the existing
Skip to content handler: focus main without replacing the hash route with `#main`. Keep
both home choices visible at a typical 360 × 800 portrait viewport.

## 5. Commands and expected smoke test

Run commands in the folder containing **this project's `package.json`**. In
Windows PowerShell use `npm.cmd`, which avoids the blocked `npm.ps1` launcher.
Use Node 24. Commands below are existing scripts, not proposed future scripts.

```powershell
npm.cmd ci
npm.cmd run typecheck
npm.cmd test
npm.cmd run validate -- --stage catalog
npm.cmd run validate -- --stage assets --id design-002
npm.cmd run catalog -- --mode development
npm.cmd run dev
```

`npm.cmd ci` invokes the no-argument prepare lifecycle, which stays a no-op.
`npm.cmd run dev` also regenerates the development catalog through `predev`.
Open `http://127.0.0.1:5173/`. Stop the server with Ctrl+C before starting
another instance on that port. On macOS/Linux, replace `npm.cmd` with `npm`.

**Current WP02 screen:** the home has the church name and two choices. Coloring
pages lists 48 records; its first available drawing is **Sun, moon, star and
waves**, book page 1 (`design-002`). Opening it shows the blank drawing, blank
PNG download and Original photo link. The remaining 47 designs remain Coming
soon. The photo page displays the matching stained glass with honest unknown
location wording. No working coloring controls exist before WP03.

**WP03 smoke result:** opening `#/coloring/design-002` now shows that same
drawing with a working editor. Select Red, fill one pane, Undo, Redo, cancel
Start over, confirm it, then Undo the reset. Zoom and pan without filling.
Show/Hide original and confirm the same coloring/view returns. Color a named
area entirely by keyboard. Navigate Home during a delayed load and return;
the previous session must not reappear or affect the new editor. WP03 starts
a new blank session after leaving/reloading; persistent restoration is WP04.

Also stop the server and check a repository base path:

```powershell
npm.cmd run dev -- --base=/fcc-stained-glass/
```

Open `http://127.0.0.1:5173/fcc-stained-glass/#/coloring/design-002`. Confirm
catalog, worker, package, accessibility metadata and original photo load
beneath that base. This development smoke check is not a release build or a
publication. The full release build remains gated by later work.

## 6. Completion evidence

| Check | Concrete pass condition |
| --- | --- |
| AT10: coordinates | Known interior points select the same ID at zoom 1/2/8, DPR 1/2, after page scroll, resize and rounded backing dimensions; outside points do nothing. |
| AT11: gestures | Pan, pinch, lifting one pinch finger, cancel and lost capture each emit zero fills; a valid single-pointer tap emits one. |
| AT12–13: editing | All 12 colors work; same-value fill is a no-op; Undo/Redo and redo invalidation are correct; reset cancel preserves state and one Undo reverses confirmed reset. |
| AT14: reference | Show/Hide original preserves fills, palette, history and viewport; photograph failure is recoverable. The export clause stays pending for WP04. |
| AT22–24: access | Exactly two home choices; 320-pixel and enlarged-text reflow; every one of the 45 areas is reachable, visibly selected and fillable by keyboard; Tab exits; labels/statuses are checked. Download mechanics stay pending for WP04. |
| Lifecycle/protocol | Navigating during load/render disposes maps, worker and listeners; stale/wrong-version replies are ignored; failed render does not deadlock the queue; only one package stays active. |
| Rendering/integrity | Blank canonical equivalence, opaque composition, correct colored antialiased edges, reduced-size thin lines, bounded byte validation and meaningful corrupted-package failure. |
| Existing behavior | Typecheck, existing/new unit tests, catalog validation and selected assets validation pass; stable routes, photo/history content and baseline immutable package remain intact. |

Record exact commands, browser/device, viewport, date and evidence paths in
`docs/WP03_VERIFICATION.md` when implemented. Separate automated results,
desktop emulation, screen-reader checks and physical-phone results. Mark a
physical test pending if it was not performed. Update `STATUS.md` only with
observed results and the concrete next action. Stop at WP03 completion; WP04
then adds saving and downloads to this working representative editor.
