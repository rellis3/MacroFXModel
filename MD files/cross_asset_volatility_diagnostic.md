# Cross-Asset Volatility Diagnostic
**Reference Guide for Future Models — Principles, Framework & Interpretation**

> Source lesson: *Colez Trades — VOL 07 · Applied Theory · 21 April 2026*  
> Purpose: Equip future models with the conceptual and analytical tools to read cross-asset options markets as a coherent macro diagnostic system.

---

## Core Principle

Options markets price **probability distributions**, not point forecasts. When you read multiple options markets simultaneously, disagreements between them are not noise — they are signal. Three markets pricing the same underlying macro reality through three different lenses will reveal where the market has conviction, where it is complacent, and which participants are closest to the transmission mechanism.

**The fundamental rule: divergence between markets is analytical signal, not a problem to explain away.**

---

## The Five-Lens Framework

Every options market diagnostic should be read through five lenses in sequence. No single lens is self-sufficient, and the order matters — later lenses require the earlier ones to interpret.

### Lens 1 — Open Interest (WHERE the value lies)

Open Interest is the total stock of live, unsettled contracts at each strike and expiry. It tells you **scale**, not intent.

**What it reveals:**
- Which strikes carry the most gamma (where market-makers must hedge hardest if price arrives there)
- The overall shape of positioning — whether the market is barbelled, call-heavy, put-heavy, or balanced
- Presence of deep out-of-the-money tail hedges

**Critical limitation:** OI is directionally ambiguous. A large put position at a strike can be:
- An outright bearish bet
- A delta hedge against a long underlying position
- The short leg of a spread
- Residue from a structured product

**Interpretive rule:** OI sets the stage. Direction comes from lenses 4 and 5. Never draw directional conclusions from OI alone.

**Patterns to recognise:**
- **Barbell:** Large OI at both ends of the strike distribution — conventional body plus deep OTM hedges. Signals two distinct populations of buyers with two different scenarios.
- **Call-heavy:** OI concentrated in calls above the market — upside positioning, lightly hedged.
- **Sparse:** Very low OI counts compared to related markets. Usually means that product is not the primary venue for that exposure (e.g., institutional 10Y duration flow trades OTC as swaptions, not via listed futures options).

---

### Lens 2 — CVOL Aggregate (HOW MUCH risk is priced)

CVOL (CME's Cross-Asset Volatility index family) produces a **30-day constant-maturity implied volatility** number for every listed product using a uniform methodology.

**What it reveals:**
- The overall risk temperature of a product
- Whether vol is rising or falling in aggregate
- Cross-asset comparisons — which markets are heating up, which are cooling

**Key convention:** CVOL units vary by product type:
- **Yield products** (Treasuries by yield): expressed in **basis points**
- **Price products** (equities, FX, commodities, Treasuries by price): expressed in **vol points**

You cannot naively compare a 103 bp CVOL reading on 2Y yields to an 18 vol-point reading on equities. You compare each product against its **own history**.

**Diagnostic power — cross-asset coherence check:**

If a CVOL move in one market reflects a genuine macro regime shift, you expect confirming moves elsewhere:

| Market | Risk-off signature | Rates-specific signature |
|--------|-------------------|-------------------------|
| FX vol | Rising | Falling or flat |
| Gold vol | Rising | Falling or flat |
| Equity vol | Rising | Disconnected / flat |
| Front-end rates vol | Rising | Rising sharply |
| Long-end rates vol | Rising | Flat or modest |

A rates vol move that is **not confirmed by FX, gold, or equity vol** is a **policy-path pricing event**, not a systemic risk-off. This distinction is critical for interpreting what the options market is pricing.

**Inverted yield-vol curve:**
- Normally, Treasury yield vol slopes upward from 2Y to 30Y (more time = more uncertainty)
- Inversion (2Y vol > 30Y vol) signals the market is pricing **resolvable near-term uncertainty** — a specific identifiable event (Fed path) that will become known within 6–18 months
- 2Y yield vol lifting hard while 30Y yield vol is flat = policy repricing, not structural term-premium shift

---

### Lens 3 — Term Structure (WHEN the risk concentrates)

The term structure plots implied vol against time-to-expiry at a fixed moneyness (usually ATM). It answers: as we look further into the future, is the market pricing more uncertainty, less, or the same?

**Four shapes and what they mean:**

| Shape | Description | Interpretation |
|-------|-------------|---------------|
| **Contango** | Vol rises smoothly with tenor | Default state — more time, more accumulated shocks |
| **Backwardation** | Front vol above back vol | Stress signature — acute near-term uncertainty expected to resolve |
| **Step** | Flat, then sharp jump at one contract, then flat | Identifiable event falls inside that contract's life (FOMC, earnings) |
| **Hump** | Localised bulge, lower on either side | Contained event — same logic as step but event is within one window |

**Smooth contango is normal. Steps and humps are diagnostic.**

When the SR3 (front-end rates) curve has sharp steps at specific FOMC meeting contracts, the market is **naming those meetings as binary events** and pricing them as such. When the NQ (equity) curve is smoothly contangoed through the same calendar dates, the equity market is treating those meetings as non-events.

**Week-on-week overlay:**
Compare today's curve to the curve from 5–7 sessions ago. This converts a snapshot into flow:
- Did the step appear recently (new event pricing)?
- Did it widen (growing conviction)?
- Did it fade (event resolved or discounted)?

**Rule of thumb — step interpretation:**
An excess of ~15 bp vol at an FOMC-specific SR3 contract relative to adjacent contracts is consistent with the market pricing a ±40–50 bp rate move on that meeting day. That is not an "unchanged" scenario.

---

### Lens 4 — Volatility Cones (RICH or CHEAP)

A vol cone places today's implied vol at every tenor onto its own **30-day historical distribution**. The bands show where vol has been; the overlay shows where it is today.

**Four components:**
- **Outer band:** 5th–95th percentile of IV over rolling window
- **Inner band (IQR):** 25th–75th percentile
- **Mean line:** Rolling 30-day mean
- **Today's curve:** Overlaid on top

**Why this matters:**
A raw vol number is meaningless without context. 70 bp of SR3 vol or 18 vol points of NQ vol can be either cheap or expensive depending on recent history. The cone converts absolute levels into **percentile ranks**, which answer: is it worth owning or selling?

| Percentile placement | Interpretation |
|---------------------|---------------|
| Below 25th (below IQR) | Vol is statistically cheap — buyers have a statistical edge |
| 25th–75th (inside IQR) | Fair value — no directional edge from richness/cheapness |
| Above 75th (above IQR) | Vol is statistically rich — sellers have a statistical edge |

**Critical insight — distinguishing panic from structure:**
If front-end rates vol is at the 50th percentile of its recent distribution (as SR3 was in April 2026), the elevated absolute level is **not a panic spike** — it is a durable, structured view that has been building for weeks. The event pricing in the term structure is real, not transient.

If equity vol is at the 30th percentile, the market is selling protection at a statistical discount. Combined with term structure complacency (no event steps), this is the definition of structural under-hedging.

---

### Lens 5 — Skew Decomposition (WHICH WAY the tail is bid)

The vol smile is not a price — it is a shape. Skew decomposition converts that shape into two numbers:

**Risk Reversal (RR) = 25-delta call vol − 25-delta put vol**
- Captures directional skew: which wing is more expensive
- Positive RR = calls bid = market paying for upside
- Negative RR = puts bid = market paying for downside

**Butterfly (BF) = average of wings − ATM vol**
- Captures tail convexity: how fat are the tails regardless of direction
- High BF = market paying up for extreme outcomes (either direction)
- Low BF = market expects a narrow, well-behaved distribution

**Reading RR and BF together:**

| RR | BF | Interpretation |
|----|----|----|
| Large positive | High | Strong upside conviction + fat tails — event-driven upside pricing |
| Large negative | High | Strong downside conviction + fat tails — crash hedging |
| Near zero | High | No directional view, but big tails expected — pure uncertainty |
| Near zero | Low | No view, no tails — complacency |

**Critical sign convention for rates products (SR3):**
SR3 futures price = 100 − rate. Therefore:
- SR3 **call** pays off when price rises = when rates **fall** (dovish)
- SR3 **put** pays off when price falls = when rates **rise** (hawkish)

A **positive SR3 RR** means calls are bid over puts = **dovish tail is bid**. This is the **opposite** of equity convention. Failure to invert the sign produces a directionally wrong read of the entire rates complex.

**Percentile context for skew:**
Like vol cones, skew levels need historical context. An SR3 RR reading at the 90th percentile of its recent distribution means the market is paying a **historically extreme premium** for that directional tail — not just a passing preference but a sustained, high-conviction structural position.

---

## The Cross-Asset Matrix

Apply all five lenses to each product and compress the findings into a matrix. This is the minimum viable diagnostic:

```
Lens             | Product A        | Product B        | Product C
-----------------|------------------|------------------|------------------
Open Interest    | Barbell / tail   | Sparse (OTC)     | Call-heavy
CVOL             | Rising / event   | Passive lift     | Flat / disconnected
Term Structure   | Step function    | Smooth contango  | Smooth contango
Vol Cones        | Fair value ~50th | Neutral          | Cheap ~30th
Skew             | Dovish bid 90th  | Limited signal   | Soft puts, no tails
```

**Matrix reading principle:**
Within each product, consistent signals across all five lenses = high confidence read. Across products, **consistent disagreement** is the diagnostic finding — it tells you which market is closer to the transmission mechanism, which is complacent, and where the mispricing (if any) lies.

---

## Product-Specific Reference

### SR3 — 3-Month SOFR Futures Options (Front-End Rates)

- Deepest US front-end rates market post-Eurodollar transition
- Each quarterly contract prices a specific FOMC meeting window
- Price convention: price = 100 − rate (call = bullish on price = dovish on rates)
- Step functions in term structure at FOMC-dated contracts = binary event pricing
- Sophisticated RR positioning (dovish near-term + hawkish long-term barbell) = path-dependent macro view
- When SR3 cone is at ~50th percentile, event pricing is **durable and structural**, not a panic spike

### TN — 10-Year Ultra T-Note Futures Options (Duration)

- Tighter deliverable basket than TY — cleaner 10Y duration exposure
- Most institutional 10Y vol flow trades **OTC as swaptions**, not via listed TN options
- Sparse OI and smooth term structure in listed TN is a structural feature, not a lack of conviction
- Mild parallel term structure lift (no event step) = riding rates move passively
- To read directional 10Y vol conviction, look at OTC swaption skew, not listed TN

### NQ — E-mini NASDAQ-100 Futures Options (Growth Equity)

- Most concentrated growth and AI-capex exposure in listed equity complex
- Vol reflects both single-name dispersion and macro transmission
- When NQ term structure is smooth through FOMC-dated contracts that SR3 is flagging as binary events = structural complacency
- NQ vol at ~30th percentile cone = statistically cheap, not just low
- Soft (less negative than mean) put skew = put demand is below average = market is not hedging downside aggressively

---

## Four Regime Hypotheses When Rates and Equity Vol Diverge

When rates options are pricing binary events that equity options are ignoring, four explanations are possible. Always assign explicit probability weights:

### A — Equity is right, rates is overpaying (~20%)
The equity market correctly anticipates benign resolution. Fed path uncertainty resolves into a modest dovish shift equities can absorb. Rates options decay. Evidence: equity vol cone justified ex post.

### B — Rates is right, equity is asleep (~45% — modal)
The rates market, closest to the policy transmission mechanism, correctly prices genuine bimodal uncertainty. Equity vol is suppressed by recent low realized vol and systematic vol-selling programs. The equity complex is under-hedged for events that rates are clearly pricing.

### C — Both right, about different things (~25%)
Rates prices the binary of 25 vs 50 bp at the next FOMC. That specific choice is equity-benign regardless of outcome. The markets price different risks coherently.

### D — Transmission is broken (~10%)
Systematic vol-selling programs (put-writing ETFs, vol-controlled mandates) have grown so large that equity vol no longer reprices macro risk. Real option buyers have migrated to rates or OTC.

**Modal read:** Weight B highest when the SR3 cone reads as fair-valued (durable, not panic), the RR is at the 90th percentile, and the butterfly is concentrated at specific FOMC contracts. These are signs of **structured institutional positioning**, not reactive hedging.

---

## Monitoring Dashboard — Six Key Indicators

After forming a view, track these daily. Threshold breaches should update scenario weights:

| Indicator | What to watch | Threshold | Signal |
|-----------|--------------|-----------|--------|
| SR3 FOMC-contract ATM vol | Front-end event pricing durable? | Sustained move >10% from entry | Thesis evolving |
| SR3 FOMC-contract 25d RR | Dovish bias holding? | ±4 bp shift from peak | Direction changing |
| NQ front-month ATM vol | Equity waking up? | +2 vol points above entry | Transmission beginning |
| NQ FOMC-dated contract term kink | Event step appearing? | +0.5 hump where smooth | NQ pricing the event |
| 2Y yield CVOL (TUVY) | Rates vol escalating or decaying? | >110 or <95 | Regime escalation / resolution |
| Gold CVOL (GCVL) | Risk-off regime flip? | >32 | Systemic stress, not policy |

---

## Key Pitfalls

**1. Reading OI direction without skew**
Large put OI does not mean bearish. It can be a hedge, a spread leg, or a structured product residue. Always confirm direction with RR (lens 5).

**2. Reading CVOL without term structure**
An elevated CVOL may be concentrated at one FOMC contract (event-specific) or spread evenly (general uncertainty). The term structure tells you which.

**3. Reading term structure without cones**
An elevated vol print at a specific tenor looks expensive until you discover it sits at the 45th percentile of its own recent history. Cones are mandatory to determine rich/cheap.

**4. Inverting the SR3 sign**
Positive RR on SR3 = dovish tail bid. Negative RR = hawkish tail bid. This is opposite to equity. Getting this wrong reverses the entire directional read.

**5. Treating cross-asset confirmation as optional**
If FX vol and gold vol are falling on a day when 2Y yield vol surges +4 bp, this **confirms** the move is rates-specific, not systemic. The absence of cross-asset confirmation is itself the signal. Always run the coherence check.

**6. Conflating cheap vol with a trade signal**
Vol at the 30th percentile is statistically cheap. That does not automatically mean buying it is correct — if Scenario A (equity right, rates overpaying) materializes, cheap vol decays to zero. Cheap vol plus durable corroborating evidence from rates is the setup. Cheap vol alone is not.

---

## Historical Precedent — When This Pattern Appeared Before

Similar cross-asset vol divergences (rates vol elevated, equity vol structurally suppressed) preceded:
- **Late 2007 / early 2008** — rates vol flagged credit stress before equity vol responded
- **Q4 2018** — rates market pricing Powell pivot before equities repriced
- **Early 2020 pre-COVID** — front-end rates hedging activity before equity vol explosion

These are not predictive in isolation. Three observations are not a pattern. But the asymmetry is consistent: when rates vol (closest to policy transmission) is structurally elevated and fair-valued against its own history, and equity vol is structurally cheap, the scenarios in which equity vol realizes meaningfully (dovish shock, hawkish shock, non-monetary shock) aggregate to a combined probability that often exceeds 50% — meaning the modal outcome for NQ vol is not "stays flat."

---

## Application to the MacroFX Model

When applying this framework to the MacroFX dashboard:

- **VIX / equity vol** is one of the cross-asset sentiment inputs. Its level should be contextualized against its own recent distribution (cone logic), not read in absolute terms.
- **CVOL divergences** between rates and equities can flag regime transitions ahead of price action — relevant to the dashboard's macro scoring tier.
- **Term structure steps at FOMC dates** in SR3 are a leading indicator for USD pairs: a market pricing a binary Fed outcome implies elevated FX vol risk in the corresponding window. GARCH vol forecasts should reflect this.
- **Skew (RR direction)** in rates options informs the directional bias for USD crosses — a sustained dovish bid in SR3 RR is a data point for the macro scoring of USD-denominated pairs.
- **OI walls and gamma flip levels** in the OI Analyser are the equity-options equivalent of the barbell positioning described here. The same interpretive logic applies: OI is ambiguous on direction; gamma flip level is the regime change marker.

---

*Document compiled from: Colez Trades VOL 07, Applied Theory, 21 April 2026. Cross-referenced with MacroFX Model architecture and trading_lessons_reference.md.*
