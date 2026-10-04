import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { copyFile, access, readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

// Static hosts (GitHub Pages and similar) serve 404.html for unknown paths, which lets
// /char/馬 deep links boot the SPA.
const spaFallback = (): Plugin => ({
  name: 'spa-404-fallback',
  apply: 'build',
  async closeBundle() {
    const out = path.resolve(import.meta.dirname, 'dist');
    await copyFile(path.join(out, 'index.html'), path.join(out, '404.html'));
  },
});

// Writes dist/sw.js from pwa/sw.js with the app-shell file list (everything except the data
// shards, which are cached on demand). The version hash changes whenever any shell file does.
const pwa = (): Plugin => ({
  name: 'pwa-service-worker',
  apply: 'build',
  async closeBundle() {
    const out = path.resolve(import.meta.dirname, 'dist');
    const files: string[] = [];
    const walk = async (dir: string) => {
      for (const e of await readdir(path.join(out, dir), { withFileTypes: true })) {
        const rel = dir ? `${dir}/${e.name}` : e.name;
        if (e.isDirectory()) {
          if (rel !== 'data') await walk(rel);
        } else if (!['sw.js', '404.html'].includes(rel) && !e.name.startsWith('.')) files.push(rel);
      }
    };
    await walk('');
    files.sort();
    const hash = createHash('sha256');
    for (const f of files) hash.update(f).update(await readFile(path.join(out, f)));
    const template = await readFile(path.resolve(import.meta.dirname, 'pwa/sw.js'), 'utf8');
    const sw = template
      .replace("const SHELL_VERSION = '__SHELL_VERSION__'", `const SHELL_VERSION = ${JSON.stringify(hash.digest('hex').slice(0, 12))}`)
      .replace('const PRECACHE = __PRECACHE__', `const PRECACHE = ${JSON.stringify(files)}`);
    if (sw.includes("= '__SHELL_VERSION__'") || sw.includes('= __PRECACHE__')) this.error('pwa/sw.js placeholders were not filled');
    await writeFile(path.join(out, 'sw.js'), sw);
    this.info?.(`sw.js: ${files.length} shell files precached`);
  },
});

const requireData = (): Plugin => ({
  name: 'require-data',
  async buildStart() {
    try {
      await access(path.resolve(import.meta.dirname, 'public/data/meta.json'));
    } catch {
      this.warn('public/data is missing — run `npm run data` first (see docs/DATA_REPORT.md).');
    }
  },
});

export default defineConfig({
  plugins: [react(), spaFallback(), pwa(), requireData()],
});
