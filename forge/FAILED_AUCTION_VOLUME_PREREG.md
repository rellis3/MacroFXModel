# failed-auction-volume — Does real CME volume turn a failed auction at a range edge into a tradeable futures setup?

**Pre-registered 2026-10-22, before any outcome was computed.**

| | |
|---|---|
| ID / ledger id | `failed-auction-volume` (scored cells S1, S2 below; one ledger entry) |
| Branch | `ccr-fa64cca7-73trfh` |
| Register row | `plans/RESEARCH_REGISTER.md` → `failed-auction-volume` |
| Data | CME futures via NT8 (Lucid login), per-contract 1-minute bars with real exchange volume from `nt8_bridge/nt8_backfill.py`, front contract by the `nt8_bridge/nt8_stitch.py` roll rule, **unadjusted** prices (levels). Instruments NQ, ES, YM, RTY, GC, CL. Window 2019-01-02 → 2026-08-21 (lockbox: nothing after 2026-08-21 is scored). Tick history (secondary D1 only) where NT8 serves it. G2 gamma sign for NQ / ES from `OI Data/NAS100_USD.csv`, `OI Data/SPX500_USD.csv` (secondary D2 only) |
| Seed | `20261022` (one for every script in this study) |
| Uncertainty | session-date block bootstrap, block 20 sessions, B = 2000, clustered by date across instruments |
| Scripts / outputs | `scripts/failed-auction-volume/` → `analysis/output/failed-auction-volume/` |
| Harness | own Python script (the NT8 data is local to the owner's laptop and in per-contract parquet; `js/harness/runStudy.mjs` reads the OANDA research cache, not these files) |

## 1. The claim

ColezTrades Discord, #Vip-Discussion, 03/07/2026 ~23:30 (UK date format; screenshots shared by the owner on
2026-10-22). A message whose author is cut off in the screenshot (context suggests Jordan's method, but that is not
shown) says:

> "Impulse move, some sort of range, buy the lows, failed auction, if move to the upside that is, thats literally it,
> I means there's more but that's the crux of it"

Jordan (CT, not C.OG), 23:32, replying to "is this the volum…": "Not just that / Volume foot prints / Volume profiles /
Order flow / There is a lot more stuff".

Auction-market theory (Dalton, *Mind Over Markets*) gives the volume half a testable form: a probe outside the
balance area that draws **little volume** is a rejected auction, and price should rotate back through value to the
other side; a probe that draws **heavy volume** is acceptance, and the old range stops mattering.

The claim tested: after an impulse and a balance, a failed probe of the balance edge *against* the impulse, entered
on the reclaim and targeting the other edge, earns positive net R on CME futures, **and** does better when the probe
drew below-normal volume than when it drew above-normal volume. The second part is the order-flow information.

## 2. Why it is not already settled

- **Price-only versions of Jordan's pattern are banked null** (`education/jordan_impulse_range_backtest/`,
  `jordan_atr_band_backtest/`, `jordan_vwap_session_reversion_backtest/`). None used volume, and all ran on OANDA CFD
  mid prices. This study's new variable is real exchange volume, and its scored contrast (S2) is volume-confirmed vs
  volume-heavy probes of **the same price pattern**, so it is not the price-only test again.
- **Volume profile levels are null inside the confluence book** (`live-range-confluence-book`, 204 tests), but there
  volume was OANDA tick counts. `plans/LEVEL_ENGINE_ROADMAP.md` names "real order flow or exchange volume" as the
  condition to reopen level work. NT8 history is that.
- **Options gamma as a direction or fade/follow signal is null** (G1, G3, `gamma-regime-trades`,
  `gamma-regime-trades-fx`; `cog-knowledge` do-not-reopen list). Gamma enters here only as a descriptive split (D2),
  never as a direction signal or a scored cell. G2's range effect (long gamma = quiet) is validated, which is why the
  split is worth describing.

## 3. Definitions, fixed in advance

- **Sessions.** Day sessions in US/Eastern: NQ, ES, YM, RTY 09:30–16:00; GC 08:20–13:30; CL 09:00–14:30. Bars before
  the open and after the close are ignored. Every trade is flat by the session's last bar. Sessions shorter than 80% of
  normal length (half days) are dropped.
- **σ30.** Standard deviation of non-overlapping 30-minute log returns inside the session over the previous 20
  sessions (strictly before today). Needs 20 prior sessions; until then no setups.
- **Impulse.** From 15 minutes after the open, the first minute t where |ln(close_t / close_{t−30})| ≥ 2.0 × σ30.
  Direction = its sign. Impulse size I = the high−low of those 30 minutes. One impulse per instrument per session (the
  first).
- **Balance B.** The 60 minutes after t. Valid only if high(B) − low(B) ≤ 0.6 × I. If not valid, no setup that
  session. H = high(B), L = low(B).
- **Volume profile of B** (descriptive, used for D3). Each minute's volume is spread evenly over the ticks from its
  low to its high; POC = the busiest tick, value area = 70% of volume around the POC.
- **Failed auction (up impulse; mirror for down).** After B, the first minute whose low < L − 1 tick starts the probe.
  The probe is void if price trades below L − 0.5 × (H − L) (acceptance). The setup fires when, within 15 minutes of
  the probe start, a minute closes ≥ L. **Entry** at the next minute's open. **Stop** = probe low − 2 ticks. **Target**
  = H. Stop and target both inside one minute count as a stop. Exit at the session close if neither is hit. Down
  impulse: probe above H, short on the close back ≤ H, target L.
- **Volume ratio V.** Each minute's volume is divided by the median volume for that minute-of-session over the previous
  20 sessions. V = mean of these over the probe minutes (probe start to the reclaim minute, inclusive) ÷ the mean over
  B. **V-low** if V ≤ 1.0 (thin probe = rejection), **V-high** if V > 1.0.
- **Knowable when?** Everything uses minutes up to and including the reclaim minute; entry is the following minute's
  open. Roll days: a setup is skipped if B, the probe or the trade spans a roll switch in `<ROOT>_rolls.csv`.
- **Outcome.** Net R per trade = (exit − entry) × side ÷ (entry − stop distance), after costs: 1 tick slippage on
  entry, 1 tick on stop and session-close exits, 0 on target fills (limit), plus $4 per round trip
  (`forge/FUTURES_COST_RESCORE_PREREG.md`; the Lucid rate is still unconfirmed). Trades with a stop distance under
  4 ticks are skipped (costs dominate).
- **Instruments** are reported separately and pooled for the scored cells (pooled with date clustering).
- **Control.** S2 compares V-low with V-high setups (same pattern, same sessions). A permutation placebo shuffles the
  V label within instrument-year 1,000 times.
- **De-clustering.** One setup per instrument per session, so setups are independent within an instrument. Same-day
  setups across instruments are handled by date clustering in the bootstrap.
- **Sample split.** Half 1 = 2019-01-02 → 2022-12-30; half 2 = 2023-01-03 → 2026-08-21.

## 4. Hypotheses, expectation first

| # | Question | Pre-registered expectation |
|---|---|---|
| S1 | Mean net R of V-low setups, pooled | **Null** (best guess ≈ 0 to +0.05R; price-only cousins were null) |
| S2 | Mean net R of V-low minus V-high, pooled | **Small positive**, ≈ +0.1R if anything |
| **THE GATE** | S1 ≥ +0.15R **and** S2 ≥ +0.20R, each with its 95% interval above 0 after Holm (2 cells); same sign in both halves for both; S2 positive in ≥ 4 of 6 instruments; real S2 above the 95th percentile of the permutation placebo | — |
| **THE MIRROR** | The same failed auction *with* the impulse's direction against it (probe of H after an up impulse, short back into the range) | descriptive only; reported beside S1 |
| D1 | Tick-rule delta on the probe: does "absorption" (delta in the probe's direction but price reclaims) beat no absorption? | descriptive; run only where tick history covers ≥ 500 setups |
| D2 | S1 and S2 by G2 gamma sign (NQ, ES only; OI(D) → session D+2, as in `gex-range-es`) | descriptive; expectation: long gamma better, because dealers damp moves then |
| D3 | Target = POC instead of H | descriptive |

## 5. Power — what this design can and cannot find

R's standard deviation is **assumed** at 1.3 (bracket trades with a ~1–2R target; to be replaced by the measured SD of
the price-only setups' R before S1/S2 are read, see the count-first rule below). Design effect 1.5 for same-day
setups across the four equity indices. α = 0.025 (Holm, 2 cells), 80% power, two-sided. `js/preregStats.js`
`nForMde`.

| Cell | Needed n (after de-clustering) | Outcome SD | Design effect | MDE at needed n | Pass bar | Verdict |
|---|---|---|---|---|---|---|
| S1 | ≥ 1,071 V-low setups | 1.3 (assumed) | 1.5 | 0.15R | +0.15R | POWERED if n reached |
| S2 | ≥ 1,205 in each of V-low and V-high | 1.3 (assumed) | 1.5 | 0.20R | +0.20R | POWERED if n reached |

Rough expected count: ~0.3 setups per instrument-session × ~1,900 sessions × 6 instruments ≈ 3,400, about half in
each V group. This is near the needed n, so:

**Count first.** The first script run counts setups per instrument and V group and computes the SD of R over
**all** setups pooled (the V label not used). That is the only outcome-touching number allowed before the scored
run, and it is written into `## Amendments` as a PRE-RESULTS entry with the recomputed MDEs. If a cell's n is below
its needed n at the measured SD, that cell is **UNDERPOWERED by design**: it is reported as a description and banked
`underpowered`, never `null`.

## 6. Multiplicity

- **Scored cells:** S1, S2. Holm at α = 0.05 over the two (`holm`). The gate also needs both halves and ≥ 4 of 6
  instruments, which is stricter.
- **Disaggregation cells** (per instrument, per half, per gamma sign, D1, D3, the mirror): Benjamini–Hochberg at
  q = 0.10 with `chanceBaseline`. A survivor is a candidate for its own prereg, never a result.
- **Variants:** none beyond the table above. The thresholds (2.0σ30, 60-minute balance, 0.6 × I, 0.5 range depth,
  15-minute reclaim, V = 1.0) are fixed here and not swept.
- **Promotion to live trading** needs |t| ≥ 3 on S1 and a forward record on the live NT8 recorder, which first needs
  real-time CME data and exchange timestamps (`plans/QUANT_SYSTEM_BUILD_PLAN.md` §3).

## 7. What this does NOT test

- Footprint charts as a trader reads them by eye. V and tick-rule delta are mechanical stand-ins.
- Jordan's actual trades or his discretion ("there is a lot more stuff").
- Live tradability: history only, approximate aggressor side (tick rule is ~85–90% right), arrival-stamped live feed
  not used.
- Options as a direction signal (closed). D2 only describes whether the setup behaves differently on long- vs
  short-gamma days.
- The Lucid account's rules on this style of trading, and the real commission.

## 8. What each verdict changes

- **Validated** → ledger entry `failed-auction-volume`; the setup and its V filter go on the futures desk page as
  research-only, and a forward record starts once the real-time feed exists. Nothing trades on it before |t| ≥ 3 and
  the forward record.
- **Null** → ledger entry; level research with real volume closes for this pattern; the page says "volume at the probe
  did not separate good from bad failed auctions on CME futures, 2019–2026".
- **Underpowered** → ledger entry with the measured n and MDE; reopen with a longer history (tick or 1-minute data
  before 2019) or more roots (FDAX, ZN, 6E) under a new prereg.

## Amendments

*(none yet)*

---

## RESULTS — run <YYYY-MM-DD>

*Written to `analysis/output/failed-auction-volume/RESULTS.md`. Nothing above this line changes after the run.*
