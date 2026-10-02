# Session takeaway — 2026-10-02 (the Jess Inskip clip batch)

Where everything went, what shipped, what is still open, and what I got wrong.

---

## 1. Where the pasted lessons live

**All of them are in `MD files/CLIP_WATCH.md`** (16 entries, ~1,030 lines). That file is for
educators other than Crown; Crown's own thread stays in `MD files/CROWN_WATCH.md` so
attribution does not get muddled. The five-step pass is written once, in `CROWN_WATCH.md`'s
header, and `CLIP_WATCH.md` points at it rather than copying it.

| line | clip |
|-----:|------|
|  18 | Bond volatility and the dealer-inventory spiral *(speaker still unnamed — open item)* |
|  87 | The domino effect: one shock through the whole board |
| 164 | Investor mood, the quote, and forced selling (whiteboard) |
| 235 | The VIX is not a fear gauge, it is an uncertainty index |
| 296 | The yield curve tells you what growth is expected |
| 358 | The T-chart (the four option positions) |
| 405 | What a wash sale is — **NOT APPLICABLE** to this desk |
| 434 | Who calls a recession, and what causes one |
| 504 | Four markets, four questions (the synthesis clip) |
| 564 | **The repo market map (parts 1 and 2)** |
| 663 | Greeks: Delta (parts 1–2) and the four-quadrant board |
| 752 | Greeks: long put and short put |
| 809 | "The market is an anxious man" (volatility and triggers) |
| 892 | Greeks: long call and short call (series complete) |
| 930 | What is a covered call |
| 977 | How a 10-year Treasury note works |

Each entry carries the claim stated falsifiably, what this desk already had, whether it is a
trading or a macro-understanding claim, a display nugget, and a verdict with an action.

**Standing rule, set by the owner this session and now step 4b of the pass:** clips are
**undated**, so "what is happening right now" facts get slack and are never scored as
presenter accuracy. The claim is what gets tested; the day it was filmed is not.

---

## 2. What actually shipped

| commit | what |
|---|---|
| `dcc5be6` | Banked `gex-range`; rewrote `gexRead` and `pcBias` in `js/ai.js` |
| `8b7f806` | `levelExpectation` reason strings + per-instrument evidence scoping |
| `0aba4e3` | Glossary 57 → 67 entries; two stale entries corrected |
| `926ba6d` | Catalogue header honesty + documented the drift test's real limits |
| `a1543f9` | SOFR trap gains its transmission chain; discount-window trap added |
| 11 others | one clip entry each |

### The substantive find

`gex-range` was **tested and never banked**. The result sat in `cog-replication/DECISIONS.md`
and `oi_research_book/` but never reached `js/deskEvidence.js`, which is what feeds the
prompts — so the AI prompt kept shipping the folk version. Now banked as **validated for
RANGE, on the Nasdaq only**: 793 days, +0.315 vol-matched, p 0.0008, 4/4 specifications,
6/6 years, unchanged on event days.

Three things the live prompt string had wrong, all now corrected:

1. It asserted **direction** ("mean-reversion bias", "breakout risk"). The finding has none,
   and the wall-magnet direction beside it was *falsified* at 48.8% OOS vs a 49.9% placebo.
2. The **asymmetry ran backwards**. Short-gamma days sit at DR ~1.02 — ordinary. Long-gamma
   days ~0.85. The reliable state is "long gamma is quiet", not "short gamma is wild".
3. It said this about **every instrument**. It was tested on FX and does not generalise, and
   the board is mostly FX.

`pcBias` now reports the tilt and declines the inference, because open interest never records
who opened the contract — a sold put is bullish, and covered-call overwriting lands in
*call* OI from a seller with capped upside.

---

## 3. Where I was wrong — read this before trusting the above

**(a) I said walls are "an artefact" as a flat statement. That was overstated.** The picture
is instrument-dependent and the split is the whole story. Pooled across 6 FX pairs + NAS100
the placebo is null and well-powered (~2,900 wall touches vs ~11,000 placebo, 798 clusters).
But NAS100 alone, put walls, breaks vs neighbouring strikes:

```
put  15m  -4.70pp   95% CI [-10.88, +1.04]   n_wall=619  days=148
put  60m  -5.01pp   95% CI [-13.02,  +3.66]  n_wall=599  days=148
```

Point estimates lean the predicted way; every interval contains zero at **148 days**. The
honest word is **UNDERPOWERED on the index**, not null. I collapsed one into the other.

**(b) Two ledger entries are far weaker than I treated them.** `oi-max-pain` reads in full:
*"Tested properly for the first time 2026-09-10: null."* No sample size, no interval, and its
`doc` points at a memory note rather than a study. `yields-to-fx-direction` is the same shape.
I cited both all day as settled, including when judging the live bot.

**(c) My quick self-audit was itself wrong.** A regex scan of the ledger flagged entries at
"n=5" that are actually 84 meetings and 485 trades — it was catching *horizons*, not sample
sizes. Read properly, the ledger is in good shape: most nulls carry pre-registrations,
intervals, paired controls and mirror tests. The weakness is concentrated in the **OI and
positioning family** — exactly where I spoke most confidently.

**(d) On the C+Z export I was wrong in both directions.** First I said nothing in the OI path
was touched (too broad), then conceded the export text had changed (also wrong, conceded
without checking). Verified answer: the export reads only `ex.mid`, which is **byte-identical
across 144 combinations**, and `buildOILevelText` output is **byte-identical in both `full`
and `today` modes**. Hot/cold walls come from `js/levelHeat.js` via `heatOf`, never touched.
The changed `long` string surfaces only in `/api/oi-today` and the expectations logger.

---

## 4. The OI bot, as it actually stands

**It is running `--live`** (PID 33272, child of launcher 31188 — one logical bot, no
double-firing), since 30 Sept 09:55. `pylego/magics.py:38` still describes it as
"forward-testing/paper". **That comment is wrong and should be fixed.**

Four entry modes, all built on OI levels, with the **GEX sign** choosing between fade and
break (`gex > 0 ? 'PIN' : 'BREAKOUT'`):

| mode | premise | evidence here |
|---|---|---|
| fade | enter *at* a wall, expect rejection | placebo null pooled; **underpowered on the index** |
| break | enter *past* a wall, expect continuation | same |
| maxpain | fade toward the pin | `oi-max-pain` null — **weakest entry in the ledger** |
| react | enter at OI nodes as S/R | same family as walls |

A system can survive a dead rationale — these tests falsified the standalone claims, not this
zone system with its stops, TPs and gates. But there is no *evidenced* reason to expect it to
win, and it is live. Its record would settle it; `/api/kv/oi_bot_status` and
`/api/bot-trades` both 404, so the right endpoint still needs finding.

---

## 5. Open items

### Studies — data already on disk

1. **Wall + max-pain re-run on the full archive.** `OI Data/NAS100_USD.csv` holds **1,521
   dated days** (2020-09 → 2026-09); the placebo used **148**. That is a tenfold power
   increase, both harnesses exist, and it covers the two weakest claims in section 3. *This
   is the one I would do first.*
2. **`discount-window-stress`.** `WLCFLPCL`, 1,242 weeks back to 2002, spanning SVB
   ($152.9bn) and 2008 ($110.7bn) — the crisis coverage the SRF sample lacked and which
   `funding-stress` named as its own open question. **Must be level-based: 94.7% of weeks are
   non-zero, so a usage flag is as empty as the SRF's 31%.**
3. **QE → yields**, mirrored against QT, episode-level (`WALCL` + `DGS10`, both catalogued).
4. **The growth/labour chain** — `PAYEMS`, `UNRATE`, `INDPRO`, `GDPC1` plus a 470-line
   scoring engine, and zero entries in the ledger.

### Data and infrastructure

5. **Catalogue widening.** 28 engines in `js/` reference FRED; the drift guard scans **9**,
   behind two allowlists (a file list and a regex of already-known id families), so it can
   only rediscover what it knows — and passes while doing so. Header now says this; the fix
   is unstarted.
6. **Three absent feeds:** `MORTGAGE30US` (free, weekly, back to 1971 — "the 10y is tied to
   your mortgage" is untestable without it), `TREAST`, `FDHBFIN`.
7. **Prediction markets** — Kalshi and Polymarket both returned 200 keyless, but macro
   contracts were absent from Kalshi's first 200 open markets and Polymarket's top 60 by
   volume. Needs a **liquidity floor** before any price is quoted.

### Fixes found along the way

8. `pylego/magics.py` — one line, the paper/live comment.
9. Find the OI bot's record endpoint.
10. Add a sample size and a power note to `oi-max-pain` and `yields-to-fx-direction` so
    neither can be quoted as confidently as I quoted them.
11. Name the speaker on the bond-volatility clip (line 18).
12. Free presentation idea from the synthesis clip: label *which question* each market on the
    board answers (equities = mood, treasuries = demand, options = uncertainty).

---

## 6. The education proposal, and why

**Why build these at all:** the board prints option and plumbing vocabulary with no
definitions behind it, and the clips supply teaching material far better than anything
written from scratch. The glossary work (section 2) gives these lessons something to link
into. **All 304 existing lessons use inline `<svg>`; zero use `<img>`, Mermaid or canvas** —
so the whiteboard style maps straight onto the house pattern, and redrawn as SVG it themes
for dark mode, scales on a phone, stays searchable, and can be edited when a verdict changes.

**What makes these better than her videos:** hers are generic and must be. These can print
the desk's own verdict glyph on each claim — a 2×2 with "GEX: range-only, Nasdaq-only" on it
is a lesson a video cannot be.

### Options sequence (~6 lessons)
1. The 2×2 reference card — long/short × call/put, with direction, time-decay and IV signs
2. Delta and moneyness — *including that delta is N(d₁), not the ITM probability N(d₂)*
3. Premium — intrinsic vs extrinsic
4. **Payoff shape vs Greek signs** — the gap in her own board: short put is bounded, short
   call is unlimited, same row, same three signs, and no Greek tells you which you hold
5. **Covered call ≡ short put** — identical payoff, taught in two separate videos, never
   connected
6. What GEX and DEX actually are, and what is unproven about them

### Plumbing sequence (~4 lessons)
1. How a Treasury works; price/yield inverse; **current yield vs YTM** (her worked example is
   current yield, `DGS10` is constant-maturity YTM — reconstructing it her way will not match)
2. The repo market — banks, primary dealers, money market funds, SOFR
3. The corridor — IORB floor, SRF ceiling, discount-window stigma
4. QE — ending on the two banked nulls: SOFR is the calendar at both ends of the month, and a
   drawn SRF is followed by *calmer* tape

### Market-reading sequence (~4 lessons)
The domino chain · investor mood and forced selling · VIX as uncertainty not fear · the yield
curve — each ending on what this desk found when it tested the claim.

---

## 7. The two best things the clips produced

**Her repo clip explains a result this desk had only labelled.** `funding-stress` found that
with month-end excluded, 12 of 15 SOFR episodes land on the 14th–18th, and recorded it as
"mid-month tax and settlement" with no transmission behind it. She supplies the chain:
withdrawals from money market funds → funds raise cash in repo → the bid lifts SOFR. Now in
the `SOFR` trap so it can be reasoned about rather than memorised.

**And her framing beat the desk's own written prior.** `funding-stress` S2 pre-registered that
a drawn SRF precedes *wider* ranges. It came back −0.561 ATR: markets are **calmer**, and the
facility is drawn on 31% of sessions. Her "this is arbitrage, not collapse" predicted that;
ours did not. Worth remembering next time a plumbing claim gets a prior assigned by instinct.
