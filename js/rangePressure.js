/**
 * The range-pressure gauge: how many of the desk's VALIDATED "the next days run wider than usual" signals are on today.
 *
 * Every trigger below is a finding in the evidence ledger (js/deskEvidence.js) with a range verdict of validated, and each is worded as exactly what was
 * tested: the SIZE of the coming move, never its direction. Together they answer one question a reader of the daily issue cares about: is today set up
 * to be a bigger day than the forecast ranges assume? Five triggers, each with its ledger id:
 *
 *   vix-inversion        VIX at or above the 3-month VIX: the next five sessions ran wider (SPX +0.76 ATR, NAS100 +0.82 on 86 entries since 2008)
 *   vol-curve-front      VIX9D / VIX at or above 0.9669 (cut-offs fixed in advance; below 0.8858 is the calm side): the production index lines are too tight today
 *   drawdown-forecast-*  S&P 500 down more than 2% over the last 20 sessions: FX and index ranges ran about 7% above the forecast
 *   nq-down-week         Nasdaq down 1% or more over the last 5 sessions: the next session ran wider (+0.2 ATR)
 *   mv-dispersion-range  CBOE dispersion at or above its 95th percentile: the next month ran wider (+0.5 ATR, 9 firings)
 *
 * What it does not do: it does not say which way, it does not size anything, and a zero count means "no validated reason to expect more than the
 * usual", not "a quiet day". Two caveats travel with the rows: inversions are brief and the effect is documented for the FIRST day; dispersion is
 * measured here over the six years the market bundle holds, the test used history since 2014.
 *
 * Pure: no fetch, no DOM, no clock. Tested in js/rangePressure.test.mjs.
 */
const fin = v => v != null && Number.isFinite(v);
const lastN = (a, n) => { const out = []; for (let i = a.length - 1; i >= 0 && out.length < n; i--) if (fin(a[i])) out.unshift(a[i]); return out; };
const pctChange = (a, sessions) => { const v = lastN(a, sessions + 1); return v.length === sessions + 1 && v[0] ? (v.at(-1) / v[0] - 1) * 100 : null; };
const pctRank = (a, x) => { const v = a.filter(fin); return v.length >= 200 && fin(x) ? v.filter(y => y <= x).length / v.length : null; };

/** s = { vix, vix3m, vix9d, spx, nq, dspx }: each an array of daily values (oldest first, nulls allowed). Returns { n, on, rows }. */
export function rangePressure(s) {
  const vix = lastN(s.vix ?? [], 1)[0], v3 = lastN(s.vix3m ?? [], 1)[0], v9 = lastN(s.vix9d ?? [], 1)[0];
  const spx20 = pctChange(s.spx ?? [], 20), nq5 = pctChange(s.nq ?? [], 5), dsp = lastN(s.dspx ?? [], 1)[0], dspPct = pctRank(s.dspx ?? [], dsp);
  const rows = [];
  const add = (key, evidence, label, value, on, effect, extra = {}) => rows.push({ key, evidence, label, value, on, effect, ...extra });

  add('vixInversion', 'vix-inversion', 'Near-term fear above 3-month fear', fin(vix) && fin(v3) ? `VIX ${vix.toFixed(1)} against 3-month ${v3.toFixed(1)}` : null, fin(vix) && fin(v3) ? vix >= v3 : null,
    'After the VIX moves above its 3-month level, the next five sessions have run wider than usual. This is documented for the first day of an inversion.');
  const ratio = fin(v9) && fin(vix) && vix > 0 ? v9 / vix : null;
  add('frontDear', 'vol-curve-front', 'Very short-term fear priced high', ratio != null ? `9-day VIX is ${ratio.toFixed(2)} times the 1-month VIX` : null, ratio != null ? ratio >= 0.9669 : null,
    'When the 9-day VIX is close to or above the 1-month VIX, the usual index range lines have been too tight for the day. A low ratio (under 0.89) means the opposite.',
    { calm: ratio != null && ratio < 0.8858 });
  add('spxFall', 'drawdown-forecast-error-fx', 'S&P 500 down more than 2% over 20 sessions', spx20 != null ? `S&P 500 ${spx20 >= 0 ? '+' : ''}${spx20.toFixed(1)}% over 20 sessions` : null, spx20 != null ? spx20 <= -2 : null,
    'After a fall like this, FX and index ranges have run about 7% bigger than the forecast.');
  add('nqWeek', 'nq-down-week', 'Nasdaq down 1% or more over 5 sessions', nq5 != null ? `Nasdaq ${nq5 >= 0 ? '+' : ''}${nq5.toFixed(1)}% over 5 sessions` : null, nq5 != null ? nq5 <= -1 : null,
    'After a down week for the Nasdaq, the next session has run wider than usual.');
  add('dispersion', 'mv-dispersion-range', 'Crowded market (dispersion index very high)', dspPct != null ? `Dispersion ${dsp.toFixed(1)}, higher than ${Math.round(dspPct * 100)}% of the last six years` : null, dspPct != null ? dspPct >= 0.95 : null,
    'When money crowds into a few names, the next month has run wider than usual. Measured over six years here; the original test used data back to 2014.');
  const known = rows.filter(r => r.on != null);
  return { n: known.length, on: known.filter(r => r.on).length, calmFront: !!rows.find(r => r.key === 'frontDear')?.calm, rows };
}

/** One honest sentence for the count. */
export function pressureWords(p) {
  if (!p || !p.n) return 'Not enough data to read the range signals today.';
  if (!p.on) return `None of the ${p.n} validated range signals is on today${p.calmFront ? ', and the very short-term fear gauge is low, which has gone with narrower days' : ''}. That means no validated reason to expect more than the usual range, not that the day will be quiet.`;
  return `${p.on} of ${p.n} validated range signals ${p.on === 1 ? 'is' : 'are'} on today. Each has gone with bigger-than-usual ranges, never with a direction.`;
}
