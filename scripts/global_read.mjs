#!/usr/bin/env node
/**
 * Global Read — live driver for js/globalReadCore.js.
 *
 *   node scripts/global_read.mjs                       # fetch production, print the read
 *   node scripts/global_read.mjs --dir <folder>        # read saved <endpoint>.json files instead
 *   node scripts/global_read.mjs --json out.json       # also write the full object
 *
 * Reads the endpoints the dashboard already serves, normalises them into the
 * core's input shape, and prints one read: environment, scenarios, per-market
 * behaviour and direction with their weights, the agreement table, data
 * problems, and what would invalidate the view. Read-only: it never writes to
 * production.
 */
import fs from 'node:fs';
import path from 'node:path';
import { buildGlobalRead } from '../js/globalReadCore.js';
import { assembleGlobalReadInput, GLOBAL_READ_ENDPOINTS } from '../js/globalReadInputs.js';

const args = process.argv.slice(2);
const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const BASE = opt('--base') ?? 'https://macrofxmodel-production.up.railway.app';
const DIR = opt('--dir');
const JSON_OUT = opt('--json');

const fileOf = p => p.replace(/[/?=]/g, '_') + '.json';

async function load(p) {
  try {
    if (DIR) return JSON.parse(fs.readFileSync(path.join(DIR, fileOf(p)), 'utf8'));
    const r = await fetch(`${BASE}/api/${p}`, { signal: AbortSignal.timeout(45000) });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

const D = {};
await Promise.all(GLOBAL_READ_ENDPOINTS.map(async p => { D[p] = await load(p); }));
const input = assembleGlobalReadInput(D);
const read = buildGlobalRead(input);
const dir = input.dir;
if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify(read, null, 2));

// ── render ─────────────────────────────────────────────────────────────────
const P = x => (x == null ? '—' : `${Math.round(x * 100)}%`);
const L = [];
L.push(`# Global Read — ${read.meta.asOf.slice(0, 10)}`, '', read.headline, '');
L.push(`**Environment:** ${read.envLabel}`, '');
L.push(`**Conviction:** range ${read.conviction.range}/100 · direction ${read.conviction.direction}/100 · data quality ${read.conviction.dataQuality}/100`, '');
L.push('## State axes (coincident description)', '', '| axis | score | agree | inputs |', '|---|---|---|---|');
for (const [k, a] of Object.entries(read.axes)) L.push(`| ${k} | ${a.score} | ${a.agree} | ${a.inputs.map(i => i.text).join('; ')} |`);
L.push('', '## Scenarios', '');
for (const s of read.scenarios) L.push(`- **${s.name}** — p ${P(s.p)} (${s.pWhy}). ${s.text}`);
L.push('', '## Markets, ranked by clarity', '', '| market | clarity | behaviour | range × ladder | P(>p75) | direction |', '|---|---|---|---|---|---|');
for (const r of read.ranked) { const c = read.cards[r.sym]; L.push(`| ${r.sym} | ${r.clarity} | ${c.behaviour.label} | ${c.range?.mult ?? '—'} | ${P(c.range?.pAbove75)} | ${c.direction.label} |`); }
L.push('', '## Signal agreement by pair (s = sign × activation, e = effective weight)', '');
L.push('', '## Currencies', '', '| ccy | range pressure | direction | notes |', '|---|---|---|---|');
for (const c of Object.values(read.currencies)) L.push(`| ${c.ccy} | ${P(c.rangePressure)} | ${c.directionView} | ${c.notes.join('; ')} |`);
L.push('', '## Trade plan', '');
for (const r of read.ranked) { const c = read.cards[r.sym]; L.push(`- **${r.sym} — ${c.plan.stance}.** ${c.plan.lines} ${c.plan.direction}`); }
L.push('');
const fams = ['yield-spread', 'post-fomc', 'macro-regime-fx', 'lean', 'hmm-trend', 'trend', 'macro-score', 'cb-tone', 'cot', 'oi-walls'];
L.push(`| pair | ${fams.join(' | ')} |`, `|---|${fams.map(() => '---').join('|')}|`);
for (const [pair, xs] of Object.entries(dir)) L.push(`| ${pair} | ${fams.map(f => { const x = xs.find(y => y.id === f); return x ? `${x.s > 0 ? '+' : x.s < 0 ? '−' : '0'}${x.e ? ` (${x.e.toFixed(3)})` : ''}` : '·'; }).join(' | ')} |`);
L.push('', '## Data problems', '');
for (const f of read.dataQuality.feeds) L.push(`- feed ${f.id}: ${f.state}${f.why ? ` — ${f.why}` : ''}`);
for (const i of read.dataQuality.issues) L.push(`- ${i.problem}${i.where ? ` (${i.where})` : ''}`);
L.push('', '## Invalidation', '', ...read.invalidation.map(x => `- ${x}`));
L.push('', '## Context (read, not weighted)', '', ...read.context.map(x => `- ${x}`));
const fwd = read.meta.forward;
if (fwd.lean) L.push('', `Forward record — page lean: h0 ${P(fwd.lean.h0?.hitRate)} (n ${fwd.lean.h0?.n}), h1 ${P(fwd.lean.h1?.hitRate)}, h5 ${P(fwd.lean.h5?.hitRate)}. Range calls: flagged days realised ${fwd.rangeCalls?.realised} ATR (n ${fwd.rangeCalls?.n}) vs ordinary ${fwd.rangeCalls?.ordinaryRealised} (n ${fwd.rangeCalls?.ordinaryN}).`);
console.log(L.join('\n'));
