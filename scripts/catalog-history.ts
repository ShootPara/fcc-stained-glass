import { readFile } from 'node:fs/promises';
import { HistoricalSubjectSchema } from '../src/shared/validation.js';
import { withOperationLock, promoteBatch } from './lib/atomic-files.js';
import { PROJECT_ROOT, assertRegularProjectFile } from './lib/paths.js';
import { canonicalJson, jsonBytes } from './lib/digests.js';
import { isMain, parseNamedArgs, runCli } from './lib/cli.js';

/** Transcribe the actual 1928 list. This NEVER identifies a photograph or drawing. */
if(isMain(import.meta.url))await runCli({operation:'catalog-history'},async report=>{
  if(!parseNamedArgs(process.argv.slice(2),{apply:'boolean'}).apply)throw new Error('Use --apply to add the source-backed history records.');
  await withOperationLock(PROJECT_ROOT,'catalog-history',async()=>{
    const text=await readFile(await assertRegularProjectFile('source/histories/h28.txt',PROJECT_ROOT),'utf8');
    const collection=JSON.parse(await readFile(await assertRegularProjectFile('content/historical-subjects.json',PROJECT_ROOT),'utf8'));
    const subjects=[];let window=0;
    for(const line of text.split(/\r?\n/)){
      const match=line.match(/^\[P(\d+)\]\s+(.*)$/);if(!match)continue;
      const paragraph=Number(match[1]);if(paragraph<52||paragraph>135)continue;
      const heading=match[2]!.match(/^WINDOW NO\. (\d+)$/);
      if(heading){window=Number(heading[1]);continue;}
      const item=match[2]!.match(/^(\d+)\.\s+(.+)$/);if(!item)continue;
      const number=Number(item[1]),label=item[2]!;
      const sourceLocation=window<=6?'1928 guide: right side when facing the chancel; window order begins at the front.'
        :window<=12?'1928 guide: left side; window 7 begins at the entrance end, with the sequence continuing toward the front.'
        :window===13?'1928 guide: the south window.':window===14?'1928 guide: in the chancel above the organ.':undefined;
      subjects.push(HistoricalSubjectSchema.parse({id:`h28-window-${String(window).padStart(2,'0')}-subject-${String(number).padStart(2,'0')}`,
        sourceId:'H28',section:`The Windows, window ${window}`,windowNumber:window,subjectNumber:number,sourceLabel:`${number}. ${label}`,
        title:label.replace(/\.$/,''),...(sourceLocation?{sourceLocation}:{}),
        evidence:[{sourceId:'H28',section:`The Windows, window ${window}`,locator:`h28.txt [P${match[1]}]; transcription paragraph, not a printed page number.`}]}));
    }
    if(subjects.length!==64||subjects.some((s,i)=>s.subjectNumber!==i+1))throw new Error('The inspected source must contain subjects 1-64 exactly once.');
    const memorial=[
      ['christ','Christ as the Peace Maker',44],['mary','Mary in prayer',45],['john-baptist','John the Baptist',45],
      ['paul','Saint Paul with book and sword',46],['peter','Saint Peter with scroll and keys',47],
      ['nativity','Nativity and adoration by the Magi',48],['baptism','Baptism of Christ',48],['crucifixion','Crucifixion',48],
      ['resurrection','Resurrection',48],['ascension','Ascension',48],
    ] as const;
    for(const [key,title,paragraph]of memorial)subjects.push(HistoricalSubjectSchema.parse({id:`h28-memorial-${key}`,sourceId:'H28',
      section:'The Memorial Window',sourceLabel:title,title,sourceLocation:'1928 guide: memorial window above the Communion table at the front of the nave.',
      designer:'Alfred E. Floegel',memorial:'Rachel Babcock Upjohn',evidence:[
        {sourceId:'H28',section:'The Memorial Window',locator:`h28.txt [P${String(paragraph).padStart(4,'0')}]; transcription paragraph.`},
        {sourceId:'H28',section:'The Memorial Window and architect description',locator:'h28.txt [P0040] (designer), [P0048] (memorial inscription).'},
      ]}));
    const ids=new Set(subjects.map(s=>s.id));
    // Preserve any other authored records. Existing same-ID edits require review,
    // not silent replacement by a transcription command.
    for(const old of collection.subjects){
      const current=subjects.find(s=>s.id===old.id);
      if(current&&canonicalJson(old)!==canonicalJson(current))throw new Error(`Preserve authored changes to ${old.id}; reconcile manually.`);
    }
    const merged=[...collection.subjects.filter((s:{id:string})=>!ids.has(s.id)),...subjects];
    await promoteBatch(PROJECT_ROOT,'catalog-history',[{path:'content/historical-subjects.json',bytes:jsonBytes({schemaVersion:1,subjects:merged})}]);
    report.summary={sourceSubjects:subjects.length,photoAssociationsCreated:0,modernLocationsConfirmed:0};
  });
});
