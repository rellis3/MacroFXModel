# Data Foundations — Lesson Notes

> **Course:** Colez Trades — Quantitative & Macro Insights
> **Block:** Data Foundations (DF) — the data layer systematic research actually
> requires. Look-ahead bias, revision blindspots, frequency misalignment,
> survivorship — the silent failure modes that make a strategy look exceptional
> in testing and bleed in practice.
> **Lessons covered so far:** DF-01 (The Institutional Data Hierarchy).
> **Next lesson:** DF-02 (Data Types & Frequency Alignment) — append below.
> **Purpose of this file:** raw study notes on the lesson material — what was
> taught, the key facts and definitions to memorise, exam-style self-test
> questions, and leads to investigate in future research. These are learning
> notes, not conclusions: nothing here has been tested or judged yet.

---

## Lesson DF-01 — The Institutional Data Hierarchy

**Lesson scope:** where financial data actually comes from. A practical map of
Tier 1 through Tier 4 — and why some highly valuable macro-economic data is
available for free, which can significantly reduce data costs for systematic
research.

### 1. First principles — data sourcing is a risk function

- At well-resourced quant desks and systematic trading operations, data
  sourcing is treated as **more than a technical task**: it is governed by
  documented processes, validation steps, and clear ownership.
- The underlying principle: **analytical output is only as reliable as its
  inputs.**
- A signal that looks exceptional may be built on data that was:
  - **unavailable at signal time** (look-ahead bias),
  - sourced from a vendor that introduced **survivorship bias**,
  - built on a series that underwent **material revision**.
- **The model cannot detect this on its own.** Systematic data governance is a
  primary way to catch these issues.

**Headline facts from the lesson (memorise):**

| Fact | Detail / caveat given in the lesson |
|---|---|
| Data quality is a leading cause of model failures | Widely cited by practitioners — but the lesson notes **no single authoritative figure exists**; it is not model design alone |
| **$500M** — Knight Capital, 2012 | Lost in **45 minutes** from a data and software deployment failure; **the firm did not survive** |
| **$24k/year per seat** — Bloomberg Terminal | The institutional data standard; Tier 1 primary access |

> **The Data Quality Principle (quote to memorise):** "A sophisticated model
> applied to corrupted, misaligned, or biased data does not produce
> sophisticated analysis. It produces sophisticated-looking noise with a false
> sense of precision."

- The lesson stresses this is **not a beginner's warning**: look-ahead bias has
  been documented in many published backtests and is a plausible contributor to
  strategies that appear strong in testing but disappoint live. **Systematic
  data governance is the primary defence** — the theme of this whole block.

### 2. Provenance — where data actually comes from

- Most practitioners consume data through Bloomberg / Refinitiv / third-party
  vendors without asking: **where did Bloomberg get this?**
- For US government macro data the provenance chain is:

```
PRIMARY SOURCE           AGGREGATOR / API        TIER-1 VENDOR             END USER
BLS / BEA / Fed    →     FRED API          →     Bloomberg / Refinitiv  →  you / your model
free, authoritative      free, 800k+ series      ~$24k / seat / year       same source for these series
```

- **What this means:** for US macro indicators published by government agencies
  — CPI, GDP, payrolls, unemployment, Treasury yields, the Fed Funds Rate —
  Bloomberg aggregates data that **originates from the same public sources
  accessible via FRED**. The underlying numbers are the same. Bloomberg's value
  here is **normalisation, delivery infrastructure, and unified access — not
  exclusive data**.
- **What it does NOT mean:** Bloomberg is not just a relay in general. For
  **tick-level equity and futures data, OTC fixed income pricing, global
  corporate fundamentals, analyst consensus estimates, and real-time exchange
  feeds**, Bloomberg provides genuine access with **no meaningful free
  equivalent**. The $24k premium covers both the infrastructure for government
  data and proprietary access to data that genuinely cannot be sourced free.
- Scope note repeated in the lesson: the "same data, free" argument applies
  **specifically to government macro statistics** — not to tick data, intraday
  prices, fixed income, or international market data.

### 3. The four tiers — the complete institutional data hierarchy

Organising principle: group sources by **reliability, latency, publication
governance, revision practices, and cost**. The tier a source occupies shapes
how it should be used, what validation is appropriate, and what analytical
decisions it can credibly support.

| Tier | Name | Cost |
|---|---|---|
| **1** | Institutional premium vendors | $15,000 – $30,000+ / year per seat |
| **2** | Primary government & central-bank sources | Free — the actual primary publishers |
| **3** | Exchange, derivatives & positioning data | $0 – $5,000 / year depending on source |
| **4** | Accessible APIs & retail aggregators | Free — freemium |

**Tier 1 in detail** — the infrastructure layer used by hedge funds, prime
brokers, asset managers, investment banks. These platforms **do not originate
macro-economic data** — they ingest it from primary sources, normalise it
across heterogeneous formats, apply systematic cleaning, and deliver it through
standardised APIs with defined service levels. **The premium pays for this
infrastructure, not data exclusivity.**

- *What Tier 1 provides:*
  - point-in-time **vintage data with full revision history**
  - **tick-level resolution** for equities, FX, and rates
  - **cross-asset coverage from a single endpoint**
  - corporate fundamentals with **standardised accounting**
  - real-time delivery with **<100ms latency guarantees**
- *What Tier 1 cannot give you (memorise as a list):*
  - a better model
  - better analytical judgment
  - protection against look-ahead bias **in your pipeline**
  - statistical validity of your backtest
  - "any of the things that actually determine whether a systematic strategy works"
- *Named Tier 1 vendors:* Bloomberg Terminal, Refinitiv Eikon / LSEG, FactSet,
  S&P Global Market Intelligence, Morningstar Direct, ICE Data Services,
  MSCI RiskMetrics, IHS Markit.

**Tier 2** — the actual primary publishers: BLS, BEA, the Fed, Treasury, ECB,
World Bank, OECD, etc. Free and authoritative.

**Tier 3** — exchange, derivatives & positioning data ($0–$5k/yr depending on
source). The lesson's featured example: the **CFTC COT report** (§5).

**Tier 4** — accessible APIs & retail aggregators (free / freemium).

**Key takeaway on the stack:** the **Tier 2 → Tier 4 path is entirely viable
for macro systematic research** — pulling CPI from FRED via `fredapi` accesses
the same underlying government-published data that commercial vendors
aggregate. The difference is tooling, normalisation, and latency — **not the
underlying numbers** for government-sourced series.

### 4. FRED deep dive — architecture & coverage

- **FRED** = Federal Reserve Bank of **St. Louis** Economic Data.
- Free, programmatic, **authenticated** API access.
- **800,000+ series** from **100+ sources**: BLS, BEA, US Treasury, ECB, World
  Bank, OECD, and more.
- Described in the lesson as one of the most useful free resources for macro
  research and **a sensible starting point before paying for commercial feeds**.

**Series IDs by category (the lesson's canonical list — learn these cold):**

| Category (approx. series count) | ID | Series |
|---|---|---|
| 📈 **Inflation & prices** (~3,200) | `CPIAUCSL` | Headline CPI, SA |
| | `CPILFESL` | Core CPI, SA |
| | `PCEPI` | PCE Price Index |
| | `PCEPILFE` | **Core PCE — the Fed's target** |
| | `T5YIE` | 5y5y inflation breakeven |
| 💹 **Interest rates** (~2,800) | `FEDFUNDS` | Effective Fed Funds Rate |
| | `DGS2` | 2Y Treasury, daily |
| | `DGS10` | 10Y Treasury, daily |
| | `T10Y2Y` | Yield-curve spread (pre-computed 2s10s) |
| | `SOFR` | Overnight rate |
| 🏭 **Growth & activity** (~5,100) | `GDPC1` | Real GDP, quarterly |
| | `INDPRO` | Industrial production |
| | `RSAFS` | Advance retail sales |
| | `UMCSENT` | Consumer sentiment (U. Michigan) |
| | `HOUST` | Housing starts |
| 👷 **Labour market** (~1,900) | `PAYEMS` | Total nonfarm payrolls |
| | `UNRATE` | Unemployment U-3 |
| | `U6RATE` | Underemployment U-6 |
| | `ICSA` | Initial claims, weekly |
| | `JTSJOL` | Job openings (JOLTS) |
| 🔬 **Financial conditions** (~2,200) | `NFCI` | Chicago Fed Financial Conditions Index |
| | `WALCL` | Fed balance sheet |
| | `BAMLH0A0HYM2` | HY credit OAS |
| | `DTWEXBGS` | USD broad index |
| | `VIXCLS` | CBOE VIX close |
| 🌍 **International** (~180,000) | `ECBDFR` | ECB deposit facility rate |
| | `IRLTLT01DEM156N` | Germany 10Y yield |
| | `DEXUSEU` | EUR/USD, daily |
| | `DCOILWTICO` | WTI crude oil |
| | `GOLDAMGBD228NLBM` | Gold PM fix |

**FRED vintages — the revision archive (the lesson's highlighted institutional
feature):**

- FRED stores the **full revision history** of most economic series — called
  **vintages** — allowing you to pull **what was known at any point in time**.
- This is the feature that **makes proper backtesting possible**: you can
  recreate exactly what your model would have seen at any historical signal
  date.
- API usage taught in the lesson:

```python
fred.get_series_vintage_dates("GDPC1")
# → all the dates on which the series was revised;
#   you can then pull the vintage that existed at any historical signal date
```

- Lesson's framing: "as close to point-in-time data as you can get **without
  paying for a dedicated vintage database**."

### 5. The COT report — free institutional positioning data

- **CFTC Commitment of Traders** report: freely available futures positioning
  data, **often overlooked in retail quantitative practice**.
- Discloses net futures positions of **three participant categories** across
  major futures markets: FX, rates, equity indices, energy, metals,
  agricultural commodities.
- Widely referenced by macro funds, CTAs, and discretionary traders as **one
  input** into positioning analysis.
- Historically, **extreme net positioning has sometimes preceded trend
  reversals** — though the lesson explicitly states this relationship is **not
  reliable enough to use in isolation**.
- Understanding the report structure is the **prerequisite** to incorporating
  it into systematic work.

**Report mechanics (memorise):**

| Field | Value |
|---|---|
| Data as-of | **Tuesday** |
| Published | **Friday 3:30pm ET** |
| Lag | **3 trading days** |
| Source | **cftc.gov** — free |
| History | **1986 – present** |

**The three participant categories:**

1. **Commercial hedgers** — "smart money" / real money. Entities with
   legitimate business exposure to the underlying: corn producers hedging
   harvest, airlines hedging jet fuel, corporates hedging FX. Their positioning
   reflects **business need, not speculation** — but **at extremes they signal
   important fundamentals**.
2. **Non-commercial speculators** — "large specs" / managed money. Hedge funds,
   CTAs, large speculative traders. **The most closely watched category** for
   momentum and sentiment signals. Extreme net long/short positioning by large
   specs has **historically been a contrarian indicator at major turning
   points**.
3. **Non-reportable** — small speculators. Positions below CFTC reporting
   thresholds: retail and small institutional. **Generally treated as a noise
   category**; extreme positioning here adds marginal signal. Can be computed
   as `total open interest − commercial − non-commercial`.

**Markets covered:**

- FX: EUR, GBP, JPY, AUD, CAD, CHF, MXN (CME FX futures)
- Rates: 2Y, 5Y, 10Y, 30Y US Treasuries (CBOT)
- Equity indices: S&P 500, NASDAQ, Dow Jones, Russell 2000 (CME)
- Energy: WTI crude, Brent, natural gas, RBOB (NYMEX)
- Metals: gold, silver, copper (COMEX)
- Ags: corn, wheat, soybeans, sugar, coffee (CBOT/ICE)

**The lesson's six-step systematic method:**

1. Compute **net non-commercial position** (longs − shorts)
2. **Normalise by open interest** for cross-market comparison
3. Apply a **rolling z-score** to identify positioning extremes
4. Use **percentile rank vs 3-year history** as the signal threshold
5. **Combine with price momentum** to avoid catching falling knives
6. **Watch commercials** for hedging extremes as a leading indicator

### 6. Key takeaways (the lesson's own closing list)

1. **Data sourcing is a risk function — not a technical task.** Every
   professional quant desk governs it with policy, audit trails, and dedicated
   resources. Output quality is **bounded above** by input quality.
2. For **government macro statistics**, Bloomberg aggregates from the same
   public sources as FRED — CPI, GDP, payrolls, Treasury yields, Fed Funds all
   originate from BLS/BEA/Fed. Bloomberg is **not the exclusive source** for
   these. For tick data, OTC fixed income, corporate fundamentals, and
   international market data, Bloomberg **does** provide access with no
   straightforward free equivalent.
3. **FRED**: 800,000+ series, programmatic API, **vintage revision history** —
   a sensible starting point before paying for commercial feeds.
4. The **Tier 2 → Tier 4 path is entirely viable** for macro systematic
   research; the difference vs commercial vendors is tooling, normalisation,
   latency — not the underlying numbers for government-sourced series.
5. **COT data**: free, public futures positioning since **1986**, referenced by
   many professional macro practitioners — **one input, not a standalone edge**.
6. **Understanding provenance is prerequisite to trust.** Before any series
   enters the pipeline, trace it to its original publisher. If you cannot
   identify the primary source, you cannot assess revision risk, reliability,
   or the appropriate use case.

### 7. Vocabulary / definitions from this lesson

| Term | Definition (as used in the lesson) |
|---|---|
| **Look-ahead bias** | Using data in a backtest that was not available at signal time |
| **Survivorship bias** | Data that excludes dead/delisted instruments, flattering historical results |
| **Revision blindspot** | Building on a series that was materially revised after first publication |
| **Provenance** | The chain from primary publisher to end user; knowing where a series actually originates |
| **Vintage** | The version of an economic series as it existed on a given historical date |
| **Point-in-time data** | Data reconstructed to show exactly what was known at each moment |
| **Primary source** | The original publisher of a series (BLS, BEA, Fed…), as opposed to an aggregator or vendor |
| **Commercial / non-commercial / non-reportable** | The three COT participant categories: hedgers, large specs, small specs |
| **Open interest** | Total outstanding futures contracts — the normaliser for cross-market COT comparison |

---

## Self-test questions (closed-book, before DF-02)

1. State the Data Quality Principle. What does a sophisticated model on bad
   data produce?
2. What happened to Knight Capital in 2012 — how much, how fast, what kind of
   failure, and what was the outcome for the firm?
3. Draw the provenance chain for US government macro data, all four hops. At
   which hop does the data stop being free, and what does that hop actually
   add for these series?
4. Name the four tiers with their cost bands and at least one example source
   in each.
5. List what Tier 1 provides — and the five things the lesson says Tier 1
   *cannot* give you.
6. For which data categories does Bloomberg have genuine exclusive-access
   value (no free equivalent)? Name at least four.
7. How many series and sources does FRED cover? Which institution runs it?
8. Series-ID quiz: core PCE (the Fed's target)? headline CPI? weekly initial
   claims? the pre-computed 2s10s spread? HY credit OAS? the Fed balance
   sheet? Germany 10Y? (`PCEPILFE`, `CPIAUCSL`, `ICSA`, `T10Y2Y`,
   `BAMLH0A0HYM2`, `WALCL`, `IRLTLT01DEM156N`)
9. What is a FRED vintage, which function returns the revision dates, and why
   does the lesson call vintages "the institutional feature that makes proper
   backtesting possible"?
10. COT mechanics: data as-of day, publication day/time, effective lag, source,
    and how far back the history goes.
11. Name the three COT participant categories. Which is watched as a contrarian
    indicator at extremes, and which reflects business need rather than
    speculation?
12. Reproduce the lesson's six-step systematic COT method in order. Why does
    step 2 come before any cross-market comparison?
13. Why is provenance "prerequisite to trust"? What three things can you not
    assess if you cannot identify the primary source?

---

## Future research leads (from the lesson — to investigate, untested)

Open leads the lesson points at. None of these have been built or validated —
they are questions to take into the harness later, not conclusions.

1. **Apply the six-step COT method to our FX pairs.** The lesson gives the full
   recipe (net non-commercial → OI-normalise → z-score → 3y percentile →
   momentum filter → watch commercials). CFTC data is free and runs from 1986.
   Test it through the standard harness (costs, IS/OOS) when we get to it.
2. **Pull FRED vintages and see the revision problem first-hand.** Take a
   heavily revised series (GDP, payrolls), compare first-print vs current
   revised values, and measure how different a simple signal looks on each.
   This is the lesson's revision-blindspot warning made concrete.
3. **Trace the provenance of every data feed this repo already uses** (OANDA,
   Finnhub, Twelve Data, news, Myfxbook): who originates each series, what is
   its revision policy, which tier is it. The lesson's takeaway #6 applied to
   our own stack.
4. **Explore FRED's international coverage** (~180k series — ECB rates, Bund
   yields, FX fixes, commodities) as a free Tier-2 layer for the macro side of
   FX work.
5. **Check the COT publication-lag handling.** Data is as-of Tuesday but only
   published Friday 15:30 ET — how a backtest must align this without
   look-ahead is exactly the subject of the next lesson (DF-02, Data Types &
   Frequency Alignment). Hold this question for that material.

## Areas of interest (to read more on)

- **ALFRED** — the archival FRED database behind the vintage functions. How far
  back do vintages go per series? Which series lack them?
- **The Knight Capital post-mortem** — the lesson uses it as the flagship data
  governance failure; the full account is worth reading as a case study.
- **The COT disaggregated report** — the lesson describes the legacy three
  category report; CFTC also publishes finer participant breakdowns. What extra
  resolution is available?
- **How Tier-1 vendors do normalisation** — "standardised accounting",
  cross-vendor symbology, entity mapping. What does that infrastructure
  actually involve, and what parts matter for a small systematic stack?
- **Which non-government data has no free equivalent** — the lesson's list
  (tick data, OTC fixed income, consensus estimates, global fundamentals) as a
  map of where budget would actually have to go.

## Implementation pointers (for when this gets used in the repo)

Neutral notes on where the lesson's material touches this codebase — for future
work, nothing built yet:

- `FRED_KEY` already exists in the Railway env table (`CLAUDE.md`) — the Tier-2
  macro layer described in this lesson is already accessible to us.
- COT data needs no key: cftc.gov publishes it free.
- The lesson's z-score / percentile steps map to existing bricks
  (`statsCore.rollingZScore`, `rollingPercentile`) — import, don't re-inline,
  per the Lego Principle.
- Any COT/FRED work would go through the house harness discipline (costs on,
  true IS/OOS split, ≥30 OOS trades) like every other idea — see the
  strategy checklist in `CLAUDE.md`.

---

*(DF-02 — Data Types & Frequency Alignment — notes go here when taken.)*
