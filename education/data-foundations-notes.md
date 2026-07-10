# Data Foundations — Study Notes

> **Course:** Colez Trades — Quantitative & Macro Insights
> **Block:** Data Foundations (DF) — the data layer systematic research actually
> requires: look-ahead bias, revision blindspots, frequency misalignment,
> survivorship — the silent failure modes that make a strategy look exceptional
> in testing and bleed in practice.
> **Lessons covered so far:** DF-01 (The Institutional Data Hierarchy).
> Next lesson: DF-02 (Data Types & Frequency Alignment) — leave room to append.
> **Purpose of this file:** my own learning notes — summaries, key points to
> memorise, exam-style self-test questions, research ideas, and how each concept
> maps onto this repo (MacroFXModel) for real-time implementation.
> **Note-taking discipline:** every claim from the lesson is tagged where possible
> as **[replicated]** (documented in academic/practitioner literature),
> **[plausible mechanism]** (sound logic, needs my own validation), or
> **[folklore/anecdote]** (one example or practitioner heuristic — treat as
> hypothesis only). A lesson slide is not evidence — same rule as `CLAUDE.md`.

---

## Lesson DF-01 — The Institutional Data Hierarchy

### 1.1 The core thesis: data sourcing is a risk function

The lesson's first-principles claim: at well-resourced quant desks, data sourcing
is **governed like a risk function** — documented processes, validation steps,
clear ownership — not treated as a technical chore.

**Why:** analytical output is bounded above by input quality. A model **cannot
detect** on its own that its input data was:

- unavailable at signal time (**look-ahead bias**),
- sourced from a vendor that dropped dead instruments (**survivorship bias**),
- materially revised after first publication (**revision blindspot**).

The only defence is *systematic governance of the data layer itself* — the model
sees numbers, not their provenance.

> **The Data Quality Principle (memorise verbatim):** a sophisticated model
> applied to corrupted, misaligned, or biased data does not produce sophisticated
> analysis. It produces **sophisticated-looking noise with a false sense of
> precision.**

**Evidence tags for the headline numbers:**

| Claim | Tag | My note |
|---|---|---|
| Data quality issues are a leading cause of model failures | **[plausible mechanism / practitioner consensus]** | The lesson itself admits "no single authoritative figure exists". Treat as strong practitioner folklore, not a measured statistic. |
| Knight Capital lost $500M in 45 min (2012), firm did not survive | **[replicated — documented event]** | Actual loss ~$440–460M. Strictly a *software deployment* failure (stale test code reactivated by a partial deploy), which the lesson honestly frames as "data **and** software deployment". The lesson uses it as a governance parable: unvalidated inputs/config reaching production. The mechanism generalises to data pipelines even though the incident wasn't a bad-data-series bug. |
| Bloomberg ≈ $24k/seat/year | **[replicated — public knowledge]** | Order of magnitude right; exact price varies by contract. |
| Look-ahead bias documented in many published backtests | **[replicated]** | Consistent with the backtest-overfitting literature (Bailey/López de Prado et al.) and with this repo's own history (`TRADABILITY_REVIEW.md`). |

### 1.2 Provenance: where data actually comes from

The single most useful mental picture of the lesson — the provenance chain for
**US government macro data** (CPI, GDP, payrolls, rates):

```
PRIMARY SOURCE          AGGREGATOR/API        TIER-1 VENDOR           END USER
BLS / BEA / Fed   →     FRED API        →     Bloomberg/Refinitiv  →  you / model
free, authoritative     free, 800k+ series    ~$24k/seat/year         same numbers
```

**Key insight:** for government macro statistics, Bloomberg does not *originate*
anything — it ingests the same public releases FRED does. The $24k buys
**normalisation, delivery infrastructure, SLAs, and unified cross-asset access**,
not exclusive macro numbers. **[replicated — this is verifiable: pull CPIAUCSL
from FRED and compare to the terminal.]**

**The honest counterweight (the lesson states it, keep it):** this does **not**
generalise beyond government macro. Tick-level equity/futures data, OTC fixed
income pricing, global corporate fundamentals, analyst consensus, real-time
exchange feeds — there Bloomberg provides genuine access with **no meaningful
free equivalent**. Don't flatten "Bloomberg is a relay for CPI" into "Bloomberg
is a relay" — that's the same over-extrapolation error the house rules warn
about in strategy claims.

**The governing rule (exam-worthy):** *provenance is prerequisite to trust.*
Before any series enters the pipeline, trace it to its original publisher. If
you can't identify the primary source, you can't assess revision risk,
reliability, or appropriate use.

### 1.3 The four tiers — MEMORISE the table

| Tier | What it is | Cost | Examples | What it's actually for |
|---|---|---|---|---|
| **1** | Institutional premium vendors | $15k–$30k+/seat/yr | Bloomberg, Refinitiv/LSEG, FactSet, S&P Global, Morningstar Direct, ICE, MSCI RiskMetrics, IHS Markit | Point-in-time vintages, tick resolution, cross-asset from one endpoint, standardised fundamentals, <100ms delivery SLAs |
| **2** | Primary government & central-bank sources | **Free** | BLS, BEA, Fed/FRED, Treasury, ECB, cftc.gov | The *actual publishers*. Authoritative macro. |
| **3** | Exchange, derivatives & positioning data | $0–$5k/yr | CFTC COT (free), exchange data shops | Positioning/OI/derivatives structure |
| **4** | Accessible APIs & retail aggregators | Free–freemium | (our stack: OANDA, Finnhub, Twelve Data, FRED wrappers) | Convenience access; validate against Tier 2 where possible |

**What Tier 1 cannot give you (memorise — it's the punchline):** a better model,
better judgment, protection against look-ahead bias *in your own pipeline*,
statistical validity of your backtest — i.e. **none of the things that determine
whether a strategy works.** Paying for data is not a substitute for governance.

**Corollary for us:** the **Tier 2 → Tier 4 path is fully viable for macro
systematic research.** `fredapi` CPI *is* the BLS CPI. The gap vs Tier 1 is
tooling, normalisation and latency — not the numbers — for government-sourced
series.

### 1.4 FRED deep dive — the series IDs worth knowing cold

FRED (St. Louis Fed): free, authenticated API, **800,000+ series from 100+
sources** (BLS, BEA, Treasury, ECB, World Bank, OECD). The lesson's canonical
ID list — these are the exam answers and the building blocks for any macro
score:

| Category | Series IDs |
|---|---|
| **Inflation & prices** (~3.2k series) | `CPIAUCSL` (headline CPI SA), `CPILFESL` (core CPI), `PCEPI`, `PCEPILFE` (**core PCE — the Fed's target**), `T5YIE` (5y breakeven) |
| **Interest rates** (~2.8k) | `FEDFUNDS` (effective FFR), `DGS2`, `DGS10` (daily CMT yields), `T10Y2Y` (curve spread, pre-computed), `SOFR` |
| **Growth & activity** (~5.1k) | `GDPC1` (real GDP, quarterly), `INDPRO`, `RSAFS` (advance retail sales), `UMCSENT`, `HOUST` |
| **Labour** (~1.9k) | `PAYEMS` (nonfarm payrolls), `UNRATE` (U-3), `U6RATE`, `ICSA` (weekly initial claims), `JTSJOL` (JOLTS openings) |
| **Financial conditions** (~2.2k) | `NFCI` (Chicago Fed FCI), `WALCL` (Fed balance sheet), `BAMLH0A0HYM2` (HY OAS), `DTWEXBGS` (broad USD index), `VIXCLS` |
| **International** (~180k) | `ECBDFR` (ECB deposit rate), `IRLTLT01DEM156N` (Germany 10Y), `DEXUSEU` (EUR/USD), `DCOILWTICO` (WTI), `GOLDAMGBD228NLBM` (gold PM fix) |

**Mnemonic:** the six buckets mirror the macro-driver families from the Macro
Deep Dives notes (growth, inflation, policy/rates, financial conditions,
international/flows) — one FRED bucket per driver family. Labour is the
high-frequency face of growth.

### 1.5 FRED vintages — THE institutional feature (single most important
technical point of the lesson)

FRED stores the **full revision history** of most series — *vintages* — so you
can pull **what was known at any point in time**, not just today's revised
values.

```python
from fredapi import Fred
fred = Fred(api_key=FRED_KEY)

# All dates on which the series was revised:
vintage_dates = fred.get_series_vintage_dates("GDPC1")

# The series as it existed on a given historical date (ALFRED under the hood):
as_of = fred.get_series_as_of_date("GDPC1", "2020-03-01")
```

**Why this matters — the revision blindspot in one example:** first-print GDP
can differ from the final revised figure by whole percentage points. A backtest
that keys a regime score off *today's* revised GDP series is using information
the market did not have at signal time. That is **look-ahead bias through the
back door** — the timestamps look right, the *values* are from the future.
**[replicated — GDP/payroll revision magnitudes are well documented.]**

**Rule to internalise:** *point-in-time* is a property of **values**, not just
of timestamps. Lagging a series is necessary but **not sufficient**; heavily
revised series (GDP, payrolls) need vintage data for honest signal research.
Rate/market series (DGS10, VIX, FX fixes) are effectively revision-free —
market prices don't get restated — so this concern is series-specific.

### 1.6 The COT report — free institutional positioning data

CFTC Commitment of Traders. **Facts to memorise:**

| Field | Value |
|---|---|
| Data as-of | **Tuesday** (close) |
| Published | **Friday 3:30pm ET** |
| Effective lag | **3 trading days** |
| Source | cftc.gov — free |
| History | **1986–present** |
| FX coverage | EUR, GBP, JPY, AUD, CAD, CHF, MXN (CME futures) — plus rates, indices, energy, metals, ags |

**Three participant categories:**

1. **Commercial hedgers** ("real money") — business exposure, not speculation
   (producers, airlines, corporates hedging FX). At *extremes*, their positioning
   signals fundamentals.
2. **Non-commercial** ("large specs") — hedge funds/CTAs. The most-watched
   category; extreme net positioning **has historically sometimes** preceded
   reversals. **[folklore → weak-replicated]** — the academic evidence on COT as
   a standalone signal is mixed at best; the lesson itself says "not reliable
   enough to use in isolation". Do not upgrade this to edge.
3. **Non-reportable** (small specs) — below reporting thresholds; treated as
   noise. Computable as `OI − commercial − non-commercial`.

**The systematic recipe from the lesson (verbatim, as a spec not a promise):**

1. Net non-commercial position = longs − shorts
2. **Normalise by open interest** (cross-market comparability)
3. Rolling **z-score** to flag positioning extremes
4. **Percentile rank vs 3-year history** as signal threshold
5. Combine with **price momentum** (avoid catching falling knives)
6. Watch **commercials** at hedging extremes as a leading indicator

**Backtest alignment trap (exam-worthy):** the Tuesday-as-of / Friday-publish
structure means a COT signal is usable **no earlier than Friday 15:30 ET** —
realistically the next session. A backtest keying COT to its *as-of* Tuesday is
3 days of look-ahead. This is exactly the "frequency misalignment" failure mode
this block is named for.

### 1.7 Key takeaways (the lesson's own list, condensed)

1. Data sourcing is a **risk function** — output quality is bounded by input
   quality; the model can't police its own inputs.
2. For **government macro**, Bloomberg and FRED serve the **same underlying
   numbers**; the premium buys infrastructure, not exclusivity. For tick/OTC/
   fundamentals data the premium buys genuine access.
3. **FRED**: 800k+ series, free API, **vintages** = poor-man's point-in-time
   database. Start here before paying anyone.
4. **Tier 2 → Tier 4 is a complete stack for macro research.**
5. **COT** = free positioning data since 1986; one input, never a standalone
   edge.
6. **Provenance before trust** — no source identified ⇒ no assessment of
   revision risk ⇒ series doesn't enter the pipeline.

---

## Honest priors before building anything (per the CLAUDE.md contract)

- This lesson is **infrastructure, not edge**. Nothing in DF-01 is a trading
  signal; it's the discipline that stops fake edges from surviving testing.
  Odds that better data hygiene *creates* a tradeable edge: ~0%. Odds that it
  *prevents a false positive* that would otherwise cost real money: high — this
  is the cheap side of the falsification harness.
- **COT-based FX signals:** blunt prior that a simple positioning-extreme fade
  becomes a tradeable after-cost edge on our pairs: **~10–15%**. It is one of
  the more commonly cited macro inputs, which cuts both ways — well-known ⇒
  likely arbitraged. The default expected outcome of a COT z-score test here is
  **null**. Worth doing cheaply because the data is free, the history is long
  (1986–), and the falsification cost is a day, not a week.
- **Revision-aware regime scores:** not an edge claim at all — it's a validity
  claim. If our (future) macro regime work uses revised series without
  vintages, any backtest result is *unreliable in an unknown direction*.
  Fixing that changes confidence, not expectancy.

---

## Future research ideas (ranked queue)

1. **COT z-score vs our FX pairs — a cheap falsification test.** Pull CFTC
   non-commercial net positioning for EUR/GBP/JPY/AUD/CAD/CHF (Tier 3, free),
   normalise by OI, 3y rolling percentile, test extreme-positioning fade AND
   follow against next-1w/1m returns on our OANDA pairs, honest lag (signal
   available Friday close), costs on, IS/OOS split per the harness. Uses
   `statsCore.rollingZScore` — never re-inline. **Pre-registered outcomes:**
   "worked" = OOS Sharpe beats no-signal baseline with ≥30 OOS trades on the
   pooled panel; "didn't" = anything else, including single-pair-only wins
   (that's the multiple-testing trap).
2. **Vintage-vs-revised sensitivity study.** For one revision-heavy series
   (`PAYEMS`), build the same simple momentum signal twice — once on today's
   revised series, once on ALFRED vintages — and measure how much the signal
   *changes*. Quantifies our revision blindspot before we build any macro
   regime engine. Pure infrastructure; no edge claim.
3. **A FRED brick for the repo** (see implementation notes below) — a
   `fredCore.js` Tier-1-style primitive with an explicit `asOf` parameter, so
   any future macro feature is vintage-aware by construction.
4. **Map our Tier-4 sources to their Tier-2 primaries.** One-page provenance
   audit of every feed in `CLAUDE.md`'s env table (OANDA, Finnhub, Twelve,
   NEWS_KEY, Myfxbook): who originates it, what's the revision policy, what's
   the survivorship story. Cheap, and it's the lesson's rule #6 applied to us.
5. **(Deferred until DF-02)** Frequency-alignment audit of any mixed-frequency
   feature (daily FX vs weekly COT vs monthly CPI) — next lesson is literally
   this; don't build ahead of the material.

## Areas of interest (things that hooked me, to read more on)

- **ALFRED** (ArchivaL FRED) — the vintage database behind
  `get_series_vintage_dates`. How far back do vintages go per series? Where are
  the gaps?
- **The backtest-overfitting literature** — Bailey & López de Prado on
  look-ahead/selection bias; connects DF-01 to the house OOS discipline.
- **Knight Capital post-mortem** (SEC order, 2013) — as a governance case
  study: it was a *deployment/config* failure, which makes the "your pipeline
  is part of your risk surface" point better than a pure data-error story.
- **COT disaggregated report** (2009+) splits "non-commercial" into managed
  money vs swap dealers vs other — finer categories than the legacy report the
  lesson describes. Worth using the disaggregated version if idea #1 runs.
- **Survivorship in FX** — mostly an equities problem (dead tickers), but FX
  has its own versions: discontinued pairs, redenominations (EUR legacy pairs),
  broker feed changes. What does it mean for our 26-pair OANDA universe?

## Real-time implementation notes (mapping to this repo)

- **We already hold the keys.** `FRED_KEY` is in the Railway env table
  (`CLAUDE.md`) — the Tier-2 macro layer is one import away. COT needs no key
  at all (cftc.gov CSVs).
- **Our price data is Tier 4 with Tier-2-like properties.** OANDA mids are
  revision-free market prices — no vintage problem — but they're *one broker's
  mid*: no volume, and spread/cost realism has to be injected (which the
  harness already does). Provenance note: OANDA is the originator of its own
  feed, not an aggregator.
- **The repo's no-lookahead rule (`CLAUDE.md` checklist #3) covers timestamps,
  not values.** "σ/regime/score for window `i` use data `< i` only" is exactly
  right for price-derived series and is already enforced by the series helpers.
  DF-01's addition: the moment a *macro* series (CPI, payrolls, GDP) enters any
  engine, `data < i` must mean **the vintage available at `i`**, not today's
  revised history. Price bricks are safe; a future macro brick must carry an
  `asOf` contract from day one.
- **Brick design sketch (if research idea #3 is approved):** a Tier-1 primitive
  `fredCore` — `fetchSeries(id, {asOf}) → {t[], v[]}` + a thin cache — pure,
  contract-documented, unit-testable with a canned fixture, registered in
  `LEGO_MODULES.md` per Lego Principle 6. Consumer #1 would be a COT/macro
  engine; **don't extract it before a second consumer or an approved first one
  exists** (the "not a brick yet" rule). Until then it stays in this file as a
  candidate.
- **COT lag discipline, concretely:** as-of Tuesday, usable Friday 15:30 ET ⇒
  in a daily-bar backtest the earliest honest bar is the **following Monday**.
  Encode the publication calendar, not the as-of date.
- **KV reminder (house bug #1):** if any future COT/FRED feature caches
  user-entered config (e.g. an API key typed into a dashboard), the key must go
  into `_CF_EXACT` in `kv.js` or it dies on the next deploy. Fetched series
  caches are ephemeral by design — leave them out of CF KV to protect the write
  quota.

## Self-test questions (closed-book, before DF-02)

1. State the Data Quality Principle in one sentence. What does a good model on
   bad data produce?
2. Draw the provenance chain for US CPI from originator to your model. At which
   hop does the data stop being free? What does the paid hop actually add?
3. Name the four tiers, their cost bands, and one example source per tier.
4. Give five things Tier 1 vendors **cannot** provide, per the lesson.
5. Where does Bloomberg have genuine data exclusivity, and where is it a
   normalisation layer? (Name ≥3 categories on each side.)
6. Series-ID quiz: core PCE? weekly claims? HY credit spread? the pre-computed
   2s10s? Germany 10Y? Fed balance sheet? (`PCEPILFE`, `ICSA`,
   `BAMLH0A0HYM2`, `T10Y2Y`, `IRLTLT01DEM156N`, `WALCL`)
7. What is a FRED **vintage**, which function lists the revision dates, and why
   does using a revised series in a backtest constitute look-ahead even when
   every timestamp is correctly lagged?
8. Which macro series need vintages and which don't? Give the rule and two
   examples of each.
9. COT: name the three participant categories, who is watched for contrarian
   extremes, and the as-of/publish/lag structure. What's the earliest honest
   daily bar for a COT signal?
10. The lesson's six-step systematic COT recipe — reproduce it in order. Why
    is step 2 (normalise by OI) required before any cross-market comparison?
11. Why is "provenance before trust" a *prerequisite* rather than a
    nice-to-have? What three risks can't you assess without the primary source?
12. (House rules) Is anything in DF-01 an edge claim? What is the honest prior
    on a COT positioning-extreme signal for FX, and what's the pre-registered
    null?
