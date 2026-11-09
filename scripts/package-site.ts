import { mkdir,readFile,writeFile } from 'node:fs/promises';
import { zipSync } from 'fflate';
import { buildSite,fileInventory } from './build-site.js';
import { PROJECT_ROOT } from './lib/paths.js';
import { isMain,runCli } from './lib/cli.js';
import { sha256Bytes,jsonBytes } from './lib/digests.js';

if(isMain(import.meta.url))await runCli({operation:'package-site'},async report=>{
 if(process.argv.length>2)throw new Error('Package takes no arguments.');
 process.env.SITE_BASE='./';process.env.FCC_PORTABLE_BUILD='1';
 await buildSite();
 const inventory=await fileInventory(PROJECT_ROOT,'dist');
 const files:Record<string,Uint8Array>={};for(const f of inventory)files[f.path]=await readFile(`${PROJECT_ROOT}/dist/${f.path}`);
 const zip=zipSync(files,{level:6});await mkdir(`${PROJECT_ROOT}/release-artifacts`,{recursive:true});
 await writeFile(`${PROJECT_ROOT}/release-artifacts/fcc-stained-glass-site.zip`,zip);
 const result={file:'release-artifacts/fcc-stained-glass-site.zip',bytes:zip.length,sha256:sha256Bytes(zip),base:'./',files:inventory.length};
 await writeFile(`${PROJECT_ROOT}/release-artifacts/site-zip-receipt.json`,jsonBytes(result));report.summary=result;
});
