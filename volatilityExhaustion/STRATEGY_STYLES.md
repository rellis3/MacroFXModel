# A library of trading styles off ONE volatility forecast

The forecast is a **magnitude / range / risk map** (direction-agnostic, OOS-calibrated). It is
not a reversion signal — reversion is just the most obvious (and weakest after-cost) use. The
real leverage is using the forecast + a **regime switch** to route to the *right style* each
day, and to *size* it. This file tracks the styles, each validated on the same costed IS/OOS
rig (M1 cache, 6 FX majors).

## The regime switch (the spine)
The Phase-3 **daytype classifier** (expansion vs contained, OOS AUC 0.68 — validated) is the
selector. Transparent causal rule: EXPANSION if the prior day blew its 75th OR σ is
accelerating (>1.10× the prior-5 mean).

## Style results (after-cost, OOS, pooled FX)

| style | when | entry | OOS edge | verdict |
|---|---|---|---|---|
| **Fade (USD-aligned), BROAD zones** | any | fade decision-engine zones (pivots/S&R/ladders) WITH the USD trend | **+0.71 bp** aligned vs −3.61 opposed (6/6) | real filter, thin after slip — **zone-specific** |
| **Fade (USD-aligned), MEDIAN line** | contained | fade the forecast median WITH the USD trend | aligned **−0.046%** vs opposed −0.038% — **backwards, both lose** | edge does NOT transfer to the forecast line |
| **Breakout** | EXPANSION days | stop through the 75th, ride it | **≈ breakeven** (−0.00 to −0.003%) vs blind −0.018%, contained −0.030% | switch real, edge thin |

> **Universe caveat (learned the hard way, `combined_book.py`).** The USD-aligned fade edge lives
> on the decision-engine's **broad zones**, NOT the forecast median/75th line — on the median
> line it's if anything reversed. The two validated pieces (broad-zone USD-fade, forecast-line
> breakout) were measured in **different universes and don't compose**: routing them on the
> forecast lines (breakout-on-expansion + median-fade-on-contained) gives **−0.0245% OOS —
> worse than breakout-always (−0.0185%)**, because the median-fade component is a net loser
> regardless of USD alignment. A real combined book would have to route breakout (forecast
> lines) + USD-fade (broad zones) — a cross-system build, and both are thin. Verification note:
> the first combined_book run had a fill-selection bug (compared fill-index to a bool); caught
> by reconciling against the vetted `_day_trade` (−0.0323% match) before trusting any numbers.

**The switch works.** Breakouts are cleanly better on expansion days than contained days
(monotonic OOS: expansion > blind > contained, all 3 exit configs, win 46%→48%); fades are the
reverse. The daytype classifier is a genuine **strategy selector** — it routes breakouts to
expansion days and fades to contained days, both OOS-confirmed.

**But each individual style is a thin after-cost edge** (FX reality at this frequency):
USD-aligned fade ≈ +0.1–0.4 bp after slippage; expansion breakout ≈ breakeven. The value is
the **system**, not any one style: one forecast → route to the regime-appropriate style →
*avoid the anti-cases* (fade-on-expansion and breakout-on-contained both lose ~−0.03%).

## The architecture (validated in structure)
```
        vol forecast (magnitude/range, OOS-calibrated)
                        │
              daytype classifier (regime)
              ┌─────────┴─────────┐
        CONTAINED               EXPANSION
        fade the line           breakout the 75th
        (USD-aligned only)      (ride the thrust)
                   both sized by σ (vol targeting)
```

## Chop days & the efficiency gate (tested — NULL)
The switch predicts *size*, not *character* — a big-range day can be a clean trend OR a big
CHOP, and character isn't forecastable pre-open (Phase-3 direction/efficiency label AUC 0.505).
Small chop = a contained day (fade mode handles it); big chop = an expansion day that whipsaws
the breakout — the weak spot, and why expansion-breakout is only ~breakeven.

Tested whether an **intraday efficiency gate** (Kaufman ER open→break; take the break only when
the session is directional) dodges the chop-day entries: `breakout_efficiency.py`. **NULL** —
pooled OOS looks mildly positive (HI-ER +1.12bp vs ungated ~0, monotonic) but it's **1/6 majors
and EURUSD flips OOS** — cross-sectionally inconsistent = noise. M1-path efficiency is
noise-dominated (ER ~0.05–0.08). So chop can't be reliably gated out even intraday. The honest
defenses stay **management, not prediction**: σ-size down on expansion days, cut failed breaks
fast, don't double-chase the opposite break, let the clean-trend winners run to close.

## Roadmap (more styles / overlays off the same forecast)
- **σ-sizing / vol targeting** — size every trade inversely to forecast σ (universal, highest
  value, not yet wired into the book).
- **Vol-vs-implied (VRP)** — forecast realized σ vs EVZ/GVZ implied → long-gamma when
  forecast > implied, sell premium when <. Direction-agnostic; the HAR-IV data exists.
- **Session breakout** — Asia-compression → London-expansion (21/25 OOS, the most robust
  finding) as the intraday timing for the breakout style.
- **Per-pair specialization** — some pairs revert, some trend; let the cross-section pick.
- **Combined regime-routed book** — one equity curve: fade on contained, breakout on expansion.

Scripts: `breakout_expansion.py` (Style #2), `median_wt_gated_fade.py` / `crossAssetFit.mjs`
(Style #1 + USD filter), `daytype_classifier.py` (the switch).
