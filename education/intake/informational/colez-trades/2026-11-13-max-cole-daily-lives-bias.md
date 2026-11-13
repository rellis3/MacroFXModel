# Max Cole: how the daily bias is built (40 "Live Trading" streams, 14 Sep – 12 Nov 2026)

| | |
|---|---|
| Lane / source | informational / colez-trades (elevated pass: Colez Trades educator, not C.OG) |
| Speaker(s) | MAX = Max Cole (ColezTrades YouTube). Chat members are not quoted |
| URL | https://www.youtube.com/@coleztrades/streams: all 40 past lives (ids in the per-batch extracts) |
| ReelScribe | bulk job 38c7814c-1f13-4e19-81b8-d22b43e93c98 · 40 videos, 10–68 min each, ~1.5M chars. Raw text in `raw/informational/colez-trades/` (gitignored) |
| Recorded | 2026-09-14 → 2026-11-12. NY-open slot (13:30 UK) until 10-19, London-open slot from 10-26 |
| Processed | 2026-11-13. Four parallel readers (10 lives each). Per-video extracts `batch_A–D.md` and `max_manifest.json` sit beside the raw text (gitignored: they quote the paid group's signals) |
| Question | Owner (2026-11-12): can the Signal Copier's trades (ColezTrades Private → Signals, 1R each) be replicated from desk macro data, HTF bias, etc.? |

## Lesson
Max's direction is a **fundamental, mostly US-dollar call made once a day after the Asia session**. Technical levels
are only used to enter, add or re-enter, never to choose direction ("bias is 70–80% of the system"). The call comes
from the **FundaBias** dashboard (fundabias.com: a direction plus a 1–10 conviction score per instrument, refreshed
an hour or two after news; he says he helped build it). He usually publishes about one point *below* the tool and in
every stream checked **never takes the opposite sign**. On top he adds the calendar:
- **neutral and flat before tier-1 US data** (CPI, NFP, PPI, FOMC, Fed chair) and on bank holidays
- **trade the direction of the surprise afterwards**
- **carry the bias forward** until a catalyst changes it

He expresses the call as a basket of USD-correlated market entries at 07:00–08:00 UK: 1R each, SL beyond structure,
no TP and no breakeven. The basket is held until the next morning's re-check flips or neutralises it, and closed by
Friday 21:00. **Neutral days have no trades** (he says 30–50% of days).

The desk terminal was itself modelled on FundaBias (`plans/DESK_ANALYST_PIPELINE.md` Phase 17), so the desk's morning
ratings are the closest in-house analogue of his input.

## Approach
- **Steps, in his order** (stable across all four batches):
  1. Forex Factory red folders
  2. FundaBias score per instrument
  3. His own overlay (USD strength / Fed tone / real yields "especially on gold" / COT / geopolitics), dampening only
  4. Pick the pairs that express the USD view, plus deliberate hedges (indices vs the FX book)
  5. Market entries after Asia
  6. Re-decide every morning
- **Inputs cited, streams out of 40 (approx.):**

  | Input | Streams | Used for |
  |---|---|---|
  | News calendar | ~34 | direction |
  | USD strength | ~27 | direction |
  | FundaBias score shown or quoted | ~19 | direction |
  | "Nothing changed" persistence | ~10 | direction |
  | Asia session | ~10 | mostly timing/stop; once a direction input (10-09 overnight rally flip) |
  | HTF structure | ~11 | only to justify *neutral* |
  | Rates / yields / COT | ~8 | direction (overlay) |
  | Fib / value area / prior H-L / daily open / VWAP | ~33 | entries only |
  | VuManChu / divergence | ~6 | confirmation only; ignored when against bias |

- **Evidence he offers**: claimed backtests (see claims 6–8), never shown. On every overlapping date (10-07 → 11-12)
  what he said on stream matched the posted signals on instrument, side and swing/day. On neutral gold days there
  were no gold signals.
- **Kill rule** (per trade): the bias flipping or going neutral. None stated for the method.

## Claims
| # | Claim (speaker) | Type | On file? |
|---|---|---|---|
| 1 | "bias is completely and utterly fundamental"; "zero price action involved in the fundamental signals" (MAX) | method | Contradicted once by his own record: the 10-09 bullish gold flip followed an overnight Asia rally with no named release [inference, batch B] |
| 2 | "90% of fundamentals is just looking at the US dollar" (MAX) | mechanism | **PARTLY ON FILE**: `fx-factor-stack` UNDERPOWERED (carry/momentum/value/surprise next-month, no IC excludes 0); `direction-bar` Phase 0: no direction cell has forward evidence yet. Daily USD-direction calling as such is untested |
| 3 | Neutral before tier-1 US data, trade the surprise direction afterwards (MAX) | trading | **PARTLY**: `post-fomc-usd-drift` live in the direction ledger (FRAGILE); `fx-factor-surprise` not registered (store lacks non-US actuals). Same-day post-CPI/NFP USD drift on gold/EURUSD/GBPUSD not tested |
| 4 | Never trade opposite the FundaBias sign, only dampen it (MAX) | method | UNTESTED. We hold no FundaBias history; the desk's own ratings exist only from 2026-11-03 |
| 5 | Desk-style daily bias scored 08:00–21:00 London | trading | **ON FILE (interim)**: desk-score record, 5 eligible days, S −0.25, vs drift −0.49 (not judged; `forge/DESK_ANALYST_PIPELINE_PREREG.md`) |
| 6 | Enter at London open in bias direction, stop at the day/Asia high-low, no TP, flat 21:00: "extremely good positive expectancy including costs"; >3 pairs adds nothing (USD-correlated) (MAX, 09-24/25) | trading | UNTESTED as stated: needs a historical bias series. The desk-score row is the nearest analogue (claim 5) |
| 7 | "Fundamental trades": 1R target ≈ 56–61% win, ~0.2R/trade; hold until bias changes ≈ 47% win, 0.34R/trade, 15–20R a month (MAX, batch B) | self-report | Our scored copy of his signals (Signal Copier outcomes, 10-07 → 11-12, follower fills, one spread): 122 filled, **+8.3R, +0.07R/trade ± 0.11**; swings +12.7R/27 (two gold swings ≈ +14R), singles −1.4R/55, day trades −4.1R/4 |
| 8 | ~38% win rate, 55% of days positive, 80% of weeks, 93% of months; "a few days carry the P&L" (MAX, batch D) | self-report | Shape matches our record (P&L from the 11-03 gold buy +6.0R, the 11-11 post-CPI USD-long trio ≈ +18R open, the 10-30 risk-off basket ≈ +20R by his account). Five weeks can't test the monthly figures |
| 9 | BTC short "every bloody day" because of the Binance hack (MAX) | call | Narrative, asset-specific; not scored |
| 10 | Levels (GP/.786/.886 + VAH/VAL/POC + daily open + round number) for entries and adds (MAX) | trading | **ON FILE NULL** on nearby constructs: see `2026-11-12-max-cole-wayon-strategies.md` claims 3–5, 7 |

**Undisclosed parts:** the FundaBias model itself; his "extra stuff on top" / "my own dashboards, my own secret
source"; how drivers are ranked; which pairs carry the view and which are hedges; the 1–10 conviction mapping. Most
single-day calls in Nov came with no stated reason.

## What we could learn
- **Separate the bias from the entry, and judge the bias alone first.** He does this in words ("bias is 70–80%");
  our copier outcomes mix both. ALREADY DO for the desk (desk-score scores ratings 08–21 London, no entries).
  For his signals: score each day's *direction* at a fixed open→21:00 exit, next to his actual fills.
- **Neutral days as a first-class output.** Days off are part of his edge claim; the desk always rates. DO WORSE:
  the desk-score could report a "would-have-stood-aside" split, but that is a desk prereg change, so owner decision.
- **Self-reported stats from a seller** (claims 6–8): survivorship / marketing; treat as hypotheses (method lesson
  #27 / Disagree table already covers this).

## Research ideas
- **Q1 · Does Max's daily direction have edge apart from his entries?** variable = his side per instrument-day (first
  signal of the day) · condition = swing vs single, post-data day vs not · horizon = entry → 21:00 UK and → next
  07:00 · noise = same-instrument random-side days, block bootstrap by day · benchmark = B0 climatology / B1 drift
  (direction-bar) · changes: whether copying swings-only is worth paper trading. Power: ~25 days now; judge at 60.
  **Not carded yet: owner to choose (sample too small today).**
- **Q2 · Replica of the bias:** sign of the latest tier-1 US surprise (CPI/NFP/PPI, actual − consensus) → USD long/short
  for gold/EURUSD/GBPUSD, flat on release days, carried until the next release. Same horizons and benchmarks as Q1,
  then agreement with Max's sides. Uses the existing calendar store (US actuals present). Candidate for the
  `macro-direction` agenda; **not carded**: research-director/owner pick.
- **Q3 · Daily alignment log** (build, not a study): each morning store Max's sides, the desk ratings and currency
  biases, the latest surprise sign and the HTF trend for every signal instrument. Gives Q1/Q2 their data and the
  "desk agrees / opposes" split (first 8 days: agree 18 signals −2.1R, oppose 7 +7.0R, desk flat 13 +7.8R; noise).

## Quotes
- "Bias is completely and utterly fundamental." (batch C)
- "90% of fundamentals is just looking at the US dollar." (batch D)
- "I don't need to come with a new bias every single day… just make sure no big news has come out." (batch B)
- "I don't try and factor the unknown." (batch C)
- "If we are bullish… we will only take buys." (batch B)
