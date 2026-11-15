# How bias is formed, what we have tested, and the plan (research synthesis)

Owner, 2026-11-15: research the theories, hypotheses, Theory Lab, C.OG's education, how Max selects bias and how
institutions decide bias, then come up with a plan. The earlier daily-bias agenda skipped most of these sources; this
document is built from them.

**Sources, read in full by three readers.** Each report holds every quote with a file path or URL:
- **A. The repo's theory:** `analysis/output/bias-research/A_repo_theory.md`. Theory Lab (378 lesson files), desk and
  regime docs, HMM code, and every Evidence Book entry on direction, regime and timeframes.
- **B. The educators:** `analysis/output/bias-research/B_educators.md`. C.OG (course, snippets, cog-knowledge), Max
  Cole, Jay, Craig and the gold method, Nicholas Crown, Jess Inskip, Quant Guild, Jordan.
- **C. Institutions and literature:** `analysis/output/bias-research/C_institutions_literature.md`. Bank frameworks
  (MUFG, Deutsche dbCR, Goldman GSDEER, Citi flow models, Morgan Stanley, WGC GRAM) and the published evidence on
  momentum, carry, positioning, order flow, risk reversals, HMMs and multi-timeframe structure.
  - Only three papers were read in full; the rest are abstracts or summaries, each tagged.

**Not covered:** the repo's paper library. `shelf.mjs` needs `RESEARCH_READ_TOKEN`, which this session does not have.
There are no intake notes yet for Jay or Crown videos; they are covered from the method documents only.

## 1. How each group forms a bias

| Who | Inputs | Clock | Output | Stand aside? |
|---|---|---|---|---|
| **Banks (C §1.1)** | Three layers: a **slow anchor** (fair value, terms of trade, rate differentials); a **medium driver** (2y/OIS rate spreads, carry, trend); a **fast overlay** (CFTC/flow positioning, risk reversals, event calendar, month-end/fix flows). Size is set by volatility and event risk | Months → weeks → days | Scorecard per currency; level targets | Yes: size cut to zero on vol or event risk |
| **CTAs / systematic macro (C §1.2–1.3)** | Trend at several speeds (1, 3 and 12 months), blended and volatility-scaled; carry | Weeks to months | Signed position | Disagreement between fast and slow trends marks a turning point: cut size |
| **C.OG (B §1)** | Rates spreads, liquidity, central-bank balance sheets, positioning; the vol forecast as a layer. The course: "Fundamentals provide directional bias. Technicals provide entry timing"; "don't try to day-trade macro" | Course: weeks–months. Observed: a pre-open read | Range lines; trades about 24% of weekdays | Yes |
| **Max Cole (B §2)** | Calendar → FundaBias score → USD strength, Fed tone, real yields, COT | Once a day after Asia; carried forward | Bullish / bearish / neutral (1–10) | Yes: 30–50% of days, flat before tier-1 |
| **Jay, Craig, gold method (B §3–4)** | Daily/4h pivot, VWAP side, D1/H4 EMA 21/50 and break of structure. **"If Daily says BULL and 4H says BEAR, bias is NEUTRAL"** | Daily / 4h | Bull / bear / neutral | Yes, when the timeframes conflict |
| **Nicholas Crown (B §5)** | Who is driving (the 10Y, the Fed path), gamma pin vs accelerate | Days to weeks | Prognoses | No |
| **Quant Guild (B §7)** | An explicit Markov chain before any HMM; switch off on drawdown; market timing generally fails | — | Regime probabilities | Yes |

**Where they all agree:**
1. Direction and entry are separate jobs.
2. Direction comes from a slower clock than the entry.
3. "Neutral" is a real output.
4. Regime comes first.
5. Events reset the view.

**Where they disagree:** mainly on the **horizon**. Max makes a daily macro call. C.OG's own course, Quant Guild, the
banks, the CTAs and the literature all put the directional edge at **weeks to months**.

## 2. What the evidence says (repo results and literature together)

- **Direction at 24 hours from public data is close to a coin against each market's base rate.**
  - Repo: macro direction 0 of 82 validated. Our six 2026-11-14/15 studies were all NULL or UNDERPOWERED
    (`bias-learner-*`, `post-release-*`, `hold-day-one-confirm-*`, `exit-on-fixed-entries`, `day-type-expansion-*`).
  - Literature: daily sign predictability is unlikely (Christoffersen–Diebold). No out-of-sample next-day hit-rate study
    for G10 FX was found.
- **The documented edges are slower or narrower:**
  - Time-series momentum, 1–12 months, Sharpe > 1 diversified (Moskowitz–Ooi–Pedersen).
  - FX momentum, ~6–10% a year gross and ~4% net at 1-month holding (Menkhoff et al.).
  - Carry, ~4% a year (Lustig–Roussanov–Verdelhan).
  - The volatility risk premium as a cross-sectional predictor (Della Corte–Ramadorai–Sarno).
  - The repo's own small validated cells: `positioning-into-release-direction` and `cot-crowding-p5`.
- **The most impressive-looking numbers are same-period, not predictive:**
  - COT: 75% same-week agreement, and no next-week forecast.
  - Order flow: R² over 60% the same day.
  - Risk reversals: co-move with spot in the same period.
- **Regimes and HMMs:** robust for **volatility and size**. Weak or absent for direction (Engel 1994; Dueker–Neely; the
  repo's `gr-hmm-trend-direction` NULL). The traps:
  - **smoothed (hindsight) labels**: `regime_classifier_mtf.py` uses Viterbi on the full sample;
  - instability;
  - the RegimeV2/V4/V7 replay's ADX lookahead.

## 3. What has never been tested (the gaps this plan targets)

1. **Multi-timeframe structure as a state.** W1/D1/H4 (± H1) all agreeing, the swing structure (HH/HL or LH/LL with
   swings confirmed only once knowable), and **timeframe conflict as an abstention rule**. That rule is the gold
   method's NEUTRAL, and the published analogue is the Goulding–Harvey–Mazzoleni "turning point".
   - Theory Lab has **no lesson** on market structure or multi-timeframe analysis.
   - The bias learner only used linear slopes per timeframe.
2. **HMM state alignment across timeframes, with filtered labels.** RegimeV2/V4/V7 use it as a live gate but it was never
   honestly tested. It must beat an explicit named-state Markov chain (Quant Guild; `model-audits` Q1).
3. **Regime → which kind of rule works** (C.OG Vol Intelligence L3: ATR-percentile LOW/NORMAL/HIGH decides
   fade vs follow vs break). A conditioner, not a direction call.
4. **A slower bias clock:** a vol-scaled blend of 1-, 3- and 12-month trend per instrument, used as the daily bias with
   size cut at fast/slow disagreement. The banks' "medium layer" and the CTA default. Our tests used 4h/24h signals only.
5. **Positioning and flow inputs with strict t → t+1 timing:**
   - the volatility risk premium (implied − realised);
   - the OANDA retail order/position book (`/api/oanda-book/history`);
   - risk-reversal changes;
   - month-end rebalancing estimates.
6. **Max's "range until the news" mornings** (a range claim: the part that is forecastable), and the **dollar-smile side**
   as a USD conditioner (C.OG L5).

## 4. The plan (ranked; each runs the usual way: claim → pre-register → laptop run → bank)

| # | Question | Why first | Data | Prior |
|---|---|---|---|---|
| **P1** | **Multi-timeframe structure:** do W1/D1/H4 alignment states (EMA trend and confirmed swing structure), and HMM states aligned across timeframes with filtered labels, change the 24h–5-day direction against B0? Does **timeframe conflict as "no view"** raise the accuracy of the days you keep? Benchmarks: named-state chain, bias learner, random abstention | The owner's question; the largest gap in theory and tests; the gold method's NEUTRAL rule | M1 2016 → lockbox (laptop) | Low for direction, real for abstention |
| **P2** | **Slow bias clock:** a vol-scaled blend of 1/3/12-month trend per instrument (+ carry) as the daily bias, size cut when fast and slow disagree. Daily R vs the 4h rule and B0, and as a multi-market portfolio | The best-documented edge; the banks' and CTAs' medium layer | Daily closes 2006 → lockbox | Moderate (published), weaker on few markets |
| **P3** | **Regime decides the rule** (C.OG L3): the ATR-percentile regime, and an HMM vol state vs an explicit chain, picks fade / follow / break. Score each per regime | Regimes are where HMMs work (vol); turns structure into "which rule today" | M1 | Moderate |
| **P4** | **Positioning and flow inputs, t → t+1:** VRP, OANDA retail book, risk-reversal change, month-end flow estimate. Each alone, then added to the bias learner | New information, not public price/macro | VRP: CME IV 2020 →; OANDA book: check the depth of history; RR: laptop pull | Mixed; VRP best documented |
| **P5** | **Pre-release mornings:** does the market range until a tier-1 release (share of the day's range printed before it)? | Range is forecastable; Max's habit | M1 + calendar | Moderate |
| Forward | `bias-scoreboard` keeps scoring the desk, Max, h4-trend and the macro blend | Settles Max vs rules | Live | — |

**Not re-opened** (answered, unless a new mechanism appears): trading the surprise direction, holding because day one
was big, cleverer exits on a trend entry, a learned linear daily direction call.

## 5. What this means for the desk now

- **The bias the desk publishes should be a slow, weeks-scale view** (P2 decides its form), shown with day type and size,
  with "no view" as a normal answer. It is not a 24h trade signal.
- **The 24h job is range, size and event timing.** That part is proven.
- **The timeframe-conflict "neutral" (P1)** is the most likely place a structure rule earns its keep: by standing aside,
  not by calling direction.
