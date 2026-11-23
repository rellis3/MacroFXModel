# futures-qlike-trades — Jordan's remaining uses of the QLIKE futures lines: VWAP target, p90 follow, VWAP σ-band confluence, lines as targets for another system

**Pre-registered 2026-11-23, before any of these trades on the QLIKE per-line lines was scored.**

| | |
|---|---|
| Ledger ids | `fqt-vwap-fade` (A), `fqt-p90-follow` (B), `fqt-vwap-band` (C), `fqt-nam-lines-tp` (D) |
| Register row | `plans/RESEARCH_REGISTER.md` → `futures-qlike-trades` |
| Source | Jordan (C.OG group member, not C.OG), DMs 2026-11-17/18/21: VWAP (futures, session reset) as the TP of an exhaustion fade; "load your indicator [owner's 14-day VWAP σ-band] on a futures chart"; "for bias-based trades use forecasting as targets, not entries". Owner 2026-11-23: "try these". B is the lead from `futures-oc-tp-fade` (TP first 11.8pp below a random walk at p90) |
| Instruments | A–C: NQ, GC, 6E, 6J futures (NT8 M1 + volume; 6J inverted to USD/JPY). D: NQ only (the only QLIKE instrument with a banked entry system) |
| Window | Sessions 2020-01 → **2026-08-21** (lockbox untouched), London 00:00–22:00, ≥ 600 bars |
| Seed | `20261123`. B = 2000, 63-session blocks within instrument |
| Lines | `ladder-qlike-per-line` walk-forward QL lines (each line's model chosen on QLIKE over 2019 … Y−1) |
| Mechanics | `scripts/futures-oc-tp-fade/score.py` (`simulate`, `costs`): limit at the line filled once price trades 1 tick through; M1 from the bar after the fill; stop wins a bar touching both; 22:00 London exit; $5 round trip + 1 tick on stop and time exits (and on B's entry). Script `scripts/futures-qlike-trades/score.py` |

## A. Fade toward VWAP (`fqt-vwap-fade`)

- First touch of OH/OL **p75** (primary) and p90 (reported). VWAP = Σ(typical price × volume) / Σvolume from the London 00:00 bar, **frozen at the bar before the touch**.
- TP = that VWAP. Stop: p75 entry → p90 + 0.05σ; p90 entry → p90 + (p90 − p75). No trade if VWAP is not strictly between the open side and the entry (counted).

## B. Follow the p90 break (`fqt-p90-follow`)

- First 1-tick trade-through of OH/OL **p90**: enter **with** the move at p90 + 1 tick (stop-entry, +1 tick slippage).
- Stop: the same-side p75 line. Exit: 22:00 London (primary). Reported variant: TP at p90 + (p90 − p75).

## C. The owner's VWAP σ-band indicator with the lines (`fqt-vwap-band`)

- σ_v per session = mean over the **prior 14 sessions** of each session's RMS of (1-min close − running VWAP) / running VWAP. Bands: VWAP ± k·σ_v, k ∈ {1, 1.5, 2, 2.5, 3}.
- Stretch at a touch: z = (line − VWAP at the bar before) / (σ_v · VWAP), signed toward the line side.
- **Confluence** = an A-trade (p75 entry) whose z ≥ **2** (line at or beyond the ±2σ band). The test: A's trade on confluence touches vs A's trade on the others.
- Reported: net R by z band (< 1, 1–1.5, 1.5–2, 2–2.5, 2.5–3, ≥ 3).

## D. Lines as targets for another system (`fqt-nam-lines-tp`)

- Entries: the banked noise-area-momentum NQ V2 trades (`scripts/noise-area-momentum/engine.py`: `build_days`, `features`, `positions`, `trades`; RTH 09:30–16:00 ET, checks every 30 min from 10:00).
- Add a TP: the first QLIKE forecast line (OH p50/p75/p90 for longs, OL for shorts, from the London-midnight open, converted to the engine's price scale) beyond the entry price in the trade's direction. If the bar's high (long) / low (short) reaches it before the trade's original exit, exit there. No line beyond the entry → unchanged.
- Statistic: per-trade net bp (engine costs) **with TP minus without**, day-block bootstrap. Placebo: the same with every line × 0.85 and × 1.15.

## Rules (each part its own verdict)

| Part | VALIDATED | NULL |
|---|---|---|
| A, B | net mean R 90% CI lower > 0 pooled, point > 0 in both halves (2020–22, 2023–26); A also TP-first > driftless benchmark (barrier trades) CI lower > 0 | net mean R CI upper < +0.05R |
| C | confluence net R CI lower > 0, both halves > 0, and confluence − non-confluence CI lower > 0 | confluence net R CI upper < +0.05R |
| D | with-TP − without CI lower > 0, both halves > 0, and beats both placebo scalings (point) | diff CI upper < +1 bp |

UNDERPOWERED otherwise. Each reported with a graded weight (Strong / Leaning / Faint / Untested-properly / Against) and
decomposed per instrument, side and London time bucket.

## Positive controls (run first; a part is not scored if its control fails)

- A/C: mechanics as `futures-oc-tp-fade` (TP-first vs driftless within 3pp on barrier trades); planted 0.25σ shift toward the open after the fill must give CI lower > 0.
- B: planted 0.25σ shift *away* from the open after the fill must give CI lower > 0.
- D: on the same trades, a TP placed at the trade's own realised best price (oracle) must give diff CI lower > 0.

## What it changes

Anything VALIDATED becomes a style on the Forecast Reversion page's QLIKE calc and gets a forward record before money;
everything else is shown on the page as a style too (for looking), labelled with its verdict.

## Amendments

### A1 — 2026-11-23, PRE-RESULTS for A and C (their control failed, nothing of A or C scored): a time-aware benchmark
The A/C mechanics control came out at −5.05pp (limit 3), so A and C were not scored. Cause: s / (s + d) assumes
unlimited time, but VWAP targets are often far and every trade ends at 22:00, so among trades that end at a barrier the
nearer stop is over-represented. The benchmark for A and C (control **and** the A rule's TP-vs-benchmark part) becomes
a **driftless random walk over the time actually left**: per trade, 300 simulated 1-minute paths from the fill to
22:00 London with each minute's variance = σ² × that minute's share of the instrument's vol clock (`exhaustion-v2-<sym>/clock_F.parquet`,
the year's column), barriers at the real stop and TP; benchmark = P(TP first | a barrier is hit). Control limit stays 3pp.
B was scored under its own rule (no benchmark part) and is unaffected.

### A2 — 2026-11-23, POST-HOC (B results seen), describe only
B passed its rule (net +0.054R [+0.007, +0.092], both halves > 0). Concentration: the upside breaks carry it (OH +0.115R,
OL −0.009R) and 2020–26 was a rising period for NQ, gold and USD/JPY, so part of it may be market drift. Needs a
drift-controlled confirmation (e.g. against random same-time entries in the same direction) before any use.
