/**
 * Setup Watch — the educator claims this desk has TESTED, as live detectors.
 * Tier-1 brick, pure (no network, no clock, no DOM). Tested by js/claimWatch.test.mjs.
 *
 * WHY THIS EXISTS. Every Crown clip in MD files/CROWN_WATCH.md ends with a verdict and
 * then nothing watches whether the setup ever occurs again. The owner (2026-10-18) wants
 * the market monitored for these setups COMING and LIVE, with what to look for attached,
 * so the learning happens on the tape rather than in the archive. This module is the
 * register: one row per claim, its firing condition frozen from the pre-registration it
 * was tested under, the outcome that pre-registration scored, and the words to read it by.
 *
 * WHAT IT IS NOT. Not a signal. Most rows are TESTED NULL; a live setup here means "the
 * configuration an educator says to act on is occurring now — here is what this desk
 * found when it asked". The verdict travels with every alert. Nothing emits a direction.
 *
 * SHAPE. `evaluateClaims({ bundle, crack })` returns desk-watch trigger objects (kind
 * 'claim') so the existing transition-only Telegram, fire log and Evidence Book forward
 * record carry them with no second pipeline. `stage` adds the one thing desk watch lacked:
 * 'approaching' — the reading is most of the way to the threshold, so the owner can watch
 * it arrive rather than be told after.
 *
 *   bundle  the drill bundle (/api/drill-series): { dates:[iso], series:{ key:[num|null] } }
 *           — six years of rsp, spy, smh, dspx, vix, gold, nq, r2k, spx, oil …
 *   crack   /api/crack `series`: [{ date, value (3-2-1 crack $), wti }], ascending
 *
 * `scoreClaimFires(log, { bundle, series })` fills each claim fire's pre-registered
 * outcome once its horizon has elapsed. Reuses js/marketScan.js's scoreSeries for the
 * equal-weight spread so the board, the B1 study and this watch share ONE z-score.
 */
import { BOARD, scoreSeries } from './marketScan.js';

export const STAGE = { idle: 'idle', approaching: 'approaching', live: 'live' };
/** progress ≥ this (and < 1) reads as approaching. 0.75 of the way to the threshold. */
export const APPROACH_AT = 0.75;

const clamp01 = x => Math.max(0, Math.min(1, x));
const fmt = (v, dp = 1) => v == null || !Number.isFinite(v) ? '?' : `${v > 0 ? '+' : ''}${Number(v).toFixed(dp)}`;
const pctRank = (arr, v) => { const a = arr.filter(Number.isFinite); return a.length ? a.filter(x => x <= v).length / a.length : null; };
const quantile = (arr, q) => { const a = arr.filter(Number.isFinite).slice().sort((x, y) => x - y); return a.length ? a[Math.floor((a.length - 1) * q)] : null; };
const median = a => quantile(a, 0.5);

/** Rows of the bundle where EVERY key is non-null: { idx:[spineIndex], v:{ key:[values] }, dates:[iso] }. */
export function joined(bundle, keys) {
  const out = { idx: [], v: Object.fromEntries(keys.map(k => [k, []])), dates: [] };
  const S = bundle?.series ?? {}, D = bundle?.dates ?? [];
  if (!keys.every(k => Array.isArray(S[k]))) return out;
  for (let i = 0; i < D.length; i++) {
    if (!keys.every(k => Number.isFinite(S[k][i]))) continue;
    out.idx.push(i); out.dates.push(D[i]);
    for (const k of keys) out.v[k].push(S[k][i]);
  }
  return out;
}
const stageOf = (progress, live) => live ? STAGE.live : progress >= APPROACH_AT ? STAGE.approaching : STAGE.idle;

// ── the register ──────────────────────────────────────────────────────────────
// `base` is the number the forward record is read against: what the pre-registered
// study measured on history (its control or its headline). `lookFor` is the learning
// text: what makes the setup real, what this desk expects, what would falsify it.
export const CLAIMS = [
  {
    id: 'claim-breadth-narrow', evidenceId: 'breadth-narrowing', group: 'breadth',
    label: 'RSP/SPY narrowing extreme', source: 'Crown, 2026-09-23 / 10-02 / 10-16 clips',
    claim: '“When this ratio compresses the market is getting narrower… this is a textbook rotation” — and at the extreme, long RSP against SPY for the snap back.',
    verdict: 'TESTED NULL (B1, 35 de-clustered events, 2003→): no index direction, no range, no reversion of the spread, no continuation.',
    rule: 'Equal-weight minus cap-weight 20-session spread, z ≤ −1.8 against its own ~3-year history (the board’s eqwt tile; js/marketScan.js scoreSeries).',
    lookFor: 'Confirm the reading on the board’s eqwt tile. The desk’s finding is that this is CONCENTRATION EXPOSURE, not timing: long the index here is long a handful of names. Expect nothing in particular next — on 35 prior extremes the spread neither snapped back (−0.16 [−0.52, +0.14] at five sessions) nor ran on. If the ratio rips higher within a week, that is one observation on a null, not a confirmation. Watch which names carry SPY while RSP lags: that is the lesson.',
    instruments: ['SPX500'],
    outcome: { kind: 'ratioChange', a: 'rsp', b: 'spy', horizons: [5, 20], unit: '%', base: { 5: '−0.16 [−0.52, +0.14] vs control (B1 H3)', 20: '−0.06 [−0.40, +0.29] vs control (B1 H3)' }, read: 'RSP/SPY change after the extreme — a positive number is the snap-back he trades for.' },
  },
  {
    id: 'claim-breadth-broad', evidenceId: 'breadth-narrowing', group: 'breadth',
    label: 'RSP/SPY broadening extreme (the mirror)', source: 'B1 mirror arm, 2026-09-23',
    claim: 'The mirror of the narrowing claim: an extreme BROADENING — the median stock racing the index.',
    verdict: 'TESTED NULL as a timing signal; it is the arm that killed the range near-miss (broadening raised forward range as much as narrowing did).',
    rule: 'Same spread, z ≥ +1.8.',
    lookFor: 'This is the shape of the 2026-10-15 session: cap-weight flat because its largest names fell while the other 490 rose. Read it as WHERE the index return is coming from. Nothing is predicted next; both arms were null.',
    instruments: ['SPX500'],
    outcome: { kind: 'ratioChange', a: 'rsp', b: 'spy', horizons: [5, 20], unit: '%', base: { 5: 'mirror arm, null', 20: 'mirror arm, null' }, read: 'RSP/SPY change after the broadening extreme.' },
  },
  {
    id: 'claim-semis-tilt', evidenceId: 'breadth-tilt-semis', group: 'breadth',
    label: 'Narrowing → tilt into semis (SMH over SPY)', source: 'Crown, 2026-10-05 clip',
    claim: '“Breadth is collapsing… the real leadership is compressed into memory, lithography and foundry” — tilt into the AI bottlenecks when the ratio breaks down.',
    verdict: 'TESTED NULL on the full history (85 episodes, 2003→): semis beat SPY by no more after a narrowing than on any other day; at 60 sessions the broadening arm did better.',
    rule: 'RSP/SPY 20-session change in its bottom decile of the trailing 504 sessions (the pre-registration’s formalisation of “broke its trend line”).',
    lookFor: 'Semis led 2003–2026 unconditionally (+0.45% per 20 sessions, +1.81% per 60 over SPY), so SMH beating SPY after this setup proves nothing — the question is whether it beats by MORE than usual, and on 85 episodes it did not. Watch SMH−SPY against that unconditional number, not against zero. Note also the 2026-10-16 clip reversed the leadership call to hyperscalers; leadership calls track the trailing 60 sessions.',
    instruments: [],
    outcome: { kind: 'relRet', a: 'smh', b: 'spy', horizons: [20, 60], unit: '%', base: { 20: '+0.45% unconditional; setup +1.15%, excess +0.70 [−0.50, +1.82]', 60: '+1.81% unconditional; setup +1.60%, excess −0.21 [−2.88, +2.35]' }, read: 'SMH minus SPY total return from the next open.' },
  },
  {
    id: 'claim-dispersion-rising', evidenceId: 'dispersion-crowded-week', group: 'dispersion',
    label: 'Crowded and still crowding (dispersion high, rising)', source: 'Crown, 2026-09-23 clip (“mini flash crashes”)',
    claim: '“VIX-EQ minus VIX is starting to rally… you get mini flash crashes where the market pukes out of the AI trade and buys it back. A very fragile market.”',
    verdict: 'NULL at a week (D1, 68 setups 2014→): no wider week, no fat-tail day. The secondary 20-session window ran +0.23 [+0.04, +0.51] on SPX500 and +0.21 [+0.08, +0.38] on NQ, survives a below-median VIX, and D2 supplied its mirror — a wider MONTH, thin, range only.',
    rule: 'Cboe DSPX at or above its trailing 3-year 80th percentile AND up over 20 sessions (D1 definition).',
    lookFor: 'This is the WIDE arm. Expect a somewhat wider month on the indices, never a direction, never a crash call — the week claim is null and the tail claim is null. The structural read is the useful one: single-name vol is dear while the index is cheap, so an index hedge covers least exactly when the risk is concentration. Watch whether DSPX keeps rising (stays in this arm) or turns down (moves to the quiet arm below).',
    instruments: ['SPX500', 'NQ'],
    outcome: { kind: 'rangeRatio', instruments: ['SPX500', 'NQ'], horizons: [5, 20], unit: '× trailing-20 median range', base: { 5: 'SPX500 +0.07 [−0.06, +0.23], NQ +0.07 [−0.03, +0.17] vs control (null)', 20: 'SPX500 +0.23 [+0.04, +0.51], NQ +0.21 [+0.08, +0.38] vs control' }, read: 'Mean daily range over the window ÷ the trailing 20-session median range; 1.0 is ordinary.' },
  },
  {
    id: 'claim-dispersion-falling', evidenceId: 'dispersion-reset', group: 'dispersion',
    label: 'Crowded and normalizing (dispersion high, falling)', source: 'Crown, 2026-09-27 / 10-18 clip (“calm is not safe”)',
    claim: '“This volatility spread is normalizing while rates stay high and capex keeps rising. This is what a market looks like when the main theme starts to lose control.”',
    verdict: 'FALSIFIED IN SIGN (D2, 31 setups, pre-registered against prior): crowded-and-falling precedes a CALMER week (−0.12 [−0.19, −0.01] SPX500, −0.08 [−0.15, −0.01] NQ), nothing at a month; direction null.',
    rule: 'Cboe DSPX at or above its trailing 3-year 80th percentile AND down over 20 sessions (D2 definition).',
    lookFor: 'This is the QUIET arm — the opposite of the clip. Expect a calmer week on the indices, not a break. If the market does crack here, that is one event against a 31-episode result, and worth noting; it is not the rule. The arms separate cleanly (gate 4/4), so the direction of travel in dispersion is real information — it just runs backwards from the story. Thin n: an expected-range read, not a trigger.',
    instruments: ['SPX500', 'NQ'],
    outcome: { kind: 'rangeRatio', instruments: ['SPX500', 'NQ'], horizons: [5, 20], unit: '× trailing-20 median range', base: { 5: 'SPX500 −0.12 [−0.19, −0.01], NQ −0.08 [−0.15, −0.01] vs control', 20: 'SPX500 −0.09 [−0.18, +0.01], NQ −0.07 [−0.15, +0.04] (null)' }, read: 'Mean daily range over the window ÷ the trailing 20-session median range; below 1.0 is the calmer week D2 found.' },
  },
  {
    id: 'claim-fear-spike', evidenceId: 'fear-gold', group: 'gold',
    label: 'Fear spike → gold bid (VIX +5 in five sessions)', source: 'Crown, 2026-09-21 clip (the four golds)',
    claim: '“Fear gold” — a spike in the VIX brings a bid to gold that lasts days.',
    verdict: 'TESTED NULL (G1, 58 spikes 2010→): gold +0.42% in the five sessions after vs +0.35% ordinary (excess +0.07 [−0.42, +0.30]); a month on it LAGGED (+0.01% vs +1.20%).',
    rule: 'VIX close up 5 points or more over five sessions (FRED VIXCLS; the four-golds study’s spike).',
    lookFor: 'Do not write “fear is bidding gold”. If gold is up in a fear week, look for the rates leg (real yields down) or the dollar leg (DXY down) on the chain — `which-gold` finds one of those driving 37% of the time and no single gold 45% of the time. Watch gold’s 20-session return against +1.20%: history says it under-runs after a spike.',
    instruments: ['GOLD'],
    outcome: { kind: 'ret', a: 'gold', horizons: [5, 20], unit: '%', base: { 5: '+0.42% after vs +0.35% ordinary (null)', 20: '+0.01% after vs +1.20% ordinary — lagged' }, read: 'Gold return from the spike close.' },
  },
  {
    id: 'claim-rotation-extreme', evidenceId: 'rotation-extreme', group: 'breadth',
    label: 'Rotation extreme (Nasdaq vs Russell, 20 sessions)', source: 'Crown, 2026-09-17 (S8)',
    claim: 'A rotation extreme under a quiet index precedes wider index ranges — and “the rotation continues”.',
    verdict: 'TESTED NULL (S8, 140 extremes): next-20-session range −0.31 ATR [−0.86, +0.22] on NAS100; the extreme EXTENDED in 45% of cases — a coin.',
    rule: '|20-session log-relative return of NAS100 vs US2000| at or above its trailing 3-year 90th percentile.',
    lookFor: 'Rotation is description, not a warning. The 2026-10-16 “hyperscalers over semis” and 10-05 “semis lead” calls are this shape: a 60-session relative return restated as a forecast. Watch whether the extreme extends or reverts over 20 sessions — history says 45/55, so either outcome teaches nothing about the next one.',
    instruments: ['NQ', 'SPX500'],
    outcome: { kind: 'extend', a: 'nq', b: 'r2k', horizons: [20], unit: 'pp in the direction of the extreme', base: { 20: 'extended in 45% of 140 cases' }, read: 'Positive = the leader kept leading.' },
  },
  {
    id: 'claim-crack-disagreement', evidenceId: 'crack-disagreement-direction', group: 'energy',
    label: 'Crude down, crack up (products disagree with the barrel)', source: 'Crown, 2026-09-21 (crack spread)',
    claim: 'When crude sells off while the crack keeps rising, the sell-off is not the end of the story and crude is higher a month later.',
    verdict: 'NULL as a rule, real as a base rate: crude higher 20 sessions later 62% [48–75] on 45 windows vs 52% unconditional — the interval holds the coin.',
    rule: 'WTI down 5% or more over 20 sessions while the 3-2-1 crack is up $5 or more over the same 20 sessions (FRED EIA spot, /api/crack).',
    lookFor: 'Say “crude sell-offs with the crack rising have more often reversed than not, 62% on 45 cases” — never “the crack says crude goes back up”. The chain’s crack → inflation-pricing link is the macro half: a rising crack with falling crude is the bond market keeping its inflation view. Watch breakevens with it.',
    instruments: [],
    outcome: { kind: 'ret', a: 'oil', horizons: [20], unit: '%', base: { 20: 'higher 62% [48–75] of 45 windows; 52% unconditional' }, read: 'WTI return over the next 20 sessions; the base rate is a hit rate, so read the sign.' },
  },
];
export const CLAIM_BY_ID = Object.fromEntries(CLAIMS.map(c => [c.id, c]));

// ── detectors ─────────────────────────────────────────────────────────────────
// Each returns { reading, threshold, progress, live, detail } or null when the input
// is missing. `progress` is 0 far from the setup, 1 at the threshold; it is what makes
// 'approaching' possible and it is defined per detector in the rule's own unit.
const EQWT_SPEC = BOARD.find(s => s.key === 'eqwt');

function detectBreadth(bundle, side) {
  if (!EQWT_SPEC || !Array.isArray(bundle?.dates)) return null;
  let s = null, at = null;
  for (let i = bundle.dates.length - 1; i >= 0 && i > bundle.dates.length - 8; i--) { s = scoreSeries(bundle, EQWT_SPEC, i); if (s && Number.isFinite(s.z)) { at = i; break; } }
  if (!s) return null;
  const z = s.z, want = side === 'narrow' ? -z : z;        // distance travelled toward this side
  const progress = clamp01(want / 1.8), live = want >= 1.8;
  return { reading: z, threshold: side === 'narrow' ? -1.8 : 1.8, progress, live, asOf: bundle.dates[at],
    extra: { spreadPct: s.change, pct: s.pct },
    detail: `Equal-weight − cap-weight 20-session spread ${fmt(s.change, 2)} pts, z ${fmt(z, 2)} (${Math.round((s.pct ?? 0) * 100)}th percentile of ~3 years) as of ${bundle.dates[at]}.` };
}

function detectSemisTilt(bundle) {
  const J = joined(bundle, ['rsp', 'spy']); const n = J.idx.length;
  if (n < 504 + 21) return null;
  const ratio = J.v.rsp.map((r, i) => r / J.v.spy[i]);
  const chg = ratio.map((v, i) => i < 20 ? null : (v / ratio[i - 20] - 1) * 100);
  const i = n - 1, hist = chg.slice(i - 504, i).filter(Number.isFinite);
  const thr = quantile(hist, 0.10), rank = pctRank(hist, chg[i]);
  const progress = clamp01((0.30 - rank) / 0.20), live = chg[i] <= thr;
  return { reading: chg[i], threshold: thr, progress, live, asOf: J.dates[i], extra: { rank },
    detail: `RSP/SPY 20-session change ${fmt(chg[i], 2)}% — the ${Math.round(rank * 100)}th percentile of its trailing 504 sessions (bottom decile is ≤ ${fmt(thr, 2)}%) as of ${J.dates[i]}.` };
}

function detectDispersion(bundle, dir) {
  const J = joined(bundle, ['dspx']); const n = J.idx.length;
  if (n < 120) return null;
  const d = J.v.dspx, i = n - 1;
  const win = d.slice(Math.max(0, i - 755), i + 1);
  const pct = pctRank(win, d[i]), chg20 = d[i] - d[i - 20];
  const dirOk = dir === 'rising' ? chg20 > 0 : chg20 < 0;
  const crowdedProgress = clamp01((pct - 0.60) / 0.20);
  const progress = dirOk ? crowdedProgress : Math.min(crowdedProgress, APPROACH_AT - 0.01);   // wrong arm cannot read as approaching this one
  const live = pct >= 0.80 && dirOk;
  return { reading: d[i], threshold: quantile(win, 0.80), progress, live, asOf: J.dates[i], extra: { pct, chg20 },
    detail: `DSPX ${d[i].toFixed(1)} — the ${Math.round(pct * 100)}th percentile of its trailing three years (crowded at the 80th), ${chg20 >= 0 ? 'up' : 'down'} ${fmt(chg20, 1)} over 20 sessions as of ${J.dates[i]}.` };
}

function detectFearSpike(bundle) {
  const J = joined(bundle, ['vix']); const n = J.idx.length;
  if (n < 6) return null;
  const i = n - 1, d5 = J.v.vix[i] - J.v.vix[i - 5];
  return { reading: d5, threshold: 5, progress: clamp01(d5 / 5), live: d5 >= 5, asOf: J.dates[i], extra: { vix: J.v.vix[i] },
    detail: `VIX ${J.v.vix[i].toFixed(1)}, ${fmt(d5, 1)} points over five sessions (spike is +5) as of ${J.dates[i]}.` };
}

function detectRotation(bundle) {
  const J = joined(bundle, ['nq', 'r2k']); const n = J.idx.length;
  if (n < 120) return null;
  const rel = J.v.nq.map((v, i) => i < 20 ? null : (Math.log(v / J.v.nq[i - 20]) - Math.log(J.v.r2k[i] / J.v.r2k[i - 20])) * 100);
  const i = n - 1, hist = rel.slice(Math.max(20, i - 755), i).map(Math.abs).filter(Number.isFinite);
  const thr = quantile(hist, 0.90); if (thr == null) return null;
  const a = Math.abs(rel[i]);
  return { reading: rel[i], threshold: thr, progress: clamp01(a / thr), live: a >= thr, asOf: J.dates[i], extra: { sign: Math.sign(rel[i]) },
    detail: `Nasdaq vs Russell 20-session relative return ${fmt(rel[i], 1)}pp (${rel[i] >= 0 ? 'Nasdaq leading' : 'Russell leading'}); the trailing 3-year top-decile line is ±${thr.toFixed(1)}pp as of ${J.dates[i]}.` };
}

function detectCrack(crack) {
  const rows = (crack ?? []).filter(r => Number.isFinite(r?.value) && Number.isFinite(r?.wti));
  const n = rows.length; if (n < 21) return null;
  const i = n - 1, dOil = (rows[i].wti / rows[i - 20].wti - 1) * 100, dCrack = rows[i].value - rows[i - 20].value;
  const pOil = clamp01(-dOil / 5), pCrack = clamp01(dCrack / 5);
  return { reading: dOil, threshold: -5, progress: Math.min(pOil, pCrack), live: dOil <= -5 && dCrack >= 5, asOf: rows[i].date, extra: { dCrack, wti: rows[i].wti, crack: rows[i].value },
    detail: `WTI ${fmt(dOil, 1)}% over 20 sessions (setup needs −5%), the 3-2-1 crack ${fmt(dCrack, 2)} $/bbl over the same window (needs +$5) as of ${rows[i].date}.` };
}

const DETECT = {
  'claim-breadth-narrow': ({ bundle }) => detectBreadth(bundle, 'narrow'),
  'claim-breadth-broad': ({ bundle }) => detectBreadth(bundle, 'broad'),
  'claim-semis-tilt': ({ bundle }) => detectSemisTilt(bundle),
  'claim-dispersion-rising': ({ bundle }) => detectDispersion(bundle, 'rising'),
  'claim-dispersion-falling': ({ bundle }) => detectDispersion(bundle, 'falling'),
  'claim-fear-spike': ({ bundle }) => detectFearSpike(bundle),
  'claim-rotation-extreme': ({ bundle }) => detectRotation(bundle),
  'claim-crack-disagreement': ({ crack }) => detectCrack(crack),
};

/** Desk-watch trigger objects for every claim whose input is present. Missing input → no trigger (never a false clear). */
export function evaluateClaims({ bundle = null, crack = null } = {}) {
  const out = [];
  for (const c of CLAIMS) {
    let r = null;
    try { r = DETECT[c.id]({ bundle, crack }); } catch { r = null; }
    if (!r) continue;
    const stage = stageOf(r.progress, r.live);
    out.push({
      id: c.id, kind: 'claim', evidenceId: c.evidenceId, claimId: c.id, label: `Setup watch · ${c.label}`,
      firing: r.live, stage, instruments: c.instruments, expect: [],
      value: { reading: +Number(r.reading).toFixed(4), threshold: r.threshold == null ? null : +Number(r.threshold).toFixed(4), progress: +r.progress.toFixed(3), asOf: r.asOf, ...r.extra },
      detail: `${r.detail} ${stage === STAGE.live ? 'The setup is LIVE.' : stage === STAGE.approaching ? `Approaching — ${Math.round(r.progress * 100)}% of the way to the threshold.` : ''} Crown’s claim: ${c.claim} This desk: ${c.verdict}`.trim(),
      lookFor: c.lookFor,
    });
  }
  return out;
}

// ── forward scoring ───────────────────────────────────────────────────────────
// Fills `outcomes` on claim fires (log entries with kind 'claim' and event 'started')
// once each pre-registered horizon has elapsed. Bundle-based metrics use the joined
// rows of the series the study used; range ratios need high/low and come from the
// desk-watch OANDA bars (`series`: { spx:[{date,value,high,low}], nq:[…] }).
const INSTR_KEY = { SPX500: 'spx', NQ: 'nq', GOLD: 'gold' };
function rangeRatio(bars, fireDate, h) {
  if (!Array.isArray(bars) || bars.length < 41) return null;
  let i = bars.findIndex(b => b.date >= fireDate); if (i < 0) return null;
  if (bars[i].date > fireDate) i -= 1;
  if (i < 20 || i + h >= bars.length) return null;
  const rr = b => (b.high - b.low) / b.value;
  const trail = median(bars.slice(i - 19, i + 1).map(rr)); if (!trail) return null;
  const fwd = bars.slice(i + 1, i + 1 + h).map(rr);
  return +(fwd.reduce((s, v) => s + v, 0) / fwd.length / trail).toFixed(3);
}
export function scoreClaimFires(log = [], { bundle = null, series = {} } = {}) {
  let changed = 0;
  for (const f of log) {
    if (f.kind !== 'claim' || f.event !== 'started') continue;
    const c = CLAIM_BY_ID[f.claimId ?? f.id]; if (!c) continue;
    const spec = c.outcome, day = String(f.at).slice(0, 10);
    f.outcomes = f.outcomes ?? {};
    for (const h of spec.horizons) {
      if (f.outcomes[h] != null) continue;
      let v = null;
      if (spec.kind === 'rangeRatio') {
        const per = {}; for (const inst of spec.instruments) { const r = rangeRatio(series[INSTR_KEY[inst]], day, h); if (r != null) per[inst] = r; }
        v = Object.keys(per).length === spec.instruments.length ? per : null;
      } else {
        const keys = spec.kind === 'ret' ? [spec.a] : [spec.a, spec.b];
        const J = joined(bundle, keys);
        let i = J.dates.findIndex(d => d >= day); if (i >= 0 && J.dates[i] > day) i -= 1;
        if (i >= 0 && i + h < J.dates.length) {
          const A = J.v[spec.a], B = spec.b ? J.v[spec.b] : null;
          if (spec.kind === 'ret') v = +((A[i + h] / A[i] - 1) * 100).toFixed(3);
          else if (spec.kind === 'ratioChange') v = +(((A[i + h] / B[i + h]) / (A[i] / B[i]) - 1) * 100).toFixed(3);
          else if (spec.kind === 'relRet') v = +(((A[i + h] / A[i] - 1) - (B[i + h] / B[i] - 1)) * 100).toFixed(3);
          else if (spec.kind === 'extend') { const sgn = Math.sign(f.value?.sign ?? f.value?.reading ?? 0) || 1; v = +(sgn * (Math.log(A[i + h] / A[i]) - Math.log(B[i + h] / B[i])) * 100).toFixed(3); }
        }
      }
      if (v != null) { f.outcomes[h] = v; f.outcomeAt = new Date().toISOString(); changed++; }
    }
  }
  return changed;
}
