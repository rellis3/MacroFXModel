# futures-oc-tp-fade — Jordan's trade on the QLIKE per-line futures ladder: fade OH/OL p75 or p90, take profit at the best OC p50

**Pre-registered 2026-11-22, before any trade on these lines was scored.**

| | |
|---|---|
| ID / ledger ids | `futures-oc-tp-fade-p75` (primary), `futures-oc-tp-fade-p90` |
| Register row | `plans/RESEARCH_REGISTER.md` → `futures-oc-tp-fade` |
| Source | Jordan (C.OG group member, not C.OG), DM 2026-11-21: find the best HL/OH/OL forecast, then "find the best OC forecast, maybe use this as a TP"; "we use the close level as reversing points". Owner 2026-11-22: run it |
| Instruments | Futures (NT8 M1, `analysis/output/nt8/continuous/<root>_1m_unadj.parquet`): NQ, GC, 6E, 6J (6J inverted to USD/JPY as in the harness) |
| Window | Sessions 2020-01 → **2026-08-21** (lockbox untouched); London 00:00–22:00, weekdays, sessions with ≥ 600 bars |
| Seed | `20261122`. B = 2000, 63-session blocks |
| Lines | `ladder-qlike-per-line` walk-forward lines (`scripts/ladder-qlike-per-line/score.py` `prep`): OH and OL lines from the QL per-line picks (each line's model chosen on QLIKE over 2019 … Y−1); the TP from **SOC**, the model with the lowest OC QLIKE over 2019 … Y−1 (same walk-forward scale) |
| Script | `scripts/futures-oc-tp-fade/score.py` → `analysis/output/futures-oc-tp-fade/` |

## 1. Question

Jordan's trade: when price stretches to an outer OH/OL line, fade it and take profit at the best OC forecast. Does it
make money after futures costs, and does price reach the OC take-profit more often than a driftless random walk with the
same stop and target would?

## 2. Trade (per session, per side; first touch only)

| | p75 cell (primary) | p90 cell |
|---|---|---|
| Entry | short limit at open × (1 + OH p75) after the first touch, filled once the high trades 1 tick through it; long mirrored at OL p75 | same at OH / OL p90 |
| Stop | the same-side p90 line + 0.05σ | p90 + (p90 − p75) |
| Take-profit | open ± OC p50 (SOC), same side | same |
| Skip | no trade if the TP is not strictly between the open and the entry (counted) | same |
| Exit | 22:00 London at the last close if neither hit; stop wins a bar that touches both | same |

- **Fills:** M1 OHLC from the bar after the fill bar. Limit entry and TP: no slippage. Stop and time exits: 1 tick against.
- **Costs:** $5 round-trip commission per contract, as % of the contract value at entry. Tick and multiplier per contract: NQ 0.25 / 20, GC 0.10 / 100, 6E 0.00005 / 125,000, 6J 0.0000005 / 12,500,000 (converted through the inverted price).
- **R** = |entry − stop|. Net R includes costs; gross R excludes them.

## 3. Rules (each cell its own verdict; trades pooled over the four instruments, session-block bootstrap within instrument)

| Verdict | Rule |
|---|---|
| **VALIDATED** | net mean R 90% CI lower > 0 pooled, and point > 0 in both halves (2020–22, 2023–26), and the TP-first rate beats its driftless benchmark (mean of s / (s + d) over the same trades, s = stop distance, d = TP distance) with CI lower > 0 |
| **NULL** | net mean R CI upper < +0.05R |
| **UNDERPOWERED** | otherwise |

Reported with every verdict: graded weight (Strong / Leaning / Faint / Untested-properly / Against), gross R, hit rates
(TP / stop / time), per instrument and per side, per London time bucket of the entry (00–07, 07–12, 12–16, 16–22), and
**placebo take-profits** at 0.7× and 1.3× the real TP distance (does the OC level beat other distances?).

## 4. Positive control (run first; nothing is scored if it fails)

Mechanics: over all real and placebo-TP trades, the gross TP-first rate on trades that end at a barrier must sit within
3pp of the driftless benchmark averaged over the same trades. Planted edge: re-score the p75 cell on paths where every
bar after the fill is moved 0.02σ toward the open; the net mean R must rise and its CI lower must be > 0.

## 5. What it changes

- **VALIDATED:** the fade with its OC TP goes on the reversion page as a style for the QLIKE calc, and gets a forward record before any money.
- **Otherwise:** the result is decomposed per instrument, side and time bucket, and any part that beats its benchmark in both halves is listed as a candidate for a new prereg.

## Amendments

### A1 — 2026-11-22, PRE-RESULTS (nothing scored): benchmark population and planted control size
- **TP vs benchmark (§3):** s / (s + d) is the chance a driftless walk hits the TP before the stop with unlimited time, so
  the comparison is made over trades that **end at a barrier** (TP or stop), as the PC and `ladder-per-line` A1. Mean R
  still uses every trade.
- **Planted edge (§4):** every bar after the fill is shifted a constant **0.25σ toward the open** (an unmistakable edge);
  the p75 cell's net mean R must then have CI lower > 0.
