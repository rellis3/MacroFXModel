# overnight-hold — results

Prereg: `forge/OVERNIGHT_HOLD_PREREG.md` (committed in `0a240275`, 2026-10-25). Run 2026-10-25, seed 20261025,
B = 10,000, mean block 20 trades. Branch `claude/overnight-hold-dax-ifo-retro`. Ledger ids: `overnight-hold-nq`,
`overnight-hold-gold`. Scripts: `scripts/overnight-hold/run_engine.mjs` (engine as-is), `honest.py` (scored),
`descriptive.py`. Outputs: `engine_asis_full.json`, `results.json`, `descriptive.json`, `honest_trades_*.csv`.

## Verdicts: NQ UNDERPOWERED, gold UNDERPOWERED

Net of real OANDA bid/ask spreads and modelled OANDA financing, both legs make money: NQ **+6.0% a year**, gold
**+4.0%**. Neither clears the registered gate. NQ's interval excludes zero ([+0.001, +0.066]% per trade, t 2.0), but
Holm p is 0.085 across the two instruments. The earlier "net slightly negative" came from placeholder costs 3–4× the
real ones. Like-for-like CFD buy & hold still beats both on return and Sharpe, and no version passes a prop challenge
at 1× size.

## Scored cells (window 2016-10-24 → 2026-08-21, 9.8 years)

| Cell | Trades | Mean net / trade | 95% CI | t | Holm p | MDE (prereg) | NULL bar | Verdict |
|---|---|---|---|---|---|---|---|---|
| NQ | 1,949 | +0.0335% | [+0.0011, +0.0660] | 2.02 | 0.085 | ~0.08% | CI below +0.01% | UNDERPOWERED |
| Gold | 1,962 | +0.0223% | [−0.0092, +0.0538] | 1.39 | 0.167 | ~0.06% | same | UNDERPOWERED |

Halves (mean net per trade, split 2021-09): NQ +0.057% / **+0.010%**; gold +0.002% / +0.042%. NQ's edge sits mostly
in the first half; 2025 −4.6%, 2026 to August −1.8%.

## Costs: real vs the engine's placeholders (average per trade)

| | Real spread (bid/ask at the fill minute) | Real financing | Real total | Engine placeholder total |
|---|---|---|---|---|
| NQ | 0.0068% | 0.0135% | 0.020% | 0.050% |
| Gold | 0.0225% | 0.0160% | 0.039% | 0.063% |

- Full NQ spread fell from ~1.5bp (2016–17) to ~0.4bp (2021 on); gold ~1.4–2.6bp. Bid/ask mid equals the engine's
  fill on 100% of trades.
- Financing = (Fed funds + markup)/365 per rollover, markup from the 2026-10-20 OANDA snapshot (NAS100 2.51pp, gold
  1.44pp). **NAS100 has no triple Wednesday** (`financing_days_wed` = 1), so the engine's triple-Wednesday charge was
  wrong for NQ; gold's is right (3).
- Breakeven cost multiple: NQ **2.46×**, gold **1.50×** the real costs (engine as-is: 0.92× and 0.96× of its
  placeholders).
- Adding the engine's default slippage on top: NQ +3.96% a year, gold +0.88%.

## Gross, net and buy & hold side by side

| | Gross CAGR | Net CAGR | Net max DD | Net Sharpe | Exposure |
|---|---|---|---|---|---|
| NQ overnight | +10.4% | **+6.0%** | −18.6% | 0.53 | 42% of the time |
| NQ CFD buy & hold (same financing, every day) | +20.0% | **+14.3%** | −38.1% | 0.73 | 100% |
| Gold overnight | +12.3% | **+4.0%** | −20.3% | 0.41 | 42% |
| Gold CFD buy & hold | +13.7% | **+9.5%** | −27.1% | 0.64 | 100% |

Correlation of overnight returns to buy & hold's daily return: NQ −0.09, gold −0.01 (engine).

## Controls

- Timezone gate: largest 1-minute move on NFP Fridays lands at 12:00 UTC (126 / 123 Fridays), inside 12–14 UTC.
- Expected vs actual trades: 2,774 entry dates vs 2,111 / 2,124 trades (full window). The gap is Sunday 20:00 UK,
  when both markets are still closed, plus holidays; logged as exceptions.
- Mirror identity: the engine's overnight × 14:30→20:00 legs don't reconstruct buy & hold, because they leave out each
  Friday 14:30 → Monday 14:30. With those legs included the identity closes to 1.000000 on both. Gold earns +212% of
  its gross in the overnight window and +13% in all daytime and weekend time combined; NQ +164% / +126%.

## Prop-rule check (descriptive): generic ruleset, 5% daily, 10% trailing, +8% in 30 trading days, 30% consistency

Rolling starts every 21 trades (92 starts):

| | Pass | Daily-loss fail | Trailing-DD fail | Consistency fail | Timeout |
|---|---|---|---|---|---|
| NQ 1×, intraday equity (MAE) | **2%** | 6 | 2 | 3 | 79 |
| NQ 1×, closed trades only (engine convention) | 5% | 4 (any) | — | — | 83 |
| Gold 1×, intraday | **3%** | 2 | 1 | 0 | 86 |
| NQ 3×, intraday (post-hoc sizing look) | 13% | 51 | 5 | 11 | 13 |
| Gold 3×, intraday (post-hoc) | 16% | 30 | 14 | 17 | 16 |

At 1× it almost never reaches +8% in 30 days. Sized up to get there, it mostly blows the daily-loss limit on intraday
equity. Counting intraday equity instead of closed trades roughly halves the 3× pass rate (NQ 37% → 13%), which is
the engine's prop-check fault in numbers.

## Deviations from the prereg

- The mirror integrity criterion ("within 0.5%") was mis-stated: by construction the engine's two legs skip the weekend.
  Replaced by the full identity with the weekend legs (descriptive). Recorded as Amendment A1.
- The prereg said the engine fixes (B&H financing, MAE-based prop check) would be added to the engine as options.
  They were computed in the study scripts instead; the engine and page are unchanged (side-by-side rule). Follow-up.
- 3× leverage prop runs were added after results were seen: descriptive only.
- Exit-time sweep (14:30 / 15:30 / 16:30) ran inside the engine as-is output; it is extra searching and is not reported
  as a result.

## What this changes

- The record no longer says "net negative". It says: a real overnight effect, small, positive net of real costs
  (≈ +6% / +4% a year), not statistically confirmed, decaying on NQ, below buy & hold, and not a prop-challenge
  strategy at any size tested.
- The engine's defaults (costs 3–4× too high, triple-Wednesday on NQ, gross B&H, closed-trade prop check) should be
  replaced before the page is used again. Not done here.
- Next if anyone reopens it: a forward paper record from 2026-08-22 on (lockbox + live) at the 14:30 exit only.
