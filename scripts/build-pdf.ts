import { makeSheet, printInputs, validatePrint, loadPrintContext } from './lib/printable.js';
import { makeBook, validatePrintCollection } from './lib/print-book.js';
import { promoteBatch, withOperationLock } from './lib/atomic-files.js';
import type { FileUpdate } from './lib/atomic-files.js';
import { CliError, isMain, parseNamedArgs, runCli } from './lib/cli.js';
import { jsonBytes, sha256Bytes } from './lib/digests.js';
import { PROJECT_ROOT, assertRegularProjectFile } from './lib/paths.js';

if (isMain(import.meta.url)) await runCli({ operation: 'pdf' }, async report => {
  const args = parseNamedArgs(process.argv.slice(2), { id: 'value', validate: 'boolean', all: 'boolean', 'book-only':'boolean' });
  if(args.id && args.all)throw new CliError('E_ARGUMENT','Choose --id or --all, not both.',2);
  if(args.id && args['book-only'])throw new CliError('E_ARGUMENT','--book-only cannot select an individual sheet.',2);
  if(args.id && (typeof args.id!=='string'||!/^design-\d{3}$/.test(args.id)))throw new CliError('E_ARGUMENT','Use --id design-NNN.',2);
  const id=typeof args.id==='string'?args.id:undefined;
  await withOperationLock(PROJECT_ROOT,'pdf',async()=>{
    const context=await loadPrintContext(PROJECT_ROOT,id);
    const ids=id?[id]:context.data.book.artworkOrder;
    if(!args.validate){
      const updates:FileUpdate[]=[],sheets=[],sheetBytes=new Map<string,Uint8Array>();
      for(const artworkId of ids){
        if(args['book-only']){
          const receipt=await validatePrint(PROJECT_ROOT,artworkId,context);
          sheets.push(receipt);sheetBytes.set(artworkId,await readFile(await assertRegularProjectFile(`public/${receipt.file.path}`,PROJECT_ROOT)));
          continue;
        }
        const input=await printInputs(PROJECT_ROOT,artworkId,context);
        const output=await makeSheet(input);
        const receipt={schemaVersion:1 as const,artworkId,inputDigest:input.inputDigest,
          file:{path:`print/${artworkId}.pdf`,bytes:output.bytes.length,sha256:sha256Bytes(output.bytes)},
          width:612 as const,height:792 as const,pages:1 as const,effectiveDpi:output.effectiveDpi};
        sheets.push(receipt);sheetBytes.set(artworkId,output.bytes);
        updates.push({path:`public/${receipt.file.path}`,bytes:output.bytes},{path:`generated/print-${artworkId}.json`,bytes:jsonBytes(receipt)});
        console.log(`Prepared printable ${artworkId}.`);
      }
      if(!id){
        const book=await makeBook(PROJECT_ROOT,context,sheets,sheetBytes);
        updates.push({path:`public/${book.manifest.file.path}`,bytes:book.bytes},{path:`public/${book.manifest.cover.path}`,bytes:book.cover},
          {path:'public/downloads/book-manifest.json',bytes:jsonBytes(book.manifest)});
      }
      await promoteBatch(PROJECT_ROOT,'pdf',updates);
      report.outputs.push(...updates.map(update=>update.path));
    }
    if(id)report.summary=await validatePrint(PROJECT_ROOT,id,context);
    else{
      const checked=await validatePrintCollection(PROJECT_ROOT,context);
      report.summary={individualPdfs:checked.sheets.length,bookPages:checked.manifest.totalPages,bookBytes:checked.manifest.file.bytes,
        bookSha256:checked.manifest.file.sha256,minEffectiveDpi:Math.min(...checked.sheets.map(s=>s.effectiveDpi))};
    }
  });
});
import { readFile } from 'node:fs/promises';
