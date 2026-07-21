// Decodes docs/design/Memo.html (Claude Artifact bundle) into per-screen HTML
// under .memo-design/. Regenerable; gitignored. Run: node scripts/extract-memo-screens.mjs
import fs from 'node:fs';
import zlib from 'node:zlib';

const raw = fs.readFileSync('docs/design/Memo.html', 'utf8');
const grab = (type) => {
  const m = raw.match(new RegExp(`<script type="${type}"[^>]*>([\\s\\S]*?)</script>`));
  if (!m) throw new Error(`missing ${type}`);
  return m[1];
};
const template = JSON.parse(grab('__bundler/template'));          // the app template HTML
const manifest = JSON.parse(grab('__bundler/manifest'));          // uuid -> asset

const out = '.memo-design';
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

// full template + the renderVals component script
fs.writeFileSync(`${out}/_template.html`, template, 'utf8');
const comp = [...template.matchAll(/<script(?![^>]*application\/json)[^>]*>([\s\S]*?)<\/script>/g)]
  .map(m => m[1]).filter(s => s.includes('renderVals'))[0] || '';
fs.writeFileSync(`${out}/_renderVals.js`, comp, 'utf8');

// Cassette sub-component (gzip+base64 in manifest)
const cas = manifest['21b4702d-e7a2-4fe1-ab89-d70eb581a64a'];
if (cas && cas.data) {
  const casHtml = zlib.gunzipSync(Buffer.from(cas.data, 'base64')).toString('utf8');
  fs.writeFileSync(`${out}/Cassette.dc.html`, casHtml, 'utf8');
}

// split template by the SCREEN comment banners
const markers = [...template.matchAll(/<!--\s*={4,}\s*(.+?)\s*={4,}\s*-->/g)].map(m => ({ i: m.index, name: m[1] }));
for (let k = 0; k < markers.length; k++) {
  const start = markers[k].i;
  const end = k + 1 < markers.length ? markers[k + 1].i : template.length;
  const slug = markers[k].name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  fs.writeFileSync(`${out}/screen-${String(k).padStart(2, '0')}-${slug}.html`, template.slice(start, end), 'utf8');
}
console.log(`Extracted ${markers.length} screens + Cassette + renderVals to ${out}/`);
