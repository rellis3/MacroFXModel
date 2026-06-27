# Concept Brief: AgroVol as a Seasonal Ag-Vol Relative-Value System

> Status: **concept / discussion**, not a build order. This reframes the existing
> AgroVol dashboard (`agrovoldocumentation.md`) from a weather→price *direction*
> tool into a **seasonal implied-volatility relative-value** system that reuses
> the MacroFXModel forecast baseplate. It also states, honestly, where the edge
> probably is and where it probably isn't. Read alongside `SYSTEM_ASSESSMENT.md`
> (the "strong research, not yet proof" verdict applies here too) and
> `CODEBASE_OVERVIEW.md` §5 (the vol/range forecasting stack this would plug into).

---

## 1. The reframe in one line

AgroVol today forecasts **direction** ("heat in June → prices rocket in August").
The stronger, more defensible version trades **the mispricing of seasonal implied
volatility**, conditioned on a weather/ENSO stress state — i.e. *sell rich
insurance in benign-ocean years, buy cheap insurance when the market is
complacent*, around the fixed biological windows (corn pollination Jun–Jul, wheat
grain-fill May–Jun, canola/OSR flowering Apr–May, Australian grain-fill Sep–Nov).

Why the vol framing beats the direction framing:

| | Direction trade ("prices rocket") | Vol relative-value trade |
|---|---|---|
| What you bet | Long futures into a heat wave | Long/short options vega vs the seasonal IV curve |
| Who you compete with | Every ag desk's meteorologist, on the one variable they own | Far fewer players doing systematic vol-RV at small size |
| The crowding problem | The 7-day weather you can *see* is already priced | The *conditional richness* of IV is harder to price, less crowded |
| Repeatability | Needs a stress event each year to pay | The seasonal IV bump exists **every** year regardless of outcome |
| Matches our platform | Weakly (we don't have a directional ag engine) | Strongly (this *is* our σ→range/vol stack with a new state var) |

The doc itself already contains the better thesis (AgroVol §2): the CBOT corn IV
curve spikes Jun–Jul **every year regardless of conditions**, and is *systematically
rich in El Niño years relative to the actual probability of pollination failure*.
That sentence is the trade. Everything else is supporting intelligence.

---

## 2. The symmetry — this is the forecast core with a different σ

This belongs in MacroFXModel (not as a stray side-project) because it is the same
machine the platform already runs, with one substitution:

- **Brownian range stack** forecasts expected range conditional on σ. AgroVol
  forecasts expected range conditional on a **weather stress score**. Same object,
  GARCH σ swapped for an agronomic state variable. The v3 "forecast cone with
  upper/lower bounds" is our IS/OOS forecast band in a different costume.
- **The 4-component signal (weather + ENSO + seasonal + analog) is a
  `score → choice` selector** — the `dayTypeScore → selectStrategy` pattern
  CLAUDE.md blesses as the lego path, not the tunable-knobs overfitting path.
- **The seasonal IV curve is a vol term structure known in advance** — we already
  reason about term structure via √t (daily/weekly/monthly). The ag seasonal curve
  is the same shape with a crop-calendar overlay instead of √t.
- **In "how do I add commodities" terms, AgroVol IS the T1 macro driver for
  grains.** Oil's T1 is inventory surprises; copper's is China PMI; corn/wheat/
  soy/canola's T1 is weather + ENSO. That tier is what AgroVol computes.

So the reuse map is: weather stress score → state var feeding the **forecast
core**; ENSO + seasonal + WASDE-calendar → the **selector / gate** (the way
RegimeV2 gates around FOMC); the options book → a **new instrument class** behind
the same `summarizeSplit` honest-harness reporting.

---

## 3. Does it have an edge? — honest verdict

**Short answer: there is a plausible, real, but small and unproven edge — and it
lives in the vol-RV framing, not the directional one. I would not put capital on
it yet; I would spend a research spike trying to *kill* it.**

Reasoning, separated into what's likely real vs likely illusory:

**Likely real (where I'd look):**
- The **seasonal IV term structure is a genuine, documented, persistent feature** —
  not a fitted artifact. A model that systematically harvests the difference
  between *priced* seasonal vol and *realized* seasonal vol has a credible prior.
- **ENSO conditioning is the differentiator.** El Niño/La Niña phase has measurable,
  lagged, cross-country crop effects (Cashin, Mohaddes & Raissi, *"Fair weather or
  foul?"*, J. Int. Econ.). Conditioning IV richness on ocean state requires fusing
  climate science with options pricing — that synthesis is genuinely harder and
  less crowded than directional weather-watching.
- **The trade is repeatable** because the seasonal vol bump recurs every year; you
  don't need a drought to get paid, you need IV to be mispriced relative to
  conditional risk.

**Likely illusory (where the edge probably isn't):**
- **"I can predict the weather/price better than the market."** No. Cargill/ADM/
  Bunge run real weather desks and own the physical-flow information edge. Any edge
  premised on better weather data is a mirage at our scale.
- **The directional analog forecast.** Six hand-encoded dramatic events + one
  "normal year" is hindsight-selected, tiny-N, and the known seasonal pattern is
  already priced. As a *trade*, this is the weak half.
- **2022-style hits.** A model long on "weather" that's actually being carried by
  geopolitics (Black Sea closure) is right for the wrong reason — a dangerous
  false positive that inflates apparent edge.

**Honest probability call:** I'd put maybe a 30–40% chance that a disciplined
vol-RV version survives realistic OOS testing with an edge large enough to clear
options transaction costs and capacity limits — and a <10% chance the *directional*
version does. That's "worth a research spike," not "worth capital." The single
fact that would move me most: whether, on real historical options IV, ENSO-state
conditioning separates rich-IV from fair-IV windows out-of-sample. We can't answer
that today because we don't have the options data (see §5).

---

## 4. What would have to be true (the falsifiable claims)

State these up front so we can try to break them, per CLAUDE.md's OOS discipline:

1. **Seasonal IV is harvestable after costs.** Selling the Jun–Jul corn vol bump
   (delta-hedged) is net-positive across a 20+ year sample after realistic options
   spreads/slippage — *not* just in calm years cherry-picked ex-post.
2. **ENSO state adds information.** Splitting the sample by ocean phase improves the
   vol-RV Sharpe out-of-sample vs an unconditional seasonal short. If conditioning
   doesn't beat the unconditional version OOS, the weather machinery earns nothing
   and we should drop it.
3. **The weather stress score has incremental value beyond the calendar.** The live
   7-day reading must improve forecasts vs "it's July, so vol is high" — otherwise
   we're paying for an API to re-derive a calendar.
4. **It clears a real min-N bar.** ≥30 independent OOS events per claim (CLAUDE.md),
   counting *windows*, not days — which is the hard part: one corn season = one
   observation, so 20 years ≈ 20 obs per crop. Cross-crop / cross-country pooling
   is how you get N up, and that pooling needs to be justified, not assumed.

If 1 and 2 both fail OOS, there is no system here — just a nice dashboard.

---

## 5. Data you'd need (and the gating gap)

| Need | Why | Have it? |
|---|---|---|
| **Historical options IV surface** (CBOT corn/wheat/soy, ICE canola, MATIF rapeseed) | The entire vol-RV thesis is untestable without it. This is the gate. | ❌ — CME/ICE APIs need keys + server-side proxy (AgroVol roadmap "Future") |
| **Historical weather, 1940–present** (Open-Meteo archive) | Build a real distribution of growing seasons instead of 6 anecdotes; calibrate the stress score OOS | ❌ — on AgroVol roadmap, free, **highest-leverage item** |
| **WASDE / Crop Progress calendar** (USDA NASS QuickStats) | WASDE is the ag NFP — the scheduled IV-reset catalyst; must be gated like FOMC | ❌ — free API key; on roadmap |
| **ENSO / Niño-3.4 history** (NOAA CPC) | Component 2 conditioning variable; needs a clean historical series, not the current hardcoded snapshot | ⚠️ partial — currently manual monthly |
| **Futures settlements 1980–2024** | Realized-vol target + roll/seasonality structure | ✅ partially encoded in AgroVol v3 |
| **Forecast core + honest harness** | `forecastCore.js`, `summarizeSplit` — reuse, don't reimplement | ✅ in repo |

The critical path: **historical weather archive + historical options IV.** Without
the second, claims 1–2 in §4 cannot be tested and this stays a dashboard.

---

## 6. Honest risks specific to this (beyond the platform-wide ones)

- **Horizon mismatch.** Input weather horizon is 7 days; price/IV lag is 4–8 weeks.
  The weather you can see is already partly priced; the edge lives beyond the
  forecast horizon, where you have only the coarse ENSO signal. The live-weather
  scenario *feels* most real-time but is the *weakest* for seasonal positioning.
- **Compound-shock misattribution.** The model must tag when weather *isn't* the
  driver (2022 geopolitics), or it will bank lucky directional hits as "edge."
- **Capacity & instrument friction.** Ag options are thinner than ES/corn futures;
  vol-RV at size moves the market. This is a small-capacity edge at best.
- **It's a separate book.** CBOT sessions, monthly contracts with roll/expiry (not
  spot CFDs), WASDE calendar, different broker/clearing. This is a **sister
  platform that reuses our vol/selector baseplate**, not a bolt-on to the FX bots.
  Scope it honestly before committing.
- **Crowding.** This is a known institutional discipline (ag CTAs, vol desks). The
  edge is not the idea — it's executing the conditional vol-RV cleanly at a size
  the big players ignore.

---

## 7. The gurus / bodies of work to stand on

- **Cashin, Mohaddes & Raissi — "Fair weather or foul?"** (macro effects of El
  Niño): validates ENSO as a real, lagged commodity-price driver.
- **Theory of storage / convenience yield** (Working, Kaldor; Hilary Till's EDHEC
  commodity work): where seasonality actually expresses — old-crop vs new-crop
  spreads, the "weather premium."
- **The ABCD houses** (Cargill, ADM, Bunge, Louis Dreyfus): the information-edge
  incumbents — the reason our edge must be vol-RV, not weather-prediction.
- **WASDE / USDA NASS**: the scheduled-catalyst calendar; treat like FOMC.
- **Rob Carver** (*Systematic Trading*), **Andreas Clenow** (*Following the Trend*):
  how to size and combine a diversified futures/vol book honestly with costs.
- **Lobell et al., Nature Climate Change 2013** (already cited in AgroVol): the
  agronomic coefficient backbone — keep it, but treat it as a prior to test, not a
  truth to assume.

---

## 8. Suggested next step (still no build)

A **research spike**, not a system build, gated on getting two datasets:

1. Pull the free **Open-Meteo historical archive** + **NOAA Niño-3.4 history** and
   reconstruct the weather stress score for every corn season 1990–2024.
2. Source **historical CBOT corn options IV** (even monthly snapshots / a vendor
   sample) — this is the gating dependency; without it, stop and say so.
3. Test §4 claims 1 and 2 *only* — does selling seasonal vol pay after costs, and
   does ENSO conditioning improve it OOS — through `summarizeSplit`, IS/OOS, ≥30
   pooled windows. Report the realistic number even if it's flat.
4. If both clear: write the V1 engine as a new versioned file + page + route per
   the CLAUDE.md checklist, reusing `forecastCore.js`. If either fails: keep
   AgroVol as the excellent intelligence dashboard it already is, and don't trade it.

The goal of the spike is to *try to kill the edge cheaply*. If it survives an
honest attempt to falsify it, that's the first real evidence — which is exactly
the "research → proof" gap `SYSTEM_ASSESSMENT.md` says the whole platform needs.
