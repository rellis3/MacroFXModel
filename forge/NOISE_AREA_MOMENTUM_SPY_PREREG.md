# noise-area-momentum-spy — does the "Beat the Market" noise-band strategy replicate on SPY as the paper ran it, and does it still pay after publication?

**Pre-registered 2026-11-15, before any SPY outcome was computed.** The SPY 1-minute pull was running while this was
written; only a two-week probe (Jan 2007, Nov 2026: bar counts and first/last timestamps) had been read. No band, signal,
position or return has been computed on SPY. The ES/NQ/YM/RTY results of `noise-area-momentum` (banked 2026-11-13)
ARE known; this prereg is written knowing them, so it fixes the same rules and does not tune anything.

| | |
|---|---|
| ID / ledger ids | `noise-area-momentum-spy` (S1: SPY over the paper's own window), `noise-area-momentum-spy-post` (S2: SPY after publication) |
| Parent | `forge/NOISE_AREA_MOMENTUM_PREREG.md` (rules §3 reused verbatim except where stated below) |
| Branch | `main` |
| Register row | `plans/RESEARCH_REGISTER.md` → `noise-area-momentum-spy` |
| Data | IBKR SPY (ARCA) 1-minute TRADES bars, regular hours, unadjusted, with volume and IB's bar VWAP; pulled 2026-11-15 by `scripts/noise-area-momentum/fetch_spy_ib.py` into `analysis/output/noise-area-momentum/_cache/spy_1m/` (gitignored, vendor data). IB stamps the bar START; IB's ETF regular hours run to 16:15, so bars starting 16:00–16:14 are dropped. |
| Windows | S1: 2007-05-01 → 2024-04-30 (the paper's sample). S2: 2024-05-01 → **2026-08-21** (lockbox). σ warm-up uses the 14 days before each window start. |
| Seed | `20261115` |
| Uncertainty | ISO-week-clustered bootstrap, B = 2,000; within-day permutation null, 200 draws (S1), 200 (S2) |
| Scripts / outputs | `scripts/noise-area-momentum/` (`engine.py` gains a SPY loader; `run_spy.py`) → `analysis/output/noise-area-momentum/spy/`; page `noise-area-momentum.html` gains SPY |

## 1. The claim

Paper (see parent §1): on SPY, May 2007 → April 2024, net of $0.0035 commission + $0.001 slippage per share each side:
band + VWAP 1x Sharpe **1.24** (380%, hit 43%); vol-targeted Sharpe **1.33**, 19.6%/yr, MDD 25%; opposite-band 1x
Sharpe 0.61; 7,668 trades. FAQ Q24: 2025 to Aug +1.0%.

## 2. Why it is not already settled

The parent study tested ES/NQ/YM/RTY futures, 2016 → 2026-08, and could not test SPY ("no SPY 1-minute data held",
parent §7). Result: NQ passes every gate part; ES misses on cost (gross 1.03, net 0.47); P1/P2/P3 UNDERPOWERED. Two things
are untested: (a) the paper's own instrument, cost and 2007–2015 period (incl. 2008), which is the only way to say
whether the published numbers reproduce; (b) the post-publication SPY record at the paper's cost.

## 3. Definitions (changes from parent §3 only)

- **Instrument / bars:** SPY as above. Missing bars inside the session forward-filled (close carried, volume 0).
- **Days used:** 09:30 bar present and ≥ 200 bars (half-days kept and closed at their last bar; SPY does not trade on
  exchange holidays, so the parent's futures holiday rule `last ≥ 220` is NOT applied).
- **PrevClose:** last regular-hours close of the previous used day, unadjusted (ex-dividend days carry the dividend in the
  gap; ~4 days a year; stated limitation). A gap of > 5 calendar days → no PrevClose, no trade.
- **VWAP:** Σ typical·vol / Σ vol from 09:30 with typical = (H+L+C)/3, as the parent (IB's bar VWAP stored but not used,
  so SPY and futures share one definition).
- **Costs (scored):** the paper's: $0.0035 + $0.001 per share per side = **$0.009 per share per round trip**, converted
  to return on the day's open, times leverage. Described only: + half a cent spread per side ($0.019/share round trip).
- **Variants:** V1–V7 exactly as the parent. Equity from $100,000, fractional shares.

**Null, positive control:** the parent's (within-day permutation of minute log returns with volume and H/L offsets; the
positive control already passed on this engine, `analysis/output/noise-area-momentum/control.json`).

**Mechanics check:** S1 V3 and V2 1x net Sharpe, total return and trade count reported against the paper's 1.33 / 1.24 /
7,668; monthly V3 returns vs the FAQ Q24 table (2016-01 → 2025-08). "Reproduces" = |Sharpe gap| ≤ 0.25 on both and
monthly ρ ≥ 0.8. Reported, not a verdict: a failure means our build or their data differ, audited before S1/S2 are read.

## 4. Hypotheses

**S1 `noise-area-momentum-spy`** (V2 1x, net of the paper's cost, 2007-05 → 2024-04, ~4,270 days):
VALIDATED if net Sharpe > 97.5th pct of its permutation null, week-bootstrap 95% CI of mean daily net return > 0, and
net Sharpe > 0 in both halves (median-day split). NULL if the CI upper bound of net Sharpe < **0.62**. Else UNDERPOWERED.
This is the paper's own sample: a pass says the published result reproduces and survives our null, not that it is
out-of-sample.

**S2 `noise-area-momentum-spy-post`** (V3, net of the paper's cost, 2024-05-01 → 2026-08-21, ~580 days): VALIDATED if
the CI of mean daily net return > 0, net Sharpe > 97.5th pct of the null, and both halves > 0. NULL if the CI upper bound
of net Sharpe < **0.66**. Else UNDERPOWERED (expected; see power).

**Described only:** V1, V3–V7 in S1; V2 in S2; S1+S2 combined; gross; + half-cent spread; year table; the parent's
decomposition (entry-30 / hold-to-close / stop value) on SPY; SPY vs ES on the overlapping 2016–2026 days (daily-return
correlation, Sharpe gap and how much is cost).

## 5. Power

S1: ~17 years → SE of Sharpe ≈ √((1+0.6²/2)/17) ≈ 0.26, MDE (80%, 5% two-sided) ≈ **0.74**. The paper's 1.24 is well
above it; half of it (0.62) is not, hence NULL by the CI bound. S2: ~2.3 years → SE ≈ 0.70, MDE ≈ **2.0**. S2 can only
reach VALIDATED if the strategy runs far above the paper's own Sharpe; UNDERPOWERED is the expected verdict and is
recorded as such, not read as failure. NULL needs the upper bound below 0.66, i.e. a clearly negative point estimate.

## 6. Multiplicity

Two scored cells (S1, S2), each with its own bar; independent windows. Everything else described. Logged trials: 2 scored
+ 6 described variants + 1 cost sensitivity.

## 7. What it does NOT test

- Integer shares, borrow for shorts, and latency (decision bar close = fill), as the paper.
- Dividend adjustment of PrevClose (see §3).
- Anything after 2026-08-21.

## Amendments

- **A1, 2026-11-15, PRE-RESULTS** (loader smoke test on 2007-01 → 2009-02 bars only: bar counts and last-bar times read,
  no scored statistic): IB's ETF regular hours also run 15 minutes past the 13:00 close on half-days (last bar starts
  13:14). On any day whose last bar is before 15:59, the last 15 bars are dropped so the exit is the exchange close, as on
  full days. One odd IB record (2007-12-24, ends 15:44) is kept as delivered.

## RESULTS

→ `analysis/output/noise-area-momentum/spy/RESULTS.md`
