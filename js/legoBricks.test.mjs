// Synthetic, no-network unit tests for the new lego bricks. Each test compares
// the extracted brick against a verbatim copy of the original inline logic to
// prove the extraction changed no numbers, plus a few invariant checks.
//
//   node js/legoBricks.test.mjs

import { bisect, extractBars, resampleTo, bodyRange, calcATR } from './barUtils.js';
import { rollingZScore, rollingPercentile, rollingZAt, linregSlope, ewma, stdev } from './statsCore.js';
import { atrWilder, adxWilder, ema, rsiWilder } from './indicatorCore.js';
import { summarizeTrades, sharpeRatio, maxDrawdownFromPnls, profitFactor, winRate } from './metricsCore.js';
import { FIB_LEVELS, calcFibs } from './fibProjection.js';
import { instrument, pipSize, resolveKey, INSTRUMENT_KEYS } from './instrumentRegistry.js';
import { summarize } from './honestForecastEngine.js';
import { labelOutcome, OUTCOME_LABELERS } from './dayTypeCore.js';
import { createTouchFeatures, TOUCH_DEFAULTS } from './touchFeatures.js';
import { extractTouches, buildPolicy, tradePnl, pnlFor, runPerLine, runRigor } from './perLineStrategy.js';
import { backtestStats, portfolioStats } from './backtestStats.js';

let failures = 0;
const ok   = (name, cond, extra = '') => { console.log(`  ${cond ? '✓' : '✗ FAIL'} ${name}${extra ? '  ' + extra : ''}`); if (!cond) failures++; };
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

// ── Deterministic synthetic M1 packed series (no Math.random) ────────────────
const N = 6 * 60 * 3;                         // 3h of M1 bars
const times = new Float64Array(N), opens = new Float64Array(N), highs = new Float64Array(N),
      lows = new Float64Array(N), closes = new Float64Array(N);
let px = 1.1000;
const t0 = Date.UTC(2024, 0, 8, 0, 0, 0) / 1000;   // a Monday 00:00 UTC
for (let i = 0; i < N; i++) {
  const drift = 0.00002 * Math.sin(i / 40) + 0.000005;
  const o = px, c = px * (1 + drift), hi = Math.max(o, c) * 1.0001, lo = Math.min(o, c) * 0.9999;
  times[i] = t0 + i * 60; opens[i] = o; highs[i] = hi; lows[i] = lo; closes[i] = c; px = c;
}
const packed = { n: N, times, opens, highs, lows, closes };

console.log('[barUtils]');
// Reference copies (verbatim from asiaRangeEngine.js / rangeFibEngine.js)
function refBisect(t, target) { let lo = 0, hi = t.length; while (lo < hi) { const m = (lo + hi) >>> 1; if (t[m] < target) lo = m + 1; else hi = m; } return lo; }
function refExtract(p, a, b) { const { n, times, opens, highs, lows, closes } = p; const s = refBisect(times, a); const out = []; for (let i = s; i < n && times[i] < b; i++) out.push({ time: times[i], open: opens[i], high: highs[i], low: lows[i], close: closes[i] }); return out; }
function refResample(bars, minutes) { const secs = minutes * 60; const mp = new Map(); for (const bar of bars) { const bk = bar.time - (bar.time % secs); if (!mp.has(bk)) mp.set(bk, { time: bk, open: bar.open, high: bar.high, low: bar.low, close: bar.close }); else { const b = mp.get(bk); b.high = Math.max(b.high, bar.high); b.low = Math.min(b.low, bar.low); b.close = bar.close; } } return [...mp.values()].sort((a, b) => a.time - b.time); }
function refBodyRange(m1, minutes) { if (!m1.length) return null; const bars = refResample(m1, minutes); let high = -Infinity, low = Infinity; for (const bar of bars) { high = Math.max(high, Math.max(bar.open, bar.close)); low = Math.min(low, Math.min(bar.open, bar.close)); } if (!isFinite(high) || !isFinite(low) || low >= high) return null; return { high, low, range: high - low }; }
function refATR(m1, tf, period = 14) { const bars = refResample(m1, tf); if (bars.length < 2) return null; const trs = []; for (let i = 1; i < bars.length; i++) { const b = bars[i], p = bars[i - 1]; trs.push(Math.max(b.high - b.low, Math.abs(b.high - p.close), Math.abs(b.low - p.close))); } const sl = trs.slice(-Math.max(period, 1)); return sl.length ? sl.reduce((a, b) => a + b, 0) / sl.length : null; }

ok('bisect matches reference', [t0, t0 + 3600, t0 + 99999].every(tg => bisect(times, tg) === refBisect(times, tg)));
const asiaWin = extractBars(packed, t0, t0 + 6 * 3600);
ok('extractBars matches reference', JSON.stringify(asiaWin) === JSON.stringify(refExtract(packed, t0, t0 + 6 * 3600)));
ok('resampleTo(5m) matches reference', JSON.stringify(resampleTo(asiaWin, 5)) === JSON.stringify(refResample(asiaWin, 5)));
const br = bodyRange(asiaWin, 5), brRef = refBodyRange(asiaWin, 5);
ok('bodyRange matches reference', JSON.stringify(br) === JSON.stringify(brRef), `range=${br && br.range.toExponential(3)}`);
ok('calcATR(30m) matches reference', near(calcATR(asiaWin, 30), refATR(asiaWin, 30), 1e-15));

console.log('[statsCore]');
const arr = Array.from({ length: 300 }, (_, i) => Math.sin(i / 7) * 3 + Math.cos(i / 3));
function refRZ(a, period, clipAt = null) { const out = new Array(a.length).fill(NaN); for (let i = 0; i < a.length; i++) { if (i + 1 < period || !Number.isFinite(a[i])) continue; const win = a.slice(i - period + 1, i + 1).filter(Number.isFinite); if (win.length < period) continue; const m = win.reduce((x, y) => x + y, 0) / win.length; const sd = Math.sqrt(win.reduce((x, y) => x + (y - m) ** 2, 0) / win.length); let z = sd > 0 ? (a[i] - m) / sd : 0; if (clipAt != null) z = Math.max(-clipAt, Math.min(clipAt, z)); out[i] = z; } return out; }
function refRP(a, period) { const out = new Array(a.length).fill(NaN); for (let i = 0; i < a.length; i++) { if (i + 1 < period || !Number.isFinite(a[i])) continue; const win = a.slice(i - period + 1, i + 1).filter(Number.isFinite); if (win.length < period) continue; out[i] = win.filter(v => v <= a[i]).length / win.length * 100; } return out; }
const z = rollingZScore(arr, 50, 3), zRef = refRZ(arr, 50, 3);
ok('rollingZScore matches nasdaqTransforms ref', z.every((v, i) => (Number.isNaN(v) && Number.isNaN(zRef[i])) || near(v, zRef[i], 1e-12)));
const p = rollingPercentile(arr, 50), pRef = refRP(arr, 50);
ok('rollingPercentile matches ref', p.every((v, i) => (Number.isNaN(v) && Number.isNaN(pRef[i])) || near(v, pRef[i], 1e-12)));
function refRZAt(a, idx, period = 200) { const start = Math.max(0, idx - period + 1); const n = idx - start + 1; if (n < 5) return 0; let m = 0; for (let i = start; i <= idx; i++) m += a[i]; m /= n; let v = 0; for (let i = start; i <= idx; i++) { const d = a[i] - m; v += d * d; } const sd = Math.sqrt(v / n); return sd < 1e-12 ? 0 : (a[idx] - m) / sd; }
ok('rollingZAt matches hmm5m ref', [10, 100, 250].every(i => near(rollingZAt(arr, i, 200), refRZAt(arr, i, 200), 1e-12)));
ok('linregSlope sign (rising)', linregSlope([1, 2, 3, 4, 5]) > 0 && near(linregSlope([1, 2, 3, 4, 5]), 1, 1e-9));
ok('ewma seeded + bounded', ewma([1, 1, 1, 1]).every(v => near(v, 1, 1e-12)));
ok('stdev pop vs sample differ', stdev([1, 2, 3], 0) !== stdev([1, 2, 3], 1));

console.log('[indicatorCore]');
const bars = resampleTo(extractBars(packed, t0, t0 + 3 * 3600), 5);
function refATRWilder(bars, n = 20) { const out = new Float64Array(bars.length); if (!bars.length) return out; out[0] = Math.abs(+bars[0].high - +bars[0].low); const k = 1 / n; for (let i = 1; i < bars.length; i++) { const h = +bars[i].high, l = +bars[i].low, pc = +bars[i - 1].close; const tr = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)); out[i] = (Number.isFinite(tr) && tr > 0) ? k * tr + (1 - k) * out[i - 1] : out[i - 1]; } return out; }
const aw = atrWilder(bars, 20), awRef = refATRWilder(bars, 20);
ok('atrWilder matches hmm5m ref', aw.every((v, i) => near(v, awRef[i], 1e-15)));
ok('adxWilder in [0,100]', Array.from(adxWilder(bars, 14)).every(v => v >= 0 && v <= 100));
ok('ema responds to step', (() => { const e = ema([0, 0, 0, 10, 10, 10, 10, 10, 10, 10], 3); return e[e.length - 1] > 5 && e[0] === 0; })());
const rsi = rsiWilder(closes.slice(0, 200), 14).filter(Number.isFinite);
ok('rsiWilder in [0,100]', rsi.length > 0 && rsi.every(v => v >= 0 && v <= 100));

console.log('[metricsCore]');
// FROZEN reference: the ORIGINAL honestForecastEngine.summarize body, copied
// verbatim. This keeps the golden test honest even after summarize() is rewired
// to delegate to the brick — both must still equal this frozen baseline.
function refSummarize(records) {
  const filled = records.filter(r => r.filled);
  const n = filled.length;
  if (!n) return { trades: 0, winRate: 0, profitFactor: 0, expectancy: 0, sharpe: 0, maxDD: 0, totalPnl: 0 };
  let wins = 0, grossWin = 0, grossLoss = 0, sumPnl = 0, sumSq = 0, cum = 0, peak = 0, maxDD = 0;
  for (const r of filled) {
    const x = r.pnl_pct; sumPnl += x; sumSq += x * x;
    if (x > 0) { wins++; grossWin += x; } else { grossLoss += -x; }
    cum += x; if (cum > peak) peak = cum; const dd = cum - peak; if (dd < maxDD) maxDD = dd;
  }
  const m = sumPnl / n, variance = Math.max(sumSq / n - m * m, 0), std = Math.sqrt(variance);
  const dates = filled.map(r => r.date).sort();
  const yrs = Math.max((Date.parse(dates[dates.length - 1]) - Date.parse(dates[0])) / (365.25 * 864e5), 0.25);
  const tradesPerYr = n / yrs, perTradeSharpe = std > 1e-9 ? m / std : 0;
  return { trades: n, tradesPerYr: +tradesPerYr.toFixed(1), winRate: +(wins / n * 100).toFixed(1),
    profitFactor: grossLoss > 1e-9 ? +(grossWin / grossLoss).toFixed(3) : (grossWin > 0 ? 99 : 0),
    expectancy: +m.toFixed(4), sharpe: +(perTradeSharpe * Math.sqrt(tradesPerYr)).toFixed(3),
    maxDD: +maxDD.toFixed(3), totalPnl: +sumPnl.toFixed(3) };
}
const recs = [];
let d = Date.UTC(2022, 0, 3);
for (let i = 0; i < 120; i++) {
  const pnl = +(Math.sin(i / 5) * 0.4 + 0.05).toFixed(4);
  recs.push({ filled: true, pnl_pct: pnl, date: new Date(d).toISOString().slice(0, 10) });
  d += (i % 3 + 1) * 3 * 864e5;
}
const refSummary = refSummarize(recs);                                   // frozen baseline
const liveSummary = summarize(recs);                                     // current (possibly rewired) module
const got = summarizeTrades(recs.map(r => r.pnl_pct), recs.map(r => r.date));
const keys = ['trades', 'tradesPerYr', 'winRate', 'profitFactor', 'expectancy', 'sharpe', 'maxDD', 'totalPnl'];
ok('summarizeTrades == frozen original (golden)', keys.every(k => near(got[k], refSummary[k], 1e-9)),
   keys.filter(k => !near(got[k], refSummary[k], 1e-9)).map(k => `${k}:${got[k]}≠${refSummary[k]}`).join(' '));
ok('honestForecast.summarize == frozen original (rewire-safe)', keys.every(k => near(liveSummary[k], refSummary[k], 1e-9)),
   keys.filter(k => !near(liveSummary[k], refSummary[k], 1e-9)).map(k => `${k}:${liveSummary[k]}≠${refSummary[k]}`).join(' '));
ok('sharpeRatio 0 for <2 pts', sharpeRatio([1]) === 0);
ok('maxDrawdownFromPnls ≤ 0', maxDrawdownFromPnls([1, -2, 1, -3, 1]) < 0);
ok('profitFactor noLoss fallback', profitFactor([1, 2, 3]) === 99);
ok('winRate fraction', near(winRate([1, -1, 1, 1]), 0.75));

console.log('[fibProjection]');
ok('FIB_LEVELS has 45 levels', FIB_LEVELS.length === 45);
const fibs = calcFibs(100, 10);
ok('calcFibs projects low+range*level', near(fibs.find(f => f.level === 0).price, 100) && near(fibs.find(f => f.level === 1).price, 110));
ok('calcFibs marks key levels', fibs.find(f => f.level === 0.5).isKey === true && fibs.find(f => f.level === 2).isKey === false);

console.log('[instrumentRegistry]');
ok('resolveKey aliases → eurusd', ['EUR/USD', 'EUR_USD', 'EURUSD', 'eurusd', 'EURUSD=X'].every(s => resolveKey(s) === 'eurusd'));
ok('pip sizes correct', pipSize('EUR/USD') === 0.0001 && pipSize('USD/JPY') === 0.01 && pipSize('XAU/USD') === 1.0);
ok('gold canonical pip = 1.0 (not the 0.1 drift)', pipSize('gold') === 1.0);
ok('NQ resolves via OANDA + assetClass index', instrument('NAS100_USD').key === 'nq' && instrument('nq').assetClass === 'index');
ok('unknown instrument throws', (() => { try { instrument('ZZZ/ZZZ'); return false; } catch { return true; } })());
ok('registry covers ≥30 instruments', INSTRUMENT_KEYS.length >= 30);

console.log('[dayTypeCore]');
ok('labelOutcome default = closeVsOcMed (continuation when |close−open| > ocMed)',
  labelOutcome({ open: 100, close: 101, ocMedFrac: 0.005, hl50Frac: 0.012 }) === 'CONTINUATION' &&
  labelOutcome({ open: 100, close: 100.2, ocMedFrac: 0.005, hl50Frac: 0.012 }) === 'REVERSION');
ok('labelOutcome closeVsHl50 is stricter than default',
  labelOutcome({ open: 100, close: 100.8, ocMedFrac: 0.005, hl50Frac: 0.012 }) === 'CONTINUATION' &&
  labelOutcome({ open: 100, close: 100.8, ocMedFrac: 0.005, hl50Frac: 0.012 }, 'closeVsHl50') === 'REVERSION');
ok('labelOutcome dayEfficiency uses net÷range', OUTCOME_LABELERS.dayEfficiency({ open: 100, high: 101, low: 99.9, close: 100.9 }) === 'CONTINUATION');
ok('labelOutcome null-guards bad input', labelOutcome({ open: 0, close: 1, ocMedFrac: 0.01 }) === null);

console.log('[touchFeatures]');
{
  const tf = createTouchFeatures({ erWin: 5, velWin: 5 });
  // A clean one-directional drive into the line → high efficiency ('3·driven').
  const drive = Array.from({ length: 12 }, (_, i) => ({ time: i, open: 100 + i * 0.1, high: 100 + i * 0.1, low: 100 + i * 0.1, close: 100 + i * 0.1 }));
  const fDrive = tf.compute({ bars: drive, touchIdx: 11, open: 100, sigma: 0.005, side: 'up', wt1: null });
  ok('approachEfficiency = driven on a clean drive', fDrive.approachER.bucket === '3·driven' && fDrive.approachER.value > 0.9);
  // A round-trip (up then back) → low efficiency ('1·choppy').
  const chop = [100,100.2,100.4,100.2,100.0,100.2,100.4,100.2,100.0,100.2,100.4,100.2].map((c, i) => ({ time: i, open: c, high: c, low: c, close: c }));
  ok('approachEfficiency = choppy on a round-trip', tf.compute({ bars: chop, touchIdx: 11, open: 100, sigma: 0.005, side: 'up', wt1: null }).approachER.bucket === '1·choppy');
  // Velocity: a big fast move in σ-units → spike; null-guards on short history.
  ok('approachVelocity = spike on a fast move', tf.compute({ bars: drive, touchIdx: 11, open: 100, sigma: 0.0005, side: 'up', wt1: null }).approachVel.bucket === '3·spike');
  ok('touch features null-guard short history', tf.compute({ bars: drive, touchIdx: 2, open: 100, sigma: 0.005, side: 'up', wt1: null }).approachER.bucket === null);
  // WaveTrend extension reads the precomputed series in the touch direction.
  ok('wtState extended when overbought at an up-line', tf.compute({ bars: drive, touchIdx: 11, open: 100, sigma: 0.005, side: 'up', wt1: drive.map(() => 60) }).wtState.bucket === '3·extended');
  ok('createTouchFeatures merges config (erWin override, wt default kept)', tf.cfg.erWin === 5 && tf.cfg.wt.n1 === TOUCH_DEFAULTS.wt.n1);
  // Volume climax: touch bar at 5× the flat baseline → surge.
  const volBars = Array.from({ length: 40 }, (_, i) => ({ time: i, open: 100, high: 100.1, low: 99.9, close: 100, volume: i === 39 ? 500 : 100 }));
  ok('volumeClimax = surge on a volume spike', createTouchFeatures({ volWin: 30 }).compute({ bars: volBars, touchIdx: 39, open: 100, sigma: 0.005, side: 'up' }).volClimax.bucket === '3·surge');
  ok('volumeClimax null without volume', tf.compute({ bars: drive, touchIdx: 11, open: 100, sigma: 0.005, side: 'up' }).volClimax.bucket === null);
  // Candle rejection: big upper wick at an up-line touch → reject.
  const rejBar = [{ time: 0, open: 100, high: 101, low: 99.95, close: 100.05 }];
  ok('candleRejection = reject on a big upper wick (up-line)', createTouchFeatures().compute({ bars: rejBar, touchIdx: 0, open: 100, sigma: 0.005, side: 'up' }).candleReject.bucket === '3·reject');
  // Round-number proximity: 1.1000 sits ON a figure; 1.1037 is off.
  ok('roundNumber on-figure at 1.1000', createTouchFeatures().compute({ bars: rejBar, touchIdx: 0, open: 1.1, sigma: 0.005, side: 'up', level: 1.1000, pip: 0.0001 }).roundNum.bucket === '3·on-figure');
  ok('roundNumber off at 1.1080 (20 pips from 1.1100)', createTouchFeatures().compute({ bars: rejBar, touchIdx: 0, open: 1.1, sigma: 0.005, side: 'up', level: 1.1080, pip: 0.0001 }).roundNum.bucket === '1·off');
}

console.log('[perLineStrategy]');
{
  // One window with a decided fade-favoured touch: HL50_up reverted, spike, with
  // inner/outer barriers priced.
  const mkWin = (date, reverted, vel='3·spike') => ({ date, open: 1.10, lines: [
    { name:'HL50', side:'up', outcome: reverted?'reverted':'continued', level:1.1050, innerLvl:1.1030, outerLvl:1.1070, approachVel:vel, budgetBucket:'3·exhausted' },
  ]});
  const touches = extractTouches([mkWin('2020-01-01',true)], {});
  ok('extractTouches builds cell key from line + condition', touches[0].cell === 'HL50_up|3·spike' && touches[0].reverted === true);
  ok('extractTouches drops missing-condition touches', extractTouches([{date:'x',open:1,lines:[{name:'HL50',side:'up',outcome:'reverted',level:1,innerLvl:0.9,outerLvl:1.1,approachVel:null}]}], {}).length === 0);
  // Policy: 70% reversion over n=100 → fade; 50/50 → skip.
  const isT = [];
  for (let i=0;i<100;i++) isT.push(...extractTouches([mkWin('2020-01-0'+(i%9+1), i<70)], {}));
  const pol = buildPolicy(isT, { minN: 50 });
  ok('buildPolicy → fade on a significant reversion cell', pol['HL50_up|3·spike'].decision === 'fade');
  const coin = []; for (let i=0;i<100;i++) coin.push(...extractTouches([mkWin('2020-02-01', i%2===0)], {}));
  ok('buildPolicy → skip on a coin-flip cell', buildPolicy(coin,{minN:50})['HL50_up|3·spike'].decision === 'skip');
  ok('buildPolicy → skip on thin sample', buildPolicy(isT.slice(0,10),{minN:50})['HL50_up|3·spike'].decision === 'skip');
  // tradePnl: fade win = +distToInner − cost; fade loss = −distToOuter − cost.
  const win  = tradePnl(touches[0], pol, { costPct: 0.01, slipPct: 0 });
  const loss = tradePnl(extractTouches([mkWin('2020-01-01', false)],{})[0], pol, { costPct: 0.01, slipPct: 0 });
  ok('tradePnl fade win ≈ +distToInner − cost', near(win, (Math.abs(1.1050-1.1030)/1.10*100) - 0.01, 1e-4));
  ok('tradePnl fade loss ≈ −distToOuter − cost', near(loss, -(Math.abs(1.1070-1.1050)/1.10*100) - 0.01, 1e-4));
  ok('tradePnl skips an unknown/skip cell', tradePnl({...touches[0], cell:'ZZ'}, pol, {}) === null);
  // runPerLine: IS-learned fade applied OOS where the edge persists → positive book.
  const byPair = { eurusd: [] };
  for (let d=1; d<=200; d++){ const date = `2020-${String(Math.ceil(d/28)).padStart(2,'0')}-${String(d%28+1).padStart(2,'0')}`;
    byPair.eurusd.push(...extractTouches([mkWin(date, d%10<7)], {})); }   // 70% revert throughout
  const run = runPerLine(byPair, { splitFrac: 0.6, minN: 30, costByPair:{eurusd:0.01}, slipByPair:{eurusd:0} });
  ok('runPerLine produces an OOS book with trades + daily equity', run.nTrades > 0 && run.equity.length > 0 && run.equity.length <= run.nTrades);
  ok('runPerLine book is profitable when the IS edge persists OOS', run.book.totalPnl > 0 && run.coverage.fadeCells >= 1);

  // FIX 1 — honest mark-to-close: an undecided outcome (no barrier hit) is scored
  // by the actual close, NOT credited the full target. A 1-pip drift ≠ a full win.
  const closeT = { date:'2020-01-01', open:1.10, side:'up', reverted:true, decidedBy:'close', closePx:1.10490, level:1.10500, innerLvl:1.10300, outerLvl:1.10700 };
  const pClose = pnlFor(closeT, 'fade', { costPct:0, slipPct:0 });
  ok('pnlFor marks undecided to close, not the full target', near(pClose, (1.10500-1.10490)/1.10*100, 1e-4) && pClose < 0.05);
  ok('pnlFor barrier win still credits the full target', near(pnlFor({...closeT, decidedBy:'barrier'}, 'fade', {costPct:0,slipPct:0}), (1.10500-1.10300)/1.10*100, 1e-4));

  // FIX 2 — expectancy gate: a cell that is STATISTICALLY significant (z>1.96, ~58%
  // reversion) but whose tiny TP/SL can't beat costs is SKIPPED (old z-only gate
  // would have traded it). "Significant ≠ profitable."
  const tight = [];
  for (let i=0;i<200;i++) tight.push({ date:'2020-01-0'+(i%9+1), open:1.10, side:'up', reverted:i<116, decidedBy:'barrier',
    closePx:1.10, level:1.10500, innerLvl:1.10486, outerLvl:1.10514, cell:'TIGHT', cost:0.012, slip:0.006 });
  const polTight = buildPolicy(tight, { minN:50 });
  ok('buildPolicy skips a significant cell whose edge < costs', polTight.TIGHT.decision==='skip' && polTight.TIGHT.z>1.96 && polTight.TIGHT.revRate>50);
}

console.log('[backtestStats]');
{
  const dates = Array.from({ length: 200 }, (_, i) => `20${20 + Math.floor(i/50)}-0${1+(i%9)}-0${1+(i%9)}`);
  const pnls  = Array.from({ length: 200 }, (_, i) => (i % 3 === 0 ? -0.5 : 0.4));   // ~67% win, +ve edge
  const s = backtestStats(pnls, dates, { mcRuns: 200, bootRuns: 200, seed: 1 });
  ok('backtestStats core fields present', ['sharpe','sortino','calmar','cagr','maxDD','profitFactor','payoff','winRate','expectancy','totalPnl'].every(k => k in s));
  ok('backtestStats winRate ≈ 0.667', near(s.winRate, 2/3, 0.02));
  ok('backtestStats totalPnl matches sum', near(s.totalPnl, pnls.reduce((a,b)=>a+b,0), 1e-6));
  ok('backtestStats maxDD ≤ 0 and DD duration ≥ 0', s.maxDD <= 0 && s.maxDDdur >= 0);
  ok('backtestStats bootstrap CI ordered (p5 ≤ p50 ≤ p95)', s.bootstrap.total.p5 <= s.bootstrap.total.p50 && s.bootstrap.total.p50 <= s.bootstrap.total.p95);
  ok('backtestStats MC drawdown percentiles present', 'p50' in s.montecarlo.maxDD && 'p95' in s.montecarlo.maxDD);
  ok('backtestStats deterministic under same seed', JSON.stringify(backtestStats(pnls, dates, { mcRuns: 200, bootRuns: 200, seed: 1 })) === JSON.stringify(s));
  ok('backtestStats empty → {trades:0}', backtestStats([], []).trades === 0);
  // portfolioStats: daily Sharpe ×√252; vol-target rescales but Sharpe is invariant.
  const daily = Array.from({ length: 252 }, (_, i) => (i % 4 === 0 ? -0.2 : 0.15));   // ~+ve daily series
  const ps = portfolioStats(daily, { targetVol: 10 });
  ok('portfolioStats Sharpe = mean/sd×√252', near(ps.sharpe, (daily.reduce((a,b)=>a+b,0)/daily.length)/Math.sqrt(daily.reduce((a,b)=>a+(b-(daily.reduce((x,y)=>x+y,0)/daily.length))**2,0)/daily.length)*Math.sqrt(252), 0.02));
  ok('portfolioStats Sharpe invariant to vol target (scale-free)', portfolioStats(daily,{targetVol:5}).sharpe === portfolioStats(daily,{targetVol:20}).sharpe);
  ok('portfolioStats annVol > 0 and vol-target set', ps.annVol > 0 && ps.volTarget.target === 10);
  ok('portfolioStats empty → {days:0}', portfolioStats([]).days === 0);
  ok('portfolioStats PSR present & in [0,1]', ps.psr >= 0 && ps.psr <= 1);
}

console.log('[runRigor]');
{
  // A persistent ~70%-reversion edge across pairs and time → walk-forward holds,
  // IS≈OOS, cost-stress decays but stays positive at 1×, per-year present.
  const mk=(date,rev)=>({date,open:1.10,line:'HL50_up',name:'HL50',side:'up',reverted:rev,decidedBy:'barrier',closePx:1.10,level:1.1050,innerLvl:1.1030,outerLvl:1.1070,cell:'HL50_up|3·spike'});
  const byPair={};
  for(const p of ['eurusd','gbpusd','usdjpy']){ const a=[];
    for(let d=0; d<900; d++){ const yr=2020+Math.floor(d/300); const mo=String(1+(Math.floor(d/25)%12)).padStart(2,'0'); const dd=String(1+(d%25)).padStart(2,'0');
      a.push(mk(`${yr}-${mo}-${dd}`, (d*7)%10<7)); } byPair[p]=a; }
  const rg=runRigor(byPair,{splitFrac:0.6,minN:30,folds:4,costByPair:{eurusd:0.005,gbpusd:0.005,usdjpy:0.005},slipByPair:{eurusd:0,gbpusd:0,usdjpy:0}});
  ok('runRigor returns walk-forward folds', rg.walkForward.folds.length>=1 && rg.walkForward.overall.days>0);
  ok('runRigor IS vs OOS with degradation ratio', rg.isVsOos.is.sharpe!==undefined && rg.isVsOos.oos.sharpe!==undefined && rg.isVsOos.degradation!=null);
  ok('runRigor cost-sensitivity decays with cost', rg.costSensitivity.length===3 && rg.costSensitivity[0].sharpe >= rg.costSensitivity[2].sharpe);
  ok('runRigor per-year present', rg.perYear.length>=1 && rg.perYear[0].year);
}

console.log(`\n${failures === 0 ? 'ALL PASSED ✓' : failures + ' CHECK(S) FAILED ✗'}`);
process.exit(failures === 0 ? 0 : 1);
