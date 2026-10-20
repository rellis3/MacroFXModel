Colez Trades
Quantitative & Macro Insights
C.OG
§01 · Framework§02 · Positioning§03 · Aggregate Vol§04 · Term Structure§05 · Vol Cones§06 · Skew§07 · Synthesis§08 · Regime§09 · Scenarios§10 · Risks
[ CT ] Colez *Trades*
Cross-Asset Options Diagnostic
# Cross Asset Volatility *Analysis*

Three markets, one macro, three different pictures. A forensic reading of what rates, duration, and equity options are actually pricing as of the third week of April 2026 — and what the divergence between them might mean.

Cross-Asset Options Diagnostic VOL · 07
## Applied *Theory*

A study of three markets pricing the same macro through three different lenses — and what their disagreement reveals.
Why this approach Cross-asset reading three markets pricing the same macro · disagreement is signal
Assets surveyed SR3 · TN · NQ 3M SOFR · 10Y duration · Nasdaq-100
Tools applied Five-lens diagnostic open interest · CVOL · term structure · vol cones · skew
[SVG graphic: ]
The US listed options complex is, as of 21 April 2026, pricing a **significantly asymmetric distribution of macro risk** across rates, duration, and equity. The three most liquid derivatives markets on CME Group's platform — SR3 options (3M SOFR), TN options (10Y Ultra), and NQ options (NASDAQ-100) — are telling a coherent but troubling story when read together.

In SR3, implied vol term structure is a **step function** with sharp lifts at the July and October FOMC windows; skew is **positive and sitting near historical highs**; butterfly is elevated in the same contracts. The 2-year yield CVOL printed 103.87 today, up 4.38 on the day — the front end of the rates complex is live and pricing specific events with specific directional conviction.

In NQ, **every volatility dimension signals structural complacency**: ATM vol sits at ~30th percentile of its one-month distribution, risk reversal is materially less negative than historical averages, butterfly is at its historical mean. The NQ term structure is smooth through the very FOMC meetings SR3 is flagging as binary events. TN sits between the two — a mild parallel lift, no event signature, watching without committing.

The single-sentence characterization: *the rates options market is paying up for specific identifiable scenarios the equity options market is not pricing at all*. This report reads the evidence across five analytical lenses, synthesizes the regime, and maps the scenarios. The objective is not to prescribe a trade but to deliver precise, defensible situational awareness on what the options complex is implying, and what it is not.

SR3 Front-End Skew
+8
bp vol · SR3V26 25d RR
Near 90th percentile — dovish-tail hedges bid.
NQ ATM Vol
18.59
vol pts · front-month
~30th percentile — structurally cheap.
2Y Yield CVOL
103.87
bp · +4.38 day
Inverted yield-vol curve — front-loaded.
NQ Risk Reversal
−3 · −6.5
vol pts · across tenors
Less negative than mean — put demand soft.
§01 · Framework
## The *five-lens* framework

Options markets price probability distributions. Five analytical lenses, read in sequence, produce the minimum workable diagnostic. No single lens is self-sufficient.

01 · Where
[SVG graphic: ]
Open Interest
The stock of positioning by strike and expiry. Useful for sizing and gamma walls; ambiguous on direction. Large put OI can be bearish, delta hedge, or structured-product residue.
02 · How Much
[SVG graphic: ]
CVOL Aggregate
30-day constant-maturity implied vol, comparable across asset classes. Reveals the overall risk temperature; blind to where in the curve the risk concentrates.
03 · When
[SVG graphic: ]
Term Structure
Where in the forward calendar the risk concentrates. Smooth contango is normal. Steps and humps reveal event pricing. Week-on-week overlays convert snapshot into flow.
04 · Rich / Cheap
[SVG graphic: ]
Volatility Cones
Today's vol placed on its historical distribution by tenor. Converts an absolute level into a percentile rank. Resolves whether hedging is rich or cheap.
05 · Which Way
[SVG graphic: ]
Skew Decomposition
25-delta risk reversal and butterfly. The directional signal — which tail is being paid up for, and whether fat tails or a narrow distribution are being priced.
Framework Principle
Any single lens misleads. OI without skew sends you the wrong way on direction. CVOL without term structure conceals event concentration. Term structure without cones treats an elevated vol print as expensive when it may be fair-value in context. **All five lenses together is the minimum viable diagnostic.**

### 1.2Products analyzed

Rates · Front-End
SR3
**3-Month SOFR Futures Options.** Deepest US front-end rates market post-Eurodollar transition. Each contract prices a specific FOMC meeting window. **Critical convention: price = 100 − rate**, so SR3 calls pay off on rates falling (dovish).
Rates · Duration
TN
**10-Year Ultra T-Note Futures Options.** Tighter deliverable basket (9y 5m – 10y) than TY, giving cleaner 10Y duration exposure. Less liquid than OTC swaptions; most institutional 10Y vol flow happens off-exchange.
Equity · Growth
NQ
**E-mini NASDAQ-100 Futures Options.** Most concentrated growth and AI-capex exposure in the listed equity complex. Seven names drive ~40% of index weight. Vol reflects both single-name dispersion and macro transmission.
All data is sourced from CME Group's QuikStrike toolkit (cmegroup.com/tools-information/quikstrike) using end-of-day settlement prints for 21 April 2026, with 30-day lookbacks ending that date. Observed futures prices anchoring the analysis: SR3M6 = 96.35, TNM6 = 114.02, NQM6 = 26,835.5.

Figure 1.1 CME Group QuikVol Tool — the analytical workbench behind this report
[IMAGE figures/fig01.png] CME QuikVol Tool landing page showing the five analytical modules.
Five analytical modules support the work in this note: Active Expirations, Constant Maturity, Front Month, Historical Expirations, and the Volatility Cones used heavily in §5 and §6. Free with a CME Group account; the analytical value here lies in the disciplined reading, not in privileged data access.
Source: CME Group · QuikVol Tool · accessed 21 Apr 2026
§02 · Positioning
## Where the *value* lies

Open Interest — the stock of live contracts at each strike and expiry — is the first and crudest read on the market's risk pricing. It shows **scale**, not intent. But scale matters; it tells us which strikes carry the gamma and where market-makers will be forced to hedge hardest if we arrive there.

What OI cannot tell us is equally important. A large put position at a given strike can be: (a) an outright bearish bet, (b) a delta hedge against a long underlying position, (c) a short leg of a spread, or (d) an overlay on a structured product. This ambiguity is why OI is lens number one, not lens number five. It sets the stage; direction comes later.

### 2.1SR3 — a barbell of conventional and catastrophe hedging

The front-end rates options complex on CME is the deepest in the world. Looking at the main body of the SR3 OI distribution reveals two-sided positioning concentrated in the **95.25 – 97.00** strike corridor. Those strikes translate to rate expectations of 3.00% to 4.75% — a range spanning today's observed SR3M6 = 96.35 futures price plus a wide band on either side. Nothing unusual about the distribution's shape: it's the conventional “market-making exists here, everyone has their bets” pattern.

Figure 2.1 SR3 Open Interest Heatmap — the conventional strike corridor
[IMAGE figures/fig02.png] SR3 Open Interest matrix showing concentration in the 95-97 strike range.
Open interest across SR3 options expiries, concentrated in the 95–97.5 strike band. Darker teal cells mark the highest-OI concentrations — SR3M6 96.25 put at 38,300 contracts, SR3U6 96.5 call at 389,378, SR3Z6 96.25 call at 251,448. This is the conventional body of the distribution.
Source: CME QuikStrike · SR3 OI Matrix · 21 Apr 2026
The interesting story is not in the conventional body. Scroll the same matrix *down* to the deep out-of-the-money put strikes — 90.00 to 93.75, corresponding to rate expectations of 6.25% to 10.00% — and the picture sharpens into something specific.

Figure 2.2 SR3 Deep OTM Puts — hawkish catastrophe hedges
[IMAGE figures/fig03.png] SR3 Open Interest matrix showing significant put open interest at deep out-of-the-money strikes 90-93.75.
The far-left-tail of the SR3 put surface. SR3Z6 93.5 puts at 3,407 contracts. SR3M6 93.25 puts at 3,264. SR3M6 93.75 puts at 2,436. These strikes pay off only if the Fed is forced to 6.25%+ — a scenario requiring an inflation re-acceleration severe enough to force emergency hiking. Small size absolutely; but the presence of concentrated deep-OTM puts at all is the signature of tail-hedge demand.
Source: CME QuikStrike · SR3 OI Matrix · 21 Apr 2026
What the Barbell Means
Two populations of buyers at the extremes of the strike space are paying for two different scenarios. At the conventional body of the distribution, the market is trading normal monetary-policy Brownian motion. At 93-and-below put strikes, someone — probably a small subset of macro funds — is willing to pay residual premium for a scenario in which inflation forces the Fed into emergency hiking. The dovish tail, when we look at it through the skew lens in §6, is far bigger. But the hawkish tail is present, priced, and paid-for.

### 2.2TN — sparse positioning, OTC flow dominates

The TN options market — listed 10Y Ultra options on CME — tells a dramatically different story from SR3 in terms of *scale*. Where SR3 strikes routinely carry hundreds of thousands of OI contracts, TN strikes typically show OI counts in the hundreds to low thousands. The simplest reading: 10-year duration vol flow overwhelmingly trades OTC as swaptions, with CME TN options serving primarily as a hedging adjunct.

This is a data point about market *structure*, not about market views. Listed TN OI is small-scale and broadly spread across expiries with no single strike dominating, because directional conviction in 10Y vol is overwhelmingly expressed in the OTC swaption market — that is where institutional duration risk has lived for decades, and CME TN options serve as a hedging adjunct rather than a primary venue.

### 2.3NQ — concentrated upside equity positioning

NQ options on CME are the equity-index counterpart to SR3 in terms of retail-plus-institutional scale, and the OI matrix shows positioning concentrated around the observed NQM6 = 26,835.5. What's interesting is the *skew* of that positioning: OI clearly drapes to the upside, with substantial contract counts at 27,000–28,000 call strikes relative to equivalent-distance put strikes.

Cross-Product Read
SR3 shows a **barbell** — conventional-plus-catastrophe-hedges. NQ shows an **upside skew** — long-call positioning with modest put protection. TN shows **sparsity** — go read swaptions. Already in lens one, before considering any pricing or vol data, the three products tell different stories about how their participants are positioned. This is a feature of the ecosystem, not a problem.

§03 · Aggregate Vol
## The *temperature* across assets

CVOL — CME Group's Cross-asset Volatility index family — produces a 30-day constant-maturity implied volatility number for every listed product, computed using a uniform methodology. This is the lens that tells us whether today's options complex is collectively hot, cold, or diverging.

Concept Primer Implied volatility & *CVOL* P · 03
[SVG graphic: IV = THE WIDTH THE MARKET IS PRICING SPOT LOW IV (e.g. 12%) Narrow distribution · small expected moves HIGH IV (e.g. 30%) Wide distribution · large expected moves ±1σ EXPECTED RANGE IV is the market's price for how wide this curve is.]
##### What IV is

Implied volatility is the volatility number that, plugged into an options pricing model, reproduces the price the market is currently quoting. It is not a forecast — it is a **price**. When you buy an option, you are paying for exposure to a distribution of future outcomes; IV is the width of that distribution the market is currently charging for.

An annualised IV of 20% on an underlying at $100 means the market is pricing an expected one-standard-deviation move of roughly ±20% over the next year, or ±1.25% per day. **Higher IV = wider expected distribution.** Lower IV = narrower.

##### Why CVOL exists

A raw IV print is tied to a specific contract — a specific strike, a specific expiry. To compare IV across asset classes, or even across days within one product, you need to normalise. CVOL is CME's family of **constant-maturity 30-day implied vol** indexes: it samples the live options surface and constructs the synthetic price of a hypothetical option that always has exactly 30 days to expiry. That fixed clock means today's CVOL is directly comparable to last week's CVOL on the same product, and to today's CVOL on a different product.

IV is a price, not a forecast. CVOL strips the calendar out so those prices are comparable across days and products. When 2Y yield CVOL prints +4.38 in a single session, that is the market materially repricing the 30-day-forward distribution of 2Y yields — which is exactly the move §03 is about to walk through.
Before reading the CVOL dashboard, the convention worth internalizing: CVOL numbers are expressed in the natural units of the underlying. For yield products (Treasuries by yield), the unit is *basis points*. For price products (Treasuries by price, FX, equities, commodities), the unit is *vol points*. This matters because it means we cannot naively compare a 103.87 on TUVY to an 18.59 on NQ — but we *can* compare today's TUVY level to its own history, and today's NQ level to its own history, which is the comparison that matters.

Figure 3.1 CVOL Cross-Asset Dashboard — the full temperature map
[IMAGE figures/fig04.png] CVOL Dashboard showing cross-asset 30-day implied volatility readings.
CVOL readings across Treasury yield and price, STIRs (short-term interest rates), FX, Metals, Energy, and Ags. The cluster of large green (positive) daily changes on the Tsy (Yield) panel — TUVY +4.38, TYVY +3.17, FVVY +2.94 — is the single most diagnostic move on the screen. FX vol is broadly falling. Metals mixed. Energy elevated but supply-specific (heating oil). This is a *rates-specific* vol move, not a risk-off event.
Source: CME QuikStrike · CVOL Dashboard · 21 Apr 2026 · 15-min delayed
### 3.1The inverted yield-vol curve

The single most important read on the CVOL dashboard is the **inversion of the yield-vol term structure**. Normally, Treasury yield vol slopes upward from 2Y to 30Y — more uncertainty in the long end because more time has passed for shocks to accumulate. Today that relationship is upside-down:

| Tenor | Symbol | CVOL | Day Chg | Reading |
| 2-Year | TUVY | 103.87 | +4.38 | Highest vol in curve · front-loaded |
| 5-Year | FVVY | 94.68 | +2.94 | Elevated but below 2Y |
| 10-Year | TYVY | 91.79 | +3.17 | Moderate — parallel lift with front |
| 30-Year | USVY | 82.85 | +0.35 | Stable — long end unbothered |
| 3-Month SOFR | SRVL | 80.60 | −0.35 | Front-end marginally softer |

The Shape Matters More Than the Level
2Y yield vol at 103.87 vs 30Y yield vol at 82.85 is an **inverted curve** on vol. This shape is consistent with the market pricing *resolvable* near-term uncertainty: something that will become known in the next 6–18 months (the path of Fed policy), after which longer-dated vol is expected to decline. The 2Y move of +4.38 on the day, against a 30Y move of only +0.35, reinforces the story — whatever is moving front-end vol today is not being transmitted out the curve. This is a *policy-path pricing* event, not a structural term-premium event.

### 3.2Cross-asset coherence check

If today's rates vol move reflected general risk-off or a macro-regime shift, we'd expect confirming moves elsewhere: FX vol up, equity vol up, gold vol up, credit vol up. Let's check:

FX
Broadly falling
GBVL 7.62 −0.06 · EUVL 6.66 −0.25 · JPVL 8.33 −0.26. G5FX dim at 6.95. If today were risk-off, FX vol would be lifting in sympathy. It isn't.
Precious Metals
Gold vol quiet
GCVL at 25.89 −0.93. Gold is the classic macro-stress hedge. Low and falling gold vol means the market is not pricing a systemic-stress scenario.
Energy
Crude mixed
CLVL 86.80 +1.25. Elevated but this is an *asset-specific* supply dynamic — not general risk-off transmission.
STIRs
SRVL softer
3M SOFR CVOL at 80.60 −0.35. The 30-day composite reads slightly softer even as the 2Y yield composite lifted hard — confirming the event-pricing read.
Cross-Asset Confirmation
FX vol falling, gold vol falling, energy vol supply-specific, rates vol surging at the 2Y. The cross-asset complex confirms that today's rates move is **specific and idiosyncratic**, not systemic. The market is repricing its view of the Fed's near-term path. That is exactly the kind of event that shows up first and biggest in front-end rates options — and exactly the kind of move the NQ options market should be watching closely.

§04 · Term Structure
## The shape of *forward* uncertainty

The term structure of implied volatility answers the question: *where in the forward calendar does the market price its risk?* Smooth contango is normal. Steps and humps in the curve are the fingerprint of identifiable events. The week-on-week overlay converts a snapshot into flow — showing whether vol at each tenor bid or offered over the past five sessions.

Concept Primer The *shape* of the term structure P · 04
[SVG graphic: FOUR SHAPES · TIME → · IV ↑ CONTANGO NORMAL · MORE TIME = MORE VOL BACKWARDATION STRESS · ACUTE NEAR-TERM RISK EVENT STEP EVENT-PRICED · FOMC, EARNINGS PEAK HUMP CONTAINED · LOCAL EVENT WINDOW]
##### What it shows

The **term structure of implied vol** plots IV against time-to-expiry, holding moneyness fixed (usually at-the-money). It answers the question: *as we look further into the future, is the market pricing more uncertainty, less, or the same?*

##### Four shapes worth recognising

- **Contango** — IV rises smoothly with tenor. The default state. More time = more shocks accumulate.

- **Backwardation** — front higher than back. Stress signature: acute near-term uncertainty the market expects to resolve.

- **Step** — flat, then a sharp jump at one contract, then flat. The fingerprint of an *identifiable event* falling inside that contract's life — a Fed meeting, an earnings call.

- **Hump** — a localised bulge with IV lower on either side. Same logic as a step, but the event is contained within a single contract window.

Smooth contango is normal. Steps and humps are diagnostic — the market is naming a specific event and pricing it. The SR3 curve has classic steps at SR3N26 (July) and SR3V26 (October). NQ's curve through the same calendar is smoothly contangoed and silent. That contrast is the report's central observation.
SR3 Front-end rates TN 10Y duration NQ Equity
#### SR3 — The step function of FOMC event pricing

Figure 4.1 SR3 Volatility Term Structure — step function at FOMC windows
[IMAGE figures/fig05.png] SR3 term structure showing step-function shape.
Implied vol across SR3 quarterly expiries. The structure jumps at SR3N6 (July FOMC, containing the summer rate decision) and again at SR3V6 (October FOMC). These are not natural curve shapes — they are event-pricing fingerprints. The grey line overlay shows vol 7 days ago; today sits materially above it at every tenor, with the biggest gap at the July contract.
Source: CME QuikVol · SR3 Term Structure · 21 Apr 2026
The SR3N26 contract — which covers the July FOMC meeting — carries materially elevated implied vol relative to the flanking contracts. The same pattern repeats at SR3V26 (October FOMC). Both lifts are *structural*: they have been there for weeks and have widened in the last 5 sessions. This is not random noise; this is the market systematically pricing specific meeting dates as binary events.

Meanwhile the serial contracts (SR3K26 May, SR3M26 June) show relatively *lower* vol — the market does not expect meeting-density events at those FOMC-less windows. The 2Y+ back-end of the curve sits at 85–90 bp, normal term-structure contango. The shape tells a remarkably clean story: **vol is concentrated at known future decision dates, not spread across the calendar.**

SR3 Term Structure Reading
The July and October FOMC meetings carry approximately **15 bp of excess vol** relative to adjacent expiries. Translated: the market is pricing those two meetings as plausibly generating a ±40-50 bp rate move on the day — a magnitude consistent with either a surprise hike or a surprise cut, but not consistent with “unchanged, steady as she goes.” *The market is telling us it expects at least one of those two meetings to deliver news.*

#### TN — Smooth parallel lift, no event signature

Figure 4.2 TN Volatility Term Structure — smooth contango with parallel lift
[IMAGE figures/fig06.png] TN term structure showing smooth upward slope.
TN price-vol from OTNM6 (front, 31 DTE) at roughly 5.5 to OTNZ6 (December, 213 DTE) at 7.2. Smooth, monotonic, no kinks. The grey prior-week overlay sits below today by a roughly constant ~0.1 vol points — a parallel shift up, not a curve-shape change. The Settle at OTNU6 reads 5.99.
Source: CME QuikVol · TN Term Structure · 21 Apr 2026
This is what a term structure looks like when the market has *no event-specific view*. Longer-dated contracts carry higher vol because more shocks have time to accumulate — the canonical contango. The week-on-week overlay shows today's curve approximately 10 bp price-vol above last week's at every tenor — a clean parallel lift, consistent with a mild repricing of duration risk but nothing curve-shape-changing.

The diagnostic value here is *what TN is not doing*. It is not echoing SR3's event-pricing shape. The July and October FOMC meetings that SR3 flags as binary do not show up as kinks in the TN term structure. Two possible reasons: (a) 10Y duration vol is less event-sensitive than 3M rate vol, which is mechanically true — a 25 bp surprise hike matters more for the front than for the 10Y via duration; or (b) the listed TN market does not reflect institutional views, which mostly trade in swaptions.

TN as a Calibration Point
TN's smooth parallel lift tells us the *duration-vol market* is pricing a mild generic increase in rate risk — nothing more specific. This is consistent with the CVOL 10Y yield reading (TYVY +3.17) which also shows a moderate rather than acute move. TN is the calibration point between SR3's event-specific pricing and NQ's near-absence of policy-transmission pricing.

#### NQ — Smooth through the very events SR3 is pricing

Figure 4.3 NQ Volatility Term Structure — smooth through known events
[IMAGE figures/fig07.png] NQ term structure showing smooth upward slope.
NQ implied vol from NQM6 (June, 52 DTE) at 19.8 rising monotonically to NQH7 (March 2027) at 22.3. Smooth, no event kinks. The contract containing the July FOMC — NQU6 — shows no spike relative to flanking contracts. The 7-day overlay shows today's curve essentially on top of last week's, a feather of movement.
Source: CME QuikVol · NQ Term Structure · 21 Apr 2026
The comparison with SR3 is the single most important observation in this report. SR3 tells us the July and October FOMC meetings are binary events with ~15 bp of excess implied vol. NQ's term structure — where one would expect the *equity transmission* of those same meetings to show up — is smooth and monotonic. There is no discernible hump, step, or excess vol at NQU6 (July) or NQZ6 (December, covering the October meeting).

Two ways to read this: either (a) the equity market genuinely believes neither FOMC meeting is a binary equity event — which requires an affirmative theory of why the equity-rates transmission mechanism would be different this time — or (b) the equity market is not paying up to hedge something the rates market is telling it to hedge. *The evidence from the remaining lenses will bear on which reading is correct.*

NQ's Silence Is the Signal
A smooth NQ term structure *through known identifiable event dates that SR3 is pricing as binary* is by definition either a sophisticated differential view (equity vol correctly sees through rates noise) or a pricing failure (equity vol is ignoring something it shouldn't). This report takes no position on which is correct in Section 4 alone. We return to the question, with more lenses brought to bear, in Section 8.

### 4.4Term structure synthesis

Reading the three products' term structures together produces a coherent picture of **information concentration** that varies dramatically by product:

| Product | Front vol | Back vol | Shape | 7-day change | Event pricing |
| SR3 | 28 bp (SR3M6) | ~85 bp (2y+) | Step function | +3 to +8 bp | Strong · FOMC |
| TN | 5.5 (OTNM6) | 7.2 (OTNZ6) | Smooth contango | +0.1 parallel | None |
| NQ | 19.8 (NQM6) | 22.3 (NQH7) | Smooth contango | ~flat | None |

§05 · Vol Cones
## Rich, cheap, or *fair*

A volatility cone places today's implied vol — at every tenor — onto its own 30-day historical distribution. Grey bands span the 5–95 percentile and the inter-quartile range; a thin line marks the 30-day mean. Today's curve is overlaid in cyan. The question the cone answers: **for each tenor, is today's vol rich, cheap, or fair relative to recent history?**

Concept Primer How to read a *vol cone* P · 05
[SVG graphic: HOW TO READ A VOL CONE 30TH %ILE FRONT TENOR → BACK IMPLIED VOL 5–95 %ILE IQR (25–75) 30D MEAN TODAY Today below the IQR = vol is cheap vs recent history. Today above the IQR = rich. Inside it = fair value.]
##### What it shows

A vol cone takes a single product's implied vol — at every tenor — and overlays today's reading on its own recent historical distribution. **The bands describe history. The line describes today.**

##### The four components

- **Outer band** — the 5th–95th percentile range of IV over a rolling window (typically 30 days). Today's vol falling inside this is normal.

- **Inner band** — the inter-quartile range (25th–75th). Inside this is fully unremarkable.

- **Mean line** — a thin line through the centre marking the rolling 30-day mean.

- **Today's curve** — overlaid on top, often labelled with percentile placement at each tenor.

##### What it resolves

A vol level on its own is meaningless. *70 bp of SR3 vol* or *18 vol points of NQ vol* can be either rich or cheap depending on the product's own recent history. The cone converts an absolute level into a percentile rank — answering, for this product at this tenor, whether today's vol is high, low, or fair against where it has been.

When the report says SR3 vol is "fair" but NQ vol is "structurally cheap at the 30th percentile," those statements are read directly off the cones. The numbers come from comparing today's overlay to each product's own band, not from comparing SR3's bp print to NQ's vol points.
Cones resolve the rich/cheap ambiguity that arises from reading vol numbers in isolation. 70 bp of SR3 vol or 18 vol points of NQ vol are meaningless levels on their own; only against a historical distribution do they acquire structuring value. Percentile placement determines whether options look attractive to own (low percentile) or attractive to sell (high percentile) or fair-valued.

### 5.1SR3 — fair-valued across the curve

Figure 5.1 SR3 ATM Volatility Cone — current reading vs 30-day distribution
[IMAGE figures/fig08.png] SR3 ATM volatility cone showing current vol positioned near historical mean.
SR3 ATM implied vol plotted against 30-day historical distribution. The front-month SR3K26 (~7 DTE) prints at 28 bp vol; SR3N26 (July) at 55; SR3V26 (October) at 67; back-end contracts at 85–90 bp. Today's curve (cyan with labels) sits **near or slightly below the 30-day mean line** at every tenor. Current reading labeled 67.84 at the short-dated front. Elevated, yes — but not rich relative to its own recent distribution.
Source: CME QuikVol · SR3 Vol Cones · 21 Apr 2026
SR3 — Not Rich, Not Cheap
This is a critical finding. Front-end rates vol is structurally elevated — 55–90 bp is high in absolute terms — but it is not historically rich relative to the recent distribution. Hedgers and directional buyers of SR3 options are paying *fair value* for the event-specific exposure they're getting. Put another way: the step-function in the term structure (§4) is **durable**, not a one-day panic. The market has been pricing these FOMC meetings this way for weeks.

### 5.2NQ — structurally cheap at every tenor

Figure 5.2 NQ ATM Volatility Cone — current vol hugging the lower IQR band
[IMAGE figures/fig09.png] NQ ATM volatility cone showing current vol positioned near the lower end of the historical distribution.
NQ ATM implied vol against 30-day distribution. Summary statistics printed on the chart: Mean 22.10, LQ/UQ 17.65–25.85, Min/Max 16.99–29.24, today's Last reading 18.59. The current curve (cyan) runs through the **lower half of the inter-quartile range** at virtually every tenor — front-month at the lower edge of the IQR, middle tenors mid-IQR-lower, longer tenors approaching the 30-day mean. In percentile terms: approximately 30th percentile at the front, rising to ~45th at NQZ26.
Source: CME QuikVol · NQ Vol Cones · 21 Apr 2026
NQ — Structurally Cheap
NQ vol is not merely lower than SR3 in level — it is **statistically cheap against its own recent history** at every tenor. The equity-options market is willing to sell protection at prices in the lower quartile of its 30-day distribution. Combined with the term-structure finding (§4 — no event pricing through July/October FOMCs), the cone produces a consistent reading: the equity complex sees no events, is paying no premium for events, and is therefore priced like an uneventful forward path.

### 5.3Cone synthesis

| Product | Front tenor | Mid tenor | Back tenor | Overall reading |
| SR3 | ~50th %ile | ~45th %ile | ~50th %ile | Fair value |
| NQ | ~30th %ile | ~35th %ile | ~45th %ile | Structurally cheap |

The cross-product finding: SR3 vol is priced fairly for what it's hedging. NQ vol is priced cheaply relative to recent history. A buyer of equity vol — especially a convex structure — is doing so at a statistical discount. Whether that discount is justified depends on whether the transmission from rates uncertainty to equity outcomes has genuinely changed, which Section 8 will address.

§06 · Skew
## Which *tail* is being paid for

The volatility smile is not a price — it's a shape. Decomposing it into risk reversal (the directional skew: which tail carries the premium) and butterfly (the convexity: how much the market is pricing fat outcomes) converts the smile into two numbers that the human brain can reason about. This is the lens that reveals *intent*.

Concept Primer The smile, *risk reversal*, and butterfly P · 06
[SVG graphic: DECOMPOSING THE VOL SMILE ATM 25Δ P 25Δ C SYMMETRIC RR ATM 25Δ P 25Δ C SKEW (RR) BF ATM 25Δ P 25Δ C FAT TAILS (BF) RR = 25Δ CALL VOL − 25Δ PUT VOL "Which wing is the market paying up for?" BF = AVG(WING VOL) − ATM VOL "How fat are the tails relative to ATM?" RR shows direction. BF shows convexity. Read together, they describe the entire smile.]
##### The smile

At a fixed expiry, plotting implied vol against strike rarely produces a flat line. The shape of that curve — the **vol smile** — encodes how the options market prices outcomes away from the money. A symmetric U means both tails are bid. A skewed shape means one wing is paying up more than the other.

##### Two numbers summarise it

- **Risk reversal (RR)** = 25-delta call vol minus 25-delta put vol. Captures *which wing* is more expensive. Positive RR = calls bid (upside skew). Negative RR = puts bid (downside skew).

- **Butterfly (BF)** = average of the two wings minus ATM. Captures *how fat the tails are* — the wing premium over ATM, regardless of direction.

##### The SR3 sign-convention trap

SR3 futures price = **100 minus rate**. So an SR3 call pays off when rates *fall* — a dovish event. A positive SR3 RR therefore means the market is paying up for **dovish-tail hedges**, not bullish ones. This convention inverts the directional read against equity skew, and it is why §06 spends a callout on the sign before walking through any RR numbers.

Same surface, two questions. RR asks *which way is the market leaning?* BF asks *how big does it think the tails are?* Read together, they describe the entire smile. Read separately, they each tell only half a story.
Critical Convention · SR3 Sign Inversion
SR3 futures price is quoted as **100 minus rate**. So an SR3 *call* pays off when the price rises — i.e., when rates fall (dovish). An SR3 *put* pays off when rates rise (hawkish). This is the opposite of equity conventions. A *positive* risk reversal on SR3 means calls are bid over puts, which means **dovish scenarios are bid**. Failure to invert the sign here produces a directionally wrong read of the entire rates complex.

SR3 Risk Reversal Directional skew SR3 Butterfly Tail pricing NQ Risk Reversal Directional skew NQ Butterfly Tail pricing
#### SR3 Risk Reversal — the dovish bid

Figure 6.1 SR3 25-Delta Risk Reversal — positive in the middle, negative at the back
[IMAGE figures/fig10.png] SR3 25-delta risk reversal showing positive values in front/mid tenors and negative at back.
SR3 25-delta risk reversal (call vol minus put vol) across tenors. Front-month shows a brief negative at the very short end. Then sharply positive through the middle: SR3K26 ~+10, peaking around SR3V26 at ~+10. Declines through the back end: SR3U27 near zero, SR3Z27/SR3H28 at −4 to −6.
Source: CME QuikVol · SR3 Risk Reversal Cone · 21 Apr 2026
The structure is an **inverted-U**: modestly negative at the very front (<30 DTE), climbing sharply to around +10 in the middle tenors (50-200 DTE), then declining through zero around the 500 DTE mark and into negative territory for the long end. The 30-day historical distribution bands show the current positive middle-section is near or above the **90th percentile** of its recent history.

Applying the sign convention: positive RR = calls bid = **dovish skew bid**. The market is paying a historically high premium — in the 90th percentile region of its recent distribution — for protection against scenarios in which *rates fall*, clustered in the 50-250 DTE bucket. That bucket contains both the July and October FOMC meetings. The market is specifically paying for the possibility of *surprise dovish moves* at those meetings.

The negative back-end is a complementary hawkish persistence view: for contracts 2+ years out, puts are bid relative to calls. The implied story: the market prices a material probability that whatever happens in 2026 is temporary and rates eventually end up higher. This is not inconsistent with the front dovish bid — it can be read as “cut now, but stay higher than the long-run neutral.”

SR3 RR — The Single Most Diagnostic Chart in This Report
The RR curve's shape is a **barbell directional bet**: pay up for dovish tails at the FOMC meetings in 2026, pay up for hawkish tails 2+ years out. The combination is not a generic hedge — it is a specific view of policy path-dependence. **This is sophisticated macro positioning, not index hedging noise.**

#### SR3 Butterfly — fat tails concentrated at FOMC windows

Figure 6.2 SR3 25-Delta Butterfly — elevated convexity at July/August contracts
[IMAGE figures/fig11.png] SR3 25-delta butterfly showing elevated readings at SR3N26 and SR3Q26.
SR3 25-delta butterfly (average of call and put wings minus ATM vol). Front-month prints at ~4 vol points. SR3N26 peaks at approximately 14; SR3Q26 at 12. These sit **above the 30-day mean line** (visible as the thin black line in the grey band) — fat tails being actively priced at the July-through-August window. Back-end butterfly stable around 7–9.
Source: CME QuikVol · SR3 Butterfly Cone · 21 Apr 2026
Butterfly converts into plain English roughly as: “how much more does the market pay for 25-delta wings than for the at-the-money forward?” Higher butterfly = fatter tails = more probability mass allocated to outcomes significantly away from the forward. At SR3N26, a butterfly of ~14 bp vol (against a historical mean of ~9) says the market is **pricing ~50% more tail mass around the July FOMC than its 30-day average.**

Reading RR and butterfly together for SR3N26 / SR3Q26: the market is pricing *fat tails with a dovish bias*. That specific combination has a clear analytical interpretation — it is pricing a **regime-change probability**. An outright hawkish or dovish surprise in isolation would show up as RR skew without elevated butterfly. Elevated butterfly in combination with dovish-biased RR reads as “the market thinks the July meeting could deliver news that materially changes the rate path, most likely downward, possibly upward, but either way: not no-change.”

#### NQ Risk Reversal — structurally less negative than history

Figure 6.3 NQ 25-Delta Risk Reversal — persistent negative skew, but softer than mean
[IMAGE figures/fig12.png] NQ 25-delta risk reversal showing negative values softer than the historical mean.
NQ 25-delta risk reversal across tenors. Front-month Q4AJ26 at −3.5; declining through NEK26 (−5), NQM26 (−5.5), QN3N26 (−6), NQU26 and NQZ26 at approximately −6.5. The 30-day mean line sits at ~−8 in the middle tenors. Today's curve is **1.5 to 2 vol points less negative** than its mean.
Source: CME QuikVol · NQ Risk Reversal Cone · 21 Apr 2026
Equity RR is almost always negative — puts structurally carry a vol premium over calls because of natural institutional hedging demand. The diagnostic question is never “is NQ RR negative?” (yes, always). It is “is NQ RR *more or less negative* than its recent distribution?” Today's answer is: materially **less negative**. Today's curve sits at approximately the 75th–90th percentile of its 30-day distribution on the “less bearish” side.

Translation: the relative premium paid for downside protection has **softened** in recent weeks. Put demand has ebbed. This is consistent with the ATM-vol finding (§5) of structurally cheap NQ vol and with the term-structure finding (§4) of no event pricing. Across all three lenses, NQ options buyers are collectively *unwilling to pay up* for any specific protection right now.

NQ RR as Confirmation
Softer NQ RR is the third independent confirmation that the equity options market is pricing complacency. It could be correct — put demand may have softened because the market genuinely sees no event risk. It could be mispriced — put demand may have softened because recent realized vol has been low, producing passive hedging decay. Both mechanisms produce the same observation. The behavioral question is which is dominant.

#### NQ Butterfly — at the historical mean, no tails priced

Figure 6.4 NQ 25-Delta Butterfly — sitting precisely at the 30-day mean
[IMAGE figures/fig13.png] NQ 25-delta butterfly showing current reading near historical mean.
NQ 25-delta butterfly current reading 0.71. Today's curve (cyan with dots) runs **almost exactly on top of the 30-day mean line** (the thin black line in the grey band) from NEK26 through NQZ26. Butterfly values flat at approximately 0.7 vol points across tenors. The IQR band narrow — this statistic has little recent variance.
Source: CME QuikVol · NQ Butterfly Cone · 21 Apr 2026
NQ butterfly at the historical mean confirms the complacency story. There is no excess tail mass being priced in the equity options market — not to the upside (a squeeze rally), not to the downside (a crash). The vol smile is narrow, symmetric, and average. Combined with the RR, butterfly, term-structure, and cone findings, the NQ options complex is pricing a **calm, eventless forward six months**.

### 6.5Skew synthesis

| Product / Metric | Front tenor | Mid tenor | Back tenor | Mean %ile | Reading |
| SR3 RR | −2 / +5 | +8 / +10 | −4 / −6 | ~90th | Dovish bid · mid |
| SR3 Butterfly | ~4 | 14 at N26 | ~8 | ~70th | Fat tails · FOMC |
| NQ RR | −3.5 | −6 | −6.5 | ~75–90th less neg | Soft put demand |
| NQ Butterfly | 0.2 | 0.71 | 0.7 | ~50th | No tail priced |

Rates skew carries identifiable, sophisticated, directional-biased tail mass. Equity skew carries nothing in particular. The two markets are looking at the same macro variables and reaching different conclusions about what might happen.
§07 · Synthesis
## The cross-asset *matrix*

Five lenses × three products = fifteen individual readings. The matrix compresses these into a single visual that shows where the products agree, where they diverge, and where the analytical attention should land.

Lens ↓ / Product →
SR33M SOFR
TN10Y Ultra
NQNASDAQ-100
Positioning (Open Interest)
Barbell
Dual-population hedging
Two-sided
Sparse
Read swaptions elsewhere
Minimal
Upside-skewed
Long-call, lightly hedged
Call-heavy
Aggregate Vol (CVOL)
SRVL 80.60 −0.35
+4.38
Curve-inverted on vol
Event repricing
TYVY 91.79 +3.17
Riding the rates lift
Passive
No direct CVOL
Not confirming rates signal
Disconnected
Term Structure
Step function
Binary event pricing
Event-rich
Smooth contango
No calendar signature
Flat
Smooth contango
Ignoring rates events
Complacent
Vol Cones (Percentile)
~50th percentile
Durable, not transient
Fair
Not displayed
Neutral by proxy
Neutral
~30th percentile front
Stat discount to recent hist
Cheap
Skew Decomposition
Dovish + fat tail
Sophisticated barbell
Dovish bid Fat tails
Generic
Out-of-band read needed
Read swaptions
Less negative than mean
Put demand has softened
Soft protection
Matrix Reading
Every lens produces a consistent *within-product* picture. SR3 reads as event-rich, directionally biased, fairly priced. TN reads as neutral, modest parallel lift, OTC-dominated. NQ reads as complacent, uneventful, structurally cheap. These three readings do not fit naturally together in a coherent regime. Which framework best explains the divergence — and what to do about it — is the question Section 8 addresses.

§08 · Regime
## Four *interpretations* of the asymmetry

The SR3-NQ divergence is not in itself a trade signal. Before sizing anything, the analyst has to form a view on *which* of several possible explanations is driving it. Each carries different implications for what happens next.

The 2×2 below arranges the four live hypotheses along two dimensions: **which market is closer to right** (horizontal) and **what type of error is present** (vertical). The probability estimates are my own — reasonable observers could arrive at different weights, but the four hypotheses themselves should be exhaustive.

20%probability
SCENARIO A · EMERALD
NQ is *right*, SR3 is overpaying
The equity market correctly anticipates that Fed path uncertainty will resolve into a benign outcome — either a continuation of the current path, or a modest dovish shift that equities absorb without stress. Rates options are overpaying for tail-pricing that will decay.
Evidence for
NQ ATM vol cheap Gold CVOL low FX vol falling
Evidence against
SR3 cone at mean RR in 90th %ile
45%probability
SCENARIO B · CYAN · MODAL
SR3 is *right*, NQ is asleep
The rates market, closer to the policy transmission mechanism, correctly prices that Fed path is uncertain and potentially bimodal. Equity vol remains suppressed because recent realized vol has been low and passive systematic programs are short vol. The equity complex is **under-hedged** for an event that rates are clearly pricing.
Evidence for
SR3 cone fair Step durable in TS TUVY +4.38 today RR sophisticated barbell
Implied trade
Long NQ convexity around FOMC dates
25%probability
SCENARIO C · AMBER
Both are *right*, about different things
Rates options are pricing the specific binary of whether the Fed cuts 25 or 50 bp at the July meeting. This produces front-end vol kinks and dovish skew. But the equity-transmission of *that* uncertainty is genuinely limited — either choice is equity-benign. The markets price different risks coherently.
Evidence for
TN also quiet No confirming gold/FX stress
Evidence against
SR3 BF 14 at N26 Deep OTM put wall
10%probability
SCENARIO D · VIOLET
The *transmission* is broken
Systematic vol-selling programs in equity-land have grown to the point where equity vol no longer cleanly reprices macro risks. The NQ options surface reflects structural short-vol flow rather than market views. Real option-buyers have migrated to rates, or to OTC, or to dispersion structures.
Evidence for
Known growth in vol-selling AUM NQ term structure too smooth
Evidence against
Hard to prove directly
Modal Read — Scenario B (45%)
The weight of evidence — durable step-function in SR3 term structure, RR in the 90th percentile, concentrated butterfly at specific FOMC dates, TUVY's +4.38 lift today, and the cross-asset picture that shows this is rates-specific and not general risk-off — favors the view that the rates market is pricing a genuine uncertainty the equity market is under-weighting. The difference is especially stark because the SR3 pricing is not a one-day panic (cone reads as fair-valued) but a **durable, structured view** that has been developing for weeks.

If B is right, and NQ eventually re-prices to match what SR3 is pricing, we would expect to see: NQ vol lift first at the front month, with spike around the July FOMC contract; NQ RR become more negative; NQ butterfly lift to price the regime-change tails. None of these has begun. The signal is a standing one.

Sizing Considerations
Scenario B is modal but not dominant. A position sized to be comfortable even under Scenario A (20% — NQ is right and rates options decay) or Scenario D (10% — equity vol stays structurally suppressed because of flows, not views) is prudent. That means: small, convex, limited premium at risk, explicit calendar alignment with the SR3 event dates that are driving the thesis.

§09 · Scenarios
## What the options *distribution* looks like from here

The options complex, read across products, prices a specific multi-modal forward distribution. Below are the four scenarios that the current positioning and skew are consistent with, with probability weights, triggers, and trade-implication maps. The weights are mine; the structural readings from the matrix anchor them.

Base · *Status Quo*
50%
**Trigger:** FOMC holds through July, makes a measured 25 bp cut in October amid softening labor data. No regime-change surprises. Fed messaging remains data-dependent and conventional.
Rates
2Y ends the year ~20 bp lower. 10Y range-bound. SR3 mid-contracts rally modestly; RR skew decays toward zero; vol surface normalizes.
Equity
NQ grinds higher on multiple expansion. Realized vol remains suppressed. NQ cone reading justified ex post.
Options P&L
Long NQ vol decays to zero. Long SR3 RR decays but pays some premium. NQ call-heavy OI rewarded. Scenario A (§8) confirmed.
Dovish tail · *Emergency cuts*
20%
**Trigger:** Labor market cracks in Q2/Q3. Inflation falls faster than expected. Fed cuts 50 bp in July and signals more. A growth scare — not a recession — but forces the Fed's hand.
Rates
SR3V26 calls print enormous. Front-end vol realizes. RR skew vindicated: the dovish tail SR3 was paying for materializes. TN rallies meaningfully.
Equity
NQ initial reaction ambiguous — bad growth data, but dovish Fed. Volatility spikes. NQ vol is vindicated as having been cheap. Subsequent direction depends on which dominates.
Options P&L
Massive SR3 call P&L. NQ vol long positions pay materially. NQ straddles monetize. Scenario B (§8) confirmed.
Hawkish tail · *Sticky inflation*
15%
**Trigger:** Core inflation reaccelerates — services prices and shelter refuse to cooperate. Fed on-hold extends through year-end. Forward curve reprices higher-for-longer. The 2+ year back-end of SR3 RR vindicated.
Rates
Long-end SR3 puts (2027 expiries) print. Deep OTM put wall at 90-93.75 justified. 10Y rates lift 40-60 bp. TN price-vol realizes through the parallel lift already observed.
Equity
NQ de-rates on discount-rate pressure. Multiple compression. Realized vol lifts. NQ put skew snaps wider. The complacency is punished specifically.
Options P&L
Long NQ puts pay. Long SR3 back-end puts pay. Short NQ RR positions pay. Scenario B (§8) confirmed in the opposite direction.
Shock · *Non-monetary event*
15%
**Trigger:** A non-monetary shock unrelated to the Fed path — geopolitical escalation, credit-event, a sudden growth-cliff, AI-capex correction, or single-name blowup that propagates. Classic “something breaks.”
Rates
Flight-to-quality bid. SR3 and TN rally on safety flow. Curves bull-steepen. RR skew direction depends on specific catalyst.
Equity
NQ realized vol explodes from 30th-percentile starting point. Butterfly re-prices overnight. The “no tail priced” observation (§6) is punished in the cleanest possible way.
Options P&L
NQ long vol pays extravagantly. Any convex equity structure pays. Rates long-calls pay on safety flow. Scenario B or D (§8) confirmed — the asymmetric-hedging thesis is vindicated regardless of catalyst.
Scenario Reading
The scenarios with the **highest asymmetry** — where the implied options-complex pricing is most likely to be wrong — are the Dovish Tail (20%) and the Shock (15%). In both, NQ vol lifts materially from its current structurally-cheap starting point. That is the specific convexity the report's analysis points toward. The Hawkish Tail (15%) also pays NQ puts, but those are already modestly priced and the edge is smaller. The Base case, at 50%, retires the thesis at a small cost.

Combined probability that NQ vol realizes meaningfully above its implied: the Dovish + Hawkish + Shock scenarios aggregate to **50%**. That is the directional bet embedded in the convex-NQ-vol implied thesis. Whether the implied NQ vol at 30th-percentile is priced to compensate for that 50% tail — or mispriced to compensate only for the modal 50% — is the specific question a trade structure would answer.

§10 · Risks & Monitoring
## What could *falsify* this read

Every thesis worth stating has explicit falsification conditions. This section enumerates the six most important failure modes of the “Asymmetric Conviction” reading, followed by a monitoring dashboard of the specific indicators that, if they move, should shift the weights attached to the scenarios in Section 9.

### 10.1Six failure modes of the thesis

01 · Vol-Selling Saturation
NQ vol stays cheap because it structurally can't rise
Passive short-vol flows — put-writing ETFs, volatility-controlled equity mandates, dealer vol-hedging dynamics — have grown so large that NQ implied vol is suppressed regardless of macro risk. The signal reads as “cheap” because structural supply exceeds demand, not because the macro outlook is benign. Falsifies: Scenarios A/B/C; implies the asymmetry persists without resolution. **Watch:** realized-implied spread; dealer gamma positioning.
02 · Rates Vol Decay
The rates event passes without incident
July and October FOMC meetings deliver expected outcomes. SR3 RR and butterfly decay into the expiries. The thesis was technically correct — the rates market was pricing an event — but wrong about the direction of mispricing because the event was resolved benignly. **Watch:** SR3N26/V26 vol post-FOMC; whether SR3 RR peak persists or fades post-meeting.
03 · Asymmetric Resolution
Rates events come to pass but don't transmit
Scenario C materializes — rates move meaningfully but equity absorbs without stress because the specific moves happen to be equity-benign. This is plausible if the July cut is larger than expected *and* driven by falling inflation (dovish-growth-positive), the cleanest possible setup for NQ. **Watch:** front-end realized vs SR3N26 IV on FOMC day; NQ vol response in the 3 sessions after.
04 · Regime Flip
Cross-asset context changes between now and event date
Gold vol lifts. FX vol lifts. Credit spreads widen. Any of these would signal a regime shift from “rates-specific repricing” to “general risk-off,” which would *validate* the thesis but through a different mechanism than the rates-transmission-to-equity story. The trade works but for a different reason. **Watch:** GCVL, EUVL, HY OAS, DXY.
05 · Data Mining
The divergence is a selection artifact
Rates-equity vol divergences exist all the time in small sizes. A biased observer, looking hard at a specific moment, might be pattern-matching noise. The thesis is particularly vulnerable to this if the %ile readings are highly sensitive to lookback choice. **Watch:** alternative lookback windows (60d, 90d); whether readings are consistent across window choices.
06 · Implementation Cost
The edge exists but is smaller than frictions
Bid-offer spreads on NQ options, gamma-hedging costs, and theta burn may exceed the expected value of the implied divergence. This is not a thesis failure but an execution failure — the idea is right, the P&L is wrong. **Watch:** explicit carry estimates; bid-offer at entry; theta/vega at the structure level.
### 10.2Monitoring dashboard — the six indicators

The six indicators below should be monitored daily. Movement in any of them, beyond the stated threshold, constitutes a signal to update the scenario weights in §9 and — if meaningful — to reassess the thesis wholesale.

SR3N26
ATM vol
Current ~55 bp. **Trigger:** sustained sub-50 or above-60.
SR3V26
25d RR
Current +8 bp vol. **Trigger:** breach of ±4 bp from here.
NQM26
ATM vol
Current 19.8. **Trigger:** 22+ validates; 18- weakens thesis.
NQU26
Term kink
Currently smooth. **Trigger:** +0.5 hump appears = NQ waking up.
TUVY
2Y yield CVOL
Current 103.87. **Trigger:** >110 = escalation; <95 = decay.
GCVL
Gold CVOL
Current 25.89. **Trigger:** >32 = regime flip to stress.
Closing Diagnostic Note
The value of a framework like the five-lens method is not in its individual outputs — each is available to anyone with a CME Group account and an afternoon. The value is in the *compression*: fifteen data points reduced to one coherent picture, with explicit weights, explicit falsifiers, and explicit monitoring triggers. The reader can disagree with the weights in Section 8 or the scenarios in Section 9 while accepting the fifteen underlying readings. That is what analytical transparency looks like.

One more thing worth saying. The divergence documented here — rates options pricing binary events that equity options entirely ignore — is not unprecedented. Similar readings appeared in *late 2007* (rates vol elevated, equity vol cheap into early 2008), in *early 2020* pre-COVID, and in *Q4 2018* around the Powell pivot. The subsequent equity-vol dynamics in each case were extreme. This is not predictive — three observations do not make a pattern. It is worth noting.

Appendix · References
## Methodology, glossary, and sourcing

### A.1Methodology

All pricing data in this report comes from CME Group's QuikStrike / QuikVol toolkits, available free of charge with a CME Group account at cmegroup.com/tools-information/quikstrike. Specific tools used: Open Interest Heatmap (§2), CVOL Dashboard (§3), Volatility Term Structure (§4), Volatility Cones · At-the-Money / Risk Reversal / Butterfly (§5, §6). Reference date throughout: **21 April 2026**, using end-of-day settlement prints. All “30-day” distributions are rolling 30-calendar-day windows ending on the reference date (i.e., 21 March — 21 April 2026).

The five-lens framework is the author's organizing principle, not a CME-defined methodology. Its sequence — positioning, aggregate vol, term structure, cones, skew — reflects an ordering of increasing inferential power: the later lenses require the earlier ones to interpret. Specific numerical claims in the main text (e.g., “SR3V26 RR in the 90th percentile”) are visual-eyeball reads from the QuikStrike charts; precision is at the bp-vol level for rates and vol-point level for equity. Values in tables are pulled directly from cited screenshots.

### A.2Glossary of terms

ATM (At-the-Money) An option whose strike equals the current underlying forward. ATM implied vol is the market's central estimate of forward realized vol. Basis Point (bp) Volatility The natural unit for rate-products vol, as opposed to price-vol (the natural unit for equities, commodities, FX). 70 bp of vol means a one-standard-deviation annualized rate move of 0.70 percentage points. Butterfly (BF) Average of call-wing and put-wing implied vols minus ATM vol. Measures the “fatness” of the vol smile's tails — how much more the market pays for OTM options than for ATM after controlling for directional skew. Contango (in vol term structure) Upward-sloping implied vol curve from short- to long-dated expiries. Normal state: more time allows more shocks to accumulate. CVOL CME Group's Cross-asset Volatility index family. A 30-day constant-maturity implied vol index computed via uniform methodology across all major listed futures products, enabling cross-asset temperature comparisons. Delta (δ) An option's sensitivity to underlying price moves, per $1 of underlying change. Ranges 0-1 for calls, -1-0 for puts. “25-delta” = the option with delta of 0.25, i.e., OTM. Gamma An option's rate of change of delta with respect to the underlying. Highest at the money. “Gamma walls” are strikes with heavy short-gamma positioning — market-makers must hedge aggressively there. Implied Volatility (IV) The volatility input that, when plugged into an options pricing model, produces the observed market price. IV is forward-looking, inferred from live prices. Open Interest (OI) Total number of live, unsettled option contracts at a given strike / expiry. A stock variable. Not to be confused with volume, which is a flow. Risk Reversal (RR) 25-delta call implied vol minus 25-delta put implied vol. Captures the directional skew of the vol smile. Sign convention varies by product. Smile / Skew The shape of implied vol as a function of strike. “Smile” = U-shaped (fat tails both sides). “Skew” = asymmetric (one tail fatter). Decomposed via RR and BF. SOFR (SR3) Secured Overnight Financing Rate. SR3 futures are 3-month SOFR-compounded-rate contracts. Price quoted as 100 − rate. Sign convention critical for RR interpretation. Vol Cone A visual tool plotting today's implied vol at each tenor against its own 30-day historical distribution (bands for 5/95, IQR, and mean). Converts absolute vol into percentile placement.
**Disclaimer** This report is a research note, not investment advice. It reflects the author's analytical framework and reading of public market data as of 21 April 2026. The scenarios, probability weights, and implied trade structures are illustrative of the analytical method; they are not recommendations. Options strategies involve substantial risk including loss of full principal. CME Group QuikStrike data is owned by CME Group. No endorsement, no affiliation. Reference to specific contracts (SR3, TN, NQ) is for analytical purposes only. Readers should conduct independent due diligence and consult qualified professionals before acting on any view discussed here.
Colez *Trades* · Issue 07 · 21 April 2026 · Quantitative & Macro Education Published for the channel · Not for redistribution