# Layer interfaces — what each layer hands the next (compliance action A1)

Lesson 3 §01: "a layered design gives each layer one job, **specifies what passes between layers**, and allows each to
be developed, tested and replaced without disturbing the others." This is that specification. A layer may change its
internals freely; changing anything in its **output** contract is a change to every layer below it and needs a dated
amendment here first. Units: σ_d = daily volatility as a fraction of price; "session" = London date (plans/DATA_SPEC.md).

| from → to | what passes | exact form | produced by | timing |
|---|---|---|---|---|
| **1 Data → all** | bars, sessions, realised values, sources | M1 OHLC (UTC); NY-close daily bars (`nyCloseDailyBars`, n ≥ 60); London session = London midnight → next; realised OH/OL/HL/\|OC\| % of the London open; event tag per session | `plans/DATA_SPEC.md`, `scripts/data_integrity.mjs` | bars closed before the session open |
| **3 Volatility → 4, 5, 6, 7** | the day's σ and the ladder | `σ_d` (HAR-800, `forecastSigma(last 800 NY-close bars, 'har_rv_log')`); ladder `{oh, ol, hl, oc} × {p50, p75, p90}` in % of the open = width × σ_d × 100 (`js/forecastLadderParamsHar800.js`); regime = σ_d ÷ its trailing 250-session median | `js/harShadowCore.js` `ladders()`; research `forge/run_ladder_candidates.py` | before the London open |
| **4 Path map → 5** | which conditions matter for what happens at a line | a finding, not a number: no direction at the lines in any of 314 cells; time left is the variable that moves outcomes. Layer 5 therefore conditions on **time** and **σ**, not on line touches | `forge/PATH_MAP_SPEC.md` | — |
| **5 Remaining travel → 6, 7** | how far price can still go from a checkpoint | at London checkpoint h ∈ {1,3,…,19} (21 flagged): `travel_q(side) = mult[class][h][side][q] × σ_d × open`, q ∈ {p50, p75, p90}, side ∈ {up, down}; implied reach probabilities 50 / 25 / 10% | `js/remainingTravelParamsR3.js`, `travelLevels()` | at the checkpoint, from the last closed bar |
| **6 Confidence → 7** | how likely layer 5's reach call is today | `P(reach q on side)` for q ∈ {p50, p75}, calibrated probability; default = layer 5's base rate when the model is not validated (currently: default) | `analysis/pathmap/confidence_fit.py` (M2 recipe, frozen) | at the checkpoint |
| **7 Sizing & risk → positions** | how much to hold and what a stop really costs | position size = risk budget ÷ (stop distance × loss-given-stop(condition)); σ-targeted exposure = target ÷ σ_d (capped 2× normal); loss-given-stop from `stop-risk.json` (see `plans/SIZING_RULE.md`) | `forge/VOL_TARGET_PREREG.md`, `forge/STOP_RISK_PREREG.md` | at entry |
| **(primary direction) → 6, 7** | which way, if any | not built — no lesson has supplied it. Layer 6 is ready to meta-label it; layer 7 sizes it | — | — |

Contract tests: the shadow screen (`har-shadow.html`) is the live consumer of layers 3 and 5; any change to their
output shape must keep `js/harShadowCore.js` working, and the lockbox (`forge/LOCKBOX_PROTOCOL.md`) freezes the
current contract until its evaluation.
