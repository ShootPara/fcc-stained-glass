import http from 'node:http';
import { readFile,stat,realpath } from 'node:fs/promises';
import path from 'node:path';
const args=process.argv.slice(2),values={};
for(let i=0;i<args.length;i+=2){if(!['--root','--port','--base'].includes(args[i])||!args[i+1])throw new Error('Use --root dist --port 5174 [--base /prefix/].');values[args[i].slice(2)]=args[i+1];}
const root=await realpath(values.root??'dist');
let receipt;try{receipt=JSON.parse(await readFile(path.join(root,'build-receipt.json'),'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
const base=values.base??(receipt?.base==='./'?'/':receipt?.base)??'/';
if(!/^\/(?:[A-Za-z0-9._~-]+\/)*$/.test(base)||base.includes('/../')||base.includes('/./'))throw new Error('Invalid base.');
const port=Number(values.port??5174);if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid port.');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.webp':'image/webp','.pdf':'application/pdf','.bin':'application/octet-stream'};
const server=http.createServer(async(req,res)=>{try{
 const raw=new URL(req.url,'http://localhost').pathname;
 if(!raw.startsWith(base)){res.writeHead(404);res.end();return;}
 const relative=decodeURIComponent(raw.slice(base.length))||'index.html';
 if(relative.split('/').some(s=>s==='..'||s==='.')||relative.includes('\\')||relative.includes('\0'))throw new Error('Invalid path.');
 const file=await realpath(path.join(root,relative));const containment=path.relative(root,file);
 if(containment.startsWith('..')||path.isAbsolute(containment)||(await stat(file)).isDirectory())throw new Error('Outside root.');
 const bytes=await readFile(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]??'application/octet-stream','Cache-Control':path.extname(file)==='.json'?'no-store':'no-cache'});res.end(bytes);
 }catch{res.writeHead(404);res.end('Not found');}});
server.on('error',error=>{console.error(error.message);process.exitCode=1;});
server.listen(port,'127.0.0.1',()=>console.log(`http://127.0.0.1:${port}${base}`));
