/**
 * VuManChu-Confirmed Fade — testing what the trader ACTUALLY does at the line.
 *
 * The blind mechanical fade (fade EVERY touch of the median/75th) is null. But a
 * discretionary trader doesn't fade every touch — they fade only when momentum is
 * SLOWING/TURNING at the line (VuManChu WaveTrend rolling over / crossing, VWAP
 * oscillator turning). That confirmation is the missing selector. This wires it in:
 *
 *   • find the first touch of each band (median up/dn, 75th up/dn) in a session
 *   • read WaveTrend AT the touch (causal — bars up to the touch only)
 *   • CONFIRMED fade = WT `agree` for the fade direction (overbought/turning-down at
 *     an upper band; oversold/turning-up at a lower band) — the exhaustion read
 *   • BLIND fade = every touch, regardless of WT (the null baseline)
 *   • fade to the OPEN, stop beyond the line; honest 1-min walk, SL-first, costed
 *
 * Reports CONFIRMED vs BLIND per band, IS/OOS, + a volatility-of-day split. A
 * positive confirmed edge that beats blind = the WT read adds real information.
 *
 * HONEST LIMITS: the exit is a fixed target(open)+stop — it does NOT model
 * discretionary exit management, so it UNDERSTATES a skilled trader. A null here
 * means "the mechanizable core has no edge", not "the trader has no edge".
 *
 * Reuses computeBands/volSigmaSeries (forecastCore), waveTrendReading/computeVWAP
 * (vumanchuCore), sessionsAt (fillRealismEngine), summarizeTrades. No new math.
 */
import { computeBands, volSigmaSeries } from './forecastCore.js';
import { waveTrendReading, computeVWAP } from './vumanchuCore.js';
import { summarizeTrades } from './metricsCore.js';
import { sessionsAt } from './fillRealismEngine.js';
import { DEFAULT_COST_PCT } from './perLineStrategy.js';

const _mean = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;
const _median = a => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const r3 = (x, d = 3) => x == null || !isFinite(x) ? null : +x.toFixed(d);

// One session, one band: first touch → WT read at touch → honest fade walk to open.
// Returns { pnl (net %), confirmed, vwapConfirmed } or null (no touch / too early).
function _fadeAtBand(bars, open, level, isUpper, sigma, minWtBars, stopMult, cost, wtOpts) {
  let touchIdx = -1;
  for (let k = 0; k < bars.length; k++) {
    if (isUpper ? bars[k].high >= level : bars[k].low <= level) { touchIdx = k; break; }
  }
  if (touchIdx < minWtBars || touchIdx >= bars.length - 1) return null;   // no touch, or too early for WT
  const upto = bars.slice(0, touchIdx + 1);
  const dir = isUpper ? 'SELL' : 'BUY';
  const wt = waveTrendReading(upto, { direction: dir, ...wtOpts });
  const confirmed = wt.agree === true;                                   // momentum turning in the fade direction
  // VWAP oscillator turning toward the fade (osc rolling over at an upper band, up at a lower)
  const osc = computeVWAP(upto).osc;
  const oL = osc[osc.length - 1] ?? 0, oP = osc[osc.length - 2] ?? oL;
  const vwapConfirmed = isUpper ? oL < oP : oL > oP;

  const entry = level;                                    // limit at the line
  const stopDist = stopMult * sigma * open;
  const stopPx = isUpper ? level + stopDist : level - stopDist;
  let pnlPrice = null;
  for (let k = touchIdx + 1; k < bars.length; k++) {
    const hitStop = isUpper ? bars[k].high >= stopPx : bars[k].low <= stopPx;
    const hitTgt = isUpper ? bars[k].low <= open : bars[k].high >= open;
    if (hitStop) { pnlPrice = -Math.abs(stopDist); break; }               // SL first (conservative)
    if (hitTgt) { pnlPrice = isUpper ? entry - open : open - entry; break; }
  }
  if (pnlPrice == null) { const last = bars.at(-1).close; pnlPrice = isUpper ? entry - last : last - entry; }       // mark to close
  return { pnl: pnlPrice / open * 100 - cost, confirmed, vwapConfirmed, signal: wt.signal };
}

function _blank() { return { pnls: [], wins: 0, n: 0 }; }
function _push(b, pnl) { b.pnls.push(pnl); b.n++; if (pnl > 0) b.wins++; }
function _summ(b, dates) {
  const s = summarizeTrades(b.pnls, dates || b.pnls.map((_, i) => `2020-01-${(i % 27) + 1}`));
  return { n: b.n, win: b.n ? r3(b.wins / b.n * 100, 1) : null, exp: r3(_mean(b.pnls), 4), sharpe: s.sharpe };
}

export function vumanchuFade(intraday, opts = {}) {
  const {
    pair = 'EURUSD', assetClass = 'fx', isFrac = 0.5, boundaryHour = 22, warmup = 40,
    minWtBars = 30, stopMult = 1.0, requireVwap = false,
  } = opts;
  const cost = opts.costPct ?? (DEFAULT_COST_PCT[assetClass] ?? 0.012);
  const sess = sessionsAt(intraday, boundaryHour);
  if (sess.length < 160) return { insufficient: true, nSessions: sess.length };
  const d1 = sess.map(s => ({ open: s.open, high: s.high, low: s.low, close: s.close }));
  const sig = volSigmaSeries(d1, assetClass);
  const sigMed = _median(sig.filter(x => x > 0));
  const split = Math.floor(sess.length * isFrac);

  // buckets: band(50/75) × {blind, confirmed} × seg(is/oos); + confirmed × vol(hi/lo) OOS
  const B = () => ({ blind: _blank(), confirmed: _blank() });
  const acc = { 50: { is: B(), oos: B() }, 75: { is: B(), oos: B() } };
  const volCut = { 50: { hi: _blank(), lo: _blank() }, 75: { hi: _blank(), lo: _blank() } };
  const dates = { 50: { is: { blind: [], confirmed: [] }, oos: { blind: [], confirmed: [] } }, 75: { is: { blind: [], confirmed: [] }, oos: { blind: [], confirmed: [] } } };

  for (let i = warmup; i < sess.length; i++) {
    const sigma = sig[i];
    if (!(sigma > 0)) continue;
    const s = sess[i];
    if (!s.bars || s.bars.length < minWtBars + 5 || !(s.open > 0)) continue;
    const bands = computeBands(s.open, sigma, assetClass);
    const seg = i < split ? 'is' : 'oos';
    const hiVol = sigma >= sigMed;
    const levels = [
      { band: 50, level: bands.up50, up: true }, { band: 50, level: bands.dn50, up: false },
      { band: 75, level: bands.up75, up: true }, { band: 75, level: bands.dn75, up: false },
    ];
    for (const L of levels) {
      const r = _fadeAtBand(s.bars, s.open, L.level, L.up, sigma, minWtBars, stopMult, cost, {});
      if (!r) continue;
      _push(acc[L.band][seg].blind, r.pnl); dates[L.band][seg].blind.push(s.date);
      const conf = r.confirmed && (!requireVwap || r.vwapConfirmed);
      if (conf) {
        _push(acc[L.band][seg].confirmed, r.pnl); dates[L.band][seg].confirmed.push(s.date);
        if (seg === 'oos') _push(volCut[L.band][hiVol ? 'hi' : 'lo'], r.pnl);
      }
    }
  }

  const pack = band => ({
    is: { blind: _summ(acc[band].is.blind, dates[band].is.blind), confirmed: _summ(acc[band].is.confirmed, dates[band].is.confirmed) },
    oos: { blind: _summ(acc[band].oos.blind, dates[band].oos.blind), confirmed: _summ(acc[band].oos.confirmed, dates[band].oos.confirmed) },
    oosVol: { hiVol: _summ(volCut[band].hi), loVol: _summ(volCut[band].lo) },
  });
  const median = pack(50), p75 = pack(75);
  // verdict: does the WT confirmation turn blind→positive AND beat blind, OOS, at either band?
  const lift = (b) => r3((b.oos.confirmed.exp ?? 0) - (b.oos.blind.exp ?? 0), 4);
  const confirms = b => (b.oos.confirmed.exp ?? -9) > 0 && (b.oos.confirmed.exp ?? -9) > (b.oos.blind.exp ?? 0) && b.oos.confirmed.n >= 30;

  return {
    pair, assetClass, isFrac, stopMult, cost, requireVwap,
    nSessions: sess.length, splitDate: sess[split]?.date,
    median, p75,
    lift: { median: lift(median), p75: lift(p75) },       // confirmed exp − blind exp, OOS
    edge: { median: confirms(median), p75: confirms(p75) },
  };
}
