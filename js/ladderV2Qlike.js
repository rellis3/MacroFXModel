/**
 * QLIKE per-line SHADOW ladder (ladder-qlike-per-line, banked 2026-11-22). Futures track only. Not live.
 *
 * Jordan's method: each line (HL / OH / OL) gets the sigma model with the best out-of-sample QLIKE on the futures
 * (NQ / GC / 6E / 6J, 2020 -> 2026-08), among the models the site can compute from OANDA (no IV feed yet). OC, Close+
 * and Close- each have their own QLIKE race too. Widths are fitted on the futures' realised ranges. Params: js/ladderV2QlikeParams.json, written by
 * scripts/ladder-qlike-per-line/build_params.py; js/ladderV2Qlike.test.mjs checks each sigma against the Python.
 */
import { readFileSync } from 'node:fs';
import { specSeries, sigmaForSession } from './ladderV2Shadow.js';

export const QPARAMS = JSON.parse(readFileSync(new URL('./ladderV2QlikeParams.json', import.meta.url), 'utf8'));
// cup / cdn = Close+ / Close- (2026-11-24): where price closes on days that close above / below the London 00:00 open,
// each with its own QLIKE-best calc and widths fitted on that side's sessions (close_race.py; owner: each line keeps the
// calc with the best QLIKE for its purpose).
const QS = ['hl', 'oc', 'oh', 'ol', 'cup', 'cdn'];
const TAUS = ['50', '75', '90'];
const SQRT252 = Math.sqrt(252);

export const qlikeInstruments = () => Object.keys(QPARAMS.instruments);

/** { arm: Map NY-close key -> sigma (daily %) for the next session } for every arm this instrument's lines use. */
export function qlikeSeries(sym, inp) {
  const P = QPARAMS.instruments[sym];
  return Object.fromEntries(Object.entries(P.sigmas).map(([arm, spec]) => [arm, specSeries(spec, P, inp)]));
}

/** Per-session level object for the reversion page: rungs (% of open) per line from that line's own sigma. */
export function qlikeDayLevels(sym, series, session) {
  const P = QPARAMS.instruments[sym];
  const s = {};
  for (const arm of Object.keys(P.sigmas)) s[arm] = sigmaForSession(series[arm], session);
  const o = { sigmas: {}, arms: {} };
  let asof = null;
  for (const q of QS) {
    const arm = P.lines[q].arm, v = s[arm];
    if (!v) return null;
    asof = asof && asof > v.asof ? asof : v.asof;
    o.sigmas[q] = v.sigma; o.arms[q] = arm;
    for (const t of TAUS) o[`${q}_p${t}`] = P.widths[q][t] * v.sigma;
  }
  o.sigma = o.sigmas.oh;
  o.zone50_pct = P.zone_sigma[0] * o.sigma;
  o.zone75_pct = P.zone_sigma[1] * o.sigma;
  o.odds = P.odds;
  o.asof = asof;
  return o;
}

const LABEL = { hl: 'High to Low range', oc: 'Open to Close move', oh: 'Open High (upside)', ol: 'Open Low  (downside)',
  cup: 'Close+ (close above open)', cdn: 'Close- (close below open)' };
const div = name => { const pre = `──── ${name} `; return pre + '─'.repeat(Math.max(0, 30 - pre.length)); };

/** Paste text: one block per instrument, each line with its own model. lv = { SYM: qlikeDayLevels(...) | null }. */
export function qlikeText(lv, session) {
  const sl = new Date(session + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).replace(/,/g, '');
  const out = ['**VOL & RANGE FORECAST — SHADOW QLIKE per-line ladder (not live)**',
    `**Futures charts · For session: ${sl} (London 00:00–22:00)**`,
    'Each line uses the sigma model with the best QLIKE for that line on the futures (Jordan method).', ''];
  for (const sym of qlikeInstruments()) {
    const o = lv[sym];
    out.push(div(sym));
    if (!o) { out.push('unavailable (no recent bars)', ''); continue; }
    for (const q of QS) {
      out.push(`${LABEL[q].padEnd(24)}: ${o[`${q}_p50`].toFixed(2)}% median · ${o[`${q}_p75`].toFixed(2)}% 75th · ${o[`${q}_p90`].toFixed(2)}% 90th  [${o.arms[q]}, ${(o.sigmas[q] * SQRT252).toFixed(1)}% ann.]`);
    }
    out.push('');
  }
  return out.join('\n');
}
