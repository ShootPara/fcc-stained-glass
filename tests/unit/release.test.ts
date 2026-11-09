import { expect,test } from 'vitest';
import { resolveSiteBase } from '../../scripts/build-site.js';
import { assertReleaseReady } from '../../scripts/lib/release.js';

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
