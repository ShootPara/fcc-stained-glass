import { readdir, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { PROJECT_ROOT } from './lib/paths.js';
import { withOperationLock } from './lib/atomic-files.js';
import { isMain, runCli, parseNamedArgs } from './lib/cli.js';
import { jsonBytes } from './lib/digests.js';

/** Reviews Poppler's actual page rasters; does not mark any content review complete. */
if(isMain(import.meta.url))await runCli({operation:'review-print-render'},async report=>{
  const args=parseNamedArgs(process.argv.slice(2),{prefix:'value'});
  const prefix=args.prefix??'book';if(typeof prefix!=='string'||!/^\w+$/.test(prefix))throw new Error('Use a simple raster prefix.');
  await withOperationLock(PROJECT_ROOT,'review-print-render',async()=>{
    const directory=path.join(PROJECT_ROOT,'.work/pdf-review');
    await mkdir(directory,{recursive:true});
    const files=(await readdir(directory)).filter(f=>new RegExp(`^${prefix}-\\d+\\.png$`).test(f)).sort((a,b)=>Number(a.match(/\d+/)![0])-Number(b.match(/\d+/)![0]));
    if(files.length!==51)throw new Error('Render all 51 pages with pdftoppm -r 72 -png first.');
    const tiles:Buffer[]=[],bounds=[];
    for(const [index,file] of files.entries()){
      const png=await readFile(path.join(directory,file));
      const {data,info}=await sharp(png).flatten({background:'white'}).greyscale().raw().toBuffer({resolveWithObject:true});
      if(info.width!==612||info.height!==792)throw new Error('Review rasters must be Letter at 72 dpi.');
      let left=612,top=792,right=0,bottom=0;
      for(let y=0;y<792;y++)for(let x=0;x<612;x++)if(data[y*612+x]!<230){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
      bounds.push({pdfPage:index+1,left,top,right,bottom,insideSafeArea:left>=35&&top>=35&&right<=577&&bottom<=757});
      const name=index===0?'Cover':index===1?'Introduction':index===50?'Sources':`Coloring page ${index-1}`;
      const label=Buffer.from(`<svg width="612" height="28"><rect width="612" height="28" fill="#eee"/><text x="10" y="20" font-size="16">PDF ${index+1}: ${name}</text></svg>`);
      tiles.push(await sharp({create:{width:612,height:824,channels:3,background:'white'}}).composite([{input:label,left:0,top:0},{input:png,left:0,top:30}]).png().toBuffer());
    }
    for(let i=0;i<tiles.length;i+=4){
      await sharp({create:{width:1240,height:1664,channels:3,background:'#bbb'}})
        .composite(tiles.slice(i,i+4).map((input,j)=>({input,left:(j%2)*624,top:Math.floor(j/2)*832}))).png()
        .toFile(path.join(directory,`${prefix}-sheet-${String(i/4+1).padStart(2,'0')}.png`));
    }
    await writeFile(path.join(directory,`${prefix}-bounds.json`),jsonBytes(bounds));
    report.summary={pages:files.length,safeAreaViolations:bounds.filter(b=>!b.insideSafeArea),contactSheets:13};
  });
});
