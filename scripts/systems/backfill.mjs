/**
 * Backfill: every stored backtest trade list in the repo, through the standard system outputs (plan §9ad).
 *
 *   node scripts/systems/backfill.mjs            # every system below
 *   node scripts/systems/backfill.mjs <id> ...   # only these
 *   node scripts/systems/backfill.mjs --check    # parse and report counts, write nothing
 *
 * Nothing is re-run: each system is exactly the trades its study stored (net or gross as its study recorded), in
 * the study's headline variant. One adapter per study family says which file, which column means what and how R
 * is formed; the mapping was checked against rows (vote atlas stop-outs at -1.00R, overnight net = gross - spread -
 * financing, Jordan rMult = netPct / stop distance). Where a study stored only a date, the trade is placed at 12:00
 * London that day and its notes say so. Systems a study could not supply (no direction, no result in R or %, summary
 * tables only) are listed in SKIPPED with the reason.
 *
 * Conventions that hold across the files: epoch fields are UTC seconds; MAE is stored positive in most files (it is
 * negated here); pnlPct-style results are % of the instrument's price, so R = pct / stop distance in %.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeSystemOutputs } from './writeSystemOutputs.mjs';
import { london } from '../../js/systemExports.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const rd = f => readFileSync(path.join(ROOT, f), 'utf8');
const json = f => JSON.parse(rd(f));
const num = v => (v === '' || v == null || v === 'nan' || v === 'NaN' ? NaN : +v);
const fin = Number.isFinite;

/** CSV text → rows of objects (quoted fields handled). */
export function parseCsv(text) {
  const lines = String(text).replace(/^﻿/, '').split(/\r?\n/).filter(l => l.length);
  const split = l => { const o = []; let c = '', q = false; for (let i = 0; i < l.length; i++) { const ch = l[i]; if (q) { if (ch === '"' && l[i + 1] === '"') { c += '"'; i++; } else if (ch === '"') q = false; else c += ch; } else if (ch === '"') q = true; else if (ch === ',') { o.push(c); c = ''; } else c += ch; } o.push(c); return o; };
  const head = split(lines[0] ?? '');
  return lines.slice(1).map(l => { const c = split(l); return Object.fromEntries(head.map((h, i) => [h, c[i]])); });
}
const csv = f => parseCsv(rd(f));

const TZF = {};
/** Wall-clock date (YYYY-MM-DD) + HH:MM in a time zone → UTC ms (DST-correct). */
export function zonedMs(date, hhmm = '12:00', tz = 'Europe/London') {
  const fmt = TZF[tz] ??= new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const [y, m, d] = date.slice(0, 10).split('-').map(Number), [hh, mm] = hhmm.split(':').map(Number), guess = Date.UTC(y, m - 1, d, hh, mm);
  const p = Object.fromEntries(fmt.formatToParts(new Date(guess)).map(x => [x.type, x.value])), shown = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
  return guess - (shown - guess);
}
export const londonMs = (date, hhmm) => zonedMs(date, hhmm, 'Europe/London');
const ymd = k => `${String(k).slice(0, 4)}-${String(k).slice(4, 6)}-${String(k).slice(6, 8)}`;
const files = (dir, re) => (existsSync(path.join(ROOT, dir)) ? readdirSync(path.join(ROOT, dir)).filter(f => re.test(f)).sort().map(f => `${dir}/${f}`) : []);

// ── the level-atlas vote family: R = pnlPct / (stopPips × pip / entry × 100); direction = side × decision ──────────
function voteTrades(list, { stopFromTop = false } = {}) {
  const out = [];
  for (const f of list) {
    const j = json(f);
    for (const t of j.trades ?? []) {
      const pip = t.pip ?? 1, stopPips = stopFromTop ? (j.stopPipsByPair ?? t.stopPips) : t.stopPips, riskPct = (stopPips * pip) / t.entry * 100;
      if (!(riskPct > 0) || !fin(t.pnlPct)) continue;
      const up = t.side === 'up' || t.side === 'long', follow = t.decision !== 'fade', long = t.side === 'long' ? true : t.side === 'short' ? false : up === follow, sg = long ? 1 : -1;
      out.push({ instrument: String(t.instrument ?? j.instrument).toUpperCase(), direction: long ? 'Long' : 'Short', entryMs: t.time * 1000, exitMs: (t.resolveTime ?? t.time) * 1000,
        R: t.pnlPct / riskPct, maeR: fin(t.maePips) ? -t.maePips / stopPips : null, mfeR: fin(t.mfePips) ? t.mfePips / stopPips : null,
        entry: t.entry, stop: +(t.entry - sg * stopPips * pip).toPrecision(8), target: fin(t.targetPips) ? +(t.entry + sg * t.targetPips * pip).toPrecision(8) : null,
        tags: [t.rung && `rung:${t.rung}`, t.session && `session:${t.session}`, t.decision && `decision:${t.decision}`, t.timedOut && 'timed-out'].filter(Boolean),
        features: fin(t.margin) ? { margin: t.margin } : null });
    }
  }
  return out;
}

export const SYSTEMS = [
  { id: 'vote-atlas', name: 'Vote Atlas (level atlas, vote follow/fade)', doc: 'forge/ATLAS_HONEST_GONOGO_PREREG.md', evidence: 'context (backtest-artifacts: look-ahead in this backtest; honest re-test atlas-honest-gonogo not run)', costs: 'flat round-trip cost per pair (file .cost, % of price), net',
    trades: () => voteTrades(files('analysis/output/level-atlas-vote-trades', /^[a-z0-9]+-votetrades\.json$/)) },
  { id: 'vote-atlas-v2', name: 'Vote Atlas v2 (comparison run)', doc: null, evidence: 'none (same caveat as vote-atlas)', costs: 'flat round-trip cost per pair, net',
    trades: () => voteTrades(files('analysis/output/level-atlas-vote-trades-v2', /^[a-z0-9]+-votetrades\.json$/)) },
  { id: 'vote-atlas-earlyexit', name: 'Vote Atlas with early exit', doc: null, evidence: 'none (the script says its Sharpe is not believable)', costs: 'flat round-trip cost per pair, net',
    trades: () => voteTrades(files('analysis/output/level-atlas-vote-trades', /-earlyexit-votetrades\.json$/)) },
  { id: 'vote-atlas-p90-fade', name: 'Vote Atlas p90 fade', doc: null, evidence: 'none', costs: 'flat round-trip cost per pair, net',
    trades: () => voteTrades(files('analysis/output/level-atlas-vote-trades', /-p90votetrades\.json$/), { stopFromTop: true }) },
  { id: 'daily-open-vote', name: 'Daily-open fib vote (follow)', doc: null, evidence: 'none', costs: 'flat round-trip cost (file .cost), net',
    trades: () => voteTrades(files('analysis/output/daily-open-vote-trades', /-votetrades\.json$/)) },
  { id: 'daily-open-fib-retest', name: 'Daily-open fib retest (gold, opening wick, bid/ask)', doc: 'analysis/output/daily-open-fib-retest/RESULTS.md', evidence: 'null', costs: 'bid/ask fills (spread in the fills)',
    note: 'exit time not stored: the trade is placed at its fill', trades: () => csv('analysis/output/daily-open-fib-retest/trades_gold_ba.csv').filter(r => fin(num(r['high|imp0.1|tpzero|be1|ba'])) && fin(num(r.ba_side))).map(r => {
      // the session opens at 18:00 New York on the key date; fill = minutes after that first bar
      const open = zonedMs(ymd(r.key), '18:00', 'America/New_York'), at = open + num(r.ba_fill_min) * 60e3;
      return { instrument: 'GOLD', direction: num(r.ba_side) > 0 ? 'Long' : 'Short', entryMs: at, exitMs: at, R: num(r['high|imp0.1|tpzero|be1|ba']), tags: [r.ba_how && `exit:${r.ba_how}`, r.regime && `regime:${r.regime}`].filter(Boolean), features: { adr: num(r.adr), imp: num(r.ba_imp) } };
    }) },
  { id: 'overnight-hold', name: 'Overnight hold (NQ and gold, 20:00 to 14:30 UK)', doc: 'analysis/output/overnight-hold/RESULTS.md', evidence: 'underpowered', costs: 'real bid/ask spread and OANDA financing, net',
    note: 'no stop: results are % of price at 1x notional, so R is that % at 1% risk', trades: () => ['nq', 'gold'].flatMap(k => csv(`analysis/output/overnight-hold/honest_trades_${k}.csv`).map(r => ({
      instrument: k.toUpperCase(), direction: 'Long', entryMs: num(r.entryEpoch) * 1000, exitMs: num(r.exitEpoch) * 1000, returnPct: num(r.net), riskPct: 1, maePct: num(r.maePct), entry: num(r.entryPrice), exit: num(r.exitPrice) }))) },
  { id: 'portfolio-book', name: 'Portfolio Book P1 (equal-risk sleeves)', doc: 'analysis/output/portfolio-book/RESULTS.md', evidence: 'context', costs: 'harness costs, net; % of book',
    trades: () => csv('analysis/output/portfolio-book/trades_P1.csv').map(r => { const rp = num(r['Risk %']); return {
      instrument: r.Instrument, direction: r.Direction, entryMs: Date.parse(`${r.Date}T${r.Time}:00Z`), exitMs: Date.parse(`${r['Exit Date']}T${r['Exit Time']}:00Z`), riskPct: rp, R: num(r['Return %']) / rp,
      maeR: -num(r['MAE %']) / rp, mfeR: num(r['MFE %']) / rp, tags: [r.Tags && `sleeve:${r.Tags}`].filter(Boolean), model: r.Model }; }).filter(t => t.riskPct > 0) },
  { id: 'gamma-regime-trades', name: 'Gamma regime switch (NQ: fade in long gamma, follow in short)', doc: 'analysis/output/gamma_regime_trades/RESULTS.md', evidence: 'null', costs: '0.01% round trip, net', note: 'date only: placed at 12:00 London',
    trades: () => gammaSwitch(csv('analysis/output/gamma_regime_trades/trades_A.csv'), () => 'NQ') },
  { id: 'gamma-regime-trades-fx', name: 'Gamma regime switch (FX)', doc: 'analysis/output/gamma-regime-trades-fx/RESULTS.md', evidence: 'null', costs: '0.01% round trip, net', note: 'date only: placed at 12:00 London',
    trades: () => gammaSwitch(csv('analysis/output/gamma-regime-trades-fx/trades.csv'), r => r.pair) },
  { id: 'short-vx-rule', name: 'Short VX rule', doc: 'analysis/output/short-vx-rule/RESULTS.md', evidence: 'underpowered', costs: '0.10 pt round trip (0.15 on stops), net',
    trades: () => csv('analysis/output/short-vx-rule/trades.csv').map(r => ({ instrument: 'VX', direction: 'Short', entryMs: londonMs(r.entry, '21:00'), exitMs: londonMs(r.exit, '21:00'), R: num(r.R), tags: [r.stopped === 'True' && 'stopped'].filter(Boolean) })) },
  { id: 'rule-a-pre2020', name: 'Rule A, line break (stop 0.2σ, target 5R, rich)', doc: 'analysis/output/rule-a-pre2020/RESULTS.md', evidence: 'null', costs: '2× spread, net', note: 'entry hour only; exit not stored',
    trades: () => csv('analysis/output/rule-a-pre2020/trades.csv').filter(r => r.rich === 'True' && fin(num(r['0.2|5']))).map(r => { const at = londonMs(r.d, `${String(r.hour).padStart(2, '0')}:00`);
      return { instrument: r.inst, direction: num(r.side) > 0 ? 'Long' : 'Short', entryMs: at, exitMs: at, R: num(r['0.2|5']), tags: [`line:${r.line}`, `arm:${r.arm}`], features: { ratio: num(r.ratio) } }; }) },
  { id: 'range-edge-limit-fade', name: 'Range-edge limit fade (target T1)', doc: 'analysis/output/range-edge-limit-fade/RESULTS.md', evidence: 'null', costs: 'bid/ask fills', note: 'date only: placed at 12:00 London',
    trades: () => csv('analysis/output/range-edge-limit-fade/trades.csv').filter(r => fin(num(r.rT1))).map(r => ({ instrument: r.inst.toUpperCase(), direction: r.side === 'B' ? 'Long' : 'Short', entryMs: londonMs(r.date), exitMs: londonMs(r.date), R: num(r.rT1), features: { spreadR: num(r.spreadR) } })) },
  { id: 'line-touch-limit-unseen', name: 'Line-touch, market entry (cell M)', doc: 'analysis/output/line-touch-limit-unseen/RESULTS.md', evidence: 'null', costs: 'bid/ask, net', note: 'cell M of three co-primary cells (M, L, J); exit not stored',
    trades: () => csv('analysis/output/line-touch-limit-unseen/trades.csv').filter(r => r.M_filled === '1' && fin(num(r.M_R))).map(r => ({ instrument: r.pair.toUpperCase(), direction: num(r.dir) > 0 ? 'Long' : 'Short', entryMs: num(r.t) * 1000, exitMs: num(r.t) * 1000, R: num(r.M_R),
      tags: [`family:${r.family}`, r.cont === 'True' ? 'continuation' : 'fade'], features: { spreadR: num(r.M_spreadR), hour: num(r.hour) } })) },
  { id: 'nq-forecast-target-ev', name: 'NQ long at the London open to the forecast target (P1)', doc: 'analysis/output/nq-forecast-target-ev/RESULTS.md', evidence: 'underpowered', costs: 'net',
    note: 'no stop: % of price at 1x, so R is that % at 1% risk', trades: () => csv('analysis/output/nq-forecast-target-ev/trades.csv').filter(r => r.strategy === 'P1').map(r => { const at = londonMs(r.date, '00:00');
      return { instrument: 'NQ', direction: 'Long', entryMs: at, exitMs: at + num(r.hold_min) * 60e3, returnPct: num(r.net_pct), riskPct: 1, maePct: -num(r.mae_pct), mfePct: num(r.mfe_pct), tags: [`exit:${r.exit}`] }; }) },
  { id: 'nq-continuation-execution', name: 'NQ continuation at the lines (out-of-sample era)', doc: 'analysis/output/day-reconstruction/m4/REPORT.md', evidence: 'null', costs: '1 pt slippage on stop/market, net', note: 'date only (bar index needs the M1 bin file): placed at 12:00 London',
    trades: () => csv('analysis/output/day-reconstruction/m4/trades_real_base.csv').filter(r => r.era === 'oos_pit' && fin(num(r.r))).map(r => { const dir = num(r.dir), fill = num(r.fill), risk = num(r.R);
      return { instrument: 'NQ', direction: dir > 0 ? 'Long' : 'Short', entryMs: londonMs(r.date), exitMs: londonMs(r.date), R: num(r.r), entry: fill, stop: +(fill - dir * risk).toFixed(2), target: +(fill + dir * risk).toFixed(2), tags: [`rung:${r.rung}`, r.amb === '1' && 'ambiguous-bar'].filter(Boolean) }; }) },
  ...['A', 'B'].map(S => ({ id: `cog-setup-${S.toLowerCase()}`, name: `C.OG setup ${S} (his lines, no direction filter)`, doc: 'analysis/output/cog_setups/RESULTS.md', evidence: 'null (cog-setups-direction)', costs: 'round trip EURUSD 0.008%, GOLD 0.02%, NQ 0.008% of price, net', note: 'exit not stored',
    trades: () => csv('analysis/output/cog_setups/trades.csv').filter(r => r.setup === S && fin(num(r.R))).map(r => { const at = londonMs(r.date, '00:00') + num(r.fill_min) * 60e3;
      return { instrument: r.ins, direction: num(r.side) > 0 ? 'Long' : 'Short', entryMs: at, exitMs: at, R: num(r.R), tags: [`exit:${r.outcome}`, `t20:${num(r.t20) === num(r.side) ? 'with' : 'against'}`, `p1:${num(r.p1) === num(r.side) ? 'with' : 'against'}`], features: { sig: num(r.sig) } }; }) })),
  { id: 'rates-residual-catchup', name: 'Rates-residual catch-up (C.OG setups where price lags rates)', doc: 'analysis/output/rates_residual/RESULTS.md', evidence: 'null', costs: 'as the C.OG setups, net', note: 'the S3 kept subset as the manifest reads the filter (|gap| > 0.5, sign(gap) = side, from 2018-02); check against study.py',
    trades: () => csv('analysis/output/rates_residual/line_trades_gap.csv').filter(r => fin(num(r.gap)) && r.date >= '2018-02-01' && Math.abs(num(r.gap)) > 0.5 && Math.sign(num(r.gap)) === Math.sign(num(r.side)) && fin(num(r.R))).map(r => { const at = londonMs(r.date, '00:00') + num(r.fill_min) * 60e3;
      return { instrument: r.ins, direction: num(r.side) > 0 ? 'Long' : 'Short', entryMs: at, exitMs: at, R: num(r.R), tags: [`setup:${r.setup}`, `exit:${r.outcome}`], features: { gap: num(r.gap) } }; }) },
  { id: 'jordan-atr-band', name: 'Jordan ATR band (gold and NQ, z 2.5 a 30)', doc: 'education/jordan_atr_band_backtest/RESULTS.md', evidence: 'null (study doc)', costs: '0.02% gold, 0.01% NQ round trip, net',
    trades: () => ['gold', 'nq'].flatMap(k => jordan(`education/jordan_atr_band_backtest/data/${k}.trades.json`)) },
  { id: 'jordan-atr-band-cont', name: 'Jordan ATR band, continuation (gold, NQ and 8 FX pairs)', doc: 'education/jordan_atr_band_backtest/RESULTS.md', evidence: 'null (study doc)', costs: 'per summary.json, net',
    trades: () => files('education/jordan_atr_band_backtest/data', /^[a-z]+_cont\.trades\.json$/).flatMap(jordan) },
];
function gammaSwitch(rows, inst) {
  return rows.filter(r => r.side && (num(r.regime) === 1 ? fin(num(r.fade)) : fin(num(r.follow)))).map(r => {
    const fade = num(r.regime) === 1, up = r.side === 'up', long = fade ? !up : up;
    return { instrument: inst(r), direction: long ? 'Long' : 'Short', entryMs: londonMs(r.d), exitMs: londonMs(r.d), R: fade ? num(r.fade) : num(r.follow), tags: [fade ? 'fade (long gamma)' : 'follow (short gamma)', `touched:${r.side}`] };
  });
}
function jordan(f) {
  return json(f).filter(t => t.outcome !== 'open' && fin(t.rMult)).map(t => ({ instrument: String(t.instrument).toUpperCase(), direction: t.side === 'BUY' ? 'Long' : 'Short', entryMs: t.fillTime * 1000, exitMs: (t.exitTime ?? t.fillTime) * 1000,
    R: t.rMult, maeR: fin(t.maeR) ? -t.maeR : null, entry: t.entry, stop: t.sl, target: t.tp, tags: [`exit:${t.outcome}`], features: { adx: t.adxAtEntry, distAtr: t.distAtrAtTouch, atr: t.atr } }));
}

export const SKIPPED = [
  { id: 'overnight-hold-toolkit', why: 'the same trades as overnight-hold (with MFE); imported once' },
  { id: 'overnight-hold-futures', why: 'gross only, no timestamps (would need a join by array position)' },
  { id: 'gamma-regime-trades-B', why: 'no trade direction stored' },
  { id: 'cog-spread-direction', why: 'an unfiltered pool; the yearly picks are not in the file' },
  { id: 'residual-pca-stops', why: 'results in units of the residual\'s standard deviation, not R or %' },
  { id: 'coleztrades-poi', why: 'no direction column and dates only' },
  { id: 'yield-coupling', why: 'summary tables only' },
  { id: 'atlas touch caches', why: 'touch events with no trade decision' },
];

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2), check = args.includes('--check'), only = args.filter(a => !a.startsWith('--'));
  for (const sys of SYSTEMS.filter(s => !only.length || only.includes(s.id))) {
    let raw; try { raw = sys.trades(); } catch (e) { console.log(`${sys.id}: FAILED to read: ${e.message}`); continue; }
    if (check) { const [d0] = london(Math.min(...raw.map(t => t.entryMs))), [d1] = london(Math.max(...raw.map(t => t.exitMs))); console.log(`${sys.id}: ${raw.length} trades ${d0}..${d1}`); continue; }
    try {
      const r = await writeSystemOutputs(sys.id, raw, { model: sys.name, doc: sys.doc, evidence: sys.evidence, costs: sys.costs, note: sys.note ?? null, backfill: true });
      console.log(`${sys.id}: ${r.trades} trades${r.skipped ? `, ${r.skipped} skipped` : ''}`);
    } catch (e) { console.log(`${sys.id}: FAILED ${e.message}`); }
  }
}
