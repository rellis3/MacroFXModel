#!/usr/bin/env node
/**
 * Generates the REAL OI-bot's daily zone proposals across 6 years of history,
 * using the actual production functions (js/oi.js's buildOIEntry, js/oiZones.js's
 * buildOIZones) -- not a Python re-implementation. This is the whole point: a
 * re-port risks silently drifting from what the live bot actually runs (the
 * exact failure class MD files/CLAUDE.md's "generate-don't-port" rule and
 * TRADABILITY_REVIEW.md both warn about). Feeding real historical chains
 * through the unmodified live engine means any zone this script produces is a
 * zone the live bot would genuinely have produced on that day, with that data.
 *
 * cfg mirrors server.js's OI_BOT_CFG_DEFAULTS + the FX fallbackTpR exactly
 * (see server.js:14753 and :14944) -- this is the bot's shipped default
 * config, not a tuned/guessed one.
 *
 * Two honest simplifications vs. the live server, stated once here:
 *   - stability/change (oiWallStability/classifyOIChange from a multi-day
 *     oi_store archive) are not replicated -- the live server derives them
 *     from whatever days happened to be pasted, which for EUR/USD historically
 *     means sparse/absent data anyway. null here is not a worse assumption.
 *   - holdWeights is null (no forward-test calibration exists for this run),
 *     so the wall hold-score uses its documented theory-prior defaults
 *     (HOLD_WEIGHT_DEFAULTS) -- the same state a freshly-deployed bot starts in.
 * Everything else -- wall tiers, GEX/regime, max pain, structural SL/TP,
 * reachability, conviction sizing, minRR -- is the live bot's own code.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { buildOIEntry } from '../../js/oi.js';
import { buildOIZones } from '../../js/oiZones.js';

const IN = 'oi_research_book/data/bot_backtest/daily_chain.jsonl';
const OUT = 'oi_research_book/data/bot_backtest/zones.jsonl';
const GEX_MEDIAN_WINDOW = 60; // trading days, trailing, no lookahead (matches the live server's rolling read)

const OI_BOT_CFG_DEFAULTS = {
  minTier: 'strong', slBufferPips: 15, breakPips: 20, nearExpiryDTE: 2, extendedPips: 30,
  maxpainSlFrac: 1.0,
  fadeInPin: true, followBreaks: true, maxPainReversion: true,
  maxpainRequirePin: true,
  levelLadderTP: false, reactAtLevels: false, reactMinTier: 'moderate', reactBreakoutTrim: 0.6,
  requireEstablished: false, avoidLiquidating: true,
  maxZonesPerSide: 4, secondaryTrim: 0.6,
  reachMult: 1.0, reachTrim: 0.7, maxReachPips: 0,
  pathBlockCheck: true, blockMinTier: 'moderate', blockTrim: 0.9,
  slBufferRefFrac: 0.10, breakRefFrac: 0.15, extendedRefFrac: 0.25,
  minRR: 0.8, gexNeutralBand: 0.25, convictionSizing: true,
  subTierTrade: false, subTierSize: 0.4, minZoneSpacing: 0.05,
  volMagnetMinShare: 0.25, holdScore: true,
};
const PIP = 0.0001;
const FX_FALLBACK_TP_R = 2.0; // server.js's fxFallbackTpR default, applied since EUR/USD is FX

async function main() {
  const lines = readFileSync(IN, 'utf8').trim().split('\n').map(l => JSON.parse(l));
  console.log(`Loaded ${lines.length} daily chains`);

  // Pass 1: build every day's entry once (the expensive step), keep gex history.
  const days = [];
  for (const rec of lines) {
    const r = await buildOIEntry({
      pair: 'EUR/USD', rawOI: rec.rawOI, rawChg: rec.rawChg || '',
      dteRaw: rec.dte, spotRaw: rec.spot, futuresRaw: rec.spot,
      manualFutures: true, skipLiveQuote: true, greekVol: 'flat',
      numLevels: 8, minOI: 1,
    });
    if (r.error) { console.warn(`  ${rec.date}: buildOIEntry error — ${r.error}`); continue; }
    days.push({ date: rec.date, spot: rec.spot, inst: r.inst, gex: r.inst.exposures?.gex ?? 0 });
  }
  console.log(`buildOIEntry succeeded on ${days.length}/${lines.length} days`);

  // Pass 2: trailing median |gex| over the PRIOR GEX_MEDIAN_WINDOW days only (no lookahead),
  // then the real buildOIZones call with production defaults.
  const out = [];
  const gexHist = [];
  for (const d of days) {
    const gexMedianAbs = gexHist.length >= 20 ? median(gexHist.slice(-GEX_MEDIAN_WINDOW).map(Math.abs)) : null;
    const zones = buildOIZones(d.inst, d.spot, {
      ...OI_BOT_CFG_DEFAULTS,
      pip: PIP,
      fallbackTpR: FX_FALLBACK_TP_R,
      gexMedianAbs,
      stability: null,
      change: null,
      holdWeights: null,
      refMove: d.inst.refMove?.move ?? null,
      expMove: d.inst.expectedMove ? { upper: d.inst.expectedMove.upper, lower: d.inst.expectedMove.lower } : null,
    });
    const regime = d.gex > 0 ? 'PIN' : d.gex < 0 ? 'BREAKOUT' : 'NEUTRAL';
    out.push({ date: d.date, spot: d.spot, dte: d.inst.dte, regime, gex: d.gex, gexMedianAbs, zones });
    gexHist.push(d.gex);
  }

  writeFileSync(OUT, out.map(o => JSON.stringify(o)).join('\n') + '\n');
  const totalZones = out.reduce((s, o) => s + o.zones.length, 0);
  const byMode = {};
  for (const o of out) for (const z of o.zones) byMode[z.mode] = (byMode[z.mode] || 0) + 1;
  console.log(`Wrote ${out.length} days, ${totalZones} total zones to ${OUT}`);
  console.log('Zones by mode:', byMode);
  console.log('Days with >=1 zone:', out.filter(o => o.zones.length > 0).length, '/', out.length);
}

function median(arr) {
  const s = [...arr].sort((a, b) => a - b);
  const n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}

main().catch(e => { console.error(e); process.exit(1); });
