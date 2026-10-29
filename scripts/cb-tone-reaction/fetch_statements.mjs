// cb-tone-reaction, step 1: fetch every scheduled ECB / BoE / BoJ statement 2016 -> 2026-08-21 from the banks' own
// sites and score it with the frozen lexicon (forge/CB_TONE_REACTION_PREREG.md §3). Reads no price data.
// Raw pages are cached in data/cb_tone/ (gitignored); the scores go to analysis/output/cb-tone-reaction/statements.json.
//   node scripts/cb-tone-reaction/fetch_statements.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { htmlToText } from '../../js/fomcFetch.js';
import { score, LEXICON_VERSION } from '../../js/cbLexicon.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CACHE = path.join(ROOT, 'data', 'cb_tone');
const OUT = path.join(ROOT, 'analysis', 'output', 'cb-tone-reaction');
const END = '2026-08-21';
const YEARS = Array.from({ length: 11 }, (_, i) => 2016 + i);
const UA = 'Mozilla/5.0 (compatible; MacroFX/1.0; +https://github.com/)';
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const pdfParse = createRequire(import.meta.url)('pdf-parse');
fs.mkdirSync(CACHE, { recursive: true }); fs.mkdirSync(OUT, { recursive: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(url, binary = false) {
  const f = path.join(CACHE, url.replace(/^https?:\/\//, '').replace(/[^a-z0-9.]+/gi, '_'));
  if (fs.existsSync(f)) return binary ? fs.readFileSync(f) : fs.readFileSync(f, 'utf8');
  await sleep(700);
  const r = await fetch(url, { headers: { 'User-Agent': UA } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  const b = Buffer.from(await r.arrayBuffer());
  fs.writeFileSync(f, b);
  return binary ? b : b.toString('utf8');
}
const ymd = s6 => `20${s6.slice(0, 2)}-${s6.slice(2, 4)}-${s6.slice(4, 6)}`;

// ECB: the statement read at the press conference, cut where the Q&A starts
const ECB_QA = /(?:we are|we're) (?:now )?(?:ready|happy) to take your questions(?: now)?\.?|(?:we are|we're) (?:now )?at your disposal for questions\.?|\n\s*\* \* \*|\n\s*Question(?: \d+)?\s*[:\n]/i;
async function ecb() {
  const out = [];
  for (const y of YEARS) {
    const idx = await get(`https://www.ecb.europa.eu/press/press_conference/monetary-policy-statement/${y}/html/index_include.en.html`);
    if (!idx) continue;
    const links = [...new Set([...idx.matchAll(/href="([^"]*\/(?:ecb\.)?is(\d{6})[^"]*\.en\.html)"/g)].map(m => m[1]))];
    for (const href of links) {
      const d = ymd(href.match(/is(\d{6})/)[1]);
      if (d > END) continue;
      const url = href.startsWith('http') ? href : 'https://www.ecb.europa.eu' + href;
      const html = await get(url); if (!html) { out.push({ bank: 'ECB', date: d, url, error: '404' }); continue; }
      let t = htmlToText(html);
      const a = t.search(/(?:Ladies and gentlemen|Good afternoon)/i); if (a > 0) t = t.slice(a);
      const q = t.search(ECB_QA); const cut = q > 500;
      if (cut) t = t.slice(0, q);
      out.push({ bank: 'ECB', date: d, url, text: t, note: cut ? 'cut at Q&A' : 'no Q&A marker found' });
    }
  }
  return out;
}

// BoE: Monetary Policy Summary and minutes, article text; date from "Published on"
async function boe() {
  const out = [];
  for (const y of YEARS) for (const [i, m] of MONTHS.entries()) {
    if (`${y}-${String(i + 1).padStart(2, '0')}` > END.slice(0, 7)) continue;
    const slug = y === 2016 ? `mpc-${m}-2016` : `${m}-${y}`;
    const url = `https://www.bankofengland.co.uk/monetary-policy-summary-and-minutes/${y}/${slug}`;
    const html = await get(url); if (!html) continue;
    const full = htmlToText(html);
    const pub = full.match(/Published on\s+(\d{1,2}) (\w+) (\d{4})/);
    if (!pub) { out.push({ bank: 'BOE', date: `${y}-${String(i + 1).padStart(2, '0')}-??`, url, error: 'no published date' }); continue; }
    const d = `${pub[3]}-${String(MONTHS.indexOf(pub[2].toLowerCase()) + 1).padStart(2, '0')}-${pub[1].padStart(2, '0')}`;
    let t = full.slice(full.indexOf(pub[0]) + pub[0].length);
    const e = t.search(/\n\s*(?:This page was last updated|Sign up for (?:email )?updates|Was this page useful)/i); if (e > 1000) t = t.slice(0, e);
    if (d > END) continue;
    out.push({ bank: 'BOE', date: d, url, text: t });
  }
  return out;
}

// BoJ: Statement on Monetary Policy, HTML or PDF, dates from the year index
async function boj() {
  const out = [];
  for (const y of YEARS) {
    const idx = await get(`https://www.boj.or.jp/en/mopo/mpmdeci/mpr_${y}/index.htm`);
    if (!idx) continue;
    const links = [...new Set([...idx.matchAll(/href="([^"]*(?:state_\d{4}\/k(\d{6})a\.htm|mpr_\d{4}\/k(\d{6})a\.pdf))"/g)].map(m => m[1]))];
    const seen = new Set();
    for (const href of links.sort((a, b) => (a.endsWith('.htm') ? 0 : 1) - (b.endsWith('.htm') ? 0 : 1))) {
      const d = ymd(href.match(/k(\d{6})a/)[1]);
      if (d > END || seen.has(d)) continue; seen.add(d);
      const url = 'https://www.boj.or.jp' + href;
      let t;
      if (href.endsWith('.pdf')) { const b = await get(url, true); if (!b) continue; t = (await pdfParse(b)).text; }
      else { const html = await get(url); if (!html) continue; t = htmlToText(html); }
      // body only: from the opening sentence to before the attendee list / release-times footer (the HTML pages carry the site menu)
      const a = t.search(/At the Monetary Policy Meeting (?:held|which was held)/i); if (a > 0) t = t.slice(a);
      const e = t.search(/\[?(?:Members present|Others present)\]?|Release dates and times|Copyright Bank of Japan/i); if (e > 300) t = t.slice(0, e);
      out.push({ bank: 'BOJ', date: d, url, text: t });
    }
  }
  return out;
}

const docs = [...await ecb(), ...await boe(), ...await boj()].sort((a, b) => a.bank.localeCompare(b.bank) || a.date.localeCompare(b.date));
const rows = docs.map(({ text, ...r }) => {
  if (!text) return r;
  const s = score(text);
  return { ...r, score: s.score, hawk: s.hawk, dove: s.dove, nWords: s.nWords, scored: s.hawk + s.dove >= 3, hits: s.hits };
});
fs.writeFileSync(path.join(OUT, 'statements.json'), JSON.stringify({ lexicon: LEXICON_VERSION, built: new Date().toISOString(), end: END, rows }, null, 1));
for (const b of ['ECB', 'BOE', 'BOJ']) {
  const r = rows.filter(x => x.bank === b);
  console.log(b, 'docs', r.length, 'errors', r.filter(x => x.error).length, 'scored(H+D>=3)', r.filter(x => x.scored).length,
    'median words', r.map(x => x.nWords || 0).sort((a, c) => a - c)[r.length >> 1], 'first', r[0]?.date, 'last', r.at(-1)?.date);
}
