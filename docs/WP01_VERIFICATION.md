# WP01 verification record

**Checkpoint:** WP01 complete, 6 November 2026.  
**Environment:** Linux; Node **v24.22.1**; npm **11.9.0**.  
**Scope:** Complete project source, initial schemas/catalog, importer and recovery,
installation, development-shell serving, and explicit unfinished-release gates.

This record documents the original WP01 checkpoint. Subsequent interface
refinements and their checks are recorded in STATUS.md.

## Result

The WP01 completion conditions in technical-design Section 15.1 passed.
The initial source inventory contains **110 real local material files totaling
258,074,562 bytes**. The catalog contains all **55 photographs** and **48 designs**.
All **117 unit tests in 8 files** passed in a fresh extracted copy.

This checkpoint has no reviewed coloring regions, completed media/history
identifications, finished editor, printable pages, public repository, or published
site. Their later work packages remain pending in STATUS.md.

## Source acquisition and integrity

| Material | Count | Bytes |
| --- | ---: | ---: |
| Original JPEG photographs | 55 | 178,148,458 |
| Coloring PNGs | 48 | 77,731,242 |
| Selected cover source | 1 | 1,486,541 |
| Supplied DOCX histories | 2 | 126,798 |
| Full history text derivatives | 2 | 166,397 |
| Font and full font license | 2 | 415,126 |
| **Total** | **110** | **258,074,562** |

The 106 originals obtained from Drive matched the metadata byte counts. Image
integrity and DOCX ZIP integrity were checked during acquisition. The 108
acquired/derived files were rehashed independently against the transfer and
extraction receipts; the font and license matched their recorded acquisition
hashes. The importer then measured all 110 entries for source/manifest.json.
Every acquisition entry now pins both expected bytes and SHA-256.

Catalog validation checked the actual files against the manifest. A second
import invocation from an unrelated working directory returned 110 unchanged
files, zero copied files, zero added IDs, and `manifestChanged: false`.

The included histories preserve 619 H28 paragraphs and 228 H35 paragraphs.
The optional extraction recipe in SOURCE_PROVENANCE.md reproduced both TXT
files byte-for-byte. The original supplied DOCX transcriptions are retained;
printed-book scans and pagination are not implied.

## Fresh source-ZIP check

A source archive was assembled from the complete tracked file list, then
extracted to a new path containing spaces. That copy initially had **no `.git`
directory and no `node_modules` directory**. A blank npm user-configuration file
was used, and common npm/GitHub/Google credential variables were removed from
the command environment. Dependencies resolve to the public npm registry.

The SHA-256 of every one of the 219 files in that validation snapshot was
recorded before installation. The same set was compared after `npm ci`, then
again after all checks. **No file changed.** This includes source images,
transcriptions, manifests, authored content, generated registries, the tracked
development catalog, and package-lock.json. npm's no-argument `prepare` lifecycle
ran and reported `No assets changed.`

The original WP01 delivery added this retained evidence and the completed status
record. At that checkpoint, its implementation and source-material bytes matched
the checked copy. The file list is [WP01_FILES.txt](WP01_FILES.txt).

| Command | Observed result |
| --- | --- |
| `npm ci` | Exit 0; clean installation; no tracked file changes. |
| `npm run typecheck` | Exit 0; browser, worker/shared, and Node configurations pass. |
| `npm run validate -- --stage catalog` | Exit 0; all 55/48 records and all 110 source files verified. |
| `npm test` | Exit 0; 117 tests in 8 files pass. |
| `npm run catalog -- --mode development` | Exit 0; complete 55/48 inventory; zero available designs and no exposed candidate photo pairings. |
| `npm run prepare -- --id design-002` | Expected exit 4, `E_PREPARATION_PENDING`; WP02 not implemented. |
| `npm run validate` | Expected exit 4, `E_STAGE_NOT_READY`; full release not implemented. |
| `npm run build` | Expected exit 4, `E_RELEASE_PENDING`; no production files promoted. |

Raw command logs and the machine-readable check record are retained in
[verification/wp01/verification.json](verification/wp01/verification.json) and
the neighboring `.log` files. Durations describe this environment, not a speed
promise for other computers.

## Meaningful behavior checked

- Relative paths remain inside the project and work from other working
  directories and paths containing spaces. Symlinks and traversal fail.
- Actual source bytes, hashes, dimensions and image formats match receipts;
  corruption, changed bytes and LFS pointer text are rejected.
- Duplicate/missing IDs, invalid evidence and references, swapped photograph
  sources, drawing-source conflicts, and invalid book order fail validation.
- Stable media identities remain independent of captions and list ordering.
  Same-number filename candidates are not public photo matches.
- Repeated import is idempotent; different incoming bytes require an explicit
  replacement. Previous originals and receipts are archived before replacement.
- Equal-byte sources under different IDs retain separate archive receipts.
- Failed promotions roll back. Tests terminate real child processes during
  promotion and during rollback cleanup, then verify recovery on the next run.
- The no-argument prepare lifecycle does not touch project source or prepared
  assets; incomplete preparation and release work cannot report success.
- The public draft projection withholds source paths, acquisition URLs and
  private review rationale, preserves ordering, and hashes sources deterministically.

## Development-shell check

`npm run dev` generated the catalog and started Vite successfully. A separate
HTTP smoke check started the same Vite server and fetched the HTML, compiled
browser entry and development catalog. HTML and script responses were HTTP 200;
the catalog contained 55 photograph records and 48 unavailable coloring records.
The browser entry contains the two intended home choices.

This was an HTTP/compilation check. The optional headless browser probe could
not run because this environment had no installed Chromium binary. No rendered
mobile, gesture, keyboard, coloring, or physical-device acceptance test is
claimed at WP01. Those checks belong to WP03 and later work packages.

## Portability evidence and remaining release checks

All required sources are ordinary files inside the project. The source ZIP
contains no Git metadata, node_modules, work cache, or required external symlink.
The largest current file is the original south-window photograph at
**16,325,926 bytes**, below the project's 95 MiB per-file guard.

PowerShell wrappers were reviewed but not executed on Windows. The normal npm
commands were executed on Linux. There is no remote repository yet, so anonymous
GitHub cloning and GitHub Download ZIP were not exercised. The clean local source
archive check is completed; final GitHub, root/subpath, built-site archive,
phone, print, and signed-out release checks remain WP06 or their assigned earlier
work packages. The first npm installation still requires access to public package
downloads; Node and node_modules are not bundled in the source package.
