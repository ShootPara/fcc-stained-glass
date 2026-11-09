import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import { parsePreparationArgs } from '../../scripts/prepare-assets.js';

const root = fileURLToPath(new URL('../../', import.meta.url));
const loader = new URL('../../node_modules/tsx/dist/loader.mjs', import.meta.url).href;
const entry = join(root, 'scripts', 'prepare-assets.ts');

test('npm prepare lifecycle succeeds outside the project without source access or writes', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'fcc lifecycle with spaces '));
  try {
    const output = execFileSync(process.execPath, ['--import', loader, entry], { cwd, encoding: 'utf8', env: { ...process.env, npm_lifecycle_event: 'prepare' } });
    expect(output).toContain('No assets changed.');
    expect(await readdir(cwd)).toEqual([]);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test('explicit selection and archive regeneration parse without touching real project assets', () => {
  expect(parsePreparationArgs(['--id', 'design-002'])).toEqual({ id: 'design-002', all: false, includeArchives: false, help: false });
  expect(parsePreparationArgs(['--all', '--include-archives'])).toEqual({ id: undefined, all: true, includeArchives: true, help: false });
});

test.each([['--all', '--id', 'design-002'], ['--id', 'design-001'], ['--include-archives'], ['--unknown'], ['--id', 'design-002', '--id', 'design-003']])('invalid preparation arguments fail: %s', (...args) => {
  const result = spawnSync(process.execPath, ['--import', loader, entry, ...args], { cwd: root, encoding: 'utf8' });
  expect(result.status).toBe(2);
});
