import { readFile } from 'node:fs/promises';
import { beforeAll, describe, expect, it } from 'vitest';
import { validateCatalog } from '../../scripts/validate-content.js';
import { AssetRegistrySchema } from '../../src/shared/assets.js';
import { PROJECT_ROOT } from '../../scripts/lib/paths.js';
import { printContextFromValidated, validatePrint } from '../../scripts/lib/printable.js';
import { BookManifestSchema, validatePrintCollection } from '../../scripts/lib/print-book.js';

describe('complete printable collection',()=>{
  let context:Awaited<ReturnType<typeof printContextFromValidated>>;
  beforeAll(async()=>{
    const catalog=await validateCatalog({root:PROJECT_ROOT});
    if(!catalog.ok||!catalog.data)throw new Error('Catalog fixture must validate.');
    const registry=AssetRegistrySchema.parse(JSON.parse(await readFile('generated/assets.json','utf8')));
    context=await printContextFromValidated(PROJECT_ROOT,catalog.data,registry);
  });
  it('verifies every individual sheet and all 51 book pages in order',async()=>{
    const {sheets,manifest}=await validatePrintCollection(PROJECT_ROOT,context);
    expect(sheets).toHaveLength(48);expect(manifest.totalPages).toBe(51);
    expect(manifest.sheets[0]).toMatchObject({artworkId:'design-002',bookNumber:1,pdfPageNumber:3});
    expect(manifest.sheets[47]).toMatchObject({artworkId:'design-049',bookNumber:48,pdfPageNumber:50});
    expect(manifest.sheets.map(s=>s.artworkId)).toEqual(context.data.book.artworkOrder);
    expect(sheets.every(s=>s.effectiveDpi>160)).toBe(true);
  });
  it('rejects a stale book after introduction text changes',async()=>{
    const changed={...context,data:{...context.data,book:{...context.data.book,intro:[...context.data.book.intro,'New introduction text.']}}};
    await expect(validatePrintCollection(PROJECT_ROOT,changed)).rejects.toThrow('Book inputs changed');
  });
  it('rejects a stale sheet after its title changes',async()=>{
    const changed={...context,data:{...context.data,artworks:context.data.artworks.map(a=>a.id==='design-049'?{...a,title:'Changed caption'}:a)}};
    await expect(validatePrint(PROJECT_ROOT,'design-049',changed)).rejects.toThrow('Printable inputs changed');
  });
  it('rejects duplicated or shifted book page mappings',async()=>{
    const manifest=JSON.parse(await readFile('public/downloads/book-manifest.json','utf8'));
    const duplicate=structuredClone(manifest);duplicate.sheets[1].artworkId=duplicate.sheets[0].artworkId;
    expect(BookManifestSchema.safeParse(duplicate).success).toBe(false);
    const shifted=structuredClone(manifest);shifted.sheets[0].pdfPageNumber=4;
    expect(BookManifestSchema.safeParse(shifted).success).toBe(false);
  });
});
