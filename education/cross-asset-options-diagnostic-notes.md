# Cross-Asset Options Diagnostic — Study Notes

> **Source:** Colez Trades, "Cross-Asset Volatility Analysis — Cross-Asset
> Options Diagnostic", VOL·07 (Applied Theory), issue dated 21 April 2026.
> Data: CME Group QuikStrike / QuikVol, end-of-day settlements, 21 Apr 2026,
> 30-day lookbacks.
>
> **Purpose of this file:** raw lecture notes. Record what the lesson teaches —
> the framework, the definitions, the specific readings, and the author's own
> synthesis — so future-me can revise it, be examined on it, and pull research
> ideas off it. Where a probability, scenario weight, or judgement appears
> below, it is **the author's**, recorded as taught. My open questions live in
> §14 as questions, not conclusions.

---

## 0. One-paragraph summary of the lesson

Three of the most liquid listed derivatives markets — SR3 (3M SOFR options),
TN (10Y Ultra T-Note options), NQ (E-mini Nasdaq-100 options) — price the same
macro through three different lenses, and on 21 Apr 2026 they disagree. Read
through a five-lens diagnostic (open interest → CVOL → term structure → vol
cones → skew), SR3 is event-rich (step-function vol at the July and October
FOMC windows, dovish skew near its 90th percentile, fat tails at the event
contracts, fairly priced vs its own history), TN is neutral (sparse listed OI,
smooth contango, mild parallel lift — the real 10Y vol flow is OTC swaptions),
and NQ is quiet (ATM vol ~30th percentile of its 1-month distribution, smooth
term structure straight through the FOMC dates, put demand softer than
average). The author's central observation: the rates options market is paying
up for specific identifiable scenarios that the equity options market is not
pricing at all. The lesson's stated objective is situational awareness — a
method for reading what the options complex implies — not a trade
prescription.

---

## 1. The five-lens framework (the core teachable)

Options markets price **probability distributions**. Five lenses, read **in
sequence**, produce the minimum workable diagnostic. Ordering is by
*increasing inferential power* — later lenses need the earlier ones to be
interpretable.

| # | Lens | Question it answers | What it gives / what it hides |
|---|---|---|---|
| 01 | **Open Interest** | WHERE is the positioning? | Scale by strike/expiry, gamma walls. **Ambiguous on direction** (a big put block could be a bet, a hedge, a spread leg, or structured-product residue). |
| 02 | **CVOL aggregate** | HOW MUCH risk overall? | 30-day constant-maturity IV, comparable across asset classes. Blind to *where in the curve* risk sits. |
| 03 | **Term structure** | WHEN is the risk? | Where in the forward calendar risk concentrates. Steps/humps = event pricing. Week-on-week overlay turns snapshot into flow. |
| 04 | **Vol cones** | RICH or CHEAP? | Today's vol vs its own historical distribution, per tenor → percentile rank. Resolves whether hedging is expensive. |
| 05 | **Skew (RR + BF)** | WHICH WAY? | The directional signal — which tail is bid, and whether fat tails are priced. "The lens that reveals intent." |

**Framework principle (memorise):** any single lens misleads.
- OI without skew → wrong direction read.
- CVOL without term structure → conceals event concentration.
- Term structure without cones → treats elevated vol as expensive when it may
  be fair value in context.
- All five together = minimum viable diagnostic.

---

## 2. The three products & critical conventions

| Product | What it is | Key facts from the lesson |
|---|---|---|
| **SR3** | 3-Month SOFR futures options | Deepest US front-end rates market post-Eurodollar. Each contract prices a specific FOMC meeting window. **Price = 100 − rate ⇒ SR3 calls pay when rates FALL (dovish).** |
| **TN** | 10Y Ultra T-Note futures options | Tighter deliverable basket (9y5m–10y) than TY ⇒ cleaner 10Y duration exposure. Most institutional 10Y vol flow trades **OTC as swaptions**; listed TN is a hedging adjunct. |
| **NQ** | E-mini Nasdaq-100 futures options | Most concentrated growth / AI-capex exposure in listed equity. ~7 names ≈ 40% of index weight. Vol mixes single-name dispersion + macro transmission. |

Anchoring futures prices on the reference date: **SR3M6 = 96.35, TNM6 =
114.02, NQM6 = 26,835.5.**

**Unit convention (matters for every comparison):** CVOL is quoted in the
natural unit of the underlying — **basis points** for yield products, **vol
points** for price products (equities, FX, commodities, Treasuries-by-price).
⇒ Never compare 103.87 bp (2Y yield CVOL) to 18.59 vol pts (NQ) directly.
Compare each product **to its own history** — that's the comparison that
matters, and it's what the cones (§6) formalise.

Tooling: CME QuikStrike / QuikVol — Active Expirations, Constant Maturity,
Front Month, Historical Expirations, Volatility Cones modules. Free with a CME
account. The author's point: the value is the disciplined reading, not
privileged data.

---

## 3. Lens 01 — Open Interest readings (§2 of the report)

What OI is: the **stock** of live contracts per strike/expiry. Shows scale,
not intent. Big OI = where gamma sits = where market-makers hedge hardest if
price arrives there. The four-way ambiguity of a large put position (outright
bet / delta hedge / spread short-leg / structured-product overlay) is *why*
OI is lens one, not lens five.

### SR3 — "a barbell of conventional and catastrophe hedging"
- **Conventional body:** two-sided OI concentrated in the **95.25–97.00**
  strike corridor = rate expectations **3.00%–4.75%**, straddling SR3M6 96.35.
  Notable prints: SR3M6 96.25 put 38,300; **SR3U6 96.5 call 389,378**;
  SR3Z6 96.25 call 251,448.
- **Deep OTM put tail:** strikes **90.00–93.75** = rates **6.25%–10.00%**.
  SR3Z6 93.5 puts 3,407; SR3M6 93.25 puts 3,264; SR3M6 93.75 puts 2,436.
  These pay only if the Fed is forced to 6.25%+ (emergency re-hiking on an
  inflation re-acceleration). Small size, but concentrated deep-OTM puts are
  "the signature of tail-hedge demand."
- **Barbell meaning (as taught):** two buyer populations — the body trades
  normal policy Brownian motion; the 93-and-below strikes are (probably a
  small set of macro funds) paying residual premium for a hawkish
  catastrophe. The dovish tail (seen later in skew) is far bigger, but the
  hawkish tail is present, priced, paid for.

### TN — sparse; the flow is elsewhere
- OI in the hundreds-to-low-thousands per strike vs SR3's hundreds of
  thousands. Broadly spread, no dominant strike.
- Reading: a **market-structure** fact, not a market-view fact — 10Y duration
  conviction lives in OTC swaptions; listed TN is a hedging adjunct.

### NQ — concentrated upside positioning
- OI centred around NQM6 26,835.5, but **draped to the upside**: substantial
  call OI at 27,000–28,000 (matrix note says up to 28,500) vs thinner put OI
  at equivalent distances. "Long-call, lightly hedged."

**Cross-product OI read:** SR3 = barbell; NQ = upside skew; TN = sparsity
("go read swaptions"). Already at lens one the three products tell different
stories — "a feature of the ecosystem, not a problem."

---

## 4. Lens 02 — CVOL readings (§3 of the report)

### Concept primer (as taught)
- **IV is a price, not a forecast** — the vol number that reproduces the
  quoted option price; the width of the future-outcome distribution the market
  currently charges for. 20% annualised IV on a $100 underlying ≈ ±20%/yr
  1σ ≈ ±1.25%/day.
- **CVOL** = CME's constant-maturity 30-day IV index family, uniform
  methodology across products ⇒ today's CVOL comparable to last week's, and
  across products (each vs its own history).

### The headline: an inverted yield-vol curve

Treasury yield CVOL, 21 Apr 2026:

| Tenor | Symbol | CVOL (bp) | Day chg | Lesson's reading |
|---|---|---|---|---|
| 2-Year | TUVY | **103.87** | **+4.38** | Highest vol on the curve — front-loaded |
| 5-Year | FVVY | 94.68 | +2.94 | Elevated, below 2Y |
| 10-Year | TYVY | 91.79 | +3.17 | Moderate, parallel lift with front |
| 30-Year | USVY | 82.85 | +0.35 | Stable — long end unbothered |
| 3M SOFR | SRVL | 80.60 | −0.35 | Front-end composite marginally softer |

- Normal shape: yield vol slopes **up** 2Y→30Y (more time = more accumulated
  shocks). Today it is **upside-down**.
- Inversion = the market pricing **resolvable near-term uncertainty**:
  something knowable in 6–18 months (the Fed path), after which long-dated
  vol should decline. 2Y +4.38 vs 30Y +0.35 on the day ⇒ whatever is moving
  front-end vol is *not* transmitting out the curve. "A policy-path pricing
  event, not a structural term-premium event."
- Note the SRVL vs TUVY contrast: the 30-day SOFR composite *softened*
  (−0.35) while 2Y yield vol jumped — consistent with event-specific (not
  broad front-end) repricing.

### Cross-asset coherence check (memorise the logic)
If the rates move were general risk-off, confirmation should appear elsewhere.
Check:
- **FX:** falling — GBVL 7.62 −0.06, EUVL 6.66 −0.25, JPVL 8.33 −0.26,
  G5FX 6.95. Not lifting ⇒ not risk-off.
- **Gold:** GCVL 25.89 −0.93 — the classic macro-stress hedge is quiet ⇒ no
  systemic-stress pricing.
- **Energy:** CLVL 86.80 +1.25 — elevated but supply-specific (heating oil
  flagged), not risk-off transmission.
- **Conclusion as taught:** the rates vol surge is **specific and
  idiosyncratic** — a repricing of the Fed's near-term path — the kind of move
  that shows up first and biggest in front-end rates options.

---

## 5. Lens 03 — Term structure readings (§4 of the report)

### Four shapes worth recognising (concept primer)
1. **Contango** — IV rises smoothly with tenor. Default state.
2. **Backwardation** — front above back. Stress signature; acute near-term
   uncertainty expected to resolve.
3. **Step** — flat, jump at one contract, flat again. Fingerprint of an
   identifiable event inside that contract's life (FOMC, earnings).
4. **Hump** — localised bulge, lower either side. Event contained within one
   contract window.

Smooth contango = normal. Steps/humps = the market **naming and pricing a
specific event**.

### SR3 — the step function
- Jumps at **SR3N26 (July FOMC)** and **SR3V26 (October FOMC)**; serials
  SR3K26/SR3M26 (May/June, no meeting-density) lower; 2y+ back end at
  85–90 bp normal contango.
- The lifts are **structural**: present for weeks, widened over the last 5
  sessions (7-day overlay sits below today at every tenor, biggest gap at the
  July contract).
- Quantified: ~**15 bp excess vol** at the event contracts vs adjacent
  expiries ⇒ the market prices those meetings as plausibly delivering a
  **±40–50 bp rate move on the day** — consistent with surprise hike *or*
  surprise cut, not with "unchanged." "The market expects at least one of
  those two meetings to deliver news."

### TN and NQ — silence
- TN: smooth contango 5.5 (OTNM6) → 7.2 (OTNZ6); week-on-week **parallel**
  lift ~+0.1 pt; no event signature.
- NQ: smooth contango 19.8 (NQM6) → 22.3 (NQH7); ~flat on the week; **no kink
  at NQU26** — the contract containing the July FOMC. Labelled "complacent /
  ignoring rates events."

### Summary table (21 Apr 2026)

| Product | Front vol | Back vol | Shape | 7-day change | Event pricing |
|---|---|---|---|---|---|
| SR3 | 28 bp (SR3M6) | ~85 bp (2y+) | Step function | +3 to +8 bp | STRONG · FOMC |
| TN | 5.5 (OTNM6) | 7.2 (OTNZ6) | Smooth contango | +0.1 parallel | NONE |
| NQ | 19.8 (NQM6) | 22.3 (NQH7) | Smooth contango | ~flat | NONE |

The SR3-steps vs NQ-smooth contrast through the same calendar is "the
report's central observation."

---

## 6. Lens 04 — Vol cone readings (§5 of the report)

### How to read a cone (concept primer)
- Plot today's IV per tenor over that product's own rolling 30-day
  distribution: outer band = 5th–95th %ile, inner band = IQR (25–75), thin
  line = 30-day mean, today's curve overlaid.
- Below the IQR = **cheap** vs recent history; above = **rich**; inside =
  fair. The cone converts an absolute level into a **percentile rank** —
  resolving the "is 70 bp / 18 vol pts high?" question that raw levels can't.

### SR3 — fair value
- Front SR3K26 (~7 DTE) ≈ 28 bp; SR3N26 ≈ 55; SR3V26 ≈ 67; back 85–90 bp.
  Today's curve near/slightly below the 30-day mean at every tenor.
- **Key finding as taught:** front-end rates vol is elevated in absolute
  terms but **not rich vs its own recent distribution** — buyers are paying
  *fair value* for event exposure. Implication: the term-structure step is
  **durable, not a one-day panic** — it has been priced this way for weeks.

### NQ — structurally cheap
- Chart stats: mean 22.10, LQ/UQ 17.65–25.85, min/max 16.99–29.24, last
  **18.59**. Today's curve runs through the lower half of the IQR at
  virtually every tenor: ~**30th %ile** front, rising to ~45th at NQZ26 /
  240 DTE.
- Combined with §5 (no event pricing): "the equity complex sees no events, is
  paying no premium for events, and is therefore priced like an uneventful
  forward path."

### Percentile placement table

| Product | Front | Mid | Back | Overall |
|---|---|---|---|---|
| SR3 | ~50th %ile | ~45th | ~50th | FAIR VALUE |
| NQ | ~30th %ile | ~35th | ~45th | STRUCTURALLY CHEAP |

(TN cone not shown as primary; extrapolated from TYVY as "likely
mid-quartile / neutral by proxy.")

Cross-product finding as stated: a buyer of equity vol — especially a convex
structure — is buying at a statistical discount; whether the discount is
justified depends on whether rates→equity transmission has genuinely changed
(the §8 question).

---

## 7. Lens 05 — Skew readings (§6 of the report)

### Concept primer — decomposing the smile
- The smile is a **shape**, not a price. Two numbers summarise it:
  - **Risk reversal (RR) = 25Δ call IV − 25Δ put IV.** Which wing is bid?
    Positive = calls/upside bid; negative = puts/downside bid. *Direction.*
  - **Butterfly (BF) = avg(wing IVs) − ATM IV.** How fat are the tails vs
    ATM, direction-agnostic? *Convexity.*
- Read together they describe the whole smile; separately each is half a
  story.

### ⚠ THE SR3 SIGN-CONVENTION TRAP (exam-critical)
SR3 price = 100 − rate ⇒ an SR3 **call** pays when price rises = **rates
fall** = dovish; an SR3 **put** pays when rates rise = hawkish. So
**positive SR3 RR = dovish scenarios bid** — the *opposite* of the equity
intuition. Failing to invert the sign flips the entire rates read.

### SR3 RR — "the single most diagnostic chart in this report" (author)
- Shape: **inverted-U**. Slightly negative at the very front (<30 DTE);
  **+8 to +10** through the middle tenors (50–200/250 DTE — the bucket
  containing the July AND October FOMCs); through zero ~500 DTE; **−4 to −6**
  at the 2y+ back end (SR3Z27/SR3H28).
- The positive middle sits **near/above the 90th percentile** of its 30-day
  history ⇒ historically high premium paid for **dovish-tail protection at
  those specific meetings**.
- Negative back end = complementary **hawkish-persistence** view: 2y+ out,
  puts bid over calls — a priced probability that 2026's outcome is temporary
  and rates end up higher. Author's gloss: "cut now, but stay higher than the
  long-run neutral." Not inconsistent with the front — together a **barbell
  directional bet**, read as "sophisticated macro positioning, not index
  hedging noise."

### SR3 butterfly
- Elevated at the event contracts: ~4 front, **14 at SR3N26**, ~8 back;
  ~70th %ile. Fat tails priced specifically at the FOMC windows.

### NQ RR and BF
- RR: −3.5 front / −6 mid / **−6.5** back — negative as equity skew always
  is, but **materially less negative than its historical mean (~−8)**;
  ~75–90th %ile "less-negative" ⇒ **put demand has softened**.
- BF: 0.2 / 0.71 / 0.7 — at its historical mean (~50th %ile) ⇒ **no fat
  tails priced**.

### Skew synthesis table

| Metric | Front | Mid | Back | %ile | Reading |
|---|---|---|---|---|---|
| SR3 RR | −2/+5 | +8/+10 | −4/−6 | ~90th | Dovish bid, mid tenors |
| SR3 BF | ~4 | 14 @ N26 | ~8 | ~70th | Fat tails at FOMC |
| NQ RR | −3.5 | −6 | −6.5 | ~75–90th less-neg | Soft put demand |
| NQ BF | 0.2 | 0.71 | 0.7 | ~50th | No tail priced |

Author's summary: rates skew carries identifiable, directional-biased tail
mass; equity skew carries nothing in particular — same macro variables, two
different conclusions.

---

## 8. The synthesis matrix (§7) — 5 lenses × 3 products

Compressed one-liner per cell (memorise the diagonal story):

| Lens | SR3 | TN | NQ |
|---|---|---|---|
| OI | Barbell: body 95–97 + deep-OTM put wall 90–93.75 → dual-population hedging | Sparse; flow is OTC → read swaptions | Call-heavy 27,000–28,500, thin puts → long-call, lightly hedged |
| CVOL | SRVL 80.60 −0.35 but TUVY 103.87 +4.38; curve inverted on vol → event repricing | TYVY 91.79 +3.17 parallel lift, no structure → passive | No direct CVOL; equity-vol peers unchanged/softer → disconnected |
| Term structure | Steps at SR3N26 + SR3V26, ~15 bp excess → event-rich | Smooth 5.5→7.2, +0.1 parallel → flat | Smooth 19.8→22.3, no NQU26 kink → complacent |
| Cones | ~50th %ile everywhere → fair (durable, not transient) | Not primary; mid-quartile by proxy → neutral | ~30th front → cheap |
| Skew | RR +8/+10 @ 90th %ile, BF 14 @ N26, hawkish back → dovish bid + fat tails | Limited listed signal → read swaptions | RR less negative than mean, BF at mean → soft protection |

**Matrix reading (as taught):** within each product the five lenses agree
(SR3 = event-rich, directionally biased, fairly priced; TN = neutral,
OTC-dominated; NQ = complacent, uneventful, structurally cheap) — but the
three product-level pictures "do not fit naturally together in a coherent
regime." Explaining the divergence is §8's job.

---

## 9. Regime interpretation (§8) — four hypotheses (author's weights)

2×2: which market is right (horizontal) × what kind of error (vertical).
Weights are **the author's own** ("reasonable observers could arrive at
different weights, but the four hypotheses should be exhaustive").

| Scenario | Prob | Claim | Evidence for | Evidence against |
|---|---|---|---|---|
| **A** | 20% | **NQ right, SR3 overpaying** — Fed uncertainty resolves benignly; rates tail-pricing decays | NQ ATM cheap; gold CVOL low; FX vol falling | SR3 cone at mean (not panic); RR at 90th %ile |
| **B — modal** | 45% | **SR3 right, NQ asleep** — rates market (closer to the transmission mechanism) prices genuine, possibly bimodal path risk; equity vol suppressed by low realized + systematic short-vol; equity under-hedged | SR3 cone fair; durable TS step; TUVY +4.38; sophisticated RR barbell | — (implied trade noted: long NQ convexity around FOMC dates) |
| **C** | 25% | **Both right about different things** — rates price the 25-vs-50 bp July binary; either outcome is equity-benign; transmission genuinely limited | TN also quiet; no gold/FX stress confirmation | SR3 BF 14 at N26; deep-OTM put wall |
| **D** | 10% | **Transmission broken** — equity vol-selling AUM so large NQ surface reflects structural flow, not views; real option buyers migrated to rates/OTC/dispersion | Known growth in vol-selling AUM; NQ TS "too smooth" | Hard to prove directly |

**Author's modal read (B, 45%):** the weight of evidence (durable step, 90th
%ile RR, concentrated BF at named dates, TUVY lift, rates-specific — not
risk-off — cross-asset picture) favours rates pricing a real uncertainty that
equity under-weights. If B is right and NQ repricing begins, expect: NQ front
vol lifts first with a spike at the July-FOMC contract; NQ RR more negative;
NQ BF lifts. **None had begun as of the report date — "the signal is a
standing one."**

**Sizing note (as taught):** B is modal but not dominant ⇒ any expression
should stay comfortable under A (20%) and D (10%): small, convex, limited
premium at risk, calendar-aligned to the SR3 event dates.

---

## 10. Forward scenarios (§9) — the priced distribution (author's weights)

| Scenario | Prob | Trigger | Rates | Equity | Options P&L map |
|---|---|---|---|---|---|
| **Base / status quo** | 50% | Hold through July; measured 25 bp cut in Oct on softening labor; conventional messaging | 2Y ~−20 bp by year-end; 10Y range-bound; SR3 mids rally modestly; RR decays; surface normalises | NQ grinds higher on multiple expansion; realized stays low; NQ cone reading justified ex post | Long NQ vol → 0; long SR3 RR decays (pays some); NQ call OI rewarded; §8-A confirmed |
| **Dovish tail / emergency cuts** | 20% | Labor cracks Q2/Q3; inflation falls faster; 50 bp July cut + more signalled (growth scare, not recession) | SR3V26 calls print big; front vol realizes; dovish RR vindicated; TN rallies | NQ initial reaction ambiguous (bad growth vs dovish Fed); vol spikes; cheap NQ vol vindicated | Large SR3 call P&L; NQ vol longs pay; NQ straddles monetize; §8-B confirmed |
| **Hawkish tail / sticky inflation** | 15% | Core (services + shelter) reaccelerates; on-hold through year-end; higher-for-longer repricing | 2027-expiry SR3 puts print; deep-OTM put wall justified; 10Y +40–60 bp; TN price-vol realizes | NQ de-rates on discount-rate pressure; realized lifts; NQ put skew snaps wider; "complacency punished specifically" | NQ puts pay; SR3 back-end puts pay; short NQ RR pays; §8-B confirmed, opposite direction |
| **Shock / non-monetary** | 15% | Geopolitics, credit event, growth cliff, AI-capex correction, single-name blowup — "something breaks" | Flight-to-quality; SR3 + TN rally; bull-steepening; RR direction catalyst-dependent | NQ realized vol explodes from a 30th-%ile start; BF re-prices overnight; the "no tail priced" read punished cleanly | NQ long vol pays extravagantly; any convex equity structure pays; rates calls pay on safety flow; §8-B or D confirmed |

**Scenario arithmetic as taught:** Dovish (20) + Hawkish (15) + Shock (15) =
**50% combined probability that NQ vol realizes meaningfully above implied**;
Base (50%) retires the thesis at small cost. The open question a trade
structure would answer: is 30th-%ile NQ vol priced for that 50% tail, or only
for the 50% mode?

---

## 11. Falsification & monitoring (§10)

### Six failure modes of the "asymmetric conviction" read

| # | Failure mode | Mechanism | What to watch |
|---|---|---|---|
| 1 | **Vol-selling saturation** | NQ vol structurally suppressed by put-write ETFs / vol-control mandates / dealer hedging — "cheap" from supply, not benign outlook. Asymmetry persists without resolution (kills A/B/C) | Realized–implied spread; dealer gamma positioning |
| 2 | **Rates vol decay** | July + Oct FOMCs deliver expected outcomes; SR3 RR + BF decay into expiry — event was real, resolution benign | SR3N26/V26 vol post-FOMC; does the RR peak persist or fade |
| 3 | **Asymmetric resolution** | Scenario C plays: rates move big but equity-benign (e.g. bigger July cut driven by falling inflation = dovish-growth-positive) | FOMC-day front-end realized vs SR3N26 IV; NQ vol in the 3 sessions after |
| 4 | **Regime flip** | Gold vol / FX vol / credit spreads lift → "rates-specific" becomes "general risk-off"; thesis works but via a different mechanism | GCVL, EUVL, HY OAS, DXY |
| 5 | **Data mining** | Rates-equity vol divergences happen all the time in small size; %ile reads may be lookback-sensitive; pattern-matching noise | Re-run at 60d / 90d lookbacks; consistency across windows |
| 6 | **Implementation cost** | Edge exists but < frictions (NQ bid-offer, gamma-hedging cost, theta). "Idea right, P&L wrong" | Explicit carry estimates; bid-offer at entry; theta/vega at structure level |

### Monitoring dashboard — six daily indicators with triggers

| Indicator | Current | Trigger |
|---|---|---|
| SR3N26 ATM vol | ~55 bp | sustained <50 or >60 |
| SR3V26 25Δ RR | +8 bp vol | breach of ±4 bp from here |
| NQM26 ATM vol | 19.8 | 22+ validates; 18− weakens |
| NQU26 term kink | smooth | +0.5 hump appears = "NQ waking up" |
| TUVY (2Y CVOL) | 103.87 | >110 escalation; <95 decay |
| GCVL (gold CVOL) | 25.89 | >32 = regime flip to stress |

Movement beyond a threshold ⇒ update the §10 scenario weights; if meaningful,
reassess the whole thesis.

### Historical precedents cited (with the author's own caveat)
Similar rates-vol-elevated / equity-vol-cheap readings: **late 2007** (into
early 2008), **early 2020 pre-COVID**, **Q4 2018 Powell pivot**. Subsequent
equity-vol dynamics were extreme in each case. Author flags explicitly:
"three observations do not make a pattern — not predictive, worth noting."

### Closing methodological note (as taught)
The framework's value is **compression**: 15 readings → one coherent picture
with explicit weights, explicit falsifiers, explicit monitoring triggers.
A reader can reject the §8 weights or §9 scenarios while accepting the 15
underlying readings — "that is what analytical transparency looks like."
Numerical claims are visual-eyeball reads off QuikStrike charts (precision:
bp-vol for rates, vol-point for equity).

---

## 12. Key numbers & facts to memorise (exam card)

- **SR3 price = 100 − rate ⇒ SR3 call = dovish, positive SR3 RR = dovish bid.**
- Lens order + one-word questions: OI *where* → CVOL *how much* → TS *when* →
  cones *rich/cheap* → skew *which way*.
- RR = 25ΔC − 25ΔP (direction). BF = avg(wings) − ATM (convexity).
- CVOL units: **bp** for yield products, **vol pts** for price products.
- 21 Apr 2026 snapshot: TUVY 103.87 (+4.38) > FVVY 94.68 > TYVY 91.79 >
  USVY 82.85 — **inverted yield-vol curve**; SRVL 80.60 (−0.35).
- SR3 steps: SR3N26 (July FOMC) & SR3V26 (Oct FOMC), ~15 bp excess ≈ market
  pricing ±40–50 bp meeting-day move.
- SR3 RR mid +8/+10 at ~90th %ile; back end −4/−6; BF 14 at SR3N26 (~70th).
- NQ: ATM 18.59 vs mean 22.10 → ~30th %ile front; RR −3.5/−6/−6.5 vs mean
  ~−8 (less negative); BF 0.71 ≈ mean; smooth TS, no NQU26 kink.
- OI landmarks: SR3U6 96.5C 389,378; SR3Z6 96.25C 251,448; deep-OTM SR3Z6
  93.5P 3,407.
- Term-structure shapes: contango / backwardation / step / hump — and what
  each diagnoses.
- Four regime hypotheses A/B/C/D at 20/45/25/10 (author's weights); modal =
  "SR3 right, NQ asleep."
- Forward scenarios 50/20/15/15; tail aggregate 50% = the embedded
  long-NQ-convexity question.
- Precedents cited: late-2007, pre-COVID early-2020, Q4-2018 — with the
  three-observations caveat.

---

## 13. Self-test questions (write answers from memory, then check above)

1. Why is OI lens #1 and skew lens #5? What are the four things a large put
   OI block could be?
2. State the SR3 sign convention and what a positive SR3 risk reversal means.
   Why would failing to invert it wreck the whole read?
3. What does an *inverted* yield-vol curve (2Y CVOL > 30Y CVOL) say the
   market is pricing? What same-day evidence separated "policy-path event"
   from "term-premium event"?
4. Which three cross-asset checks distinguished "rates-specific repricing"
   from "general risk-off," and what did each show on 21 Apr 2026?
5. Draw the four term-structure shapes and name the diagnosis for each. Where
   were the SR3 steps and what meeting-day move did ~15 bp of excess vol
   translate to?
6. What are the four components of a vol cone, and what question does it
   resolve that raw vol levels cannot?
7. Define RR and BF. Describe the SR3 RR curve's shape across tenors and the
   author's two-part interpretation of positive-middle + negative-back.
8. Reproduce the 5×3 matrix one-liners from memory.
9. List the four regime hypotheses with the author's weights and the key
   evidence for/against each. What three NQ changes would signal Scenario B
   starting to resolve?
10. List the six failure modes and the six monitored indicators with their
    triggers.
11. Why can't TUVY 103.87 be compared to NQ 18.59 directly, and what *is* the
    valid comparison?
12. What did the author say about the 2007 / 2020 / 2018 precedents — and
    what caveat did he attach?

---

## 14. Future research ideas & areas of interest (to investigate later)

Open questions and build/verify ideas this lesson suggests — none of these is
a conclusion; each is a thing to go test or learn.

### Data & tooling
- Can we programmatically pull any of the QuikStrike/QuikVol surfaces (CVOL
  levels, term structures, OI matrices) — API, download, or scheduled
  scrape? What's free-tier accessible with a CME account vs paywalled? This
  determines whether any of the below is automatable or stays a manual
  daily read.
- Is there a public/free CVOL history feed deep enough to reconstruct the
  30-day cones ourselves and test lookback sensitivity (the author's own
  failure mode #5: 30d vs 60d vs 90d)?
- We already have an OI course + an OI forward-test harness in this repo
  (`open-interest-course-notes.md`, the range-line OI analyser). Does this
  lesson's OI lens (barbell / upside-drape / sparsity patterns) add anything
  testable to that harness?

### Concepts to study deeper
- The **inverted yield-vol curve** as a regime signal: how often does
  2Y-vol > 30Y-vol occur, how long does it persist, and what follows? Is
  there literature on yield-vol curve shape vs subsequent realized rates vol?
- **RR/BF percentile placement** as a conditioning variable: does e.g.
  "equity RR much less negative than its mean while rates RR is extreme"
  have any documented forward relationship with equity realized vol? (The
  author's precedents — 2007, 2020, 2018 — are exactly three observations;
  is there a longer systematic study?)
- **Dealer gamma / vol-selling saturation** (Scenario D and failure mode #1):
  what data would one actually need to measure structural short-vol supply
  (put-write AUM, vol-control fund flows, dealer gamma estimates), and who
  publishes it?
- The **implied-vs-realized spread** as the cheapest falsifier: for NQ,
  compare front IV vs subsequent realized around FOMC dates — is the "smooth
  through FOMC" pattern historically justified for equities even when rates
  price the meeting as an event?
- **Swaptions vs listed TN**: how do practitioners read the OTC 10Y vol
  surface, and is any of it visible to us (e.g. swaption vol indices)?

### Possible crossovers with this codebase (each needs its own scoping pass)
- A **vol-cone brick**: our own σ series (HV20 / YZ / GARCH from
  `volBacktestEngine.js`) plotted against its rolling percentile bands per
  pair/horizon — the cone *method* applied to our FX vol, independent of CME
  data. Would slot naturally next to the existing regime classifier; needs a
  design pass on window choice given failure mode #5.
- An **event-step detector**: our forecaster treats σ as horizon-scaled but
  calendar-flat; this lesson's core mechanic is vol concentrating at known
  event dates (FOMC/CPI already surface in the Morning Brief). Question to
  scope: does our daily-σ product need event-date awareness, and what would
  an honest test of that look like?
- A **cross-asset temperature check** for the Morning Brief: the lesson's
  coherence-check logic (rates vs FX vs gold vs energy vol, each vs its own
  history) is a checklist we could render if the data question above
  resolves. Value unproven — scope only after the data question.
- The **monitoring-dashboard pattern** itself (indicator, current, explicit
  numeric trigger, pre-registered response) matches this repo's
  pre-register-both-outcomes discipline and could be a template for how we
  present any standing thesis on a dashboard page.

### Questions for the author / next lessons
- How are the percentile reads computed when he says "visual-eyeball" — is
  there a QuikStrike export that gives exact percentiles?
- What structure would he actually use for "long NQ convexity around FOMC
  dates" (calendar? fly? straddle?), and how does he handle failure mode #6
  (frictions) in practice?
- How does he weight the five lenses when they conflict *within* one product
  (they happened to agree per-product here)?
