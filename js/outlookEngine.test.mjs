// Synthetic tests for outlookEngine.js. No network.
//   node js/outlookEngine.test.mjs
import { computeOutlook, computeOutlookAllHorizons, HORIZONS, CCY_RISK_LEAN, pairRiskLean, describeCbTrend } from './outlookEngine.js';

let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };

console.log('[computeOutlook — no inputs at all -> neutral/null, not a crash]');
{
  const r = computeOutlook({}, 'weekly');
  ok('bias is null (nothing to score)', r.bias === null);
  ok('biasScore is null', r.biasScore === null);
  ok('confidence is null', r.confidence === null);
  ok('horizonLabel is Weekly', r.horizonLabel === 'Weekly', r.horizonLabel);
  ok('drivers array is empty', Array.isArray(r.drivers) && r.drivers.length === 0);
}

console.log('[computeOutlook — every leg agrees bullish -> BULLISH, high confidence]');
{
  const inputs = {
    composite: { score: 0.6, agree: 3, total: 4 },
    yieldSpread: { z: 2.4, inverted: false },
    cot: { dir: 'long', bias: 0.5, level: 'ELEVATED', derived: false },
    events: [],
  };
  const r = computeOutlook(inputs, 'weekly');
  ok('bias BULLISH', r.bias === 'BULLISH', r.biasScore);
  ok('biasScore positive', r.biasScore > 0);
  ok('all 3 directional legs agree', r.agree === 3 && r.total === 3, `${r.agree}/${r.total}`);
  ok('yield-spread driver tagged VALIDATED', r.drivers.find(d => d.name === 'yieldSpread')?.status === 'VALIDATED');
  ok('composite driver tagged CONTEXT', r.drivers.find(d => d.name === 'composite')?.status === 'CONTEXT');
  ok('confidence high (agreement + validated bonus)', r.confidence >= 70, r.confidence);
}

console.log('[computeOutlook — legs conflict -> lower |biasScore| and lower agree count]');
{
  const inputs = {
    composite: { score: 0.6, agree: 3, total: 4 },
    yieldSpread: { z: -2.4, inverted: false },
    events: [],
  };
  const r = computeOutlook(inputs, 'weekly');
  ok('still produces a bias (not null)', r.bias !== null);
  ok('agree count is 1 of 2 (legs disagree)', r.agree === 1 && r.total === 2, `${r.agree}/${r.total}`);
}

console.log('[computeOutlook — small composite score alone reads NEUTRAL]');
{
  const r = computeOutlook({ composite: { score: 0.05, agree: 1, total: 2 } }, 'weekly');
  ok('bias NEUTRAL under the neutral band', r.bias === 'NEUTRAL', r.biasScore);
}

console.log('[computeOutlook — missing yieldSpread leg is left OUT, never a neutral zero]');
{
  const withYs = computeOutlook({ composite: { score: 0.5, agree: 2, total: 2 }, yieldSpread: { z: 0.1 } }, 'weekly');
  const withoutYs = computeOutlook({ composite: { score: 0.5, agree: 2, total: 2 } }, 'weekly');
  ok('with yieldSpread leg present, total legs = 2', withYs.total === 2, withYs.total);
  ok('without yieldSpread leg, total legs = 1 (not padded to a zero)', withoutYs.total === 1, withoutYs.total);
}

console.log('[computeOutlook — volRegime never moves biasScore, only confidence]');
{
  const base = { composite: { score: 0.5, agree: 2, total: 2 } };
  const stable = computeOutlook({ ...base, volRegime: { volPct: 50, cone5d: 50 } }, 'weekly');
  const building = computeOutlook({ ...base, volRegime: { volPct: 50, cone5d: 80 } }, 'weekly');
  ok('biasScore unchanged by vol regime', stable.biasScore === building.biasScore, `${stable.biasScore} vs ${building.biasScore}`);
  ok('confidence LOWER when vol is building (less stable)', building.confidence < stable.confidence, `${building.confidence} vs ${stable.confidence}`);
  ok('volRegime driver never counted in total (directional) legs', stable.total === 1, stable.total);
}

console.log('[computeOutlook — a high-impact event inside the horizon window lowers confidence]');
{
  const base = { composite: { score: 0.6, agree: 2, total: 2 } };
  const now = Date.now();
  const noEvents = computeOutlook(base, 'weekly');
  const withHighImpact = computeOutlook({ ...base, events: [{ ms: now + 2 * 24 * 3600e3, impact: 'high' }] }, 'weekly');
  ok('confidence drops with a high-impact event in-window', withHighImpact.confidence < noEvents.confidence, `${withHighImpact.confidence} vs ${noEvents.confidence}`);
  ok('eventRisk reports the count', withHighImpact.eventRisk.count === 1 && withHighImpact.eventRisk.highCount === 1);
}

console.log('[computeOutlook — an event PAST the horizon window does not count]');
{
  const base = { composite: { score: 0.6, agree: 2, total: 2 } };
  const now = Date.now();
  const r = computeOutlook({ ...base, events: [{ ms: now + 40 * 24 * 3600e3, impact: 'high' }] }, 'weekly');
  ok('event beyond the 5-day window is excluded', r.eventRisk.count === 0);
}

console.log('[computeOutlook — 20-day horizon weights yield-spread more, composite less]');
{
  const inputs = { composite: { score: 1, agree: 1, total: 1 }, yieldSpread: { z: -3, inverted: false } };
  const weekly = computeOutlook(inputs, 'weekly');
  const monthly = computeOutlook(inputs, 'monthly');
  // Composite pulls +100, yield-spread pulls -100; monthly weights yieldSpread
  // (1.0) over composite (0.7), so monthly's net score should be more negative
  // (or less positive) than weekly's (composite 1.0 vs yieldSpread 0.5).
  ok('monthly leans more toward the yield-spread leg than weekly does', monthly.biasScore < weekly.biasScore, `${monthly.biasScore} vs ${weekly.biasScore}`);
}

console.log('[computeOutlook — horizon labels/window match forecastCore.HORIZONS]');
{
  ok('weekly label is Weekly, windowDays 5', HORIZONS.weekly.label === 'Weekly' && HORIZONS.weekly.windowDays === 5);
  ok('monthly label is 20-Day, windowDays 20', HORIZONS.monthly.label === '20-Day' && HORIZONS.monthly.windowDays === 20);
}

console.log('[computeOutlookAllHorizons — returns both horizons keyed correctly]');
{
  const r = computeOutlookAllHorizons({ composite: { score: 0.3, agree: 1, total: 1 } });
  ok('has weekly and monthly keys', !!r.weekly && !!r.monthly);
  ok('each carries its own horizonKey', r.weekly.horizonKey === 'weekly' && r.monthly.horizonKey === 'monthly');
}

console.log('[pairRiskLean — havens vs risk currencies]');
{
  ok('USD/JPY (both havens) nets to 0', pairRiskLean('USD', 'JPY') === 0);
  ok('AUD/JPY (risk base, haven quote) nets negative', pairRiskLean('AUD', 'JPY') < 0, pairRiskLean('AUD', 'JPY'));
  ok('EUR/USD (neutral base, haven quote) nets negative', pairRiskLean('EUR', 'USD') < 0, pairRiskLean('EUR', 'USD'));
  ok('EUR/GBP (neutral/neutral) nets to exactly 0', pairRiskLean('EUR', 'GBP') === 0);
  ok('unknown currency defaults to neutral (0), not a crash', pairRiskLean('XYZ', 'USD') < 0);
}

console.log('[computeOutlook — dxyMomentum: USD-base pair, rising DXY -> bullish push]');
{
  const r = computeOutlook({ dxyMomentum: { deltas: { 1: 0.1, 5: 1.2, 20: 2.0 }, usdSide: 'base' } }, 'weekly');
  const d = r.drivers.find(x => x.name === 'dxyMomentum');
  ok('driver present', !!d);
  ok('status is CONTEXT, never VALIDATED', d.status === 'CONTEXT');
  ok('score positive (USD base + DXY up = bullish for the pair)', d.score > 0, d.score);
  ok('uses the 5d delta at weekly horizon (1.2/2=0.6), not 1d (0.1) or 20d (2.0)', Math.abs(d.score - 0.6) < 1e-9, d.score);
  ok('bias reflects it', r.bias === 'BULLISH', r.biasScore);
}

console.log('[computeOutlook — dxyMomentum: USD-quote pair, rising DXY -> bearish push]');
{
  const r = computeOutlook({ dxyMomentum: { deltas: { 1: 0.1, 5: 1.2, 20: 2.0 }, usdSide: 'quote' } }, 'weekly');
  const d = r.drivers.find(x => x.name === 'dxyMomentum');
  ok('score negative (USD quote + DXY up = bearish for the pair, e.g. EURUSD down)', d.score < 0, d.score);
}

console.log('[computeOutlook — dxyMomentum picks the 20d delta at monthly horizon]');
{
  const weekly = computeOutlook({ dxyMomentum: { deltas: { 1: 0.1, 5: 1.0, 20: -3.0 }, usdSide: 'base' } }, 'weekly');
  const monthly = computeOutlook({ dxyMomentum: { deltas: { 1: 0.1, 5: 1.0, 20: -3.0 }, usdSide: 'base' } }, 'monthly');
  ok('weekly uses 5d delta (+1.0) -> bullish', weekly.bias === 'BULLISH', weekly.biasScore);
  ok('monthly uses 20d delta (-3.0) -> bearish (opposite sign)', monthly.bias === 'BEARISH', monthly.biasScore);
}

console.log('[computeOutlook — dxyMomentum absent for a USD-free cross (no usdSide)]');
{
  const r = computeOutlook({ dxyMomentum: { deltas: { 5: 2.0 }, usdSide: null } }, 'weekly');
  ok('no dxyMomentum driver without a USD leg', !r.drivers.find(x => x.name === 'dxyMomentum'));
  ok('bias is null (nothing else supplied)', r.bias === null);
}

console.log('[computeOutlook — realYieldMomentum: USD-base-like lean, rising real yields -> bullish push]');
{
  const r = computeOutlook({ realYieldMomentum: { deltas: { 1: 1, 5: 12, 20: 30 }, lean: 1 } }, 'weekly');
  const d = r.drivers.find(x => x.name === 'realYieldMomentum');
  ok('driver present', !!d);
  ok('status is CONTEXT, never VALIDATED', d.status === 'CONTEXT');
  ok('score positive (base-like lean + rising real yields = bullish)', d.score > 0, d.score);
  ok('uses the 5d delta at weekly horizon (12/30=0.4), not 1d (1) or 20d (30)', Math.abs(d.score - 0.4) < 1e-9, d.score);
  ok('bias reflects it', r.bias === 'BULLISH', r.biasScore);
}

console.log('[computeOutlook — realYieldMomentum: quote-like lean (Gold/USD-quote pair), rising real yields -> bearish push]');
{
  const r = computeOutlook({ realYieldMomentum: { deltas: { 1: 1, 5: 12, 20: 30 }, lean: -1 } }, 'weekly');
  const d = r.drivers.find(x => x.name === 'realYieldMomentum');
  ok('score negative (quote-like lean + rising real yields = bearish, e.g. Gold down)', d.score < 0, d.score);
}

console.log('[computeOutlook — realYieldMomentum picks the 20d delta at monthly horizon]');
{
  const weekly = computeOutlook({ realYieldMomentum: { deltas: { 1: 1, 5: 10, 20: -25 }, lean: 1 } }, 'weekly');
  const monthly = computeOutlook({ realYieldMomentum: { deltas: { 1: 1, 5: 10, 20: -25 }, lean: 1 } }, 'monthly');
  ok('weekly uses 5d delta (+10) -> bullish', weekly.bias === 'BULLISH', weekly.biasScore);
  ok('monthly uses 20d delta (-25) -> bearish (opposite sign)', monthly.bias === 'BEARISH', monthly.biasScore);
}

console.log('[computeOutlook — realYieldMomentum absent with a zero/neutral lean (no usdSide, no asset override)]');
{
  const r = computeOutlook({ realYieldMomentum: { deltas: { 5: 20 }, lean: 0 } }, 'weekly');
  ok('no realYieldMomentum driver with a zero lean', !r.drivers.find(x => x.name === 'realYieldMomentum'));
  ok('bias is null (nothing else supplied)', r.bias === null);
}

console.log('[computeOutlook — goldEtfFlow: inflow (rising AUM) -> bullish push]');
{
  const r = computeOutlook({ goldEtfFlow: { deltas: { 1: 0.2, 5: 4, 20: 9 } } }, 'weekly');
  const d = r.drivers.find(x => x.name === 'goldEtfFlow');
  ok('driver present', !!d);
  ok('status is CONTEXT, never VALIDATED', d.status === 'CONTEXT');
  ok('score positive (inflow = bullish)', d.score > 0, d.score);
  ok('uses the 5d delta at weekly horizon (4/8=0.5), not 1d (0.2) or 20d (9)', Math.abs(d.score - 0.5) < 1e-9, d.score);
  ok('bias reflects it', r.bias === 'BULLISH', r.biasScore);
}

console.log('[computeOutlook — goldEtfFlow: outflow (falling AUM) -> bearish push]');
{
  const r = computeOutlook({ goldEtfFlow: { deltas: { 1: -0.2, 5: -4, 20: -9 } } }, 'weekly');
  const d = r.drivers.find(x => x.name === 'goldEtfFlow');
  ok('score negative (outflow = bearish)', d.score < 0, d.score);
}

console.log('[computeOutlook — goldEtfFlow picks the 20d delta at monthly horizon]');
{
  const weekly = computeOutlook({ goldEtfFlow: { deltas: { 1: 0.1, 5: 3, 20: -12 } } }, 'weekly');
  const monthly = computeOutlook({ goldEtfFlow: { deltas: { 1: 0.1, 5: 3, 20: -12 } } }, 'monthly');
  ok('weekly uses 5d delta (+3) -> bullish', weekly.bias === 'BULLISH', weekly.biasScore);
  ok('monthly uses 20d delta (-12) -> bearish (opposite sign)', monthly.bias === 'BEARISH', monthly.biasScore);
}

console.log('[computeOutlook — goldEtfFlow absent when the input itself is missing]');
{
  const r = computeOutlook({ goldEtfFlow: null }, 'weekly');
  ok('no goldEtfFlow driver without the input', !r.drivers.find(x => x.name === 'goldEtfFlow'));
  ok('bias is null (nothing else supplied)', r.bias === null);
}

console.log('[computeOutlook — riskMomentum: haven-leaning pair + rising VIX/HY -> bullish (haven bid)]');
{
  const netLean = pairRiskLean('USD', 'AUD'); // USD haven, AUD risk -> positive net lean
  const r = computeOutlook({ riskMomentum: { vixDeltas: { 5: 4 }, hyDeltas: { 5: 20 }, netLean } }, 'weekly');
  const d = r.drivers.find(x => x.name === 'riskMomentum');
  ok('driver present, CONTEXT', d?.status === 'CONTEXT');
  ok('score positive (risk-off rising + net-haven pair = bullish)', d.score > 0, d.score);
}

console.log('[computeOutlook — riskMomentum: risk-leaning pair + rising VIX/HY -> bearish]');
{
  const netLean = pairRiskLean('AUD', 'JPY'); // AUD risk, JPY haven -> negative net lean
  const r = computeOutlook({ riskMomentum: { vixDeltas: { 5: 4 }, hyDeltas: { 5: 20 }, netLean } }, 'weekly');
  const d = r.drivers.find(x => x.name === 'riskMomentum');
  ok('score negative (risk-off rising + net-risk pair = bearish, e.g. AUDJPY down)', d.score < 0, d.score);
}

console.log('[computeOutlook — riskMomentum absent for a neutral/neutral pair]');
{
  const netLean = pairRiskLean('EUR', 'GBP'); // both neutral -> 0
  const r = computeOutlook({ riskMomentum: { vixDeltas: { 5: 4 }, hyDeltas: { 5: 20 }, netLean } }, 'weekly');
  ok('no riskMomentum driver for a net-neutral pair', !r.drivers.find(x => x.name === 'riskMomentum'));
}

console.log('[computeOutlook — riskMomentum degrades gracefully with only one of VIX/HY present]');
{
  const netLean = pairRiskLean('USD', 'AUD');
  const r = computeOutlook({ riskMomentum: { vixDeltas: { 5: 4 }, hyDeltas: {}, netLean } }, 'weekly');
  const d = r.drivers.find(x => x.name === 'riskMomentum');
  ok('driver still produced from VIX alone', d.score > 0, d.score);
}

console.log('[computeOutlook — priceTrend: TREND regime with a direction contributes a driver]');
{
  const r = computeOutlook({ priceTrend: { label: 'TREND', trendDir: 'up', trendProb: 70, reliable: true } }, 'weekly');
  const d = r.drivers.find(x => x.name === 'priceTrend');
  ok('driver present', !!d);
  ok('status CONTEXT', d.status === 'CONTEXT');
  ok('score positive for an up trend', d.score > 0, d.score);
  ok('bias reflects it', r.bias === 'BULLISH', r.biasScore);
}

console.log('[computeOutlook — priceTrend: RANGE regime contributes nothing]');
{
  const r = computeOutlook({ priceTrend: { label: 'RANGE', trendDir: null, trendProb: null, reliable: false } }, 'weekly');
  ok('no priceTrend driver for a RANGE regime', !r.drivers.find(x => x.name === 'priceTrend'));
  ok('bias is null (nothing else supplied)', r.bias === null);
}

console.log('[computeOutlook — priceTrend: unreliable read is discounted, not dropped]');
{
  const reliable = computeOutlook({ priceTrend: { label: 'TREND', trendDir: 'up', trendProb: 70, reliable: true } }, 'weekly');
  const unreliable = computeOutlook({ priceTrend: { label: 'TREND', trendDir: 'up', trendProb: 70, reliable: false } }, 'weekly');
  const dR = reliable.drivers.find(x => x.name === 'priceTrend'), dU = unreliable.drivers.find(x => x.name === 'priceTrend');
  ok('both present', !!dR && !!dU);
  ok('unreliable read scores lower but still positive', dU.score > 0 && dU.score < dR.score, `${dU.score} vs ${dR.score}`);
}

console.log('[computeOutlook — priceTrend weighted down at 20d vs 5d, against a competing driver]');
{
  // A lone driver's weight is invisible (normalized against itself) — need a
  // second, opposing driver for the weight shift to show up in biasScore.
  const inputs = {
    priceTrend: { label: 'TREND', trendDir: 'up', trendProb: 70, reliable: true },
    yieldSpread: { z: -3, inverted: false },
  };
  const weekly = computeOutlook(inputs, 'weekly');
  const monthly = computeOutlook(inputs, 'monthly');
  // weekly weights priceTrend(0.8) over yieldSpread(0.5) -> net positive;
  // monthly weights yieldSpread(1.0) over priceTrend(0.5) -> net negative.
  ok('weekly leans toward priceTrend (up)', weekly.biasScore > 0, weekly.biasScore);
  ok('monthly leans toward yieldSpread (down) — opposite sign', monthly.biasScore < 0, monthly.biasScore);
}

console.log('[describeCbTrend — too few scored meetings -> INSUFFICIENT_DATA, no crash]');
{
  ok('empty history', describeCbTrend([]).trend === 'INSUFFICIENT_DATA');
  ok('one meeting', describeCbTrend([{ meetingDate: '2026-01-01', hawkishScore: 0.2 }]).trend === 'INSUFFICIENT_DATA');
  ok('all-null scores', describeCbTrend([{ meetingDate: '2026-01-01', hawkishScore: null }]).trend === 'INSUFFICIENT_DATA');
}

console.log('[describeCbTrend — rising score -> MORE_HAWKISH, falling -> MORE_DOVISH, flat -> UNCHANGED]');
{
  const hawkish = describeCbTrend([{ meetingDate: '2026-01-01', hawkishScore: 0.1 }, { meetingDate: '2026-03-01', hawkishScore: 0.5 }]);
  const dovish = describeCbTrend([{ meetingDate: '2026-01-01', hawkishScore: 0.5 }, { meetingDate: '2026-03-01', hawkishScore: 0.1 }]);
  const flat = describeCbTrend([{ meetingDate: '2026-01-01', hawkishScore: 0.3 }, { meetingDate: '2026-03-01', hawkishScore: 0.31 }]);
  ok('rising score reads MORE_HAWKISH', hawkish.trend === 'MORE_HAWKISH', hawkish.trend);
  ok('falling score reads MORE_DOVISH', dovish.trend === 'MORE_DOVISH', dovish.trend);
  ok('near-flat score reads UNCHANGED', flat.trend === 'UNCHANGED', flat.trend);
  ok('detail cites the banked-null caveat', /banked a null|CB_SENTIMENT_PRICE_TEST/.test(hawkish.detail));
}

console.log('[describeCbTrend output is NEVER accepted anywhere in computeOutlook — structural check]');
{
  // describeCbTrend's return shape has no `score` field, so even if someone
  // mistakenly passed it in under some input key, no driver function reads
  // an input key by this name — confirm the engine's driver set is unchanged
  // whether or not a `cbTrend`-shaped object is present.
  const cbLike = describeCbTrend([{ meetingDate: '2026-01-01', hawkishScore: 0.1 }, { meetingDate: '2026-03-01', hawkishScore: 0.9 }]);
  const withIt = computeOutlook({ composite: { score: 0.3, agree: 1, total: 1 }, cbTrend: cbLike, cbSentiment: cbLike }, 'weekly');
  const without = computeOutlook({ composite: { score: 0.3, agree: 1, total: 1 } }, 'weekly');
  ok('identical driver count whether or not a CB-trend object is attached under any key', withIt.total === without.total && withIt.biasScore === without.biasScore);
}

console.log('[computeOutlook — CB sentiment is NOT a recognized input at all]');
{
  // Deliberate: this repo banked a null on CB hawkish-score momentum
  // (CB_SENTIMENT_PRICE_TEST.md) — the engine must not accept or score it.
  const r = computeOutlook({ cbSentiment: { z: 3 }, composite: { score: 0.1, agree: 1, total: 1 } }, 'weekly');
  ok('no cbSentiment/hawkish driver exists anywhere', !r.drivers.find(x => /hawk|cbSentiment|fomc/i.test(x.name)));
}

if (failures) { console.error(`\n${failures} FAILURE(S)`); process.exit(1); }
console.log('\nAll outlookEngine tests passed.');
