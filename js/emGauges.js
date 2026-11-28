/**
 * Emerging-market gauges (plans/DESK_ANALYST_PIPELINE.md §9af): the few EM currencies that move G10 FX. They are
 * read, never traded: USD/CNH (China, the driver behind AUD and NZD), USD/MXN and USD/ZAR (the carry and risk-
 * appetite barometers: when they crack, risk-off is usually under way) and USD/TRY (an EM stress outlier).
 *
 * Per pair from OANDA daily closes: the move over 1, 5 and 20 days (USD/EM up = the EM currency weaker), 20-day
 * realised volatility, and the 5-day move as a z-score against the past year's 5-day moves. The EM stress gauge is
 * the mean z of MXN and ZAR (the carry pair), labelled calm / watch / stress.
 *
 * Pure. Tested in js/emGauges.test.mjs.
 */
export const EM_PAIRS = [
  { id: 'USDCNH', oanda: 'USD_CNH', label: 'USD/CNH', role: 'China: the yuan behind AUD and NZD' },
  { id: 'USDMXN', oanda: 'USD_MXN', label: 'USD/MXN', role: 'carry and risk appetite (the peso)' },
  { id: 'USDZAR', oanda: 'USD_ZAR', label: 'USD/ZAR', role: 'carry and risk appetite (the rand)' },
  { id: 'USDTRY', oanda: 'USD_TRY', label: 'USD/TRY', role: 'EM stress outlier (trending by policy)' },
];
const r2 = x => (Number.isFinite(x) ? +x.toFixed(2) : null);
const pct = (a, b) => (a > 0 && b > 0 ? (b / a - 1) * 100 : null);

/** closes: [{ date, close }] oldest first. */
export function gauge(closes) {
  const c = (closes ?? []).filter(x => x.close > 0);
  if (c.length < 30) return { ok: false, error: `only ${c.length} closes` };
  const last = c.at(-1), p = n => (c.length > n ? pct(c.at(-1 - n).close, last.close) : null);
  const lr = c.slice(1).map((x, i) => Math.log(x.close / c[i].close)), r20 = lr.slice(-20), m20 = r20.reduce((a, b) => a + b, 0) / r20.length;
  const vol20 = Math.sqrt(r20.reduce((a, b) => a + (b - m20) ** 2, 0) / (r20.length - 1)) * Math.sqrt(252) * 100;
  const five = []; for (let i = 5; i < c.length; i++) five.push(Math.log(c[i].close / c[i - 5].close));
  const hist = five.slice(-252, -1), mu = hist.reduce((a, b) => a + b, 0) / hist.length, sd = Math.sqrt(hist.reduce((a, b) => a + (b - mu) ** 2, 0) / (hist.length - 1));
  const z5 = sd > 0 ? (five.at(-1) - mu) / sd : null;
  return { ok: true, last: last.close, date: last.date, chg1d: r2(p(1)), chg5d: r2(p(5)), chg20d: r2(p(20)), vol20: r2(vol20), z5: r2(z5), spark: c.slice(-60).map(x => x.close) };
}

/** The set: { id: gauge } plus the EM stress read from MXN and ZAR. */
export function emGauges(byPair) {
  const out = {};
  for (const p of EM_PAIRS) out[p.id] = { ...p, ...(byPair[p.id] ? gauge(byPair[p.id]) : { ok: false, error: 'no prices' }) };
  const zs = ['USDMXN', 'USDZAR'].map(k => out[k]?.z5).filter(Number.isFinite), z = zs.length ? zs.reduce((a, b) => a + b, 0) / zs.length : null;
  const stress = z == null ? null : { z: r2(z), level: z >= 2 ? 'stress' : z >= 1 ? 'watch' : z <= -1 ? 'risk-on' : 'calm',
    read: z >= 2 ? 'the carry currencies are being sold hard: risk-off conditions' : z >= 1 ? 'the carry currencies are weakening faster than usual' : z <= -1 ? 'the carry currencies are rallying: risk appetite is strong' : 'nothing unusual in the carry currencies' };
  // the read is the MEAN of two 5-day z-scores: when MXN and ZAR point opposite ways, one of them alone made it, so the read says so
  // (review 2026-11-27: "weakening faster than usual" from USD/MXN z +1.9 while USD/ZAR was -0.9 and the live rows were firmer)
  const mx = out.USDMXN?.z5, za = out.USDZAR?.z5;
  if (stress && Number.isFinite(mx) && Number.isFinite(za) && Math.sign(mx) !== Math.sign(za) && Math.abs(mx - za) >= 1.5 && stress.level !== 'calm')
    stress.read = `mixed: ${mx > za ? 'MXN' : 'ZAR'} weaker (USD/${mx > za ? 'MXN' : 'ZAR'} z ${r2(Math.max(mx, za))}) while ${mx > za ? 'ZAR' : 'MXN'} is firmer (z ${r2(Math.min(mx, za))}); on the mean the carry pair reads ${stress.level}`;
  if (stress) { stress.horizon = '5-day move, daily closes'; stress.asOf = [out.USDMXN?.date, out.USDZAR?.date].filter(Boolean).sort().at(-1) ?? null; }
  return { pairs: out, stress, label: 'gauges the desk reads, not trades; USD/EM up = the EM currency weaker' };
}
