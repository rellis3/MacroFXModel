# noise-area-fx-book: the "Beat the Market" noise-band rule on gold and the USD majors, and every system run together as one book

**Pre-registered 2026-11-17, before any FX or gold outcome was computed.** Known when this was written: the equity results of
`noise-area-momentum`, `noise-area-momentum-spy` and `noise-area-build` (SPY reproduces, 1.17 net in 2007–2024; NQ 1.23; ES
0.45; YM ≈ 0; RTY −0.79; tuning does not help), and the prior-art result below. Only data coverage, bar counts and median
bid/ask spreads were read for FX and gold (1.2–2.5 bp).

| | |
|---|---|
| ID / ledger ids | `noise-area-fx` (F: the rule on gold + 7 USD majors, London and New York sessions), `noise-area-book` (P: all systems run together, equal risk) |
| Parents | `forge/NOISE_AREA_MOMENTUM_PREREG.md` (rule §3), `forge/NOISE_AREA_BUILD_PREREG.md` |
| Branch | `main` |
| Data | OANDA M1 bid/ask `data/m1_bidask/{eurusd,gbpusd,usdjpy,audusd,usdcad,usdchf,nzdusd,gold}_m1.parquet` (open-stamped, naive UTC; mid OHLC + bid/ask close; tick volume), 2016-10-21 → **2026-08-21** (lockbox). Equity streams from the parents' day matrices. |
| Seed | `20261117` |
| Uncertainty | ISO-week-clustered bootstrap, B = 2,000; within-day shuffled-minute null, 100 draws per FX/gold cell; BH q = 0.10 over the 16 F cells |
| Scripts / outputs | `scripts/noise-area-fx-book/` → `analysis/output/noise-area-fx-book/`; page `noise-area-fx-book.html` (standard backtest output: % / $ equity, compounded / simple, drawdown, monthly, trades, CSV) |

## Prior art (read first)

- `close-window-momentum-secondary` (CONTEXT, 2026-11-11): gold and four majors, last-30-minute momentum into the 16:00 London
  fix / 13:30 ET settle. Small positive slopes on GBPUSD and USDJPY; **every trade lost net**: gross −0.4 to +0.7 bp against
  1.2–2.3 bp of spread. Spread, not direction, killed it.
- `trend-following-fx` (NULL): daily FX trend following is null. `nq-continuation-execution` (NULL): continuation at forecast
  levels on NQ CFD loses net.
- Lesson applied (RESEARCH_METHOD_LESSONS: costs first, execution-feasibility gate): spread ÷ average daily-session range is
  reported per cell before any P&L; > 0.15 is flagged as not executable whatever the gross.

## 1. The rule on FX and gold (frozen; the paper's V2 and V3, nothing tuned)

Two sessions per instrument, each with its own open, checks and exit, times in the local zone (DST handled by the zone):

| Session | Open (band anchor) | Checks (decide at the close of the bar ending at) | Flat at |
|---|---|---|---|
| **LDN** | 08:00 Europe/London | 08:30, 09:00 … 15:30 (every 30 min) | 16:00 London (the WM/R fix) |
| **NY** | 08:00 America/New_York | 08:30, 09:00 … 16:30 (every 30 min) | 17:00 New York (FX day end) |

- **Band:** σ(minute m) = mean |close(m) / open − 1| over the previous 14 sessions at that minute. Upper = max(open, previous
  session's flat price) × (1 + σ); lower = min(open, previous flat price) × (1 − σ).
- **Entry / exit (V2):** at each check, long if mid > upper band and > session VWAP (tick-volume weighted, from the session
  open); short if mid < lower band and < VWAP; otherwise flat. Flat at the session end.
- **Size:** V2 1x; V3 = min(4, 2% ÷ 14-day σ of session close-to-close). Scored on **V2 1x** (Sharpe is size-free).
- **Costs:** real OANDA spread. Every unit of position change pays half the bid/ask spread at that bar's close, as a
  fraction of the session open (entry, exit, reversal, and the final flat).
- Sessions with fewer than 80% of their minutes, or no bar at the open minute, are dropped. Weekdays only.

Cells: 8 instruments × 2 sessions = **16**.

## 2. Running the systems together (the book)

Every system trades every day it has a session. Streams: the 16 FX/gold cells above + the 5 equity streams (paper rule V2,
realistic costs: SPY $0.019/share round trip; ES/NQ/YM/RTY 1 tick each side + $4.50). Each stream is scaled to 10%
annualised vol using its own trailing 60-day vol (known the day before); the book is the average of the scaled streams on
each day (a stream with no session that day counts 0). Common window: 2016-11-21 → 2026-08-21.

## 3. Scored

**F `noise-area-fx`** (per cell, 16, BH q = 0.10): VALIDATED if the week-bootstrap mean CI of V2 1x net daily return is
above 0 after BH, both halves positive, and it beats ≥ 97.5% of the shuffled-minute draws. NULL if the net Sharpe CI top is
below **0.50**. Otherwise UNDERPOWERED. Headline: VALIDATED if any cell is VALIDATED, NULL if all 16 are NULL, otherwise
UNDERPOWERED.

**P `noise-area-book`**: the all-systems book. VALIDATED if the mean CI is above 0 and both halves positive; NULL if the
Sharpe CI top is below 0.50; otherwise UNDERPOWERED.

Power: ~9.7 years per cell → Sharpe SE ≈ 0.32, MDE ≈ 0.9. The book has more breadth; with average pairwise correlation ρ
across N streams its Sharpe is roughly √(N / (1 + (N−1)ρ)) × the average stream Sharpe.

## 4. Described only

- Gross (no cost) Sharpe per cell; spread ÷ session range per cell (the feasibility gate).
- The equity-only book (5 streams) and the FX/gold-only book (16), same scaling.
- Correlation matrix of the streams; average number of positions open per day; net USD exposure of the FX legs on each day
  (how often positions offset each other: a natural hedge).
- **Hedged core:** 100% SPY buy & hold plus the all-systems book as an overlay at 10% vol, against SPY alone and the book
  alone (Sharpe, CAGR, max drawdown, worst year), 2016-11 → 2026-08.
- Leave-one-stream-out book Sharpe (does one stream carry it).

## 5. What it does NOT test

- Any tuning (band width, checks, exits) on FX/gold; other sessions (Tokyo); crosses; commissions beyond the spread.
- Choosing which streams go in the book after seeing results: the book holds all 21.
- Anything after 2026-08-21.

## Amendments

## RESULTS
