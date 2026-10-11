// Level scenarios — S3 shadow core (forge/LEVEL_SCENARIO_SHADOW_PREREG.md). Pure, no IO; used by level-scenarios.html and the
// server logger (js/levelScenarioShadowRoutes.js).
//
// For any level price: P(reach within 30m / 1h / 2h / 4h / by 22:00 London) from the frozen Phase 2 M1 model (calibrated
// geometry: distance in σ over the vol-time left, range used, extension side, hour, class), and for the nearest level above vs
// below the which-first answer b/(a+b). Level identity adds no reach information (Phase 2), so any level source can be scored.
// Reaction after a touch has no validated edge: callers must show it as ~50/50, never as a direction.
import { REACH_PARAMS } from './levelReachParams.js';

export const HORIZONS = [['30', 30], ['60', 60], ['120', 120], ['240', 240], ['end', null]];
export const END_MIN = 22 * 60;
const MAJORS = new Set(['EURUSD', 'GBPUSD', 'AUDUSD', 'NZDUSD', 'USDCAD', 'USDCHF', 'USDJPY']);
const INDICES = new Set(['NQ', 'SPX500', 'US30', 'US2000', 'DE30', 'UK100']);
export const classOfSym = s => INDICES.has(s) ? 'index' : s === 'GOLD' ? 'gold' : MAJORS.has(s) ? 'major' : 'cross';

const phi = x => { // standard normal CDF (Abramowitz-Stegun 7.1.26 via erf), |error| < 1.5e-7
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x / 2);
  return 0.5 * (1 + (x >= 0 ? y : -y));
};

// Share of the class's 24 h variance between two London minutes (hourly profile, linear within the hour).
export function vtShare(cls, fromMin, toMin, P = REACH_PARAMS) {
  const s = P.hour_shares[cls];
  if (!s || !(toMin > fromMin)) return 0;
  let v = 0;
  for (let h = Math.floor(fromMin / 60); h * 60 < toMin && h < 24; h++) {
    const a = Math.max(fromMin, h * 60), b = Math.min(toMin, h * 60 + 60);
    if (b > a) v += s[h] * (b - a) / 60;
  }
  return v;
}

// The fitted checkpoint hour used for the hour term: the latest of 03/07/10/13/16 at or before now (null before 03:00).
export const modelHour = (londonMin, P = REACH_PARAMS) => P.hours_fitted.filter(h => h * 60 <= londonMin).at(-1) ?? null;

// One horizon's M1 probability. d = |distance| in daily σ; v = vol-time share in the window.
export function reachP(hz, { d, v, used, ext, h, cls }, P = REACH_PARAMS) {
  const m = P.horizons[hz];
  if (!m || !(v > 0)) return null;
  const z = d / Math.sqrt(Math.max(v, 1e-6));
  const x = { z, lz: Math.log(Math.max(z, 1e-3)), lv: Math.log(Math.max(v, 1e-4)), used, ext: ext ? 1 : 0 };
  for (const k of P.hours_fitted) x[`h_${k}`] = h === k ? 1 : 0;
  for (const k of P.classes) x[`c_${k}`] = cls === k ? 1 : 0;
  let s = m.intercept;
  for (const f of P.features) s += m.coef[f] * x[f];
  return 1 / (1 + Math.exp(-s));
}
export const geometryP = (d, v) => (v > 0 ? Math.min(1 - 1e-4, Math.max(1e-4, 2 * (1 - phi(d / Math.sqrt(v))))) : null);

/**
 * The level set, as in Phase 2: forecast ladder O→H/O→L p50/p75/p90 (% of the London-midnight open), today's open, Asia high/low
 * (from 07:00), London high/low (from 12:00) and the structural confluence levels (production sessionConfluenceLevels via the
 * range_line_confluence artifact). bars = today's bars before now, oldest first; hourOf(bar) = London hour (fractional ok).
 */
export function buildLevels({ open, bars, hourOf, nowHour, ladderFlat, confLevels }) {
  const L = [];
  const lf = ladderFlat ?? {};
  for (const p of ['p50', 'p75', 'p90']) {
    if (Number.isFinite(lf[`oh_${p}`])) L.push({ price: open * (1 + lf[`oh_${p}`] / 100), family: 'ladder', label: `O→H ${p}` });
    if (Number.isFinite(lf[`ol_${p}`])) L.push({ price: open * (1 - lf[`ol_${p}`] / 100), family: 'ladder', label: `O→L ${p}` });
  }
  L.push({ price: open, family: 'open', label: 'London open', intraday: true });
  const asia = bars.filter(b => hourOf(b) < 7), ldn = bars.filter(b => hourOf(b) >= 7 && hourOf(b) < 12);
  if (nowHour >= 7 && asia.length) L.push({ price: Math.max(...asia.map(b => b.high)), family: 'asia', label: 'Asia high', intraday: true },
                                          { price: Math.min(...asia.map(b => b.low)), family: 'asia', label: 'Asia low', intraday: true });
  if (nowHour >= 12 && ldn.length) L.push({ price: Math.max(...ldn.map(b => b.high)), family: 'london', label: 'London high', intraday: true },
                                         { price: Math.min(...ldn.map(b => b.low)), family: 'london', label: 'London low', intraday: true });
  for (const l of confLevels ?? []) if (Number.isFinite(l.price)) L.push({ price: l.price, family: l.source ?? 'structural', label: l.source ?? 'structural' });
  return L;
}

/**
 * Score every level for one instrument now.
 * state: { sym, open (London-midnight open), price, high, low (since London midnight), sigmaDailyPct, londonMin }
 * levels: [{ price, family, label, intraday? }]   intraday = formed today (open / Asia / London refs): exempt from the
 *         "outside today's range" rule, as in Phase 2.
 * Returns { ok, why?, h, unit, used, D, levels:[{..., dist, side, eligible, why?, p:{30,60,120,240,end}, geo:{same}, geo_end}], race }.
 */
export function scenarios(state, levels, P = REACH_PARAMS) {
  const { sym, open, price, high, low, sigmaDailyPct, londonMin } = state;
  if (!(open > 0) || !(sigmaDailyPct > 0) || !Number.isFinite(price)) return { ok: false, why: 'no open / σ / price' };
  if (londonMin >= END_MIN) return { ok: false, why: 'session over (22:00 London)' };
  const cls = classOfSym(sym), h = modelHour(londonMin, P);
  const unit = sigmaDailyPct / 100 * open, used = (high - low) / unit, D = (price - open) / unit;
  const [dLo, dHi] = P.domain.dist_sigma;
  const out = (levels ?? []).filter(l => Number.isFinite(l.price)).map(l => {
    const dist = (l.price - price) / unit, d = Math.abs(dist), side = dist > 0 ? 'above' : 'below';
    const r = { ...l, dist, side, eligible: false, p: null, geo_end: null };
    if (!l.intraday && l.price <= high && l.price >= low) r.why = 'traded through today';
    else if (d < dLo) r.why = 'at price';
    else if (d > dHi) r.why = 'beyond 3σ';
    else if (h == null) r.why = 'model starts 03:00 London';
    else r.eligible = true;
    if (!r.eligible) return r;
    const ext = Math.sign(dist) === Math.sign(D);
    r.p = {}; r.geo = {};
    for (const [hz, mins] of HORIZONS) {
      const v = vtShare(cls, londonMin, mins == null ? END_MIN : Math.min(END_MIN, londonMin + mins), P);
      r.p[hz] = reachP(hz, { d, v, used, ext, h, cls }, P);
      r.geo[hz] = geometryP(d, v);
    }
    r.geo_end = r.geo.end;
    return r;
  }).sort((a, b) => b.price - a.price);
  const el = out.filter(r => r.eligible);
  const up = el.filter(r => r.side === 'above').sort((a, b) => a.dist - b.dist)[0] ?? null;
  const dn = el.filter(r => r.side === 'below').sort((a, b) => b.dist - a.dist)[0] ?? null;
  const race = up && dn ? { up: up.price, down: dn.price, a: up.dist, b: -dn.dist, pUpFirst: -dn.dist / (up.dist - dn.dist) } : null;
  return { ok: true, sym, cls, h, unit, used, D, levels: out, race };
}
