// js/feedCoverage.test.mjs — guard for the feed coverage register (js/feedCoverage.js).
// Run: node js/feedCoverage.test.mjs
// Fails when: ids repeat, fields are invalid, an endpoint is not a real route, a ledger id is invented, a module file is missing,
// or an Atlas CORE / EXTRA feed is missing from the register. Prints (does not fail) a coverage summary.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FEEDS, GAPS_NOTE } from './feedCoverage.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = f => { try { return fs.readFileSync(path.join(root, f), 'utf8'); } catch { return ''; } };
const server = read('server.js'), worker = read('_worker.js'), ledger = read('js/deskEvidence.js'), atlas = read('atlas.html');
const routeText = server + '\n' + worker;

const KINDS = ['positioning', 'volatility', 'rates', 'credit', 'macro-data', 'central-bank', 'calendar', 'flows', 'equity', 'regime', 'levels', 'liquidity', 'other'];
const GRADES = ['institutional', 'public-standard', 'own-model'];
const NL = ['daily', 'weekly', 'both', 'none'];
const errors = [];
const bad = m => errors.push(m);
const stripQ = e => e.split('?')[0];

// A route can be registered literally or from a template such as app.get(`/api/${key}/history`). Accept either.
const routeExists = ep => {
  const p = stripQ(ep);
  if (routeText.includes(p)) return true;
  const segs = p.split('/'); // ['', 'api', 'rbnz', 'history']
  if (segs.length >= 4) {
    const tail = segs.slice(3).join('/');
    const re = new RegExp('/api/\\$\\{[^}]+\\}/' + tail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    if (re.test(routeText)) return true;
  }
  return false;
};

if (!Array.isArray(FEEDS) || FEEDS.length < 50 || FEEDS.length > 90) bad(`FEEDS has ${FEEDS?.length} entries, expected 50 to 90`);
if (typeof GAPS_NOTE !== 'string' || GAPS_NOTE.length < 40) bad('GAPS_NOTE missing');

const ids = new Set();
for (const f of FEEDS) {
  const w = `feed ${f.id}`;
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(f.id ?? '')) bad(`${w}: id is not kebab-case`);
  if (ids.has(f.id)) bad(`${w}: duplicate id`); ids.add(f.id);
  for (const k of ['label', 'source', 'how']) if (typeof f[k] !== 'string' || f[k].length < 4) bad(`${w}: ${k} missing`);
  if (!KINDS.includes(f.kind)) bad(`${w}: kind ${f.kind}`);
  if (!GRADES.includes(f.grade)) bad(`${w}: grade ${f.grade}`);
  if (!NL.includes(f.newsletter)) bad(`${w}: newsletter ${f.newsletter}`);
  if (f.endpoint !== null && !(typeof f.endpoint === 'string' && f.endpoint.startsWith('/api/'))) bad(`${w}: endpoint must be /api/... or null`);
  if (f.endpoint === null && f.module === null) bad(`${w}: needs an endpoint or a module`);
  if (f.endpoint && f.endpoint.includes('?')) bad(`${w}: leave the query string off the endpoint`);
  if (f.endpoint && !routeExists(f.endpoint)) bad(`${w}: endpoint ${f.endpoint} not found in server.js or _worker.js`);
  if (f.module !== null && !fs.existsSync(path.join(root, f.module ?? '__none__'))) bad(`${w}: module ${f.module} does not exist`);
  if (f.verdict !== null && !new RegExp(`id:\\s*'${String(f.verdict).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`).test(ledger)) bad(`${w}: verdict ${f.verdict} is not an id in js/deskEvidence.js`);
  if (f.trap !== undefined && f.trap !== null && typeof f.trap !== 'string') bad(`${w}: trap must be a string`);
  if (f.newsletter === 'none' && !/not|never|only|no field|nothing|plumbing|loaded|atlas/i.test(f.how)) bad(`${w}: a none feed must say why not in how`);
  if (/[—→]/.test(JSON.stringify(f))) bad(`${w}: no em-dashes or arrows in text`);
}

// Every feed Atlas loads into the newsletter page must be on the register.
const arr = name => { const m = new RegExp(`const ${name} = \\[([\\s\\S]*?)\\];`).exec(atlas); return m ? [...m[1].matchAll(/\['(\/api\/[^']+)'/g)].map(x => stripQ(x[1])) : []; };
const core = arr('CORE'), extra = arr('EXTRA');
if (core.length < 5) bad(`parsed only ${core.length} CORE endpoints from atlas.html`);
if (extra.length < 10) bad(`parsed only ${extra.length} EXTRA endpoints from atlas.html`);
const have = new Set(FEEDS.map(f => f.endpoint && stripQ(f.endpoint)).filter(Boolean));
for (const ep of [...core, ...extra]) if (!have.has(ep)) bad(`Atlas loads ${ep} but js/feedCoverage.js has no entry for it`);

// ── summary, printed not asserted ──
const grades = GRADES, nls = NL;
const cell = (g, n) => FEEDS.filter(f => f.grade === g && f.newsletter === n).length;
console.log(`\nFeed coverage: ${FEEDS.length} feeds. Atlas CORE ${core.length}, EXTRA ${extra.length}, all on the register: ${[...core, ...extra].every(e => have.has(e))}`);
console.log('\n' + ['grade'.padEnd(16), ...nls.map(n => n.padStart(8)), 'total'.padStart(8)].join(''));
for (const g of grades) console.log([g.padEnd(16), ...nls.map(n => String(cell(g, n)).padStart(8)), String(FEEDS.filter(f => f.grade === g).length).padStart(8)].join(''));
console.log([ 'all'.padEnd(16), ...nls.map(n => String(FEEDS.filter(f => f.newsletter === n).length).padStart(8)), String(FEEDS.length).padStart(8)].join(''));
const unused = FEEDS.filter(f => f.grade === 'institutional' && f.newsletter === 'none');
console.log(`\nInstitutional feeds with newsletter none (${unused.length}):`);
for (const f of unused) console.log(`  ${f.id.padEnd(30)} ${f.source}  [ledger: ${f.verdict ?? 'none'}]`);

if (errors.length) { console.error(`\nFAILED, ${errors.length} problem${errors.length > 1 ? 's' : ''}:`); for (const e of errors) console.error('  - ' + e); process.exit(1); }
console.log('\nOK');
