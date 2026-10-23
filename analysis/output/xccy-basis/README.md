# Cross-currency basis (EURUSD, GBPUSD, USDJPY, USDCHF)

Built by `scripts/xccy-basis/build.py`: phase 1 (EUR, GBP) on 2026-10-22, phase 2 (JPY, CHF, plus the traded-minute fix) on 2026-10-23. This is a data build. Tests run on it are in the Evidence Book (`basis-stress-*`, `basis-yearend-premium`; those used the phase-1 EUR/GBP build).

**What it is.** The premium non-US holders pay to swap their currency into dollars, backed out of covered interest parity using CME FX futures (NinjaTrader per-contract 1-minute archive, `analysis/output/nt8/contracts/6E|6B|6J|6S`) against OANDA spot. Only minutes **with a futures trade** between 18:30 and 19:29 UTC are used, and the day value is the median. Overnight legs:
- USD: SOFR (EFFR before 2018-04)
- EUR: €STR (EONIA − 8.5bp before 2019-10)
- GBP: SONIA (FRED)
- JPY: TONA (Bank of Japan stat-search `FM01/STRDCLUCON`)
- CHF: SARON (SNB data portal `snbgwdzid`)

6J and 6S quote USD per JPY/CHF, so OANDA USDJPY/USDCHF spot is inverted. **Negative = dollars are scarce or expensive offshore.**

| Series (feature store) | Use |
|---|---|
| `xccy_basis_{eur,gbp,jpy,chf}_live` | The level known on the day. It carries expected policy moves, because overnight legs are held flat across a 25–95 day tenor. |
| `xccy_basis_{…}_realised` | The clean level: fixings compounded over the contract life. Known only after delivery, so research only. |
| `xccy_basis_{…}_dchg` | The daily change at fixed rate legs, same contract. Priced policy steps cancel out. |

**Checks** (`qa.json`, after the traded-minute fix):

| | EUR | GBP | JPY | CHF |
|---|---|---|---|---|
| Typical daily change (median abs, bp) | 1.7 | 2.1 | 2.6 | 2.5 |
| March 2020 low (live, bp) | −110 | −87 | **−246** | −132 |
| 2016 / 2022 / 2026 yearly median (bp) | −50 / −27 / +1 | −35 / −13 / +1 | −71 / −72 / −15 | −64 / −62 / −20 |

JPY carries the widest and most persistent dollar premium (−72bp through 2022, still about −15bp), as the literature describes. EUR and GBP are about 0 now.

**Data decisions.**
- At least 25 days to delivery, because one tick is a large share of 10–25 pips of forward points. The 2–3 weeks before each roll are missing.
- Rate legs use the median of the last 5 fixings.
- **Feed faults excluded:**
  1. 2020-10-19 → 22, all pairs (futures−spot misalignment).
  2. **CHF 2022-04-20 → 2022-05-31** (contract 6S_06-22). The futures−spot gap jumps between 5 and 25 pips day to day while intraday-consistent with aligned clocks; rates imply about 15. Cause unknown.
- CHF is the noisiest pair because 6S trades thinly.
- Data stops 2026-08-19. Sessions after 2026-08-21 are lockbox.

**Not built:** a live daily feed. It needs a CME futures settlement source on Railway, for example the QuikStrike capture's `future` column, which is collected locally.
