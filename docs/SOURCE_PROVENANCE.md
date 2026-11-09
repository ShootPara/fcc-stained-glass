# Source provenance and extraction record

**Checkpoint:** WP01, 6 November 2026.  
**Purpose:** Let a recipient inspect every input locally and understand how it entered the project.

The canonical machine-readable records are [source/acquisition.json](../source/acquisition.json) and [source/manifest.json](../source/manifest.json). The acquisition map records identities, exact filenames, input associations, expected sizes, and source references. The manifest records measured sizes, SHA-256 values, native image dimensions, and provenance. Reference URLs are historical acquisition pointers; ordinary setup, validation, and local use read the included files.

## Included material

| Material | Files | Bytes |
| --- | ---: | ---: |
| Original JPEG photographs | 55 | 178,148,458 |
| Final coloring PNGs | 48 | 77,731,242 |
| Selected cover PNG | 1 | 1,486,541 |
| Original supplied DOCX transcriptions | 2 | 126,798 |
| Extracted full text with paragraph markers | 2 | 166,397 |
| Font and full OFL license | 2 | 415,126 |
| **Initial material total** | **110** | **258,074,562** |

Metadata files and future prepared assets are outside these material counts. The 106 files obtained from Drive total 257,493,039 bytes. Two text derivatives and two font/license files complete the 110-file inventory.

## Photographs and coloring artwork

- **Photographs:** [Coloring Book source folder](https://drive.google.com/drive/folders/170-6ayQ9E-kOxqaFzCWpshUCfPCQLHMY), corresponding to the owner's `Other computers\Brian's Alienware\Projects\ChatGPT\Coloring Book` location. All 55 numbered JPEGs are preserved under `source/photos/` with their supplied filenames.
- **Coloring sources:** [Coloring Pages folder](https://drive.google.com/drive/folders/16eIMB-D3s8frQyvs4sTKzp7D-FYCpThl), the source collection's `Coloring Pages` child. All 48 files, `002.png` through `049.png`, are preserved under `source/coloring/`.

The original bytes were downloaded through the connected Drive raw-file route, checked against the source metadata byte counts, hashed with SHA-256, and inspected for image format and native dimensions. All saved image files passed Pillow's integrity verification. The final saved files were rehashed against their acquisition receipts. These are file-integrity checks, not proof of a photo-to-drawing or historical match.

Thirty coloring files measure 1024 × 1536 pixels. Eighteen have other portrait dimensions. The full per-file measurements are in the manifest; preparation must preserve each image's own proportions. All 104 acquired images have effective EXIF orientation 1, treating a missing orientation tag as 1. Measured native dimensions remain distinct from any later canonical preparation dimensions.

The independent IDs are `photo-001`–`photo-055` and `design-002`–`design-049`. The photograph and coloring inventories are associated only as filename candidates at this checkpoint. Historical book numbers, media IDs, and printed book positions remain separate.

## Selected cover source

[Design_01_Front.png](https://drive.google.com/file/d/1z-WPDPDjXZU0wUxdoGHGDboSNEXq2xef/view) is the selected source illustration from the supplied two-building artwork. It is included unchanged at `source/cover/Design_01_Front.png` with ID `cover-front`.

- Size: **1,486,541 bytes**.
- Dimensions: **1254 × 1254 pixels**.
- SHA-256: `e12a04c30c1333e86867bebca57ae297d1c599c073c7e3584c572badc7bcaef3`.

This is the selected cover input. The print-friendly cover composition and typeset anniversary wording are later work, as specified in the requirements.

## Church histories

The two acquired files are **stored DOCX transcriptions**, not native Google documents and not original scanned book pages. Their complete original bytes are retained. Printed pagination has not been verified.

| Source ID | Included original | Bibliographic identity and acquisition reference |
| --- | --- | --- |
| `H28-DOCX` | `source/histories/Church History 1928.docx` | First Congregational Church, Kalamazoo. *Our Church: Its History, Its Structure, Its Service* (1928). [Supplied transcription](https://docs.google.com/document/d/1T3kosR0CzgFJ3xJ5yNAYd5hSyFChfieG/edit). |
| `H35-DOCX` | `source/histories/Church History 1935.docx` | Mrs. Stanley Morris, assisted by Mrs. James M. Hatfield. *First Congregational Church Centennial History 1835–1935*, October 1935. [Supplied transcription](https://docs.google.com/document/d/1TNf7BWNSTjjxA8QsqVFQNwwg75sk_ADr/edit). |

### Full text extraction

The full body text was extracted locally with Python's standard-library `zipfile` and `xml.etree.ElementTree` modules. The extraction read `word/document.xml` from each unchanged DOCX archive and applied the following rules:

1. Visit every `w:p` element in the document body in document order, including empty paragraphs.
2. Copy the contents of every `w:t` text node exactly, preserving spaces, punctuation, spelling, and the text inside hyperlinks.
3. Convert Word tab elements to U+0009, and line/break elements to U+000A. Preserve any explicit nonbreaking or soft-hyphen elements as their corresponding characters.
4. Prefix each paragraph with `[P0001] `, `[P0002] `, and so on. Append an LF after each paragraph and encode the result as UTF-8 without a byte-order mark.
5. Confirm that every body text node was consumed. Add no historical summaries, corrections, or image identifications.

Both archives passed ZIP integrity checks. Inspection found no substantive footnotes, endnotes, headers, footers, comments, tables, drawings, text boxes, automatic list numbering, or tracked changes needing separate extraction. H28 contains only empty separator records in its footnote/endnote parts. The original DOCX files retain their formatting.

| Measurement | H28 / `h28.txt` | H35 / `h35.txt` |
| --- | ---: | ---: |
| Paragraphs, including empty paragraphs | 619 | 228 |
| Nonempty paragraphs | 606 | 223 |
| Original `w:t` text nodes copied | 3,092 | 1,780 |
| Body-text characters before markers/separators | 97,709 | 60,999 |
| Whitespace-delimited body-text words | 16,887 | 10,565 |
| Extracted UTF-8 bytes | 103,328 | 63,069 |

The extracted files are included as canonical local transcription inputs: [h28.txt](../source/histories/h28.txt) and [h35.txt](../source/histories/h35.txt). Running the site or its normal Node tools does not require Python, Word, LibreOffice, Drive, or a repeat extraction.

### Exact file identities

| ID | Bytes | SHA-256 |
| --- | ---: | --- |
| `H28-DOCX` | 77,991 | `965975604c82582a15fa926ba4e09ebeacddd4302a0e80dbd53e2d17a26bb2e8` |
| `H28` | 103,328 | `87a744b87c85783b64537b2d7b839437ec73c6f5ab0416370a621b9598285f3a` |
| `H35-DOCX` | 48,807 | `2a384603f2cfd8fca2e3df12ddeabcf159a7effed4411947e64fb8648a305a0b` |
| `H35` | 63,069 | `230374686effcf0bb61f7f2755f09d76310d709bc31ea38573c36eeddb4b8b14` |

### Optional extraction audit

The following Python reference code reconstructs the two text files in memory and checks their included bytes. It is an archival audit recipe, not a setup or build requirement. Run it with the project root as the current directory. A changed DOCX structure requires a fresh inspection of notes and other text-bearing parts before reusing this recipe.

```python
from pathlib import Path
import hashlib
import xml.etree.ElementTree as ET
import zipfile

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
for year, stem in [(1928, "h28"), (1935, "h35")]:
    folder = Path("source/histories")
    with zipfile.ZipFile(folder / f"Church History {year}.docx") as archive:
        body = ET.fromstring(archive.read("word/document.xml")).find(W + "body")
        assert body is not None
        paragraphs = []
        for paragraph in body.iter(W + "p"):
            pieces = []
            for node in paragraph.iter():
                if node.tag == W + "t":
                    pieces.append(node.text or "")
                elif node.tag == W + "tab":
                    pieces.append("\t")
                elif node.tag in (W + "br", W + "cr"):
                    pieces.append("\n")
                elif node.tag == W + "noBreakHyphen":
                    pieces.append("\u2011")
                elif node.tag == W + "softHyphen":
                    pieces.append("\u00ad")
            paragraphs.append("".join(pieces))
    data = "".join(
        f"[P{number:04d}] {text}\n"
        for number, text in enumerate(paragraphs, 1)
    ).encode("utf-8")
    assert data == (folder / f"{stem}.txt").read_bytes(), stem
    print(stem, len(paragraphs), len(data), hashlib.sha256(data).hexdigest())
```

For historical citations, use the book title, named section, and numbered entry where present. A paragraph marker can be an additional local locator. It does not establish a printed page, a current physical window location, or a media match.

## Font and license acquisition

The included **Liberation Sans Regular** binary was copied unchanged from the installed LibreOffice distribution in the acquisition environment. Its font name table identifies the family as Liberation Sans and the version as **2.1.5**. The full license text was copied unchanged from the installed `pdfjs-dist` distribution's `standard_fonts/LICENSE_LIBERATION` file. The copyright and reserved-name statements agree with the font's records.

Those distribution locations describe the one-time acquisition. They are not paths a recipient needs. The required binary and full license are included locally:

| ID | Included path | Bytes | SHA-256 |
| --- | --- | ---: | --- |
| `font-liberation-sans-regular` | `source/fonts/LiberationSans-Regular.ttf` | 410,712 | `76d04c18ea243f426b7de1f3ad208e927008f961dc5945e5aad352d0dfde8ee8` |
| `font-liberation-license` | `source/fonts/OFL-Liberation.txt` | 4,414 | `93fed46019c38bbe566b479d22148e2e8a1e85ada614accb0211c37b2c61c19b` |

Upstream project reference: [Liberation Fonts](https://github.com/liberationfonts/liberation-fonts). License: **SIL Open Font License 1.1**. The included notice states digitized data copyright © 2010 Google Corporation and copyright © 2012 Red Hat, Inc., with reserved names recorded in [OFL-Liberation.txt](../source/fonts/OFL-Liberation.txt).

## Source changes and provenance boundaries

Acquisition URLs identify where material was obtained; they never serve as required fetch targets for the application. No expiring transfer references, bearer URLs, or account credentials are included in these records.

Use the explicit importer replacement command described in [README.md](../README.md) for a changed canonical source. It preserves previous bytes and their receipt before promoting the replacement. The current source ID remains stable, while the source digest changes and dependent preparation/review evidence must be reconsidered.

Source completeness and historical identification are separate checks. This checkpoint supplies the evidence and labels uncertainty. [ASSET_CREDITS.md](../ASSET_CREDITS.md) records established attribution and unresolved terms without assigning unsupported ownership.
