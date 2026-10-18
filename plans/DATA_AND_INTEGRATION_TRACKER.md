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
| Cboe full chains, SPX/NDX/RUT/DJX, every contract once a day after the close | KV `cboe_raw_<SYM>_<date>`, `/api/cboe-raw` | first close after PR #1540 is deployed | ~400 trading days for a range/regime test → about mid-2028 | **Live after merge + deploy** |
| CME options (QuikStrike nightly, incl. ES/NQ weeklies and dailies) | KV `oi_raw_<date>` | ~2026-08 | ~400 days → about autumn 2027 | Running (laptop scrape; KV only, no second copy) |
| Economic calendar, all countries, actual/consensus/previous | `calendar_events_nasdaq.csv` (+ `load_calendar()`) | backfilled from 2026-07-03 | now | **Done**; refresh Sun + Wed via `.github/workflows/calendar-refresh.yml` after merge |
| CME CVOL | `js/data/cmeCvolEod.json` | static, ends 2026-08-21 | — | **Blocked**: cmegroup.com refuses scripts (403); history is paid (DataMine). Free route = add to the laptop job, see §3 |
| OANDA order/position books | — | — | — | **Dead source** (OANDA stopped them) |

## 2. Builds, in order

| # | What | Why | Data needed | Who | Status |
|---|---|---|---|---|---|
| 1 | Merge PR #1540 and deploy | Starts the Cboe archive clock; turns on the calendar refresh; dealer hedging map goes live | — | **Owner** | Waiting |
| 2 | **One daily range forecast**: persistence + IV lines (forecast-pick) × the validated flags (VIX term, VIX9D front, NQ down-week, breadth all-down, GEX sign on NQ, event tag), served once; Daily Plan, Global Read, the 07:00 digest and the bot read it | Today the best lines never get the flags, the flags sit on the plain ladder, the digest makes its own call and the bot gets neither | existing | Claude | Not started. First a short pre-registration: do the flags still add on top of persistence + IV (they were fitted on the IV-adjusted ladder)? |
| 3 | Zero-gamma regime test on NQ with the **textbook** zero gamma (`js/hedgingScenario.js` on history) | The research-book flip was a crude proxy and the textbook one was never tested; NQ history exists now (743 days, quarterlies) | Databento NQ (have) | Claude | Not started; needs a pre-registration. Question: does above/below zero gamma change next-day range or follow-through beyond the GEX sign we already use? |
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
