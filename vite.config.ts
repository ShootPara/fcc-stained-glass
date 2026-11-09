import { defineConfig } from 'vite';

export function deploymentBase(value = '/', portable = false): string {
  if (portable && value === './') return value;
  if (!/^\/(?:[A-Za-z0-9._~-]+\/)*$/.test(value) || value.includes('/../') || value.includes('/./')) {
    throw new Error('SITE_BASE must be / or a path such as /fcc-stained-glass/.');
  }
  return value;
}

export default defineConfig(({ command }) => ({
  base: command === 'serve' ? '/' : deploymentBase(process.env.SITE_BASE, process.env.FCC_PORTABLE_BUILD === '1'),
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  build: { outDir: 'dist', emptyOutDir: true, target: 'es2022' },
}));
