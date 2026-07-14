/**
 * News-Exhaustion — does scheduled news predict FADE (revert at the median) vs
 * FOLLOW (blow through the 75th)? The one ex-ante, exogenous, non-circular
 * conditioning signal: the economic calendar is known before the session opens.
 *
 * Thesis (near-replicated, not folklore): high-impact news (Major tier — NFP/CPI/
 * FOMC/central-bank) drives volatility EXPANSION and directional CONTINUATION —
 * the trend day that blows through the median and 75th (you FOLLOW). Quiet, no-
 * news sessions are the range days that revert (you FADE). This buckets every
 * session by its in-session news and measures, per bucket:
 *   • reached75% — did the dominant excursion reach the 75th band (expansion)?
 *   • FADE expectancy/win  (limit at 75th → revert to open), costed
 *   • FOLLOW expectancy/win (break the 75th → continue), costed
 *   • k_fade — where the dominant reversal lands ÷ σ
 * IS/OOS split so a pattern isn't just in-sample. Reuses the exhaustion baseplate.
 *
 * Honest split (pre-registered): the CLASSIFIER (news → more continuation, less
 * reversion) is likely to show; whether the after-cost FADE/FOLLOW edge beats the
 * unconditional baseline is the harder question — news is exactly when spreads are
 * widest. Report both; let the numbers separate them.
 */
import { computeBands, simulateEntry, volSigmaSeries } from './forecastCore.js';
import { _zigzag } from './reversalPointResearch.js';
import { DEFAULT_SLIP_PCT } from './perLineStrategy.js';
import { sessionsAt } from './fillRealismEngine.js';
import { newsForWindow, pairCurrencies } from './newsCalendar.js';

const _sort = a => [...a].sort((x, y) => x - y);
const _median = a => { if (!a.length) return 0; const s = _sort(a); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const _mean = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;
const r3 = (x, d = 3) => x == null || !isFinite(x) ? null : +x.toFixed(d);
const _toMs = t => typeof t === 'number' ? (t < 1e12 ? t * 1000 : t) : Date.parse(t);

// The day's dominant one-directional reversal run (%), from the running extreme.
function _domRun(bars, open, thr) {
  let rl = bars[0].low, rh = bars[0].high, ptr = 0, dom = 0;
  for (const p of _zigzag(bars, thr).slice(1)) {
    while (ptr <= p.idx) { if (bars[ptr].low < rl) rl = bars[ptr].low; if (bars[ptr].high > rh) rh = bars[ptr].high; ptr++; }
    const re = p.kind === 'high' ? (p.price - rl) / open * 100 : (rh - p.price) / open * 100;
    if (re > dom) dom = re;
  }
  return dom;
}

function _blank() {
  return {
    n: 0, reached50: 0, reached75: 0, domOverSig: [],
    fadePnls: [], followPnls: [], fadeWins: 0, followWins: 0, fadeN: 0, followN: 0,           // 75th band
    fade50Pnls: [], follow50Pnls: [], fade50Wins: 0, follow50Wins: 0, fade50N: 0, follow50N: 0, // median band
  };
}
const _leg = (pnls, wins, n) => ({ exp: r3(_mean(pnls), 4), win: n ? r3(wins / n * 100, 1) : null, n });
function _summ(b) {
  return {
    n: b.n,
    reached50Pct: b.n ? r3(b.reached50 / b.n * 100, 1) : null,
    reached75Pct: b.n ? r3(b.reached75 / b.n * 100, 1) : null,
    kFade: b.domOverSig.length ? r3(_median(b.domOverSig), 2) : null,
    fade: _leg(b.fadePnls, b.fadeWins, b.fadeN), follow: _leg(b.followPnls, b.followWins, b.followN),          // 75th
    fade50: _leg(b.fade50Pnls, b.fade50Wins, b.fade50N), follow50: _leg(b.follow50Pnls, b.follow50Wins, b.follow50N), // median
  };
}

export function newsExhaustion(intraday, events, opts = {}) {
  const {
    pair = 'EURUSD', assetClass = 'fx', isFrac = 0.5, band = 'hl75', slMult = 1.5,
    boundaryHour = 22, warmup = 40, revFrac = 0.25,
  } = opts;
  const cPct = opts.costPct ?? 0.012, sPct = opts.slipPct ?? (DEFAULT_SLIP_PCT[assetClass] ?? 0.006);
  const ccys = pairCurrencies(pair);

  const sess = sessionsAt(intraday, boundaryHour);
  if (sess.length < 160) return { insufficient: true, nSessions: sess.length };
  const d1 = sess.map(s => ({ open: s.open, high: s.high, low: s.low, close: s.close }));
  const sig = volSigmaSeries(d1, assetClass);
  const split = Math.floor(sess.length * isFrac);
  const dayRangePx = d1.map(d => d.high - d.low).filter(x => x > 0);
  const thr = revFrac * _median(dayRangePx);

  const buckets = { is: { none: _blank(), minor: _blank(), major: _blank() }, oos: { none: _blank(), minor: _blank(), major: _blank() } };
  let majorSurprise = { is: _blank(), oos: _blank() }, majorInline = { is: _blank(), oos: _blank() };

  for (let i = warmup; i < sess.length; i++) {
    const sigma = sig[i];
    if (!(sigma > 0)) continue;
    const s = sess[i];
    if (!s.bars || s.bars.length < 6 || !(s.open > 0)) continue;
    const startMs = _toMs(s.bars[0].time), endMs = _toMs(s.bars.at(-1).time);
    const nw = newsForWindow(events, ccys, startMs, endMs);
    const seg = i < split ? 'is' : 'oos';
    const b = buckets[seg][nw.bucket];
    b.n++;

    const bands = computeBands(s.open, sigma, assetClass);
    const ext = Math.max(s.high - s.open, s.open - s.low) / s.open;   // max one-directional excursion (expansion)
    const dom = _domRun(s.bars, s.open, thr);            // dominant REVERSAL run (0 on pure-trend days = no fade-back)
    const sess1 = { open: s.open, bars: s.bars };
    // 75th and median band, fade + follow, all costed on the honest walker.
    const f75 = simulateEntry(sess1, bands, { band: 'hl75', action: 'fade', dir: 'both', slMult, costPct: cPct, slipPct: sPct, dynamicHL: true });
    const c75 = simulateEntry(sess1, bands, { band: 'hl75', action: 'follow', dir: 'both', slMult, costPct: cPct, slipPct: sPct, dynamicHL: true });
    const f50 = simulateEntry(sess1, bands, { band: 'hl50', action: 'fade', dir: 'both', slMult, costPct: cPct, slipPct: sPct, dynamicHL: true });
    const c50 = simulateEntry(sess1, bands, { band: 'hl50', action: 'follow', dir: 'both', slMult, costPct: cPct, slipPct: sPct, dynamicHL: true });

    const record = tgt => {
      tgt.n++;
      if (ext >= bands.hl50) tgt.reached50++;
      if (ext >= bands.hl75) tgt.reached75++;
      tgt.domOverSig.push(dom / (sigma * 100));
      if (f75.filled) { tgt.fadePnls.push(f75.pnlPct); tgt.fadeN++; if (f75.pnlPct > 0) tgt.fadeWins++; }
      if (c75.filled) { tgt.followPnls.push(c75.pnlPct); tgt.followN++; if (c75.pnlPct > 0) tgt.followWins++; }
      if (f50.filled) { tgt.fade50Pnls.push(f50.pnlPct); tgt.fade50N++; if (f50.pnlPct > 0) tgt.fade50Wins++; }
      if (c50.filled) { tgt.follow50Pnls.push(c50.pnlPct); tgt.follow50N++; if (c50.pnlPct > 0) tgt.follow50Wins++; }
    };
    record(b);
    if (nw.bucket === 'major') record((nw.surpSign !== 0 ? majorSurprise : majorInline)[seg]);
  }

  const packSeg = seg => ({ none: _summ(buckets[seg].none), minor: _summ(buckets[seg].minor), major: _summ(buckets[seg].major) });
  const is = packSeg('is'), oos = packSeg('oos');
  // Classifier verdict on OOS: does Major show MORE continuation than None?
  const contMore = (oos.major.reached75Pct ?? 0) - (oos.none.reached75Pct ?? 0);
  const contMore50 = (oos.major.reached50Pct ?? 0) - (oos.none.reached50Pct ?? 0);
  const followEdge = (oos.major.follow?.exp ?? 0) - (oos.none.follow?.exp ?? 0);
  const fadeEdge = (oos.none.fade?.exp ?? 0) - (oos.major.fade?.exp ?? 0);   // quiet days fade better?

  return {
    pair, assetClass, isFrac, band, slMult, nSessions: sess.length, splitDate: sess[split]?.date,
    is, oos,
    majorSurprise: { is: _summ(majorSurprise.is), oos: _summ(majorSurprise.oos) },
    majorInline: { is: _summ(majorInline.is), oos: _summ(majorInline.oos) },
    classifier: {
      reached50_majorMinusNone: r3(contMore50, 1),        // >0 ⇒ news days reach the MEDIAN more
      reached75_majorMinusNone: r3(contMore, 1),          // >0 ⇒ news days expand/continue past the 75th more
      followExp_majorMinusNone: r3(followEdge, 4),        // >0 ⇒ following pays more on news days
      fadeExp_noneMinusMajor: r3(fadeEdge, 4),            // >0 ⇒ fading pays more on quiet days
      // "signal present" = news days measurably more continuation-prone OOS
      signalPresent: contMore > 3 || followEdge > 0.005,
    },
  };
}
