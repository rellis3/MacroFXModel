// Gold vs Gold-Miners (GDX vs Gold) stat-arb — mechanises the owner-supplied
// spec: rolling hedge-ratio z-score, an ADF-style cointegration gate, scale-in/
// scale-out tranches, a VIX macro filter, $ risk-based position sizing, and a
// hard/time/macro stop ladder.
//
// Lego Principle 1 — reuses the platform's EXISTING pairs cointegration
// primitives (`olsFit`, `halfLife`, `passesCointegration`) from
// hedgeSignalV2Engine.js instead of re-deriving an ADF test from scratch. That
// module's `passesCointegration` is the honest equivalent of the spec's
// "ADF p-value > 0.05" gate: an OU λ t-stat compared against a documented
// Engle-Granger 5% critical value, rather than a fabricated p-value from a
// hand-rolled MacKinnon approximation. Everything else here (tranche sizing,
// VIX gate, $ risk, exit ladder) is a NEW composition on top of that primitive
// — same pattern as macroFxZoneEngine.js / poiReactionV1Engine.js, not a new
// Tier-1 brick.
//
// Lego Principle 2 — `runGoldMinerArb(dates, gdx, gold, vix, opts)` is the ONE
// entry primitive. The full owner spec and a naive single-tranche baseline
// (for the OOS A/B, `GMA_BASELINE_OPTS`) are both just different `opts`
// bundles through the SAME walk-forward loop — not two copies.
//
// KNOWN, DELIBERATE DEVIATIONS FROM THE ORIGINAL SPEC (surfaced here + in the
// UI, never silently):
//  1. Timeframe: DAILY bars, not 15-minute. Free Yahoo 15m history only goes
//     back ~60 days — far short of the spec's own "2 years" calibration
//     requirement and too short for a real IS/OOS split (CLAUDE.md: ≥30 OOS
//     trades). Daily bars are the only way to honestly test this pair today.
//  2. "GC" leg: OANDA XAU_USD (spot gold), not CME GC futures. This sidesteps
//     a WORSE problem — Yahoo's GC=F is an unadjusted continuous front-month
//     series with real price jumps at roll dates that would corrupt the ADF
//     gate — at the cost of ignoring the (usually small) futures basis. A
//     genuine roll-adjusted GC series needs a broker feed (e.g. IB), not a
//     free API.
//  3. Time-of-day filter (spec §6C): not applicable to daily bars. Not
//     silently applied — the UI says so.
//  4. Costs: the original spec has NO cost section. Per CLAUDE.md ("costs on
//     by default — free fills are not honest") this engine deducts a
//     round-trip bps cost on every close event; there is no free-fill mode.
//  5. MAE is close-to-close over the daily bars a leg was open, not a true
//     intrabar spread path — there is no real intrabar path for a synthetic
//     two-leg spread built from two independently-sourced daily series.
//
// Pure math, no network, except `fetchGoldMinerArbData` — everything else
// takes arrays in and is unit-tested on synthetic data
// (`goldMinerArbEngine.test.mjs`).

import { olsFit, passesCointegration, V2_DEFAULTS as HEDGE_V2_DEFAULTS, runComparison as hedgeRunComparison } from './hedgeSignalV2Engine.js';
import { mean, stdev, rollingPercentile } from './statsCore.js';
import { summarizeSplit } from './honestForecastEngine.js';
import { fetchYahooDaily } from './nasdaqDataSources.js';
import { fetchD1 } from './volBacktestEngine.js';

// ── Defaults (the owner spec, section-numbered) ──────────────────────────────
export const GMA_DEFAULTS = {
  betaWindow: 90,          // §3.1 rolling OLS window (bars)
  adfWindow: 120,          // §3.4 cointegration-gate window (bars)
  cointTStat: HEDGE_V2_DEFAULTS.tStat,  // reuse the platform's own OU λ t-stat threshold
  entryZ1: 1.5, entryZ2: 2.5, entryZ3: 3.5,   // §5 / §8 scale-in tiers
  fracT1: 0.5, fracT2: 0.3, fracT3: 0.2,      // §5 / §8 tranche sizes (50/30/20)
  tp1Z: 0.8, tp1Frac: 0.5,                    // §7 take-profit 1 (close half)
  tp2Z: 0.2,                                  // §7 take-profit 2 (close the rest)
  stopZ: 4.0,                                 // §7 disaster stop
  timeStopBars: 5,                            // §7 time stop (trading days == daily bars)
  vixMax: 30,                                 // §6B / §7 macro filter + macro stop
  volPctileWindow: 20, volPctileHigh: 0.80, volPctileSizeCut: 0.5,  // §6A
  requireCointegration: true,
  accountEquity: 100000,
  riskPct: 0.01,           // §4 — 1% of equity risked per full position
  costBpsRoundTrip: 10,    // NOT in the original spec — added per CLAUDE.md "costs on by default"
  oosFrac: 0.4,
};

// Naive single-tranche baseline on the SAME signals — no VIX filter, no
// cointegration gate, no scale-in, single full-size in/out. The honest thing
// to A/B the full policy against (does the machinery add anything over the
// textbook "just fade |z|>=2" version?).
export const GMA_BASELINE_OPTS = {
  entryZ1: 2.0, entryZ2: Infinity, entryZ3: Infinity,
  fracT1: 1.0, fracT2: 0, fracT3: 0,
  tp1Z: 0.5, tp1Frac: 1.0, tp2Z: -1,   // TP1 alone does the full exit
  timeStopBars: Infinity,
  vixMax: Infinity, requireCointegration: false,
  volPctileHigh: 1.01, volPctileSizeCut: 1.0,  // never triggers (percentile is 0-100)
};

// ── Signal pre-pass (vectorized, no lookahead) ───────────────────────────────
// Every series here at index i uses ONLY data < i for the fitted beta/alpha,
// then evaluates bar i's own (already-known) close against that fit — the
// same no-lookahead convention as hedgeSignalV2Engine's rollingSpread.
function computeSignals(gdx, gold, o) {
  const n = gdx.length;
  const beta = new Array(n).fill(null);
  const spread = new Array(n).fill(null);
  const sd90 = new Array(n).fill(null);
  const z = new Array(n).fill(null);

  for (let i = o.betaWindow; i < n; i++) {
    const gdxWin = gdx.slice(i - o.betaWindow, i);
    const goldWin = gold.slice(i - o.betaWindow, i);
    const fit = olsFit(gdxWin, goldWin);
    if (!fit) continue;
    const spreadWin = gdxWin.map((g, k) => g - fit.beta * goldWin[k]);
    const m = mean(spreadWin), sd = stdev(spreadWin, 1);
    beta[i] = fit.beta;
    spread[i] = gdx[i] - fit.beta * gold[i];
    sd90[i] = sd;
    z[i] = sd > 1e-9 ? (spread[i] - m) / sd : 0;
  }

  // §3.4 cointegration gate — textbook Engle-Granger: fit ONE STATIC
  // regression (with intercept) over the adfWindow itself and test THAT
  // window's own residual for stationarity, exactly like
  // hedgeSignalV2Engine.cointegrationTest (just without its internal log
  // transform, since the owner spec regresses raw price, not log price).
  // Deliberately a SEPARATE fit from the 90-bar beta[] used for the live
  // z-score above — reusing the z-score's beta here would test the residual
  // of a regression partly fit ON the same data, which mechanically flatters
  // apparent stationarity (spurious "self-fit" mean-reversion) and is exactly
  // the pitfall Engle-Granger's non-standard critical values exist to guard
  // against.
  const cointPass = new Array(n).fill(false);
  const halfLifeBars = new Array(n).fill(null);
  const coTStat = new Array(n).fill(null);
  for (let i = o.adfWindow; i < n; i++) {
    const gdxWin = gdx.slice(i - o.adfWindow, i);
    const goldWin = gold.slice(i - o.adfWindow, i);
    const fit = olsFit(gdxWin, goldWin);
    if (!fit) continue;
    const resid = gdxWin.map((g, k) => g - (fit.alpha + fit.beta * goldWin[k]));
    const gate = passesCointegration(resid, { tStat: o.cointTStat, hlMin: 0, hlMax: Infinity });
    cointPass[i] = gate.pass;
    halfLifeBars[i] = Number.isFinite(gate.halfLife) ? gate.halfLife : null;
    coTStat[i] = gate.t;
  }

  // §6A — 20-bar realized vol of the spread, percentile-ranked against its own
  // trailing history (reuses statsCore.rollingPercentile — never re-inlined).
  const spreadDiff = new Array(n).fill(NaN);
  for (let i = 1; i < n; i++) if (spread[i] != null && spread[i - 1] != null) spreadDiff[i] = spread[i] - spread[i - 1];
  const vol20 = new Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    if (i < o.volPctileWindow) continue;
    const win = spreadDiff.slice(i - o.volPctileWindow + 1, i + 1).filter(Number.isFinite);
    if (win.length < o.volPctileWindow) continue;
    vol20[i] = stdev(win, 1);
  }
  const volPctile = rollingPercentile(vol20, Math.min(252, n));

  return { beta, spread, sd90, z, cointPass, halfLifeBars, coTStat, volPctile };
}

// ── Walk-forward state machine (the ONE primitive, parameterised) ───────────
// Returns one record per CLOSE EVENT (a partial TP1 close and the later full
// close of the same leg are two separate rows — that's how a real trade
// ledger reads). Record shape matches the house CSV-export + summarizeSplit
// contract: {date, filled, pnl_pct, mae_pct, stop_pct, R, pnl_dollar, risk_dollar}.
export function runGoldMinerArb(dates, gdx, gold, vix, opts = {}) {
  const o = { ...GMA_DEFAULTS, ...opts };
  const n = Math.min(dates.length, gdx.length, gold.length, vix.length);
  const sig = computeSignals(gdx.slice(0, n), gold.slice(0, n), o);
  const warmup = Math.max(o.betaWindow, o.adfWindow);
  const records = [];

  let dir = 0;                 // 0 flat, +1 long-spread (long GDX / short gold), -1 short-spread
  let tranches = [];           // [{units, remainingUnits, entrySpread}]
  let betaLocked = null;       // hedge ratio is LOCKED at first entry, never rebalanced mid-trade
  let entryOpenIdx = null;
  let entryZ = null, unitsFull = 0, stopDistDollars = null;
  let tp1Taken = false, reserveUsed = false;
  let maeWorst = 0;            // worst adverse $/unit excursion since the leg opened

  const heldSpread = i => gdx[i] - betaLocked * gold[i];
  const totalUnitsOpen = () => tranches.reduce((s, t) => s + t.remainingUnits, 0);
  const weightedEntrySpread = () => {
    const u = totalUnitsOpen();
    return u > 0 ? tranches.reduce((s, t) => s + t.remainingUnits * t.entrySpread, 0) / u : 0;
  };

  function addTranche(i, frac) {
    if (!(unitsFull > 0) || frac <= 0) return;
    const units = unitsFull * frac;
    tranches.push({ units, remainingUnits: units, entrySpread: heldSpread(i) });
  }

  function openFirstTranche(i) {
    dir = sig.z[i] > 0 ? -1 : 1;   // z>0: GDX rich vs gold -> short GDX/long gold; z<0: the reverse
    betaLocked = sig.beta[i];
    entryOpenIdx = i;
    entryZ = sig.z[i];
    const distSigma = Math.max(o.stopZ - Math.abs(entryZ), 0.25);  // floor avoids absurd sizing near the stop
    stopDistDollars = distSigma * sig.sd90[i];
    const confidence = Math.min(Math.abs(entryZ) / 2.5, 1.0);       // §6 confidence score
    const highVol = Number.isFinite(sig.volPctile[i]) && sig.volPctile[i] >= o.volPctileHigh * 100;
    const volMult = highVol ? o.volPctileSizeCut : 1.0;
    const totalRiskDollars = o.accountEquity * o.riskPct;
    unitsFull = stopDistDollars > 1e-9 ? (totalRiskDollars / stopDistDollars) * confidence * volMult : 0;
    tp1Taken = false; reserveUsed = false; maeWorst = 0;
    addTranche(i, o.fracT1);
  }

  function closeFraction(i, frac, reason) {
    const spreadNow = heldSpread(i);
    const entrySpreadForStats = weightedEntrySpread();
    let pnlDollar = 0, closedUnits = 0;
    for (const t of tranches) {
      const cu = t.remainingUnits * frac;
      pnlDollar += cu * dir * (spreadNow - t.entrySpread);
      t.remainingUnits -= cu;
      closedUnits += cu;
    }
    tranches = tranches.filter(t => t.remainingUnits > 1e-9);
    const notional = closedUnits * gdx[i];
    pnlDollar -= notional * (o.costBpsRoundTrip / 10000);

    const riskDollarFull = o.accountEquity * o.riskPct;
    const riskDollarEvent = unitsFull > 1e-9 ? riskDollarFull * (closedUnits / unitsFull) : riskDollarFull;
    const stopPct = Math.abs(entrySpreadForStats) > 1e-9 && stopDistDollars != null
      ? (stopDistDollars / Math.abs(entrySpreadForStats)) * 100 : 0;
    const maePct = Math.abs(entrySpreadForStats) > 1e-9 ? (maeWorst / Math.abs(entrySpreadForStats)) * 100 : 0;

    records.push({
      date: dates[i], filled: true,
      pnl_pct: +(100 * pnlDollar / o.accountEquity).toFixed(4),
      pnl_dollar: +pnlDollar.toFixed(2),
      risk_dollar: +riskDollarEvent.toFixed(2),
      R: riskDollarEvent > 1e-9 ? +(pnlDollar / riskDollarEvent).toFixed(3) : 0,
      mae_pct: +maePct.toFixed(3),
      stop_pct: +stopPct.toFixed(3),
      reason,
      direction: dir > 0 ? 'long_gdx_short_gold' : 'short_gdx_long_gold',
      z: +sig.z[i].toFixed(3),
      beta: +betaLocked.toFixed(4),
      cointegrated: sig.cointPass[i],
      halfLifeBars: sig.halfLifeBars[i],
      barsHeld: i - entryOpenIdx,
    });

    if (!tranches.length) {
      dir = 0; betaLocked = null; entryOpenIdx = null; unitsFull = 0; stopDistDollars = null; entryZ = null;
    }
    maeWorst = 0;
  }

  for (let i = warmup; i < n; i++) {
    if (dir !== 0) {
      const spreadNow = heldSpread(i);
      const avgEntry = weightedEntrySpread();
      const adverse = dir > 0 ? Math.max(0, avgEntry - spreadNow) : Math.max(0, spreadNow - avgEntry);
      if (adverse > maeWorst) maeWorst = adverse;

      if (vix[i] > o.vixMax) { closeFraction(i, 1, 'macro_stop'); continue; }               // §7 macro stop
      if ((i - entryOpenIdx) >= o.timeStopBars) { closeFraction(i, 1, 'time_stop'); continue; } // §7 time stop
      if (Math.abs(sig.z[i]) >= o.stopZ) { closeFraction(i, 1, 'hard_stop'); continue; }     // §7 disaster stop

      if (!tp1Taken && Math.abs(sig.z[i]) <= o.tp1Z) {                                       // §7 TP1
        closeFraction(i, o.tp1Frac, 'tp1');
        if (dir !== 0) tp1Taken = true;
      }
      if (dir !== 0 && Math.abs(sig.z[i]) <= o.tp2Z) { closeFraction(i, 1, 'tp2'); }          // §7 TP2 (same bar OK)

      if (dir !== 0 && (o.requireCointegration ? sig.cointPass[i] : true)) {                 // §5 / §8 scale-in
        const fracFilled = unitsFull > 0 ? totalUnitsOpen() / unitsFull : 1;
        const sameSideBreach2 = dir > 0 ? sig.z[i] <= -o.entryZ2 : sig.z[i] >= o.entryZ2;
        const sameSideBreach3 = dir > 0 ? sig.z[i] <= -o.entryZ3 : sig.z[i] >= o.entryZ3;
        if (sameSideBreach2 && fracFilled < o.fracT1 + o.fracT2 - 1e-6) addTranche(i, o.fracT2);
        if (sameSideBreach3 && !reserveUsed && fracFilled < 1 - 1e-6) { addTranche(i, o.fracT3); reserveUsed = true; }
      }
      continue;
    }

    // flat — check for a new entry (§5, gated by §3.4 + §6B)
    if (sig.beta[i] == null || sig.z[i] == null) continue;
    if (vix[i] > o.vixMax) continue;
    if (o.requireCointegration && !sig.cointPass[i]) continue;
    if (Math.abs(sig.z[i]) < o.entryZ1) continue;
    openFirstTranche(i);
  }

  return records;
}

// ── A/B: the full policy vs the naive baseline, IS/OOS split ────────────────
export function compareGoldMinerArb(dates, gdx, gold, vix, opts = {}) {
  const o = { ...GMA_DEFAULTS, ...opts };
  const policyTrades = runGoldMinerArb(dates, gdx, gold, vix, o);
  const baselineTrades = runGoldMinerArb(dates, gdx, gold, vix, { ...o, ...GMA_BASELINE_OPTS });
  return {
    policy: summarizeSplit(policyTrades, o.oosFrac),
    baseline: summarizeSplit(baselineTrades, o.oosFrac),
    policyTrades, baselineTrades,
  };
}

// Cross-check via the platform's ALREADY-BUILT, already-tested FX pairs
// cointegration engine (hedgeSignalV2Engine.js), unmodified, on this same
// pair — an independent sanity check that this new spec-faithful walk-forward
// loop isn't disagreeing with the platform's own proven pairs machinery.
export function crossCheckHedgeV2(gdx, gold, opts = {}) {
  return hedgeRunComparison({ GDX: gdx, GOLD: gold }, [['GDX', 'GOLD']], { ...HEDGE_V2_DEFAULTS, ...opts });
}

// ── Data fetch (the only network-touching export) ────────────────────────────
// Gold leg: OANDA XAU_USD spot (see file header §2 for why, not GC=F).
// GDX leg: Yahoo adjusted daily close. VIX: Yahoo ^VIX close.
export async function fetchGoldMinerArbData({ start = '2016-01-01' } = {}) {
  if (!process.env.OANDA_KEY) throw new Error('OANDA_KEY not set — cannot fetch XAU_USD (gold leg)');
  const [goldBars, gdxBars, vixBars] = await Promise.all([
    fetchD1('XAU_USD', 5000),
    fetchYahooDaily('GDX', { start }),
    fetchYahooDaily('^VIX', { start }),
  ]);
  const goldMap = new Map(goldBars.map(b => [b.date, b.close]));
  const gdxMap = new Map(gdxBars.map(b => [new Date(b.t).toISOString().slice(0, 10), b.adjclose]));
  const vixMap = new Map(vixBars.map(b => [new Date(b.t).toISOString().slice(0, 10), b.close]));
  const dates = [...goldMap.keys()].filter(d => gdxMap.has(d) && vixMap.has(d)).sort();
  return {
    dates,
    gold: dates.map(d => goldMap.get(d)),
    gdx: dates.map(d => gdxMap.get(d)),
    vix: dates.map(d => vixMap.get(d)),
    meta: {
      goldSource: 'OANDA XAU_USD (spot proxy for GC futures — see file header)',
      gdxSource: 'Yahoo GDX adjusted daily close',
      vixSource: 'Yahoo ^VIX daily close',
      n: dates.length,
      from: dates[0] ?? null, to: dates.at(-1) ?? null,
    },
  };
}

export async function runGoldMinerArbSuite(opts = {}) {
  const log = [];
  log.push('Fetching XAU_USD (OANDA D1) + GDX + ^VIX (Yahoo daily)…');
  const { dates, gold, gdx, vix, meta } = await fetchGoldMinerArbData(opts);
  log.push(`  ${meta.n} aligned daily bars (${meta.from} -> ${meta.to})`);
  if (meta.n < 500) {
    log.push(`  WARNING: only ${meta.n} aligned bars — OOS trade count is likely far below the CLAUDE.md >=30-trade bar for a real result.`);
  }
  const cmp = compareGoldMinerArb(dates, gdx, gold, vix, opts);
  log.push(`  policy: ${cmp.policyTrades.length} close-events, baseline: ${cmp.baselineTrades.length} close-events`);
  let crossCheck = null;
  try {
    crossCheck = crossCheckHedgeV2(gdx, gold, opts);
    log.push(`  cross-check (hedgeSignalV2Engine, same pair): cointegrated=${crossCheck.perPair[0]?.cointegrated}, halfLife=${crossCheck.perPair[0]?.halfLife}`);
  } catch (e) {
    log.push(`  cross-check skipped: ${e.message}`);
  }
  return { dates, meta, ...cmp, crossCheck, log, opts };
}
