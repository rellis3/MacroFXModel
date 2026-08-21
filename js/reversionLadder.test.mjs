// Synthetic, no-network unit tests for the reversion-ladder brick.
// Proves the ladder target assignment, the symmetric stop, and each outcome
// (win / loss / straddle=loss / expired / no-touch) against hand-built bars,
// resolved through the SHARED walkBars fill walker.
//
//   node js/reversionLadder.test.mjs

import { ladderLevels, reversionTrades, tallyTrades, LADDER_LINES, FITTED_LINES, linesFor, STYLES, firstTouchIdx } from './reversionLadder.js';

let failures = 0;
const ok   = (name, cond, extra = '') => { console.log(`  ${cond ? '✓' : '✗ FAIL'} ${name}${extra ? '  ' + extra : ''}`); if (!cond) failures++; };
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

// open=100, bands in PERCENT. Up prices: Cp_med 100.4, Cp_p75 100.7, H_med 101.0,
// H_p75 101.5. Down mirror: Cm_med 99.6, Cm_p75 99.3, L_med 99.0, L_p75 98.5.
const OPEN = 100;
const PCTS = { hl_median: 1.0, hl_75: 1.5, oc_median: 0.4, oc_75: 0.7 };

// Bar helper: sequential 1-minute bars from a Monday 00:00 UTC.
const t0 = Date.UTC(2024, 0, 8, 0, 0, 0) / 1000;
const mkBars = (rows, start = 0) => rows.map((r, i) => ({ time: t0 + (start + i) * 60, open: r[0], high: r[1], low: r[2], close: r[3] }));

// ── ladderLevels: prices + adjacent-inner target + innermost→open ────────────
console.log('[ladderLevels]');
const lad = ladderLevels(OPEN, PCTS);
const L = k => lad.byKey[k];
ok('all 8 lines built', lad.lines.length === 8);
ok('H_med price = 101.0', near(L('H_med').price, 101.0));
ok('H_med target = Cp_p75 (100.7)', near(L('H_med').target, 100.7));
ok('H_p75 target = H_med (101.0)', near(L('H_p75').target, 101.0));
ok('Cp_med (innermost up) target = open', near(L('Cp_med').target, OPEN));
ok('L_med target = Cm_p75 (99.3)', near(L('L_med').target, 99.3));
ok('Cm_med (innermost down) target = open', near(L('Cm_med').target, OPEN));
ok('degenerate open → null', ladderLevels(0, PCTS) === null);
ok('missing pcts → null', ladderLevels(OPEN, null) === null);

// ── H_med (SELL): entry 101.0, target 100.7, symmetric stop 101.3 ────────────
console.log('[H_med SELL]');
const armH = new Set(['H_med']);
const one = (bars) => reversionTrades(OPEN, mkBars(bars), PCTS, { armed: armH })[0];

// Win: fill at 101.0, later low reaches 100.7 without touching 101.3.
const win = one([
  [100.0, 100.2, 99.9, 100.1],
  [100.1, 101.05, 100.0, 101.0],   // fill (high<stop; TP not booked on fill bar)
  [101.0, 101.0, 100.6, 100.7],    // low 100.6 <= target → win
]);
ok('win: outcome', win && win.outcome === 'win');
ok('win: side SELL', win && win.side === 'SELL');
ok('win: symmetric stop 101.3', win && near(win.stop, 101.3));
ok('win: gross ≈ +0.3%', win && near(win.grossPct, 0.3, 1e-6));

// Loss: after fill, high reaches the 101.3 stop.
const loss = one([
  [100.0, 100.2, 99.9, 100.1],
  [100.1, 101.05, 100.0, 101.0],   // fill
  [101.0, 101.35, 101.0, 101.3],   // high 101.35 >= stop → loss
]);
ok('loss: outcome', loss && loss.outcome === 'loss');
ok('loss: gross ≈ -0.3%', loss && near(loss.grossPct, -0.3, 1e-6));

// Straddle → LOSS: one post-fill bar hits BOTH target and stop (SL checked first).
const straddle = one([
  [100.0, 100.2, 99.9, 100.1],
  [100.1, 101.05, 100.0, 101.0],   // fill
  [101.0, 101.4, 100.6, 101.0],    // high>=101.3 stop AND low<=100.7 target → loss
]);
ok('straddle counts as loss (no lookahead)', straddle && straddle.outcome === 'loss');

// Expired: touched, neither target nor stop; marks to session close.
const exp = one([
  [100.0, 100.2, 99.9, 100.1],
  [100.1, 101.05, 100.0, 101.0],   // fill
  [101.0, 101.1, 100.9, 100.95],   // resolves neither → mark to close 100.95
]);
ok('expired: outcome', exp && exp.outcome === 'expired');
ok('expired: marks to close (+0.05%)', exp && near(exp.grossPct, 0.05, 1e-6));

// No touch: highs never reach 101.0 → no trade for H_med.
const none = reversionTrades(OPEN, mkBars([
  [100.0, 100.3, 99.8, 100.1],
  [100.1, 100.5, 100.0, 100.2],
]), PCTS, { armed: armH });
ok('no touch → no trade', none.length === 0);

// ── L_med (BUY): entry 99.0, target 99.3, symmetric stop 98.7 ────────────────
console.log('[L_med BUY]');
const buyWin = reversionTrades(OPEN, mkBars([
  [100.0, 100.1, 99.9, 100.0],
  [100.0, 100.0, 98.95, 99.0],     // fill (low<=99.0; TP not booked on fill bar)
  [99.0, 99.35, 99.0, 99.3],       // high 99.35 >= target → win
]), PCTS, { armed: new Set(['L_med']) })[0];
ok('buy win: outcome', buyWin && buyWin.outcome === 'win');
ok('buy win: side BUY', buyWin && buyWin.side === 'BUY');
ok('buy win: symmetric stop 98.7', buyWin && near(buyWin.stop, 98.7));

// ── Style: follow the median (BUY through H_med, target H_p75 101.5) ─────────
console.log('[follow_med_fade_75]');
ok('STYLE med → follow', STYLES.follow_med_fade_75.action({ tier: 'med' }) === 'follow');
ok('STYLE p75 → fade',   STYLES.follow_med_fade_75.action({ tier: 'p75' }) === 'fade');
ok('STYLE fade_all → fade', STYLES.fade_all.action({ tier: 'med' }) === 'fade');

const followWin = reversionTrades(OPEN, mkBars([
  [100.0, 100.2, 99.9, 100.1],
  [100.6, 101.05, 100.6, 101.0],   // BUY-stop fill at 101.0 (low 100.6 > 100.5 stop; TP 101.5 not yet)
  [101.0, 101.5, 101.0, 101.4],    // high 101.5 >= target H_p75 → win
]), PCTS, { armed: armH, style: 'follow_med_fade_75' })[0];
ok('follow: action', followWin && followWin.action === 'follow');
ok('follow: side BUY (continue up)', followWin && followWin.side === 'BUY');
ok('follow: target = H_p75 (101.5)', followWin && near(followWin.target, 101.5));
ok('follow: symmetric stop 100.5', followWin && near(followWin.stop, 100.5));
ok('follow: gross ≈ +0.5%', followWin && near(followWin.grossPct, 0.5, 1e-6));

// Under the same style, a 75th line still FADES (H_p75 → target inner H_med 101.0).
const p75Fade = reversionTrades(OPEN, mkBars([
  [100.0, 100.2, 99.9, 100.1],
  [100.1, 101.55, 100.0, 101.5],   // touches H_p75 (101.5)
  [101.5, 101.5, 101.0, 101.0],    // low 101.0 <= target H_med → win
]), PCTS, { armed: new Set(['H_p75']), style: 'follow_med_fade_75' })[0];
ok('follow style: p75 still fades', p75Fade && p75Fade.action === 'fade' && p75Fade.side === 'SELL');

// Outermost band cannot follow → skipped when a style would make it a follow.
const outer = reversionTrades(OPEN, mkBars([
  [100.0, 102.0, 98.0, 100.0],
]), PCTS, { armed: new Set(['H_p75']), style: 'fade_all' });
ok('fade_all: outermost p75 still trades (as fade)', outer.length === 1 && outer[0].action === 'fade');

// ── Fixed SL/TP mode: fixed SL distance + TP multiplier ──────────────────────
console.log('[fixed SL/TP]');
// H_med fade (SELL) at 101.0; slDist 0.5 → stop 101.5; tpMult 2 → tpDist 1.0 → tp 100.0.
const fixedWin = reversionTrades(OPEN, mkBars([
  [100.0, 100.2, 99.9, 100.1],
  [100.1, 101.05, 100.0, 101.0],   // fill (high<stop 101.5; TP not booked on limit fill bar)
  [101.0, 101.0, 100.0, 100.0],    // low 100.0 <= tp → win
]), PCTS, { armed: armH, sltp: { mode: 'fixed', slDist: 0.5, tpMult: 2 } })[0];
ok('fixed: win outcome', fixedWin && fixedWin.outcome === 'win');
ok('fixed: stop = entry + 0.5 (101.5)', fixedWin && near(fixedWin.stop, 101.5));
ok('fixed: tp = entry - 1.0 (100.0)', fixedWin && near(fixedWin.target, 100.0));
ok('fixed: gross ≈ +1.0% (tpDist/open)', fixedWin && near(fixedWin.grossPct, 1.0, 1e-6));
// Same entry, tight stop hit first → loss at fixed SL.
const fixedLoss = reversionTrades(OPEN, mkBars([
  [100.0, 100.2, 99.9, 100.1],
  [100.1, 101.05, 100.0, 101.0],   // fill
  [101.0, 101.6, 101.0, 101.5],    // high 101.6 >= stop 101.5 → loss
]), PCTS, { armed: armH, sltp: { mode: 'fixed', slDist: 0.5, tpMult: 2 } })[0];
ok('fixed: stop hit → loss', fixedLoss && fixedLoss.outcome === 'loss');
ok('fixed: loss ≈ -0.5% (slDist/open)', fixedLoss && near(fixedLoss.grossPct, -0.5, 1e-6));
// mode:'level' (or absent) is unchanged — same as the default fade.
const lvl = reversionTrades(OPEN, mkBars([
  [100.0, 100.2, 99.9, 100.1],
  [100.1, 101.05, 100.0, 101.0],
  [101.0, 101.0, 100.6, 100.7],
]), PCTS, { armed: armH, sltp: { mode: 'level' } })[0];
ok('level mode == default (stop 101.3)', lvl && near(lvl.stop, 101.3) && lvl.outcome === 'win');

// ── EOD: kill-at-EOD (default) vs let-run (forwardBars) ──────────────────────
console.log('[EOD kill vs run]');
// H_med fade: entry 101.0, target 100.7, stop 101.3. Session touches the line
// but resolves NEITHER within the day → 'expired' when killed at EOD.
const eodSession = [
  [100.0, 100.2, 99.9, 100.1],
  [100.1, 101.05, 100.0, 101.0],   // fill in-session
  [101.0, 101.1, 100.9, 101.0],    // neither tp nor sl → unresolved
];
const killed = reversionTrades(OPEN, mkBars(eodSession), PCTS, { armed: armH })[0];
ok('kill @ EOD: unresolved → expired', killed && killed.outcome === 'expired');
// Let it run: a LATER session's bar dips to the target → win (after EOD).
const fwdWin = [[101.0, 101.0, 100.6, 100.7]];   // low 100.6 <= target 100.7
const ran = reversionTrades(OPEN, mkBars(eodSession), PCTS,
  { armed: armH, forwardBars: mkBars(fwdWin, eodSession.length) })[0];
ok('let run: resolves on a later session → win', ran && ran.outcome === 'win');
ok('let run: same entry time as kill', ran && killed && ran.entryTime === killed.entryTime);
// An entry that would only fire AFTER the session is dropped (both modes trade
// the same set): session never reaches 101.0, only a forward bar does.
const noTouchSession = [[100.0, 100.3, 99.8, 100.1], [100.1, 100.5, 100.0, 100.2]];
const fwdTouch = [[100.2, 101.2, 100.1, 101.0]];   // touches 101.0 only after EOD
const runDrop = reversionTrades(OPEN, mkBars(noTouchSession), PCTS,
  { armed: armH, forwardBars: mkBars(fwdTouch, noTouchSession.length) });
ok('let run: post-session-only entry dropped', runDrop.length === 0);

// ── decideAction selector injection (momentum / divergence hook) ─────────────
console.log('[decideAction]');
const touchBars = mkBars([
  [100.0, 100.2, 99.9, 100.1],
  [100.1, 101.05, 100.0, 101.0],   // H_med (101.0) touched at bar 1
  [101.0, 101.6, 100.6, 100.7],
]);
ok('firstTouchIdx finds the up-line touch', firstTouchIdx(touchBars, 101.0, 1) === 1);
ok('firstTouchIdx = -1 when never touched', firstTouchIdx(touchBars, 105.0, 1) === -1);
// Force FOLLOW on the touched up-line → BUY, target the outer band (H_p75 101.5).
const forced = reversionTrades(OPEN, touchBars, PCTS,
  { armed: armH, decideAction: (L, ti) => (ti === 1 ? 'follow' : null) })[0];
ok('decideAction override → follow/BUY', forced && forced.action === 'follow' && forced.side === 'BUY');
// Selector returns null → no trade for that line.
const skipped = reversionTrades(OPEN, touchBars, PCTS, { armed: armH, decideAction: () => null });
ok('decideAction null → no trade', skipped.length === 0);
// decideAction is also passed the bars so a real selector can read an indicator.
let sawBars = false;
reversionTrades(OPEN, touchBars, PCTS, { armed: armH, decideAction: (L, ti, bars) => { sawBars = Array.isArray(bars) && bars.length === 3; return 'fade'; } });
ok('decideAction receives (line, touchIdx, bars)', sawBars);

// ── costs netting + tally ────────────────────────────────────────────────────
console.log('[costs + tally]');
const costed = reversionTrades(OPEN, mkBars([
  [100.0, 100.2, 99.9, 100.1],
  [100.1, 101.05, 100.0, 101.0],
  [101.0, 101.0, 100.6, 100.7],
]), PCTS, { armed: armH, costPct: 0.02 })[0];
ok('costPct netted off gross', costed && near(costed.netPct, costed.grossPct - 0.02, 1e-9));

const t = tallyTrades([win, loss, straddle, exp]);
ok('tally n = 4', t.total.n === 4);
ok('tally wins = 1', t.total.wins === 1);
ok('tally losses = 2', t.total.losses === 2);
ok('tally expired = 1', t.total.expired === 1);
ok('tally winRate = 0.25', near(t.total.winRate, 0.25));

// ── armed=null covers every line that has a defined band ─────────────────────
console.log('[armed=null]');
const allTouch = reversionTrades(OPEN, mkBars([
  [100.0, 102.0, 98.0, 100.0],     // one wild bar touches every up & down line
  [100.0, 102.0, 98.0, 100.0],
]), PCTS, { armed: null });
ok('armed=null fires all 8 lines', new Set(allTouch.map(x => x.key)).size === 8, `got ${allTouch.length}`);
ok('LADDER_LINES has 8 entries', LADDER_LINES.length === 8);


// ── The FITTED ladder's line set (the "Ladder" calc on forecast-reversion) ───
console.log('');
console.log('[fitted ladder]');
const FITTED = { oh_p50: 0.25, oh_p75: 0.50, oh_p90: 0.78,
                 ol_p50: 0.24, ol_p75: 0.50, ol_p90: 0.80,
                 oc_p50: 0.24, oc_p75: 0.49 };

// Calc-agnostic dispatch: the brick picks its line set off the BANDS, never off a
// mode string, so both geometries run the identical mechanic and stay comparable.
ok('linesFor picks the fitted set from fitted bands', linesFor(FITTED) === FITTED_LINES);
ok('linesFor falls back to the legacy set', linesFor(PCTS) === LADDER_LINES && linesFor(null) === LADDER_LINES);

const fl = ladderLevels(OPEN, FITTED);
ok('fitted ladder builds all 6 lines', fl.lines.length === 6, `got ${fl.lines.length}`);
ok('p90 rungs exist both sides', !!fl.byKey.OH_p90 && !!fl.byKey.OL_p90);

// The target chain is what actually gets traded — a mis-sort would silently aim at
// the wrong band and change every number on the page.
const up = fl.lines.filter(l => l.side === 1).sort((a, b) => a.pct - b.pct);
ok('innermost up line reverts to the open', near(up[0].target, OPEN));
let chained = true, ordered = true;
for (let i = 1; i < up.length; i++) {
  if (!near(up[i].target, up[i - 1].price)) chained = false;
  if (!(up[i].price > up[i - 1].price)) ordered = false;
}
ok('each up line targets the band inside it', chained);
ok('up lines are ordered outward', ordered);
ok('outermost up line has no outer target', up[up.length - 1].outerTarget === null);

// Asymmetry is the property the separate O-H / O-L fit exists to keep; a mirroring
// bug would erase it while leaving everything else looking correct.
// (values kept clear of the p75 rungs — an oh_p90 equal to oh_p75 would collide and
// be dropped by the degenerate-target guard, which is correct but not what this
// test is about.)
const asym = ladderLevels(100, { ...FITTED, oh_p90: 0.90, ol_p90: 1.50 });
ok('O-H/O-L use their own percentages, not a mirror',
   near(asym.byKey.OH_p90.price, 100.90) && near(asym.byKey.OL_p90.price, 98.50));

// The bug this guard exists for: O-C and O-H are the SAME quantity (reflection
// principle), so carrying both put two bands at one price and the outer one's fade
// target landed on its own entry — unwinnable, and it read as 1% win rate over 152
// touches rather than as a broken level.
const collided = { ...FITTED, oc_p50: 0.25, oc_p75: 0.50 };   // identical to oh_p50/p75
const cl = ladderLevels(OPEN, collided, [...FITTED_LINES,
  { key: 'Cp_p50', band: 'oc_p50', side: 1, tier: 'med', label: 'C+ p50', color: '#60a5fa', dash: [7, 4] }]);
const degenerate = cl.lines.filter(l => Math.abs(l.price - l.target) / OPEN * 100 <= 0.005);
ok('a rung whose target collapses onto its entry is dropped, not traded',
   degenerate.length === 0 && !cl.byKey.Cp_p50, `${degenerate.length} degenerate, Cp_p50 present: ${!!cl.byKey.Cp_p50}`);
ok('no fitted rung shares a price with another',
   new Set(fl.lines.map(l => l.pct + ':' + l.side)).size === fl.lines.length);

ok('a missing ladder yields null, not zero-width lines',
   ladderLevels(100, { oh_p50: null }) === null && ladderLevels(100, null) === null);

// End to end: a day that runs up through two rungs then falls back through the open.
const fbars = mkBars([[100, 100.1, 99.95, 100.05], [100.05, 100.30, 100.0, 100.25],
                      [100.25, 100.60, 100.2, 100.55], [100.55, 100.6, 100.1, 100.15],
                      [100.15, 100.2, 99.7, 99.75], [99.75, 99.9, 99.6, 99.85]]);
const fres = reversionTrades(OPEN, fbars, FITTED, { lines: FITTED_LINES, style: 'fade_all' });
ok('reversionTrades runs the fitted set', Array.isArray(fres));
ok('it produced trades off the fitted rungs', fres.length > 0, `${fres.length} trades`);
ok('every trade maps to a fitted line',
   fres.every(t => FITTED_LINES.some(l => l.key === t.key)),
   fres.map(t => t.key).join(','));
// Passing the WRONG line set must not silently produce legacy-keyed trades from
// fitted bands — that mismatch is how a comparison quietly stops comparing.
ok('legacy lines find nothing in fitted bands',
   reversionTrades(OPEN, fbars, FITTED, { lines: LADDER_LINES }).length === 0);

console.log('');
console.log(failures ? `${failures} FAILED` : 'All reversion-ladder tests passed');
process.exit(failures ? 1 : 0);
