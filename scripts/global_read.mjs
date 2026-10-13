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
import { buildGlobalRead, effectiveIc, freshness, REG } from '../js/globalReadCore.js';

const args = process.argv.slice(2);
const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const BASE = opt('--base') ?? 'https://macrofxmodel-production.up.railway.app';
const DIR = opt('--dir');
const JSON_OUT = opt('--json');

const ENDPOINTS = ['data-health', 'daily-read', 'desk-watch', 'today-reads', 'macro-changes', 'vol-forecast', 'hmm/regimes',
  'yield-spread/plan', 'macro-regime-fx', 'macro-scorecard', 'trend-basket', 'cot-extremes', 'cot', 'oi-today', 'oi-levels',
  'credit-stress', 'liquidity-gate/live', 'regime', 'ledger', 'range-calls', 'release-calls', 'chain-read', 'morning-brief',
  'econ-surprise', 'fomc/latest', 'hmm5m-v2', 'hmm1h-v2', 'daily-snapshot?days=2'];
const fileOf = p => p.replace(/[/?=]/g, '_') + '.json';

async function load(p) {
  try {
    if (DIR) return JSON.parse(fs.readFileSync(path.join(DIR, fileOf(p)), 'utf8'));
    const r = await fetch(`${BASE}/api/${p}`, { signal: AbortSignal.timeout(45000) });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

const NOW = Date.now();
const ageDays = d => (d ? (NOW - new Date(d).getTime()) / 864e5 : null);
const PAIRS = { EURUSD: ['EUR', 'USD'], GBPUSD: ['GBP', 'USD'], USDJPY: ['USD', 'JPY'], AUDUSD: ['AUD', 'USD'], NZDUSD: ['NZD', 'USD'], USDCAD: ['USD', 'CAD'], USDCHF: ['USD', 'CHF'] };
const SLASH = s => s.replace(/^([A-Z]{3})([A-Z]{3})$/, '$1/$2');
const sgn = x => (x > 0 ? 1 : x < 0 ? -1 : 0);
const median = xs => { const a = xs.filter(Number.isFinite).sort((p, q) => p - q); return a.length ? a[Math.floor(a.length / 2)] : null; };

const D = {};
await Promise.all(ENDPOINTS.map(async p => { D[p] = await load(p); }));

// ── per-instrument rows (IV/σ, fitted ladder, event scaling) ───────────────
const dr = D['daily-read'];
const drDay = dr?.days ? dr.days[Object.keys(dr.days).sort().at(-1)] : null;
const rows = drDay?.setup?.rows ?? [];
const tags = Object.fromEntries(rows.map(r => [r.sym, r.tag]));
const readAge = ageDays(drDay?.setup?.at);

// ── range flags ────────────────────────────────────────────────────────────
const dw = D['desk-watch']?.states ?? [];
const st = id => dw.find(s => s.id === id);
const g = D['today-reads']?.global ?? {};
const nqOi = (D['oi-today']?.pairs ?? []).find(p => /NAS100/.test(p.pair));
const nqGexFlip = (D['oi-levels']?.byInstrument?.nq ?? []).find(l => l.type === 'gex_flip')?.price;
const flags = {
  vixInv: !!st('vix-inversion')?.firing,
  frontDear: g.volTerm?.frontState === 'dear',
  frontCalm: g.volTerm?.frontState === 'calm',
  allDown: null,                                     // validated (breadth-all-down) but not computed live — see gaps
  nqDownWeek: !!st('nq-down-week')?.firing,
  gexShortNq: nqOi && nqGexFlip ? nqOi.spot < nqGexFlip : null,
};

// ── state observations ─────────────────────────────────────────────────────
const mc = Object.fromEntries((D['macro-changes']?.rows ?? []).map(r => [r.key, r]));
const sides = Object.values(g.crossAsset?.sides ?? {});
const vf = D['vol-forecast']?.instruments ?? {};
const IDX = ['NQ', 'SPX500', 'US30', 'US2000', 'DE30', 'UK100'], FXS = ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'NZDUSD', 'USDCAD', 'USDCHF'];
const vix = st('vix-inversion')?.value;
const mrfx = D['macro-regime-fx'];
const obs = {
  crossAssetRiskOnShare: sides.length ? sides.filter(s => s === 'risk-on').length / sides.length : null,
  vix: vix?.vix ?? null, vix3m: vix?.vix3m ?? null,
  hy20dBp: mc.hy?.deltas?.['20'] ?? null,
  stockBondCorr: st('stock-bond-together')?.value?.corr ?? null,
  dxy20dPct: mc.dxy ? +(100 * mc.dxy.deltas['20'] / (mc.dxy.last - mc.dxy.deltas['20'])).toFixed(2) : null,
  usdMove20Pct: D['today-reads']?.currency?.factors?.byCcy?.USD?.move20Pct ?? null,
  us10y20dBp: mc.us10y?.deltas?.['20'] ?? null,
  real20dBp: mc.tips?.deltas?.['20'] ?? null,
  hikesPriced: mrfx?.policy?.movesPriced ?? null, hikesDir: mrfx?.policy?.direction ?? null,
  medianVolPctIdx: median(IDX.map(s => vf[s]?.vol_pct)),
  medianVolPctFx: median(FXS.map(s => vf[s]?.vol_pct)),
  frontState: g.volTerm?.frontState ?? null,
  csi: D['credit-stress']?.current?.csi ?? null,
  liquidityBlocked: D['liquidity-gate/live']?.instruments ? Object.values(D['liquidity-gate/live'].instruments).some(x => x.composite === 'BLOCKED') : null,
};

// ── direction signals per pair (every family read; weights from evidence) ─
const ys = D['yield-spread/plan']?.plan;
const ysThr = ys?.entryThreshold ?? 2.75;
const sc = Object.fromEntries((D['macro-scorecard']?.ranked ?? []).map(c => [c.ccy, c.composite]));
const cb = D['macro-scorecard']?.cbSentiment ?? {};
const trend = Object.fromEntries((D['trend-basket']?.current ?? []).map(c => [c.ccy, c.trend]));
const cot = Object.fromEntries((D['cot-extremes']?.instruments ?? []).filter(c => c.group === 'fx').map(c => [c.sym, c.specShareZ]));
const hmm = D['hmm/regimes'] ?? {};
const plan = D['daily-snapshot?days=2']?.days?.[0]?.plan?.pairs ?? {};
const regimeKey = mrfx?.now?.key;
const lastFomc = cb.USD?.meetingDate ?? null;
const sessionsSinceFomc = lastFomc ? Math.floor(ageDays(lastFomc) * 5 / 7) : null;

const relCcy = (map, [b, q], scale = 1) => (map[b] != null && map[q] != null ? Math.max(-1, Math.min(1, (map[b] - map[q]) / scale)) : 0);
const dir = {};
for (const [pair, bq] of Object.entries(PAIRS)) {
  const k = pair.toLowerCase(), xs = [];
  const add = (id, s, extra = {}) => { const r = REG[id]; xs.push({ id, family: r.family, s, e: effectiveIc({ tier: r.tier, ic: extra.ic ?? r.ic, n_eff: extra.n_eff ?? null }, extra.fresh ?? 1), note: extra.note }); };
  const y = ys?.signals?.[k];
  if (y) {
    const active = Math.abs(y.z) >= ysThr;
    const d = (y.z > 0 ? 1 : -1) * (y.inverted ? -1 : 1);
    add('yield-spread', active ? d * Math.min(1, Math.abs(y.z) / ysThr) : 0, { fresh: freshness(ageDays(y.asOf), 3), note: `z ${y.z.toFixed(2)} (enter at ${ysThr})` });
  }
  const usdSide = bq[0] === 'USD' ? 1 : -1;
  add('post-fomc', sessionsSinceFomc != null && sessionsSinceFomc <= 5 ? usdSide : 0, { note: lastFomc ? `last FOMC ${lastFomc}, ${sessionsSinceFomc} sessions ago` : 'no FOMC date' });
  const mr = regimeKey ? mrfx.study?.regimes?.[regimeKey]?.[pair]?.['20'] : null;
  if (mr?.oos?.enough) {
    const hit = mr.oos.hitRate / 100;
    add('macro-regime-fx', sgn(mr.oos.mean), { ic: Math.abs(2 * (hit - 0.5)), n_eff: mr.all.nEffective, note: `OOS hit ${mr.oos.hitRate}% n=${mr.oos.n} but n_eff ${mr.all.nEffective}` });
  }
  const lean = plan[pair]?.lean; add('lean', lean === 'up' ? 1 : lean === 'down' ? -1 : 0, { note: `lean ${lean ?? '—'}` });
  const h = hmm[SLASH(pair)]; add('hmm-trend', h?.trendDir === 'up' ? 1 : h?.trendDir === 'down' ? -1 : 0, { note: `HMM ${h?.regime ?? '—'}` });
  add('trend', bq.includes('USD') ? (bq[0] === 'USD' ? -(trend[bq[1]] ?? 0) : (trend[bq[0]] ?? 0)) : 0, { note: 'TSMOM 12m' });
  add('macro-score', relCcy(sc, bq, 0.5), { note: `${bq[0]} ${sc[bq[0]] ?? '—'} vs ${bq[1]} ${sc[bq[1]] ?? '—'}` });
  add('cb-tone', relCcy(Object.fromEntries(Object.entries(cb).map(([c, v]) => [c, v.score])), bq, 0.5), { note: 'hawk − dove' });
  add('cot', -relCcy(cot, bq, 2), { note: 'spec share z, read contrarian' });
  const oi = (D['oi-today']?.pairs ?? []).find(p => p.pair === SLASH(pair));
  add('oi-walls', oi?.maxPain && oi?.spot ? sgn(oi.maxPain - oi.spot) : 0, { note: oi ? `max pain ${oi.maxPain.toPrecision(6)} (${oi.regime})` : '—' });
  dir[pair] = xs;
}

// ── data quality: feed health + cross-checks the audit found ────────────────
const health = D['data-health']?.rows ?? [];
const checks = [];
const chk = (cond, problem) => { if (cond) checks.push({ problem }); };
chk((D.cot?.errors ?? []).length, `COT live feed: ${D.cot.errors.join(', ')} (FX legs missing; cot-extremes weekly copy used)`);
chk(D['hmm5m-v2'] && !Object.keys(D['hmm5m-v2']).length, 'intraday HMM (5m/1h) serve {} — the HMM services are OFF by owner default (SVC_HMM5M_V2/SVC_HMM1H); not a fault, but the input is absent');
const fomcDoc = D['fomc/latest']?.meetingDate;
chk(fomcDoc && lastFomc && fomcDoc !== lastFomc, `/api/fomc/latest returns ${fomcDoc}, scorecard's last FOMC is ${lastFomc} (history route is current)`);
const staleSurprise = Object.entries(D['econ-surprise']?.byCcy ?? {}).filter(([, v]) => v.staleOnly).map(([c]) => c);
chk(staleSurprise.length, `econ-surprise has no recent prints for ${staleSurprise.join(', ')}`);
const hmmLabels = new Set(Object.values(hmm).map(x => x.regime));
chk(Object.keys(hmm).length > 5 && hmmLabels.size === 1, `daily HMM labels every instrument ${[...hmmLabels][0]}: not discriminating today`);
const bogus = Object.entries(D['oi-levels']?.byInstrument ?? {}).filter(([, ls]) => {
  const mp = ls.find(l => l.type === 'max_pain')?.price; return mp && ls.some(l => l.price < mp * 0.5);
}).map(([k]) => k);
chk(bogus.length, `OI levels below 50% of max pain (hvl / cluster parse) on ${bogus.join(', ')}`);
chk((D['release-calls']?.summary?.n ?? 0) === 0, 'release-calls record is empty (nobody is pressing the call buttons)');
chk(Object.keys(D['macro-scorecard']?.staleDims ?? {}).length, `macro scorecard stale dims: ${Object.entries(D['macro-scorecard']?.staleDims ?? {}).map(([k, v]) => `${k} ${v.map(x => `${x.ccy} ${x.ageDays}d`).join('/')}`).join('; ')}`);
chk(ys && ysThr !== 2.75, `yield-spread plan enters at |z| ${ysThr}, the validated rule is 2.75`);
chk(mc.dxy && ageDays(mc.dxy.lastDate) > 5, `broad dollar last ${mc.dxy?.lastDate} (${Math.round(ageDays(mc.dxy?.lastDate))}d old)`);
chk(flags.allDown == null, 'breadth-all-down is validated but no live job computes it');

// ── persistence / base rates ────────────────────────────────────────────────
const hist = D.regime?.history ?? [];
const cur = D.regime?.now?.regime;
let stay = 0, tot = 0; for (let i = 0; i + 1 < hist.length; i++) if (hist[i].regime === cur) { tot++; if (hist[i + 1].regime === cur) stay++; }
const persist = { vixInvert5d: 1 - Math.pow(1 - 86 / (18.8 * 252), 5), macroMonthly: tot ? stay / tot : null };

const ev = st('event-range');
const eventsDue = ev?.firing ? (ev.expect ?? []).map(e => ({ label: `${e.inst} event`, mult: e.mult ?? '?' })) : [];

// ── context (shown, never weighted) ────────────────────────────────────────
const cr = D['chain-read']?.read;
const context = [
  D.regime?.now ? `Macro quadrant: ${D.regime.now.label} for ${D.regime.now.months} months (${D.regime.now.what}).` : null,
  cr?.hook ? `Chain read: ${cr.hook}` : null,
  ...(cr?.stories ?? []).map(s => `Story — ${s.name}: ${s.status}.`),
  D['morning-brief']?.analysis?.headline ? `Brief: ${D['morning-brief'].analysis.headline}` : null,
  ...((D['cot-extremes']?.instruments ?? []).filter(c => c.specPct >= 95 || c.specPct <= 5).map(c => `COT extreme: ${c.label} specs at ${c.specPct}th pct (context; COT direction is a banked null).`)),
  mrfx?.policy ? `Front end: 2Y ${mrfx.policy.twoYear}% vs policy ${mrfx.policy.policyRate}% → ${mrfx.policy.movesPriced} ${mrfx.policy.direction} priced.` : null,
].filter(Boolean);

// ── invalidation: the conditions that change the read ──────────────────────
const maxZ = ys ? Math.max(...Object.values(ys.signals).map(s => Math.abs(s.z))) : null;
const invalidation = [
  `VIX closes ≥ VIX3M (now ${obs.vix} vs ${obs.vix3m}) → alternative scenario; index/USDJPY/gold ranges widen.`,
  `HY above 4% (now ${mc.hy?.last}%) or another +25bp in a week → credit axis becomes stress.`,
  `Any 2Y spread |z| ≥ ${ysThr} (largest now ${maxZ?.toFixed(2)}) → a tested directional input switches on for that pair.`,
  'An IV÷σ tag flips (continue ↔ exhaust) at the 22:00 rebuild → that instrument\'s behaviour label flips.',
  'A tier-1 release enters the 24h window → event scaling applies; direction still not part of it.',
  'Next FOMC → five-session USD-drift window opens (the only tested event-direction input).',
];

const read = buildGlobalRead({ obs, rows, flags, dir, tags, hmm: Object.fromEntries(Object.entries(hmm).map(([k, v]) => [k.replace('/', '').replace('_USD', '').replace('NAS100', 'NQ').replace('XAU', 'GOLD'), v.regime])),
  health, checks, persist, eventsDue, context, invalidation });
read.asOf = new Date(NOW).toISOString(); read.inputsAge = { dailyReadDays: readAge };
read.forward = { lean: D.ledger?.summary?.overall ?? null, rangeCalls: D['range-calls']?.summary?.flagged ? { ...D['range-calls'].summary.flagged, n: D['range-calls'].summary.n } : null };
if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify(read, null, 2));

// ── render ─────────────────────────────────────────────────────────────────
const P = x => (x == null ? '—' : `${Math.round(x * 100)}%`);
const L = [];
L.push(`# Global Read — ${read.asOf.slice(0, 10)}`, '');
L.push(`**Environment:** ${read.envLabel}`, '');
L.push(`**Conviction:** range ${read.conviction.range}/100 · direction ${read.conviction.direction}/100 · data quality ${read.conviction.dataQuality}/100`, '');
L.push('## State axes (coincident description)', '', '| axis | score | agree | inputs |', '|---|---|---|---|');
for (const [k, a] of Object.entries(read.axes)) L.push(`| ${k} | ${a.score} | ${a.agree} | ${a.inputs.map(i => i.text).join('; ')} |`);
L.push('', '## Scenarios', '');
for (const s of read.scenarios) L.push(`- **${s.name}** — p ${P(s.p)} (${s.pWhy}). ${s.text}`);
L.push('', '## Markets, ranked by clarity', '', '| market | clarity | behaviour | range × ladder | P(>p75) | direction |', '|---|---|---|---|---|---|');
for (const r of read.ranked) { const c = read.cards[r.sym]; L.push(`| ${r.sym} | ${r.clarity} | ${c.behaviour.label} | ${c.range?.mult ?? '—'} | ${P(c.range?.pAbove75)} | ${c.direction.label} |`); }
L.push('', '## Signal agreement by pair (s = sign × activation, e = effective weight)', '');
const fams = ['yield-spread', 'post-fomc', 'macro-regime-fx', 'lean', 'hmm-trend', 'trend', 'macro-score', 'cb-tone', 'cot', 'oi-walls'];
L.push(`| pair | ${fams.join(' | ')} |`, `|---|${fams.map(() => '---').join('|')}|`);
for (const [pair, xs] of Object.entries(dir)) L.push(`| ${pair} | ${fams.map(f => { const x = xs.find(y => y.id === f); return x ? `${x.s > 0 ? '+' : x.s < 0 ? '−' : '0'}${x.e ? ` (${x.e.toFixed(3)})` : ''}` : '·'; }).join(' | ')} |`);
L.push('', '## Data problems', '');
for (const f of read.dataQuality.feeds) L.push(`- feed ${f.id}: ${f.state}${f.why ? ` — ${f.why}` : ''}`);
for (const i of read.dataQuality.issues) L.push(`- ${i.problem}`);
L.push('', '## Invalidation', '', ...read.invalidation.map(x => `- ${x}`));
L.push('', '## Context (read, not weighted)', '', ...read.context.map(x => `- ${x}`));
if (read.forward.lean) L.push('', `Forward record — page lean: h0 ${P(read.forward.lean.h0?.hitRate)} (n ${read.forward.lean.h0?.n}), h1 ${P(read.forward.lean.h1?.hitRate)}, h5 ${P(read.forward.lean.h5?.hitRate)}. Range calls: flagged days realised ${read.forward.rangeCalls?.realised} ATR (n ${read.forward.rangeCalls?.n}) vs ordinary ${read.forward.rangeCalls?.ordinaryRealised} (n ${read.forward.rangeCalls?.ordinaryN}).`);
console.log(L.join('\n'));
