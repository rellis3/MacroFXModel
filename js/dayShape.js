/**
 * The shape of the day: how big, what is scheduled, where the market stands against its own history, and which warning is nearest to firing.
 *
 * Replaces the 0-of-5 risk dial on Atlas. Every item is a measured size, a schedule or a position in the market's own record. Nothing here says
 * which way a market goes. The evidence score per market (js/directionScore.js) is carried through untouched as small chips.
 *
 * Pure. Tested in js/dayShape.test.mjs.
 */
import { eventPast } from './newsletterToday.js';

const num = v => (Number.isFinite(v) ? v : null);
export const SIZE_KEYS = [['NQ', 'Nasdaq'], ['SPX500', 'S&P 500'], ['GOLD', 'Gold'], ['EURUSD', 'EUR/USD'], ['GBPUSD', 'GBP/USD'], ['USDJPY', 'USD/JPY']];

/** Where `v` sits in the last `n` non-empty values of `series`, 0 to 100 (the share of days at or below it). Null when fewer than 60 values. */
export function percentileIn(series, n = 252) {
  const a = (series ?? []).filter(x => num(x) !== null).slice(-n);
  if (a.length < 60) return null;
  const v = a[a.length - 1];
  return Math.round(100 * a.filter(x => x <= v).length / a.length);
}

/** Plain size word from the percentile of the day's expected range among the last year's days. */
export function sizeWord(volPct) {
  if (num(volPct) === null) return '';
  return volPct >= 80 ? 'wide' : volPct >= 60 ? 'above normal' : volPct > 40 ? 'normal' : volPct > 20 ? 'below normal' : 'narrow';
}

/** One row per main market: the expected high-low range today (median), the mark one day in four goes past, and its place among the last year's days. */
export function sizeRows({ instruments, fc, sess }) {
  return SIZE_KEYS.map(([key, label]) => {
    const bi = instruments?.[key], fi = fc?.instruments?.[key], si = sess?.instruments?.[key];
    const hlMed = num(bi?.levels?.hl_med?.pct ?? fi?.hl_median), hl75 = num(bi?.levels?.hl_75?.pct ?? fi?.hl_75), volPct = num(bi?.vol_pct ?? fi?.vol_pct);
    const used = num(si?.hl) !== null && hlMed ? si.hl / hlMed : null;
    return hlMed === null ? null : { key, label, hlMed, hl75, volPct, word: sizeWord(volPct), used: used === null ? null : Math.round(used * 100) };
  }).filter(Boolean);
}

/** Today's high-impact releases and decisions (next `withinHours`), each with what the Release Reaction record says the same kind of event did. */
export function clockRows({ events, eventDay, nowMs = Date.now(), withinHours = 24, max = 5 }) {
  const cut = nowMs + withinHours * 3.6e6;
  return (events ?? []).filter(e => num(e.ms) !== null && e.ms > nowMs - 1800e3 && e.ms <= cut && String(e.impact).toLowerCase() === 'high')
    .sort((a, b) => a.ms - b.ms).slice(0, max)
    .map(e => ({ ms: e.ms, ccy: e.ccy ?? '', name: e.event, past: eventPast(e, eventDay) }));
}

/** The market against its own last year: VIX level, near-term against 3-month fear, junk-bond spread, 2s10s curve. Each is a position 0 to 100 plus the plain value. */
export function stateRows({ drill, flags }) {
  const S = drill?.series ?? {}, out = [];
  const vix = percentileIn(S.vix), last = k => { const a = (S[k] ?? []).filter(x => num(x) !== null); return a.length ? a[a.length - 1] : null; };
  if (vix !== null) out.push({ key: 'vix', label: 'VIX, market fear', pct: vix, text: `${last('vix').toFixed(1)}, higher than ${vix}% of the last year's days` });
  const term = (flags ?? []).find(f => f.key === 'vix_term' && num(f.value) !== null);
  if (term) out.push({ key: 'term', label: 'Near-term fear vs 3-month', pct: Math.max(0, Math.min(100, Math.round(term.value * 100))), text: `${term.value.toFixed(2)}, 1.00 is the line where near-term fear passes 3-month` });
  const hy = percentileIn(S.hy);
  if (hy !== null) out.push({ key: 'hy', label: 'Junk-bond spread', pct: hy, text: `${(last('hy') * 100).toFixed(0)}bp, wider than ${hy}% of the last year` });
  // 10-year minus 2-year yield, on the dates both printed (the bundle carries the two yields, not the spread)
  const a10 = S.us10y ?? [], a2 = S.us2y ?? [], spread = a10.map((v, i) => (num(v) !== null && num(a2[i]) !== null ? v - a2[i] : null));
  const cur = percentileIn(spread);
  if (cur !== null) out.push({ key: 'curve', label: '2s10s yield curve', pct: cur, text: `${(spread.filter(x => x !== null).at(-1) * 100).toFixed(0)}bp, steeper than ${cur}% of the last year` });
  return out;
}

/** The one or two risk flags nearest to their trigger, from flagProximity(); a flag that is on counts as nearest. */
export function closestFlags(prox, n = 2) {
  return [...(prox ?? [])].sort((a, b) => (b.on - a.on) || (b.share - a.share)).slice(0, n);
}

export function dayShape({ instruments, fc, sess, events, eventDay, drill, rf, prox, scores, nowMs = Date.now() } = {}) {
  const active = num(rf?.active) ?? 0, total = num(rf?.available ?? rf?.total) ?? 0;
  return {
    size: sizeRows({ instruments, fc, sess }),
    clock: clockRows({ events, eventDay, nowMs }),
    state: stateRows({ drill, flags: rf?.flags }),
    closest: closestFlags(prox),
    badge: rf ? `${active}/${total} flags` : '',
    scores: (scores ?? []).map(s => ({ sym: s.sym, label: s.label, score: s.score, band: s.band })),
  };
}
