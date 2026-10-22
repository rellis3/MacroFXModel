# Cross-currency basis (phase 1: EURUSD, GBPUSD)

Built 2026-10-22 by `scripts/xccy-basis/build.py`. This is a data build only: no test has been run on it yet.

**What it is.** The premium non-US holders pay to swap EUR or GBP into dollars, backed out of covered interest parity using CME FX futures (NinjaTrader per-contract 1-minute archive, `analysis/output/nt8/contracts/6E|6B`) against OANDA spot at the same minutes (19:00–19:14 UTC, near the CME settle). Rate legs are overnight: SOFR (EFFR before 2018-04), €STR (EONIA − 8.5bp before 2019-10) and SONIA, from FRED. **Negative = dollars are scarce or expensive offshore.** The course (Currency Markets & Global Flows) calls this the dollar-funding stress gauge.

| Series (feature store) | Use |
|---|---|
| `xccy_basis_{eur,gbp}_live` | The level known on the day. It carries expected policy moves, because overnight legs are held flat across a 25–95 day tenor. |
| `xccy_basis_{eur,gbp}_realised` | The clean level: fixings compounded over the contract life. Known only after delivery, so research only. |
| `xccy_basis_{eur,gbp}_dchg` | The **daily change at fixed rate legs**, same contract. Priced policy steps cancel out. Use this for "the basis moved 20–30bp in a day". |

**Checks** (`qa.json`):
- Yearly median EUR: −49bp (2016), −31 (2017), −34 (2018), −12 (2019), −27 (2022), then about 0 by 2025–26. This matches the known history.
- March 2020: live −113bp; realised minimum −146bp (EUR) and −99bp (GBP).
- Daily change: SD 5.5bp (EUR) and 5.9bp (GBP); median absolute 2.4 / 2.9bp.
- The largest days are real events: the Brexit vote, 2020-03-23, the 2017 year-end turn, and the eve of the June 2022 75bp hike.

**Data decisions.**
- Contracts need at least 25 days to delivery. Forward points are only about 10 pips, so one futures tick (half a pip) is about 5bp at 25 days and 15–25bp at 10. Days in the 2–3 weeks before each roll are therefore missing (1,879 of about 2,170 trading days kept).
- The rate legs use the **median of the last 5 fixings**, so one-day prints (September 2019 repo spike, quarter-ends) are not held flat across months.
- **Feed fault removed:** 2020-10-19 → 2020-10-22, in both 6E and 6B. The futures−spot gap swung ±25 pips with flat rates, which is a timestamp misalignment. Nothing else is removed. A trailing "spike" flag is kept in `basis_daily.csv` for information only, because it also fires on genuine squeezes.
- The data stops at 2026-08-19 (where local OANDA M1 ends). Sessions after 2026-08-21 are lockbox anyway.

**Not built yet (phase 2):** JPY and CHF (TONA and SARON are not on FRED; they need BoJ/SNB fetchers), and a live daily feed (it would need a CME futures settlement source on Railway, for example the QuikStrike capture's `future` column).
