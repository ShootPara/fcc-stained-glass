# FCC Stained Glass Website Requirements

## Implementation specification and model handoff

**Project:** The Stained Glass of First Congregational Church, Kalamazoo.  
**Version:** 1.0 — 6 November 2026  
**Deliverable:** Requirements for a static GitHub Pages website and its downloadable coloring book.  
**Status:** Ready to guide implementation. The website, reviewed photo matches, fill maps, and finished PDFs have not been built by this document.

Build a welcoming, easy-to-use website with two clear choices: learn about the stained glass, or choose a page to color. Visitors must be able to see the original photographs, read accessible descriptions, color by tapping enclosed areas, and download individual sheets or a complete anniversary book. The experience must work well on a phone held upright.

This specification combines the owner's decisions, a verified file inventory, the two church histories already read, and a concrete implementation design. It is intended for the owner and any developer or coding model continuing the project. The Markdown and Word editions contain the same substantive requirements. Historical source keys such as **H28** and technical source keys such as **T04** resolve to the bibliography in Appendix C.

**How to use this document:** Read Sections 1–5 for scope and content, Sections 6–13 for implementation, Sections 14–17 for verification and delivery, and the appendices for the source inventory and historical identification catalog. Start work with the handoff in Section 17. Requirements marked **must** are release conditions. Concrete defaults are selected implementation decisions; change one only for a documented reason while preserving the agreed behavior.

## 1 Product decisions and release scope

### 1.1 Decisions already made

| Area | Required decision |
| --- | --- |
| Site title | The Stained Glass of First Congregational Church, Kalamazoo. |
| Hosting | A static website published with GitHub Pages. |
| Home | Exactly two prominent selections: About the Stained Glass and Coloring Pages. |
| Audience | All ages, including people with limited reading experience and people learning English. Use respectful, plain English. |
| Original artwork | Use the supplied original church photographs and existing final coloring PNGs. |
| Digital coloring | Tap a color, then tap an enclosed area. Include zoom, pan, undo, redo, and local progress saving. |
| Reference | Visitors can show or hide the associated original photograph while coloring. |
| Downloads | Individual blank PDFs, a complete blank coloring book, and the visitor's colored picture as PNG. |
| Book cover | Reuse recent art showing both the previous and current church buildings. Celebrate the present building's 100th anniversary. |
| Historical matching | Make informed visual matches using the books and image details. Clearly qualify uncertain matches. |
| Delivery | A complete repository, usable Windows instructions, prepared public assets, and a reproducible build. The owner can run scripts. |

### 1.2 First release

The first release has **48 coloring designs**, using the existing files `002.png` through `049.png`, and **55 original-photo records**, numbered `001` through `055`. Include all 55 photographs in the history collection unless a specific file is unusable; record any exception rather than silently dropping it. The 48 coloring designs must each have a downloadable sheet and a working interactive version. These counts come from the supplied Drive folders, not from the books' window numbering. [A01, A02]

The following are outside this release: accounts, cloud synchronization, visitor uploads, public sharing galleries, freehand drawing, color-by-number instructions, payments, quizzes, translations, and offline installation. They are not needed to deliver the requested experience. A normal browser, static files, and local browser storage are sufficient.

**The current assignment produces this specification.** Implementation milestones below describe work to be done next. A listed test is not evidence that the test has already passed.

### 1.3 Selected architecture

Use **Node 24 LTS, npm, TypeScript, and Vite with the vanilla TypeScript template**. Use `sharp` for image preparation, `pdf-lib` for printable files, `fflate` for region-data compression, and `fast-png` for PNG encoding in a worker. Use GitHub Actions to build and publish `dist`. Pin the versions actually tested in `package-lock.json`, and use `npm ci` in CI. Node 24 is a supported LTS line at the date of this document; it is a deliberate stable baseline, not a claim that it is the newest release. [T01–T07]

The central implementation decision is to **prepare a reviewed map of fillable areas before publishing**. At runtime, a tap identifies an area and assigns it a color. Saving, undo, and export operate on those area assignments. Do not repeatedly flood-fill the already colored screen image.

## 2 Source material and verified facts

### 2.1 Source folders

The owner's source location is:

```text
Other computers\Brian's Alienware\Projects\ChatGPT\Coloring Book
Other computers\Brian's Alienware\Projects\ChatGPT\Coloring Book\Coloring Pages
```

The first folder contains the 55 numbered JPEG originals; its `Coloring Pages` child contains the 48 final PNGs. The corresponding Drive links are A01 and A02. A Windows drive letter has not been verified. Scripts must accept a source-root argument and must not assume a drive letter from older project files.

| Verified inventory | Finding |
| --- | --- |
| Original photographs | 55 JPEG files with prefixes 001–055; approximately 178.1 MB in the listed source files. |
| Final coloring artwork | 48 PNG files, exactly 002–049; approximately 77.7 MB in the listed source files. |
| Originals without a same-number PNG | 001 and 050–055. These remain available for history and context. |
| Sampled dimensions | 002, 003, 025, and 049 are 1024 × 1536 pixels; 044 is 977 × 1610 pixels. Only these five PNG headers were sampled. |
| Completed pairing review | The filename inventory is complete. Visual photo-to-design matching for all 48 is still required. |
| History source form | Readable transcriptions of the 1928 and 1935 books were found and read. A paginated original scan of either was not located. |

Measure the actual oriented dimensions and hashes of **every** imported file. Do not impose the common 1024 × 1536 size on all designs. Preserve each image's aspect ratio. The complete filename inventory and initial candidate pairings appear in Appendix A. [A01, A02]

### 2.2 History sources

**H28 — Our Church: Its History, Its Structure, Its Service, 1928.** This provides the main numbered window guide, aisle symbols, artist information, and the detailed north memorial description. It contains **15 numbered window groups and 64 numbered subject entries**, followed by **22 aisle and vestibule symbol entries**. The large north memorial is described separately. These are catalog structures, not a claim that the church has 64 full windows. [H28, “The Windows”; “The Aisle Windows”; “The Memorial Window”]

**H35 — First Congregational Church Centennial History, 1835–1935, October 1935.** This provides the dedication date of the present building and descriptions of the north and south memorial windows. The credited authors are Mrs. Stanley Morris, assisted by Mrs. James M. Hatfield. [H35]

The congregation dates from **1835**. The present building was dedicated on **28 October 1928**. Its dedication centennial is therefore **28 October 2028**. The cover must celebrate the building's century, not describe 2028 as the congregation's founding centennial. [H35, “The Fourth Church 1928–1935,” opening paragraph]

### 2.3 Facts that need careful treatment

The 1928 guide calls its Window 13 the south window and lists Daniel, David, Gabriel, Jonah, Christ symbols, and evangelists. The 1935 history describes a south memorial with Christ and named religious and historical figures. Preserve both descriptions. Neither text, by itself, establishes the date or mechanism of a replacement or the disposition of individual earlier panels. Do not invent that transition. [H28, “The Windows,” Window 13; H35, “The Fourth Church 1928–1935”]

H28 attributes the side-window and its described south-window allegorical work to **A. L. Brink**. That does not establish the maker of the differently described H35 south memorial. H28 names **Alfred E. Floegel of New York** as the north memorial designer. **Aymar Embury II** is the building architect; do not transfer that credit to the glass. [H28, “The Design of the Building”; “The Memorial Window”]

The older House memorial and the unidentified glass said to have survived the 1925 fire must remain separate historical records. The texts do not establish that a particular modern photograph shows that surviving glass. [H28, “Historical Sketch”; H35, account of the third church and fire]

Use section names and numbered entries as source locators. Add printed page numbers only after checking an actual paginated source. A citation such as **“1928 guide, The Windows, Window 7, subject 26”** is valid; an invented page number is not.

### 2.4 Cover asset

Use **Design_01_Front.png** from the recent **Combined Church Designs** folder as the starting cover illustration. It has been visually inspected: it is white linework on black with a framed composition of the previous and current buildings. Its direct file link is A03. Prepare a print-friendly black-line version on white and typeset the cover words separately. Keep the two buildings recognizable. The finished cover composition still needs visual review; this document does not claim that the final cover exists. [A03, A04]

## 3 Historical matching and public writing

### 3.1 Separate three kinds of confidence

Each design needs three independent assessments:

| Assessment | Question being answered |
| --- | --- |
| Media pairing | Is this the photograph from which this coloring design was derived, or a clearly corresponding view? |
| Subject identification | Which person, scene, symbol, panel, or historical entry does the image depict? |
| Location | Where in the church is that particular glass situated? |

For each assessment use **confirmed**, **likely**, or **unidentified**, with a short explanation and evidence references. A filename-only proposed photo pairing remains **pending review**, an authoring workflow status, and must not be promoted to “likely” just because its number agrees.

**Confirmed** means the visual match and supporting evidence are sufficiently distinctive for that claim. **Likely** means the match has persuasive visible support but a material ambiguity remains. **Unidentified** means there is insufficient evidence for a public assertion. A clear subject identification does not automatically establish its physical location. A book's stated location is documented for the historical record; its application to the modern photograph is a separate decision.

### 3.2 Matching workflow

1. Generate numbered contact sheets for all 55 originals and all 48 designs. Retain exact filenames in the review sheet.
2. Compare each design with its same-prefix photograph as a starting candidate. Compare composition, figure positions, outlines, architecture, objects, inscriptions, and distinctive damage or details. Search other photographs when the candidate fails.
3. Match the actual subject to Appendix B and the cited text. A sword and book, keys, a lion, a boat, a named inscription, or a distinctive arrangement can be useful evidence. A repeated generic cross alone may be insufficient.
4. Record whether a photo shows a whole window, several panels, one panel, or a detail. Permit many photos for one subject and multiple subjects in one photo.
5. Assess location separately using the historical directions, whole-window views, and surrounding architectural context. Avoid inferring a compass direction from filename order.
6. Write a concise evidence note for the media pairing, subject, and location. Record the reviewer and date; the reviewer may be an AI model, accurately identified as such.
7. Review public wording alongside the original and coloring page. Keep any uncertainty that matters visible to the visitor.

Do not give every design a historical identity merely to complete the database. An unidentified design can still be colored and downloaded. Its public title can be **“Stained glass design 12”** with **“We are still identifying this picture.”** An unresolved photo pairing must not display an arbitrary photograph as “the original.” If a persuasive but tentative corresponding photograph is shown, label it **“Likely original”** and give a short explanation.

### 3.3 Writing standard

Use short sentences, familiar words, and concrete descriptions. Do not assume that the visitor knows the Bible, architectural terms, church history, or the identities in the glass. Explain a term at first use: **“the sanctuary, the main worship room”** or **“the chancel, the raised area at the front.”** Be friendly without baby talk. Historical summaries should normally fit in 60–120 words before a **Read more** disclosure; longer sourced detail can follow.

Start each history page with what the visitor can see. Then explain the identified story or symbol. Then give a usable location. Add designer, donor, memorial, date, and other information only when supported. When the guide's interpretation is particular to that source, use wording such as **“The 1928 guide describes the loaves and fish as a sign of the Last Supper.”** Do not turn a source-specific interpretation into an uncited universal claim.

The following is an **illustrative template**, not an identification of any supplied filename:

> **David and Goliath**  
> This scene shows David facing Goliath, a much larger fighter. The church's 1928 guide lists this subject in Window 7.  
> **Where to look:** On the left when you face the front of the main worship room, in the first window from the back door. This location follows the 1928 guide and needs to be checked against the photograph.  
> **Source:** 1928 guide, The Windows, Window 7, subject 26.

Do not copy the example's location as a confirmed modern location until the actual media record has been reviewed. The UI should use **“Likely location”** when appropriate and **“Location not yet confirmed”** when unknown.

### 3.4 Credits and provenance

Keep source titles, exact source links, section locators, historical spellings, and editorial notes in the authoring catalog. The public site should include readable source citations and only credits supported by the supplied material. The photographer's name, artwork credit wording, and official church sponsorship statement have not been supplied; record those as unresolved editorial fields and omit unsupported attribution. Do not invent ownership or permission statements.

Private Drive links are useful to the owner and future implementers. They must not become prerequisites for public browsing. Visitors receive local site images and useful textual source citations even when they cannot open the owner's Drive.

## 4 Information architecture and screen behavior

### 4.1 Routes

Use hash routing so that GitHub Pages serves one HTML entry point without server-side route rewriting. A project URL will have the form `https://OWNER.github.io/REPOSITORY/#/coloring/design-002`. Route names and asset paths are separate concerns; both must work under the repository's base path. [T02]

| Route | Screen | Required content |
| --- | --- | --- |
| `#/` | Home | Site title, brief welcome, exactly two primary selections. |
| `#/about` | History collection | Original-photo cards and a brief introduction to the glass. |
| `#/about/photo-002` | Photo and history detail | Original, description, location, source evidence, associated coloring links. |
| `#/coloring` | Coloring collection | All 48 designs; individual page actions; complete-book download. |
| `#/coloring/design-002` | Coloring editor | Drawing, palette, reference toggle, editing controls, saving status, downloads. |

Invalid routes and unknown IDs must show a readable **“We could not find that page”** message with links to Home and Coloring Pages. Browser Back and Forward must work. Returning from a detail screen should restore collection scroll position. Reloading an editor must restore its saved work before painting is enabled.

### 4.2 Home

Show the full site title and one short invitation, for example **“Explore the windows. Make a picture of your own.”** Beneath it, show two large, vertically stacked selections in portrait: **About the Stained Glass** and **Coloring Pages**. Use an original-window thumbnail and a coloring thumbnail as visual cues. Both choices must be evident without opening a hamburger menu. At 360 × 800 CSS pixels, keep both choices visible in the initial view under normal text settings.

A small source or credit note may appear below the main content. Book downloads, individual designs, and other actions belong inside the selected section. They must not create a third competing home selection.

### 4.3 History collection and detail

Display all original-photo records in the verified source order for the first release. Each card shows a thumbnail, readable title, and location or uncertainty label. Use a responsive grid on larger screens and a simple one- or two-column layout on phones, provided labels remain readable. Do not use an automatically moving carousel.

Detail screens must show the full original image without cropping out meaningful content. Allow the visitor to open a larger view; provide visible close and zoom controls if a modal is used. Alternative text should describe the visible subject and any uncertainty. The page should then show the concise description, **Where to find it**, expanded history when available, sources, and **Color this page** links for corresponding designs. If one photograph relates to several designs, label those choices distinctly. If no coloring design exists, show its history normally.

Use the books' directions in everyday language. Do not publish a modern floor plan until one has been verified. A simple text location is sufficient for this release.

### 4.4 Coloring collection

Show 48 cards in `bookNumber` order. Each card has the blank-art thumbnail, short title, printed coloring number, **Color this page**, and **Download this page (PDF)**. Place **Download the whole book (PDF)** near the collection heading. State that the book includes 48 coloring pages, a cover, an introduction, and sources. Avoid calling the book a “48-page PDF,” because its total page count includes front and back matter.

Returning visitors may see a small **Started** label on a page with saved fills. This label is derived from local state and must not delay collection rendering. A custom saved thumbnail is not required.

### 4.5 Editor layout

Use one vertical column on phones: compact navigation and title; one-sentence instruction; drawing stage; palette and essential controls; download actions and source link. The exact placement may adapt to viewport height, but the drawing and controls must remain reachable without horizontal page scrolling. Keep the palette close enough to the stage that choosing a color does not require repeatedly traversing a long page.

The primary instruction is **“Tap a color. Tap a space in the picture.”** A secondary hint can say **“Use two fingers to move or zoom.”** Provide single-pointer panning after movement exceeds the tap threshold, as specified in Section 9, and labeled zoom buttons for users who do not use gestures.

Show original and About this window are available only when the photo association is reviewed, has confirmed or likely confidence, and points to an existing public photo record. Otherwise, show **“Original photo not yet identified”** and omit those actions. Never derive a photo route from the design's number. A reviewed likely pairing retains the **Likely original** label.

| Function | Required visible label |
| --- | --- |
| Landing screen | Home |
| Return to collection | Back to pages |
| Begin interactive coloring | Color this page |
| Reference toggle | Show original / Hide original |
| History | About this window |
| Reverse or restore a change | Undo / Redo |
| Clear this drawing | Start over |
| Zoom controls | Zoom in / Zoom out / Fit picture |
| Export colored result | Download my picture |
| Individual blank sheet | Download this page (PDF) |
| Complete blank book | Download the whole book (PDF) |

**Start over** opens a short confirmation: **“Remove the colors from this picture?”** Buttons are **Keep coloring** and **Remove colors**. A confirmed reset affects only this design and is one undoable action. Disable Undo and Redo when unavailable, with a clearly distinguishable disabled state.

## 5 Functional requirements

These IDs support implementation tracking and acceptance evidence. The sections that follow define their technical details.

| ID | Release requirement |
| --- | --- |
| NAV01 | Home offers the two agreed primary choices; routes, direct links, reload, Back, and Forward work. |
| HIST01 | All 55 originals have catalog records and usable history screens or explicitly documented file exceptions. |
| HIST02 | Every public historical assertion has evidence or is plainly presented as an inference. |
| HIST03 | Subject, location, and photo pairing have independent confidence and evidence. |
| DATA01 | Exactly 48 active designs correspond to PNGs 002–049 and unique book numbers 1–48. |
| DATA02 | Stable identities survive title changes, reordering, and caption edits. |
| COL01 | Tapping a fillable area changes only that area and preserves linework. |
| COL02 | Palette, Undo, Redo, Start over, zoom, and pan work by touch; required discrete operations also work by keyboard. |
| COL03 | Showing the original preserves colors, history, selected color, and coloring viewport. |
| SAVE01 | Work restores on the same browser and device after a completed save. |
| SAVE02 | Storage failure or a different region version cannot silently erase or misapply coloring. |
| PNG01 | A colored PNG exports the complete drawing at prepared native dimensions on an opaque background. |
| PDF01 | Each of the 48 designs has a one-page Letter PDF. |
| PDF02 | The combined book contains the approved two-building cover, introduction, all 48 sheets, and sources. |
| UX01 | Plain English, visible labels, named colors, and portrait-phone usability are maintained. |
| A11Y01 | The interface targets WCAG 2.2 AA, including discrete coloring by keyboard. |
| DEP01 | Runtime content is served from the published site, and project-subpath hosting works. |
| HAND01 | The repository includes reproducible scripts, tests, asset review records, and a current handoff status. |

## 6 Data contracts and repository structure

### 6.1 Stable identities

Use these independent identifiers: `photo-002` for an original photograph, `design-002` for a coloring PNG, `h28-window-07-subject-26` for a historical entry, and `bookNumber: 1` for the first printed coloring sheet. The matching numerical portions of a photo and design are initially a candidate association only. Book numbers are presentation order, not identity. Historical entry numbers must never be inferred from media filenames.

Source files remain immutable in an authoring source directory. Generate optimized derivatives under new paths. Keep internal acquisition data and review notes out of the public bundle. The public catalog contains only the data needed for browsing, attribution, coloring, and downloads.

### 6.2 Authoring types

The following types define the intended data model. Implement runtime validation in addition to TypeScript checks; JSON and binary files are external inputs to the app.

```ts
type Confidence = 'confirmed' | 'likely' | 'unidentified';
type ReviewState = 'pending' | 'reviewed';
type PhotoId = `photo-${string}`;
type ArtworkId = `design-${string}`;

interface EvidenceRef {
  sourceId: string;       // H28, H35, or a verified media source
  section: string;
  locator?: string;      // e.g. Window 7, subject 26
  printedPage?: string;  // only after checking pagination
}

interface Assessment<T> {
  value: T | null;
  confidence: Confidence;
  reviewState: ReviewState;
  rationale: string;
  evidence: EvidenceRef[];
  reviewedBy?: string;
  reviewedAt?: string;   // ISO 8601
}

interface SourceFile {
  id: string;
  filename: string;
  acquisitionUrl: string;
  localRelativePath: string;
  sha256: string;
  width: number;
  height: number;
}

interface PhotoRecord {
  id: PhotoId;
  source: SourceFile;
  displayOrder: number;
  coverage: 'whole-window' | 'panels' | 'panel' | 'detail'
    | 'unreviewed';
  title: string;
  alt: string;
  description: string;
  extendedDescription?: string;
  subjects: Assessment<string[]>;
  location: Assessment<string>;
  historicalEvidence: EvidenceRef[];
  relatedArtworkIds: ArtworkId[];
}

interface ArtworkRecord {
  id: ArtworkId;
  source: SourceFile;
  bookNumber: number;    // unique integer 1..48
  title: string;
  originalPhoto: Assessment<PhotoId>;
  subjects: Assessment<string[]>;
  location: Assessment<string>;
  publicDescription: string;
  regions?: RegionPackage;       // absent in a catalog-only draft
  individualPdfPath?: string;    // absent before PDF generation
  review: {
    pairing: ReviewState;
    segmentation: ReviewState;
    print: ReviewState;
  };
}

type PreparedArtwork = ArtworkRecord & {
  regions: RegionPackage;
  individualPdfPath: string;
};
```

Add a separate `HistoricalSubject` catalog with `id`, `sourceId`, `section`, optional window and subject numbers, original source label, plain display title, source location wording, designer and memorial fields where documented, and evidence references. The historical catalog may contain entries with no matched photograph. Cross-reference it from media records; do not duplicate a paragraph of historical facts inconsistently across several designs.

An initial `design-002` record may point to candidate `photo-002` with `reviewState: 'pending'` and `confidence: 'unidentified'`. The pending association is authoring data. The public builder must suppress an unreviewed or unidentified reference association and label a reviewed likely match correctly. All 48 pairing reviews must eventually be completed even if some conclude “unidentified.” The design's `subjects` assessment contains historical-subject IDs with its own confidence and evidence; do not inherit certainty automatically from a paired photograph.

### 6.3 Public catalog and asset manifest

Generate a small JSON catalog containing stable IDs, titles, alt text, public descriptions, location text and confidence, formatted source citations, thumbnail and full-image paths, related IDs, region-metadata paths, and PDF paths. Use relative paths resolved through Vite's base. Do not embed local Windows paths, private acquisition links, reviewer notes, or unused whole-book transcriptions in the shipped catalog.

Validation has three stages. **Catalog** checks identities, counts, source metadata, evidence shapes, and references without requiring not-yet-built maps or PDFs. **Assets** additionally checks generated image and region files, dimensions, bytes, hashes, and review metadata. **Release** additionally requires every active design to satisfy `PreparedArtwork`, all required reviews, public derivatives, PDFs, book manifest, and deployable paths. `npm run validate` defaults to release; `--stage catalog` and `--stage assets` support earlier milestones. A clean checkout validates recorded source metadata and all prepared inputs without requiring private acquisition files to be present. The importer verifies originals and hashes when those sources are available. The authoring catalog is authoritative; every build regenerates public catalog JSON from the current authoring records. Generated public JSON must not be hand-edited.

```text
fcc-stained-glass/
  README.md
  REQUIREMENTS.md
  STATUS.md
  DECISIONS.md
  package.json
  package-lock.json
  .nvmrc
  vite.config.ts
  index.html
  src/
    main.ts
    routes.ts
    styles.css
    data/catalog.ts
    screens/home.ts
    screens/history.ts
    screens/coloring-list.ts
    editor/controller.ts
    editor/gestures.ts
    editor/coordinates.ts
    editor/storage.ts
    editor/worker.ts
    editor/export.ts
  content/
    sources.json
    historical-subjects.json
    photos.json
    artworks.json
    segmentation/
    reviews/
  public/
    catalog.json
    images/photos/
    images/thumbnails/
    art/<artworkId>/<contentVersion>/
    downloads/pages/
    downloads/fcc-coloring-book.pdf
    downloads/book-manifest.json
  scripts/
    Import-Sources.ps1
    Check.ps1
    Preview.ps1
    Publish.ps1
    prepare-assets.ts
    build-pdfs.ts
    validate-content.ts
  tests/
    fixtures/
    unit/
    browser/
  .github/workflows/pages.yml
```

Keep unneeded full-resolution acquisition copies outside the public directory and, by default, outside the public repository. Include an import manifest and hashes so the owner can regenerate prepared assets from the source folders. Prepared files required by deployment must be committed or otherwise explicitly included in the CI build input; CI must not depend on the owner's private Drive session.

## 7 Image preparation and fill regions

### 7.1 Canonical pixel space

For each design, decode the PNG, apply orientation once, flatten transparency onto white, and produce a deterministic grayscale canonical image at its native oriented width and height. Document the exact normalization parameters and tested `sharp` version. All region maps, drawing pixels, coordinates, and exports use this same pixel space. Do not generate maps from a thumbnail or a preview resized for the screen. Read dimensions from the transformed output, because input metadata does not account for subsequent image operations. [T04]

Store the original source hash, canonical pixel hash, normalization version, dimensions, and configuration. Preserve the supplied file unchanged. Compare the normalized result with the source during review; investigate any material loss of lines or detail.

### 7.2 Region extraction

Use an explicit per-design configuration. A starting `inkThreshold` of 180 on the 0–255 grayscale scale is an implementation default to tune, not a promised suitable value for every drawing. Pixels at or below the selected threshold form the barrier mask. Use **four-connected** components, so spaces touching only at a corner do not merge.

Define the intended coloring domain, excluding exterior paper, captions, and any unpaintable areas. Never discard every component touching an image edge without review: some genuine art may reach the edge. The configuration may include a domain mask, barrier corrections that close a gap or restore a boundary, and excluded component seed points. Apply barrier corrections before labeling. Label only nonbarrier pixels inside the allowed domain, then resolve excluded-component seed points and assign IDs to retained components. Do not clip an already labeled component into disconnected pieces that keep the same ID. Preserve separate barrier and domain masks: nonbarrier excluded pixels still supply owner-0 seeds during paint-label propagation. Corrections affect region interpretation without automatically changing the visible line drawing.

Assign positive IDs deterministically, ordered by each retained component's first pixel in row-major order. Reserve `0` for nonpaintable areas. Record each positive region's first-pixel seed, pixel count, bounding box, and centroid. Do not delete small components by a blanket size threshold; legitimate fine glass details may be tiny. Flag unusually small or large components for review instead.

```ts
interface SegmentationConfig {
  schemaVersion: 1;
  inkThreshold: number;
  domainMaskFile?: string;
  barrierCorrectionsFile?: string;
  excludedSeedPoints: Array<[number, number]>;
  notes: string;
}
```

Coordinates are `[x, y]` integers in canonical pixels with origin at top left. Validate all correction dimensions and seed locations. A seed on a barrier or outside the image is an error, not a silently ignored instruction.

### 7.3 Review outputs

For every design generate the canonical outline, a region-color review image, and a numbered-region review image. Review at full resolution for leaking fills, accidentally merged panes, overlooked small details, unwanted caption regions, exterior coloring, and ambiguous gaps. Store the review date, reviewer, configuration hash, and any unresolved issue with the design ID.

A script reporting “48 processed” does not complete this review. Every design must receive a recorded segmentation decision. Resolve serious leaks before release. A deliberate nonpaintable tiny decoration is acceptable only when recorded and visually reasonable; do not quietly remove major portions of the design.

### 7.4 Hit and paint maps

Produce **two** label maps. `hitLabels` contains a region ID at each fillable interior pixel, with barriers and excluded areas set to `0`. It controls tapping. `paintLabels` extends region ownership beneath antialiased ink so fills do not leave white fringes. It controls rendering. Keep these roles separate.

Build `paintLabels` from deterministic multi-source, four-neighbor breadth-first propagation over canonical pixels. All nonbarrier pixels are seeds: retained interiors carry their region ID, and excluded background carries `0`. Barrier pixels have no seed initially. Preserve the separate barrier mask: `hitLabels === 0` cannot distinguish ink from background. Insert all seeds into a FIFO queue in row-major order before expansion. Mark pixels visited when enqueued, and inspect neighbors in the fixed order up, left, right, down. Each unvisited pixel inherits its predecessor's owner. This selects the nearest seed by Manhattan distance, with equal-distance ties going to the first seed in row-major order. Keep the original `hitLabels` unchanged.

The domain mask and explicit excluded areas must also bound painting: force `paintLabels` to `0` there after propagation. A barrier correction that exists only for segmentation may produce a sharp fill boundary on a visually open gap; inspect that output and adjust the correction if it is distracting. If an image has no valid seed or no fillable region, fail preparation explicitly.

Set `inkAlpha = 255 - canonicalGray`. For a color channel `c`, calculate the final channel as:

```ts
outputChannel = Math.round(c * (255 - inkAlpha) / 255);
```

Use the assigned color for a filled positive region and white for unfilled or nonpaintable pixels. Set output pixel alpha to `255`. With all regions unfilled, this must reproduce the canonical grayscale drawing exactly. Black lines remain black; gray antialiased edges receive the underlying fill rather than a white halo.

### 7.5 Binary package

Store label maps as little-endian unsigned 32-bit integers, and alpha as unsigned bytes. Compress each with gzip. Using raw integer data avoids relying on browser color management to recover IDs from a colored PNG. Use a fixed gzip timestamp so identical inputs produce identical compressed output. [T06]

```ts
interface RegionAsset {
  path: string;
  encoding: 'gzip-u32le' | 'gzip-u8';
  uncompressedBytes: number;
  rawSha256: string;
  compressedSha256: string;
}

interface RegionPackage {
  schemaVersion: 1;
  algorithmVersion: string;
  artworkId: ArtworkId;
  width: number;
  height: number;
  regionCount: number;
  contentVersion: string;
  canonicalPngPath: string;
  hitLabels: RegionAsset;
  paintLabels: RegionAsset;
  inkAlpha: RegionAsset;
  regionsPath: string;
}
```

The decompressed lengths are exactly `4 × width × height` bytes for each label map and `width × height` bytes for ink alpha. Decode little-endian values explicitly or assert the typed-array platform byte order before using an optimized path. Validate lengths, dimensions, hashes, ID range `0..regionCount`, metadata counts, and region existence before enabling painting. Keep a format version separate from content identity.

Calculate `contentVersion` as SHA-256 of a documented canonical serialization of the effective normalization and segmentation parameters, algorithm version, source canonical pixels, correction-mask contents, raw maps, and alpha. Sort object keys or use a fixed field sequence. Do not include timestamps, reviewer names, configuration notes, filenames, filesystem paths, titles, descriptions, or book order. Editing a note or moving an unchanged mask file must preserve the version. Those editorial changes must not invalidate coloring. Place each package under its content-version path.

## 8 Runtime rendering and application state

### 8.1 Ownership and loading

Keep the main thread responsible for DOM, routes, gestures, the small region-color state, and IndexedDB coordination. Use one worker for loading or decompressing the active map package, expensive rendering, and PNG encoding. Load only the active design's full region data. The collection may load thumbnail images, but must not fetch all 48 region packages or the whole PDF book in the background. Workers allow expensive work to run away from the interface thread. [T10]

Use an incrementing editor-session token and request ID in all worker messages. Include `artworkId`, `contentVersion`, and state revision. Reject old-session responses after navigation or replacement of the active package. Render responses must match the currently requested state and viewport; a reset invalidates older render requests. An export is different: it belongs to its captured revision and may finish while the same session receives later fills or a reset. Abort obsolete fetches. On route changes, terminate or reset the active worker, revoke unused object URLs, release buffers, and remove event handlers.

Use one clear buffer ownership model: the worker initially decompresses and validates all arrays, then transfers `hitLabels` to the main thread. The main thread owns that map and performs synchronous hit tests; the worker retains `paintLabels` and `inkAlpha`. Each map exists once. Return the small region metadata list for keyboard navigation. Transferring an ArrayBuffer detaches it from its sender; never transfer a buffer and then continue reading it there. [T10]

### 8.2 Rendering strategy

Maintain a viewport-sized display canvas, sized for the stage's CSS dimensions and a capped device-pixel ratio of 2. The output buffer must not grow with zoomed image dimensions. The worker renders the visible part from the canonical maps and current fill lookup, then returns a transferable frame buffer or ImageBitmap if supported. Keep a typed-buffer path available so OffscreenCanvas support is not a hidden prerequisite.

A practical first renderer inverse-maps output pixels to canonical pixels, composites with `paintLabels` and `inkAlpha`, and returns RGBA bytes. Use appropriate sampling for the artwork when scaled down; test thin-line visibility. At high zoom, do not interpolate hit IDs or paint IDs into nonexistent regions. An optional precomposited image cache may accelerate pan and zoom, provided it does not require a huge canvas and stays within the measured memory budget.

Coalesce repeated viewport requests, render only the latest request for a frame, and discard stale frames. An older fill result must never overwrite a newer state. Avoid rebuilding the DOM or rerendering the entire screen for a single color choice.

### 8.3 Commands and undo

Keep fill state as region-to-hex-color assignments. Absence means uncolored; explicit white is a valid selected fill. A paint operation to the region's existing value is a no-op and does not consume an undo entry. New meaningful actions clear redo.

```ts
interface RegionChange {
  regionId: number;
  before: string | null;
  after: string | null;
}

interface ColoringCommand {
  kind: 'fill' | 'reset';
  changes: RegionChange[];
}
```

Keep the most recent 100 commands. A reset stores only the filled regions it clears, as one batch command; Undo restores them together. Do not store a full bitmap for each history step. Undo and redo operate on the current region content version only. Palette selection and viewport movement do not enter coloring history.

### 8.4 Original photograph

Showing the original changes reference visibility only. Preserve fills, selected color, undo, redo, and the coloring viewport. Fit the original photo inside the reference area using its own aspect ratio; generated outlines and source photos may not align exactly, so do not treat the photo as a registered overlay.

Disable paint hit testing while the original is visible. **Hide original** returns to the saved coloring view. Export always uses the colored artwork, even when the original is on screen. If the photograph fails to load, retain the coloring state, show **“The original picture could not load”** with a retry action, and allow coloring and downloads to continue.

## 9 Touch coordinates and accessible controls

### 9.1 Gesture state machine

Use Pointer Events with explicit states `idle`, `pendingTap`, `pan`, and `pinch`. Apply `touch-action: none` only to the drawing stage before gestures begin. Normal page scrolling remains available outside that stage. Capture active pointers so movement outside the stage is handled consistently. [T08]

| Event | Required result |
| --- | --- |
| One pointer goes down | Begin a pending tap; do not apply color yet. |
| Movement exceeds 8 CSS pixels | Cancel tap eligibility for that gesture and begin panning. |
| A second pointer appears | Begin pinch interaction and cancel tap eligibility until every pointer is lifted. |
| One pinch finger lifts | Continue the remaining gesture without rearming painting. |
| Eligible single pointer lifts | Convert its position to a native pixel and fill the identified region. |
| Tap hits region 0 or outside image | Make no change and add no undo entry. |
| Cancellation, lost capture, or route change | Cancel the pending tap; do not paint. |

Use only the primary mouse button for painting. A long press with no movement need not perform any special action; prevent unwanted stage image dragging and selection without disabling normal text selection elsewhere. Avoid a second synthetic click handler that would apply the same fill twice.

### 9.2 Coordinate transform

Let canonical artwork size be `W × H`, stage CSS size be `Vw × Vh`, fitted scale be `f = min(Vw/W, Vh/H)`, and relative zoom be `z`. Let `s = f*z`. Centered translation plus pan gives `tx = (Vw - W*s)/2 + panX` and `ty = (Vh - H*s)/2 + panY`. All these values are CSS pixels.

```ts
const localX = event.clientX - stageRect.left;
const localY = event.clientY - stageRect.top;
const imageX = Math.floor((localX - tx) / s);
const imageY = Math.floor((localY - ty) / s);
// Reject coordinates outside [0,W) and [0,H).
const regionId = hitLabels[imageY * W + imageX];
```

Device-pixel ratio affects the canvas backing buffer, not this hit-test formula. Use the current bounding rectangle, including page scroll, and one shared transform definition for both rendering and hit tests. Preserve normalized image center and relative zoom when the stage resizes. Clear stale gesture coordinates after resize.

Zoom starts at 1 and ranges from 1 to 8 relative to the fitted view. Keep the same image point under the pinch midpoint as scale changes. Clamp pan so the image cannot be lost beyond the stage; if a dimension fits within the stage, center it in that dimension. **Fit picture** returns to zoom 1 and centered pan. Labeled zoom buttons change zoom in consistent steps and anchor around the current view center.

### 9.3 Palette

Use these 12 named colors as a stable initial palette. Store the actual color value in saves, never an index that may change meaning after a palette reorder.

| Name | Hex value | Name | Hex value |
| --- | --- | --- | --- |
| Red | `#D32F2F` | Orange | `#F57C00` |
| Yellow | `#FBC02D` | Green | `#388E3C` |
| Blue | `#1976D2` | Light blue | `#81D4FA` |
| Purple | `#7B1FA2` | Pink | `#EC8EB5` |
| Brown | `#795548` | Gray | `#9E9E9E` |
| Black | `#171717` | White | `#FFFFFF` |

Default to Blue. Every swatch must have a visible name. Indicate selection with a checkmark or comparable shape and a programmatic selected state, not hue alone. Put readable labels beside or below swatches rather than forcing text onto low-contrast yellow or pale fills. Outline white and pale swatches.

### 9.4 Accessibility and language

Target WCAG 2.2 AA; do not claim an audit has passed until it has been performed. Use semantic headings, real links and buttons, visible focus, and a keyboard-only **Skip to content** link. Each home card should be one link, not several nested controls. Keep focus visible when a toolbar is sticky. Respect reduced-motion preferences and do not require animation to understand state. [T12]

Ordinary touch buttons should be at least **48 × 48 CSS pixels**. This is the project's usability target, larger than WCAG 2.2's 24-pixel minimum target criterion. Text and controls must reflow at 320 CSS pixels. Normal text needs 4.5:1 contrast, qualifying large text 3:1, and meaningful interface boundaries and state indicators 3:1. Those requirements apply to the interface; retain the colors in the original photographs. [T12]

Tap-fill is a discrete action and needs a keyboard equivalent. Use one focusable drawing surface with a visible instruction: **“Use arrow keys to choose a space. Press Enter to color it.”** Left/Up selects the previous positive region ID; Right/Down selects the next; Home and End select the first and last. Enter or Space applies the selected color. Every region must be reachable, and the selected region must have a visible outline or highlight that never appears in exports. Move the view to reveal a newly selected region when needed. Provide ordinary Tab navigation out of the stage; never trap focus. Announce the region number and current color through a concise status message. [T12]

Use polite status announcements for completed fills and errors without repeatedly reading the entire page. The photo alt text, source descriptions, visible control labels, and accessible names must agree. Check the primary workflow with keyboard and a screen reader. Plain-language labels are part of the default interface, not a separate accessibility mode.

## 10 Saving and failure recovery

### 10.1 Saved data

Use IndexedDB database `fcc-kalamazoo-stained-glass`, with a `colorings` store keyed by `[siteId, artworkId, contentVersion]`. Different GitHub project sites may share one origin, so keep the namespace specific. Saving progress is local to this browser and device; no account or server is involved.

```ts
interface SavedColoring {
  schemaVersion: 1;
  siteId: 'fcc-kalamazoo-stained-glass';
  artworkId: ArtworkId;
  contentVersion: string;
  revision: number;
  updatedAt: string;
  fills: Record<string, string>;
  selectedColor: string;
  undo: ColoringCommand[];
  redo: ColoringCommand[];
  view: {
    zoomRelativeToFit: number;
    centerXNormalized: number;
    centerYNormalized: number;
    referenceVisible: boolean;
  };
}
```

Validate restored IDs, hex colors, command shapes, and version before use. Restore before enabling painting. Queue an atomic snapshot after every fill, undo, redo, or reset; serialize writes so a delayed older snapshot cannot overwrite newer edits. Save view and palette changes on interaction completion. Keep a revision counter for both state and save requests.

Show **Saving…** while an updated snapshot is pending and **Saved on this device** only when the corresponding database transaction completes. Worker rendering completion is not storage completion. Do not depend on page-unload events for the latest save. Preserve records during schema upgrades, and close database connections on `versionchange` so another tab can complete an upgrade. [T09]

Concurrent editing in multiple tabs is not a collaboration feature. Track the last revision this tab read or successfully committed, separately from its latest local revision. Inside each read/write transaction, compare the stored revision with that expected baseline before writing. Two tabs may both create local revision 6 from stored revision 5; only the first may commit while the expected baseline is 5. Advance the baseline only on transaction completion. On conflict, stop the pending save queue, preserve the local unsaved snapshot in memory, and tell the visitor **“This picture changed in another tab. Download this version or reload to use the saved one.”** Offer those actions; do not silently overwrite the other tab or automatically merge undo histories.

### 10.2 Content version changes

Never apply an old region-to-color record to a changed region map merely because its integer IDs look valid. For a released design, retain the previous version's region package and canonical image in the deployment when its geometry changes. Keep a small archive index that lets the app load an existing saved version and export it. New blank sessions can use the newest version. The UI may offer **“A new version of this page is available”**, without deleting the visitor's previous picture.

A verified migration that maps old regions to new ones may replace this preservation approach later. Such a migration needs explicit tests; it is not a first-release prerequisite. Content edits that do not change the region package must keep its content version unchanged.

### 10.3 Recoverable failures

| Failure | Required behavior |
| --- | --- |
| Browser storage unavailable, quota exceeded, or write fails | Keep coloring in memory and keep PNG download available. Show “This picture is not saved on this device. Download it to keep it.” |
| Corrupt or incompatible saved record | Preserve the record for recovery, do not partially apply it, and show a clear recovery choice. A new blank session must not overwrite the old record without an explicit action. |
| Region download or validation fails | Keep the outline and PDF download available; disable tap-fill; offer Retry. Never substitute guessed regions. |
| Original photograph fails | Preserve the editor and allow Hide original or retry. |
| Export fails | Keep all colors and history; show a retry action and a short error. |
| Navigation during loading | Cancel obsolete work and ignore late responses from the old editor. |

Browser storage can be cleared or evicted. The normal saving status should say **“Saved on this device”**, not promise permanent storage or cross-device recovery. Include one brief explanatory line near the save/download controls when needed, not a repeated warning dialog. [T11]

## 11 Image downloads and printable files

### 11.1 Colored PNG

**Download my picture** captures an immutable snapshot of the current fills and their revision. Encode the complete canonical artwork at its prepared native `width × height`, with linework, colors, and an opaque white background. Exclude the UI, selection highlight, reference photograph, zoom crop, and any temporary preview overlays.

Use `fast-png` in the worker to encode an RGBA buffer generated from the snapshot, `paintLabels`, and `inkAlpha`. This is a canvas-independent path. It still allocates a full native-size pixel buffer and encoder working memory; measure the largest actual artwork rather than describing it as streaming or constant-memory. Avoid transferring the live hit map or live fill state away from the editor. [T07]

Show **Preparing picture…** and, when the Blob is ready, a real **Save image** action suitable for a fresh user tap. Use a stable filename such as `fcc-design-002-colored.png`. Mobile browsers may open the image for saving; provide a clear open-image fallback if the download behavior requires it. Keep the Blob URL alive while the user can use that action, then revoke it on replacement or cleanup. A long-running asynchronous operation must not be assumed to preserve user activation. Do not make a canvas `toBlob()` call the only export path; it can fail or return null. [T13]

### 11.2 Individual sheets

Build the PDFs in Node using `pdf-lib`; publish them as static downloads. Produce **48 individual one-page PDFs** on **US Letter portrait, 612 × 792 points**, with at least 36-point margins. Preserve the whole artwork and its proportions. Use lossless line-art embedding and selectable text. [T05]

The page has a short title, the drawing, and a small footer with its coloring number and a concise location or uncertainty label. Keep the complete historical explanation on the website. Reserve title and footer space before fitting the image. If the title wraps, measure its real height before placing the art. No captions may overlap the drawing.

Use a licensed font that supports the punctuation and names actually used. Embed the necessary font resources. Normalize typographic punctuation or include a fontkit-based custom-font path if required by the selected font and `pdf-lib`; do not ship missing glyph boxes. The font dependency must be pinned like the other build dependencies.

Do not claim that a 1024-pixel image is inherently 300 dpi. Calculate effective print resolution from image pixels divided by its placed size in inches. Preserve native source detail, inspect fine lines, and verify a physical sample. Upscaling does not create missing line detail.

### 11.3 Combined book

Use this cover wording, with line breaks chosen during typesetting:

```text
First Congregational Church
Celebrating 100 Years of Our Church Building
1928–2028
Kalamazoo, Michigan
A Stained Glass Coloring Book
```

Use the two-building illustration from Section 2.4 on a white background. Keep all cover text within the same safe print margins. The cover does not count as coloring sheet 1. The anniversary date is grounded in the 1928 dedication documented by H35; the cover does not imply that every window dates from that year.

The default book has **51 PDF pages**:

| PDF position | Content | Printed coloring number |
| --- | --- | --- |
| 1 | Cover | None |
| 2 | Short introduction and coloring instructions | None |
| 3–50 | Designs 002–049 in manifest order | 1–48 |
| 51 | Sources and credits | None |

The introduction should briefly name the church and explain that the drawings are based on its stained glass. Invite visitors to choose their own colors or use the originals for ideas. Include the site URL once it exists. The sources page should cite the two histories, the original-photo collection, and the artwork credits that can actually be established. If readable sources require a second page, allow it and update the manifest and displayed page count; never omit needed attribution or shrink it to illegibility to force 51 pages.

The combined book must reuse the same interior page artwork and captions as the individual PDFs. Default to consecutive pages without blank backs or booklet imposition. Generate `book-manifest.json` with total PDF pages and, for each design, `artworkId`, `bookNumber`, and **one-based** `pdfPageNumber`. With the default structure, `pdfPageNumber = bookNumber + 2`. Maintain that mapping explicitly so later front matter cannot break it.

Record a preparation-input digest for each printable output. Include its relevant artwork, captions, page order, cover, introduction, sources, font assets, and layout version. Release validation compares that digest with current inputs and instructs the implementer to run `npm run pdf` when a file is stale. A historical correction must not update the site while silently leaving an outdated printable caption. Text-only edits can rebuild affected PDFs and the public catalog without regenerating region maps.

### 11.4 Print verification

Validate every PDF's page count and dimensions. Render the entire book to a contact sheet to check sequence and omissions, then inspect every page for clipping and inspect fine-detail samples at full resolution. Print the cover and at least three representative interior pages when a printer is available. Record physical printing as pending if it has not been performed. At 100% on Letter, content must stay inside the safe area; A4 users should be able to use Fit without clipping.

## 12 Build commands and Windows operation

### 12.1 Required commands

These are **interfaces the implementation must provide**, not claims that scripts are included with this requirements document. Make the README copy-and-run once the project exists. Require Git, Node 24, npm, and PowerShell; do not assume GitHub CLI is installed.

| Command | Contract |
| --- | --- |
| `npm ci` | Install exactly the locked dependency set. |
| `npm run import -- --source-root PATH` | Inventory and copy verified source inputs into the configured authoring workspace; record hashes; do not edit originals. |
| `npm run prepare -- --id design-002` | Prepare one design and its review outputs. |
| `npm run prepare -- --all` | Prepare the full catalog using recorded configurations. |
| `npm run validate` | Run release validation. Use `-- --stage catalog` or `-- --stage assets` during earlier milestones. |
| `npm run pdf` | Build all individual PDFs, book, and page manifest. |
| `npm run test` | Run deterministic unit and data tests. |
| `npm run test:e2e` | Run browser workflow checks at root and project base paths. |
| `npm run dev` | Start the local development server. |
| `npm run build` | Type-check, validate release inputs, and build deployable `dist`. |
| `npm run preview` | Serve the built result locally for production-like checks. |

Implement the script runner consistently, such as `tsx` for Node TypeScript scripts, and pin it. Use Vitest for focused logic tests and Playwright for browser workflows. These tools are implementation choices, not additional product features. Document the one-time Playwright browser installation separately from ordinary site use.

`Import-Sources.ps1` wraps the importer and accepts `-SourceRoot`. `Check.ps1` checks prerequisites, required assets, validation, and build readiness. `Preview.ps1` starts the documented local server. `Publish.ps1` validates the intended repository and branch, runs the release checks, stages only the project files intended for publication, commits when needed, and pushes without force. Scripts must stop on failure with an actionable message and a nonzero exit code. Do not rewrite unrelated files, discard uncommitted work, silently change remotes, or disable system-wide PowerShell protections.

### 12.2 Local workflow example

The final README should provide the following sequence after the repository is created. Replace the example paths with actual local paths. The source root refers to the **Coloring Book** parent folder, not its PNG child.

```powershell
Set-Location 'C:\Projects\FCC-Stained-Glass'
git --version
node --version
npm --version
npm ci
npm run import -- --source-root 'C:\Path\To\Coloring Book'
npm run prepare -- --all
npm run pdf
npm run validate
npm run test
npm run dev
```

Do not ask the owner to regenerate all maps for a text-only edit. A clean checkout containing prepared public assets must be able to run validation, tests, and `npm run build` without acquiring private source files. Regeneration commands are used when artwork, region configuration, or PDF content changes.

## 13 GitHub Pages deployment

### 13.1 Repository and base path

Use a repository such as `fcc-stained-glass`; its actual owner and name are deployment configuration, not unresolved product requirements. In Vite, set `base` to `/<repository>/` for a project site. Use `/` for an account-root site or custom domain. Provide a `SITE_BASE` build environment variable and validate that it begins and ends with `/`. Resolve catalog and public-asset URLs through `import.meta.env.BASE_URL`; do not hardcode root-relative `/assets` or `/downloads` paths. [T02]

Create workers using Vite's supported module-worker form so their emitted URLs respect the base path. Test a repository name other than the default locally; that catches accidental hardcoding. Keep Drive URLs out of runtime fetches.

### 13.2 Actions workflow

Provide `.github/workflows/pages.yml` with triggers for a push to the publishing branch and manual dispatch. The build job checks out the repository, sets up Node 24, runs `npm ci`, validation, tests, and the Vite production build, then uploads `dist` as the Pages artifact. The deploy job publishes that artifact to the `github-pages` environment and reports its URL. Use the official checkout, setup-node, configure-pages, upload-pages-artifact, and deploy-pages actions, pinned to reviewed versions when implemented. [T02, T14]

Grant only the permissions needed by the jobs: read repository contents for build, and `pages: write` plus `id-token: write` for deployment. Use the official Pages deployment environment and concurrency control. Verify the current official workflow syntax at implementation time instead of copying an untested old action version.

The owner performs the one-time GitHub setting: **Repository Settings → Pages → Source → GitHub Actions**. The repository README must also describe how to create an empty GitHub repository and add the correct remote using the installed Git CLI. A public repository is the straightforward GitHub Free path for this public project; if the owner chooses a different visibility or plan, verify Pages availability for that choice. [T14, T15]

The eventual publish instructions must include the concrete remote URL and actual Pages URL. They must not leave unexplained placeholders in the final delivery. A generic sequence during setup is:

```powershell
git init -b main
git add .
git commit -m 'Add FCC stained glass website'
git remote add origin https://github.com/OWNER/REPOSITORY.git
git push -u origin main
```

Run initialization only for a new project directory after checking its Git state. For an existing checkout, use its established repository and an ordinary reviewed commit/push path. Never reinitialize or change its remote as an automatic repair.

### 13.3 Asset sizes and delivery

Prepare sensible web derivatives of the original photographs, preserving source colors and the full composition. Supply small gallery thumbnails and larger detail images; keep originals immutable in the source collection. Lazy-load offscreen images, specify image dimensions to avoid layout shifts, and load the reference photo only when needed or after the active editor is ready.

Project performance targets are: initial compressed application JavaScript at most 250 KB excluding the lazily loaded editor/export chunk; typical gallery thumbnails at most 60 KB; only one active region package in memory; visible feedback within 100 ms of a normal fill on the tested phones; and a first usable editor within 5 seconds on the recorded test connection. These are acceptance targets to measure, not measured results. Record actual device, browser, connection, and asset sizes with the result. If an asset exceeds a target for a valid detail-preservation reason, document that specific exception and its observed behavior.

Measure the complete `dist` size, including all individual PDFs and the combined book. GitHub Pages publishes sites no larger than 1 GB. Also check GitHub's per-file repository limits before committing a large combined PDF; optimize lossless line-art storage where possible and do not quietly replace a working download with a Git LFS pointer. [T15, T16]

## 14 Acceptance tests and release evidence

Use focused automated tests for calculations, binary formats, persistence sequencing, and routes. Use visual review for art quality and historical interpretation. Do not substitute a large generic test count for evidence that the real images and visitor workflow work.

| Test ID | Scenario and passing result |
| --- | --- |
| AT01 | Inventory has 55 unique photos and exactly designs 002–049, with unique stable IDs and book numbers 1–48. Every expected file resolves. |
| AT02 | Rename a title and reorder a gallery: media associations, save keys, and historical IDs remain unchanged. |
| AT03 | Every design has a completed pairing review with evidence; likely and unidentified outcomes remain visible as appropriate. No filename-only assignment becomes a fact. |
| AT04 | Every published historical assertion points to its source and locator, or carries explicit inference wording. Check the north/south discrepancy and absent Window 15 location. |
| AT05 | Reprocess unchanged inputs twice: canonical pixels, raw map bytes, hashes, and content versions agree exactly. Editing a note or renaming an unchanged correction-mask file does not change region identity. |
| AT06 | Reject wrong dimensions, byte lengths, hashes, region ranges, and invalid correction seeds with a useful diagnostic naming the design. |
| AT07 | Synthetic fixtures cover a diagonal contact, one-pixel gap, antialiased boundary, small pane, caption, and exterior background. Expected regions stay separate. |
| AT08 | All 48 real region overlays receive full visual review. Important details fill correctly and no obvious leak remains. Every positive fillable region ID has valid keyboard metadata and appears exactly once in its navigation list. |
| AT09 | Unfilled render equals canonical grayscale; black line pixels stay black; colored antialiased edges do not have white halos. |
| AT10 | Known points select the same region at zoom 1, 2, and 8; DPR 1 and 2; after page scroll, resize, and changed stage dimensions. |
| AT11 | Pan, pinch, lifting one pinch finger, pointer cancellation, and lost capture each generate zero unintended paint commands. |
| AT12 | Every palette color works. Reapplying the same value is a no-op. Undo/Redo restore the right values; a new fill clears redo. |
| AT13 | Start over can be canceled; confirmation clears only the active design; one Undo restores the full previous coloring. |
| AT14 | Show/Hide original preserves fills, history, palette, and viewport. The photo has its own proportions. Export while viewing it still exports the coloring. |
| AT15 | After a completed save, reload restores the latest state. Inject a slow earlier write and confirm it cannot overwrite a newer revision. |
| AT16 | Denied storage, quota error, corrupt save, and cross-tab conflict preserve the visible work and offer recovery/download. No false Saved status appears. |
| AT17 | A changed region version does not reuse old integer assignments. An archived saved version can still be opened and exported. |
| AT18 | Decode a colored PNG and verify native width/height, alpha 255, expected fills, full image extent, and absence of UI/reference pixels. |
| AT19 | Download works on the tested phones through a real save or open-image action. Export failure does not clear progress. |
| AT20 | All 48 individual PDFs have one Letter page. Book includes every design exactly once in order, with correct cover, intro, sources, and page manifest. Changing a relevant caption or book input makes stale PDFs fail release validation. |
| AT21 | PDF renders have no clipping, missing glyphs, altered proportions, or overlapping captions. Physical samples are recorded separately. |
| AT22 | Home has exactly two primary destinations. At 320-pixel width, text and controls reflow; at typical portrait sizes, both home choices are obvious. |
| AT23 | Complete selecting, filling, undoing, resetting, and downloading with keyboard. Every region is reachable; focus remains visible and can leave the stage. |
| AT24 | Check labels, alt text, announcements, color selection cue, contrast, and enlarged text with a screen reader and visual review. |
| AT25 | Root and non-root base-path builds pass direct-link, reload, Back/Forward, worker, image, region, and download checks. |
| AT26 | A clean checkout builds with locked dependencies and prepared assets without Drive access. Windows instructions match the actual scripts. |
| AT27 | At the live Pages URL in a signed-out browser, both sections, a complete coloring journey, and both PDF forms work. Record commit and URL. |
| AT28 | Performance and memory checks on the largest measured design meet the stated targets or have a specific reviewed exception. Navigating among designs releases old maps. |

**Coverage distinction:** Inventory, source pairing, segmentation review, keyboard-region metadata, and individual PDF integrity cover every relevant asset. Detailed gesture, storage, export, keyboard, and phone workflows use at least three representative designs: a simple design, a dense design, and one with difficult boundaries. Select and record those after inspection. Representative testing does not replace the all-design reviews.

Run the main journey on an actual iPhone using Safari, an Android phone using Chrome, and Windows Edge. Record the browser versions actually used. Emulation is useful during development, but must not be reported as physical-device verification. If the implementer cannot access a device or printer, put the exact remaining check in the handoff and let the owner perform it; do not mark it passed.

## 15 Ordered implementation milestones

### Milestone 1 Import and establish the catalog

Read the repository instructions and this specification. Inventory sources, calculate dimensions and hashes, generate contact sheets, and populate stable photo/design IDs and the historical catalog. Complete all 48 photo-pairing reviews and write the initial public descriptions, keeping uncertainties explicit. Establish the cover source. **Exit:** `npm run validate -- --stage catalog` passes and every source decision has a recorded status; maps and PDFs are not required at this stage, and no invented historical matches are needed to proceed.

### Milestone 2 Prove one complete coloring path

Choose one representative design. Implement normalization, segmentation, review output, binary package, viewer transform, tap-fill, palette, undo/redo, original toggle, IndexedDB, and PNG export. Build a real one-page PDF. Test on a phone early. **Exit:** one complete visitor workflow works with correct state and export; fix architecture problems before preparing the remaining designs.

### Milestone 3 Complete the artwork pipeline

Prepare and review the other 47 region packages using recorded configurations. Generate thumbnails, web originals, individual PDFs, cover, introduction, combined book, and page manifest. Complete all-design quality checks. **Exit:** all 48 designs have working packages and print files; unresolved historical facts remain honestly labeled.

### Milestone 4 Finish the public interface

Build the two-choice home, complete galleries, history details, routes, plain-language copy, portrait layouts, keyboard coloring, and error recovery. **Exit:** the full experience works at root and repository base paths, with the agreed controls and no placeholder galleries.

### Milestone 5 Verify and publish

Complete the acceptance evidence, Windows scripts, clean-build test, and deployment workflow. Publish when the owner directs the implementation to launch, using the concrete repository and intended public content. Verify the live URL and record any device or print checks still awaiting the owner. **Exit:** the repository, deployed URL, downloads, test record, and handoff agree with one another.

These milestones are ordered dependencies, not separate approvals. Continue through authorized implementation work without reasking already settled product questions. Raise a question only when a missing choice materially blocks the actual task.

## 16 Troubleshooting guide

| Symptom | Likely cause | First corrective action |
| --- | --- | --- |
| One tap colors several panes | Gap in barrier mask or wrong threshold | Inspect that design's labeled overlay; add a precise barrier correction and regenerate its content version. |
| Fine detail cannot be colored | Tiny region dropped or domain too narrow | Inspect the canonical pixels and exclusions; restore the actual region instead of increasing a blanket cutoff. |
| White fringe beside black lines | Interior-only fill or wrong ink composition | Verify paint ownership under ink and the canonical grayscale alpha calculation. |
| Tap selects an offset area | CSS/device pixels mixed or stale transform | Compare render and inverse-hit transforms; test after scroll and resize with known pixels. |
| Pinch accidentally paints | Painting on pointerdown or rearmed tap | Enforce the gesture state machine and keep tap canceled until all pointers lift. |
| Old frame appears after navigation | Stale worker response accepted | Check session token, content version, request ID, and state revision before displaying it. |
| Colors disappear after reload | Save not committed, key changed, or restore race | Inspect transaction completion and compound key; disable editing until restoration finishes. |
| Colors move to different panes after update | Region version reused incorrectly | Restore the prior asset package and save record; fix content hashing before any migration. |
| UI freezes during export | Encoding or full image work on main thread | Move encoding to worker; measure full pixel allocations and release previous export buffers. |
| Blank or partial exported image | Screen crop exported or canvas limit | Use native maps and snapshot through the worker PNG encoder; decode the output in a test. |
| Phone does not save PNG | Blob not ready, expired URL, or gesture issue | Present Save image after encoding and retain its Blob URL; offer opening the image. |
| PDFs clip tall or narrow art | Assumed dimensions or title height | Refit from actual image ratio after measuring text and safe margins. |
| GitHub page loads without pictures | Wrong Vite base or root-relative URLs | Build for the real repository subpath and inspect catalog, worker, and download URLs. |
| Direct editor link fails on reload | Path routing assumes server rewrite | Use the specified hash route and confirm the entry HTML is served. |
| Public visitor sees Drive sign-in | Runtime source uses private Drive URL | Copy prepared derivatives into the deployed assets and use same-origin paths. |
| Wrong biblical subject assigned | Filename number treated as book number | Reopen the three independent records and compare visual evidence with Appendix B. |

## 17 Handoff to another developer or model

### 17.1 Required repository handoff files

`README.md` must explain installation, preview, preparation, validation, testing, and publishing with exact commands. `REQUIREMENTS.md` is this specification. `DECISIONS.md` records any later architectural change with its reason and affected tests. `STATUS.md` records the current commit, completed milestone, next concrete action, known defects, unresolved historical claims, asset-review counts, and which physical checks remain pending.

Keep review results under `content/reviews`, keyed by stable IDs and content versions. Store test results or a concise reproducible test record with the tested commit, device/browser, and outcome. Distinguish **implemented**, **automatically tested**, **visually reviewed**, **tested on a physical device**, and **printed**. Do not use a single “done” flag that hides these differences.

### 17.2 Copyable continuation prompt

> Continue the FCC Stained Glass website using REQUIREMENTS.md as the implementation contract. First read AGENTS.md, README.md, STATUS.md, and DECISIONS.md if present. Inspect the actual repository and current Git state before changing anything. Preserve the agreed GitHub Pages architecture, two-choice home, 48 designs, separate photo and historical IDs, and plain-English phone interface. Do not infer historical matches from file numbering. Find the earliest incomplete milestone and complete its next concrete step. Reuse prepared assets and working code. Run the relevant acceptance checks for the changes, then update STATUS.md with exactly what passed, what remains, and the next action. If something fails, investigate the specific error using Section 16 instead of replacing the whole application. Ask only for an input that cannot be resolved from the files, sources, and existing decisions.

### 17.3 Definition of complete delivery

The website delivery is complete when the repository has the source code, prepared public assets, 48 interactive designs, 48 individual PDFs, the complete book, reviewed content, working save/export flows, a passing production build, a tested Pages deployment, and accurate instructions. It must also have a clear record of any owner-only physical test still awaiting completion.

No further product preference is needed to begin implementation. Remaining work is concrete: inspect and match the supplied images, measure every asset, prepare and review regions, finish the cover and PDFs, implement the specified behaviors, and verify the release. The source facts already established and the unresolved interpretations are preserved below so another model can continue without reconstructing this conversation.


## Appendix A Complete source file map

The table preserves the 55 original filenames and links to the 48 final PNG files. **A row is a filename-based candidate pairing, not a completed visual match.** Every candidate must be reviewed as described in Section 3. Book order defaults to the ascending PNG sequence: 002.png is coloring sheet 1, and 049.png is coloring sheet 48. The seven originals without a candidate PNG remain in the history collection.

Use photo IDs `photo-001` through `photo-055` and design IDs `design-002` through `design-049`. A reviewed association may point to a differently numbered photograph. Correct the explicit association while keeping both file identities stable.

| Original photograph | Candidate coloring file | Book number |
| --- | --- | --- |
| [001 FCC Window First Congo South Window Pan4.jpg](https://drive.google.com/file/d/1sNRlxTy3gLrMpu4NaGuDfXPE_Ibyv05d/view) | No supplied PNG | — |
| [002 FCC Window Igp4048 Tu2.jpg](https://drive.google.com/file/d/1YMfSgtKGvlcwzOyYsRwEjTgT9DkWzBAx/view) | [002.png](https://drive.google.com/file/d/1WboMc59cw0kYgwsH1iPDTTJh-9kHDpDw/view) | 1 |
| [003 FCC Window Igp4056.jpg](https://drive.google.com/file/d/1BMI6y4ytRthMJ3IVGuviktA-xKWq9jqN/view) | [003.png](https://drive.google.com/file/d/17PR92RqOQwglRjGgv0ZXKEnZz_A68Gz5/view) | 2 |
| [004 FCC Window Igp4060.jpg](https://drive.google.com/file/d/1tyzsNyhWtlfjnHVrkh2Gem-pCplT-Y42/view) | [004.png](https://drive.google.com/file/d/148shUUtX7UREiwUQ6NCODtDts4vLs_Q7/view) | 3 |
| [005 FCC Window Igp4064.jpg](https://drive.google.com/file/d/1xTTtVruuJOqpsqWS7kghD8hmRdqSTTnO/view) | [005.png](https://drive.google.com/file/d/11x7aPhr5yBlD5NcMCAXT1_y8wEHKxs3b/view) | 4 |
| [006 FCC Window Igp4075.jpg](https://drive.google.com/file/d/1Nz8riQ3teCE4oRGy6hWS4x49CbaJ5uci/view) | [006.png](https://drive.google.com/file/d/1QdfwBz_uF6CMIQ8C0Sdn14uF2lQDcUez/view) | 5 |
| [007 FCC Window Igp4089.jpg](https://drive.google.com/file/d/1bg7P-sWsC-DBcv8RB7r_HkqE7dAdmKsw/view) | [007.png](https://drive.google.com/file/d/1sAa8mX1uVXSlCOKb4bpBgkg1VCcZ6Jjd/view) | 6 |
| [008 FCC Window Igp4095.jpg](https://drive.google.com/file/d/1_OmBkOImhJPuG4JpMHdzRit0LezBs-xo/view) | [008.png](https://drive.google.com/file/d/1XRj8W7LiK-C35B6x73_-K1YVOFimbk10/view) | 7 |
| [009 FCC Window Igp4104.jpg](https://drive.google.com/file/d/16sNEXP6AV7gP9YK3Tu8JPcLsqzc6uzc1/view) | [009.png](https://drive.google.com/file/d/1fTtC5DqKGdRNr8nSBZQR2AS-p9WZT-yn/view) | 8 |
| [010 FCC Window Igp4108.jpg](https://drive.google.com/file/d/1xK6pJoQEaZYbH6u1igL_ihbcGpzFmc87/view) | [010.png](https://drive.google.com/file/d/17SIeeW6a65sERkEhLQdVfBTthYNaNCSf/view) | 9 |
| [011 FCC Window Igp4115.jpg](https://drive.google.com/file/d/1Du1lJvFh4LLUrC0tJodFNWtnEIabWjNR/view) | [011.png](https://drive.google.com/file/d/1SOVod4s1wOlNl3MRmx13JasF5Rn13Vk_/view) | 10 |
| [012 FCC Window Igp4119.jpg](https://drive.google.com/file/d/1GYh5GwiZLddZCZ6_DG6Sl1BA5qLISCgM/view) | [012.png](https://drive.google.com/file/d/1ziFESMGNqAXeX4KCfH0OB9qcPbe6hzA9/view) | 11 |
| [013 FCC Window Igp4123.jpg](https://drive.google.com/file/d/1v2FSfXWrM4axVdIsTG4vXBY19h00BKN3/view) | [013.png](https://drive.google.com/file/d/1jmyI8qDLevzDqIWx49DQg-c2QRw3pqDQ/view) | 12 |
| [014 FCC Window Igp4131.jpg](https://drive.google.com/file/d/1kIdsIrzEO2QGIsPQ-qD05mzhuAy5G14Y/view) | [014.png](https://drive.google.com/file/d/1sJrjta1-sOh9lEkdkeIFCFY5KXHOVaqj/view) | 13 |
| [015 FCC Window Igp4134.jpg](https://drive.google.com/file/d/1cVUrrfE9_dUt-39n_MINIjlL9_8mlU9Z/view) | [015.png](https://drive.google.com/file/d/1lJtXr_K78CDk-PSp4r00T_mUf3_lrg5A/view) | 14 |
| [016 FCC Window Igp4140.jpg](https://drive.google.com/file/d/1JwVDBBech-2u8eeQWQrWX_9XeoF9O3RO/view) | [016.png](https://drive.google.com/file/d/1iIGtFUTRvFoX3fmkHK7xLmwyBscfMDJk/view) | 15 |
| [017 FCC Window Igp4145.jpg](https://drive.google.com/file/d/1wN-1psu0w58YMuqd9yqgIRUVOXDr8Px3/view) | [017.png](https://drive.google.com/file/d/1tDNjD4uoyDAwBrrnICRVvLOqNI9niAcx/view) | 16 |
| [018 FCC Window Igp4162.jpg](https://drive.google.com/file/d/1LnUnCepzBOa1E-EnrSOianILp3q1u46Q/view) | [018.png](https://drive.google.com/file/d/146kMxJSx1-qwnivMZD1ZNeGFVxwPeNLw/view) | 17 |
| [019 FCC Window Igp4165.jpg](https://drive.google.com/file/d/1oQ-PB9dzwUv7E1HQp7N_xTBXuG8vzFE4/view) | [019.png](https://drive.google.com/file/d/1cqLa9yNJkT31UoTUY4tyyzcImdCM8KyV/view) | 18 |
| [020 FCC Window Igp4170.jpg](https://drive.google.com/file/d/17GBjauCKlsaKsKMly8ckthLTcxDqJmov/view) | [020.png](https://drive.google.com/file/d/1seYT2JIeLT6gGBKDXsOzVuzdPi65arxm/view) | 19 |
| [021 FCC Window Igp4181.jpg](https://drive.google.com/file/d/1uOPfx96Zn21zuJd78J8CTveia2e4e9CU/view) | [021.png](https://drive.google.com/file/d/1Z6oXToZ_ShSnpZuCdHf4BX_grbXwbEkj/view) | 20 |
| [022 FCC Window Igp4185.jpg](https://drive.google.com/file/d/1Py6kGREJP53uuXbpuowqUsvoyCGqhMGY/view) | [022.png](https://drive.google.com/file/d/1n9WlOIKfgItU1VZxwKIt4nrVyYOUwgiK/view) | 21 |
| [023 FCC Window Igp4190.jpg](https://drive.google.com/file/d/10JqQa2W4ldSxxUw-ZKfrJBDaBuus19Iw/view) | [023.png](https://drive.google.com/file/d/1-Z6s6EvGfU6fBbxXHr-57n8_GGbzPa37/view) | 22 |
| [024 FCC Window Igp4233.jpg](https://drive.google.com/file/d/14r4gS2Qr5epY4doEyZ82gF-jzMIUipnz/view) | [024.png](https://drive.google.com/file/d/1zLmK_H7Otr8IfgbCuGaxYx9bc23GeKU3/view) | 23 |
| [025 FCC Window Igp4240.jpg](https://drive.google.com/file/d/1idGv6dJDuL6QHszyY31vzmXyL4UQv-fI/view) | [025.png](https://drive.google.com/file/d/1OgXsiJvu7vGIvdUcGTY8RLDeGPcH89wx/view) | 24 |
| [026 FCC Window Igp4245.jpg](https://drive.google.com/file/d/1xJ4Q_Vp13LEqubs5FVS0TTr635ZLq7Pc/view) | [026.png](https://drive.google.com/file/d/1Jate_lBDPFU63dlANMoqdBGgLr8l6jqm/view) | 25 |
| [027 FCC Window Igp4265.jpg](https://drive.google.com/file/d/1oEuzZGykzOXL-ZOa20F0ZuRKWE8p7TRl/view) | [027.png](https://drive.google.com/file/d/1nvz92LKjmH8dZNnnjj7q7Si3OlhIYRLb/view) | 26 |
| [028 FCC Window Igp4270.jpg](https://drive.google.com/file/d/1gzXAwwOFdpVu4fFscSNZgc34EzfkZ-rZ/view) | [028.png](https://drive.google.com/file/d/1TmAPWgWAXvGjIGnvvlQZvM-tI9iwX7DC/view) | 27 |
| [029 FCC Window Igp4275.jpg](https://drive.google.com/file/d/1g686HFRpXIrgWicExZROw7oDZue6OOhb/view) | [029.png](https://drive.google.com/file/d/1Bhy-AkizJ10q5JUKT1EjW_0qfMTlmA_6/view) | 28 |
| [030 FCC Window Igp4280.jpg](https://drive.google.com/file/d/1-sY32FqpIYnuIaVlTmBWtzYy1nOiIq93/view) | [030.png](https://drive.google.com/file/d/1YjFe_AbgijTKLDn48O66wlPVBYYiiMv_/view) | 29 |
| [031 FCC Window Igp4289.jpg](https://drive.google.com/file/d/1ZdZcjBYAiNZ2bmnwD3Lq-MtCoyXHT3B5/view) | [031.png](https://drive.google.com/file/d/1u_sH1D6MXtkWbqVkRWy8285xZeD9Vvj3/view) | 30 |
| [032 FCC Window Igp4296.jpg](https://drive.google.com/file/d/1xHgXoXaZBdkq029r-9w3DE-9Rfz4BJXi/view) | [032.png](https://drive.google.com/file/d/1uubOTf5dSUDirYAiBldNyD-77k5-A6XH/view) | 31 |
| [033 FCC Window Igp4302.jpg](https://drive.google.com/file/d/1MqesgGqaeEWEGphaGeM-v6is6-Fr6L9t/view) | [033.png](https://drive.google.com/file/d/11EmdHC4300NsVyDhlamVT3jzCJRc7W_a/view) | 32 |
| [034 FCC Window Igp4305.jpg](https://drive.google.com/file/d/1JTkLX61mDwloP50TTee3ACBCnhFelhqS/view) | [034.png](https://drive.google.com/file/d/1xRkz_OVj2JniMOexZsT6yZvU2ydqosAT/view) | 33 |
| [035 FCC Window Igp4320.jpg](https://drive.google.com/file/d/1mBKV_TIKPsotPOYqmpBTgF9a1jOr4UMd/view) | [035.png](https://drive.google.com/file/d/1pX5c4I17zSfQ6LcuSVgdUjbCH0xN6Rt0/view) | 34 |
| [036 FCC Window Igp4325.jpg](https://drive.google.com/file/d/1RaIAatK3L1s3iDUg_jLKHKLJVq0fLZJI/view) | [036.png](https://drive.google.com/file/d/1wPdAuP8Q14Igd2w5jb5p9wFu6ao0VcGr/view) | 35 |
| [037 FCC Window Igp4330.jpg](https://drive.google.com/file/d/1-OuHYgb7AQPnlb1JOSq8dJ2mtCIEGdgs/view) | [037.png](https://drive.google.com/file/d/10ERgy-8CnvH-Ow7ifhcyC5wdUa1bAf5e/view) | 36 |
| [038 FCC Window Igp4334.jpg](https://drive.google.com/file/d/114--KJfjxZPFQQ1hajUcKXf4lbZChyR3/view) | [038.png](https://drive.google.com/file/d/1KTmvU4Hzq1SYvFnXVRjqORqbTbD7uBV0/view) | 37 |
| [039 FCC Window Igp4338.jpg](https://drive.google.com/file/d/1az-fp9zHkvlHiC45xf5n3dhT616xWTi-/view) | [039.png](https://drive.google.com/file/d/1de2ak2hoAmUB2ip2MLfVCuAE-1t5qFvt/view) | 38 |
| [040 FCC Window Igp4343.jpg](https://drive.google.com/file/d/13MdPE89TmeUlG-_fPYC79JeRpaPvuHx_/view) | [040.png](https://drive.google.com/file/d/1ZR-pg7qNO3y9-Y8jFE1LqBDJvqO_TcMx/view) | 39 |
| [041 FCC Window Igp4351.jpg](https://drive.google.com/file/d/1jHt_qxdkmG6nhc2FIGxW3YLBlonxmGuD/view) | [041.png](https://drive.google.com/file/d/1br64FQYEsernxea4xMOjilvEyf4shSIn/view) | 40 |
| [042 FCC Window Igp4353.jpg](https://drive.google.com/file/d/1PCmwvXC-XouGKG9Cd3s9-k9b2cuS3kAn/view) | [042.png](https://drive.google.com/file/d/1eoSXuD9SOVF9ZOEESm82qTSabdJjn1CD/view) | 41 |
| [043 FCC Window Igp4360.jpg](https://drive.google.com/file/d/1yJG1cB7q-LH7sUCPwTZwMZcllvzQlDNP/view) | [043.png](https://drive.google.com/file/d/16hhNRmSXOQppE-mwJgdIYoI7BfGmap2C/view) | 42 |
| [044 FCC Window Igp4365.jpg](https://drive.google.com/file/d/1YsaBFpZ9H4yp8rkY_WsLrUKtV65uNwRI/view) | [044.png](https://drive.google.com/file/d/1Yp3Cb0vRApCxJH3_U17qSD2wNncg8oQo/view) | 43 |
| [045 FCC Window Igp4370.jpg](https://drive.google.com/file/d/1iQP_r5zyfAoHCuvb9ivByMEIVPMKyO6v/view) | [045.png](https://drive.google.com/file/d/1mUztupp-LLQmDxFiQAthu6ENzogmEJGR/view) | 44 |
| [046 FCC Window Igp4375.jpg](https://drive.google.com/file/d/1brC1FdN3B7VP7-ZmF2LjMTDD6DwptL1g/view) | [046.png](https://drive.google.com/file/d/1j3GhR64KNoADKuIQ1V131PKi7iKuVYSa/view) | 45 |
| [047 FCC Window Igp4380.jpg](https://drive.google.com/file/d/1jEKUbCqa2UiIuzO2rKUlWP_wqcI9xvII/view) | [047.png](https://drive.google.com/file/d/1pr-RRwVwXtBIZlIDRGq6uYcTyI6ujvOw/view) | 46 |
| [048 FCC Window Igp4385.jpg](https://drive.google.com/file/d/1MOwfrq8P7P1O7A2EIXwUbEJT8_g2Sj1f/view) | [048.png](https://drive.google.com/file/d/1taZMnrWcTWLo44gueFq615JcK_Ea22BV/view) | 47 |
| [049 FCC Window Igp4398.jpg](https://drive.google.com/file/d/1LdXuozndvVrnE1iqk2tWWBO00R3yvLcq/view) | [049.png](https://drive.google.com/file/d/15pLreBlJ0uHj32PQlJn3-P0nEGY-36DW/view) | 48 |
| [050 FCC Window Igp4487 8 9 Tonemapped.jpg](https://drive.google.com/file/d/1RV3tmF4av_41dtYMItgvmX1ELzaER2QF/view) | No supplied PNG | — |
| [051 FCC Window Igp4495 6 7 Tonemapped.jpg](https://drive.google.com/file/d/1u4exMMsTow6sU0uqn8DBf_p12i7vMuzQ/view) | No supplied PNG | — |
| [052 FCC Window Igp4500 1 2 Tonemapped.jpg](https://drive.google.com/file/d/1b1qFy8mSOvK1uf5xJxWZnXKzIOZjmt2T/view) | No supplied PNG | — |
| [053 FCC Window Igp4505 6 7 Tonemapped.jpg](https://drive.google.com/file/d/1nHiXK7-rOqcArrCUOwANmHMDP4RZFEgN/view) | No supplied PNG | — |
| [054 FCC Window Igp4510 1 2 Tonemapped.jpg](https://drive.google.com/file/d/1VsOUMlqCJOUNlQxZaJccMgZpGEln3mVD/view) | No supplied PNG | — |
| [055 FCC Window North Window Panorama1.jpg](https://drive.google.com/file/d/1hGzQAyidSEfpPhoFtACIa5BaBFZbEJjC/view) | No supplied PNG | — |


**Review status for the table:** All same-number pairings are pending visual review at specification delivery. “No supplied PNG” means no file of that number exists in the final PNG folder; it does not mean the original lacks historical value or could never have a coloring design.


## Appendix B Historical identification catalog

This is an identification aid derived from the two histories. It is not a completed mapping of the supplied images. Preserve original labels in the authoring catalog while using clearer display titles for visitors. All entry numbers in this appendix belong to the historical sources and are independent of photograph prefixes, design IDs, and coloring-book numbers.

### B1 The 1928 numbered windows

Source: H28, **The Windows**. Each subject number is its own locator within the named window. Labels below are shortened paraphrases of the source; unusual source terms are retained where they help identification.

| Book window | Subject entries |
| --- | --- |
| 1 | 1 Sun, moon, stars, earth, and water; 2 Creation of fishes; 3 Creation of land animals, first scene; 4 Creation of land animals, second scene. |
| 2 | 5 Creation of Adam; 6 Creation of Eve; 7 Eve giving the apple to Adam; 8 Thorns, thistles, and serpent of sin. |
| 3 | 9 Adam and Eve expelled from Paradise; 10 Offering of Cain and Abel; 11 The Flood; 12 Noah sends out the dove. |
| 4 | 13 Noah's offering; 14 Tower of Babel; 15 Destruction of Sodom; 16 Jacob's dream. |
| 5 | 17 Esau swears off his birthright; 18 Selling of Joseph; 19 Joseph honored; 20 Finding of Moses. |
| 6 | 21 Through the Red Sea; 22 Moses and the burning bush; 23 Moses striking the rock; 24 Moses and the Law. |
| 7 | 25 Samson slaying the lion; 26 David and Goliath; 27 Death of Absalom; 28 Flight into Egypt. |
| 8 | 29 Annunciation; 30 Three Wise Men; 31 Three young men in the fiery furnace; 32 Madonna. |
| 9 | 33 Baptism; 34 Jesus enters Jerusalem; 35 Christ preaching from the boat; 36 Return of the Prodigal. |
| 10 | 37 Awakening of Lazarus; 38 Christ visiting, or Christ at the Door; 39 Crucifixion; 40 Resurrection. |
| 11 | 41 Ascension; 42 Christ and the Christian Law; 43 Descent of the Holy Ghost; 44 Christ in Heaven. |
| 12 | 45 Christ as the Lamb; 46 Sin and Salvation, with a scarlet Satan, three-tined fork, and flames; 47 Martyrdom of St. Peter; 48 St. Christopher carrying the Christ Child across the river. |
| 13 | 49 Daniel in the lion's den; 50 King David; 51 Angel Gabriel; 52 Carriers of the grapes of “Eschol”; 53 Christ, an ancient sign of his Crucifixion; 54 Jonah and the whale; 55 Name of Christ, sign as Divine and his Cross; 56 Name of Christ representing him as Divine; 57 St. Luke; 58 St. Matthew; 59 St. John; 60 St. Mark. |
| 14 | 61 “P. X. (Christ.)”, a lamb with halo and banner representing the Church triumphant; 62 Doctrine of Christ, a New Testament book and three balls representing the Trinity. |
| 15 | 63 “I. X. (Jesus Christ.)”; 64 Rose as a symbol of the Resurrection. |

### B2 Directions in the 1928 guide

Source: H28, **The Windows** and **The Design of the Building**. For right and left, the visitor is standing inside the main worship room facing the front, toward the Communion table. Do not describe this as “your right when you enter,” because the door used can change the viewpoint.

| Group | Documented direction |
| --- | --- |
| Windows 1–6 | Right side facing the chancel. Window 1 begins at the front; Window 6 is the last toward the back on that side. |
| Windows 7–12 | Left side. Window 7 is first from the door at the back; the sequence returns toward the front, ending near the pulpit. |
| Window 13 | Called the south window in the 1928 guide. Keep it distinct from the 1935 south-memorial description. |
| Window 14 | In the chancel above the organ. This is a historical location description until the present arrangement is checked. |
| Window 15 | No specific location stated in its entry. Do not inherit Window 14's location. |
| North memorial | At the front above the Communion table in H28; identified as the north window in H35. |

These directions guide matching. They do not constitute an independently surveyed present-day floor plan.

### B3 Aisle and vestibule symbols

Source: H28, **The Aisle Windows**. Keep east and west numbering separate. Suggested IDs include `h28-east-aisle-01`, `h28-east-vestibule-11`, and `h28-west-aisle-01`.

| Area and starting point | Numbered entries |
| --- | --- |
| East aisle from the front | 1 Eye of God; 2 Spirit of God; 3 Fleur de lis; 4 Pilgrimage; 5 Sin; 6 Fall of Man through the serpent; 7 Dove of Peace; 8 Burning Bush; 9 House of David; 10 River Euphrates. |
| East vestibule | 11 Fleur de lis; 12 Fleur de lis. |
| West aisle from the back | 1 River Tigris; 2 River Geon; 3 River Phison; 4 Star of Bethlehem; 5 Three Crowns; 6 Last Supper, shown as loaves and fish; 7 Seven Candlesticks; 8 Trinity; 9 Christ's name in Greek and palm of victory over death; 10 Initials of Jesus Christ. |

“Geon,” “Phison,” and “Eschol” retain the source's spellings. Attribute the loaves-and-fish interpretation to the 1928 guide. Do not silently replace ambiguous letterforms with a different monogram expansion.

### B4 North memorial window

Sources: H28, **The Memorial Window**, **The Design of the Building**, and **Memorials and Gifts**; H35, **The Fourth Church 1928–1935**.

The memorial honors **Rachel Babcock Upjohn**. Its donors were her children, named as Mr. W. H. Upjohn, Mrs. R. S. Light, Mrs. D. S. Gilmore, and Mrs. Dorothy Upjohn Delano. Preserve minor spelling variations from the transcriptions in source notes. H28 identifies the designer as **Alfred E. Floegel of New York**. The window is at the front above the Communion table, identified as north in H35.

| Feature | Description for visual matching |
| --- | --- |
| Principal panels | Left to right for the viewer standing inside and facing the window: Paul, Mary, Christ, John the Baptist, Peter. |
| Christ | The Peacemaker; globe topped by a cross in his left hand, right hand raised in blessing, sheep at his feet. Hand descriptions are anatomical; panel positions are viewer-relative. |
| Mary | In prayer, in the panel immediately to the viewer's left of Christ. |
| John the Baptist | Immediately to the viewer's right of Christ, in camel-hair clothing with a shepherd's crook. |
| Paul and Peter | Paul at far left with book and sword; Peter at far right with scroll and keys. |
| Lower emblems | Adoring angels; Michigan coat of arms beneath Mary; United States coat of arms beneath John the Baptist; cross and I. H. S. beneath Christ. |
| Lower narrative scenes | Left to right: Nativity with the Magi, Baptism, Crucifixion, Resurrection, Ascension. |
| Upper tracery | Star of Bethlehem and three heavenly spirits in English Perpendicular Gothic ornament. |
| Memorial inscription | Rachel Babcock Upjohn's name below the center panel. |

Use a separate memorial ID such as `north-upjohn-memorial`, with child scene IDs as needed. Do not invent a “Window 16” within the numbered 1928 inventory. John the Baptist in a principal panel and John in the Crucifixion scene are distinct figures. Check whether a photograph was taken from inside, outside, or mirrored before relying on left/right order.

### B5 South memorial in the 1935 history

Source: H35, **The Fourth Church 1928–1935**, south-window paragraph.

The south memorial honors **W. Harold Upjohn** and was given by **Dr. W. E. Upjohn and his family**. The description identifies bright blue panels with **Christ at the center**. It names the surrounding figures as **St. Paul, John Wycliffe, Henry Ward Beecher, Lyman Abbot, Michael Angelo, Erasmus, Shakespeare, Lord Shaftesbury, Louis Pasteur, Joan of Arc, and Abraham Lincoln**.

That is a list of figures, not a documented spatial arrangement. Preserve the source spellings in the authoring notes even if a public label uses a modern standard name. The cited paragraph does not identify the designer or maker. Use a separate ID such as `south-harold-upjohn-memorial`; do not force these people into H28's Window 13 subject numbers.

### B6 Editorial claims requiring further evidence

The implementation must record rather than invent: the complete modern photograph-to-subject map; present-day locations not demonstrable from the sources and images; the relationship between the two south-window descriptions; the date and maker of the H35 south memorial; any identification of surviving pre-1928 glass; the photographer credit; and final artwork credit wording. None of these gaps prevents preparing the specified application or honestly labeled coloring pages.

## Appendix C Source bibliography

Sources and technical guidance were reviewed for this specification on **6 November 2026**. Drive sources are acquisition references for the owner and implementer; access may depend on the owner's account. Public site citations should remain understandable without access to those files.

### Church histories

**H28** — [Our Church Its History Its Structure Its Service, 1928](https://docs.google.com/document/d/1T3kosR0CzgFJ3xJ5yNAYd5hSyFChfieG/edit). Readable transcription. Relevant sections: The Design of the Building; The Memorial Window; The Windows; The Aisle Windows; Memorials and Gifts; Historical Sketch. [HTML copy](https://drive.google.com/file/d/1T8KmlfcnRU2x8hmG6pLkfHjFTj_j05NL/view). Printed pagination has not been verified.

**H35** — [First Congregational Church Centennial History 1835–1935](https://docs.google.com/document/d/1TNf7BWNSTjjxA8QsqVFQNwwg75sk_ADr/edit), October 1935. Mrs. Stanley Morris, assisted by Mrs. James M. Hatfield. Readable transcription. Principal locator: The Fourth Church 1928–1935. [HTML copy](https://drive.google.com/file/d/1TVTCyz1omBLUrISpMSNzMPsaHo3VM7OO/view). Printed pagination has not been verified.

### Supplied images and cover art

**A01** — [Coloring Book source folder](https://drive.google.com/drive/folders/170-6ayQ9E-kOxqaFzCWpshUCfPCQLHMY). 55 numbered source photographs. Individual file links appear in Appendix A.

**A02** — [Coloring Pages final PNG folder](https://drive.google.com/drive/folders/16eIMB-D3s8frQyvs4sTKzp7D-FYCpThl). 48 files, 002.png–049.png. Individual file links appear in Appendix A.

**A03** — [Design_01_Front.png](https://drive.google.com/file/d/1z-WPDPDjXZU0wUxdoGHGDboSNEXq2xef/view). Selected starting illustration of both buildings for the book cover; visually inspected. The final print cover still needs preparation.

**A04** — [Combined Church Designs](https://drive.google.com/drive/folders/17RcwyCMgTZEEuuyq3Ca_G7xUITUWNCzv). Recent two-building artwork. Related collections: [Simplified Church Concepts](https://drive.google.com/drive/folders/1Kd7h5LQtZ9ADVr3IOVzBQeZfQUNmmb1J) and [Christian Symbol Concepts](https://drive.google.com/drive/folders/1sscQYCOmHpdBYWP_OEK-c_YUJOJkkRoY).

**A05** — [Individual Sanctuary Windows](https://drive.google.com/drive/folders/1b5vXFVY8IpnWD8UAVTNfl_rWI9zRqDyX). Supplemental older source collection. Use A01 as the first-release numbered source inventory; consult this collection when it resolves a visual question.

### Technical references

**T01** — [Node.js previous releases and release status](https://nodejs.org/en/about/previous-releases). Basis for the Node 24 LTS baseline.

**T02** — [Vite static deployment guide](https://vite.dev/guide/static-deploy.html). GitHub Pages base paths, build output, and Actions workflow.

**T03** — [Vite getting started](https://vite.dev/guide/). Vanilla TypeScript project support and runtime prerequisites.

**T04** — Sharp official documentation: [installation](https://sharp.pixelplumbing.com/install/) and [input metadata](https://sharp.pixelplumbing.com/api-input/). Image processing and the distinction between input metadata and transformed output.

**T05** — [PDF-LIB official documentation](https://pdf-lib.js.org/), including [PDFDocument API](https://pdf-lib.js.org/docs/api/classes/pdfdocument). Creating pages, embedding images, and font handling.

**T06** — [fflate official repository and documentation](https://github.com/101arrowz/fflate). Gzip compression and deterministic timestamp settings.

**T07** — [fast-png official repository](https://github.com/image-js/fast-png). JavaScript PNG encoding and decoding.

**T08** — [MDN Pointer Events](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events). Pointer capture, cancellation, and touch-action behavior.

**T09** — [MDN Using IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB). Transactions, version changes, and shutdown limitations.

**T10** — [MDN Using Web Workers](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers). Worker messages and transferable buffer ownership.

**T11** — [MDN Storage quotas and eviction criteria](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria). Storage persistence limits and failure handling.

**T12** — W3C accessibility guidance: [WCAG 2.2](https://www.w3.org/TR/WCAG22/), [keyboard](https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html), [reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html), [target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html), [text contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), [non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html), [use of color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html), [label in name](https://www.w3.org/WAI/WCAG22/Understanding/label-in-name.html), and [focus not obscured](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html). Plain-language support: [Use Clear Words](https://www.w3.org/WAI/WCAG2/supplemental/patterns/o3p01-clear-words/) and [Use Clear Visible Labels](https://www.w3.org/WAI/WCAG2/supplemental/patterns/o4p06-clear-labels/).

**T13** — MDN export guidance: [Canvas toBlob](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob), [canvas element limits](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/canvas), and [Navigator share](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share). Export fallbacks and user-activation considerations.

**T14** — [GitHub Pages publishing source configuration](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site). Actions as the publishing source.

**T15** — [GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits). Site size and plan availability.

**T16** — [GitHub large-file limits](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github). Repository file-size constraints relevant to the combined PDF.

## Appendix D Readiness record at specification delivery

| Item | Status as of this specification |
| --- | --- |
| Product scope and public title | Established from the owner's decisions. |
| Primary source folders | Located and inventoried. |
| 55 photograph filenames and 48 design filenames | Verified; direct links included in Appendix A. |
| Full image dimensions and source hashes | To be measured for all files during import; five PNG dimensions sampled. |
| 1928 and 1935 histories | Located and read; relevant catalog and chronology extracted. |
| Original paginated scans of those two books | Not located; citations use sections and numbered entries. |
| All 48 design-to-photo matches | Candidate filename pairings recorded; full visual review still required. |
| Historical identity and current location of every image | To be assessed from visual evidence and source context. |
| Anniversary wording | Grounded in the documented 28 October 1928 dedication. |
| Two-building cover source | Selected and visually inspected; final cover layout not produced. |
| Website, region maps, and downloadable book | Specified here; not implemented by this deliverable. |
| Device testing and physical prints | Required during implementation; not yet performed. |

This record is the starting point for STATUS.md. Update it with evidence as work proceeds; retain the distinction between a verified source fact, an implementation requirement, and a completed test.
