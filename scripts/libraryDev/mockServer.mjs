// Dev / test mock of the /api/library/* contract (plans/PAPER_LIBRARY.md) with SYNTHETIC text only.
// Not shipped: library.html never references it.   node scripts/libraryDev/mockServer.mjs [port]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { yearKey, yearCounts } from '../../js/paperCatalog.js';
import { cardLine } from '../../js/library/summary.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TOPICS = [['volatility', 'Volatility'], ['jump', 'Jump / diffusion'], ['brownian', 'Brownian motion & stochastic processes'], ['carry', 'FX & carry'], ['cot', 'COT & positioning'], ['ml', 'Machine learning'], ['regimes', 'Regimes & HMM']];
const SOURCES = [['ssrn', 'SSRN'], ['arxiv', 'arXiv'], ['nber', 'NBER'], ['fed', 'Federal Reserve / NY Fed'], ['ecb', 'ECB'], ['boe', 'Bank of England'], ['k151', '151 Trading Strategies (Kakushadze & Serur)'], ['quantconnect', 'QuantConnect strategy library'], ['reading', 'Reading list'], ['upload', 'Other upload']];
const srcOf = k => ({ key: k, label: (SOURCES.find(s => s[0] === k) || [k, k])[1] });
const label = k => (TOPICS.find(t => t[0] === k) || [k, k])[1];

/** A minimal valid two-page PDF (612x792) containing synthetic text; built in memory, nothing real. */
export function syntheticPdf() {
  const objs = [];
  const add = s => { objs.push(s); return objs.length; };
  add('<< /Type /Catalog /Pages 2 0 R >>');
  add('<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>');
  add('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 5 0 R /Resources << /Font << /F1 7 0 R >> >> >>');
  add('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 6 0 R /Resources << /Font << /F1 7 0 R >> >> >>');
  const c1 = 'BT /F1 18 Tf 72 700 Td (Synthetic page one) Tj ET BT /F1 22 Tf 200 610 Td (r = mu dt + sigma dW   (1)) Tj ET 0.8 0.2 0.2 rg 150 600 300 40 re S';
  const c2 = 'BT /F1 14 Tf 72 700 Td (Synthetic page two) Tj ET BT /F1 12 Tf 100 500 Td (Table 1: a 1.0 b 2.0 c 3.0) Tj ET 100 490 300 30 re S';
  add(`<< /Length ${c1.length} >>\nstream\n${c1}\nendstream`);
  add(`<< /Length ${c2.length} >>\nstream\n${c2}\nendstream`);
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  let out = '%PDF-1.4\n'; const off = [];
  objs.forEach((o, i) => { off.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const x = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + off.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF`;
  return Buffer.from(out, 'latin1');
}

const para = i => `Synthetic paragraph ${i}. Volatility clusters in calm markets and then it jumps. This sentence is invented for the test fixture and says nothing real about any market.`;
const blocks = [];
let bi = 0;
const B = (type, text, extra = {}) => blocks.push({ i: bi++, type, text, page: 1, bbox: null, ...extra });
B('h1', 'Synthetic Study of Clustering');
B('p', para(1)); B('p', para(2));
B('h2', 'Model');
B('p', 'The synthetic return process is shown next, then a table of invented numbers follows.');
B('eq', 'r = mu dt + sigma dW (1)', { page: 1, bbox: [150, 600, 450, 640], label: '(1)' });
B('p', para(3));
B('table', 'Table 1', { page: 2, bbox: [100, 490, 400, 520], label: 'Table 1' });
B('eq', 'broken box on purpose', { page: 9, bbox: [10, 10, 100, 40], label: '(2)' });
for (let k = 4; k < 22; k++) { if (k % 6 === 0) B('h2', 'Section ' + k); B('p', para(k)); }
B('refs', 'Invented, A. (2000). A made-up reference list entry.');

const mk = (id, title, year, tags, o = {}) => ({
  id, title, authors: ['A. Author', 'B. Writer', 'C. Scholar', 'D. Fourth'], year, yearFrom: year ? (o.yearFrom || 'given') : null, yearKey: yearKey(year), venue: 'Synthetic Journal', url: null, ssrn: o.ssrn || null, arxiv: null, doi: null,
  kind: 'paper', readFrom: o.readFrom || 'pdf', hasText: o.hasText !== false, hasPdf: o.hasPdf !== false, chars: 90000, pages: 2, uploadedAt: '2026-11-01T00:00:00Z',
  tags: tags.map((k, i) => ({ key: k, label: label(k), source: i === 1 && o.manual ? 'manual' : 'auto' })),
  abstract: o.abstract === undefined ? 'Invented abstract sentence one about clustering. A second invented sentence that should not show.' : o.abstract,
  theory: o.theory || ['garch-volatility', 'institutional-har-rv'],
  // real server shapes: data is { market, period, frequency }, caveats is an array, outOfSample / costs are yes|no|partly|unclear
  notes: o.notes === null ? null : { claim: 'Invented claim: volatility clustering predicts jumps in the next session. A second long sentence follows to prove trimming works and keeps going for a while with filler words.', mechanism: 'Invented mechanism.', data: { market: 'Synthetic G10 FX', period: '2000-2020', frequency: 'daily' }, method: 'Invented regression of next-day jumps on trailing realised variance', effect: 'Small, invented: 0.3 Sharpe before costs.', outOfSample: o.oos || 'partly', costs: 'no', relevance: 'Invented: could size our intraday ranges after clustered days.', stance: 'supports', caveats: ['Entirely made up, so treat as a layout fixture.', 'Second caveat.'], testHere: 'Invented: split sessions by trailing variance tercile and compare next-day range versus the cog ladder.' },
  source: srcOf(o.source || 'upload'),
  desk: o.desk || [], progress: o.progress || null, audio: { briefing: { status: 'none' } },
});
const state = {
  papers: [
    mk('p1', 'Volatility Clustering and Jump Risk: A Synthetic Study With a Deliberately Long Title to Test Wrapping on Narrow Phones', 2019, ['volatility', 'jump'], { source: 'ssrn', desk: [{ id: 'ev_001', verdict: 'candidate', claim: 'Invented desk entry' }], progress: { pct: 35, pos: 8, at: Date.now() - 1e5, done: false }, manual: true }),
    mk('p2', 'Carry Trade Crashes (synthetic)', 2012, ['carry'], { oos: 'no', source: 'nber' }),
    mk('p3', 'Positioning Extremes in Futures', 2021, ['cot', 'regimes'], { source: 'fed', notes: null, abstract: 'We describe positioning extremes in synthetic futures. Nothing real.' }),
    mk('p4', 'An Abstract-Only Note on Brownian Motion', 2005, ['brownian'], { source: 'reading', hasPdf: false, hasText: false, notes: null, readFrom: 'abstract', abstract: '', theory: [] }),
    mk('p5', 'Machine Learning for Regimes', 2023, ['ml', 'regimes'], { oos: 'yes', source: 'arxiv' }),
    mk('p6', 'Opening Range Breakout on Index Futures (synthetic)', 2018, ['volatility', 'regimes'], { source: 'quantconnect' }),
    mk('p7', 'Statistical Arbitrage Pairs (synthetic)', 2018, ['carry', 'ml'], { source: 'k151' }),
    mk('p8', 'Euro Area Rate Pass-Through (synthetic)', 2020, ['carry'], { source: 'ecb' }),
    mk('p9', 'My scanned notes on gamma', null, ['volatility'], { notes: null, abstract: '' }),
    mk('p10', 'Older Note on Option Pricing (synthetic, from file name)', 2014, ['volatility'], { notes: null, abstract: '', yearFrom: 'filename', source: 'upload' }),
    mk('p11', 'Uploaded Draft on Order Flow (synthetic, year from text)', 2025, ['ml'], { notes: null, abstract: '', yearFrom: 'text', source: 'upload' }),
    mk('p12', 'Early Study of Exchange Rates (synthetic)', 1993, ['carry'], { source: 'nber' }),
    mk('p13', 'A 1970s Classic on Random Walks (synthetic)', 1976, ['brownian'], { source: 'reading', notes: null }),
    mk('p14', 'Jump Detection with Intraday Data (synthetic)', 2026, ['jump'], { source: 'arxiv', yearFrom: 'arxiv', notes: null }),
    mk('p15', 'Unlabelled Scan Without a Date', null, ['regimes'], { notes: null, abstract: '', source: 'upload' }),
  ],
  audioStart: {}, caseN: 0, progressPosts: [],
};
/** The list shape of the real server: card fields + a one-line `card`; notes / desk / abstract / theory only in GET /paper. */
const listView = p => { const { notes, abstract, desk, theory, ...light } = p; const l = cardLine(p); return { ...light, card: l.text, cardMuted: !!l.muted, read: !!(notes && (notes.claim || notes.mechanism || notes.method)) }; };
const years = () => yearCounts(state.papers);
const sources = () => SOURCES.map(([key, lab]) => ({ key, label: lab, count: state.papers.filter(p => p.source.key === key).length })).filter(x => x.count);
const topics = () => TOPICS.map(([key, lab]) => ({ key, label: lab, count: state.papers.filter(p => p.tags.some(t => t.key === key)).length }));
const send = (res, obj, code = 200) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
const body = req => new Promise(r => { let s = ''; req.on('data', c => { s += c; }); req.on('end', () => { try { r(JSON.parse(s || '{}')); } catch { r({}); } }); });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.mjs': 'text/javascript' };

export function startServer(port = 0) {
  const srv = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x'), p = u.pathname, q = u.searchParams;
    if (p.startsWith('/api/library/')) {
      const ep = p.slice('/api/library/'.length);
      const paper = state.papers.find(x => x.id === q.get('id'));
      if (ep === 'papers') return send(res, { ok: true, papers: state.papers.map(listView), topics: topics(), sources: sources(), years: years(), totals: { all: state.papers.length, fullText: state.papers.length - 1, abstractOnly: 1 } });
      if (ep === 'paper') return paper ? send(res, { ok: true, paper, blocks: paper.hasText ? blocks : null, pages: 2, pageSize: { 1: [612, 792], 2: [612, 792], 9: [612, 792] } }) : send(res, { ok: false, error: 'not found' }, 404);
      if (ep === 'search') {
        const w = (q.get('q') || '').toLowerCase(), tags = (q.get('tags') || '').split(',').filter(Boolean), srcs = (q.get('sources') || '').split(',').filter(Boolean), yrs = (q.get('years') || '').split(',').filter(Boolean);
        const hits = state.papers.filter(x => x.hasText && (x.title + para(1)).toLowerCase().includes(w) && (!tags.length || x.tags.some(t => tags.includes(t.key))) && (!srcs.length || srcs.includes(x.source.key)) && (!yrs.length || yrs.includes(x.yearKey)))
          .map((x, i) => ({ id: x.id, score: 10 - i, title: x.title, snippets: [{ block: 1, text: para(1) }] }));
        return send(res, { ok: true, hits });
      }
      if (ep === 'todo') return send(res, { ok: true, items: [{ id: 't1', title: 'A Paper We Still Need (synthetic)', year: 2016, part: 'Part 2', url: 'https://example.invalid/ssrn/1', held: false }, { id: 't2', title: 'A Held Paper', year: 2010, part: 'Part 1', url: 'https://example.invalid/ssrn/2', held: true }] });
      if (ep === 'read-next') return send(res, { ok: true, ids: ['p3', 'p5'], why: { p3: 'matches open case "Positioning extremes"', p5: 'matches open case "Regime filter"' } });
      if (ep === 'listen') {
        const full = q.get('mode') === 'full';
        const s = (full ? blocks.filter(b => b.type === 'p').map(b => b.text) : ['Briefing for the synthetic study.', 'The claim is that clustering predicts jumps.', 'The desk caveat is that this is invented.']).flatMap(t => t.split(/(?<=\.)\s+/));
        return send(res, { ok: true, sentences: s, title: paper ? paper.title : '', secs: s.length * 4 });
      }
      if (ep === 'pdf') { const pdf = syntheticPdf(); res.writeHead(200, { 'content-type': 'application/pdf', 'accept-ranges': 'bytes', 'content-length': pdf.length }); return res.end(pdf); }
      if (ep === 'progress' && req.method === 'POST') { const b = await body(req); state.progressPosts.push(b); return send(res, { ok: true }); }
      if (ep === 'tags' && req.method === 'POST') {
        const b = await body(req), x = state.papers.find(z => z.id === b.id);
        if (x) { (b.remove || []).forEach(k => { x.tags = x.tags.filter(t => t.key !== k); }); (b.add || []).forEach(k => { if (!x.tags.some(t => t.key === k)) x.tags.push({ key: k, label: label(k), source: 'manual' }); }); }
        return send(res, { ok: true, tags: x ? x.tags : [] });
      }
      if (ep === 'case' && req.method === 'POST') return send(res, { ok: true, existed: false, caseId: 'case_mock_' + (++state.caseN) });
      if (ep === 'audio' && req.method === 'POST') { const b = await body(req); state.audioStart[b.id] = Date.now(); const x = state.papers.find(z => z.id === b.id); if (x) x.audio.briefing = { status: 'working' }; setTimeout(() => { if (x) x.audio.briefing = { status: 'ready', secs: 6 }; }, 1500); return send(res, { ok: true, job: 'job1' }); }
      if (ep === 'audio' && q.get('status')) return send(res, { ok: true, briefing: paper ? paper.audio.briefing : { status: 'none' } });
      if (ep === 'audio') {
        // 6 s of silence as a valid 8 kHz mono WAV (stands in for the MP3)
        const n = 8000 * 6, buf = Buffer.alloc(44 + n); buf.write('RIFF', 0); buf.writeUInt32LE(36 + n, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(8000, 24); buf.writeUInt32LE(8000, 28); buf.writeUInt16LE(1, 32); buf.writeUInt16LE(8, 34); buf.write('data', 36); buf.writeUInt32LE(n, 40); buf.fill(128, 44);
        res.writeHead(200, { 'content-type': 'audio/wav', 'content-length': buf.length, 'accept-ranges': 'bytes' }); return res.end(buf);
      }
      return send(res, { ok: false, error: 'unknown' }, 404);
    }
    // static files: only the library page and its assets
    const rel = p === '/' || p === '/library.html' ? 'library.html' : p.slice(1);
    if (!/^(library\.html|css\/library\.css|js\/library\/[\w.]+\.js)$/.test(rel)) { res.writeHead(404); return res.end('nope'); }
    res.writeHead(200, { 'content-type': MIME[path.extname(rel)] || 'text/plain', 'cache-control': 'no-store' });
    res.end(fs.readFileSync(path.join(root, rel)));
  });
  return new Promise(r => srv.listen(port, '127.0.0.1', () => r({ srv, port: srv.address().port, state })));
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { port } = await startServer(+process.argv[2] || 8765);
  console.log('mock library on http://127.0.0.1:' + port + '/library.html');
}
