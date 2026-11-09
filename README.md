# FCC stained-glass coloring

48 coloring pages based on the supplied photographs of First Congregational
Church, Kalamazoo; 55 photographs; 48 printable Letter PDFs; a 51-page book.

Progress is saved only in this browser's IndexedDB. There are no accounts,
cloud saves, analytics, database server, or upload API. Static hosting serves
the application and its included images/downloads. Different site origins
(such as localhost and the public site) have separate local saves.

## Run from a clone or Download ZIP

Install Node **24** (required: >=24 <25), with npm. In the folder containing
package.json, run these commands separately. Windows PowerShell uses npm.cmd;
other systems use npm.

```powershell
node --version
npm.cmd --version
npm.cmd ci
npm.cmd run dev
```

Open the printed local URL. Installation's no-argument prepare hook is a no-op;
it does not regenerate artwork. Required sources and prepared files are ordinary
included files, with no Git LFS, submodule, Drive login, or project secrets.
A source ZIP works without a .git directory, including in a path with spaces.

## Use the site

Choose About the stained glass or Coloring pages. Color by tapping a space,
or focus the drawing and use arrow keys and Enter. Palette buttons have
accessible color names. Undo/Redo are beside the colors. Clear asks first and
can be reversed with one Undo. Zoom/Fit and Show original preserve the coloring.

Save/restore stays local. Export a colored PNG before moving to another device
or clearing browser data. Download my picture prepares the full-resolution
coloring even while the original photo is displayed. Save image downloads it;
Open image provides a browser fallback. Earlier drawing versions remain
available for restoring older local work; their colors are not remapped onto
new geometry.

Every gallery page and editor links its blank one-page PDF. The gallery also
offers the complete book: supplied two-building cover, introduction, all 48
numbered sheets, sources and credits. Print on Letter at 100%; use Fit on A4.
Historical interpretations are explicitly labeled likely. Unconfirmed locations
and unknown photographer/artist credits are not invented.

## Check and build

Run commands separately, with tests after mutating preparation/catalog commands
finish. A live promotion journal intentionally blocks repository-reading checks.

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run validate -- --stage catalog
npm.cmd run validate -- --stage assets
npm.cmd run validate -- --stage assets --id design-002
npm.cmd run pdf -- --validate
npm.cmd run validate -- --stage release
npm.cmd run build
npm.cmd run preview
```

The strict build typechecks, validates sources, all packages (including retained
versions), reviews, print freshness and exact-hash print review, generates
catalog.json, bundles the worker/application, audits every deployed asset,
and promotes dist with a hashed build receipt. catalog.dev.json is excluded.
The preview server infers the mount path from that receipt; occupied ports,
missing roots and malformed paths fail explicitly.

SITE_BASE overrides the path. In GitHub Actions, the actual GITHUB_REPOSITORY
determines the project path (or / for an account-root site); a configured
custom domain uses /. Local builds default to /. The source link follows the
current workflow repository, with project.json as the local/ZIP fallback.

```powershell
$env:SITE_BASE = '/renamed-project/'
npm.cmd run build
Remove-Item Env:SITE_BASE
npm.cmd run preview -- --port 5174
```

## Maintain content

Preserve source bytes and stable IDs. Photo filenames do not identify historical
subjects. content/reviews receipts bind actual assertions, source hashes,
geometry versions and keyboard metadata; preparation never approves a review.

- Caption/history: edit content, review the changed assertions, run pdf, build.
- Geometry: edit tracked config/masks, prepare --id design-NNN, inspect the full
  numbered/fill overlays and small details, author names, record review, pdf, build.
- Photo derivatives: prepare --all --photos-only; inspect if settings changed.
- Cover/book order/intro/credits: edit content/book.json, pdf, render all pages,
  inspect changed rasters, update the exact-hash print review, build.
- Source replacement: use import's explicit replacement options; retain archived bytes.
- Existing source verification: npm.cmd run import -- --verify-existing.

```powershell
npm.cmd run prepare -- --id design-009
npm.cmd run pdf -- --id design-009
npm.cmd run pdf
npm.cmd run catalog -- --mode development
```

The region plans and observations are in docs/region-reviews. Recording tools
require their visual evidence, which can be regenerated under .work. A completed
historical review may honestly leave a subject/location unidentified.
Modern source credits and the relationship between the two historical south
window descriptions remain documented uncertainties.

## Regenerate and package

In a disposable copy, keep source, content, code and generated/recipes. Remove
prepared outputs/registries only in that copy, then run import --verify-existing,
prepare --all --include-archives, pdf, catalog --mode release, validate --stage
release, build. Compare canonical PNGs, decompressed maps, versions and print
input digests with the original snapshot. Frozen recipes preserve old geometry.

```powershell
npm.cmd run package:site
```

This creates release-artifacts/fcc-stained-glass-site.zip and its receipt using
a relative ./ base. Extract and serve the folder with any ordinary static HTTP
server; double-clicking index.html as a file URL is not supported.
The portable build can be mounted under a renamed path. It includes all images,
packages, names and PDFs. It does not require Node for visitors or upload saves.

## Publish and copy the project

Publishing requires maintainer access; ordinary visitors and anonymous clones
do not. Configure Settings → Pages → Source: GitHub Actions. pages.yml checks,
builds and deploys main pushes/manual dispatches. verify.yml checks pushes and
pull requests without publication. release.yml produces a portable artifact
on tags/manual dispatch. Actions are pinned to reviewed commits and use Node 24.

For another repository, copy all ordinary files, update project.json's public
repository URL, initialize/push that repository and enable its own Pages workflow.
A public source ZIP contains the complete project at that revision. Build and
preview never publish. No required file is a symlink to this machine.

Source: https://github.com/ShootPara/fcc-stained-glass
Intended Pages URL: https://shootpara.github.io/fcc-stained-glass/

## Evidence and limits

See STATUS.md and docs/WP05_COMPLETION_RESULTS_2026-11-09.md for actual completion
and deployment status. The local completion run uses Node v24.13.0 / npm 11.6.2.
Desktop and 360-pixel viewport checks do not certify physical touch/pinch,
screen-reader operation or paper printing; those remain explicitly untested.

Earlier milestone records remain in docs/. README_ARCHIVE_PRE_WP05_2026-11-09.md
and STATUS_ARCHIVE_PRE_RELEASE_2026-11-09.md preserve superseded continuation text.
ASSET_CREDITS.md and THIRD_PARTY_NOTICES.md distinguish source materials from
the application's MIT license and included font/software licenses.
