# cost-verification — are the costs our studies charge (OANDA bid/ask spreads, modelled financing) what the owner's real broker accounts actually charge on NAS100 and gold?

**Pre-registered 2026-10-25. Partly not blind:** part A's swap rows were listed (per-night swap % of notional by
trade) in this session before this prereg was written, which showed two different gold swap regimes and US100 long
≈ −0.019% a night. Part B (fills) and part C (MT5 specs) have not been computed. The tolerance bands below are
fixed now and apply to all three parts.

| | |
|---|---|
| ID / ledger id | `cost-verification` (context) |
| Branch | `claude/overnight-hold-dax-ifo-retro` |
| Register row | `plans/RESEARCH_REGISTER.md` → `cost-verification` |
| Data | the owner's live Trade History (`/api/trade-history`, read-only GET), XAUUSD and US100 closed trades 2026-05 → 2026-10-25 (~960 trades, 86 held over a rollover); OANDA M1 bid/ask `data/m1_bidask/{nq,gold}_m1.parquet`; FRED DFF. Real-account cost records, not a forecast, so the lockbox does not apply |
| Seed | `20261025` |
| Uncertainty | bootstrap of medians over trades, resampled by calendar day, B = 10,000 |
| Scripts / outputs | `scripts/cost-verification/` → `analysis/output/cost-verification/` (+ `cost_table.json` for reuse) |
| Harness | own script |

## 1. The claim (required)

Ours (`overnight-hold`, 2026-10-25): NQ costs 0.0068% spread + 0.0135% financing per overnight trade, gold 0.0225% +
0.0160%, from OANDA practice bid/ask and (Fed funds + a markup from one OANDA snapshot)/365, triple Wednesday on gold
only. The owner's concern: "verify the costs are correct so we don't accidentally kill an idea because of incorrect
costing." The engine's earlier placeholders were 2.5–4× too high and did exactly that.

## 2. Why it is not already settled (required)

`analysis/output/costs/BIDASK_QUALITY.md` checks the OANDA file's internal quality (crossed, zero, stale), not
whether it matches what a real account pays. `futures-cost-rescore` used an unconfirmed $4 commission. No study has
compared any modelled cost with the owner's own fills or swaps.

## 3. Definitions, fixed in advance (required)

**Grouping.** Trades are grouped by symbol, direction and **account group**, the group being identified by bot (the
trade rows carry no account number): group A = bots whose swaps sit on the lower gold schedule, group B = the higher;
the bot→group mapping is reported in full so it can be checked against the owner's account list.

**A. Financing (swaps).** For each trade held over ≥ 1 server midnight (server midnight = the 17:00 New York
rollover): swap % of notional = swap ÷ profit × (close − open) ÷ open, signed by direction (currency-free). Single-
rollover trades give the per-night rate by weekday, which shows the triple day. Annualised rate = per-night × 365
(per calendar day). Compared with our model's charge for the **same nights**: (DFF + markup)/365 × days, NQ markup
2.51pp / no triple, gold 1.44pp / triple Wednesday. Implied markup = measured annual rate − DFF of that night.

**B. Spread + slippage (fills).** For every trade's entry and exit, the OANDA M1 bid/ask bar at the fill minute
(server time → UTC with the offset that minimises the median |fill − OANDA mid|, among the two DST candidates UTC+2 /
UTC+3, chosen per calendar month). Signed cost = s × (fill − mid)/mid in bp, s = +1 for buys and −1 for sells at entry
(opposite at exit). A constant price basis between the broker's feed and OANDA's cancels by averaging buys and sells:
**cost = (median signed cost of buys + median signed cost of sells) / 2**, reported per symbol, account group and
side (entry / exit), and at the two overnight-hold minutes (20:00 and 14:30 UK ± 60 min) where n allows. Compared
with OANDA's half-spread at the same minutes. Exits include stops and targets, so they are reported separately and
entries are primary.

**C. Broker specs (needs the owner's OK, not run otherwise).** `symbol_info` (swap_long, swap_short, swap_mode,
swap_rollover3days, spread) and the M1 `spread` column from each account's MT5 terminal at 20:00 / 14:30 UK. The live
bots use these terminals, so nothing attaches to them without the owner's approval.

**Tolerance bands (each cost component, per instrument):** ratio = model ÷ measured.
- **0.67–1.5: verified.** The model stands.
- **> 1.5: overstated.** The model could kill a real idea. Replace it with the measured cost.
- **< 0.67: understated.** The model flatters results. Replace it.

**Re-score (descriptive):** the banked overnight-hold trades re-costed with each account group's measured financing
(and part B's spread where n ≥ 30 per side), net CAGR reported next to the banked figure.

## 4. Hypotheses, expectation first (required)

| # | Question | Expectation |
|---|---|---|
| A-NQ | US100 financing vs model | verified (the 20 trades listed suggest ≈ 6.9% a year vs ≈ 6.4% modelled) |
| A-GOLD | gold financing vs model | **overstated** for both groups: group A is far cheaper; group B charges no triple Wednesday |
| B | fill cost vs OANDA half-spread | near OANDA or worse (retail broker spreads plus slippage); unknown |

## 5. Power (required)

A: per-night swaps are near-deterministic within a group (the listing shows them identical to 3 decimals), so even
n = 5 per group pins the rate; the limit is coverage (only US100 in group B, only ~4 weekdays per group). B: fill
noise is dominated by feed basis and timing; with ~400 trades per symbol the median is good to ~±0.3bp; at the two
overnight-hold minutes n will be small and is reported as descriptive only.

## 6. Multiplicity (required)

No hypothesis tests. Every group × component cell is reported, not selected.

## 7. What this does NOT test (required)

Any strategy. Costs before 2026-05 (the Trade History starts then; financing markup back in time stays an assumption).
Prop-firm (FTMO) costs, unless one of the owner's accounts is a prop account. Commissions, which the trade rows
don't carry (the deal backfill sums them, the live rows don't).

## 8. What each verdict changes (required)

Verdict word **CONTEXT**. A verified component is recorded in `cost_table.json` as checked. An overstated or
understated one is replaced there with the measured value, the overnight-hold re-score is reported, and the banked
overnight-hold entries get a dated note (their verdicts can only be demoted or described by a post-hoc look, not
promoted).

## Amendments

### A1 — 2026-10-25 — POST-HOC (results seen)

- Part B: the entry-side comparison the prereg made primary isn't a clean spread reading. The bots send market
  orders, yet NQ entries came out better than the minute's OANDA mid and exits worse, so the fill-vs-mid number
  carries the strategies' own timing. The "overstated" band from it is not used to change the gold spread model;
  entry + exit together are reported as a bracket instead.
- Account groups: bots with no overnight gold position are left unassigned rather than defaulted to a group. US100 is
  pooled as group B (only B bots plus OI-Vol hold it overnight, at an identical rate).

## RESULTS

*In `analysis/output/cost-verification/RESULTS.md`.*
