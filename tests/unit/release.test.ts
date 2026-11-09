import { expect,test } from 'vitest';
import { resolveSiteBase } from '../../scripts/build-site.js';
import { assertReleaseReady } from '../../scripts/lib/release.js';
import { publicFileSelector } from '../../scripts/lib/public-files.js';

test('deployment retains current photos and every restoration version but excludes obsolete derivatives',()=>{
 const include=publicFileSelector({photos:[{image:{web:{path:'photos/current.webp'},thumbnail:{path:'photos/thumb.webp'}}}],artworks:[{versions:{current:{accessibility:{path:'accessibility/current.json'}},old:{accessibility:{path:'accessibility/old.json'}}}}]});
 for(const file of ['photos/current.webp','photos/thumb.webp','accessibility/current.json','accessibility/old.json','art/old/paint.bin','print/design-009.pdf','downloads/fcc-coloring-book.pdf'])expect(include(file),file).toBe(true);
 for(const file of ['photos/obsolete.webp','accessibility/obsolete.json','catalog.dev.json'])expect(include(file),file).toBe(false);
});

test('deployment follows renamed repositories, root sites and explicit portable bases',()=>{
 expect(resolveSiteBase({GITHUB_REPOSITORY:'owner/renamed'})).toBe('/renamed/');
 expect(resolveSiteBase({GITHUB_REPOSITORY:'Owner/owner.github.io'})).toBe('/');
 expect(resolveSiteBase({GITHUB_REPOSITORY:'owner/repo'},'church.example')).toBe('/');
 expect(resolveSiteBase({SITE_BASE:'./',FCC_PORTABLE_BUILD:'1'})).toBe('./');
 expect(()=>resolveSiteBase({SITE_BASE:'https://elsewhere.test/'})).toThrow('SITE_BASE');
});

test('release rejects invalid source validation before any asset or publication work',async()=>{
 await expect(assertReleaseReady(undefined,{ok:false,issues:[],warnings:[],stats:{photoCount:0,artworkCount:0,sourceCount:0,sourceBytes:0,verifiedSourceCount:0}})).rejects.toThrow('Source/catalog validation failed');
});
