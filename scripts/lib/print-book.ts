import { readFile } from 'node:fs/promises';
import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import sharp from 'sharp';
import { z } from 'zod';
import { decodeCanonical } from './algorithms/gray-v1.js';
import { canonicalJson, sha256Bytes } from './digests.js';
import { assertRegularProjectFile } from './paths.js';
import { loadPrintContext, validatePrint, type PrintReceiptSchema } from './printable.js';

type Context = Awaited<ReturnType<typeof loadPrintContext>>;
type Sheet = z.infer<typeof PrintReceiptSchema>;
const Hash = z.string().regex(/^[a-f0-9]{64}$/);
const File = z.object({ path: z.string(), bytes: z.number().int().positive(), sha256: Hash }).strict();
export const BookManifestSchema = z.object({
  schemaVersion: z.literal(1), layoutVersion: z.literal('letter-book-v1'), inputDigest: Hash,
  file: File.refine(f=>f.path==='downloads/fcc-coloring-book.pdf'),
  cover: File.refine(f=>f.path==='print/cover-line-art.png'),
  totalPages: z.number().int().positive(), coloringPages: z.literal(48),
  width: z.literal(612), height: z.literal(792), coverPage: z.literal(1), introPage: z.literal(2), sourcesPage: z.literal(51),
  sheets: z.array(z.object({ artworkId: z.string().regex(/^design-\d{3}$/), bookNumber: z.number().int().positive(), pdfPageNumber: z.number().int().positive(), individualSha256: Hash }).strict()).length(48),
}).strict().superRefine((book,ctx)=>{
  if(book.totalPages!==51 || new Set(book.sheets.map(s=>s.artworkId)).size!==48
      || book.sheets.some((s,i)=>s.bookNumber!==i+1 || s.pdfPageNumber!==i+3)) ctx.addIssue({code:'custom',message:'Book must contain cover, intro, 48 ordered sheets and sources with explicit page mapping.'});
});

export async function coverInput(root:string, context:Context) {
  const entry=context.data.manifest.files.find(f=>f.id===context.data.book.coverSourceId);
  if(!entry)throw new Error('Cover source is missing.');
  const source=await readFile(await assertRegularProjectFile(entry.path,root));
  if(sha256Bytes(source)!==entry.sha256)throw new Error('Cover source checksum failed.');
  const image=await decodeCanonical(source);
  // Deterministic print conversion of the supplied white-on-black illustration.
  // No tracing, generative redraw, crop or invented building detail.
  const pixels=Uint8Array.from(image.pixels,value=>255-value);
  const png=await sharp(pixels,{raw:{width:image.width,height:image.height,channels:1}}).png().toBuffer();
  return {png,sourceSha256:entry.sha256};
}

export function bookInputDigest(context:Context,sheets:Sheet[],coverHash:string) {
  return sha256Bytes(canonicalJson({kind:'fcc-print-book-v1',layoutVersion:'letter-book-v1',book:context.data.book,
    font:context.fontEntry.sha256,coverHash,repositoryUrl:context.data.project.repositoryUrl,
    sheets:sheets.map(s=>({artworkId:s.artworkId,inputDigest:s.inputDigest,sha256:s.file.sha256}))}));
}

function centered(page:PDFPage,font:PDFFont,text:string,y:number,preferred:number) {
  let size=preferred;
  while(font.widthOfTextAtSize(text,size)>540 && size>11)size-=0.5;
  if(font.widthOfTextAtSize(text,size)>540)throw new Error('Cover wording exceeds safe margins.');
  page.drawText(text,{font,size,x:(612-font.widthOfTextAtSize(text,size))/2,y,color:rgb(0,0,0)});
}

export function wrappedLines(font:PDFFont,text:string,size:number,width:number) {
  const lines:string[]=[];let line='';
  for(const word of text.split(/\s+/)) {
    if(font.widthOfTextAtSize(word,size)>width)throw new Error(`Print word does not fit: ${word}`);
    const next=line?`${line} ${word}`:word;
    if(font.widthOfTextAtSize(next,size)>width){lines.push(line);line=word;}else line=next;
  }
  if(line)lines.push(line);return lines;
}

function textPage(pdf:PDFDocument,font:PDFFont,heading:string,paragraphs:string[]) {
  const page=pdf.addPage([612,792]);
  page.drawText(heading,{font,size:22,x:48,y:726});
  let y=686;
  for(const paragraph of paragraphs) {
    for(const line of wrappedLines(font,paragraph,11.5,516)) {
      if(y<48)throw new Error(`${heading} requires another page; do not shrink or omit credit text.`);
      page.drawText(line,{font,size:11.5,x:48,y});y-=17;
    }
    y-=14;
  }
  return page;
}

export async function makeBook(root:string,context:Context,sheets:Sheet[],sheetBytes:Map<string,Uint8Array>) {
  const cover=await coverInput(root,context);
  if(sheets.length!==48 || sheets.some((s,i)=>s.artworkId!==context.data.book.artworkOrder[i]))throw new Error('Book requires all 48 verified sheets in authored order.');
  const pdf=await PDFDocument.create();pdf.registerFontkit(fontkit);
  pdf.setTitle(context.data.book.title);pdf.setAuthor('First Congregational Church, Kalamazoo');
  pdf.setCreationDate(new Date('2026-11-09T00:00:00Z'));pdf.setModificationDate(new Date('2026-11-09T00:00:00Z'));
  const font=await pdf.embedFont(context.font,{subset:true});
  const allText=[...context.data.book.coverLines,...context.data.book.intro,...context.data.book.sourcesText].join('');
  for(const char of allText)if(!font.getCharacterSet().includes(char.codePointAt(0)!))throw new Error(`Book font has no glyph for ${char}`);
  const page=pdf.addPage([612,792]);const lines=context.data.book.coverLines;
  if(lines.length!==5)throw new Error('Cover layout expects the five approved cover lines.');
  centered(page,font,lines[0]!,736,24);centered(page,font,lines[1]!,713,16);centered(page,font,lines[2]!,685,20);
  const illustration=await pdf.embedPng(cover.png);const scale=Math.min(520/illustration.width,520/illustration.height);
  const width=illustration.width*scale,height=illustration.height*scale;
  page.drawImage(illustration,{x:(612-width)/2,y:142+(520-height)/2,width,height});
  centered(page,font,lines[3]!,112,14);centered(page,font,lines[4]!,72,24);
  textPage(pdf,font,'Color the stained glass',[
    ...context.data.book.intro,
    'This book includes 48 coloring pages. Each drawing has a number from 1 to 48. The cover and these notes are not numbered coloring pages.',
    'Print on US Letter paper at 100% size. On A4 paper, choose Fit. The drawings leave room around the edges for most home printers.',
    'Use pencils, crayons or markers. If markers show through the paper, place a spare sheet underneath the page you are coloring.',
    'The page titles identify the scenes and symbols depicted in the stained glass, using the church’s historical guides.',
  ]);
  for(const sheet of sheets) {
    const bytes=sheetBytes.get(sheet.artworkId);
    if(!bytes || sha256Bytes(bytes)!==sheet.file.sha256)throw new Error(`Book sheet bytes do not match ${sheet.artworkId}.`);
    const original=await PDFDocument.load(bytes);if(original.getPageCount()!==1)throw new Error('Book interior must reuse one-page sheets.');
    const [copied]=await pdf.copyPages(original,[0]);pdf.addPage(copied!);
  }
  textPage(pdf,font,'Sources and credits',context.data.book.sourcesText);
  const bytes=await pdf.save();
  const manifest=BookManifestSchema.parse({schemaVersion:1,layoutVersion:'letter-book-v1',
    inputDigest:bookInputDigest(context,sheets,sha256Bytes(cover.png)),
    file:{path:'downloads/fcc-coloring-book.pdf',bytes:bytes.length,sha256:sha256Bytes(bytes)},
    cover:{path:'print/cover-line-art.png',bytes:cover.png.length,sha256:sha256Bytes(cover.png)},
    totalPages:pdf.getPageCount(),coloringPages:48,width:612,height:792,coverPage:1,introPage:2,sourcesPage:51,
    sheets:sheets.map((s,i)=>({artworkId:s.artworkId,bookNumber:i+1,pdfPageNumber:i+3,individualSha256:s.file.sha256}))});
  return {bytes,cover:cover.png,manifest};
}

export async function validatePrintCollection(root:string,context?:Context) {
  const current=context??await loadPrintContext(root);
  const sheets:Sheet[]=[];
  for(const id of current.data.book.artworkOrder)sheets.push(await validatePrint(root,id,current));
  const manifest=BookManifestSchema.parse(JSON.parse(await readFile(await assertRegularProjectFile('public/downloads/book-manifest.json',root),'utf8')));
  const cover=await coverInput(root,current);
  if(manifest.inputDigest!==bookInputDigest(current,sheets,sha256Bytes(cover.png)))throw new Error('Book inputs changed. Run npm.cmd run pdf.');
  for(const file of [manifest.file,manifest.cover]) {
    const bytes=await readFile(await assertRegularProjectFile(`public/${file.path}`,root));
    if(bytes.length!==file.bytes || sha256Bytes(bytes)!==file.sha256)throw new Error(`Book asset checksum failed: ${file.path}`);
  }
  if(manifest.sheets.some((s,i)=>s.artworkId!==current.data.book.artworkOrder[i] || s.individualSha256!==sheets[i]!.file.sha256))throw new Error('Book sheet order or caption bytes are stale.');
  const pdf=await PDFDocument.load(await readFile(await assertRegularProjectFile(`public/${manifest.file.path}`,root)));
  if(pdf.getPageCount()!==manifest.totalPages || pdf.getPages().some(p=>p.getWidth()!==612||p.getHeight()!==792))throw new Error('Book page count or Letter dimensions are invalid.');
  return {sheets,manifest};
}
