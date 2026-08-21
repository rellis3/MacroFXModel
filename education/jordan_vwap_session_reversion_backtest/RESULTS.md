# VWAP Session-Transition Reversion — 26 Pairs, 2016–2026 (NULL)

A mechanised, honestly-pinned test of a specific, repeated personal pattern
from `education/jordan_video_transcripts/JORDAN_VIDEO_INSIGHTS.md`'s "VWAP
session-transition reversion (London → New York)" entry — **not** the
already-tested-and-null VWAP ± 2σ band family in
`MD files/VWAP_REVERSION_FINDINGS.md`. Engine:
[`js/vwapSessionReversionV1Engine.js`](../../js/vwapSessionReversionV1Engine.js).

---

## What this is and isn't

**Isn't** a re-run of `VWAP_REVERSION_FINDINGS.md`. That engine
(`js/vwapReversionEngine.js`) tests whether a stretch to a ±k·σ VWAP band, at
any time of day, reverts — a volatility-band-touch hypothesis. It found a
definitive null (0/26 pairs OOS-positive, no gross edge).

**Is** a mechanically different idea, stated twice independently by the same
speaker across two transcripts:

> "After a decent directional move during the London session, look for price
> to move back toward VWAP as the market transitions into the first 3-4
> hours of New York." (video 2, reconfirmed live on a 3-minute chart in
> video 18)

No σ-band touch is required or checked here — the trigger is the **session
handoff itself**: whatever direction London moved, bet on reversion toward
the day's VWAP specifically as NY opens. Genuinely distinct enough from the
σ-band family that the existing null doesn't settle it either way, per this
repo's own "everything is null but needs reviewing with a different context"
rule (`MD files/CLAUDE.md`).

---

## The rule, exactly as pinned (every judgment call named)

| Element | Mechanised as | Pinned choice |
|---|---|---|
| Session windows (UTC, no DST adjustment — stated limitation) | fixed hour boundaries | London = 07:00–13:00, NY-transition entry window = 13:00–17:00 (the stated "first 3-4 hours of New York") — deliberately **not** this repo's own unrelated `classifySession` "NY" bucket (16:00–22:00 there); Husky's wording describes the London/NY overlap and NY open, which is 13:00 UTC onward |
| "Decent directional move" | signed % change, day open → close of the last bar before 13:00 UTC | **Baseline = zero-DOF**: any nonzero move qualifies, no magnitude threshold (`MD files/CLAUDE.md`'s "start with the minimal-DOF version" rule); a magnitude-gated sensitivity variant is reported separately |
| Direction | fade the London move | London up → sell toward VWAP; London down → buy toward VWAP — the literal reading of "look for price to move back toward VWAP" |
| Entry | guaranteed fill at the 13:00 UTC bar's own OPEN, via `forecastCore.walkBars` with `entryType:'stop'` | the session transition itself is the trigger — nothing to wait for a confirmation bar on, unlike a level-touch entry |
| Target | session VWAP (`vwapReversionEngine.computeSessionVwap`, tick-volume-weighted, reused not re-derived) as of the entry bar, **lag-one** | identical no-lookahead convention to the sibling VWAP engine |
| Stop | ATR(15m, 14) × 1.5, built causally from bars strictly before entry | the group's own stated stop convention, already logged repeatedly in the transcripts ("ATR-based initial stop-loss sizing") — reused rather than inventing a second volatility unit |
| Exit window cap | 17:00 UTC | if neither TP nor SL is hit by then, marked to that window's final bar's close — no assumption an unresolved trade would have hit its target later |
| Trade cadence | one trade/day, the only setup | inherently a once-daily session-handoff pattern, not a level search |

No lookahead: the London move only reads bars strictly before 13:00 UTC; the
VWAP target is lag-one; the ATR stop is built from bars strictly before the
entry bar; the fill/exit walk never sees bars beyond 17:00 UTC. Costs on by
default: 0.012% round-trip for FX, 0.020% for gold (commodity class) — same
figures the sibling VWAP and Jordan-derived engines use.

**Sanity-checked on synthetic data before touching real data** (per this
repo's "assume code failure first" rule): a synthetic series engineered to
rise through London then revert during the NY window correctly produced SELL
(fade-the-rise) trades at 100% win rate — confirms the direction/entry/target
wiring is correct before any null is trusted.

---

## Data

26 pairs, real OANDA M1, 2016–2026 — the same instrument set and window
`VWAP_REVERSION_FINDINGS.md` used, for direct comparability: `usdjpy gbpusd
gbpjpy usdcad eurusd nzdusd audusd usdchf euraud eurchf eurcad eurjpy audjpy
audcad gbpaud eurnzd gbpchf gbpcad audnzd chfjpy cadjpy gbpnzd eurgbp nzdjpy
gold audchf`. Sourced via `loadM1ForPair` (R2 cache,
`VolRangeForecaster/data/m1/`).

---

## Headline result — null, pooled across all 26 pairs

Baseline (zero-DOF move threshold), costs on, true 60/40 IS/OOS split:

| Mode | Pooled n | Full mean/trade | Full t | OOS n | OOS mean/trade | OOS t | OOS win% | pairs OOS-Sharpe-positive | median pair full Sharpe |
|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|
| Session-transition fade | 57,402 | **−0.0123%** | **−18.8** | 22,972 | **−0.0104%** | **−9.9** | 46.7% | **1 / 26** | −1.150 |

Every one of the 26 pairs is negative on full-sample Sharpe. The one
OOS-positive pair (`nzdusd`, Sharpe +0.167) is a marginal, unremarkable
outlier in a field of 26 — not evidence of a real subset edge (per this
repo's "pooled nulls hide subset edges, but count the cells and state the
chance-baseline" rule: 1 mild positive out of 26 is exactly what noise
produces).

### There is no gross edge either — this is the same shape as the σ-band null

Backing out the 0.012%/trade FX cost, the **pooled gross mean across all 26
pairs is +0.00002%/trade** — indistinguishable from zero, scattered ±small
around zero with no consistent sign pair-to-pair (range: −0.0099% to
+0.0047%). This is not "a real edge killed by transaction costs" — it's "no
signal, ever," and the entire net-negative result (t = −9.9 OOS) is the
0.012% round-trip cost applied to a coin-flip. **The identical pattern
`VWAP_REVERSION_FINDINGS.md` found for the σ-band family** ("gross mean ≈
−0.0015%/trade — indistinguishable from zero") — now replicated for a
genuinely different VWAP-based hypothesis on the same data.

### Sensitivity — gating on move magnitude doesn't rescue it

Husky said "a **decent** directional move," not any move — the baseline's
zero-threshold default includes sub-pip noise as a qualifying "move." Ran a
magnitude-gated variant (`minMovePct = 0.15`, i.e. only trade when London
moved ≥0.15%) on 4 representative pairs:

```
                    baseline (any move)          minMovePct=0.15 ("decent" move)
              n     full.Sharpe  OOS.Sharpe    n     full.Sharpe  OOS.Sharpe
eurusd     2272        -1.498      -0.926    1494       -1.011      -0.256
gold       2202        -0.938      -1.378    1817       -0.752      -1.173
gbpusd     2326        -1.269      -0.938    1708       -0.967      -0.695
usdjpy     2206        -1.569      -1.050    1558       -1.292      -0.923
```

Every figure improves slightly (fewer, "cleaner" setups) but **stays
negative on both full and OOS Sharpe for all four pairs** — a real-but-
insufficient effect, the same "closest-to-breakeven-but-never-crosses-it"
shape already seen in the ATR-band engine's ADX-tightening sensitivity.
Requiring a "decent" move doesn't rescue the rule.

---

## Reading this against the rest of the repo

A third VWAP-based hypothesis from this transcript material, tested
honestly, lands in the same place as the first two:
`VWAP_REVERSION_FINDINGS.md`'s σ-band fade/bounce (0/26 OOS-positive, no
gross edge) and now this session-transition fade (1/26 OOS-positive, no
gross edge, pooled gross essentially exactly zero). Two mechanically
distinct ways of using VWAP as a mean-reversion target — one triggered by a
volatility stretch, one triggered by a session handoff — both come back
structurally coin-flip before costs, losing after them. Per this repo's
working rules: state the benchmark (buy-and-hold, a coin-flip) rather than
inflate a weak survivor — there is no survivor here to inflate. This closes
out VWAP as a standalone reversion signal in **every form actually described
across 18 transcripts** (σ-band and session-transition alike) — what
`VWAP_REVERSION_FINDINGS.md` already flagged as untested (VWAP as a
*conditioning filter* on an edge that already exists, not a standalone
trigger) remains the one open form, and it needs a validated primary edge to
condition, which this repo does not yet have intraday.

---

## Known limitations

- **Fixed UTC session hours, no DST adjustment.** London/NY real trading-
  session boundaries shift with US/UK daylight saving (not always on the
  same calendar dates); a ±1h fixed-hour approximation is used throughout,
  same simplification this repo already accepts elsewhere (`classifySession`
  in `volBacktestM1Engine.js`). Not expected to change the headline null
  given how uniformly negative every pair is, but not verified precisely.
- **The `walkBars` shared primitive labels an unresolved-but-positive
  window-end close as `outcome:'win'`**, indistinguishable in that field
  from a genuine TP hit. This is existing, repo-wide behaviour of the shared
  fill walker (not unique to this engine) and does **not** affect the
  reported Sharpe/PF/win-rate/gross-vs-net figures, which are computed from
  `netPct`/`grossPct` (real price returns), never from the `outcome` label —
  confirmed by direct inspection of per-trade gross/net pnl before trusting
  the headline numbers.
- **Target = session VWAP only, no fixed-RR variant tested.** A natural
  follow-up given the pooled-zero gross result — but a fixed-RR target
  wouldn't reference VWAP at all, so it would no longer be testing this
  specific hypothesis.
- **Direction-gate not tried the other way (continuation instead of fade).**
  Only the literal "revert toward VWAP" reading was built; a
  continue-with-the-London-move variant was not tested (would need its own
  separate justification from the transcripts, since nothing describes it).
- **One trade/day, first (only) qualifying setup** — inherent to the
  pattern (one London session, one NY handoff per day), not a relaxable
  parameter here the way it is in the other Jordan-derived engines.

---

## Reproduce

```bash
npm install   # hyparquet etc. aren't vendored; needed once per environment
node education/jordan_vwap_session_reversion_backtest/scripts/run_one.mjs eurusd education/jordan_vwap_session_reversion_backtest/data
node education/jordan_vwap_session_reversion_backtest/scripts/run_one.mjs gold   education/jordan_vwap_session_reversion_backtest/data
# sensitivity: run_one.mjs <pair> <outDir> <m1DirOrEmpty> <minMovePct> <slAtrMult>
node education/jordan_vwap_session_reversion_backtest/scripts/run_one.mjs eurusd education/jordan_vwap_session_reversion_backtest/data "" 0.15
```

Per-trade logs: `data/{label}.trades.json`. Summary cards (full/IS/OOS):
`data/{label}.summary.json`.
