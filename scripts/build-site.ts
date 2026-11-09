import { readFile, readdir, lstat, unlink } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { build } from 'vite';
import { buildDevelopmentCatalog } from './build-catalog.js';
import { withOperationLock, promoteBatch, assertNoPendingTransaction } from './lib/atomic-files.js';
import { PROJECT_ROOT, assertSafeProjectPath, assertRegularProjectFile } from './lib/paths.js';
import { jsonBytes,sha256File } from './lib/digests.js';
import { CliError,isMain,runCli } from './lib/cli.js';
import { deploymentBase } from '../vite.config.js';

export function resolveSiteBase(env:NodeJS.ProcessEnv,customDomain?:string|null) {
 if(env.SITE_BASE!==undefined)return deploymentBase(env.SITE_BASE,env.FCC_PORTABLE_BUILD==='1');
 if(customDomain)return '/';
 const [owner,repo]=env.GITHUB_REPOSITORY?.split('/')??[];
 return deploymentBase(repo&&owner&&repo.toLowerCase()!==`${owner.toLowerCase()}.github.io`?`/${repo}/`:'/');
}
export async function fileInventory(root:string,directory:string) {
 const files:Array<{path:string;bytes:number;sha256:string}>=[];
 async function walk(dir:string){for(const entry of await readdir(path.join(root,dir),{withFileTypes:true})){
  const relative=path.posix.join(dir,entry.name);const stat=await lstat(path.join(root,relative));
  if(stat.isSymbolicLink()||(!stat.isFile()&&!stat.isDirectory()))throw new Error(`Nonregular build input: ${relative}`);
  if(stat.isDirectory())await walk(relative);else{
   if(stat.size>95*1024*1024)throw new Error(`File exceeds 95 MiB guard: ${relative}`);
   files.push({path:path.posix.relative(directory,relative),bytes:stat.size,sha256:await sha256File(path.join(root,relative))});
  }
 }}await walk(directory);return files.sort((a,b)=>a.path.localeCompare(b.path));
}
export async function buildSite(root=PROJECT_ROOT){
 if(Number(process.versions.node.split('.')[0])!==24)throw new Error('Build requires Node 24.');
 await assertNoPendingTransaction(root);
 await promisify(execFile)(process.execPath,[path.join(root,'node_modules/typescript/bin/tsc'),'--build'],{cwd:root});
 const catalog=await buildDevelopmentCatalog(root,'release');
 return withOperationLock(root,'build-site',async()=>{
  const project=JSON.parse(await readFile(await assertRegularProjectFile('project.json',root),'utf8'));
  const base=resolveSiteBase(process.env,project.customDomain);
  const stage=`.work/site-stage-${randomUUID()}`;
  await build({root,configFile:false,base,build:{outDir:stage,emptyOutDir:true,target:'es2022'}});
  await unlink(path.join(root,stage,'catalog.dev.json')).catch(error=>{if(error.code!=='ENOENT')throw error;});
  const files=await fileInventory(root,stage);const bytes=files.reduce((n,f)=>n+f.bytes,0);
  if(bytes>=1024**3)throw new Error('Built site exceeds the 1 GiB Pages guard.');
  if(!files.some(f=>f.path==='index.html')||!files.some(f=>/worker.*\.js$/.test(f.path))||files.some(f=>f.path.startsWith('source/')||f.path.includes('node_modules/')))throw new Error('Built runtime inventory is incomplete or includes source-only files.');
  // Every catalog download and package was validated before staging; require its
  // exact public bytes in the output too, including retained restoration versions.
  const publicFiles=await fileInventory(root,'public');
  for(const file of publicFiles.filter(f=>f.path!=='catalog.dev.json'))if(!files.some(f=>f.path===file.path&&f.sha256===file.sha256))throw new Error(`Missing or altered deployed asset: ${file.path}`);
  let commit:string|null=null,dirty=false;try{commit=(await promisify(execFile)('git',['rev-parse','HEAD'],{cwd:root})).stdout.trim();dirty=Boolean((await promisify(execFile)('git',['status','--porcelain'],{cwd:root})).stdout.trim());}catch{}
  const receipt={schemaVersion:1,projectVersion:project.projectVersion,base,repositoryUrl:catalog.repositoryUrl,commit,dirty,node:process.version,catalogSha256:await sha256File(path.join(root,'public/catalog.json')),deployedBytes:bytes,files};
  const updates=files.map(f=>({path:`dist/${f.path}`,fromFile:path.join(root,stage,f.path)}));
  await promoteBatch(root,'build-site',[...updates,{path:'dist/build-receipt.json',bytes:jsonBytes(receipt)}]);
  // Remove only obsolete regular files from the named output, never source work.
  for(const old of await fileInventory(root,'dist'))if(old.path!=='build-receipt.json'&&!files.some(f=>f.path===old.path))await unlink(await assertSafeProjectPath(`dist/${old.path}`,root));
  return {base,repositoryUrl:project.repositoryUrl,availableArtworks:catalog.artworks.filter(a=>a.available).length,files:files.length,deployedBytes:bytes,commit};
 });
}
if(isMain(import.meta.url))await runCli({operation:'build-site',scope:'release'},async report=>{
 if(process.argv.length>2)throw new CliError('E_ARGUMENT','Build takes no arguments. Use SITE_BASE for an explicit base.',2);
 report.summary=await buildSite();report.outputs.push('dist/build-receipt.json');
});
