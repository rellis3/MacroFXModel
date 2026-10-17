// Theory Lab recorded dialogues.   node js/lessonAudio.test.mjs
// theory-lab/audio/manifest.json lists one recording per lesson (education/tools/build_audio.py). Every listed
// file must exist. A recording whose hash no longer matches its lesson's dialogue is stale: the page then falls
// back to browser voices, so that is reported, not failed. Re-run build_audio.py to refresh it.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'theory-lab');
const mp = path.join(root, 'audio', 'manifest.json');
const man = fs.existsSync(mp) ? JSON.parse(fs.readFileSync(mp, 'utf8')) : {};
const dec = s => s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&');
function fnv1a(str) { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16).padStart(8, '0'); }
let failures = 0, stale = [], missing = [], fresh = 0;
for (const f of fs.readdirSync(path.join(root, 'lessons')).filter(f => f.endsWith('.html') && !f.includes('-micro'))) {
  const slug = f.slice(0, -5), s = fs.readFileSync(path.join(root, 'lessons', f), 'utf8');
  const m = s.match(/<div class="tl-listen-script">([\s\S]*?)<\/div>/); if (!m) continue;
  const lines = [...m[1].matchAll(/<p data-who="(\w+)">([\s\S]*?)<\/p>/g)].map(x => x[1] + ': ' + dec(x[2].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim());
  const e = man[slug];
  if (!e) { missing.push(slug); continue; }
  if (!fs.existsSync(path.join(root, 'audio', slug + '.m4a'))) { console.log(`  ✗ FAIL ${slug}: manifest lists a recording but the file is missing`); failures++; continue; }
  if (e.hash !== fnv1a(lines.join('\n'))) stale.push(slug); else fresh++;
}
console.log(`  ${fresh} lessons have a current recording`);
if (stale.length) console.log(`  stale (dialogue edited since recording; browser voices used): ${stale.join(', ')}`);
if (missing.length) console.log(`  not recorded yet (browser voices used): ${missing.length}`);
console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
