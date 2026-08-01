# COG — the observed system (primary source record)

**Recorded 2026-07-28.** Until this file existed, the entire evidence base for
this repo's 13-file COG gate architecture was two sentences of remembered
paraphrase inside code comments (`cogThreshold1Gate.js`, `cogStateEngine.js`).
Every threshold in `cogConfig.js` was an invention wearing an observation's
clothes, and there was no record to check the invention against. This file is
the record. **Nothing here may be edited to fit a later model** — if an
observation turns out wrong, add a dated correction below it, don't overwrite.

Sections are strictly separated: §1 is what the owner has directly observed,
§2 is what COG has stated about his own system, §3 is his published
performance, §4 is inference (ours, falsifiable, and clearly labelled as
inference). Do not let §4 leak into §1–3.

---

## 1. OBSERVED — the message sequence (owner, first-hand)

Four stages, in order, one cycle per trading day. Times are **UK local** as
displayed in COG's UI.

| # | Message | Timing | Payload |
|---|---|---|---|
| 1 | **Data threshold 1** | "before 2pm usually — not always the same time. Sometimes 2am, sometimes 12:30pm" | VALID / INVALIDATED only |
| 2 | **Data threshold 2** | "usually about 1:30, can be as late as 2pm" | VALID / INVALIDATED **plus** stop distance % and max risk %, in two tiers |
| 3 | **Order filled** | "just before New York opens — have seen it up to 5 mins after open" | TRADE / NO-TRADE; if TRADE, a **direction** (Long/Short) |
| 4 | **Closed** | end of the trade | "close trade" instruction |

Execution as the owner runs it: enter on the stage-3 message at the given
risk amount, stop set at the quoted % distance from the trade's open, exit on
the stage-4 message.

### Screenshot evidence (2026-07-21, NQ)

- **Stage 1** timestamped **12:37**, header "SETUP FORMING", stages 2–4 unfilled.
- **Stage 2** timestamped **13:53**, section "RISK & SIZING", two tiers:

  | Tier | Stop distance | Max risk |
  |---|---|---|
  | Standard | **0.44%** | **2.2%** |
  | Conservative | **0.21%** | **1.00%** |

- **Stage 3** timestamped **14:26**, section "ENTRY & STOPS", Direction =
  **Short** (Long/Short toggle, Short selected).

The UI is a 4-step progress rail with per-stage timestamps and a per-stage
dismiss control. Header shows instrument (NQ) and date.

### What the timings anchor to

NY cash open is **14:30 UK** in BST. So on the observed day: stage 2 landed
**13:53 UK = 08:53 ET**, stage 3 landed **14:26 UK = 09:26 ET**, four minutes
before the open. Stage 1's stated range (02:00–14:00 UK) is far wider than
stages 2 and 3.

---

## 2. STATED — what COG has said about his own system

Verbatim in substance, from the owner:

- The system trades **NASDAQ**.
- It is **not an ORB (opening range breakout) strategy**.
- "His system doesn't bother about the current or past price of NAS. It
  actually **has nothing to do with NAS** — but more with the **fundamentals
  that affect it**."
- "Something about **repo and reverse repo**."
- "Tracking **central bank balance sheets from different countries**."
- The owner's understanding of the thesis: *"His system is identifying when
  money is pumped into the USA, to be invested in stocks listed under NAS —
  and when the majority of those stock prices are going to increase."*
- Overall impression: "it feels **fully dynamic and based upon data**."

**This confirms the input universe already encoded in
`js/cogLiquidityGate.js` / `cogConfig.js`** (WALCL, RRPONTSYD, WTREGEN,
ECBASSETSW, JPNASSETS, HY spreads) was aimed at the right target. It does
**not** confirm any weight, threshold or sign in that file — none of those has
ever been attributed to COG.

**Unknown and explicitly not observed:** what either gate actually computes,
what data feeds it, what makes it flip, how direction is chosen, what triggers
the close.

---

## 3. PUBLISHED — his performance tearsheet (his figures, not ours)

Supplied by COG; the owner states these are genuine, not fabricated. Recorded
verbatim so later analysis argues with numbers, not memory.

| | |
|---|---|
| Total Return | 517.11% |
| Annual Return | 97.41% |
| Monthly Return | 8.117% |
| Annual Volatility | 40.61% |
| Max Drawdown | −21.94% |
| Max DD Duration | 21 bars |
| Sharpe | 2.3151 |
| Sortino | 1.7166 |
| Calmar | 4.4397 |
| Omega | 2.2613 |
| VaR 95% / VaR 99% / CVaR 95% | −4.40% / −4.40% / −4.40% |
| Win Rate | 58.64% |
| Profit Factor | 2.2613 |
| Avg Win / Avg Loss | +4.880% / −3.060% |
| Best Day / Worst Day | +20.83% / −4.40% |
| Best Month / Worst Month | +50.52% / −15.40% |
| Skewness / Kurtosis | +2.972 / +15.23 |
| Positive / Negative Months | 45 / 19 |
| Trading Days | 324 |
| Total Trades | 324 |
| Avg Trade | +1.596% |

Monthly heatmap, annual totals: **2021 +120.7%, 2022 +76.0%, 2023 +56.9%,
2024 +105.2%, 2025 +118.0%, 2026 +40.2% (partial, through ~April).**

Monte Carlo panel: 500 paths, P(positive) = 100%, median final +517%, actual
tracking the median.

---

## 4. INFERENCE — ours, falsifiable, NOT observed

Everything below is reasoning from §1–3. It is labelled so it can never be
mistaken for evidence.

### 4a. The arithmetic is internally consistent

`0.5864 × 4.880 − 0.4136 × 3.060 = +1.593%` vs the stated Avg Trade
**+1.596%**. Profit factor and Omega are identical (2.2613) because Omega at a
zero threshold *is* the profit factor — redundant, not wrong. The tearsheet
does not contradict itself on the numbers that can be cross-checked.

### 4b. One trade per trading day, ~60 trading days per year

Trading Days 324 = Total Trades 324 exactly ⇒ at most one position per day.
Over the heatmap's ~5.4-year span (~1,350 weekdays) that is **~24% of
weekdays**, ~60 trades/year. So roughly three days in four produce no trade —
consistent with gates that genuinely veto.

### 4c. His Sharpe is methodology-robust (checked, not assumed)

Annual Return / Annual Volatility = 97.41 / 40.61 = 2.40 ≈ the stated 2.32, so
the tearsheet annualises per-trade stats by √(trades per year). This repo
abandoned that convention (`_qmrStats`) because it rewards trade frequency.
**But for a ≤1-trade-per-day system the two conventions are algebraically
identical**: calendar-daily Sharpe = (m/s)·√(252n/N) and per-trade Sharpe =
(m/s)·√(trades/yr), and trades/yr = 252·(n/N). Recomputing his numbers on this
repo's calendar-daily basis gives ~2.29 vs his 2.32. **The Sharpe is not a
methodology artifact.** Do not attack it on that basis.

### 4d. The loss distribution has a hard floor — and he doesn't ride it

VaR95 = VaR99 = CVaR95 = Worst Day = **−4.40%**, all identical. A loss
distribution with a hard, repeated floor and nothing beyond it means the stop
is real, always honoured, and never gapped through in this record.

But **Avg Loss is −3.06%, well inside that −4.40% floor.** Two explanations,
both testable, and we cannot yet tell them apart:

1. **He cuts losers before the stop** (the stage-4 "close trade" message
   firing early). If every loss were a full stop, expectancy would be
   `0.5864 × 4.880 − 0.4136 × 4.400 = +1.043%` against his actual +1.596% —
   meaning **roughly a third of his entire edge would be sitting in the exit,
   not the entry.**
2. **He mixes risk tiers** — the observed Conservative tier is 1.00% risk vs
   Standard 2.2%, so a blend of tiers produces sub-floor average losses with
   no early-exit behaviour at all.

Distinguishing these is worth more than almost anything else we could
measure, and the signal log (§5) separates them in a few weeks: log the tier
used and whether the close arrived before or at the stop.

### 4e. He sizes to near-constant leverage, not constant risk

Standard 2.2% risk ÷ 0.44% stop = **5.0×**. Conservative 1.00% ÷ 0.21% =
**4.76×**. Both tiers land on ~5× leverage from independent numbers. That
suggests position size is set by a leverage target with risk falling out of
the stop width — *not* fixed-fractional risk with size falling out. Single
observation; needs repeat days to confirm.

### 4f. The timing structure says the three stages are different kinds of thing

- **Stage 1 spans 02:00–14:00 UK.** A 12-hour window is not a scheduled
  release — it is a **continuously-evaluated condition that flips when it
  crosses**. This is precisely what `cogStateEngine.js` (V2) models and what
  the window-driven V1 could not. V2's core design assumption is now
  corroborated by the owner's direct observation.
- **Stage 2 clusters tightly at 13:30–14:00 UK = 08:30–09:00 ET.** That is
  the **US macro release slot** (CPI, PPI, claims, NFP, retail sales all print
  at 08:30 ET). A risk/sizing gate that fires just after the day's macro print
  — and outputs a stop distance, i.e. an expected-range number — is exactly
  what you would build if you sized to the range the day is *now* likely to
  have. **This is new information the current `cogRiskGate.js` does not
  encode**: our Gate 2 is a daily vol-regime read with no release trigger.
- **Stage 3 sits minutes before the cash open.** Whatever picks direction is
  using pre-open information only.

### 4g. The hardest structural problem: a slow signal cannot pick a daily side

Net liquidity (WALCL − TGA − RRP) and central-bank balance sheets move on
**weekly** cadence. A weekly series physically cannot generate a fresh,
independent direction 60 times a year with a 58.6% hit rate. So the stated
inputs cannot be the whole system. The coherent reading is:

- **Stage 1 = slow liquidity ⇒ a permission/regime filter** ("are conditions
  right to trade at all"), which explains the ~24% trade rate;
- **Stage 2 = post-release risk/vol sizing**;
- **Stage 3 = a fast, pre-open directional read** — the genuinely unknown
  component, and the one that carries the edge.

**This yields a cheap, decisive discriminator, computable from the signal log
alone with no model at all:** if direction comes from a slow liquidity signal,
his LONG/SHORT calls will arrive in **runs** (many consecutive same-side
trades). If it comes from a fast pre-open read, they will **alternate near
randomly**. Run-length statistics on ~30 logged directions separate these
hypotheses. This test needs no data of his, no reverse-engineering, and no
assumptions — only the log.

### 4h. Known context on the stated framework (neutral, not a verdict)

The "net liquidity = Fed balance sheet − TGA − RRP" framework is a real and
widely-followed macro lens (Michael Howell's global-liquidity work,
42 Macro, and the 2021–23 crypto/equity liquidity commentary). Its visual
correlation with SPX/NDX was strikingly strong across roughly 2021–2023 and
noticeably weaker before and after. That window substantially overlaps his
published record. **That is a reason to test the pre-2021 behaviour of any
liquidity-driven construction we build, not a reason to dismiss it** — and
his 2024/2025 rows (+105%, +118%) are outside the strongest-correlation
window, which argues against the simplest "he just rode the 2021–23
relationship" explanation.

### 4i. Where our own recent evidence bears on this

The QMR control arm (2026-07-28, `QMR_WALKFORWARD_RESULT.md`) measured a
direction call built from **NQ's own price** at exactly zero — inverting five
years of signals scored slightly higher. COG's stated design explicitly
refuses NQ price and sources direction from elsewhere. **Our null and his
claim are not in conflict; they are about different inputs.** That makes the
cross-asset/liquidity direction hypothesis genuinely untested here rather
than already-refuted, and it is the reason `cogDirectionGate.js` (built,
wired to nothing) deserves a run.

---

## 5. What to do next — the log is the unlock

We do not have his source data and never will. We *do* have his **outputs**,
and outputs are labels. This repo has already run this exact play once
successfully: `cogReverseEngineer.js` treated his published vol levels as
labels, back-solved the constants, and returned an honest answer (including
an honest null).

The stage-2 message hands us a **stop distance % per day** — that is a
volatility forecast in numeric form, fittable against every estimator this
repo owns (HV20/30, Yang-Zhang, GARCH, EWMA, ATR). The stage-3 message hands
us a **direction label per day**. The stage-4 message hands us a **holding
period**. Every one of these is unambiguous and free to collect.

Two things follow, and only the first is blocked on time:

1. **Log every message from today onward** (`cog_signal_log`) — date, per-stage
   timestamp, state, both risk tiers, direction, close time. Then resolve each
   day's actual outcome automatically from OANDA bars using the same walk the
   QMR engine uses, so we build a costed forward record of **his** calls.
2. **Then, and only then:** run-length test on direction (§4g), estimator fit
   on his stop distances (§5 above), and a forward-edge measurement of his
   direction calls that is completely independent of ever knowing his model.

Measuring whether his calls have forward edge does **not** require
understanding his system. Understanding his system without that measurement
would be building on an unverified premise. Do them in that order.

### Row 1 — 2026-07-21, resolved 2026-07-28

The screenshot day, logged and resolved against OANDA M5:

| | |
|---|---|
| Entry | SHORT @ 29,064.7, bar 13:30 UTC |
| Stop | 29,192.6 (0.44%) |
| Exit | 29,192.6 — **STOP** |
| Raw / net move | −0.440% / −0.453% |
| Account return | **−2.265%** at 5.0× leverage |
| MFE / MAE | +0.544% / −0.447% |

Three things this establishes, none of them about his edge:

- **The leverage inference (§4e) is confirmed by the resolver arithmetic**:
  2.2 ÷ 0.44 = 5.0×, and a full stop costs 2.265% of the account (his stated
  2.2% risk plus our 0.8bp round-trip + 0.5bp stop-slip charge, scaled by 5×).
- **Resolution is deliberately conservative.** His signal was 14:26 UK
  (13:26 UTC); we fill at the open of the *next* 5-minute bar, 13:30 UTC — four
  minutes late, never early. No resolution can flatter him by construction.
- The trade ran +0.544% in his favour before reversing into the stop. The
  close message was never captured for this day, so `close_time_assumed` is
  set — though it doesn't matter here, since the stop resolved the day.

**n = 1 proves nothing, and this row is not a random sample** — it exists
because a screenshot was taken to show the UI, not because of its outcome. It
is a pipeline test, not evidence. Treat the forward record as empty until
~30 days accumulate against the §5 bar.
