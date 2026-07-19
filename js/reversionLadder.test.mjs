// Synthetic, no-network unit tests for the reversion-ladder brick.
// Proves the ladder target assignment, the symmetric stop, and each outcome
// (win / loss / straddle=loss / expired / no-touch) against hand-built bars,
// resolved through the SHARED walkBars fill walker.
//
//   node js/reversionLadder.test.mjs

import { ladderLevels, reversionTrades, tallyTrades, LADDER_LINES, STYLES } from './reversionLadder.js';

let failures = 0;
const ok   = (name, cond, extra = '') => { console.log(`  ${cond ? '✓' : '✗ FAIL'} ${name}${extra ? '  ' + extra : ''}`); if (!cond) failures++; };
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

// open=100, bands in PERCENT. Up prices: Cp_med 100.4, Cp_p75 100.7, H_med 101.0,
// H_p75 101.5. Down mirror: Cm_med 99.6, Cm_p75 99.3, L_med 99.0, L_p75 98.5.
const OPEN = 100;
const PCTS = { hl_median: 1.0, hl_75: 1.5, oc_median: 0.4, oc_75: 0.7 };

// Bar helper: sequential 1-minute bars from a Monday 00:00 UTC.
const t0 = Date.UTC(2024, 0, 8, 0, 0, 0) / 1000;
const mkBars = rows => rows.map((r, i) => ({ time: t0 + i * 60, open: r[0], high: r[1], low: r[2], close: r[3] }));

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

console.log(failures ? `\n${failures} FAILED` : '\nAll reversion-ladder tests passed');
process.exit(failures ? 1 : 0);
