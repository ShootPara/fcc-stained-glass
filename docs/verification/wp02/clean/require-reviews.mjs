import path from 'node:path';
import { pathToFileURL } from 'node:url';
const root = process.cwd();
const { validateCatalog } = await import(pathToFileURL(path.join(root, 'scripts/validate-content.ts')).href);
const { validateAssets } = await import(pathToFileURL(path.join(root, 'scripts/lib/validate-assets.ts')).href);
const catalog = await validateCatalog({root});
if (!catalog.ok || !catalog.data) {
  console.log(JSON.stringify({ok:false,stage:'catalog',issues:catalog.issues},null,2));
  process.exitCode = 1;
} else {
  const result = await validateAssets({root,data:catalog.data,id:'design-002',requireReviews:true});
  console.log(JSON.stringify({ok:result.ok,options:{id:'design-002',requireReviews:true},stats:result.stats,warnings:result.warnings,issues:result.issues,activeVersion:result.artworks['design-002']?.activeVersion},null,2));
  if (!result.ok) process.exitCode = 1;
}
