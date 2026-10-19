# Data capture and integration tracker (started 2026-10-18)

The single list of what is being captured, what still has to be built to bring the tested pieces
together, and what needs the owner. Update the status column in the same change that moves an item.
Newest decisions at the bottom.

Why this exists: 115 tests are banked (35 passed) in `js/deskEvidence.js`, but the survivors feed four range
outputs that never meet, and some free data was being thrown away daily. This file keeps the follow-through
from getting lost between sessions.

## 1. Data being captured (the clock is running on these)

| Feed | Where it lands | Since | Becomes testable | Status |
|---|---|---|---|---|
| Cboe full chains, 18 index/ETF chains (SPX, NDX, RUT, DJX, XSP, VIX, SPY, QQQ, IWM, DIA, GLD, SLV, USO, TLT, HYG, FXE, FXY, UUP), every contract once a day after the close | R2 `cboe_raw/<SYM>/<date>.json`, `/api/cboe-raw` (~11 MB/day; KV only as no-R2 fallback) | 2026-10-19 | ~400 trading days for a range/regime test → about mid-2028 | **Live** (moved to R2 + ETFs 2026-10-19: QQQ ≈ 3× NDX, ≈ 17× CME NQ dealer gamma) |
| CME options (QuikStrike nightly, incl. ES/NQ weeklies and dailies) | KV `oi_raw_<date>` | ~2026-08 | ~400 days → about autumn 2027 | Running (laptop scrape; KV only, no second copy) |
| Dealer-hedging state forward record (NQ, SPX, RUT, gold; state at the open, scored on range and breaks) | R2 `forward/hedging_state/<date>.json`, `/api/hedging-forward` | 2026-10-19 | ≥ 250 sessions per market (~2027-10), `forge/HEDGING_STATE_FORWARD_PREREG.md` | **Live** |
| Economic calendar, all countries, actual/consensus/previous | `calendar_events_nasdaq.csv` (+ `load_calendar()`) | backfilled from 2026-07-03 | now | **Done**; refresh Sun + Wed via `.github/workflows/calendar-refresh.yml` after merge |
| CME CVOL | `js/data/cmeCvolEod.json` | static, ends 2026-08-21 | — | **Blocked**: cmegroup.com refuses scripts (403); history is paid (DataMine). Free route = add to the laptop job, see §3 |
| OANDA order/position books | — | — | — | **Dead source** (OANDA stopped them) |

## 2. Builds, in order

| # | What | Why | Data needed | Who | Status |
|---|---|---|---|---|---|
| 1 | Merge PR #1540 and deploy | Starts the Cboe archive clock; turns on the calendar refresh; dealer hedging map goes live | — | **Owner** | **Done** 2026-10-18; archive job running in production, first write Mon 2026-10-19 after 16:25 New York (weekends skipped) |
| 2 | **One daily range forecast** | Four range outputs never met | existing | Claude | **Done 2026-10-18.** Test run on the laptop: Q1 FAIL (0.9926 vs bar 0.99), Q2 FAIL → the forecast is SI/S. Global Read now reads the Daily Plan's chosen lines with no stacked multipliers (flags shown as context). Not changed: the 07:00 digest's ATR range calls (a running forward record, kept to finish its scoring) and the bot (needs its own costed test). |
| 3 | Zero-gamma test on NQ (reframed: above/below zero gamma IS the G2 sign, already real; the new question is **distance** to zero gamma beyond the sign) | C.OG's "conditional feedback loops"; textbook zero gamma never tested | `oi_research_book/data` (in repo) | Claude | **Done 2026-10-18: NULL, underpowered** (ΔDR +0.023, p 0.69; harness gates failed, effects up to ~±0.15 not ruled out). `oi_research_book/ZERO_GAMMA_DISTANCE_RESULTS.md`. Rerun as a new prereg after ~400 days of our own capture. |
| 4 | Execution layer into the bot: vol-target sizing, stop-risk map, spread/ATR > 0.15 gate | All three passed; the bot uses none | existing | Claude | Not started |
| 5 | One intraday read: hourly re-forecast, line-touch reach, extreme-in, level reach and time, tape speed, first-hour fraction, plus the two passed-but-unused (fast-start rest-of-day, reversal hour) | Spread over four pages; two survivors used nowhere | existing | Claude | Not started |
| 6 | Feed the new calendar into the surprise index | "6 of 8 currencies have no recent prints": the new file covers all countries with consensus | `calendar_events_nasdaq.csv` | Claude | Not started |
| 7 | Second copy of the irreplaceable KV archives (`oi_raw_*`, `cboe_raw_*`) to R2 | KV is the only copy of data that cannot be re-bought | — | Claude | Not started |
| 8 | ES range test (G2 on ES) | G2 is real on NQ only | ES OI history: Databento (cost-check first, §3) or wait for our own capture | Claude after §3 | Blocked on data/cost decision |
| 9 | Add C.OG's two posted ES trades to `cog-replication/FORWARD_LOG.md`; send him the open questions (`.claude/skills/cog-knowledge/references/open-questions.md`, 2026-10-18 entry) | Score him on calls made in advance, not hindsight circles | — | Claude (log) / **Owner** (ask him) | Not started |

## 3. Needs the owner (cannot be done from a cloud session)

- **Databento ES quote (free):** on the laptop, `python oi_recon/databento_oi_pull.py --cost-only --only SPX500_USD`.
  It only asks for a price (`metadata.get_cost`); nothing is charged. Weeklies need their own asset codes added
  before any real pull. Decide after seeing the number.
- **CVOL:** either accept the IV term structure the QuikStrike job already stores daily as the substitute, or add a
  CVOL page capture to the laptop job.
- **Questions for C.OG** about his hedging chart (delta or gamma fans, which expiries, IV source, the three "flip" levels).

## 4. Stopped (do not reopen without a genuinely new mechanism and its own pre-registration)

- Rates leading Nasdaq (~15 pre-registrations, ~44,000 cells, all null).
- Fading or taking direction at lines (~20 nulls).
- GEX walls/flips as support, resistance or magnets (wall placebo, G3, ripple walls).
- 2Y yield-spread sleeve as a direction signal (deflated 2026-10-17; removed from Global Read and the outlook engine 2026-10-18).

## 5. Decisions

- 2026-10-18: Cboe raw chains kept in full (not summary) in permanent KV, one key per index per day (~2.5 MB/day).
- 2026-10-18: Calendar continuation kept as a separate source-tagged file; the 46k duplicate rows in
  `calendar_events.csv` are dropped by the loader, not deleted from the file (faults-log #11).
- 2026-10-18: Databento stays pay-per-use; no pull without a cost quote first.

## 6. Mechanism tests (2026-10-19, our reasoning, not C.OG's rules)

| Test | Verdict | Key number | Source |
|---|---|---|---|
| Opex cycle: wider range the week after monthly expiry than the week into it (US4) | **INCONCLUSIVE** (right way on all 4 and both halves, interval includes 0) | +0.055 log [−0.014, +0.124] | `forge/OPEX_CYCLE_RANGE_PREREG.md` |
| Vol-crush drift: next session after a Fed/CPI VIX collapse | **NULL** (the rally is same-day: SPX +0.94%, NQ +1.30%) | +0.03% [−0.23, +0.28] | `forge/VOL_CRUSH_DRIFT_PREREG.md` |
| Gamma-regime trades (fade p75 on long gamma, follow on short; follow a zero-gamma break), NQ | **NULL** (every arm negative after costs; CME book only) | interaction +0.06 R [−0.30, +0.44] | `forge/GAMMA_REGIME_TRADES_PREREG.md` |
| Hedging size vs normal volume (does the gamma sign matter more when forced flow is big) | needs QQQ/SPY capture (~400 days) | — | not yet registered |
| Side finding to register: second half of the month quieter than the first vs the ladder (non-event days) | hypothesis | PRE/OPEX/POST −0.03…−0.08 vs OTHER | opex results |
