# Third-party software and font notices

This inventory was read from the installed package metadata and [package-lock.json](package-lock.json) for the WP02 checkpoint on 6 November 2026. Versions are pinned in [package.json](package.json). The project software license does not replace any dependency's license.

## Direct npm packages

| Package | Version | Use | Declared license | Full license/notice files after `npm ci` |
| --- | --- | --- | --- | --- |
| [Zod](https://github.com/colinhacks/zod) | 4.6.7 | Runtime JSON schemas used by the tools and shared contracts | MIT | `node_modules/zod/LICENSE` |
| [fflate](https://github.com/101arrowz/fflate) | 0.8.3 | Deterministic gzip region packages and future browser decompression | MIT | `node_modules/fflate/LICENSE` |
| [Node.js type definitions](https://github.com/DefinitelyTyped/DefinitelyTyped/tree/master/types/node) (`@types/node`) | 24.19.2 | TypeScript definitions for Node tools | MIT | `node_modules/@types/node/LICENSE` |
| [sharp](https://github.com/lovell/sharp) | 0.35.5 | Image decoding, normalization, derivatives, and review images | Apache-2.0 | `node_modules/sharp/LICENSE` |
| [tsx](https://github.com/privatenumber/tsx) | 4.23.15 | Run the TypeScript command-line tools | MIT | `node_modules/tsx/LICENSE` |
| [TypeScript](https://github.com/microsoft/TypeScript) | 7.0.2 | Static checking | Apache-2.0 | `node_modules/typescript/LICENSE`, `node_modules/typescript/NOTICE.txt` |
| [Vite](https://github.com/vitejs/vite) | 8.3.6 | Development server and future site build | MIT | `node_modules/vite/LICENSE.md`, including bundled dependency notices |
| [Vitest](https://github.com/vitest-dev/vitest) | 5.1.0 | Unit tests | MIT | `node_modules/vitest/LICENSE.md`, including bundled dependency notices |

The installed primary MIT notices identify Colin McDonnell for Zod; Microsoft Corporation for `@types/node`; Hiroki Osame for tsx; VoidZero Inc. and Vite contributors for Vite; and VoidZero Inc. and Vitest contributors for Vitest. The package files above contain the complete copyright and permission notices.

The project source package contains the dependency declarations and lockfile. npm supplies the packages, their license files, and their additional notices during installation. This index describes the current dependencies; it is not a substitute for their complete notices or a claim that every transitive component has the same license.

## Transitive and native packages

The complete resolved dependency graph is in `package-lock.json`. Optional native packages vary by operating system and processor; `npm ci` selects the appropriate packages for the recipient's machine. All recorded resolved package URLs in this checkpoint use the public npm registry.

Image-processing packages observed in the installation include:

| Package | Version | Declared license |
| --- | --- | --- |
| `@img/colour` | 1.1.0 | MIT |
| `@img/sharp-linux-x64` | 0.35.5 | Apache-2.0 |
| `@img/sharp-libvips-linux-x64` | 1.3.4 | LGPL-3.0-or-later |
| `@img/sharp-wasm32` | 0.35.5 | Apache-2.0 AND LGPL-3.0-or-later AND MIT |

The LGPL declaration belongs to the libvips/native package metadata; sharp's own package declares Apache-2.0. Preserve each distribution's supplied notices when distributing those components. The native image tools are build dependencies, not a remote browser service.

Node.js and npm are separately installed prerequisites with their own notices. They are not bundled with this source checkpoint. A later production bundle must carry the notices for the packages actually included in that bundle. Refresh this inventory when adding the region-compression, PNG, PDF, or browser-testing packages specified in the technical design.

## Included font

WP04 additions (exact versions pinned in package.json and package-lock.json): `fast-png` 6.4.0 (MIT), `pdf-lib` 1.17.1 (MIT), `@pdf-lib/fontkit` 1.1.1 (MIT). Test-only additions are `fake-indexeddb` 6.2.4 (Apache-2.0) and `happy-dom` 21.0.4 (MIT). Their complete notices are supplied in their installed package directories. PNG encoding runs locally in the browser worker; PDF generation uses the local Node tools.

**Liberation Sans Regular, version 2.1.5** is included at `source/fonts/LiberationSans-Regular.ttf`. Its complete copyright notice and **SIL Open Font License 1.1** are included at [source/fonts/OFL-Liberation.txt](source/fonts/OFL-Liberation.txt).

The notice records digitized data copyright © 2010 Google Corporation and copyright © 2012 Red Hat, Inc., with the reserved names specified in that file. The font's acquisition and measured checksums are documented in [Source provenance](docs/SOURCE_PROVENANCE.md). The font remains under its OFL terms.
