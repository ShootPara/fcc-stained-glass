/** Runtime assets are always local to this deployment, including Pages subpaths. */
export function assetUrl(relativePath: string): string {
  if (!relativePath || /[\\:%?#\u0000-\u001f\u007f]/u.test(relativePath)
      || relativePath.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new Error('Asset path must be an unencoded relative file path.');
  }
  const base = new URL(import.meta.env.BASE_URL, document.baseURI);
  const resolved = new URL(relativePath, base);
  if (resolved.origin !== base.origin || !resolved.pathname.startsWith(base.pathname)) {
    throw new Error('Asset path is outside this site.');
  }
  return resolved.href;
}
