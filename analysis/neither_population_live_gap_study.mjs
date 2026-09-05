// Neither-Population Live-Gap Study — 2026-08-31
//
// Question this answers: `js/levelAtlasEngine.js`'s `atlasWalk()` only ever
// races a touch's inner/outer barriers through the REST OF THAT CALENDAR DAY
// (`bars = sessions.get(date)`, one day's M1 only). If neither barrier is hit
// before the day's bars run out, `outcome` stays 'neither' — and
// `js/levelAtlasVoteReview.js`'s `buildBarrierTrades`/`reviewVoteBacktest`
// both `filter(t => t.outcome !== 'neither')`, so a 'neither' touch is simply
// ABSENT from every validated Sharpe/win-rate number. The LIVE bot
// (`volatility_bot_v2.py`) has no such same-day boundary — a real position
// just sits on its broker-side bracket (SL/TP) until one side is hit, however
// many days that takes. So the live-traded population and the validated
// population are NOT the same set whenever a 'neither' touch occurs.
//
// This script, for the ACTUALLY LIVE-TRADED slice specifically (rungs p50/p75
// only — p90 is excluded from the live plan per server.js's `excludeRungs`
// convention; margin >= VOLATILITY_V2_MIN_MARGIN=3; OOS only, i.e.
// date >= book.splitDate; the VOLATILITY_V2_DEFAULT_PAIRS 17-pair set):
//
//   Q1 — how big is the 'neither' population (per pair + pooled)?
//   Q2 — for a sample of 'neither' touches, what ACTUALLY happens if you keep
//        walking the SAME fixed target/stop (the live bot's actual behaviour)
//        past session close, into subsequent days, using the raw continuous
//        M1 series (not day-bucketed)? Win rate, avg pnl%, days-to-resolve,
//        worst losses, longest opens.
//   Q3 — do qualifying touches cluster early in the session (lots of same-day
//        room to resolve) or can they fire late (almost no room)?
//
// Reuses atlasWalk/buildAtlasBook/voteDecision wholesale — no second copy of
// the touch-detection, ladder, or vote math. The ONLY new logic here is the
// forward re-walk past session close (Q2), which cannot reuse atlasWalk's own
// resolution loop since that loop is deliberately bounded to `bars` (one
// day) — it operates directly on `packed`'s raw, continuous, chronologically-
// sorted M1 arrays instead, using the identical reach()/inner/outer
// convention `atlasWalk` and `runExitVariantStudy` (levelAtlasVoteReview.js)
// already use, so results are mechanically comparable to the backtest's own.
//
// Pricing here is GROSS (cost=0), matching `priceBarrierTrade`'s own default
// — no cost model is invented here.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadM1ForPair } from '../js/volBacktestM1Engine.js';
import { atlasWalk } from '../js/levelAtlasEngine.js';
import { buildAtlasBook } from '../js/levelAtlasReport.js';
import { voteDecision } from '../js/levelAtlasVoteReview.js';
import { assetClassFor } from '../js/forecastAnalyserStore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, 'output');

const REARM = 0.3;              // DEFAULT_REARM — the same re-arm def volatility_bot_v2's plan producer reads (server.js)
const MIN_MARGIN = 3;           // VOLATILITY_V2_MIN_MARGIN, server.js
const LIVE_RUNGS = new Set(['p50', 'p75']);   // p90 excluded from the live plan (excludeRungs default)

// server.js VOLATILITY_V2_DEFAULT_PAIRS (the 17-pair "Select recommended" set)
// LA_PAIRS env override (comma-separated) lets a pilot/smoke run cover just
// 1-2 pairs without editing this file — full runs should omit it.
const PAIRS = process.env.LA_PAIRS
  ? process.env.LA_PAIRS.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
  : ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'usdchf', 'euraud', 'eurchf',
     'audjpy', 'cadjpy', 'chfjpy', 'gold', 'nq', 'spx', 'dow', 'us2000', 'de30', 'uk100'];

// Re-walking turned out to be essentially free (a binary search + short
// forward array scan per touch, no I/O — a 120-touch pilot sample took
// <0.1s), so this covers EVERY 'neither' touch, not a sample — a cap is kept
// only as a safety valve against a pathological pair.
const REWALK_SAMPLE_PER_PAIR = 20000;
const REWALK_MAX_BARS = 700000;          // ~ safety cap per touch (~1.3 yrs of continuous M1 bars)

function mean(a) { return a.length ? a.reduce((s, v) => s + v, 0) / a.length : null; }
function median(a) {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y), m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function pct(n, d) { return d > 0 ? +(n / d * 100).toFixed(1) : null; }
function seedShuffle(arr, seed) {
  // Deterministic shuffle (mulberry32) so re-runs are reproducible, not a new
  // random sample every invocation.
  let s = seed >>> 0;
  const rnd = () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}

function binarySearchStart(times, t) {
  let lo = 0, hi = times.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (times[mid] < t) lo = mid + 1; else hi = mid; }
  return lo;
}

// Continues watching the SAME fixed inner/outer barriers from a touch, past
// session close, on the RAW continuous M1 series (packed) — exactly what a
// real broker-side bracket order does (no day-boundary logic anywhere in
// volatility_bot_v2.py). Reconstructs inner/outer from the touch's own
// `level`/`innerDistPips`/`outerDistPips`/`side`/`pip` — the SAME convention
// `js/levelAtlasVoteReview.js`'s `runExitVariantStudy` already uses to
// reconstruct these from a priced trade.
function rewalkForward(packed, touch) {
  const { times, highs, lows } = packed;
  const isUp = touch.side === 'up';
  const sgn = isUp ? 1 : -1;
  const here = touch.level, pip = touch.pip;
  const innerDistPips = touch.innerDistPips, outerDistPips = touch.outerDistPips;
  if (innerDistPips == null) return null;
  const inner = here - sgn * innerDistPips * pip;
  const outer = outerDistPips != null ? here + sgn * outerDistPips * pip : null;
  const reach = (px, target) => (isUp ? px >= target : px <= target);
  const startIdx = binarySearchStart(times, touch.time);
  const cap = Math.min(times.length, startIdx + REWALK_MAX_BARS);
  for (let j = startIdx; j < cap; j++) {
    const fwd = isUp ? highs[j] : lows[j];
    const bwd = isUp ? lows[j] : highs[j];
    if (outer != null && reach(fwd, outer)) return { outcome: 'out', resolveTime: times[j], barsScanned: j - startIdx };
    if (isUp ? bwd <= inner : bwd >= inner) return { outcome: 'back', resolveTime: times[j], barsScanned: j - startIdx };
  }
  const cappedAt = cap >= times.length ? 'end_of_data' : 'bar_cap';
  return { outcome: 'still_open', resolveTime: null, barsScanned: cap - startIdx, cappedAt };
}

async function main() {
  const perPair = [];
  const pooledQualifying = [];   // { pair, outcome, sessionPos, minsRemaining, minsIntoSession }
  const rewalkRows = [];         // Q2 results
  let rewalkSeed = 1234567;

  for (const pair of PAIRS) {
    console.log(`\n=== ${pair.toUpperCase()} ===`);
    let packed;
    try { packed = await loadM1ForPair(pair); } catch (e) { console.log(`  M1 load failed: ${e.message}`); continue; }
    if (!packed?.n) { console.log('  no M1 data, skipping'); continue; }
    const assetClass = assetClassFor(pair);
    const t0 = Date.now();
    const { touches, coverage } = atlasWalk(packed, { instrument: pair.toUpperCase(), assetClass, rearmFracs: [REARM], pendingRearmFrac: REARM });
    if (!touches.length || !coverage) { console.log('  no touches, skipping'); continue; }
    const book = buildAtlasBook(touches, { rearmFrac: REARM });
    if (!book) { console.log('  no book, skipping'); continue; }
    console.log(`  ${touches.length.toLocaleString()} touch-records, ${coverage.sessions} sessions (${coverage.from}→${coverage.to}), split ${book.splitDate} — walk took ${((Date.now() - t0) / 1000).toFixed(1)}s`);

    // ── Q1 + Q3: qualifying OOS touches at rearm 0.3, rung p50/p75, margin>=3
    const oosCandidates = touches.filter(t => t.rearmFrac === REARM && t.date >= book.splitDate && LIVE_RUNGS.has(t.rung));
    const qualifying = [];
    for (const t of oosCandidates) {
      const vd = voteDecision(book, t);
      if (!vd || vd.margin < MIN_MARGIN) continue;
      qualifying.push({ t, vd });
    }
    const neither = qualifying.filter(q => q.t.outcome === 'neither');
    const resolved = qualifying.filter(q => q.t.outcome !== 'neither');
    const pairSummary = {
      pair: pair.toUpperCase(), sessions: coverage.sessions, from: coverage.from, to: coverage.to, splitDate: book.splitDate,
      qualifyingTouches: qualifying.length, neither: neither.length, resolved: resolved.length,
      neitherPct: pct(neither.length, qualifying.length),
    };
    perPair.push(pairSummary);
    console.log(`  qualifying (p50/p75, OOS, margin>=3): ${qualifying.length} — neither ${neither.length} (${pairSummary.neitherPct}%), resolved ${resolved.length}`);

    for (const q of qualifying) {
      pooledQualifying.push({
        pair: pair.toUpperCase(), outcome: q.t.outcome, sessionPos: q.t.sessionPos,
        minsRemaining: q.t.minsRemaining, minsIntoSession: q.t.minsIntoSession, session: q.t.session,
      });
    }

    // ── Q2: forward re-walk a sample of THIS pair's 'neither' qualifying touches
    if (neither.length) {
      const sample = seedShuffle(neither, (rewalkSeed += 97)).slice(0, REWALK_SAMPLE_PER_PAIR);
      const rt0 = Date.now();
      for (const { t, vd } of sample) {
        const targetPips = vd.decision === 'fade' ? t.innerDistPips : t.outerDistPips;
        const stopPips = vd.decision === 'fade' ? t.outerDistPips : t.innerDistPips;
        if (targetPips == null || stopPips == null) continue;   // structurally unpriceable (shouldn't occur — p90 already excluded)
        const rw = rewalkForward(packed, t);
        if (!rw) continue;
        let win = null, pnlPips = null, pnlPct = null;
        if (rw.outcome !== 'still_open') {
          win = (vd.decision === 'fade' && rw.outcome === 'back') || (vd.decision === 'follow' && rw.outcome === 'out');
          pnlPips = win ? targetPips : -stopPips;
          const denom = t.open > 0 ? t.open : null;
          pnlPct = denom ? +(pnlPips * t.pip / denom * 100).toFixed(4) : null;
        }
        const daysToResolve = rw.resolveTime != null ? +((rw.resolveTime - t.time) / 86400).toFixed(2) : null;
        rewalkRows.push({
          pair: pair.toUpperCase(), date: t.date, side: t.side, rung: t.rung, session: t.session,
          decision: vd.decision, margin: vd.margin, entry: t.level, targetPips, stopPips,
          outcome: rw.outcome, win, pnlPct, daysToResolve, barsScanned: rw.barsScanned, cappedAt: rw.cappedAt ?? null,
        });
      }
      console.log(`  Q2 re-walked ${sample.length}/${neither.length} 'neither' touches in ${((Date.now() - rt0) / 1000).toFixed(1)}s`);
    }
  }

  // ═══════════════════════════ REPORT ═══════════════════════════
  console.log(`\n\n================ Q1: 'NEITHER' POPULATION (live-traded slice: p50/p75, OOS, margin>=3) ================`);
  console.log('pair       qualifying  neither  neither%  resolved  splitDate    sessions  coverage');
  for (const s of perPair) {
    console.log(`${s.pair.padEnd(10)} ${String(s.qualifyingTouches).padStart(10)}  ${String(s.neither).padStart(7)}  ${String(s.neitherPct).padStart(7)}%  ${String(s.resolved).padStart(8)}  ${s.splitDate}  ${String(s.sessions).padStart(8)}  ${s.from}→${s.to}`);
  }
  const totQ = perPair.reduce((a, s) => a + s.qualifyingTouches, 0);
  const totN = perPair.reduce((a, s) => a + s.neither, 0);
  console.log(`\nPOOLED: ${totQ} qualifying touches, ${totN} 'neither' (${pct(totN, totQ)}%), ${totQ - totN} resolved same-day (${pct(totQ - totN, totQ)}%).`);

  console.log(`\n\n================ Q3: SESSION-TIMING OF QUALIFYING TOUCHES ================`);
  const byOutcomeSessionPos = {};
  for (const r of pooledQualifying) {
    const isNeither = r.outcome === 'neither' ? 'neither' : 'resolved';
    const key = `${isNeither}|${r.sessionPos ?? '—'}`;
    byOutcomeSessionPos[key] = (byOutcomeSessionPos[key] ?? 0) + 1;
  }
  console.log('outcome    sessionPos   n       % of that outcome');
  for (const grp of ['neither', 'resolved']) {
    const rows = pooledQualifying.filter(r => (r.outcome === 'neither') === (grp === 'neither'));
    const total = rows.length;
    for (const pos of ['1·early', '2·mid', '3·late']) {
      const n = rows.filter(r => r.sessionPos === pos).length;
      console.log(`${grp.padEnd(10)} ${pos.padEnd(12)} ${String(n).padStart(6)}  ${pct(n, total)}%`);
    }
  }
  const neitherMinsRemaining = pooledQualifying.filter(r => r.outcome === 'neither').map(r => r.minsRemaining).filter(x => x != null);
  const resolvedMinsRemaining = pooledQualifying.filter(r => r.outcome !== 'neither').map(r => r.minsRemaining).filter(x => x != null);
  console.log(`\nmedian minsRemaining-in-session at touch: neither=${median(neitherMinsRemaining)?.toFixed(0)} vs resolved=${median(resolvedMinsRemaining)?.toFixed(0)} (of 1440 min/session)`);
  const neitherMinsInto = pooledQualifying.filter(r => r.outcome === 'neither').map(r => r.minsIntoSession).filter(x => x != null);
  const resolvedMinsInto = pooledQualifying.filter(r => r.outcome !== 'neither').map(r => r.minsIntoSession).filter(x => x != null);
  console.log(`median minsIntoSession at touch: neither=${median(neitherMinsInto)?.toFixed(0)} vs resolved=${median(resolvedMinsInto)?.toFixed(0)}`);
  const bySession = {};
  for (const r of pooledQualifying) { const k = r.session ?? '—'; (bySession[k] ??= { n: 0, neither: 0 }).n++; if (r.outcome === 'neither') bySession[k].neither++; }
  console.log('\nby session:');
  for (const [k, v] of Object.entries(bySession)) console.log(`  ${k.padEnd(8)} n=${v.n}  neither%=${pct(v.neither, v.n)}`);

  console.log(`\n\n================ Q2: FORWARD RE-WALK OF 'NEITHER' TOUCHES (sample) ================`);
  console.log(`Sampled ${rewalkRows.length} 'neither' touches across ${perPair.filter(s => s.neither > 0).length} pairs (up to ${REWALK_SAMPLE_PER_PAIR}/pair, cap ${REWALK_MAX_BARS.toLocaleString()} bars/touch ≈ ${(REWALK_MAX_BARS / 1440).toFixed(0)} days).`);
  const resolvedRewalk = rewalkRows.filter(r => r.outcome !== 'still_open');
  const stillOpen = rewalkRows.filter(r => r.outcome === 'still_open');
  const wins = resolvedRewalk.filter(r => r.win);
  console.log(`\nOf ${rewalkRows.length} re-walked: ${resolvedRewalk.length} resolved within the re-walk horizon, ${stillOpen.length} still open at horizon end (${pct(stillOpen.length, rewalkRows.length)}%).`);
  console.log(`Win rate (of resolved): ${pct(wins.length, resolvedRewalk.length)}%  (n=${resolvedRewalk.length})`);
  const pnls = resolvedRewalk.map(r => r.pnlPct).filter(x => x != null);
  console.log(`Mean pnl%: ${mean(pnls)?.toFixed(4)}   Median pnl%: ${median(pnls)?.toFixed(4)}   Total pnl% (sum, unweighted): ${pnls.reduce((a, b) => a + b, 0).toFixed(2)}`);
  const days = resolvedRewalk.map(r => r.daysToResolve).filter(x => x != null);
  console.log(`Mean days-to-resolution: ${mean(days)?.toFixed(2)}   Median: ${median(days)?.toFixed(2)}   Max: ${days.length ? Math.max(...days).toFixed(2) : '—'}`);

  console.log(`\nby pair:`);
  const byPairRewalk = {};
  for (const r of rewalkRows) (byPairRewalk[r.pair] ??= []).push(r);
  for (const [p, rows] of Object.entries(byPairRewalk)) {
    const res = rows.filter(r => r.outcome !== 'still_open');
    const w = res.filter(r => r.win);
    const pn = res.map(r => r.pnlPct).filter(x => x != null);
    const dy = res.map(r => r.daysToResolve).filter(x => x != null);
    const so = rows.filter(r => r.outcome === 'still_open').length;
    console.log(`  ${p.padEnd(8)} n=${String(rows.length).padStart(4)}  resolved=${String(res.length).padStart(4)}  stillOpen=${String(so).padStart(3)}  winRate=${pct(w.length, res.length)}%  meanPnl%=${mean(pn)?.toFixed(3)}  meanDays=${mean(dy)?.toFixed(1)}  maxDays=${dy.length ? Math.max(...dy).toFixed(1) : '—'}`);
  }

  const worstLosses = [...resolvedRewalk].filter(r => r.pnlPct != null && r.pnlPct < 0).sort((a, b) => a.pnlPct - b.pnlPct).slice(0, 20);
  console.log(`\nWORST 20 LOSSES (by pnl%):`);
  console.log('pair     date        side  rung  decision  margin  entry         target/stopPips  outcome  pnl%      daysToResolve');
  for (const r of worstLosses) {
    console.log(`${r.pair.padEnd(8)} ${r.date}  ${r.side.padEnd(4)}  ${r.rung.padEnd(4)}  ${r.decision.padEnd(8)}  ${String(r.margin).padStart(4)}  ${r.entry.toFixed(5).padStart(10)}  ${String(r.targetPips).padStart(6)}/${String(r.stopPips).padStart(6)}  ${r.outcome.padEnd(8)} ${String(r.pnlPct).padStart(9)}  ${r.daysToResolve}`);
  }

  const longestOpens = [...rewalkRows].filter(r => r.daysToResolve != null || r.outcome === 'still_open')
    .sort((a, b) => (b.daysToResolve ?? Infinity) - (a.daysToResolve ?? Infinity)).slice(0, 20);
  console.log(`\nLONGEST OPENS (days-to-resolve, or still-open at re-walk horizon):`);
  console.log('pair     date        side  rung  decision  outcome      daysToResolve  cappedAt');
  for (const r of longestOpens) {
    console.log(`${r.pair.padEnd(8)} ${r.date}  ${r.side.padEnd(4)}  ${r.rung.padEnd(4)}  ${r.decision.padEnd(8)}  ${r.outcome.padEnd(11)}  ${r.daysToResolve ?? '≥' + (REWALK_MAX_BARS / 1440).toFixed(0)}  ${r.cappedAt ?? '—'}`);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'neither_population_live_gap_study.json'), JSON.stringify({
    generatedAt: new Date().toISOString(), pairs: PAIRS, rearm: REARM, minMargin: MIN_MARGIN,
    liveRungs: [...LIVE_RUNGS], rewalkSamplePerPair: REWALK_SAMPLE_PER_PAIR, rewalkMaxBars: REWALK_MAX_BARS,
    perPair, pooledQualifying, rewalkRows,
  }));
  console.log(`\nWrote full detail to ${OUT_DIR}/neither_population_live_gap_study.json`);
}

main();
