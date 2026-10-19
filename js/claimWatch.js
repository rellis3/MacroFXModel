/**
 * Setup Watch — the watch REGISTER: every tested finding with a rule knowable on the
 * 15-minute tick, as a gauged detector. Tier-1 brick, pure (no network, no clock, no DOM).
 * Tested by js/claimWatch.test.mjs.
 *
 * Two sources share one row format (2026-10-19, owner: "combine into a lot of testable
 * items"): `source: 'Crown'` rows are the educator setups the Crown log tested;
 * `source: 'desk'` rows are the desk's own ledger findings. The Evidence Book
 * (evidence.html) renders a row's gauge, stage and look-for on the finding's card, so
 * there is ONE page, not a Crown page and a ledger page.
 *
 * Two row kinds:
 *   detector rows  — emit a desk-watch TRIGGER (kind 'claim' for null/context findings,
 *                    'tested' for validated ones) with a `stage`; start/clear/approaching
 *                    go to Telegram and the fire log exactly like every other trigger.
 *   gauge rows     — `watchId` names a trigger js/deskWatch.js ALREADY has (vix-inversion,
 *                    nq-down-week, ...). They emit a GAUGE only: progress + stage + look-for,
 *                    never a second trigger, so nothing is alerted twice. Their 'approaching'
 *                    is the one thing the binary trigger could not say.
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

const _last = a => Array.isArray(a) && a.length ? a[a.length - 1] : null;
const _nth = (a, k) => Array.isArray(a) && a.length > k ? a[a.length - 1 - k] : null;

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
// compared at the 3dp the value is reported at, so a reading that prints as 75% IS approaching (0.7499999 is not a stage)
const stageOf = (progress, live) => live ? STAGE.live : +Number(progress).toFixed(3) >= APPROACH_AT ? STAGE.approaching : STAGE.idle;

// ── the register ──────────────────────────────────────────────────────────────
// `base` is the number the forward record is read against: what the pre-registered
// study measured on history (its control or its headline). `lookFor` is the learning
// text: what makes the setup real, what this desk expects, what would falsify it.
export const CLAIMS = [
  // ═══ Crown rows (MD files/CROWN_WATCH.md) ═══════════════════════════════════
  {
    id: 'claim-breadth-narrow', evidenceId: 'breadth-narrowing', group: 'breadth', source: 'Crown',
    label: 'RSP/SPY narrowing extreme', source_doc: 'Crown, 2026-09-23 / 10-02 / 10-16 clips',
    claim: '“When this ratio compresses the market is getting narrower… this is a textbook rotation” — and at the extreme, long RSP against SPY for the snap back.',
    verdict: 'TESTED NULL (B1, 35 de-clustered events, 2003→): no index direction, no range, no reversion of the spread, no continuation.',
    rule: 'Equal-weight minus cap-weight 20-session spread, z ≤ −1.8 against its own ~3-year history (the board’s eqwt tile; js/marketScan.js scoreSeries).',
    lookFor: 'Confirm the reading on the board’s eqwt tile. The desk’s finding is that this is CONCENTRATION EXPOSURE, not timing: long the index here is long a handful of names. Expect nothing in particular next — on 35 prior extremes the spread neither snapped back (−0.16 [−0.52, +0.14] at five sessions) nor ran on. If the ratio rips higher within a week, that is one observation on a null, not a confirmation. Watch which names carry SPY while RSP lags: that is the lesson.',
    instruments: ['SPX500'],
    outcome: { kind: 'ratioChange', a: 'rsp', b: 'spy', horizons: [5, 20], unit: '%', base: { 5: '−0.16 [−0.52, +0.14] vs control (B1 H3)', 20: '−0.06 [−0.40, +0.29] vs control (B1 H3)' }, read: 'RSP/SPY change after the extreme — a positive number is the snap-back he trades for.' },
  },
  {
    id: 'claim-breadth-broad', evidenceId: 'breadth-narrowing', group: 'breadth', source: 'Crown',
    label: 'RSP/SPY broadening extreme (the mirror)', source_doc: 'B1 mirror arm, 2026-09-23',
    claim: 'The mirror of the narrowing claim: an extreme BROADENING — the median stock racing the index.',
    verdict: 'TESTED NULL as a timing signal; it is the arm that killed the range near-miss (broadening raised forward range as much as narrowing did).',
    rule: 'Same spread, z ≥ +1.8.',
    lookFor: 'This is the shape of the 2026-10-15 session: cap-weight flat because its largest names fell while the other 490 rose. Read it as WHERE the index return is coming from. Nothing is predicted next; both arms were null.',
    instruments: ['SPX500'],
    outcome: { kind: 'ratioChange', a: 'rsp', b: 'spy', horizons: [5, 20], unit: '%', base: { 5: 'mirror arm, null', 20: 'mirror arm, null' }, read: 'RSP/SPY change after the broadening extreme.' },
  },
  {
    id: 'claim-semis-tilt', evidenceId: 'breadth-tilt-semis', group: 'breadth', source: 'Crown',
    label: 'Narrowing → tilt into semis (SMH over SPY)', source_doc: 'Crown, 2026-10-05 clip',
    claim: '“Breadth is collapsing… the real leadership is compressed into memory, lithography and foundry” — tilt into the AI bottlenecks when the ratio breaks down.',
    verdict: 'TESTED NULL on the full history (85 episodes, 2003→): semis beat SPY by no more after a narrowing than on any other day; at 60 sessions the broadening arm did better.',
    rule: 'RSP/SPY 20-session change in its bottom decile of the trailing 504 sessions (the pre-registration’s formalisation of “broke its trend line”).',
    lookFor: 'Semis led 2003–2026 unconditionally (+0.45% per 20 sessions, +1.81% per 60 over SPY), so SMH beating SPY after this setup proves nothing — the question is whether it beats by MORE than usual, and on 85 episodes it did not. Watch SMH−SPY against that unconditional number, not against zero. Note also the 2026-10-16 clip reversed the leadership call to hyperscalers; leadership calls track the trailing 60 sessions.',
    instruments: [],
    outcome: { kind: 'relRet', a: 'smh', b: 'spy', horizons: [20, 60], unit: '%', base: { 20: '+0.45% unconditional; setup +1.15%, excess +0.70 [−0.50, +1.82]', 60: '+1.81% unconditional; setup +1.60%, excess −0.21 [−2.88, +2.35]' }, read: 'SMH minus SPY total return from the next open.' },
  },
  {
    id: 'claim-dispersion-rising', evidenceId: 'dispersion-crowded-week', group: 'dispersion', source: 'Crown',
    label: 'Crowded and still crowding (dispersion high, rising)', source_doc: 'Crown, 2026-09-23 clip (“mini flash crashes”)',
    claim: '“VIX-EQ minus VIX is starting to rally… you get mini flash crashes where the market pukes out of the AI trade and buys it back. A very fragile market.”',
    verdict: 'NULL at a week (D1, 68 setups 2014→): no wider week, no fat-tail day. The secondary 20-session window ran +0.23 [+0.04, +0.51] on SPX500 and +0.21 [+0.08, +0.38] on NQ, survives a below-median VIX, and D2 supplied its mirror — a wider MONTH, thin, range only.',
    rule: 'Cboe DSPX at or above its trailing 3-year 80th percentile AND up over 20 sessions (D1 definition).',
    lookFor: 'This is the WIDE arm. Expect a somewhat wider month on the indices, never a direction, never a crash call — the week claim is null and the tail claim is null. The structural read is the useful one: single-name vol is dear while the index is cheap, so an index hedge covers least exactly when the risk is concentration. Watch whether DSPX keeps rising (stays in this arm) or turns down (moves to the quiet arm below).',
    instruments: ['SPX500', 'NQ'],
    outcome: { kind: 'rangeRatio', instruments: ['SPX500', 'NQ'], horizons: [5, 20], unit: '× trailing-20 median range', base: { 5: 'SPX500 +0.07 [−0.06, +0.23], NQ +0.07 [−0.03, +0.17] vs control (null)', 20: 'SPX500 +0.23 [+0.04, +0.51], NQ +0.21 [+0.08, +0.38] vs control' }, read: 'Mean daily range over the window ÷ the trailing 20-session median range; 1.0 is ordinary.' },
  },
  {
    id: 'claim-dispersion-falling', evidenceId: 'dispersion-reset', group: 'dispersion', source: 'Crown',
    label: 'Crowded and normalizing (dispersion high, falling)', source_doc: 'Crown, 2026-09-27 / 10-18 clip (“calm is not safe”)',
    claim: '“This volatility spread is normalizing while rates stay high and capex keeps rising. This is what a market looks like when the main theme starts to lose control.”',
    verdict: 'FALSIFIED IN SIGN (D2, 31 setups, pre-registered against prior): crowded-and-falling precedes a CALMER week (−0.12 [−0.19, −0.01] SPX500, −0.08 [−0.15, −0.01] NQ), nothing at a month; direction null.',
    rule: 'Cboe DSPX at or above its trailing 3-year 80th percentile AND down over 20 sessions (D2 definition).',
    lookFor: 'This is the QUIET arm — the opposite of the clip. Expect a calmer week on the indices, not a break. If the market does crack here, that is one event against a 31-episode result, and worth noting; it is not the rule. The arms separate cleanly (gate 4/4), so the direction of travel in dispersion is real information — it just runs backwards from the story. Thin n: an expected-range read, not a trigger.',
    instruments: ['SPX500', 'NQ'],
    outcome: { kind: 'rangeRatio', instruments: ['SPX500', 'NQ'], horizons: [5, 20], unit: '× trailing-20 median range', base: { 5: 'SPX500 −0.12 [−0.19, −0.01], NQ −0.08 [−0.15, −0.01] vs control', 20: 'SPX500 −0.09 [−0.18, +0.01], NQ −0.07 [−0.15, +0.04] (null)' }, read: 'Mean daily range over the window ÷ the trailing 20-session median range; below 1.0 is the calmer week D2 found.' },
  },
  {
    id: 'claim-fear-spike', evidenceId: 'fear-gold', group: 'gold', source: 'Crown',
    label: 'Fear spike → gold bid (VIX +5 in five sessions)', source_doc: 'Crown, 2026-09-21 clip (the four golds)',
    claim: '“Fear gold” — a spike in the VIX brings a bid to gold that lasts days.',
    verdict: 'TESTED NULL (G1, 58 spikes 2010→): gold +0.42% in the five sessions after vs +0.35% ordinary (excess +0.07 [−0.42, +0.30]); a month on it LAGGED (+0.01% vs +1.20%).',
    rule: 'VIX close up 5 points or more over five sessions (FRED VIXCLS; the four-golds study’s spike).',
    lookFor: 'Do not write “fear is bidding gold”. If gold is up in a fear week, look for the rates leg (real yields down) or the dollar leg (DXY down) on the chain — `which-gold` finds one of those driving 37% of the time and no single gold 45% of the time. Watch gold’s 20-session return against +1.20%: history says it under-runs after a spike.',
    instruments: ['GOLD'],
    outcome: { kind: 'ret', a: 'gold', horizons: [5, 20], unit: '%', base: { 5: '+0.42% after vs +0.35% ordinary (null)', 20: '+0.01% after vs +1.20% ordinary — lagged' }, read: 'Gold return from the spike close.' },
  },
  {
    id: 'claim-rotation-extreme', evidenceId: 'rotation-extreme', group: 'breadth', source: 'Crown',
    label: 'Rotation extreme (Nasdaq vs Russell, 20 sessions)', source_doc: 'Crown, 2026-09-17 (S8)',
    claim: 'A rotation extreme under a quiet index precedes wider index ranges — and “the rotation continues”.',
    verdict: 'TESTED NULL (S8, 140 extremes): next-20-session range −0.31 ATR [−0.86, +0.22] on NAS100; the extreme EXTENDED in 45% of cases — a coin.',
    rule: '|20-session log-relative return of NAS100 vs US2000| at or above its trailing 3-year 90th percentile.',
    lookFor: 'Rotation is description, not a warning. The 2026-10-16 “hyperscalers over semis” and 10-05 “semis lead” calls are this shape: a 60-session relative return restated as a forecast. Watch whether the extreme extends or reverts over 20 sessions — history says 45/55, so either outcome teaches nothing about the next one.',
    instruments: ['NQ', 'SPX500'],
    outcome: { kind: 'extend', a: 'nq', b: 'r2k', horizons: [20], unit: 'pp in the direction of the extreme', base: { 20: 'extended in 45% of 140 cases' }, read: 'Positive = the leader kept leading.' },
  },
  {
    id: 'claim-crack-disagreement', evidenceId: 'crack-disagreement-direction', group: 'energy', source: 'Crown',
    label: 'Crude down, crack up (products disagree with the barrel)', source_doc: 'Crown, 2026-09-21 (crack spread)',
    claim: 'When crude sells off while the crack keeps rising, the sell-off is not the end of the story and crude is higher a month later.',
    verdict: 'NULL as a rule, real as a base rate: crude higher 20 sessions later 62% [48–75] on 45 windows vs 52% unconditional — the interval holds the coin.',
    rule: 'WTI down 5% or more over 20 sessions while the 3-2-1 crack is up $5 or more over the same 20 sessions (FRED EIA spot, /api/crack).',
    lookFor: 'Say “crude sell-offs with the crack rising have more often reversed than not, 62% on 45 cases” — never “the crack says crude goes back up”. The chain’s crack → inflation-pricing link is the macro half: a rising crack with falling crude is the bond market keeping its inflation view. Watch breakevens with it.',
    instruments: [],
    outcome: { kind: 'ret', a: 'oil', horizons: [20], unit: '%', base: { 20: 'higher 62% [48–75] of 45 windows; 52% unconditional' }, read: 'WTI return over the next 20 sessions; the base rate is a hit rate, so read the sign.' },
  },

  // ═══ desk rows — the ledger's own findings with a rule knowable on the tick ═══════
  // Detector rows (a new gauged trigger). `kind` follows the verdict: validated → 'tested' (✓),
  // null/context → 'claim' (◌). Rules copied from the study; any knowable-at-the-time
  // substitution for a full-sample threshold is stated in `rule`.
  {
    id: 'watch-iv-over-rv', evidenceId: 'iv-over-rv-wider', group: 'volatility', source: 'desk', kind: 'tested',
    label: 'Implied far above realised (VIX ÷ 20-session SPX realised, top decile)', source_doc: 'MARKET_SENSE_TESTS.md M9',
    claim: 'When implied vol sits far above realised, the market is over-insured and calms down.',
    verdict: 'VALIDATED — THE OPPOSITE (M9, 88 first days 2010→): NAS100 next-5 range +0.38 ATR [+0.11, +0.62], next-20 +0.56; SPX500 next-20 +0.67 [+0.13, +1.21]. Realised catches up to implied.',
    rule: 'VIX ÷ annualised 20-session realised vol of SPX closes, at or above the 90th percentile of its trailing 504 sessions (M9 used the full 2010→ sample; rolling here so the line is knowable at the time).',
    lookFor: 'Expect the indices WIDER over the coming weeks, not calmer — realised catches up. Range only; the 5-day up-share is a base rate. The line to watch is 20-session realised SPX vol rising toward the VIX, which is the ratio normalising from the realised side.',
    instruments: ['SPX500', 'NQ'],
    outcome: { kind: 'rangeRatio', instruments: ['SPX500', 'NQ'], horizons: [5, 20], unit: '× trailing-20 median range', base: { 5: 'NAS100 +0.38 ATR [+0.11, +0.62]; SPX500 +0.17 (null)', 20: 'NAS100 +0.56, SPX500 +0.67 ATR [+0.13, +1.21]' }, read: 'Mean daily range over the window ÷ the trailing 20-session median; above 1.0 is the wider tape M9 found (study measured in ATR).' },
  },
  {
    id: 'watch-vol-front-dear', evidenceId: 'vol-curve-front', group: 'volatility', source: 'desk', kind: 'tested',
    label: 'Dear front of the vol curve (VIX9D ÷ VIX ≥ 0.9669)', source_doc: 'forge/VOL_CURVE_FRONT_PREREG.md',
    claim: 'The front of the S&P implied-vol curve says whether today’s production range lines are too tight or too wide.',
    verdict: 'VALIDATED for RANGE, trades fail (5,368 index-days 2016–2026): share of days past the p75 line 32.5% on dear days vs 18.2% calm vs 25% design; logistic DEAR +0.68 (z +5.9). Not the event calendar.',
    rule: 'Cboe VIX9D ÷ VIX at or above 0.9669 (the pre-registered DEAR cut-off; CALM is below 0.8858).',
    lookFor: 'Today’s NQ/SPX range lines are likely too tight — expect more days past the p75 line. Do NOT fade on a dear day and do not follow for a trade either (+0.02 R). This is the strongest index width input the desk has; the Daily Read tag carries it.',
    instruments: ['NQ', 'SPX500'],
    outcome: { kind: 'rangeRatio', instruments: ['SPX500', 'NQ'], horizons: [1, 5], unit: '× trailing-20 median range', base: { 1: 'dear days: 32.5% past the p75 line vs 25% design', 5: 'not scored in the study' }, read: 'Next-session range ÷ the trailing 20-session median; above 1.0 is the too-tight-lines day the study found.' },
  },
  {
    id: 'watch-breadth-all-down', evidenceId: 'breadth-all-down', group: 'breadth', source: 'desk', kind: 'tested',
    label: 'Every index closed down (breadth wipe-out)', source_doc: 'MARKET_SENSE_TESTS.md M12',
    claim: 'A session where every index closes down is followed by a wider week.',
    verdict: 'VALIDATED (n=1,002 since 2008): next-5 range SPX500 +0.31 ATR [+0.17, +0.45], NAS100 +0.26 [+0.15, +0.38]; two in a row +0.55 / +0.35. Direction 58–61% up — the ordinary drift.',
    rule: 'S&P 500, Nasdaq, Russell 2000, DAX, FTSE 100 and Nikkei all closed below the prior session on the latest common date in the drill bundle.',
    lookFor: 'Expect the coming week wider on the indices. It is a RANGE fact, not a bounce call: the 58–61% up-share afterwards is what the index does anyway. Two wipe-outs in a row roughly doubles the effect.',
    instruments: ['SPX500', 'NQ'],
    outcome: { kind: 'rangeRatio', instruments: ['SPX500', 'NQ'], horizons: [5], unit: '× trailing-20 median range', base: { 5: 'SPX500 +0.31 ATR [+0.17, +0.45], NAS100 +0.26 [+0.15, +0.38]' }, read: 'Mean daily range over the next five sessions ÷ the trailing 20-session median; above 1.0 is the wider week.' },
  },
  {
    id: 'watch-crack-blowout', evidenceId: 'crack-blowout-range', group: 'energy', source: 'desk', kind: 'claim',
    label: 'Crack-spread blow-out (20-session change ≥ +2z)', source_doc: 'CRACK_SPREAD.md',
    claim: 'A crack-spread blow-out is followed by a wider month in crude, USD/CAD and gold.',
    verdict: 'TESTED NULL (61 episodes since 1996, 24–25 with price history): WTI +0.13 ATR [−0.02, +0.16], USD/CAD −0.03, gold −0.06 — no range trigger.',
    rule: '20-session change in the 3-2-1 crack at or above +2 standard deviations of its own trailing history (the study used ten years; /api/crack carries 260 sessions, so the z here is against that shorter window — stated, not hidden).',
    lookFor: 'Refining margins have blown out. Crude leans a little wider over the month and the interval touches zero; FX and gold do nothing. The useful read is the macro one: crack → inflation pricing on the chain. Watch breakevens, not a crude range.',
    instruments: ['OIL'],
    outcome: { kind: 'rangeRatio', instruments: ['OIL'], horizons: [20], unit: '× trailing-20 median range', base: { 20: 'WTI +0.13 ATR [−0.02, +0.16] vs control (null)' }, read: 'WTI mean daily range over the next 20 sessions ÷ the trailing 20-session median.' },
  },
  {
    id: 'watch-yield-move', evidenceId: 'yield-move-fx-range', group: 'rates', source: 'desk', kind: 'claim',
    label: 'Big day in the US 10-year (top decile |Δ|)', source_doc: 'YIELD_MOVE_FX_RANGE_PREREG.md',
    claim: 'A large move in the US 10-year precedes a WIDER FX session.',
    verdict: 'TESTED NULL against a positive prior (1,915 top-decile days, 260 de-clustered per pair, 2010–2026): EUR/USD +0.10 [+0.01, +0.20] next session alone; USD/JPY and GBP/USD do not clear, no half-split clears. The mirror (a yield FALL) widens on 3 of 3 — the risk-off episode, not the yield.',
    rule: '|one-day change in DGS10| at or above the 90th percentile of its trailing 504 sessions (the pre-registration’s own threshold).',
    lookFor: 'Do not write that a big rates day means a wild FX session. If the yield FELL, the wider FX that follows belongs to the risk-off episode it sits inside. Watch EUR/USD’s next session against +0.10 ATR; expect nothing on the yen or sterling.',
    instruments: ['EURUSD', 'USDJPY', 'GBPUSD'],
    outcome: { kind: 'rangeRatio', instruments: ['EURUSD', 'USDJPY', 'GBPUSD'], horizons: [1, 5], unit: '× trailing-20 median range', base: { 1: 'EUR/USD +0.10 ATR [+0.01, +0.20]; USD/JPY, GBP/USD null', 5: 'EUR/USD +0.05 [+0.01, +0.11]; others null' }, read: 'Range ÷ trailing-20 median per pair; the study measured in ATR.' },
  },
  {
    id: 'watch-nr7-spx', evidenceId: 'narrow-day-expansion', group: 'price', source: 'desk', kind: 'claim',
    label: 'NR7 on the S&P (narrowest session of seven)', source_doc: 'TECHNICAL_RANGE_TESTS.md T1',
    claim: 'An inside day or NR7 is a coiled spring — the next day expands.',
    verdict: 'TESTED NULL, sign reversed (8 instruments, ~2,490 sessions each, 2016→): after an NR7 the next session is NARROWER with the interval clear on SPX500 (−0.17 ATR), NAS100 (−0.13), USD/JPY (−0.17); the 5-session range narrower too. Direction 49–55%.',
    rule: 'The latest SPX500 daily bar’s high−low is strictly the smallest of the last seven (the desk-watch OANDA bars, London-anchored).',
    lookFor: 'Quiet days cluster. A narrow day is a reason to expect a NARROW day, not a breakout — never write “coiled spring”. Watch the next session against the trailing-20 median range: history says below it.',
    instruments: ['SPX500', 'NQ'],
    outcome: { kind: 'rangeRatio', instruments: ['SPX500', 'NQ'], horizons: [1, 5], unit: '× trailing-20 median range', base: { 1: 'SPX500 −0.17 ATR, NAS100 −0.13 vs matched days (narrower)', 5: 'narrower too' }, read: 'Below 1.0 is the quiet-days-cluster result; above 1.0 would be the breakout the story promises.' },
  },
  {
    id: 'watch-repo-headline', evidenceId: 'repo-stress-range', group: 'funding', source: 'desk', kind: 'claim',
    label: 'SOFR above the Fed floor (headline, ≥ 10bp)', source_doc: 'PLUMBING.md P1 / FUNDING_STRESS_PREREG.md',
    claim: 'Repo stress — SOFR well above the Fed floor — precedes a wider week.',
    verdict: 'CONTEXT, not a trigger (26 episodes 2018–2026): SPX500 +0.14 ATR [−0.54, +0.98], EUR/USD +0.13, USD/JPY +0.08; the dollar moved LESS. Fires on a quarter of sessions since 2024 — month-end plumbing. funding-stress (NULL) found the away-from-month-end version is mid-month tax dates.',
    rule: 'Headline SOFR minus the Fed floor (IORB) at or above 10bp (P1 used the SOFR 99th percentile, which no free feed carries daily; the headline is the knowable proxy).',
    lookFor: 'Read it as month-end or mid-month settlement tightness unless the backstops (SRF, discount window) are drawn. Do not write “funding stress”. Watch whether it clears within two sessions, which is what plumbing does.',
    instruments: ['SPX500', 'EURUSD', 'USDJPY'],
    outcome: { kind: 'rangeRatio', instruments: ['SPX500', 'EURUSD', 'USDJPY'], horizons: [5], unit: '× trailing-20 median range', base: { 5: 'SPX500 +0.14 [−0.54, +0.98], EUR/USD +0.13, USD/JPY +0.08 (context)' }, read: 'Range ÷ trailing-20 median; the study measured in ATR.' },
  },
  // Gauge rows: progress + look-for on a trigger js/deskWatch.js already carries. No new trigger.
  {
    id: 'gauge-vix-inversion', watchId: 'vix-inversion', evidenceId: 'vix-inversion', group: 'volatility', source: 'desk',
    label: 'VIX above VIX3M', source_doc: 'MARKET_SENSE_TESTS.md S1',
    claim: 'Near-term fear priced above the 3-month is followed by a wider week.',
    verdict: 'VALIDATED (86 inversions since 2008): first day → next-5 range SPX500 +0.76 ATR, NAS100 +0.82, USD/JPY +0.44, gold +0.43, all intervals clear. Inversions are brief (median 1 session). mv-vixterm-range reproduces it on a second harness.',
    rule: 'VIX ≥ VIX3M (FRED VIXCLS / VXVCLS). Gauge: VIX ÷ VIX3M from 0.80 toward 1.0 (approaching from 0.95).',
    lookFor: 'The effect is on the FIRST day of an inversion; later days were not tested. Widen the expected range before sizing on the indices, the yen and gold. Never a direction: 57% up against an 80% control.',
    instruments: ['SPX500', 'NQ', 'USDJPY', 'GOLD'], outcome: null,
  },
  {
    id: 'gauge-nq-down-week', watchId: 'nq-down-week', evidenceId: 'nq-down-week', group: 'price', source: 'desk',
    label: 'Nasdaq down-week', source_doc: 'GROWTH_VS_YIELDS_TEST.md',
    claim: 'After a Nasdaq down-week the next session runs wider.',
    verdict: 'VALIDATED (n=1,232): NAS100 ≤ −1% over five sessions → next session +0.19 to +0.23 ATR; the yield leg it was sold with is a passenger.',
    rule: 'NAS100 five-session return ≤ −1%. Gauge: the decline toward −1%.',
    lookFor: 'Expect the NEXT session about 20% wider on the Nasdaq. The 5-day up-share afterwards is 58%, a base rate — not a bounce call.',
    instruments: ['NQ'], outcome: null,
  },
  {
    id: 'gauge-front-end-shock', watchId: 'front-end-shock', evidenceId: 'front-end-shock', group: 'rates', source: 'desk',
    label: '2-year weekly shock (±14bp)', source_doc: 'MARKET_SENSE_TESTS.md S3',
    claim: 'A front-end rates shock means FX volatility the following week.',
    verdict: 'TESTED NULL (~211 shocks per pair): after a 2Y UP shock EUR/USD and GBP/USD ran CALMER (−0.34 / −0.28 ATR, clear of zero); after a DOWN shock USD/JPY marginally wider (+0.33).',
    rule: '|five-session change in DGS2| ≥ 14bp. Gauge: |Δ| toward 14bp.',
    lookFor: 'Do not write “the rate shock means a volatile week in FX”. A hawkish repricing has been followed by a QUIETER week in the dollar pairs. Describe the policy repricing; expect nothing of FX range.',
    instruments: ['EURUSD', 'USDJPY', 'GBPUSD'], outcome: null,
  },
  {
    id: 'gauge-curve-2s10s', watchId: 'curve-2s10s', evidenceId: 'curve-inversion', group: 'rates', source: 'desk',
    label: '2s10s inversion', source_doc: 'CURVE_INVERSION_PREREG.md',
    claim: 'An inverted curve is followed by weaker risk assets and an under-priced recession.',
    verdict: 'TESTED NULL (ten episodes 1976–2026): forward Nasdaq does not separate from a month-matched control at any horizon; steepenings were followed by WORSE returns. Recession within 24 months 6 of 10, [31%, 83%] — contains a coin.',
    rule: 'DGS10 − DGS2 < 0. Gauge: the spread closing in from +50bp.',
    lookFor: 'Never write that an inversion means equities fall. Report the recession association descriptively (6 of 10 within two years) and stop. The chain’s curve node reads 2y-vs-30y with a level/slope/curvature split, which says more.',
    instruments: [], outcome: null,
  },
  {
    id: 'gauge-stock-bond', watchId: 'stock-bond-together', evidenceId: 'stock-bond-flip', group: 'macro', source: 'desk',
    label: 'Stocks and bonds moving together', source_doc: 'MARKET_SENSE_TESTS.md S2',
    claim: 'Stocks and bonds falling together marks an inflation regime.',
    verdict: 'CONTEXT (71 episodes since 2008, median 5 sessions, p75 17, 17% of days); only 36 clean flips — too few to test what follows.',
    rule: '20-day SPY/TLT price correlation ≥ +0.3. Gauge: correlation toward +0.3.',
    lookFor: 'Bonds are not hedging equities right now — a SIZING fact. Say how long such episodes have lasted (median five sessions); do not claim what follows or why.',
    instruments: [], outcome: null,
  },
  {
    id: 'gauge-oil-without-bei', watchId: 'oil-without-breakevens', evidenceId: 'oil-to-breakevens', group: 'energy', source: 'desk',
    label: 'Oil moved, breakevens did not', source_doc: 'MARKET_SENSE_TESTS.md S4',
    claim: 'An oil move takes time to reach inflation expectations — a quiet link will catch up.',
    verdict: 'TESTED NULL: no lag. A ±10% 20-day oil move is followed by no excess breakeven change at 5, 10 or 20 sessions; only 43% of oil shocks see 5bp of breakeven the same way within 20 sessions.',
    rule: '|20-session oil move| ≥ 10% while |14-session 10-year breakeven change| < 5bp. Gauge: the oil move toward 10% (halved while breakevens are moving with it).',
    lookFor: 'If breakevens did not move with oil, the bond market has already made its call — do not write “not yet”. Watch the crack: a rising crack with falling crude is the bond market keeping its inflation view (crack-inflation-channel).',
    instruments: [], outcome: null,
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

// realised vol of closes, annualised %, over the last n returns ending at index i
function realisedVol(closes, i, n = 20) {
  if (i < n) return null; const r = [];
  for (let k = i - n + 1; k <= i; k++) r.push(Math.log(closes[k] / closes[k - 1]));
  const m = r.reduce((a, b) => a + b, 0) / n; const v = r.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1);
  return Math.sqrt(v * 252) * 100;
}
function detectIvOverRv(bundle) {
  const J = joined(bundle, ['vix', 'spx']); const n = J.idx.length;
  if (n < 504 + 21) return null;
  const ratio = J.v.vix.map((v, i) => { const rv = realisedVol(J.v.spx, i); return rv ? v / rv : null; });
  const i = n - 1; if (ratio[i] == null) return null;
  const hist = ratio.slice(i - 504, i).filter(Number.isFinite), thr = quantile(hist, 0.90), rank = pctRank(hist, ratio[i]);
  return { reading: ratio[i], threshold: thr, progress: clamp01((rank - 0.70) / 0.20), live: ratio[i] >= thr, asOf: J.dates[i], extra: { rank, vix: J.v.vix[i], rv: +(J.v.vix[i] / ratio[i]).toFixed(2) },
    detail: `VIX ${J.v.vix[i].toFixed(1)} against 20-session realised SPX vol ${(J.v.vix[i] / ratio[i]).toFixed(1)}%: ratio ${ratio[i].toFixed(2)}, the ${Math.round(rank * 100)}th percentile of its trailing 504 sessions (top decile is ≥ ${thr.toFixed(2)}) as of ${J.dates[i]}.` };
}
function detectVolFront(bundle) {
  const J = joined(bundle, ['vix9d', 'vix']); const n = J.idx.length; if (n < 2) return null;
  const i = n - 1, r = J.v.vix9d[i] / J.v.vix[i]; const DEAR = 0.9669, CALM = 0.8858;
  return { reading: r, threshold: DEAR, progress: clamp01((r - 0.80) / (DEAR - 0.80)), live: r >= DEAR, asOf: J.dates[i], extra: { vix9d: J.v.vix9d[i], vix: J.v.vix[i], state: r >= DEAR ? 'dear' : r < CALM ? 'calm' : 'normal' },
    detail: `VIX9D ${J.v.vix9d[i].toFixed(2)} ÷ VIX ${J.v.vix[i].toFixed(2)} = ${r.toFixed(3)} (${r >= DEAR ? 'DEAR' : r < CALM ? 'CALM' : 'normal'}; dear ≥ 0.9669, calm < 0.8858) as of ${J.dates[i]}.` };
}
const IDX_KEYS = ['spx', 'nq', 'r2k', 'de30', 'uk100', 'jp225'];
function detectAllDown(bundle) {
  const J = joined(bundle, IDX_KEYS); const n = J.idx.length; if (n < 3) return null;
  const i = n - 1, down = IDX_KEYS.filter(k => J.v[k][i] < J.v[k][i - 1]);
  const prevDown = IDX_KEYS.filter(k => J.v[k][i - 1] < J.v[k][i - 2]).length;
  return { reading: down.length, threshold: IDX_KEYS.length, progress: down.length / IDX_KEYS.length, live: down.length === IDX_KEYS.length, asOf: J.dates[i], extra: { down, twoInARow: down.length === IDX_KEYS.length && prevDown === IDX_KEYS.length },
    detail: `${down.length} of ${IDX_KEYS.length} indices closed down on ${J.dates[i]}${down.length ? ` (${down.join(', ')})` : ''}${prevDown === IDX_KEYS.length ? '; all six were down the session before too' : ''}.` };
}
function detectCrackBlowout(crack) {
  const rows = (crack ?? []).filter(r => Number.isFinite(r?.value)); const n = rows.length; if (n < 120) return null;
  const d = rows.map((r, i) => i < 20 ? null : r.value - rows[i - 20].value).filter(Number.isFinite);
  const cur = d[d.length - 1], hist = d.slice(0, -1); const m = hist.reduce((a, b) => a + b, 0) / hist.length, sd = Math.sqrt(hist.reduce((a, b) => a + (b - m) ** 2, 0) / hist.length);
  if (!(sd > 0)) return null; const z = (cur - m) / sd;
  return { reading: z, threshold: 2, progress: clamp01(z / 2), live: z >= 2, asOf: rows[n - 1].date, extra: { chg20: cur, crack: rows[n - 1].value, window: hist.length },
    detail: `3-2-1 crack ${rows[n - 1].value.toFixed(1)} $/bbl, ${fmt(cur, 2)} over 20 sessions — z ${fmt(z, 2)} against the ${hist.length} windows the feed carries (blow-out is +2) as of ${rows[n - 1].date}.` };
}
function detectYieldMove(bundle) {
  const J = joined(bundle, ['us10y']); const n = J.idx.length; if (n < 504 + 2) return null;
  const d = J.v.us10y.map((v, i) => i ? (v - J.v.us10y[i - 1]) * 100 : null);
  const i = n - 1, hist = d.slice(i - 504, i).map(Math.abs).filter(Number.isFinite), thr = quantile(hist, 0.90);
  return { reading: d[i], threshold: thr, progress: clamp01(Math.abs(d[i]) / thr), live: Math.abs(d[i]) >= thr, asOf: J.dates[i], extra: { fell: d[i] < 0 },
    detail: `US 10-year ${fmt(d[i], 1)}bp on ${J.dates[i]}; the trailing-504 top-decile line is ±${thr.toFixed(1)}bp.${Math.abs(d[i]) >= thr && d[i] < 0 ? ' A yield FALL — the mirror the study flagged as the risk-off episode, not the yield.' : ''}` };
}
function detectNr7(bars) {
  if (!Array.isArray(bars) || bars.length < 7) return null;
  const last7 = bars.slice(-7).filter(b => Number.isFinite(b.high) && Number.isFinite(b.low)); if (last7.length < 7) return null;
  const rng = last7.map(b => b.high - b.low), today = rng[6], prior = rng.slice(0, 6);
  const wider = prior.filter(r => r > today).length;        // 6 = narrowest of seven
  return { reading: today, threshold: Math.min(...prior), progress: wider / 6, live: wider === 6, asOf: last7[6].date, extra: { wider },
    detail: `SPX500 range ${today.toFixed(1)} pts on ${last7[6].date}: narrower than ${wider} of the previous six sessions (NR7 needs all six).` };
}
function detectRepoHeadline(funding) {
  const rows = (funding ?? []).filter(r => Number.isFinite(r?.value)); const n = rows.length; if (!n) return null;
  const v = rows[n - 1].value * 100;     // percent → bp
  return { reading: v, threshold: 10, progress: clamp01(v / 10), live: v >= 10, asOf: rows[n - 1].date, extra: {},
    detail: `Headline SOFR ${fmt(v, 0)}bp against the Fed floor on ${rows[n - 1].date} (the read fires at +10bp).` };
}
// gauges on triggers deskWatch already carries — progress only, same inputs the trigger reads
const GAUGE = {
  'gauge-vix-inversion': ({ fred }) => { const v = fred?.vix?.value, v3 = fred?.vix3m?.value; if (v == null || v3 == null) return null; const r = v / v3; return { reading: r, threshold: 1, progress: clamp01((r - 0.80) / 0.20), live: r >= 1, extra: { vix: v, vix3m: v3 }, detail: `VIX ${v.toFixed(1)} ÷ VIX3M ${v3.toFixed(1)} = ${r.toFixed(3)} (inverts at 1.0).` }; },
  'gauge-nq-down-week': ({ series }) => { const nq = series?.nq, l = _last(nq), r = _nth(nq, 5); if (!l || !r) return null; const wk = (l.value / r.value - 1) * 100; return { reading: wk, threshold: -1, progress: clamp01(-wk / 1), live: wk <= -1, extra: {}, detail: `NAS100 ${fmt(wk, 2)}% over five sessions (${r.date} → ${l.date}); the down-week line is −1%.` }; },
  'gauge-front-end-shock': ({ hist }) => { const h = hist?.us2y, l = _last(h), r = _nth(h, 5); if (!l || !r) return null; const d = (l.value - r.value) * 100; return { reading: d, threshold: 14, progress: clamp01(Math.abs(d) / 14), live: Math.abs(d) >= 14, extra: {}, detail: `2-year ${fmt(d, 0)}bp over five sessions (${r.date} → ${l.date}); the shock line is ±14bp.` }; },
  'gauge-curve-2s10s': ({ fred }) => { const s2 = fred?.us2y?.value, s10 = fred?.us10y?.value; if (s2 == null || s10 == null) return null; const sp = (s10 - s2) * 100; return { reading: sp, threshold: 0, progress: clamp01(1 - sp / 50), live: sp < 0, extra: {}, detail: `2s10s ${fmt(sp, 0)}bp (inverts below zero; the gauge counts in from +50bp).` }; },
  'gauge-stock-bond': ({ stockBond }) => { const c = stockBond?.corr; if (!Number.isFinite(c)) return null; return { reading: c, threshold: 0.3, progress: clamp01(c / 0.3), live: c >= 0.3, extra: { asOf: stockBond.asOf }, detail: `20-day SPY/TLT correlation ${fmt(c, 2)} as of ${stockBond.asOf} (together at +0.30).` }; },
  'gauge-oil-without-bei': ({ series, hist }) => { const lo = _last(series?.oil), ro = _nth(series?.oil, 20), lb = _last(hist?.bei), rb = _nth(hist?.bei, 14); if (!lo || !ro || !lb || !rb) return null; const o20 = (lo.value / ro.value - 1) * 100, b20 = (lb.value - rb.value) * 100; const quiet = Math.abs(b20) < 5; return { reading: o20, threshold: 10, progress: clamp01(Math.abs(o20) / 10) * (quiet ? 1 : 0.5), live: Math.abs(o20) >= 10 && quiet, extra: { b20 }, detail: `Oil ${fmt(o20, 1)}% over 20 sessions while 10-year breakevens moved ${fmt(b20, 0)}bp (fires at ±10% with breakevens inside ±5bp).` }; },
};

const DETECT = {
  'claim-breadth-narrow': ({ bundle }) => detectBreadth(bundle, 'narrow'),
  'claim-breadth-broad': ({ bundle }) => detectBreadth(bundle, 'broad'),
  'claim-semis-tilt': ({ bundle }) => detectSemisTilt(bundle),
  'claim-dispersion-rising': ({ bundle }) => detectDispersion(bundle, 'rising'),
  'claim-dispersion-falling': ({ bundle }) => detectDispersion(bundle, 'falling'),
  'claim-fear-spike': ({ bundle }) => detectFearSpike(bundle),
  'claim-rotation-extreme': ({ bundle }) => detectRotation(bundle),
  'claim-crack-disagreement': ({ crack }) => detectCrack(crack),
  'watch-iv-over-rv': ({ bundle }) => detectIvOverRv(bundle),
  'watch-vol-front-dear': ({ bundle }) => detectVolFront(bundle),
  'watch-breadth-all-down': ({ bundle }) => detectAllDown(bundle),
  'watch-crack-blowout': ({ crack }) => detectCrackBlowout(crack),
  'watch-yield-move': ({ bundle }) => detectYieldMove(bundle),
  'watch-nr7-spx': ({ series }) => detectNr7(series?.spx),
  'watch-repo-headline': ({ funding }) => detectRepoHeadline(funding),
};
/** Register rows that emit a trigger (no watchId) and rows that only gauge an existing one. */
export const DETECTOR_ROWS = CLAIMS.filter(c => !c.watchId);
export const GAUGE_ROWS = CLAIMS.filter(c => c.watchId);

/**
 * Desk-watch trigger objects for every DETECTOR row whose input is present. Missing input →
 * no trigger (never a false clear). Inputs are the desk-watch inputs: { bundle (the drill
 * bundle), crack, series (OANDA bars), fred, hist, stockBond, funding }.
 */
export function evaluateClaims(inputs = {}) {
  const out = [];
  for (const c of DETECTOR_ROWS) {
    let r = null;
    try { r = DETECT[c.id](inputs); } catch { r = null; }
    if (!r) continue;
    const stage = stageOf(r.progress, r.live), who = c.source === 'Crown' ? 'Crown’s claim' : 'The claim';
    out.push({
      id: c.id, kind: c.kind ?? 'claim', evidenceId: c.evidenceId, claimId: c.id, source: c.source, label: `Setup watch · ${c.label}`,
      firing: r.live, stage, instruments: c.instruments, expect: [],
      value: { reading: +Number(r.reading).toFixed(4), threshold: r.threshold == null ? null : +Number(r.threshold).toFixed(4), progress: +r.progress.toFixed(3), asOf: r.asOf, ...r.extra },
      detail: `${r.detail} ${stage === STAGE.live ? 'The setup is LIVE.' : stage === STAGE.approaching ? `Approaching — ${Math.round(r.progress * 100)}% of the way to the threshold.` : ''} ${who}: ${c.claim} This desk: ${c.verdict}`.trim(),
      lookFor: c.lookFor,
    });
  }
  return out;
}
/**
 * Gauges for the GAUGE rows: progress/stage/look-for on a trigger deskWatch already emits.
 * Not triggers — nothing here is pushed to `states`, so nothing alerts twice. `firing` is
 * the mirrored condition, computed the same way the trigger computes it, for the gauge bar.
 */
export function evaluateGauges(inputs = {}) {
  const out = [];
  for (const c of GAUGE_ROWS) {
    let r = null;
    try { r = GAUGE[c.id](inputs); } catch { r = null; }
    if (!r) continue;
    const stage = stageOf(r.progress, r.live);
    out.push({ id: c.id, kind: 'gauge', watchId: c.watchId, evidenceId: c.evidenceId, claimId: c.id, source: c.source, label: `Setup watch · ${c.label}`,
      firing: r.live, stage, instruments: c.instruments, lookFor: c.lookFor,
      value: { reading: +Number(r.reading).toFixed(4), threshold: r.threshold == null ? null : +Number(r.threshold).toFixed(4), progress: +r.progress.toFixed(3), ...r.extra },
      detail: `${r.detail}${stage === STAGE.approaching ? ` Approaching — ${Math.round(r.progress * 100)}% of the way to the threshold.` : ''} This desk: ${c.verdict}` });
  }
  return out;
}

// ── forward scoring ───────────────────────────────────────────────────────────
// Fills `outcomes` on claim fires (log entries with kind 'claim' and event 'started')
// once each pre-registered horizon has elapsed. Bundle-based metrics use the joined
// rows of the series the study used; range ratios need high/low and come from the
// desk-watch OANDA bars (`series`: { spx:[{date,value,high,low}], nq:[…] }).
const INSTR_KEY = { SPX500: 'spx', NQ: 'nq', GOLD: 'gold', OIL: 'oil', EURUSD: 'eurusd', USDJPY: 'usdjpy', GBPUSD: 'gbpusd' };
function rangeRatio(bars, fireDate, h) {
  if (!Array.isArray(bars) || bars.length < 22) return null;
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
    if (f.event !== 'started') continue;
    const c = CLAIM_BY_ID[f.claimId ?? f.id]; if (!c?.outcome) continue;
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
