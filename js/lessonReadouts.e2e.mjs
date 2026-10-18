// Theory Lab: every number printed in a calculator's readout must match what the calculator computes.
//   node js/lessonReadouts.e2e.mjs [slug …]      (needs playwright; see .github/workflows/theory-lab.yml)
//
// Each lesson and deck is loaded twice in Chromium: once with JavaScript off (the numbers as written in the
// HTML) and once with it on (the numbers the page's own calculators produce on load). For every element
// with an id inside a readout, chart or slide, the numbers must agree to within rounding. Elements that are
// empty or a placeholder dash in the HTML, or that differ between two JavaScript runs (simulations seeded by
// time), are skipped. This is the check that would have caught the worked-example slips fixed in Oct 2026.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
const require = (await import('node:module')).createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { console.log('playwright not installed: npm i --no-save playwright'); process.exit(2); }

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'theory-lab', 'lessons');
const only = process.argv.slice(2);
const pages = fs.readdirSync(dir).filter(f => f.endsWith('.html'))
  .filter(f => !only.length || only.includes(f.replace(/(-micro)?\.html$/, '')));

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/theory-lab/lessons/`;

const SEL = '.tl-readout [id], .tl-chart [id]:not(svg *), .tl-box [id]:not(svg *), .sl-slide [id]:not(svg *), output[id]';
const grab = (sel) => Array.from(document.querySelectorAll(sel))
  .filter(e => !e.querySelector('[id]') && !['INPUT', 'SELECT', 'BUTTON', 'TEXTAREA', 'SCRIPT', 'CANVAS'].includes(e.tagName))
  .map(e => [e.id, (e.textContent || '').replace(/\s+/g, ' ').trim()]);
const nums = t => (t.replace(/[−–]/g, '-').replace(/(\d),(?=\d{3}\b)/g, '$1').match(/-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/gi) || []).map(Number);
const close = (a, b) => {
  if (a.length !== b.length || !a.length) return a.length === b.length;
  return a.every((x, i) => {
    const y = b[i], dp = Math.max(dec(x), dec(y));
    return Math.abs(x - y) <= Math.max(1.01 * 0.5 * Math.pow(10, -dp), 1e-9 * Math.abs(y));
  });
};
function dec(x) { const s = String(x); return s.includes('e') ? 6 : (s.split('.')[1] || '').length; }

const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const off = await browser.newContext({ javaScriptEnabled: false });
// JavaScript-on contexts: Math.random is replaced by a seeded generator, a different seed in each. A readout that
// differs between seeds is random (a simulated scatter, a Monte Carlo): it has no fixed worked number to compare, so
// it is skipped. A page that happens to print the same digits on two unseeded runs can no longer slip through by chance.
const seeded = seed => `(() => { let a = ${seed} >>> 0; Math.random = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; })();`;
const ons = [];
for (const seed of [1, 2, 3]) {
  const c = await browser.newContext(); await c.addInitScript(seeded(seed));
  await c.route(/mathjax|googleapis|gstatic|jsdelivr/, r => r.abort()); ons.push(c);
}
const on = ons[0];
let failures = 0, checked = 0;
async function read(ctx, url) {
  const p = await ctx.newPage(); await p.goto(url, { waitUntil: 'load' });
  if (ctx !== off) await p.waitForTimeout(200);
  const r = await p.evaluate(grab, SEL); await p.close(); return new Map(r);
}
for (const f of pages) {
  const url = base + f;
  const stat = await read(off, url), lives = [];
  for (const c of ons) lives.push(await read(c, url));
  const live1 = lives[0];
  for (const [id, s] of stat) {
    const a = nums(s); if (!a.length || /^[—–-]+$/.test(s)) continue;
    const b = live1.get(id); if (b == null) continue;
    if (lives.some(l => l.get(id) !== b)) continue;   // differs with the random seed: not a fixed worked number
    const bn = nums(b); if (!bn.length) continue;
    checked++;
    if (!close(a, bn)) { failures++; console.log(`  ✗ ${f} #${id}: page says "${s}" but the calculator shows "${b}"`); }
  }
}
await browser.close(); server.close();
console.log(`  ${pages.length} pages, ${checked} printed readouts checked against their calculators`);
console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
