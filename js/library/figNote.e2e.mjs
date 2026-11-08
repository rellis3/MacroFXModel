// Reader e2e at phone width: a figure and a table with a model note show the "What this shows" card, a block without a note shows none,
// and the page never scrolls sideways.   node js/library/figNote.e2e.mjs      (needs playwright or playwright-core, and Chrome: CHROME=/path/to/chrome)
// Mock server: the REAL createLibraryApi on fake KV / R2 holding synthetic blocks + a synthetic figs file. No network, no model, no paper text.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
const require = (await import('node:module')).createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { try { ({ chromium } = require('playwright-core')); } catch { console.log('playwright not installed: npm i --no-save playwright-core'); process.exit(2); } }
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { createLibraryApi } = await import(path.join(root, 'js', 'libraryApi.js'));
const { uploadKey } = await import(path.join(root, 'js', 'researchLibrary.js'));

const blocks = [
  { i: 0, type: 'h1', text: 'Synthetic Study of Carry', page: 1, bbox: null },
  { i: 1, type: 'p', text: 'Table 1 reports the Sharpe ratio by holding period and Figure 2 plots the cumulative returns of the carry rule against a benchmark over the sample. '.repeat(3), page: 1, bbox: null },
  { i: 2, type: 'table', text: 'Table 1: Sharpe ratio by holding period', label: 'Table 1', page: 1, bbox: [50, 400, 300, 500], cells: ['1M|12M', 'Sharpe|0.42|0.59'] },
  { i: 3, type: 'fig', text: 'Figure 2: Cumulative returns of the carry rule', label: 'Figure 2', page: 1, bbox: [50, 200, 300, 380], gfx: true, inText: 'Return | Year' },
  { i: 4, type: 'table', text: 'Table 9: A table without any note', label: 'Table 9', page: 1, bbox: [50, 100, 300, 180], cells: ['a|1'] },
  { i: 5, type: 'p', text: 'Closing words of the synthetic paper.', page: 1, bbox: null },
];
const figs = { v: 1, tried: {}, notes: {
  'Table 1': { text: 'It lists the Sharpe ratio for the 1M and 12M holding periods, from 0.42 up to 0.59, so longer holding looks better in this sample. A very long unbroken token follows: ' + 'Supercalifragilisticexpialidocious'.repeat(3), confident: true, at: 1 },
  'Figure 2': { text: 'It plots cumulative returns of the carry rule against the year.', confident: false, at: 1 } } };
const store = new Map(), blobs = new Map();
store.set('q', JSON.stringify({ items: [{ id: 'up1', title: 'up1.pdf', status: 'pending', upload: { name: 'up1.pdf', bytes: 99, chars: 5000, at: '2026-01-01T00:00:00Z', stored: 'r2', sha: 'aa' } }] })); store.set('pp', '[]');
blobs.set(uploadKey('up1', 'txt'), Buffer.from('Synthetic Study of Carry\n\nAbstract\n\nCarry returns.\n')); blobs.set(uploadKey('up1', 'pdf'), Buffer.from('%PDF-1.4 x'));
blobs.set(uploadKey('up1', 'blocks.json'), Buffer.from(JSON.stringify({ v: 5, source: 'pdf', pages: 1, pageSize: { 1: [612, 792] }, blocks })));
blobs.set(uploadKey('up1', 'figs.json'), Buffer.from(JSON.stringify(figs)));
const api = createLibraryApi({
  kv: { get: async k => store.get(k) ?? null, getStrict: async k => store.get(k) ?? null, put: async (k, v) => { store.set(k, v); } },
  r2: { ok: () => true, getBuffer: async k => blobs.get(k) ?? null, putBuffer: async (k, b) => { blobs.set(k, b); } },
  keys: { queue: 'q', papers: 'pp' }, uploadKey, extractPages: async () => { throw new Error('none'); }, tts: { getProvider: () => null, makeMp3: async () => Buffer.alloc(0) },
  readTodoMd: () => '', lessonFiles: () => [], cases: { read: async () => ({ cases: [] }), put: async () => {} }, log: { warn() {} },
});
const routes = { papers: api.papers, paper: api.paper, progress: api.progressGet, 'read-next': api.readNext, todo: api.todo, listen: api.listen, search: api.search };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname.startsWith('/api/library/')) {
    const fn = routes[u.pathname.slice('/api/library/'.length)];
    if (!fn) { res.writeHead(404); return res.end('{}'); }
    const out = await fn({ query: Object.fromEntries(u.searchParams), body: {}, headers: {} });
    res.writeHead(out.status, { 'content-type': 'application/json' }); return res.end(JSON.stringify(out.json ?? {}));
  }
  const p = path.join(root, decodeURIComponent(u.pathname === '/' ? '/library.html' : u.pathname));
  if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const exe = process.env.CHROME || (fs.existsSync('/usr/bin/google-chrome') ? '/usr/bin/google-chrome' : undefined);
const browser = await chromium.launch({ headless: true, ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox'] });
let failed = 0;
try {
  const page = await browser.newPage({ viewport: { width: 430, height: 900 } });
  await page.route(/fonts\.g|cdnjs|cdn\.jsdelivr|unpkg/, r => r.abort());   // nothing leaves the machine; the crops simply do not draw
  await page.goto(`${base}/library.html#/paper/up1`);
  await page.waitForSelector('.fignote', { timeout: 15000 });
  const cards = await page.$$eval('.fignote', els => els.map(e => ({ text: e.textContent, unsure: e.classList.contains('unsure'), tag: e.querySelector('.fntag')?.textContent, head: e.querySelector('b')?.textContent, w: e.getBoundingClientRect().width, vis: e.offsetParent !== null, parent: e.parentElement.className })));
  assert.equal(cards.length, 2, 'two notes, the table without one has no card'); assert.ok(cards.every(c => c.vis && c.parent.includes('lib-fig')));
  assert.ok(cards.every(c => c.head === 'What this shows' && c.tag === "from the paper's text"));
  assert.match(cards[0].text, /Sharpe ratio for the 1M and 12M/); assert.equal(cards[0].unsure, false);
  assert.equal(cards[1].unsure, true); assert.match(cards[1].text, /Low confidence/);
  const m = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth, bw: document.body.scrollWidth, figs: [...document.querySelectorAll('.lib-fig')].map(f => ({ sw: f.scrollWidth, cw: f.clientWidth })) }));
  assert.ok(m.sw <= m.iw && m.bw <= m.iw, `no horizontal page scroll: ${JSON.stringify(m)}`);
  assert.ok(m.figs.every(f => f.sw <= f.cw + 1), `no sideways scroll inside a figure: ${JSON.stringify(m.figs)}`);
  const noNote = await page.$$eval('.lib-fig', els => els.filter(e => /Table 9/.test(e.textContent)).map(e => !!e.querySelector('.fignote')));
  assert.deepEqual(noNote, [false], 'Table 9 has no card');
  await page.screenshot({ path: process.env.SHOT || path.join(process.env.TMPDIR || '/tmp', 'fignote-430.png'), fullPage: true });
  console.log('figNote e2e at 430px: ok', JSON.stringify({ cards: cards.length, width: m.iw, scrollWidth: m.sw }));
} catch (e) { failed = 1; console.error('FAIL', e.message); } finally { await browser.close(); server.close(); }
process.exit(failed);
