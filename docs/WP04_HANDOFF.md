# WP04 handoff: save coloring and download the finished picture

Do not begin WP04 until the WP03 project checks and browser smoke test in `docs/WP03_VERIFICATION.md` pass.

## Goal

Add device-local saving/restoration and a native-size colored PNG download to the working `design-002` editor. Keep all WP03 behavior unchanged.

## Read first

- `REQUIREMENTS.md` Sections 10 and 11.
- `TECHNICAL_DESIGN.md` Sections 9.6 and 10.
- `STATUS.md`.
- `docs/WP03_VERIFICATION.md`.

## Required order

1. Implement and unit-test IndexedDB records keyed by site namespace, artwork ID, and content version.
2. Implement conditional revision writes and the serialized save coordinator. A failed read must never authorize overwriting a record.
3. Restore validated saved work before painting is enabled. Different content versions must never silently receive old region assignments.
4. Keep unsaved in-memory work alive through editor disposal while queued writes finish.
5. Add worker `export` / `exported` messages. Capture an immutable fill snapshot and paint revision; render the complete native 1024×1536 drawing, not the current viewport.
6. Encode an opaque PNG with no selection overlay or reference photo. Provide a fresh user action to save/open it and name it `fcc-design-002-colored.png`.
7. Add clear status for Saving…, Saved on this device, storage unavailable, and cross-tab conflict without blocking in-memory coloring or PNG export.
8. Add the representative one-page printable PDF only after save and PNG behavior pass.

## Stop condition

Stop after the representative design can restore its saved coloring on the same browser/device, survive storage failures without losing the in-memory picture, download the full native colored PNG, and produce its individual PDF. Full collection preparation remains WP05.
