import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROJECT_ROOT, assertRegularProjectFile, assertSafeProjectPath, relativeProjectPath, resolveProjectPath } from '../../scripts/lib/paths.js';

const directories: string[] = [];
async function fixture(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'fcc paths with spaces '));
  directories.push(root);
  return root;
}
afterEach(async () => { await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true }))); });

describe('project paths', () => {
  it('derives the repository root from the helper location, and preserves spaces', async () => {
    expect(path.resolve(PROJECT_ROOT)).toBe(fileURLToPath(new URL('../../', import.meta.url)).replace(/[\\/]$/, ''));
    const root = await fixture();
    await mkdir(path.join(root, 'source', 'with spaces'), { recursive: true });
    const filename = path.join(root, 'source', 'with spaces', 'church history.txt');
    await writeFile(filename, 'history');
    expect(await assertRegularProjectFile('source/with spaces/church history.txt', root)).toBe(filename);
    expect(relativeProjectPath(filename, root)).toBe('source/with spaces/church history.txt');
  });

  it.each(['', '.', '..', '../outside', 'source/../outside', 'source/./a', 'source//a', '/tmp/a', 'C:\\a', 'C:a', '\\\\server\\a', 'source\\a', 'source/a\0b'])('rejects nonportable or escaping input %j', input => {
    expect(() => resolveProjectPath(input, '/project')).toThrow();
  });

  it('rejects external absolute paths when converting to a relative path', async () => {
    const root = await fixture();
    expect(() => relativeProjectPath(path.join(root, '..', 'outside'), root)).toThrow();
    expect(() => relativeProjectPath(root, root)).toThrow();
  });

  it('allows missing destinations while rejecting directories as file inputs', async () => {
    const root = await fixture();
    await mkdir(path.join(root, 'source'));
    expect(await assertSafeProjectPath('source/new/path.txt', root, { allowMissing: true })).toBe(path.join(root, 'source/new/path.txt'));
    await expect(assertRegularProjectFile('source/missing.txt', root)).rejects.toMatchObject({ code: 'E_FILE_MISSING', exitCode: 3 });
    await expect(assertRegularProjectFile('source', root)).rejects.toMatchObject({ code: 'E_FILE_TYPE' });
  });

  it('rejects both symlink files and symlink parent directories', async () => {
    const root = await fixture();
    const outside = await fixture();
    await writeFile(path.join(outside, 'real.txt'), 'original');
    await symlink(outside, path.join(root, 'linked-directory'), process.platform === 'win32' ? 'junction' : 'dir');
    if (process.platform === 'win32') {
      // Creating a file symlink requires a Windows privilege. A junction parent
      // still verifies that a file reached through a reparse point is rejected.
      await symlink(outside, path.join(root, 'linked-file-parent'), 'junction');
      await expect(assertRegularProjectFile('linked-file-parent/real.txt', root)).rejects.toMatchObject({ code: 'E_PATH_SYMLINK' });
    } else {
      await symlink(path.join(outside, 'real.txt'), path.join(root, 'linked-file.txt'), 'file');
      await expect(assertRegularProjectFile('linked-file.txt', root)).rejects.toMatchObject({ code: 'E_PATH_SYMLINK' });
    }
    await expect(assertSafeProjectPath('linked-directory/new.txt', root, { allowMissing: true })).rejects.toMatchObject({ code: 'E_PATH_SYMLINK' });
  });

  it('also rejects a symlink that points within the project', async () => {
    const root = await fixture();
    await mkdir(path.join(root, 'real'));
    await symlink(path.join(root, 'real'), path.join(root, 'alias'), process.platform === 'win32' ? 'junction' : 'dir');
    await expect(assertSafeProjectPath('alias/new.txt', root, { allowMissing: true })).rejects.toMatchObject({ code: 'E_PATH_SYMLINK' });
  });
});
