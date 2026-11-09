import { readFile } from 'node:fs/promises';
import { withOperationLock, promoteBatch } from './lib/atomic-files.js';
import { PROJECT_ROOT } from './lib/paths.js';
import { jsonBytes } from './lib/digests.js';
import { validateCatalog, validateCatalogData } from './validate-content.js';
import { computeEditorialReviewDigest } from './lib/asset-identity.js';
import { isMain, runCli } from './lib/cli.js';

// Authored visual comparisons, not a filename-to-guide-number algorithm.
// Evidence: inspected pairing sheets 01–12, individual region/source reviews,
// photo-001-history.png, wp05-history-extra.png, and the included H28/H35 text.
const decisions: Record<string, [number[], string]> = {
 '002': [[1], 'Sun, crescent, star and water match the named creation symbols.'],
 '003': [[2], 'A prominent fish rises through water beneath a rainbow.'],
 '004': [[3], 'Monkey and winged bird among leaves fit the first land-animal scene. The two creation-animal entries are not individually described, so this is an inference.'],
 '005': [[4], 'Lion, elephant and small monkey fit the second land-animal scene; its distinction from the first entry remains inferred.'],
 '006': [[7], 'Two faces meet beneath a fruit-bearing tree; one holds the round fruit toward the other.'],
 '007': [[5], 'A hand descends from above toward a reclining bearded man, supporting creation of Adam rather than a writing scene.'],
 '008': [[6], 'A standing woman appears above a reclining man, supporting creation of Eve.'],
 '009': [[8], 'A long-necked serpent lies beneath a thorny branching plant. This is not a bird.'],
 '010': [[11], 'An ark floats above raised human hands and water.'],
 '011': [[12], 'A dove flies beside a bearded face in the ark window, with water below.'],
 '012': [[9], 'A flaming sword and fruit support eviction from Paradise; no individual people are shown.'],
 '013': [[10], 'Two birds flank masonry altars, with a burning offering below; the subject is inferred from the offering motif.'],
 '014': [[13], 'A bearded figure raises a hand beside a burning stone altar under an arch.'],
 '015': [[14], 'The tall building and visible BABYLON lettering support the guide\'s Babel entry.'],
 '016': [[15], 'Three fleeing faces appear beneath a burning city.'],
 '017': [[16], 'A reclining figure looks toward feet on ascending steps, beside an oil vessel.'],
 '018': [[19], 'An Egyptian-dressed figure rides an ornate horse-drawn chariot.'],
 '019': [[20], 'A woman reaches toward an infant in a basket with pyramids behind.'],
 '020': [[17], 'The visible JACOB and ESAU names, oath hand and steaming bowl support the birthright scene.'],
 '021': [[18], 'A partially clothed young figure stands beside a camel and tied bundle, consistent with Joseph being sold; the guide gives no detailed composition.'],
 '022': [[21], 'A crowned Egyptian-looking figure and horse appear amid sweeping water-like bands; the Red Sea identification remains an inference.'],
 '023': [[22], 'A bearded face appears among branches beneath a row of flames.'],
 '024': [[23,52], 'The upper raised hand and flowing bands support Moses and water; the lower two carriers share a large grape cluster. These separate motifs fit both cited entries, without proving their original window arrangement.'],
 '025': [[24], 'A standing bearded figure holds two tablets and raises a hand.'],
 '026': [[25], 'A seated strong figure bends over a lion, with hands at its open mouth.'],
 '027': [[26], 'A smaller figure with sling/pouch faces an armored warrior with shield and a fallen head below.'],
 '028': [[27], 'The central young figure\'s hair extends upward into a tree while armed figures surround him, supporting Absalom; this is not treated as a confirmed portrait.'],
 '029': [[28], 'A woman and small child ride a donkey led by a staff-bearing man.'],
 '030': [[29], 'A winged messenger appears above a praying woman beside a lily.'],
 '031': [[30], 'Three crowned figures look toward a radiant star.'],
 '032': [[31], 'Three faces are enclosed above flames, with a ruler and attendants beside them.'],
 '033': [[32], 'A haloed woman holds a haloed child.'],
 '034': [[33], 'A rough-clothed figure pours water over a kneeling haloed figure beneath a dove.'],
 '035': [[34], 'A haloed figure rides a donkey among attendants and flowers.'],
 '036': [[35], 'A haloed teacher raises a finger from a boat on waves.'],
 '037': [[36], 'A kneeling ragged figure bows before an older standing figure who raises his hand; the return-of-the-prodigal reading is inferred.'],
 '038': [[37], 'A haloed figure reaches toward a wrapped standing figure beside an open stone tomb.'],
 '039': [[38], 'A haloed staff-bearing visitor stands beside a doorway, holding a round object.'],
 '040': [[39], 'The central crucified figure is flanked by two praying mourners.'],
 '041': [[40], 'A risen haloed figure appears above an angel and an armored guard.'],
 '042': [[41], 'Feet and a robe rise above clouds and winged faces.'],
 '043': [[42], 'A blessing figure holds an open lettered book beneath a radiating halo.'],
 '044': [[43], 'A dove radiates beams above rows of individual flames.'],
 '045': [[44], 'A haloed seated figure blesses while holding a decorated book.'],
 '046': [[47], 'An inverted crucified figure is explicitly labeled ST PETER.'],
 '047': [[48], 'A bearded man carries a cross-bearing child across waves with a leafy staff.'],
 '048': [[], 'A haloed lamb and banner fit both H28 subject 45 and subject 61. The crop lacks enough architectural context to select one honestly.'],
 '049': [[46,62], 'The upper grotesque creature holds a three-tined fork amid flames; below, an animal stands beside a cross-marked round/book-like emblem and three hanging balls. These support the two guide motifs, but do not establish their original arrangement.'],
};

if (isMain(import.meta.url)) await runCli({operation:'history-review'}, async report => {
 if (process.argv.slice(2).join(' ') !== '--apply') throw new Error('Use --apply only after inspecting the listed evidence.');
 await withOperationLock(PROJECT_ROOT, 'history-review', async () => {
  try { await readFile(`${PROJECT_ROOT}/docs/WP05_HISTORICAL_REVIEW.json`); throw new Error('Historical review already recorded; preserve and revise its assertions explicitly.'); }
  catch(error) { if((error as NodeJS.ErrnoException).code!=='ENOENT') throw error; }
  const initial = await validateCatalog(); if(!initial.ok || !initial.data) throw new Error('Catalog must be valid first.');
  const data = initial.data;
  const ref = (sourceId:string, section:string, locator?:string) => ({sourceId,section,...(locator?{locator}:{})});
  for(const artwork of data.artworks) {
   const [numbers, rationale] = decisions[artwork.id.slice(-3)]!;
   const subjects = numbers.map(n=>data.subjects.find(s=>s.subjectNumber===n)!);
   artwork.subjects = {value:subjects.length?subjects.map(s=>s.id):null,confidence:subjects.length?'likely':'unidentified',rationale,
    evidence:[ref(artwork.sourceId, rationale),ref(artwork.originalPhoto.value!, 'Inspected original photograph in the matching visual-pairing sheet.'),
     ...(subjects.length?subjects.flatMap(s=>s.evidence):[ref('H28','The Windows', 'h28.txt [P0111] and [P0131]; two plausible lamb entries.')])]};
   artwork.location = {value:null,confidence:'unidentified',rationale:'Reviewed the source photograph, matched drawing and guide location descriptions. A cropped detail and historical sequence do not independently establish its present-day physical location.',evidence:[ref(artwork.sourceId,'Full detail drawing.'),ref('H28','The Windows','h28.txt [P0050]–[P0135]; historical sequence, not a modern survey.')]};
   const photo = data.photos.find(p=>p.id===artwork.originalPhoto.value)!;
   photo.subjects = structuredClone(artwork.subjects);
   photo.location = {...structuredClone(artwork.location),evidence:[ref(photo.sourceId,'Full detail photograph.'),ref('H28','The Windows','h28.txt [P0050]–[P0135]; historical sequence, not a modern survey.')]};
   const old = artwork.publicDescription.replace(/ Historical identification and location in the church are still being reviewed\./g,'');
   const historical = subjects.length ? ` Likely historical subject${subjects.length>1?'s':''}: ${subjects.map(s=>s.title).join('; ')} (1928 guide; visual interpretation).` : ' Historical subject remains unidentified after review: two different lamb entries in the 1928 guide fit this detail.';
   artwork.publicDescription=old+historical+' Present-day location is unconfirmed.';
   photo.description=artwork.publicDescription;
   artwork.citations=subjects.length?subjects.flatMap(s=>s.evidence):artwork.subjects.evidence.filter(e=>e.sourceId==='H28');
   photo.historicalEvidence=structuredClone(artwork.citations);
  }
  for(const [id,title,description] of [
   ['009','Tree and serpent','A branching thorny plant above a long-necked serpent with open jaws.'],
   ['037','Standing figure and kneeling man','An older standing figure raises a hand above a kneeling man in ragged clothing.'],
   ['049','Creature with fork, ram and round window','A grotesque creature holds a three-tined fork above a woolly ram beside a round cross-marked shape and three hanging balls.'],
  ]) {
   const a=data.artworks.find(a=>a.id===`design-${id}`)!; const p=data.photos.find(p=>p.id===`photo-${id}`)!;
   a.title=p.title=title!;a.publicDescription=description!+a.publicDescription.slice(a.publicDescription.indexOf(' Likely historical'));
   p.alt=`Stained glass: ${description}`;p.description=a.publicDescription;
  }
  const memorial=['christ','mary','john-baptist','paul','peter','nativity','baptism','crucifixion','resurrection','ascension'];
  for(const n of ['001','050','051','052','053','054','055']) {
   const p=data.photos.find(p=>p.id===`photo-${n}`)!;
   const scene=({ '051':'nativity','052':'baptism','053':'resurrection','054':'ascension' } as Record<string,string>)[n];
   const keys=n==='050'?memorial:n==='055'?memorial.slice(0,5):scene?[scene]:[];
   const subjects=keys.map(k=>data.subjects.find(s=>s.id===`h28-memorial-${k}`)!);
   p.subjects={value:subjects.length?subjects.map(s=>s.id):null,confidence:subjects.length?'likely':'unidentified',
    rationale:n==='001'?'The blue multi-figure window visibly names Michelangelo, Erasmus, Shakespeare, Lyman Abbot, Shaftesbury, Pasteur, Joan and Lincoln around Christ, matching H35\'s south memorial. No corresponding subject record from the numbered 1928 inventory is asserted.':`Inspected original image: ${p.alt} The composition matches the cited memorial description; this is a visual attribution, not an inferred filename.`,
    evidence:[ref(p.sourceId,'Inspected full photograph.'),ref(n==='001'?'H35':'H28',n==='001'?'The Fourth Church 1928–1935':'The Memorial Window',n==='001'?'h35.txt [P0218]':'h28.txt [P0044]–[P0048]')]};
   p.location={value:null,confidence:'unidentified',rationale:'Historical descriptions support a memorial attribution, but no current in-person location survey is included. The filename alone is not proof of modern location.',evidence:[ref(p.sourceId,'Full photograph.'),ref('H35','The Fourth Church 1928–1935','h35.txt [P0217]–[P0218]')]};
   p.description=p.description.replace(/ Historical identification and the present location remain under review\./g,'')+
    (n==='001'?' The visible named figures likely identify the W. Harold Upjohn memorial described in the 1935 history.':` Likely ${subjects.length===1?subjects[0]!.title:'Rachel Babcock Upjohn memorial window'+(n==='055'?' principal panels':'')}, based on the 1928 description.`)+' Present-day location is unconfirmed.';
   p.historicalEvidence=p.subjects.evidence.filter(e=>['H28','H35'].includes(e.sourceId));
  }
  const checked=validateCatalogData({project:data.project,manifest:data.manifest,photos:{schemaVersion:1,photos:data.photos},artworks:{schemaVersion:1,artworks:data.artworks},subjects:{schemaVersion:1,subjects:data.subjects},sources:{schemaVersion:1,sources:data.sources},book:data.book,media:data.media});
  if(!checked.ok) throw new Error(JSON.stringify(checked.issues));
  const updates=[{path:'content/artworks.json',bytes:jsonBytes({schemaVersion:1,artworks:data.artworks})},{path:'content/photos.json',bytes:jsonBytes({schemaVersion:1,photos:data.photos})}];
  for(const record of [...data.artworks,...data.photos]) for(const kind of ['subject','location'] as const) updates.push({path:`content/reviews/${record.id}-${kind}.json`,bytes:jsonBytes({schemaVersion:1,recordId:record.id,reviewKind:kind,reviewedDigest:computeEditorialReviewDigest(data,record.id,kind),reviewer:'Codex visual/source comparison, 9 November 2026; inferred matches explicitly labeled likely',reviewedAtUtc:new Date().toISOString(),outcome:'complete'})});
  // Preserve the authored observations alongside their digest receipts.
  updates.push({path:'docs/WP05_HISTORICAL_REVIEW.json',bytes:jsonBytes({schemaVersion:1,reviewedAtUtc:new Date().toISOString(),evidence:['.work/wp05-pairings/sheet-01.png through sheet-12.png','.work/wp05-history-extra.png','.work/photo-001-history.png','source/histories/h28.txt','source/histories/h35.txt'],decisions,locations:'103 reviewed; present-day locations remain unconfirmed. Historical guide positions are not silently treated as a modern survey.'})});
  await promoteBatch(PROJECT_ROOT,'history-review',updates);
  report.summary={reviewedRecords:103,editorialReceipts:206,currentLocationsConfirmed:0};
 });
});
