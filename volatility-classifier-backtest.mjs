#!/usr/bin/env node
/**
 * Volatility Classifier Backtest — Exhaustion vs Continuation
 * 
 * Tests three strategies at volatility extremes:
 *   1. Always fade
 *   2. Always follow
 *   3. Classifier (VuManChu + day-type score)
 * 
 * Pre-registered outcome: "Worked" = Classifier OOS Sharpe > max(fade, follow) by ≥0.2, with ≥30 OOS trades
 * 
 * Usage: node volatility-classifier-backtest.mjs [instrument] [days] [oosPct]
 * Example: node volatility-classifier-backtest.mjs eurusd 100 40
 */

import { loadM1ForPair } from './js/volBacktestM1Engine.js';
import { computeBands, walkBars, volSigmaSeries } from './js/forecastCore.js';
import { classifyDayType } from './js/dayTypeCore.js';
import { computeWaveTrend } from './js/vumanchuCore.js';

// ============================================================================
// CONFIG
// ============================================================================
const ASSET_CLASS = {
  'eurusd': 'fx_major',
  'gbpusd': 'fx_major',
  'usdjpy': 'fx_major',
  'audusd': 'fx_major',
  'usdcad': 'fx_major',
  'eurjpy': 'fx_major',
  'gbpjpy': 'fx_major',
  'gold': 'gold',
  'nq': 'index',
  'spx500': 'index'
};

const DEFAULT_OPTS = {
  slMult: 1.5,
  tpMult: 2.0,
  vmcWin: 10,
  dayTypeWin: 20,
  oosPct: 40
};

// ============================================================================
// M1 DATA PROCESSING
// ============================================================================
function groupByDay(packed) {
  const days = new Map();
  
  for (let i = 0; i < packed.n; i++) {
    const ts = packed.times[i];
    const date = new Date(ts * 1000);
    const dateStr = date.toISOString().split('T')[0];
    
    if (!days.has(dateStr)) {
      days.set(dateStr, []);
    }
    
    days.get(dateStr).push({
      time: ts,
      open: packed.opens[i],
      high: packed.highs[i],
      low: packed.lows[i],
      close: packed.closes[i]
    });
  }
  
  return days;
}

function buildDailySessions(packed) {
  const dayMap = groupByDay(packed);
  const sessions = [];
  
  for (const [dateStr, bars] of dayMap.entries()) {
    if (bars.length < 100) continue; // Skip incomplete days
    
    const open = bars[0].open;
    sessions.push({
      date: dateStr,
      open,
      bars
    });
  }
  
  return sessions.sort((a, b) => a.date.localeCompare(b.date));
}

// ============================================================================
// CLASSIFIER LOGIC
// ============================================================================
function classifyExhaustion(sessions, sessionIdx, vmcWin, dayTypeWin) {
  // Build historical bars for VuManChu
  const historicalBars = [];
  
  for (let i = 0; i <= sessionIdx; i++) {
    historicalBars.push(...sessions[i].bars);
  }
  
  // VuManChu on recent bars (last 500 M1 bars)
  const recentBars = historicalBars.slice(-500);
  const vmcData = computeWaveTrend(recentBars, vmcWin);
  const wt1 = vmcData.wt1[vmcData.wt1.length - 1];
  const wt2 = vmcData.wt2[vmcData.wt2.length - 1];
  
  // Day-type classifier on daily closes
  const dailyCloses = sessions.slice(0, sessionIdx + 1).map(s => s.bars[s.bars.length - 1].close);
  const T = classifyDayType({ 
    closes: dailyCloses, 
    idx: dailyCloses.length - 1, 
    win: Math.min(dayTypeWin, dailyCloses.length - 1)
  });
  
  // Multi-timeframe regime (simplified: SMA20 on daily closes)
  const sma20 = dailyCloses.slice(-20).reduce((a, b) => a + b, 0) / Math.min(20, dailyCloses.length);
  const regime = dailyCloses[dailyCloses.length - 1] > sma20 ? 'bull' : 'bear';
  
  return {
    wt1,
    wt2,
    dayType: T.score,
    regime,
    // Exhaustion: extreme WT + low day-type (choppy) = fade
    // Continuation: extreme WT + high day-type (trending) = follow
    isExhaustion: Math.abs(wt1) > 50 && T.score < 0.4,
    isContinuation: Math.abs(wt1) > 50 && T.score > 0.6
  };
}

// ============================================================================
// BACKTEST ENGINE
// ============================================================================
function runStrategy(sessions, assetClass, mode, opts) {
  const { slMult, tpMult, vmcWin, dayTypeWin, oosPct } = opts;
  const splitIdx = Math.floor(sessions.length * (1 - oosPct / 100));
  
  const records = [];
  
  // Build historical bars for volatility estimation
  const allHistoricalBars = [];
  
  for (let i = 50; i < sessions.length; i++) {
    const session = sessions[i];
    
    // Add previous session bars to history
    if (i > 0) {
      allHistoricalBars.push(...sessions[i - 1].bars);
    }
    
    // Compute volatility forecast at session open (causal)
    const sigma = volSigmaSeries(allHistoricalBars.map(b => ({
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close
    })), assetClass).pop();
    
    if (!sigma || sigma <= 0) continue;
    
    const bands = computeBands(session.open, sigma, assetClass);
    
    // Walk M1 bars to find touches
    for (let barIdx = 0; barIdx < session.bars.length; barIdx++) {
      const bar = session.bars[barIdx];
      
      const touchedHigh = bar.high >= bands.HL75;
      const touchedLow = bar.low <= -bands.HL75;
      
      if (!touchedHigh && !touchedLow) continue;
      
      let side, entry;
      
      if (mode === 'fade') {
        // Always fade extremes
        if (touchedHigh) {
          side = 'sell';
          entry = bands.HL75;
        } else if (touchedLow) {
          side = 'buy';
          entry = -bands.HL75;
        }
      } else if (mode === 'follow') {
        // Always follow extremes
        if (touchedHigh) {
          side = 'buy';
          entry = bands.HL75;
        } else if (touchedLow) {
          side = 'sell';
          entry = -bands.HL75;
        }
      } else if (mode === 'classifier') {
        // Use classifier to decide
        const signal = classifyExhaustion(sessions, i, vmcWin, dayTypeWin);
        
        if (touchedHigh) {
          if (signal.isExhaustion) {
            side = 'sell'; // Fade
            entry = bands.HL75;
          } else if (signal.isContinuation) {
            side = 'buy'; // Follow
            entry = bands.HL75;
          } else {
            continue; // No clear signal
          }
        } else if (touchedLow) {
          if (signal.isExhaustion) {
            side = 'buy'; // Fade
            entry = -bands.HL75;
          } else if (signal.isContinuation) {
            side = 'sell'; // Follow
            entry = -bands.HL75;
          } else {
            continue; // No clear signal
          }
        }
      }
      
      if (!side) continue;
      
      // Set SL/TP
      const slDist = sigma * slMult;
      const tpDist = sigma * tpMult;
      const sl = side === 'buy' ? entry - slDist : entry + slDist;
      const tp = side === 'buy' ? entry + tpDist : entry - tpDist;
      
      // Walk forward from next bar to resolve trade
      const remainingBars = session.bars.slice(barIdx + 1);
      const result = walkBars(remainingBars, entry, tp, sl, side === 'buy', 'touch', session.open);
      
      if (result.exit) {
        const pnl = result.pnl;
        const isOOS = i >= splitIdx;
        
        records.push({
          idx: i,
          date: session.date,
          side,
          entry,
          exit: result.exit,
          pnl,
          pnlR: pnl / sigma,
          isOOS,
          mode
        });
        
        break; // One trade per day
      }
    }
  }
  
  return records;
}

// ============================================================================
// PERFORMANCE METRICS
// ============================================================================
function computeMetrics(records, isOOS = false) {
  const filtered = isOOS ? records.filter(r => r.isOOS) : records.filter(r => !r.isOOS);
  
  if (filtered.length === 0) {
    return {
      trades: 0,
      winRate: 0,
      avgR: 0,
      sharpe: 0,
      totalR: 0,
      maxDD: 0
    };
  }
  
  const wins = filtered.filter(r => r.pnlR > 0).length;
  const winRate = wins / filtered.length;
  const avgR = filtered.reduce((sum, r) => sum + r.pnlR, 0) / filtered.length;
  
  // Sharpe
  const mean = avgR;
  const variance = filtered.reduce((sum, r) => sum + Math.pow(r.pnlR - mean, 2), 0) / filtered.length;
  const std = Math.sqrt(variance);
  const sharpe = std > 0 ? mean / std : 0;
  
  // Total R
  const totalR = filtered.reduce((sum, r) => sum + r.pnlR, 0);
  
  // Max DD
  let peak = 0;
  let maxDD = 0;
  let cumR = 0;
  for (const r of filtered) {
    cumR += r.pnlR;
    if (cumR > peak) peak = cumR;
    const dd = peak - cumR;
    if (dd > maxDD) maxDD = dd;
  }
  
  return {
    trades: filtered.length,
    winRate: (winRate * 100).toFixed(1),
    avgR: avgR.toFixed(3),
    sharpe: sharpe.toFixed(2),
    totalR: totalR.toFixed(2),
    maxDD: maxDD.toFixed(2)
  };
}

// ============================================================================
// REPORTING
// ============================================================================
function printResults(instrument, fadeRecords, followRecords, classifierRecords, opts) {
  console.log('\n' + '='.repeat(80));
  console.log('VOLATILITY CLASSIFIER BACKTEST — Exhaustion vs Continuation');
  console.log('='.repeat(80));
  console.log(`Instrument: ${instrument.toUpperCase()}`);
  console.log(`Parameters: SL=${opts.slMult}σ, TP=${opts.tpMult}σ, VMC Win=${opts.vmcWin}, DayType Win=${opts.dayTypeWin}, OOS=${opts.oosPct}%`);
  console.log('='.repeat(80));
  
  const fadeIS = computeMetrics(fadeRecords, false);
  const fadeOOS = computeMetrics(fadeRecords, true);
  
  const followIS = computeMetrics(followRecords, false);
  const followOOS = computeMetrics(followRecords, true);
  
  const classifierIS = computeMetrics(classifierRecords, false);
  const classifierOOS = computeMetrics(classifierRecords, true);
  
  console.log('\n┌─────────────────────────────────────────────────────────────────────────────┐');
  console.log('│ ALWAYS FADE                                                                 │');
  console.log('├─────────────────────────────────────────────────────────────────────────────┤');
  console.log(`│ IS:  Sharpe=${fadeIS.sharpe.padStart(6)}  Trades=${String(fadeIS.trades).padStart(4)}  WinRate=${fadeIS.winRate.padStart(5)}  AvgR=${fadeIS.avgR.padStart(7)}  TotalR=${fadeIS.totalR.padStart(7)}  MaxDD=${fadeIS.maxDD.padStart(6)} │`);
  console.log(`│ OOS: Sharpe=${fadeOOS.sharpe.padStart(6)}  Trades=${String(fadeOOS.trades).padStart(4)}  WinRate=${fadeOOS.winRate.padStart(5)}  AvgR=${fadeOOS.avgR.padStart(7)}  TotalR=${fadeOOS.totalR.padStart(7)}  MaxDD=${fadeOOS.maxDD.padStart(6)} │`);
  console.log('└─────────────────────────────────────────────────────────────────────────────┘');
  
  console.log('\n┌─────────────────────────────────────────────────────────────────────────────┐');
  console.log('│ ALWAYS FOLLOW                                                               │');
  console.log('├─────────────────────────────────────────────────────────────────────────────┤');
  console.log(`│ IS:  Sharpe=${followIS.sharpe.padStart(6)}  Trades=${String(followIS.trades).padStart(4)}  WinRate=${followIS.winRate.padStart(5)}  AvgR=${followIS.avgR.padStart(7)}  TotalR=${followIS.totalR.padStart(7)}  MaxDD=${followIS.maxDD.padStart(6)} │`);
  console.log(`│ OOS: Sharpe=${followOOS.sharpe.padStart(6)}  Trades=${String(followOOS.trades).padStart(4)}  WinRate=${followOOS.winRate.padStart(5)}  AvgR=${followOOS.avgR.padStart(7)}  TotalR=${followOOS.totalR.padStart(7)}  MaxDD=${followOOS.maxDD.padStart(6)} │`);
  console.log('└─────────────────────────────────────────────────────────────────────────────┘');
  
  console.log('\n┌─────────────────────────────────────────────────────────────────────────────┐');
  console.log('│ CLASSIFIER (Exhaustion vs Continuation)                                     │');
  console.log('├─────────────────────────────────────────────────────────────────────────────┤');
  console.log(`│ IS:  Sharpe=${classifierIS.sharpe.padStart(6)}  Trades=${String(classifierIS.trades).padStart(4)}  WinRate=${classifierIS.winRate.padStart(5)}  AvgR=${classifierIS.avgR.padStart(7)}  TotalR=${classifierIS.totalR.padStart(7)}  MaxDD=${classifierIS.maxDD.padStart(6)} │`);
  console.log(`│ OOS: Sharpe=${classifierOOS.sharpe.padStart(6)}  Trades=${String(classifierOOS.trades).padStart(4)}  WinRate=${classifierOOS.winRate.padStart(5)}  AvgR=${classifierOOS.avgR.padStart(7)}  TotalR=${classifierOOS.totalR.padStart(7)}  MaxDD=${classifierOOS.maxDD.padStart(6)} │`);
  console.log('└─────────────────────────────────────────────────────────────────────────────┘');
  
  // Determine winner
  const maxBaseline = Math.max(parseFloat(fadeOOS.sharpe), parseFloat(followOOS.sharpe));
  const classifierSharpe = parseFloat(classifierOOS.sharpe);
  const classifierTrades = classifierOOS.trades;
  
  const worked = classifierSharpe > maxBaseline + 0.2 && classifierTrades >= 30;
  
  console.log('\n' + '='.repeat(80));
  console.log('PRE-REGISTERED OUTCOME');
  console.log('='.repeat(80));
  console.log(`Criteria: Classifier OOS Sharpe > max(fade, follow) by ≥0.2, with ≥30 OOS trades`);
  console.log(`Result:   Classifier OOS Sharpe = ${classifierOOS.sharpe}, Max Baseline = ${maxBaseline.toFixed(2)}, Classifier OOS Trades = ${classifierTrades}`);
  console.log(`Verdict:  ${worked ? '✓ WORKED' : '✗ DID NOT WORK'}`);
  
  if (!worked) {
    if (classifierTrades < 30) {
      console.log(`Reason:   Insufficient OOS trades (need ≥30, got ${classifierTrades})`);
    } else {
      console.log(`Reason:   Classifier does not beat baseline by ≥0.2 Sharpe (delta = ${(classifierSharpe - maxBaseline).toFixed(2)})`);
    }
  } else {
    console.log(`Success:  Classifier beats baseline by ${(classifierSharpe - maxBaseline).toFixed(2)} Sharpe with ${classifierTrades} OOS trades`);
  }
  
  console.log('='.repeat(80) + '\n');
}

// ============================================================================
// MAIN
// ============================================================================
async function main() {
  const args = process.argv.slice(2);
  const instrument = (args[0] || 'eurusd').toLowerCase();
  const dayCount = parseInt(args[1]) || 100;
  const oosPct = parseInt(args[2]) || DEFAULT_OPTS.oosPct;
  
  const opts = { ...DEFAULT_OPTS, oosPct };
  
  console.log(`\nLoading M1 data for ${instrument}...`);
  const packed = await loadM1ForPair(instrument);
  
  if (!packed || packed.n === 0) {
    console.error(`Error: No M1 data found for ${instrument}`);
    console.error(`Check VolRangeForecaster/data/m1/${instrument}_m1.parquet`);
    process.exit(1);
  }
  
  console.log(`Loaded ${packed.n} M1 bars`);
  
  console.log('Building daily sessions...');
  const allSessions = buildDailySessions(packed);
  console.log(`Built ${allSessions.length} daily sessions`);
  
  const sessions = allSessions.slice(-dayCount);
  console.log(`Using last ${sessions.length} days for backtest`);
  
  const assetClass = ASSET_CLASS[instrument] || 'fx_major';
  
  console.log('\nRunning fade strategy...');
  const fadeRecords = runStrategy(sessions, assetClass, 'fade', opts);
  console.log(`Fade: ${fadeRecords.length} trades`);
  
  console.log('Running follow strategy...');
  const followRecords = runStrategy(sessions, assetClass, 'follow', opts);
  console.log(`Follow: ${followRecords.length} trades`);
  
  console.log('Running classifier strategy...');
  const classifierRecords = runStrategy(sessions, assetClass, 'classifier', opts);
  console.log(`Classifier: ${classifierRecords.length} trades`);
  
  printResults(instrument, fadeRecords, followRecords, classifierRecords, opts);
}

main().catch(err => {
  console.error('Error:', err.message);
  console.error(err.stack);
  process.exit(1);
});
