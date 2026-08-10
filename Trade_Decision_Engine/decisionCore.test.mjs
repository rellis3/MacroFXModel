// Trade Decision Engine — synthetic, no-network unit tests.
// Run: node Trade_Decision_Engine/decisionCore.test.mjs
import assert from 'node:assert/strict';
import { decide, nearestZone, buildEventFeatures, scoreLogistic, sessionPhaseUTC, macroState, MACRO_RISK_SENS_MIN, INTRADAY_FEATURES, HTF_FEATURES } from './decisionCore.js';
import { computeIntradayState, computeSessionLadders, confluenceCapsFor } from './featureState.js';
import { newsGate, pairCurrencies } from './newsGate.js';
import { buildSnapshot, syntheticBars, syntheticSnapshot } from './featureState.js';
import { MODEL_V0 } from './modelV0.js';
import { MODEL_V1 } from './modelV1.js';

let passed = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); passed++; };

const NOW = Date.parse('2026-07-01T14:00:00Z');   // NY session, fixed for determinism

// ── newsGate ─────────────────────────────────────────────────────────────────
{
  const cur = pairCurrencies('eurusd');
  ok(cur[0] === 'EUR' && cur[1] === 'USD', 'pairCurrencies parses fx');
  ok(pairCurrencies('gold').includes('USD'), 'gold is USD-exposed');

  const ev = t => [{ timeMs: NOW + t * 60_000, impact: 'high', currency: 'USD', title: 'NFP' }];
  ok(newsGate(ev(20), NOW, cur).blocked, 'high-impact in 20m → blocked');
  ok(newsGate(ev(-10), NOW, cur).blocked, 'high-impact 10m ago → still blocked');
  const soft = newsGate(ev(120), NOW, cur);
  ok(!soft.blocked && soft.softNewsSoon, 'high-impact in 2h → soft flag, not blocked');
  ok(!newsGate(ev(20), NOW, ['GBP', 'JPY']).blocked, 'other-currency event ignored');
  ok(!newsGate([{ timeMs: NOW + 20 * 60_000, impact: 'low', currency: 'USD' }], NOW, cur).blocked,
    'low impact never blocks');
}

// ── snapshot building (pure, synthetic bars) ─────────────────────────────────
const snap = syntheticSnapshot('eurusd', { seed: 7, nowMs: NOW, newsInMin: null });
{
  ok(snap.pair === 'eurusd' && snap.mode === 'synthetic', 'snapshot identity');
  ok(snap.sigmaDaily > 0 && snap.sigmaDaily < 0.05, `σ sane (${snap.sigmaDaily.toFixed(4)})`);
  ok(snap.volPct >= 0 && snap.volPct <= 1, 'vol percentile in [0,1]');
  ok(['BULL', 'BEAR', 'RANGE'].includes(snap.regime), 'regime classified');
  ok(snap.T >= 0 && snap.T <= 1, 'T in [0,1]');
  ok(snap.zones.length > 3, `zone map built (${snap.zones.length} zones)`);
  ok(snap.zones.every(z => Number.isFinite(z.price) && z.count >= 1), 'zones well-formed');
  // no lookahead by construction: buildSnapshot only ever sees completed bars —
  // assert determinism instead (same inputs → same snapshot)
  const snap2 = syntheticSnapshot('eurusd', { seed: 7, nowMs: NOW, newsInMin: null });
  assert.deepEqual(snap2.zones, snap.zones); passed++;
  assert.equal(snap2.sigmaDaily, snap.sigmaDaily); passed++;
}

// ── nearestZone ──────────────────────────────────────────────────────────────
{
  const sigmaAbs = snap.sigmaDaily * snap.dayOpen;
  const z = snap.zones[0];
  const hit = nearestZone(snap.zones, z.price, sigmaAbs);
  ok(hit && Math.abs(hit.zone.price - z.price) < 1e-9 && hit.distSigma === 0, 'exact touch found');
  ok(nearestZone(snap.zones, z.price + 5 * sigmaAbs, sigmaAbs) === null
    || Math.abs(nearestZone(snap.zones, z.price + 5 * sigmaAbs, sigmaAbs)?.distSigma) <= 0.35,
    'far price → no zone (unless another zone is genuinely near)');
}

// ── decide: hard gates fail closed ───────────────────────────────────────────
{
  const r1 = decide(null, { pair: 'eurusd' }, { nowMs: NOW });
  ok(r1.decision === 'skip' && r1.reasons.includes('no_snapshot') && r1.probability === null,
    'no snapshot → skip, null probability');

  const stale = { ...snap, mode: 'live', builtAt: NOW - 60 * 60_000 };
  const r2 = decide(stale, { price: snap.zones[0].price }, { nowMs: NOW });
  ok(r2.decision === 'skip' && r2.reasons.includes('stale_features'), 'stale live snapshot → fail closed');

  const newsy = { ...snap, calendar: [{ timeMs: NOW + 10 * 60_000, impact: 'high', currency: 'USD', title: 'FOMC' }] };
  const r3 = decide(newsy, { price: snap.zones[0].price }, { nowMs: NOW });
  ok(r3.decision === 'skip' && r3.reasons.includes('news_window'), 'imminent news → hard gate');

  const sigmaAbs = snap.sigmaDaily * snap.dayOpen;
  const r4 = decide(snap, { price: snap.price + 20 * sigmaAbs }, { nowMs: NOW });
  ok(r4.decision === 'skip' && r4.reasons.includes('no_level_nearby'), 'open space → no_level_nearby');
}

// ── decide: full path at a zone (explicit v0 — this block specs v0's own
// behavior; the live default for FX majors is now v1, tested separately below) ─
{
  const z = snap.zones[0];
  const r = decide(snap, { pair: 'eurusd', price: z.price }, { nowMs: NOW, model: MODEL_V0 });
  ok(r.ok && ['go', 'skip'].includes(r.decision), 'decision resolves');
  ok(r.probability > 0 && r.probability < 1, `probability in (0,1) — got ${r.probability}`);
  ok(['long', 'short'].includes(r.direction) && ['fade', 'follow'].includes(r.action), 'direction+action set');
  ok(r.zone.confluence === z.count, 'zone confluence echoed');
  ok(Array.isArray(r.top_factors) && r.model_version === MODEL_V0.version, 'transparency fields');
  ok(r.calibrated === false, 'v0 honestly flagged uncalibrated');
  ok(r.latency_ms < 50, `fast (${r.latency_ms}ms)`);
  ok((r.decision === 'go') === (r.probability >= MODEL_V0.goThreshold), 'threshold policy consistent');
  ok(r.decision === 'go' ? r.size_multiplier > 0 : r.size_multiplier === 0, 'sizing consistent with decision');

  // determinism: same inputs → same output (minus latency)
  const r2 = decide(snap, { pair: 'eurusd', price: z.price }, { nowMs: NOW, model: MODEL_V0 });
  assert.equal(r2.probability, r.probability); passed++;
}

// ── model registry: v1 is the live default for the FX majors it was fit on ───
{
  const z = snap.zones[0];
  const rMajor = decide(snap, { pair: 'eurusd', price: z.price }, { nowMs: NOW });
  ok(rMajor.model_version === MODEL_V1.version && rMajor.calibrated === true,
    'eurusd (a v1-fit major) defaults to the fitted, calibrated model');

  const jpySnap = syntheticSnapshot('usdjpy', { seed: 7, nowMs: NOW, newsInMin: null });
  const rMinor = decide(jpySnap, { pair: 'usdjpy', price: jpySnap.zones[0].price }, { nowMs: NOW });
  ok(rMinor.model_version === MODEL_V0.version && rMinor.calibrated === false,
    'usdjpy (not in the v1 fit set) still defaults to the hand-set v0 prior');

  // opts.model always overrides the pair-conditional default
  const rForced = decide(snap, { pair: 'eurusd', price: z.price }, { nowMs: NOW, model: MODEL_V0 });
  ok(rForced.model_version === MODEL_V0.version, 'opts.model overrides the default for any pair');
}

// ── model monotonicity (the priors point the right way — v0's own spec;
// explicit model:MODEL_V0 since eurusd now defaults live to the fitted v1,
// whose weights don't share these hand-set signs) ────────────────────────────
{
  const mkSnap = over => ({ ...snap, ...over });
  const zonePrice = snap.zones[0].price;
  const v0 = { nowMs: NOW, model: MODEL_V0 };

  // more confluence → higher probability, all else equal
  const lo = { ...snap.zones[0], count: 1, score: 1, price: zonePrice };
  const hi = { ...snap.zones[0], count: 4, score: 5, price: zonePrice };
  const pLo = decide(mkSnap({ zones: [lo] }), { price: zonePrice, action: 'fade' }, v0).probability;
  const pHi = decide(mkSnap({ zones: [hi] }), { price: zonePrice, action: 'fade' }, v0).probability;
  ok(pHi > pLo, `confluence raises p (${pLo} → ${pHi})`);

  // fading a trend day → lower probability than fading a quiet day
  const pQuiet = decide(mkSnap({ T: 0.15, regime: 'RANGE' }), { price: zonePrice, action: 'fade' }, v0).probability;
  const pTrend = decide(mkSnap({ T: 0.95, regime: 'BULL' }), { price: zonePrice, action: 'fade' }, v0).probability;
  ok(pTrend < pQuiet, `fade-on-trend-day penalised (${pQuiet} → ${pTrend})`);

  // extreme vol → lower probability
  const pNorm = decide(mkSnap({ volPct: 0.5 }), { price: zonePrice, action: 'fade' }, v0).probability;
  const pExtreme = decide(mkSnap({ volPct: 0.99 }), { price: zonePrice, action: 'fade' }, v0).probability;
  ok(pExtreme < pNorm, `vol extreme penalised (${pNorm} → ${pExtreme})`);

  // soft news lowers probability but does not gate
  const softSnap = mkSnap({ calendar: [{ timeMs: NOW + 120 * 60_000, impact: 'high', currency: 'USD', title: 'CPI' }] });
  const rSoft = decide(softSnap, { price: zonePrice, action: 'fade' }, v0);
  ok(rSoft.probability !== null && rSoft.probability < pNorm && rSoft.news_soon === true,
    `news_soon is a feature, not a veto (${pNorm} → ${rSoft.probability})`);
}

// ── request overrides honoured (engine judges the bot's proposal) ────────────
{
  const z = snap.zones[0];
  const r = decide(snap, { price: z.price, action: 'follow', direction: 'short' }, { nowMs: NOW });
  ok(r.action === 'follow' && r.direction === 'short', 'bot proposal honoured');
}

// ── own_level: an external (hand-pulled) level is scored, not refused ────────
{
  const farPrice = snap.price * 1.6;   // far beyond any level source's span
  const refused = decide(snap, { price: farPrice }, { nowMs: NOW });
  ok(refused.decision === 'skip' && refused.reasons.includes('no_level_nearby'), 'unknown price still refused by default');
  const scored = decide(snap, { price: farPrice, own_level: true }, { nowMs: NOW });
  ok(scored.probability > 0 && scored.probability < 1, 'own_level scores instead of refusing');
  ok(scored.zone.confluence === 1 && scored.zone.sources.includes('external'), 'standalone external level = confluence 1');
  // at a mapped zone, own_level uses the map zone (agreement = real confluence)
  const zc = snap.zones.find(z => z.count >= 2) ?? snap.zones[0];
  const agree = decide(snap, { price: zc.price, own_level: true }, { nowMs: NOW });
  ok(agree.zone.confluence === zc.count, 'own level agreeing with the map inherits its confluence');
}

// ── scoreLogistic sanity ─────────────────────────────────────────────────────
{
  const { p, contributions } = scoreLogistic({ confluence: 1, fade_on_trend_day: 0 }, MODEL_V0);
  ok(p > 0.5, 'positive-only features → p > 0.5');
  ok(contributions.every(c => Number.isFinite(c.contribution)), 'contributions finite');
  ok(sessionPhaseUTC(Date.parse('2026-07-01T23:00:00Z')) === 'asia', 'session phase');
}

// ── macro socket: macroState resolver + macro_align feature ──────────────────
{
  // sign convention: riskSens > 0 ⇒ pair rises in risk-off (defensive)
  ok(macroState(+0.8, 'RISK_OFF', 'long') === 1, 'defensive pair long in risk-off = aligned');
  ok(macroState(+0.8, 'RISK_OFF', 'short') === -1, 'defensive pair short in risk-off = opposed');
  ok(macroState(-1.0, 'RISK_OFF', 'long') === -1, 'risk pair (AUD/JPY-like) long in risk-off = opposed');
  ok(macroState(-1.0, 'RISK_ON', 'long') === 1, 'risk pair long in risk-on = aligned');
  ok(macroState(-0.8, 'NEUTRAL', 'long') === 0, 'neutral regime resolves 0');
  ok(macroState(+0.3, 'RISK_OFF', 'long') === 0, `|riskSens| < ${MACRO_RISK_SENS_MIN} resolves NEUTRAL (ambiguous pairs)`);
  ok(macroState(undefined, 'RISK_OFF', 'long') === 0 && macroState(-0.8, 'GARBAGE', 'long') === 0, 'malformed inputs fail neutral');

  // through the full decide path: snapshot without macro → feature 0; with macro → signed
  const z = snap.zones[0];
  const rNone = decide(snap, { price: z.price, direction: 'long', action: 'fade' }, { nowMs: NOW });
  ok(rNone.features.macro_align === 0 && rNone.macro === null, 'no macro context → feature 0, macro null in response');
  const riskOff = { ...snap, macro: { regime: 'RISK_OFF', riskSens: -0.8, asOf: NOW } };
  const rOpp = decide(riskOff, { price: z.price, direction: 'long', action: 'fade' }, { nowMs: NOW });
  ok(rOpp.features.macro_align === -1 && rOpp.macro.align === -1 && rOpp.macro.regime === 'RISK_OFF',
    'opposed direction carries macro_align −1 through decide()');
  const rAli = decide(riskOff, { price: z.price, direction: 'short', action: 'fade' }, { nowMs: NOW });
  ok(rAli.features.macro_align === 1, 'aligned direction carries +1');
  ok(rAli.probability === rNone.probability || Math.abs(rAli.probability - decide(snap, { price: z.price, direction: 'short', action: 'fade' }, { nowMs: NOW }).probability) < 1e-9,
    'v0 scoring is macro-blind (no weight) — macro enters only via a promoted fit');

  // buildSnapshot stamps only well-formed macro
  const good = buildSnapshot({ pair: 'eurusd', dailyBars: syntheticBars('eurusd', 320, 7), macro: { regime: 'RISK_ON', riskSens: -0.5 }, nowMs: NOW });
  ok(good.macro.regime === 'RISK_ON' && good.macro.stale === false, 'well-formed macro stamped');
  const bad = buildSnapshot({ pair: 'eurusd', dailyBars: syntheticBars('eurusd', 320, 7), macro: { regime: 'RISK_ON', riskSens: 'high' }, nowMs: NOW });
  ok(bad.macro === null, 'malformed macro → null, not a silent wrong sign');
}

// ── credit socket: logged-but-inert candidate features (§7c) ─────────────────
{
  const z = snap.zones[0];
  const req = { price: z.price, direction: 'long', action: 'fade' };
  const rNone = decide(snap, req, { nowMs: NOW });
  ok(rNone.features.credit_widening === 0 && rNone.features.credit_stress === 0 && rNone.features.credit_fade_in_stress === 0 && rNone.credit === null,
    'no credit context → all credit features 0, credit null in response');

  // widening + stressed credit context
  const stressed = { ...snap, credit: { gate: 'RISK-OFF', widening: 1, wideningBps: 30, pct: 92, accel: 1, stressProb: 0.8, stale: false } };
  const rStr = decide(stressed, req, { nowMs: NOW });
  ok(Math.abs(rStr.features.credit_widening - 0.75) < 1e-9, 'wideningBps 30 → credit_widening 0.75');
  ok(rStr.features.credit_stress === 0.8, 'stressProb 0.8 → credit_stress 0.8');
  ok(rStr.features.credit_fade_in_stress === 0.8, 'fade under stress → credit_fade_in_stress = stressProb');
  ok(rStr.credit && rStr.credit.gate === 'RISK-OFF' && rStr.credit.stressProb === 0.8, 'credit context surfaced in the response');

  // THE SAFETY INVARIANT: credit is zero-weighted in v0 → identical probability
  ok(rStr.probability === rNone.probability,
    `credit is inert — same probability with/without credit context (${rNone.probability})`);

  // a follow (not fade) → credit_fade_in_stress is 0
  const rFollow = decide(stressed, { price: z.price, direction: 'short', action: 'follow' }, { nowMs: NOW });
  ok(rFollow.features.credit_fade_in_stress === 0, 'credit_fade_in_stress only active on fades');

  // buildSnapshot stamps only well-formed credit
  const good = buildSnapshot({ pair: 'eurusd', dailyBars: syntheticBars('eurusd', 320, 7), credit: { gate: 'CAUTION', widening: 1, wideningBps: 12, pct: 60, stressProb: 0.4 }, nowMs: NOW });
  ok(good.credit && good.credit.gate === 'CAUTION' && good.credit.stressProb === 0.4, 'well-formed credit stamped');
  const badc = buildSnapshot({ pair: 'eurusd', dailyBars: syntheticBars('eurusd', 320, 7), credit: { widening: 1 }, nowMs: NOW });
  ok(badc.credit === null, 'malformed credit (no gate) → null');
}

// ── intraday state: pure compute + features through decide ───────────────────
{
  // hand-built session: open 1.0, ranges up to 1.010, down to 0.998, closes 1.008
  const mkBar = (t, o, h, l, c, v = 10) => ({ time: t, open: o, high: h, low: l, close: c, volume: v });
  const bars = [mkBar(0, 1.0, 1.004, 0.999, 1.003), mkBar(60, 1.003, 1.010, 1.002, 1.009), mkBar(120, 1.009, 1.0095, 0.998, 1.008)];
  const st = computeIntradayState(bars, { sigmaAbs: 0.006, hl50Abs: 0.008, approachBars: 2 });
  ok(st.sessionOpen === 1.0 && st.high === 1.010 && st.low === 0.998, 'session OHL tracked');
  ok(Math.abs(st.rangeUsed - (0.012 / 0.008)) < 1e-9, `rangeUsed = range/median (${st.rangeUsed})`);
  ok(st.posInRange > 0.8, 'position in range near the high');
  ok(Number.isFinite(st.vwapDistSigma) && st.vwap > 0.998 && st.vwap < 1.010, 'session VWAP sane');
  ok(computeIntradayState([], { sigmaAbs: 0.006, hl50Abs: 0.008 }) === null, 'no bars → null, not fake state');

  // through decide: request.intraday populates the zero-weighted features and
  // must NOT move the v0 probability (macro discipline)
  const z = snap.zones[0];
  const base = decide(snap, { price: z.price, action: 'fade', direction: 'long' }, { nowMs: NOW });
  const withIntra = decide(snap, { price: z.price, action: 'fade', direction: 'long',
    intraday: { rangeUsed: 1.4, posInRange: 0.05, vwapDistSigma: -1.2, approachSigma: 0 } }, { nowMs: NOW });
  ok(withIntra.features.intraday_range_exhausted_fade > 0, 'exhausted-range fade feature fires');
  ok(withIntra.features.intraday_vwap_stretch_fade > 0, 'vwap-stretch fade feature fires');
  ok(withIntra.features.intraday_fade_too_early === 0, 'too-early does not fire at 140% range');
  ok(withIntra.probability === base.probability, 'v0 scoring is intraday-blind — enters only via a promoted fit');
  ok(withIntra.intraday && withIntra.intraday.source === 'request', 'response surfaces intraday state + source');
  ok(base.features.intraday_range_exhausted_fade === 0 && INTRADAY_FEATURES.every(f => f in base.features),
    'no intraday state → features present but 0');
  const early = decide(snap, { price: z.price, action: 'fade', direction: 'long',
    intraday: { rangeUsed: 0.15, vwapDistSigma: 0 } }, { nowMs: NOW });
  ok(early.features.intraday_fade_too_early > 0.5, 'fading a rangeless day flags too-early');
  const follow = decide(snap, { price: z.price, action: 'follow', direction: 'long',
    intraday: { rangeUsed: 1.4, vwapDistSigma: 0 } }, { nowMs: NOW });
  ok(follow.features.intraday_range_exhausted_follow > 0 && follow.features.intraday_range_exhausted_fade === 0,
    'exhaustion attributes to the right action');
  // approach fallback: request omits approachSigma → intraday's value is used
  const app = decide(snap, { price: z.price, action: 'fade', direction: 'long',
    intraday: { rangeUsed: 0.8, vwapDistSigma: 0, approachSigma: 2.0 } }, { nowMs: NOW });
  ok(app.features.fast_approach_fade > 0, 'approach speed falls back to intraday state');
}

// ── dynamic zones: range ladders (time-valid) + session high/low ─────────────
{
  const mk = (t, o, h, l, c) => ({ time: t, open: o, high: h, low: l, close: c });
  const t0 = 1_700_000_000 - (1_700_000_000 % 86400);
  const asia = []; for (let m = 0; m < 360; m++) asia.push(mk(t0 + m * 60, 1.0, 1.002, 0.998, 1.001));
  const lad = computeSessionLadders({ intradayBars: asia, sessionOpen: 1.0, sigmaAbs: 0.01 });
  ok(lad?.asia && lad.asia.validFromSec === t0 + 6 * 3600, 'asia ladder validFrom = session start + 6h (the analyser gate)');
  ok(lad.asia.lines.every(l => Math.abs(l.price - 1.0) <= 1.5 * 0.01), 'only lines within reach carried');
  ok(lad.asia.lines.some(l => l.label === 'A_0') && lad.asia.lines.some(l => l.label === 'A_1'), 'range edges present (bot labels)');

  const zoneless = { ...snap, zones: [], ladders: lad, intraday: null };
  const line = lad.asia.lines.find(l => l.label === 'A_1');
  const before = decide(zoneless, { price: line.price }, { nowMs: (lad.asia.validFromSec - 600) * 1000 });
  ok(before.decision === 'skip' && before.reasons.includes('no_level_nearby'), 'ladder invisible BEFORE Asia closes');
  const after = decide(zoneless, { price: line.price }, { nowMs: (lad.asia.validFromSec + 600) * 1000 });
  ok(after.probability != null && after.zone.sources.includes('asia_ladder'), 'ladder line scores as a zone after validFrom');

  // prev-Asia ladder + the 2-pip cross-session alignment (detectConfluencesCore)
  const prevAligned = []; for (let m = 0; m < 360; m++) prevAligned.push(mk(t0 - 86400 + m * 60, 1.0, 1.002, 0.998, 1.001));
  const lad2 = computeSessionLadders({ intradayBars: asia, prevAsiaBars: prevAligned, sessionOpen: 1.0, sigmaAbs: 0.01, pip: 0.0001 });
  ok(lad2.prevAsia?.lines?.length > 0 && lad2.prevAsia.validFromSec === 0, 'prev-Asia ladder valid all day');
  ok(lad2.asiaAlign?.lines?.length > 0, `identical ranges align (${lad2.asiaAlign?.lines?.length} clusters)`);
  ok(lad2.asiaAlign.lines.every(l => l.tight === true), 'exact alignment flags tight (same fib / ≤10% of 2 pips)');
  ok(lad2.asiaAlign.validFromSec === lad2.asia.validFromSec, 'alignment needs today\'s lines → inherits Asia validFrom');
  // shift yesterday's range OFF-GRID (52.5 pips — not a multiple of the ladder
  // half-step, or the dense grids would legitimately overlap) → no alignment
  const prevFar = prevAligned.map(b => ({ ...b, open: b.open + 0.00525, high: b.high + 0.00525, low: b.low + 0.00525, close: b.close + 0.00525 }));
  const lad3 = computeSessionLadders({ intradayBars: asia, prevAsiaBars: prevFar, sessionOpen: 1.0, sigmaAbs: 0.01, pip: 0.0001 });
  ok(lad3.asiaAlign === null && lad3.prevAsia?.lines?.length > 0, 'misaligned sessions produce no alignment clusters');
  // degenerate guard: a <5-pip Asia range produces no ladder at all
  const flat = []; for (let m = 0; m < 360; m++) flat.push(mk(t0 + m * 60, 1.0, 1.0002, 0.9999, 1.0001));
  ok(computeSessionLadders({ intradayBars: flat, sessionOpen: 1.0, sigmaAbs: 0.01, pip: 0.0001 }) === null, '<5-pip range → no ladder (degenerate guard)');

  // through decide: alignment cluster = count 2 (two sessions agree)
  const alignSnap = { ...snap, zones: [], ladders: lad2, intraday: null };
  const aLine = lad2.asiaAlign.lines[0];
  const rA = decide(alignSnap, { price: aLine.price }, { nowMs: (lad2.asia.validFromSec + 600) * 1000 });
  ok(rA.zone.confluence >= 2 && rA.zone.sources.includes('asia_prev_align'), 'aligned line scores confluence ≥2 through decide');

  // Monday vs previous week's Monday — same mechanism, 15m bodies
  const mkMon = (start, lo, hi) => { const b = []; for (let m = 0; m < 720; m++) b.push(mk(start + m * 60, lo, hi, lo, lo + (hi - lo) * 0.7)); return b; };
  const monday = mkMon(t0 - 3 * 86400, 1.0, 1.004);
  const prevMonAligned = mkMon(t0 - 10 * 86400, 1.0, 1.004);
  const ladM = computeSessionLadders({ mondayBars: monday, prevMondayBars: prevMonAligned, sessionOpen: 1.0, sigmaAbs: 0.02, pip: 0.0001 });
  ok(ladM.mondayAlign?.lines?.length > 0, 'Monday × prev-Monday alignment fires on identical ranges');
  ok(ladM.mondayAlign.validFromSec === ladM.monday.validFromSec, 'monday alignment shares the Monday validity (never on Monday itself)');
  const prevMonFar = mkMon(t0 - 10 * 86400, 1.00525, 1.00925);
  const ladM2 = computeSessionLadders({ mondayBars: monday, prevMondayBars: prevMonFar, sessionOpen: 1.0, sigmaAbs: 0.02, pip: 0.0001 });
  ok(ladM2.mondayAlign === null && ladM2.monday?.lines?.length > 0, 'off-grid prev Monday → no alignment');
  // prev-Monday grid is never carried standalone
  ok(!('prevMonday' in (ladM ?? {})) || ladM.prevMonday == null, 'prev-Monday used for marking only, not standalone levels');

  // per-instrument confluence thresholds mirror the live caps model
  ok(confluenceCapsFor('eurusd').confluencePips === 2, 'fx = 2 pips');
  ok(confluenceCapsFor('gold').confluencePips === 200, 'gold = 200 gold-pips ($20)');
  ok(confluenceCapsFor('nq').confluencePips === 100 && confluenceCapsFor('dow').confluencePips === 60
    && confluenceCapsFor('dax').confluencePips === 80 && confluenceCapsFor('ftse').confluencePips === 40
    && confluenceCapsFor('rut').confluencePips === 15, 'index thresholds per caps');

  // session high as a dynamic zone merging with a static level (cross-boundary confluence)
  const zPDH = { price: 1.2345, score: 2, count: 1, sources: ['prior_hilo'], kinds: ['pdh'] };
  const shSnap = { ...snap, zones: [zPDH], ladders: null };
  const r = decide(shSnap, { price: 1.2345,
    intraday: { high: 1.2345 + snap.meta.tolAbs * 0.5, low: 1.1, rangeUsed: 0.8, vwapDistSigma: 0 } }, { nowMs: NOW });
  ok(r.zone.confluence === 2 && r.zone.sources.includes('session_hilo'), 'PDH + developing session high merge into confluence 2');
  ok(r.zone.kinds.includes('session_high'), 'merged kinds show the dynamic member');
}

// ── htf_align: the research arc's one survivor (trend alignment) ─────────────
{
  const z = snap.zones[0];
  ok(HTF_FEATURES.length === 1 && HTF_FEATURES[0] === 'htf_align', 'HTF_FEATURES exported');
  // no trend on the snapshot → feature 0
  const flat = decide({ ...snap, htfTrend: 0 }, { price: z.price, direction: 'long' }, { nowMs: NOW });
  ok(flat.features.htf_align === 0 && flat.htf_trend === 'flat', 'no HTF trend → htf_align 0');
  // uptrend: long aligns (+1), short opposes (−1)
  const up = { ...snap, htfTrend: 1 };
  ok(decide(up, { price: z.price, direction: 'long' }, { nowMs: NOW }).features.htf_align === 1, 'long into uptrend = +1');
  ok(decide(up, { price: z.price, direction: 'short' }, { nowMs: NOW }).features.htf_align === -1, 'short into uptrend = −1');
  // downtrend: short aligns, long opposes
  const down = { ...snap, htfTrend: -1 };
  ok(decide(down, { price: z.price, direction: 'short' }, { nowMs: NOW }).features.htf_align === 1, 'short into downtrend = +1');
  ok(decide(down, { price: z.price, direction: 'long' }, { nowMs: NOW }).features.htf_align === -1, 'long into downtrend = −1');
  // v0 is htf-blind (zero-weighted): probability unchanged with/without trend
  const withT = decide(up, { price: z.price, direction: 'long', action: 'fade' }, { nowMs: NOW });
  const noT = decide({ ...snap, htfTrend: 0 }, { price: z.price, direction: 'long', action: 'fade' }, { nowMs: NOW });
  ok(withT.probability === noT.probability, 'v0 scoring is htf-blind — enters only via a promoted fit');
  ok(withT.htf_trend === 'up' && withT.htf_align === 1, 'response surfaces htf_trend + htf_align');
  // buildSnapshot computes htfTrend from an uptrending synthetic series
  const upBars = Array.from({ length: 320 }, (_, i) => ({ time: i * 86400, open: 1 + i * 0.001, high: 1 + i * 0.001 + 0.002, low: 1 + i * 0.001 - 0.002, close: 1 + i * 0.001 }));
  ok(buildSnapshot({ pair: 'eurusd', dailyBars: upBars, nowMs: NOW }).htfTrend === 1, 'rising series → htfTrend +1');
}

// ── other asset classes (pip/σ-math/costs switch on the registry) ────────────
{
  const g = syntheticSnapshot('gold', { seed: 3, nowMs: NOW, newsInMin: null });
  const r = decide(g, { price: g.zones[0].price }, { nowMs: NOW });
  ok(r.ok && r.probability > 0 && r.probability < 1, 'gold snapshot + decision works');

  // indices: GARCH σ path, pip 1.0, ASSET_PARAMS.index — same code path
  for (const idx of ['nq', 'spx', 'dow', 'rut', 'ftse', 'dax']) {
    const s = syntheticSnapshot(idx, { seed: 5, nowMs: NOW, newsInMin: null });
    ok(s.sigmaDaily > 0 && s.sigmaDaily < 0.05 && s.zones.length > 3, `${idx}: snapshot sane (σ ${(100 * s.sigmaDaily).toFixed(2)}%, ${s.zones.length} zones)`);
    const d = decide(s, { price: s.zones[0].price }, { nowMs: NOW });
    ok(d.ok && d.probability > 0 && d.probability < 1 && ['long', 'short'].includes(d.direction), `${idx}: decision works`);
  }
}

console.log(`decisionCore.test.mjs — ${passed} assertions passed`);
