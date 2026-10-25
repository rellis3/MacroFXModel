# cost-verification — results

Prereg: `forge/COST_VERIFICATION_PREREG.md` (committed in `25bb02ed`; part A not blind, stated there). Run
2026-10-25, seed 20261025, B = 10,000. Scripts `scripts/cost-verification/verify.py` (parts A, B) and `rescore.py`.
Outputs: `results.json`, `rescore.json`, `cost_table.json` (for reuse), `swaps.csv` (currency-free fields only).
The raw Trade History pull (`trades.json`) is gitignored: it carries account P&L and the repo is public.
Ledger id `cost-verification`.

## Verdict: CONTEXT

**Financing:** our model is right for NAS100 and for gold on the higher-cost account, and **3–4× too high for gold on
the other account**. **Spread:** the owner's fills can't isolate it (order timing dominates), but they bracket the
real round-trip cost at about 1.1–1.2bp on both instruments, close to OANDA's for NQ and half of it for gold. No
cost error in our model was large enough to change a verdict: re-costed with what the accounts actually pay, the
overnight hold nets **NQ +5.6% a year (banked +6.0%)** and **gold +4.7% to +6.3% (banked +4.0%)**.

## Part A: financing, from 86 real overnight positions (2026-05 → 2026-10)

The server clock separates them exactly: 86 of 86 trades held over a server midnight carry swap, and none of the 854
others do. Two account groups show up in the gold rates. The trade rows carry no account number, so groups are by
bot, and only bots with an overnight gold position are assigned (mapping in `results.json` → `A.group_of_bot`):

- **Group A:** Gold bot, Regime V1, Backtest, Range Line, Fib Atlas, Motif.
- **Group B:** OI bot, Volatility v1/v2/v3. US100 overnight trades come only from these bots plus OI-Vol, at an
  identical rate, so they pool as B.
- **Unassigned (no overnight gold or US100 position):** MacroFX, Regime V2/V7, DynAnchor. The bot config memory puts
  MacroFX and Regime V2 on Regime V1's account, which would make them A, but that isn't evidence here.

| Instrument, group | Single-night trades | Measured long, per night | Annual | Triple day | Implied markup over Fed funds | Our model per week held ÷ measured | Band |
|---|---|---|---|---|---|---|---|
| US100, B | 4 long (+13 short) | −0.0190% | 6.9% | none (Wednesday 1.00×) | 3.24pp (model 2.51) | 0.90 | **verified** |
| Gold, B | 7 long (+9 short) | −0.0162% | 5.9% | **none** (Wednesday 1.00×) | 2.15pp (model 1.44) | 1.32 | **verified** |
| Gold, A | 12 long (+13 short) | −0.0031% | 1.1% | Wednesday 2.97× | −2.5pp (below Fed funds: not rate-linked) | **4.53** | **overstated** |

- Shorts: on group B gold and US100, shorts are **paid** (+3.7% and +1.9% a year). On group A, gold shorts also pay
  (−0.4% a year).
- Per-night rates repeat to 3–4 decimals within a group, so small n is enough.
- What's left unchecked: rates before 2026-05. Group A isn't tied to Fed funds, so going back in time it's held
  constant (assumption).
- Our model's triple Wednesday on gold is wrong for group B and right for group A. Its NQ no-triple is right.

## Part B: fills vs OANDA mid at the same minute (1,719 matched fills)

Server clock = UTC+3 in every month (May–October). Cost per side = (median signed cost of buys + of sells) / 2, which
cancels any constant feed basis.

| | Entry cost per side | 95% CI | Exit cost per side | 95% CI | OANDA half-spread, same minutes |
|---|---|---|---|---|---|
| US100 | **−0.68bp** (better than mid) | [−1.44, −0.13] | +1.85bp | [+1.06, +2.50] | 0.36bp / 0.35bp |
| Gold | +0.16bp | [−0.09, +0.51] | +0.96bp | [+0.54, +1.32] | 0.72bp / 0.73bp |

- **Entries that beat the mid aren't free fills.** The bots send market orders, so this is timing: they enter after a
  move, and the minute's average mid has moved back by then. Exits include server-side stops, which slip. So part B
  measures fill vs the minute's mid, including the strategy's own timing, not the spread. The prereg's entry-only
  comparison (gold model 0.0225% vs measured 0.003% round trip, "overstated") is therefore not a clean reading, and
  isn't used to change the model.
- **Bracket:** entry + exit per side gives a realised round trip of **0.0116% (US100)** and **0.0112% (gold)**, vs
  our OANDA model's 0.0068% and 0.0225%. Within the 1.5× bands on NQ (ratio 0.59, borderline understated); our gold
  spread is about 2× the bracket.
- **Near the overnight-hold minutes** (20:00 and 14:30 UK ±1h): too few trades for a reading (NQ entries 14, gold
  52).

## Re-score: the banked overnight-hold trades at the measured costs

| | Financing per trade | Net CAGR | Mean net per trade | t (iid) | FTMO funded, 1× |
|---|---|---|---|---|---|
| NQ, banked OANDA model | 0.0135% | +6.0% | +0.034% | 1.66 | 40% |
| NQ, group B measured | 0.0155% | **+5.6%** | +0.032% | 1.56 | 38% |
| Gold, banked OANDA model | 0.0160% | +4.0% | +0.022% | 1.29 | 43% |
| Gold, group B measured | 0.0125% | **+4.7%** | +0.026% | 1.50 | 44% |
| Gold, group A measured | 0.0047% | **+6.3%** | +0.034% | 1.95 | 51% |

With part B's realised fill cost in place of the OANDA spread: NQ +4.6% to +5.0%, gold +6.3% to +8.8%. None of
these changes the banked verdicts (underpowered both). The cost model wasn't killing the idea; the placeholder costs
used before 2026-10-25 were.

## Part C (not run): broker specs from the MT5 terminals

`symbol_info` (swap_long / swap_short / swap_rollover3days / spread) and the M1 `spread` column, per account, at
20:00 and 14:30 UK. That's the clean spread number part B couldn't give. It needs the owner's OK, because the live
bots use those terminals.

## What this changes

- `cost_table.json` records NQ financing as verified (group B), gold financing as account-specific (A ≈ 1.1% a year
  with triple Wednesday; B ≈ Fed funds + 2.15pp, no triple), and spread as unverified pending part C.
- The banked `overnight-hold-gold` entry gets a dated note: the financing was too high for one of the two real
  accounts; corrected, the net is +4.7% to +6.3% a year, verdict unchanged.
- Method lesson: when the trade rows have no order type, fill-vs-mid measures timing as much as spread.
