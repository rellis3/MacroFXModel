# ladder-event-layer-cb-fomc: layer 2 on the per-line base, central-bank and FOMC days only, judged forward

**Pre-registered 2026-11-24, before any session after 2026-08-21 was scored for this layer.**

| | |
|---|---|
| ID / ledger id | `ladder-event-layer-cb-fomc` |
| Register row | `plans/RESEARCH_REGISTER.md` → `ladder-event-layer-cb-fomc` |
| Source | Owner 2026-11-24: "build it up": layers on top of the base per-line calc, each removable, never overwriting the base. Follow-up named in `ladder-exhaustion-events` RESULTS (H2 UNDERPOWERED leaning; central-bank days −6.1% and FOMC −1.6% in both halves, the other buckets noise; layered p90 still beaten 19% / 15%) |
| Why a new test | The design (only these two buckets, less shrinkage) was chosen **after** seeing those results, so in-sample numbers cannot judge it. The judge is the sessions after 2026-08-21, which no part of this layer has seen |
| Instruments / lines | The 40 OANDA CFDs on the site's CFD QLIKE per-line export; HL, OH, OL, Close+, Close− |
| Seed | `20261124`, B = 2000 |
| Scripts | `scripts/ladder-event-layer-cb-fomc/` → `analysis/output/ladder-event-layer-cb-fomc/` |

## The layer (frozen here)

- **Base (layer 0, untouched):** the site's CFD QLIKE per-line levels (`js/ladderV2QlikeCfdParams.json`), exactly as the
  export computes them.
- **Layer 2:** on a session with an **FOMC decision** (every instrument) or a **central-bank decision of one of the
  instrument's own currencies** (ECB, BoE, BoJ, BoC, RBA, RBNZ, SNB; DE30 hears the ECB, UK100 the BoE; indices,
  metals and energy hear FOMC only), level_τ = base level_τ × m_τ. If a session has both, the CB multiplier is used
  (CB ranked above FOMC; ranking as `ladder-exhaustion-events`). Every other session: × 1 (base unchanged).
- m_τ per instrument, line, bucket and τ ∈ {50, 75, 90} = k_τ,b ÷ k_τ, with k_τ,b = (n_b · q_τ(x/σ | b) + **10** · k_τ) /
  (n_b + 10), q and k over 2018 → 2026-08-21 on that line's own sessions and its site calc (σ), dates from
  `scripts/ladder-exhaustion-events/events.py`. Written to `js/ladderV2EventLayerCfdParams.json`, its own file.
- Live dates come from the hand-kept bank calendars (`js/{fomc,ecb,boe,boj,boc,rba,rbnz,snb}Calendar.js`).

## The forward test (one look)

Sessions **2026-08-24 → 2026-11-23**, London 00:00–22:00. Base levels from the site
(`/api/vol-forecast/ladder-v2/levels?calc=qlike&track=cfd`), realised HL/OH/OL/signed close from OANDA M5 mid
(`--price M`), ≥ 120 bars a session. Event dates in the window come from the bank calendar files above.

Δ = mean over instrument × line cells of Σ pinball(layer 2) / Σ pinball(base) − 1, over the **event sessions** (the
layer is × 1 elsewhere, so all-session Δ is the same sign, smaller). 90% CI: bootstrap resampling **event dates**
with replacement (the instruments on one date share the shock), B = 2000.
- **VALIDATED:** CI upper < 0. **NULL:** CI lower > −0.5%. **UNDERPOWERED:** otherwise (expected likely: about 15
  distinct event dates).

**Descriptive:** share of event sessions beyond p50 / p75 / p90, base vs layer 2 (targets 50 / 25 / 10%); Δ by
bucket and line; the same in-sample (walk-forward 2020 → 2026-08, labelled in-sample, chosen after seeing it).

## What it changes

Layer 2 goes on the CFD export as a **switchable shadow layer** whatever the verdict (owner's build-up rule): each
line shows the base level and, on event days, the layer-2 level beside it, labelled with this verdict. The Pine
overlay gets an "event layer" tick box. The base and the live ladder are unchanged. VALIDATED → the tick box
defaults on; otherwise off. Removing the layer returns the base exactly.

## Amendments
