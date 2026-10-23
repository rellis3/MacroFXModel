# vix-signals-forward: forward record of the four VIX/Nasdaq signals banked 2026-10-23

**Pre-registered 2026-10-23. Every rule below is frozen today. Only signals at closes from 2026-10-26 onward are
scored.** They are rebuilt from public end-of-day closes that are not revised: CBOE VIX/VVIX/VXN, FRED NASDAQ100 and
CBOE VX settlements. So re-running the scorer at any later date reproduces the same record, and no daily job is needed
to keep it honest.

| | |
|---|---|
| ID / ledger id | `vix-signals-forward` (judges the four entries below; no new ledger id until judged) |
| Branch | `main` |
| Data | fetched fresh on each run: `cdn.cboe.com/api/global/us_indices/daily_prices/{VIX,VVIX,VXN}_History.csv`, FRED `NASDAQ100`, CBOE VX settlements (`scripts/vix-calculus/fetch_vx_futures.py`). History back to 2025 is used only to fill the 252-session percentile windows. |
| Seed | `20261023` |
| Scripts / outputs | `scripts/vix-signals-forward/score.py` → `analysis/output/vix-signals-forward/record.json`; shown on `research-log.html` |

## The four signals (definitions identical to their studies)

| # | Ledger entry | Flag at close d | Outcome | Backtest |
|---|---|---|---|---|
| 1 | `vvix-ratio-range` | R_a or R_b (20-session VVIX- / VIX- vs Nasdaq realised-vol ratio) ≥ 90th pct of its last 252 | ln VIX, close d+1 → d+21 | about −7% |
| 2 | `vix-beta-change` | C.OG's dR/dt (5-session change of the 20-session VIX-on-Nasdaq slope) ≤ 10th pct | ln Nasdaq, d+1 → d+6 | +0.76% vs +0.33% |
| 3 | `vix-second-derivative` | 5-session change of ln(VVIX/VXN) ≥ 90th pct | ln Nasdaq, d+1 → d+21 | +2.5% vs +1.3% |
| 4 | `short-vx-rule` | signal 1 → short the nearest VX with ≥ 35 days left at the d+1 settle, +25% stop, 20-session hold, one at a time, 0.10 pts (+0.05 on stops) | net R | +0.22R (random entry +0.12R) |

A run of consecutive flag days counts as **one event**, dated by its first day. Outcomes may overlap across events, and
only non-overlapping events are scored: an event starting inside the previous event's outcome window is shown but not
counted.

## When and how each is judged

- **When:** each signal is judged at **20 scored events**, or on **2028-10-23**, whichever comes first. The short-VX
  rule is judged at 15 trades.
- **Holds:**
  - the mean outcome has the backtest's sign;
  - and it beats the all-days mean over the same forward window, one-sided p < 0.10, by a bootstrap over events. The
    looser α reflects that this is a confirmation of a banked effect, not a discovery.
- **Fails:** the mean has the opposite sign, or p > 0.5.
- **Otherwise:** not yet decided, and the record keeps running to 2028-10-23.

**What a judgement changes:**

- "Holds" lets a research-only entry be promoted, which still needs |t| ≥ 3 on backtest plus forward pooled.
- "Fails" demotes the entry to CONTEXT, with a note.

## Amendments

(none)
