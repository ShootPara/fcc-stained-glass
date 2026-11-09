import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { PROJECT_ROOT } from './lib/paths.js';
import { isMain,parseNamedArgs,runCli } from './lib/cli.js';
import { sha256File } from './lib/digests.js';

if(isMain(import.meta.url))await runCli({operation:'audit-site'},async report=>{
 const args=parseNamedArgs(process.argv.slice(2),{url:'value'});
 if(typeof args.url!=='string')throw new Error('Use --url http(s)://host/base/.');
 const base=new URL(args.url);if(!['https:','http:'].includes(base.protocol)||!base.pathname.endsWith('/')||base.username||base.password)throw new Error('Use a plain HTTP(S) application base URL.');
 const response=await fetch(new URL('build-receipt.json',base));if(!response.ok)throw new Error(`Build receipt HTTP ${response.status}`);
 const receipt=await response.json() as {base:string;catalogSha256:string;commit:string|null;files:{path:string;bytes:number;sha256:string}[]};
 if(receipt.catalogSha256!==await sha256File(`${PROJECT_ROOT}/public/catalog.json`))throw new Error('Served catalog differs from current reviewed catalog.');
 const pending=[...receipt.files];let count=0,bytes=0;
 await Promise.all(Array.from({length:4},async()=>{while(pending.length){const file=pending.shift()!;
  if(file.path.split('/').some(p=>!p||p==='.'||p==='..')||/[\\:%?#]/.test(file.path))throw new Error('Unsafe receipt path.');
  const url=new URL(file.path,base);if(url.origin!==base.origin||!url.pathname.startsWith(base.pathname))throw new Error('Off-site asset.');
  const res=await fetch(url,{redirect:'error'});if(!res.ok||!res.body)throw new Error(`${file.path}: HTTP ${res.status}`);
  const hash=createHash('sha256');let size=0;for await(const chunk of res.body){hash.update(chunk);size+=chunk.length;}
  if(size!==file.bytes||hash.digest('hex')!==file.sha256)throw new Error(`${file.path}: served bytes differ.`);
  count++;bytes+=size;
 }}));
 const catalog=JSON.parse(await readFile(`${PROJECT_ROOT}/public/catalog.json`,'utf8'));
 report.summary={url:base.href,commit:receipt.commit,files:count,bytes,individualPdfs:catalog.artworks.filter((a:{printable?:unknown})=>a.printable).length,bookPages:catalog.book.totalPages,allHashesMatch:true};
});
