# COG concepts and terminology

## His observed alert flow (NQ), UK local times

From `MD files/COG_OBSERVED_SYSTEM.md` §1:

1. **Data threshold 1**: VALID / INVALIDATED, any time 02:00–14:00.
2. **Data threshold 2**: VALID + stop % and risk %, Standard and Conservative tiers, ~13:30–14:00 UK (08:30 ET).
3. **Order filled**: Long/Short, just before the NY open.
4. **Closed**.

Example 2026-07-21: Standard 0.44% / 2.2%, Conservative 0.21% / 1.00%, SHORT at 14:26.
Inference (ours): he sizes to about 5× leverage (2.2/0.44 = 5.0; 1.00/0.21 = 4.76).

Published tearsheet (§3): 324 trades over ~5.4 years (~24% of weekdays), win 58.64%, Sharpe 2.32, max DD −21.94%,
hard loss floor −4.40%, avg win +4.88%, avg loss −3.06%.

## COG constants (his forecast lines)

Each line = constant × σ_daily (`js/cogReverseEngineer.js`):

| Line | COG | Raw Feller theory |
|---|---|---|
| HL p50 (BM_P50) | 1.56 | 1.572 |
| HL p75 (BM_P75) | 1.93 | 2.049 |
| OC p50 (HN_P50) | 0.74 | 0.7979 |
| OC p75 (HN_P75) | 1.24 | 1.284 |

HL = high − low, OC = |close − open|, both as % of the session open (see the `data-rules` skill for session
definitions).

## The COG σ gap

His σ cannot be rebuilt from price. He behaves like a shorter-half-life estimator than our YZ30. Gold has a level bias
of about 6% wider. **Rule:** don't re-tune our estimators toward COG; his lines are wider than realised.
(`MD files/COG_GAP_FINDINGS.md`)

## COG reference data

His daily lines are pasted from the vol-forecast "Ref" box into KV as `vol_reference_<date>` (72 days, 2026-06-11 →
2026-10-05 at last count) and served by `/api/vol-forecast/reference-dump`. This is the input to
`scripts/cog_setups/`.

## COG bands

`computeCogBands`, `bandMode:'cog'` has been the bot default since 2026-07-22. That is a consistency-with-COG product
choice, **not a validated improvement**. `bandMode:'feller'` reverts it. (`MD files/CLAUDE.md`)

## The shadow gates (`cog-replication/engine/cogShadow.js`)

- **G1 "tide"**: net liquidity = WALCL − TGA − RRP; its 20-business-day RoC gives the bias; an HY OAS move above +25bp
  over 4 weeks is a credit veto. NULL.
- **G2 "transmission"**: GEX gives the stop % and tier, stop clamped to 0.20–0.48%. Range effect REAL on NQ.
- **G3 "magnet"**: OI walls give direction and target. NULL.
- Trade only if `G1.bias === G3.direction`.

## Setups at his lines (`forge/COG_SETUPS_PREREG.md`)

- **A**: fade at OC p50 (0.74σ), stop at OC p75 (1.24σ), target halfway back to the open.
- **B**: London-midnight retest in the breakaway direction (breakaway ≥ 0.37σ, stop 0.1σ, target the p75 line).
- **C**: continue through the p50 line (spread prereg).

## C.OG's blue line

A SOFR-vs-**Euribor (ICE I2!)** spread indicator = (SOFR Sep26 − Euribor Mar27) in bp × 0.1 + 1.445, identified 2026-10-13 (RECONSTRUCTION.md §10); earlier notes said €STR — our inference from his video "Macro Variable Context Relevance" (16–23 Sep 2026), built in Python
and imported into TradingView. Not reconstructed (see verdicts). Notes:
`education/macro-variable-context-relevance-notes.md`.

## Stop choice (snippet 1, 2026-09-26)

Asked to choose from an MAE stop table, C.OG answered "none of the above". He picks the stop from a noise threshold per
look-back horizon (2 weeks to 12 months). The stop-distance sweep for this is **not built yet**.

- **Dealer hedging map** (2026-10-18): C.OG's ES strike chart (OI by strike, zero gamma, IV-shift fans, hedging line). Ours: `oi-dashboard-v2.html` 05c, `js/hedgingScenario.js` (re-prices the whole book per price × IV shift; hedge = futures dealers must trade to stay flat). Mechanics, not a validated signal; see `education/cog-snippets.md` §2.
