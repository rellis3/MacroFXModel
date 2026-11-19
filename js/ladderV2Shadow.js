/**
 * ladder-v2 SHADOW ladder + exhaustion zones — the site port of scripts/ladder-v2/export_shadow.py and
 * export_exhaustion.py. Pure functions; the route (js/ladderV2ShadowRoutes.js) fetches the OANDA bars.
 *
 * Per instrument (banked 2026-11-19: ladder-v2-nq / -gold / -eurusd, exhaustion-v2-*, reversal-zones):
 *   NQ      sigma = har_rv_log on NY-close daily bars (OANDA, from 2016-01-04); futures reuse the CFD widths
 *   GOLD    sigma = HAR-CJ on OANDA 5-minute RV; CFD widths, and CME GC widths fitted on the same spot sigma
 *   EURUSD  sigma = HAR-CJ on OANDA 5-minute RV; 6E reuses the CFD widths
 * Fixed parts (coefficients, widths, zones, odds) live in js/ladderV2Params.json, written by
 * scripts/ladder-v2/build_params.py. js/ladderV2Shadow.test.mjs checks sigma against the Python on a frozen fixture.
 * SHADOW ONLY: nothing live reads this.
 */
import { readFileSync } from 'node:fs';
import { harRvLogSigma } from './forecastSigma.js';

export const PARAMS = JSON.parse(readFileSync(new URL('./ladderV2Params.json', import.meta.url), 'utf8'));
const SQRT252 = Math.sqrt(252);
const QS = ['hl', 'oc', 'oh', 'ol'];
const TAUS = ['50', '75', '90'];
const LABEL = { hl: ['High to Low range', '75th Percentile'], oc: ['Open to Close move', '75th Percentile'],
                oh: ['Open High (upside)', '75th'], ol: ['Open Low  (downside)', '75th'] };

const _nyFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
/** NY-close day key (YYYY-MM-DD): the date of (New York wall-clock time + 7h), as ladder.ny_bars. */
export function nyKey(sec) {
  const p = Object.fromEntries(_nyFmt.formatToParts(new Date(sec * 1000)).map(x => [x.type, x.value]));
  const wall = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) + 7 * 3600e3;
  return new Date(wall).toISOString().slice(0, 10);
}
const weekday = key => { const d = new Date(key + 'T12:00:00Z').getUTCDay(); return d >= 1 && d <= 5; };

/** London session the export is for: today, or the next weekday after 22:00 London. */
export function sessionDate(ms = Date.now()) {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' });
  const p = Object.fromEntries(f.formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  const d = new Date(Date.UTC(+p.year, +p.month - 1, +p.day));
  if (+p.hour >= 22) d.setUTCDate(d.getUTCDate() + 1);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** NQ: har_rv_log forecast for the session from NY-close daily bars [{key, open, high, low, close}] (daily %). */
export function nqSigma(d1, session) {
  const bars = d1.filter(b => b.key >= PARAMS.instruments.NQ.har_start && b.key < session && weekday(b.key));
  if (bars.length < 300) return null;
  const last = bars[bars.length - 1];
  // the estimator stores the forecast for bar i+1 at slot i: append a placeholder bar for the session
  const x = [...bars, { open: last.close, high: last.close, low: last.close, close: last.close }];
  const s = harRvLogSigma(x)[bars.length - 1];
  return Number.isFinite(s) ? { sigma: s / SQRT252, asof: last.key } : null;
}

/** GOLD / EURUSD: HAR-CJ forecast for the session from 5-minute mid closes [[sec, close], ...] (daily %). */
export function harcjSigma(sym, m5, session) {
  const P = PARAMS.instruments[sym];
  const days = new Map();
  let prevKey = null, prevC = null;
  for (const [t, c] of m5) {
    const k = nyKey(t);
    if (k !== prevKey) { prevKey = k; prevC = c; if (!days.has(k)) days.set(k, { rv: 0, bv: 0, lastAbs: null }); continue; }
    const r = Math.log(c / prevC); prevC = c;
    const d = days.get(k);
    d.rv += r * r;
    if (d.lastAbs !== null) d.bv += (Math.PI / 2) * Math.abs(r) * d.lastAbs;
    d.lastAbs = Math.abs(r);
  }
  const keys = [...days.keys()].filter(k => weekday(k) && days.get(k).rv > 0).sort();
  const C = [], J = [];
  for (const k of keys) {
    const { rv, bv } = days.get(k);
    const c = bv > 0 ? Math.min(rv, bv) : rv;
    C.push(c); J.push(Math.max(rv - c, 0));
  }
  const mean = (a, i, n) => { let s = 0; for (let j = i - n + 1; j <= i; j++) s += a[j]; return s / n; };
  let idx = -1;
  for (let i = 0; i < keys.length; i++) if (keys[i] < session) idx = i;
  if (idx < 21) return null;
  const x = [1, Math.log(C[idx]), Math.log(mean(C, idx, 5)), Math.log(mean(C, idx, 22)), Math.log1p(J[idx] / C[idx])];
  const z = x.reduce((s, v, i) => s + v * P.coef[i], 0);
  return { sigma: Math.sqrt(Math.exp(z + P.s2 / 2)) * 100, asof: keys[idx] };
}

/** Rungs (% of the London-midnight open) for one instrument and track. */
export function ladderFor(sym, track, sigma) {
  const w = PARAMS.instruments[sym][track].widths;
  return Object.fromEntries(QS.map(q => [q, Object.fromEntries(TAUS.map(t => [t, w[q][t] * sigma]))]));
}

const div = name => { const pre = `──── ${name} `; return pre + '─'.repeat(Math.max(0, 30 - pre.length)); };
const sessLabel = s => new Date(s + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).replace(/,/g, '');

function forecastBlock(name, sigma, L) {
  const out = [div(name), `Volatility (annualized) : ${(sigma * SQRT252).toFixed(2)}%`];
  for (const q of QS) {
    const [lab, w75] = LABEL[q];
    out.push(`${lab.padEnd(24)}: ${L[q]['50'].toFixed(2)}% median · ${L[q]['75'].toFixed(2)}% ${w75} · ${L[q]['90'].toFixed(2)}% 90th`);
  }
  return out;
}

function exhaustionBlock(name, sym, sigma, L) {
  const P = PARAMS.instruments[sym];
  const [z50, z75] = P.zone_sigma;
  const out = [div(name), `Sigma daily             : ${sigma.toFixed(3)}%`,
    `Zone past line          : ${(z50 * sigma).toFixed(3)}% median · ${(z75 * sigma).toFixed(3)}% 75th  (${z50.toFixed(2)}σ · ${z75.toFixed(2)}σ)`,
    `Time buckets (London)   : ${PARAMS.buckets_london.join(' · ')}`];
  for (const [side, q] of [['OH', 'oh'], ['OL', 'ol']]) {
    for (const t of TAUS) {
      const word = t === '90' ? '+0.25σ' : 'next';
      const od = P.odds[t].map(v => `${Math.round(v)}%`).join(' · ');
      out.push(`${`${side} p${t}`.padEnd(24)}: ${L[q][t].toFixed(2)}% | ${word} ${od}`);
    }
  }
  return out;
}

/**
 * Build the paste text. sigmas = { NQ: {sigma, asof}, GOLD: {...}, EURUSD: {...} } (daily %).
 * kind: 'forecast' | 'exhaustion'; track: 'cfd' | 'fut'.
 */
export function buildText(kind, track, sigmas, session) {
  const order = ['GOLD', 'EURUSD', 'NQ'];
  const head = kind === 'forecast'
    ? ['**VOL & RANGE FORECAST — SHADOW ladder-v2 (not live)**',
       `**${track === 'fut' ? 'Futures charts · ' : ''}For session: ${sessLabel(session)} (London 00:00–22:00)**`,
       'Event bucket: not applied (shadow σ, no event multiplier)', '']
    : ['**EXHAUSTION ZONES — SHADOW ladder-v2 (not live)**',
       `**${track === 'fut' ? 'Futures charts · ' : ''}For session: ${sessLabel(session)} (London 00:00–22:00)**`,
       'Zone = how far price typically runs past a line before its first 0.25σ pullback (any level, not a line effect).',
       'Odds = chance a line touched in that time bucket goes on to the next line (p90: a further 0.25σ).', ''];
  const lines = [...head];
  for (const sym of order) {
    const s = sigmas[sym];
    if (!s || !Number.isFinite(s.sigma)) { lines.push(div(sym), 'unavailable (no recent bars)', ''); continue; }
    const L = ladderFor(sym, track, s.sigma);
    lines.push(...(kind === 'forecast' ? forecastBlock(sym, s.sigma, L) : exhaustionBlock(sym, sym, s.sigma, L)), '');
  }
  return lines.join('\n');
}
