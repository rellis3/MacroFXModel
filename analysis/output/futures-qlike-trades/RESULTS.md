# futures-qlike-trades — results

Prereg: `forge/FUTURES_QLIKE_TRADES_PREREG.md` (2026-11-23; A1 pre-results for A/C, A2 post-hoc describe for B).
Seed 20261123, B = 2000, 63-session blocks. Scripts `scripts/futures-qlike-trades/score.py` (A–C), `score_d.py` (D).
Numbers `results_abc.json` (B), `results_ac.json` (A, C), `results_d.json` (D); logs `report_*.txt`.
Futures NQ / GC / 6E / 6J (NT8 M1 + volume), 2020-01 → 2026-08-21, QLIKE per-line walk-forward lines. Costs $5 RT +
1 tick on stops, time exits and B's stop-entry.

| Part | Trade | Trades | Net R | Halves | Verdict | Weight |
|---|---|---|---|---|---|---|
| **B** | follow the p90 break, stop p75, exit 22:00 | 1,364 | **+0.054 [+0.007, +0.092]** | +0.046 / +0.061 | **VALIDATED** (see A2) | Leaning |
| A | fade p75 → session VWAP | 3,379 | −0.077 [−0.097, −0.050] | −0.087 / −0.067 | NULL | Against |
| A (p90) | fade p90 → session VWAP | 1,364 | −0.108 [−0.152, −0.071] | −0.080 / −0.132 | (reported) | Against |
| C | A on touches beyond the owner's +2σv VWAP band | 2,329 | −0.086 [−0.117, −0.056] | −0.104 / −0.071 | NULL | Against |
| D | QLIKE lines as TPs on NQ noise-area-momentum entries | 1,417 | −3.80 bp/trade [−5.34, −2.04] vs no TP | −3.24 / −4.31 | NULL | Against |

Controls: B planted +0.55R; A/C mechanics −1.9pp on the time-aware benchmark (the unlimited-time benchmark gave −5.1pp,
A1), planted +0.38R; D oracle TP +43.6 bp.

## B: follow the p90 break
- Gross +0.092R. Exits: 22:00 67%, stop 33%. Per instrument NQ +0.111, 6J +0.037, GC +0.032, 6E +0.029.
- **Concentration (A2):** upside breaks +0.115R, downside −0.009R. 2020–26 was a rising period for NQ, gold and USD/JPY,
  so part may be market drift. By London time: 00–07 +0.324 (n 64), 07–12 +0.102, 12–16 +0.032, 16–22 +0.032.
- Variant with a TP at p90 + (p90 − p75): +0.009R — capping the run removes the gain.
- Next: a drift-controlled confirmation (random same-time entries in the same direction) before any use.

## A: fade toward VWAP
- TP first 42.2% vs 44.1% for a random walk over the time left (−1.8pp [−3.4, −0.1]). Loses on all four, both sides,
  every time bucket. At p90 the shortfall is −11pp: moves that reach p90 keep going (the same effect B trades).

## C: the owner's 14-day VWAP σ-band indicator
- The p75 line sits beyond the +1.5σv band on 92% of touches, so "line + band" is most touches. Beyond +2σv: −0.086R;
  confluence − other −0.032R [−0.085, +0.013]. By band: 1–1.5σv +0.016R (n 238), 1.5–2 −0.074, 2–2.5 −0.094,
  2.5–3 −0.091, ≥3 −0.073. More stretch is not a better fade.

## D: lines as targets for another system
- NQ noise-area-momentum V2 entries, 2020–26: base +5.33 bp/trade; with the first QLIKE line beyond the entry as a TP
  +1.54 bp (48% of trades exit at the line). Lines at ×0.85 / ×1.15 do about the same (−3.4 / −3.0 bp). The momentum
  system's edge is in its runners; capping them at the forecast line gives it away.
