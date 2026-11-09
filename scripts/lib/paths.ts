import path from 'node:path';
import { lstat, realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { CliError } from './cli.js';

// Derive from this file, never from the caller's working directory or .git.
export const PROJECT_ROOT = fileURLToPath(new URL('../../', import.meta.url));

export function resolveProjectPath(relativePath: string, root = PROJECT_ROOT): string {
  if (typeof relativePath !== 'string' || relativePath.length === 0 || relativePath.includes('\0')) {
    throw new CliError('E_PATH', 'A nonempty project-relative path is required.');
  }
  if (relativePath.includes('\\') || path.posix.isAbsolute(relativePath) || path.win32.isAbsolute(relativePath) || /^[A-Za-z]:/.test(relativePath)) {
    throw new CliError('E_PATH', `Use a project-relative path with forward slashes: ${relativePath}`);
  }
  const parts = relativePath.split('/');
  if (parts.some(part => part === '..' || part === '.' || part === '')) {
    throw new CliError('E_PATH', `Path contains an empty or traversal component: ${relativePath}`);
  }
  const absolute = path.resolve(root, ...parts);
  const contained = path.relative(path.resolve(root), absolute);
  if (contained === '' || contained === '..' || contained.startsWith(`..${path.sep}`) || path.isAbsolute(contained)) {
    throw new CliError('E_PATH', `Path must name a file or directory inside the project: ${relativePath}`);
  }
  return absolute;
}

export function relativeProjectPath(absolutePath: string, root = PROJECT_ROOT): string {
  const relative = path.relative(path.resolve(root), path.resolve(absolutePath)).split(path.sep).join('/');
  resolveProjectPath(relative, root);
  return relative;
}

export async function assertSafeProjectPath(
  relativePath: string,
  root = PROJECT_ROOT,
  options: { allowMissing?: boolean } = {},
): Promise<string> {
  const target = resolveProjectPath(relativePath, root);
  const rootReal = await realpath(root);
  let current = path.resolve(root);
  const parts = relativePath.split('/');
  for (let index = 0; index < parts.length; index += 1) {
    current = path.join(current, parts[index]!);
    let stat;
    try {
      stat = await lstat(current);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT' && options.allowMissing) return target;
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new CliError('E_FILE_MISSING', `Required project path is missing: ${relativePath}`);
      throw error;
    }
    if (stat.isSymbolicLink()) throw new CliError('E_PATH_SYMLINK', `Required project paths must not use symlinks: ${relativePath}`);
    if (index < parts.length - 1 && !stat.isDirectory()) throw new CliError('E_PATH', `A parent component is not a directory: ${relativePath}`);
    const real = await realpath(current);
    const relativeReal = path.relative(rootReal, real);
    if (relativeReal === '..' || relativeReal.startsWith(`..${path.sep}`) || path.isAbsolute(relativeReal)) {
      throw new CliError('E_PATH_ESCAPE', `Project path resolves outside the project: ${relativePath}`);
    }
  }
  return target;
}

export async function assertRegularProjectFile(relativePath: string, root = PROJECT_ROOT): Promise<string> {
  const target = await assertSafeProjectPath(relativePath, root);
  if (!(await lstat(target)).isFile()) throw new CliError('E_FILE_TYPE', `A regular file is required: ${relativePath}`);
  return target;
}
