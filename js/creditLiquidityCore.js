/**
 * Credit & liquidity board (Desk Terminal, Macro tab): the pure shaping. No fetch, no DOM, no clock except `now` passed in.
 *
 *   buildCreditLiquidity({ components, csi, state, gate, pulse, now })   what /api/credit-liquidity serves
 *   describe(cl)                                                         the rule-built sentence (no model)
 *
 * What it holds that the Credit spreads / Fed liquidity boards beside it do not: the Credit Stress Index (the equal-weight 252-day z of the
 * Baa-Aaa quality slope, the Baa-10Y credit spread and the VIX), the long-history Baa-10Y spread with where it sits against 5 and 20 years,
 * global central-bank liquidity (Fed + ECB + BoJ + PBoC proxy), and the three z-scores the liquidity gate reads (net liquidity, curve, credit).
 * It does NOT carry the gate's long / short / blocked verdicts, the CSI's gated exposure tiers or any backtest: those are trade filters.
 *
 * Description, not a signal. The Evidence Book on the same ground: macro-confluence-baa-credit NULL, net-liquidity-tailwind-spx UNDERPOWERED,
 * funding-stress NULL; the TGA/RRP "liquidity pulse" next-day correlation is ~0 (stats below, shown as measured).
 */
import { pctile, changeBp } from './terminal/ratesBoardCore.js';

const fin = v => v != null && Number.isFinite(+v);
const r1 = v => (fin(v) ? Math.round(v * 10) / 10 : null);
const r2 = v => (fin(v) ? Math.round(v * 100) / 100 : null);
const DAY = 864e5, ts = d => Date.parse(`${String(d).slice(0, 10)}T00:00:00Z`);
const toDV = a => (a ?? []).filter(p => p && fin(p.v)).map(p => ({ date: p.d, value: p.v }));
// Moody's Baa/Aaa spreads are stamped point-in-time two days after the print (js/creditStressEngine.js lagDays 2): show the observation date
const LAG_DAYS = 2, shiftDay = (d, n) => new Date(Date.parse(`${String(d).slice(0, 10)}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const every = (a, k) => { const out = a.filter((_, i) => (a.length - 1 - i) % k === 0); return out; };

/** The CSI's reading in words, on its own scale (1-year rolling z of an equal-weight composite; 0 = a normal year). */
export function csiWord(v) {
  if (!fin(v)) return null;
  return v <= -1 ? 'much easier than the past year' : v < -0.35 ? 'easier than the past year' : v <= 0.35 ? 'about normal for the past year' : v < 1 ? 'tighter than the past year' : v < 2 ? 'stressed against the past year' : 'sharply stressed against the past year';
}
const TIER_TONE = v => (v <= -1 ? 'up' : v < 1 ? 'flat' : v < 2 ? 'gold' : 'dn');
export const csiTone = TIER_TONE;

export function buildCreditLiquidity({ components, csi, state, gate = null, pulse = null, now = Date.now() } = {}) {
  const sCsi = csi?.series ?? [];
  const last = sCsi[sCsi.length - 1];
  if (!last) return { ok: false, error: 'the Credit Stress Index has no data yet' };
  const credit = toDV(components?.credit), quality = toDV(components?.quality);
  const pc = a => ({ p5: pctile(a, 5, 250), p20: pctile(a, 20, 500) });
  const bpOf = a => (a.length ? Math.round(a[a.length - 1].value * 100) : null);
  const credP = pc(credit), qualP = pc(quality);
  const from3y = new Date(ts(last.d) - 3 * 365.25 * DAY).toISOString().slice(0, 10);
  const series = every(sCsi.filter(p => p.d >= from3y), 5).map(p => ({ d: p.d, v: r2(p.v) }));      // about weekly over three years
  const cz = csi.componentZ ?? {};
  const g4 = state?.layers?.liquidity?.g4 ?? null, net = state?.layers?.liquidity?.net ?? null;
  const inst = gate?.instruments ? (gate.instruments.NAS100_USD ?? Object.values(gate.instruments)[0]) : null;
  return {
    ok: true, builtAt: new Date(now).toISOString(),
    csi: { value: r2(last.v), asOf: last.d, word: csiWord(last.v), tone: TIER_TONE(last.v), components: { quality: r2(cz.quality), credit: r2(cz.credit), vix: r2(cz.vix) }, series },
    spread: credit.length ? {
      asOf: shiftDay(credit[credit.length - 1].date, -LAG_DAYS), bp: bpOf(credit), chg20d: changeBp(credit, 28) != null ? Math.round(changeBp(credit, 28)) : null, chg5d: changeBp(credit, 7) != null ? Math.round(changeBp(credit, 7)) : null,
      pct5y: credP.p5.pct, pct20y: credP.p20.pct, spark: every(credit.slice(-260), 4).map(p => Math.round(p.value * 100)),
      quality: quality.length ? { bp: bpOf(quality), pct5y: qualP.p5.pct, pct20y: qualP.p20.pct, chg20d: changeBp(quality, 28) != null ? Math.round(changeBp(quality, 28)) : null } : null,
    } : null,
    g4: g4 ? { asOf: String(g4.asOf) > new Date(now).toISOString().slice(0, 10) ? new Date(now).toISOString().slice(0, 10) : g4.asOf, level: r2(g4.level), impulse: r2(g4.impulse), cycle: r2(g4.cycle), phase: g4.phase ?? null, regime: g4.regime ?? null, perCcy: g4.perCcy ?? null,
      history: every((g4.history ?? []).slice(-156), 2).map(p => ({ d: p.date, v: r2(p.value) })) } : null,
    net: net ? { last: net.last, asOf: net.asOf, chg4w: net.chg4w, chg13w: net.chg13w, chg52w: net.chg52w, pct: net.pctAll, impulse: net.impulse ?? null, tga: net.today?.tga ?? null, rrp: net.today?.rrp ?? null } : null,
    gateZ: inst ? { asOf: inst.asOf, netliq: r2(inst.netliqZ), curve: r2(inst.curveZ), credit: r2(inst.creditZ) } : null,
    pulse: pulse?.stats ? { n: pulse.stats.n, corrSameDay: r2(pulse.stats.corrSameDay), corrNextDay: r2(pulse.stats.corrNextDay), hitRateNextDay: r2(pulse.stats.hitRateNextDay), hitRateSettlement: r2(pulse.stats.hitRateSettlement), hitRateNonSettlement: r2(pulse.stats.hitRateNonSettlement) } : null,
  };
}

const sg = v => (v > 0 ? '+' : v < 0 ? '−' : '');
/** One rule-built paragraph: stress, the Baa spread, global liquidity. States "priced/measured", never a forecast. */
export function describe(cl) {
  if (!cl?.ok) return null;
  const parts = [];
  if (fin(cl.csi?.value)) parts.push(`The Credit Stress Index is ${sg(cl.csi.value)}${Math.abs(cl.csi.value).toFixed(2)}: credit conditions are ${cl.csi.word}`);
  if (cl.spread?.bp != null) parts.push(`Baa over the 10-year Treasury is ${cl.spread.bp}bp${cl.spread.pct5y != null ? `, the ${cl.spread.pct5y}th percentile of five years` : ''}${cl.spread.chg20d != null ? `, ${sg(cl.spread.chg20d)}${Math.abs(cl.spread.chg20d)}bp in 20 days` : ''}`);
  if (cl.g4 && fin(cl.g4.impulse)) parts.push(`global central-bank liquidity is ${cl.g4.phase ? cl.g4.phase.toLowerCase() : (cl.g4.impulse >= 0 ? 'rising' : 'falling')} (impulse ${sg(cl.g4.impulse)}${Math.abs(cl.g4.impulse).toFixed(2)}, level ${sg(cl.g4.level)}${Math.abs(cl.g4.level).toFixed(2)})`);
  return parts.length ? `${parts.join('; ')}.` : null;
}
