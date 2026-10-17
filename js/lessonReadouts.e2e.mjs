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
const on = await browser.newContext();
await on.route(/mathjax|googleapis|gstatic|jsdelivr/, r => r.abort());
let failures = 0, checked = 0;
async function read(ctx, url) {
  const p = await ctx.newPage(); await p.goto(url, { waitUntil: 'load' });
  if (ctx === on) await p.waitForTimeout(200);
  const r = await p.evaluate(grab, SEL); await p.close(); return new Map(r);
}
for (const f of pages) {
  const url = base + f;
  const [stat, live1, live2] = [await read(off, url), await read(on, url), await read(on, url)];
  for (const [id, s] of stat) {
    const a = nums(s); if (!a.length || /^[—–-]+$/.test(s)) continue;
    const b = live1.get(id); if (b == null) continue;
    if (b !== live2.get(id)) continue;          // non-deterministic on load: not a fixed worked number
    const bn = nums(b); if (!bn.length) continue;
    checked++;
    if (!close(a, bn)) { failures++; console.log(`  ✗ ${f} #${id}: page says "${s}" but the calculator shows "${b}"`); }
  }
}
await browser.close(); server.close();
console.log(`  ${pages.length} pages, ${checked} printed readouts checked against their calculators`);
console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
