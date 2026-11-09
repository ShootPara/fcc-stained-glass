# FCC Stained Glass implementation instructions

Read `STATUS.md` first. Read `REQUIREMENTS.md` for visitor behavior and
`TECHNICAL_DESIGN.md` for implementation contracts. `DECISIONS.md` records
subsequent choices. The owner's current instructions govern the work.

## Current checkpoint

WP03/04 are implemented for `design-002` with 45 reviewed regions and `photo-002`.
WP05 has prepared all 48 drawings and 55 photo derivatives. All 48 drawing/photo
pairings are visually reviewed; detailed reviews and keyboard names for 003 through 049 are complete.
All 47 new active reviews and 49 retained restoration-version reviews are recorded. The owner-approved
design-005 shoulder bridge and independent design-007 shaft/fold repairs are complete.
See `docs/WP05_REGION_REVIEW_RESULTS_2026-11-09.md` and the exact queue in
`docs/WP05_COLORING_REVIEW_QUEUE.json`. Preparation never completes a review.
All 48 individual print PDFs and the 51-page anniversary book are implemented,
linked and visually reviewed. See `docs/WP05_PRINT_RESULTS_2026-11-09.md`.
The owner's latest priority is to finish WP05 first and deploy last; no
checkpoint publication exception is authorized by the superseded deploy-now idea.
The November 9
studio layout supersedes older presentation guidance: icon-only accessible
swatches, arrow Undo/Redo beside the palette, Clear, and no coloring header or
visible region chooser. WP05 is deployed and live verification is recorded in STATUS.md. The owner authorized
publishing/deployment at agent discretion on November 9; unfinished release
checks still apply. Keep progress saving browser-local only.

## Working rules

- Keep all 55 photo records and all 48 drawing records. Unprepared records stay
  visible as unavailable in the development catalog.
- Preserve stable IDs. `002.png` is `design-002`, initially book page 1. Neither
  the filename nor a matching photo number proves a historical identification.
- Keep source bytes unchanged. Use `npm run import` for explicit source
  replacement; it archives the old bytes. Captions belong in `content/`.
- Implement tools in Node/TypeScript. PowerShell files are thin wrappers.
- Use the shared path, digest, CLI, operation-lock and promotion helpers in
  `scripts/lib/`. Mutating commands must use the shared operation lock.
- `npm run prepare` without arguments is the npm installation lifecycle. Keep
  it a successful no-op that does not read or rewrite project source assets.
- Preserve complete files in ordinary Git. Required input must not depend on
  Drive, an account, Git LFS, a submodule, or an external symlink.
- Derive review completion from matching receipts. Never create a completed
  review merely because an algorithm ran or a filename looks plausible.
- Preserve versioned prepared packages and `generated/recipes/`. A source's raw
  checksum, its preparation digest, and its coloring content version are
  different identities. A caption or keyboard-name edit does not rewrite
  immutable geometry. Keyboard-name edits do invalidate the segmentation review.
- Current preparation and asset validation are implemented. Use the selected
  design check for the reviewed baseline and the full assets check for WP05. The original
  photo match is reviewed independently from pending historical subject/location.
- Use a plain, functional interface. Home shows a modest church name and exactly
  two main choices: About the stained glass; Coloring pages. Let the labeled
  controls explain the available actions. Omit promotional headlines, taglines,
  teaser paragraphs, and instructions that repeat button labels. Keep factual
  artwork/history descriptions and useful instructions, errors, and statuses.
- Add meaningful checks for the behavior being implemented. Do not mark an
  unavailable physical phone test or print inspection as passed.
- Update `STATUS.md` with actual commands/results and one concrete next action.

## Current checks

```text
npm ci
npm run typecheck
npm run validate -- --stage catalog
npm run validate -- --stage assets --id design-002
npm test
npm run dev
```

In Windows PowerShell, use `npm.cmd` in place of `npm` in these commands.

Full assets validation passes for 48 drawings, 97 retained versions and 55 photos,
with zero pending segmentation or pairing reviews. There are 206 current historical
subject/location receipts; likely interpretations and unidentified locations remain
explicit. Strict production build and release validation now pass locally. See
`docs/WP05_COMPLETION_RESULTS_2026-11-09.md` for publication and portability status.
Keep every source, frozen recipe and restoration version. Do not weaken release gates.
