import { readFile } from 'node:fs/promises';
import { PDFDocument, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { z } from 'zod';
import { canonicalJson, sha256Bytes } from './digests.js';
import { assertRegularProjectFile } from './paths.js';
import { validateCatalog, type CatalogData } from '../validate-content.js';
import { AssetRegistrySchema, type AssetRegistry } from '../../src/shared/assets.js';
import { validateAssets } from './validate-assets.js';
import { hasCurrentEditorialReview } from './asset-identity.js';

export const PrintReceiptSchema = z.object({ schemaVersion: z.literal(1), artworkId: z.string().regex(/^design-\d{3}$/), inputDigest: z.string().regex(/^[a-f0-9]{64}$/),
  file: z.object({ path: z.string(), bytes: z.number().int().positive(), sha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
  width: z.literal(612), height: z.literal(792), pages: z.literal(1), effectiveDpi: z.number().positive() }).strict()
  .refine(r => r.file.path === `print/${r.artworkId}.pdf`, 'Printable path must match artwork identity.');

export async function loadPrintContext(root: string, id?: string) {
  const validation = await validateCatalog({ root });
  if (!validation.ok || !validation.data) throw new Error('Catalog must pass before PDF generation.');
  const data = validation.data;
  // Blank print eligibility depends on verified canonical art, not coloring-map
  // names. Pending segmentation reviews still block the finished site release.
  const assets = await validateAssets({ root, data, id });
  if (!assets.ok) throw new Error('Selected artwork assets must pass before printing.');
  const registry = AssetRegistrySchema.parse(JSON.parse(await readFile(await assertRegularProjectFile('generated/assets.json', root), 'utf8')));
  return printContextFromValidated(root,data,registry);
}

/** Reuse a caller's just-validated catalog/assets rather than checking all maps twice. */
export async function printContextFromValidated(root:string,data:CatalogData,registry:AssetRegistry) {
  const fontEntry = data.manifest.files.find(f => f.id === data.book.fontSourceId)!;
  const font = await readFile(await assertRegularProjectFile(fontEntry.path, root));
  if (sha256Bytes(font) !== fontEntry.sha256) throw new Error('Font checksum failed.');
  return { data, registry, fontEntry, font };
}

export async function printInputs(root: string, id = 'design-002', context?: Awaited<ReturnType<typeof loadPrintContext>>) {
  const { data, registry, fontEntry, font } = context ?? await loadPrintContext(root, id);
  const artwork = data.artworks.find(a => a.id === id);
  const prepared = registry.artworks[id];
  if (!artwork || !prepared) throw new Error(`${id} must be a prepared catalog drawing.`);
  const version = prepared.versions[prepared.activeVersion]!;
  const packagePath = version.package.path;
  const pkg = JSON.parse(await readFile(await assertRegularProjectFile(packagePath, root), 'utf8'));
  const directory = packagePath.slice(0, packagePath.lastIndexOf('/') + 1);
  const png = await readFile(await assertRegularProjectFile(directory + pkg.canonical.path, root));
  if (png.length !== pkg.canonical.bytes || sha256Bytes(png) !== pkg.canonical.sha256) throw new Error('Canonical PNG checksum failed.');
  const location = artwork.location.confidence === 'unidentified' || !hasCurrentEditorialReview(data, artwork.id, 'location')
    ? 'Location not yet identified' : `${artwork.location.confidence === 'likely' ? 'Likely location: ' : ''}${artwork.location.value}`;
  const footer = `Coloring page ${artwork.bookNumber} | ${location}`;
  const inputDigest = sha256Bytes(canonicalJson({ kind: 'letter-wp04-v1', title: artwork.title, footer,
    canonical: sha256Bytes(png), font: fontEntry.sha256, size: [612, 792], margin: 36, fontSize: 16, footerSize: 10 }));
  return { png, font, title: artwork.title, footer, inputDigest };
}

export async function makeSheet(input: { png: Uint8Array; font: Uint8Array; title: string; footer: string }) {
  const pdf = await PDFDocument.create(); pdf.registerFontkit(fontkit);
  pdf.setTitle(input.title); pdf.setAuthor('First Congregational Church, Kalamazoo');
  pdf.setCreationDate(new Date('2026-11-09T00:00:00Z')); pdf.setModificationDate(new Date('2026-11-09T00:00:00Z'));
  const font = await pdf.embedFont(input.font, { subset: true });
  for (const char of input.title + input.footer) if (!font.getCharacterSet().includes(char.codePointAt(0)!)) throw new Error(`Font has no glyph for ${char}.`);
  const wrap = (text: string, size: number) => {
    const lines: string[] = []; let line = '';
    for (const word of text.split(/\s+/)) {
      if (font.widthOfTextAtSize(word, size) > 540) throw new Error('Printable word exceeds page width.');
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > 540) { lines.push(line); line = word; } else line = next;
    }
    if (line) lines.push(line); return lines;
  };
  const title = wrap(input.title, 16); const footer = wrap(input.footer, 10);
  const page = pdf.addPage([612, 792]);
  title.forEach((line, index) => page.drawText(line, { x: 36, y: 740 - index * 20, size: 16, font, color: rgb(0, 0, 0) }));
  footer.forEach((line, index) => page.drawText(line, { x: 36, y: 40 + (footer.length - index - 1) * 14, size: 10, font }));
  const image = await pdf.embedPng(input.png);
  const bottom = 56 + footer.length * 14; const top = 730 - title.length * 20;
  const scale = Math.min(540 / image.width, (top - bottom) / image.height);
  if (scale <= 0) throw new Error('Caption leaves no drawing space.');
  const width = image.width * scale; const height = image.height * scale;
  page.drawImage(image, { x: (612 - width) / 2, y: bottom + (top - bottom - height) / 2, width, height });
  return { bytes: await pdf.save(), effectiveDpi: image.width / (width / 72) };
}

export async function validatePrint(root: string, id = 'design-002', context?: Awaited<ReturnType<typeof loadPrintContext>>) {
  const receipt = PrintReceiptSchema.parse(JSON.parse(await readFile(await assertRegularProjectFile(`generated/print-${id}.json`, root), 'utf8')));
  if (receipt.artworkId !== id) throw new Error('Printable receipt identity mismatch.');
  const inputs = await printInputs(root, id, context);
  if (receipt.inputDigest !== inputs.inputDigest) throw new Error(`Printable inputs changed. Run npm.cmd run pdf -- --id ${id}.`);
  const bytes = await readFile(await assertRegularProjectFile(`public/${receipt.file.path}`, root));
  if (bytes.length !== receipt.file.bytes || sha256Bytes(bytes) !== receipt.file.sha256) throw new Error('Printable PDF checksum failed.');
  const pdf = await PDFDocument.load(bytes); const pages = pdf.getPages();
  if (pages.length !== 1 || pages[0]!.getWidth() !== 612 || pages[0]!.getHeight() !== 792) throw new Error('PDF must be one Letter portrait page.');
  return receipt;
}
