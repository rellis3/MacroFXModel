/**
 * QLIKE per-line SHADOW ladders. Not live.
 *   fut: ladder-qlike-per-line (banked 2026-11-22), NQ / GC / 6E / 6J futures.
 *   cfd: ladder-qlike-per-line-cfd (2026-11-24), the OANDA CFDs.
 *
 * Jordan's method: each line (HL / OH / OL / OC / Close+ / Close-) gets the sigma model with the best out-of-sample
 * QLIKE for that line (2020 -> 2026-08), among the models the site can compute from OANDA (no IV feed yet). Widths are
 * fitted on that track's realised lines. Params: js/ladderV2QlikeParams.json (scripts/ladder-qlike-per-line/build_params.py)
 * and js/ladderV2QlikeCfdParams.json (scripts/ladder-qlike-per-line-cfd/build_params.py); js/ladderV2Qlike.test.mjs
 * checks each sigma against the Python for both.
 */
import { readFileSync, existsSync } from 'node:fs';
import { specSeries, sigmaForSession } from './ladderV2Shadow.js';

const load = f => { const u = new URL(f, import.meta.url); return existsSync(u) ? JSON.parse(readFileSync(u, 'utf8')) : { instruments: {} }; };
export const QPARAMS = load('./ladderV2QlikeParams.json');
export const QPARAMS_CFD = load('./ladderV2QlikeCfdParams.json');
const PT = track => (track === 'cfd' ? QPARAMS_CFD : QPARAMS);
// cup / cdn = Close+ / Close- (2026-11-24): where price closes on days that close above / below the London 00:00 open,
// each with its own QLIKE-best calc and widths fitted on that side's sessions (owner: each line keeps the calc with the
// best QLIKE for its purpose).
const QS = ['hl', 'oc', 'oh', 'ol', 'cup', 'cdn'];
const TAUS = ['50', '75', '90'];
const SQRT252 = Math.sqrt(252);

export const qlikeInstruments = (track = 'fut') => Object.keys(PT(track).instruments);
export const qlikeParams = (sym, track = 'fut') => PT(track).instruments[sym];

/** { arm: Map NY-close key -> sigma (daily %) for the next session } for every arm this instrument's lines use. */
export function qlikeSeries(sym, inp, track = 'fut') {
  const P = PT(track).instruments[sym];
  return Object.fromEntries(Object.entries(P.sigmas).map(([arm, spec]) => [arm, specSeries(spec, P, inp)]));
}

/** Per-session level object for the reversion page: rungs (% of open) per line from that line's own sigma. */
export function qlikeDayLevels(sym, series, session, track = 'fut') {
  const P = PT(track).instruments[sym];
  const s = {};
  for (const arm of Object.keys(P.sigmas)) s[arm] = sigmaForSession(series[arm], session);
  const o = { sigmas: {}, arms: {} };
  let asof = null;
  for (const q of QS) {
    if (!P.lines[q]) continue;
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
export function qlikeText(lv, session, track = 'fut') {
  const sl = new Date(session + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).replace(/,/g, '');
  const cfd = track === 'cfd';
  const out = ['**VOL & RANGE FORECAST — SHADOW QLIKE per-line ladder (not live)**',
    `**${cfd ? 'CFD (OANDA) charts' : 'Futures charts'} · For session: ${sl} (London 00:00–22:00)**`,
    `Each line uses the sigma model with the best QLIKE for that line on the ${cfd ? 'CFD' : 'futures'} (Jordan method).`, ''];
  for (const sym of qlikeInstruments(track)) {
    const o = lv[sym];
    out.push(div(sym));
    if (!o) { out.push('unavailable (no recent bars)', ''); continue; }
    for (const q of QS) {
      if (o[`${q}_p50`] == null) continue;
      out.push(`${LABEL[q].padEnd(24)}: ${o[`${q}_p50`].toFixed(2)}% median · ${o[`${q}_p75`].toFixed(2)}% 75th · ${o[`${q}_p90`].toFixed(2)}% 90th  [${o.arms[q]}, ${(o.sigmas[q] * SQRT252).toFixed(1)}% ann.]`);
    }
    out.push('');
  }
  return out.join('\n');
}
