import { defineConfig } from 'vite';
import { createHash } from 'node:crypto';
import { readdirSync } from 'node:fs';

// Writes sw.js at build time with the exact list of built files, so the app is fully
// available offline after the first visit. Relative paths keep it working on GitHub Pages
// under any repository name.
function serviceWorker() {
  const walk = (dir, base = '') => readdirSync(new URL(dir, import.meta.url), { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? walk(`${dir}${e.name}/`, `${base}${e.name}/`) : [`${base}${e.name}`]));
  return {
    name: 'rack-service-worker',
    apply: 'build',
    generateBundle(_, bundle) {
      const files = ['./', ...Object.keys(bundle).map((f) => `./${f}`), ...walk('./public/').map((f) => `./${f}`)];
      const version = createHash('sha1').update(files.join('|') + Object.values(bundle).map((b) => b.code ?? b.source ?? '').join('').length).digest('hex').slice(0, 10);
      const source = `// Generated at build time. Do not edit.
const CACHE = 'rack-designer-${version}';
const FILES = ${JSON.stringify([...new Set(files)])};

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith('rack-designer-') && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  // Pages: network first so a new version shows up, cache when offline. Assets: cache first.
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((res) => { caches.open(CACHE).then((c) => c.put('./', res.clone())); return res.clone(); }).catch(() => caches.match('./')));
    return;
  }
  e.respondWith(caches.match(req).then((hit) => hit || fetch(req)));
});
`;
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [serviceWorker()],
  build: { target: 'es2020', chunkSizeWarningLimit: 900 },
  server: { host: true },
});
