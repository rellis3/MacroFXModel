/**
 * The market-state strips: a row of small blocks, one per hour (or per day), coloured quiet or active. Shared by today.html's pair cards and
 * drawer and by the newsletter's market cards, so a market looks the same wherever it appears.
 *
 * READ IT LITERALLY. Quiet and active are the two states of a model fitted on return VARIANCE (hmm.js): active means the tape has been moving
 * more than usual, quiet means less. They say nothing about which way price is going. A fainter block means the model was less sure that hour.
 * A grey block means no reading (market closed, or the hour was not recorded). Descriptive; nothing here forecasts anything.
 *
 * Input shapes (what /api/hmm-hourly and /api/hmm-daily-history return):
 *   hourly: { t0: '2026-10-21T08', s: 'qqqaaq.q', p: [97, 95, 71, ...] }       one character per hour from t0
 *   daily:  'qqq.qqqqa..aqq'  (one character per day)
 *
 * Pure: no DOM, no clock. Tested in js/stateStrip.test.mjs.
 */
export const COLOUR = { quiet: '#7fa8e6', active: '#e8a31a', none: '#cfd6e2' };
const NAME = { q: 'quiet', a: 'active' };
const hourStamp = (t0, i) => new Date(Date.parse(t0 + ':00:00Z') + i * 3.6e6).toISOString().slice(0, 13).replace('T', ' ') + ':00 UTC';

/** The last `hours` characters of an hourly entry, as [{ ch, p, at }]. */
export function lastHours(e, hours) {
  if (!e?.s) return [];
  const n = e.s.length, from = Math.max(0, n - hours);
  return Array.from({ length: n - from }, (_, k) => ({ ch: e.s[from + k], p: e.p?.[from + k] ?? 0, at: hourStamp(e.t0, from + k) }));
}

/** Blocks as SVG. `cells` = [{ ch, p, at }]. Opacity follows how sure the model was (hourly only: pass p). */
export function stripSvg(cells, { bw = 5, bh = 9, gap = 1, titles = true, label = '' } = {}) {
  if (!cells.length) return '';
  const w = cells.length * (bw + gap) - gap, rects = cells.map((c, i) => {
    const col = c.ch === 'q' ? COLOUR.quiet : c.ch === 'a' ? COLOUR.active : COLOUR.none, op = c.ch === 'q' || c.ch === 'a' ? (c.p != null && c.p > 0 ? 0.4 + 0.6 * Math.min(100, c.p) / 100 : 1) : 0.7;
    const tip = titles ? `<title>${c.at ?? ''} ${c.ch === 'q' || c.ch === 'a' ? NAME[c.ch] + (c.p ? ', ' + c.p + '% sure' : '') : 'no reading'}</title>` : '';
    return `<rect x="${i * (bw + gap)}" y="0" width="${bw}" height="${bh}" rx="1.2" fill="${col}" fill-opacity="${op.toFixed(2)}">${tip}</rect>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${bh}" width="${w}" height="${bh}" role="img" aria-label="${label || 'market state strip'}" style="display:block;max-width:100%">${rects}</svg>`;
}
export const hourlyStripSvg = (e, hours = 24, opts = {}) => stripSvg(lastHours(e, hours), { label: `Hourly market state, last ${hours} hours`, ...opts });
export const dailyStripSvg = (s, opts = {}) => stripSvg([...(s ?? '')].map(ch => ({ ch, p: null, at: null })), { bw: 8, gap: 1.5, titles: false, label: 'Daily market state, last 30 days', ...opts });

/** One line about a stretch of hours: share active, and how often the state changed. null when there is nothing known. */
export function summarize(e, hours) {
  const known = lastHours(e, hours).filter(c => c.ch === 'q' || c.ch === 'a');
  if (!known.length) return null;
  let flips = 0; for (let i = 1; i < known.length; i++) if (known[i].ch !== known[i - 1].ch) flips++;
  const act = known.filter(c => c.ch === 'a').length, now = known.at(-1);
  return { hours: known.length, activeShare: Math.round(100 * act / known.length), flips, now: NAME[now.ch], nowProb: now.p };
}
/** Plain words for the summary. */
export function summaryWords(sm, hours) {
  if (!sm) return '';
  return `Last ${sm.hours} of ${hours} hours known: active ${sm.activeShare}% of the time, changed state ${sm.flips} time${sm.flips === 1 ? '' : 's'}.`;
}
/** The pill text. kind: 'Daily' | 'Hourly'. */
export const pillWords = (kind, state, prob) => `${kind} model: ${state}${prob ? `, ${prob}% sure` : ''}`;
