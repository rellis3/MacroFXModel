# Fade-the-extension trade — a colleague's reported rule, tested (2026-08-23)

Follow-up to [RESULTS.md](RESULTS.md). The owner reports (second-hand, not
directly observed) that a colleague trades this exact pattern — but as a
**fade**, not the continuation hypothesis §4 of RESULTS.md pinned: enter
counter-trend at one of the ladder rungs once price has extended **at least
~2 range-widths beyond the impulse candle's own edge** ("ranges 2+... less
than that is within the impulse"), targeting back toward **the impulse
candle's own median**. Script: [`scripts/fade_extension_trade.mjs`](scripts/fade_extension_trade.mjs),
engine: `simulateFadeTrade` in [`js/impulse4hRangeLevelsEngine.js`](../../js/impulse4hRangeLevelsEngine.js).

## The rule, exactly as pinned (every judgment call named — this is NOT
verified against the colleague's actual rule, which is second-hand and
incompletely specified)

| Element | Mechanised as |
|---|---|
| "Extended 2+ range-widths beyond the impulse" | Entry rung = fib **2.0** (bullish) / fib **−1.0** (bearish) — same bearish-mirror convention (`1 − fib`) already used elsewhere in this engine for the continuation-trade target |
| Direction | Fade = opposite the impulse (SELL a bullish impulse's extension, BUY a bearish one's) |
| Entry mechanism | Resting limit order at the rung, filled on first M1 touch, no confirmation — matches this group's own stated style ("resting-limit entries with no confirmation indicator", `JORDAN_VIDEO_INSIGHTS.md`) |
| Target ("median of the impulse") | fib **0.5** — direction-symmetric, no mirroring needed |
| Stop | The **next ladder rung** beyond the entry level (default 1 rung out, e.g. entry fib=2.0 → stop fib=2.5); a 1/2/3-rung grid was run since the owner separately asked what the "best SL" is here |
| Window | Same bounded per-impulse window already detected in `run_analysis.mjs` (until the next impulse or a 40-day cap) — reused as-is, no re-detection |

Not pinned/unknown from the colleague's actual practice: whether they enter
at exactly fib=2 vs. wherever price *reacts* somewhere beyond it, whether
they wait for a confirming candle, whether they filter which impulses they
take (macro bias, session, confluence with other levels), and how they
manage the trade (partials, trailing). This is one honest, low-DOF guess at
the rule as described, not a replication of it.

## Result — real, but doesn't survive being checked honestly

317–352 impulses per instrument; **44–51% of impulses actually extend far
enough to trigger the entry at all** (i.e. roughly half never reach fib≥2 —
consistent with RESULTS.md §2's finding that bigger impulses tend to extend
*proportionally less*, so plenty of impulses simply never qualify).

Full-sample and honestly split (60% IS / 40% OOS by date), 1-rung stop:

| Instrument | Trigger% | n (filled) | Full Sharpe | Full win% | IS Sharpe | OOS Sharpe | OOS win% |
|---|--:|--:|--:|--:|--:|--:|--:|
| Gold | 44.5 | 141 | 0.314 | 34.8 | 0.702 | **−0.104** | 26.3 |
| NAS100 | 50.7 | 170 | −0.625 | 25.3 | −0.161 | **−1.398** | 17.6 |
| EURUSD | 50.6 | 161 | −0.025 | 30.4 | −0.300 | **+0.333** | 38.5 |
| GBPUSD | 43.9 | 151 | 0.164 | 31.8 | 0.309 | **−0.076** | 32.8 |
| USDJPY | 50.8 | 179 | 0.124 | 34.1 | 0.238 | **−0.055** | 31.9 |
| AUDUSD | 49.4 | 168 | 0.077 | 29.8 | −0.054 | **+0.209** | 30.9 |
| USDCAD | 44.9 | 145 | −0.258 | 31.7 | −0.503 | **+0.172** | 36.2 |

Stop-distance grid (1/2/3 rungs out), IS Sharpe used to pick the "best" cell
per instrument **before** looking at its OOS number — the same
select-honestly discipline RESULTS.md §4 already used, because picking by
full-sample or OOS Sharpe leaks the answer into the selection:

| Instrument | Best rung by IS | that rung's IS Sharpe | that rung's OOS Sharpe |
|---|--:|--:|--:|
| Gold | 3 | 0.859 | **−0.467** |
| NAS100 | 3 | 0.515 | **−0.389** |
| EURUSD | 2 (all 3 rungs IS-negative; least-bad) | −0.010 | **+0.885** |
| GBPUSD | 1 | 0.309 | **−0.076** |
| USDJPY | 3 | 0.538 | **−0.303** |
| AUDUSD | 1 (all 3 rungs IS-negative; least-bad) | −0.054 | **+0.209** |
| USDCAD | 3 (all 3 rungs IS-negative; least-bad) | −0.114 | **+0.063** |

**Reading this straight, not around it:** on every instrument where the
in-sample half actually showed a positive Sharpe worth selecting on (gold,
NAS100, GBPUSD, USDJPY), the honestly-selected out-of-sample result was
**negative** — the apparent edge did not survive. The three instruments
with a positive OOS number (EURUSD, AUDUSD, USDCAD) all got there with a
**negative or flat in-sample Sharpe at every rung tested** — there was
nothing to genuinely select in-sample; those OOS numbers are not a
validated edge holding up, they're instruments where nothing looked
promising IS and something modestly positive happened to occur OOS. That
split — good-IS-produces-bad-OOS, bad-IS-happens-to-produce-okay-OOS — is
close to the signature of no real effect at all (noise around zero, plus
ordinary regime variation between the two halves), not evidence for this
specific pinned rule.

This mirrors RESULTS.md §4's own conclusion about the continuation-trade's
dynamic-stop grid, now independently reproduced on a different (fade)
rule and a wider instrument set: **an IS-good/OOS-bad pattern across a
stop-distance grid is this repo's recurring signature of an illusory
edge, not a real one.**

## What this does and doesn't mean

Doesn't mean the colleague's actual edge isn't real — it means **this
specific, second-hand formalisation of it isn't**. The gap between "a
discretionary trader has an edge" and "a naive mechanisation of the
described rule shows one" has already shown up once in this repo
(`education/jordan_impulse_range_backtest/RESULTS.md`, a different Jordan
pattern, also null when mechanised from screenshots). Plausible reasons this
formalisation misses whatever the colleague actually does: exact entry
level isn't necessarily 2.0 (could be wherever price *reacts*, or gated by
confluence with another level per `js/confluence-core.js`'s convention, not
a blind first-touch limit); no confirmation candle is required here, but a
real discretionary entry likely waits for a rejection; every qualifying
impulse is taken here, with no macro/session/selectivity filter a
discretionary trader would apply; and there's no trade management (partials,
breakeven, trailing) — this is win/target-or-stop, nothing else.

**Worth testing next, if more detail on the actual rule becomes available:**
a confirmation-gated entry (wait for a rejection candle at the level, not a
blind touch), gating entries by confluence with another level (reusing
`js/confluence-core.js`, the same machinery `entry-trigger-lab.html` uses)
rather than every impulse's raw fib=2 touch, and a session/day-of-week
filter given RESULTS.md §6 already found the 12:00–16:00 UTC bar dominates
impulse counts on every instrument.

## VWAP-gated variant — does filtering by distance-from-VWAP fix it?

RESULTS.md §5's strongest finding (distance-from-VWAP at the extension point
correlates with reversal size) was never used by the plain fade trade above
— it entered at fib≥2 regardless of where VWAP was. Tested here: gate
entries to only the setups where price is *further* from VWAP than usual at
the fill bar (median or top-third of the in-sample `|distance|`
distribution, vs. the ungated baseline), picking the gate by IS Sharpe
**before** looking at OOS — same discipline as the stop-rungs grid above.
Script: [`scripts/fade_extension_trade_vwap_gated.mjs`](scripts/fade_extension_trade_vwap_gated.mjs).

| Instrument | Gate picked by IS | IS Sharpe (picked) | OOS Sharpe (picked) | Ungated OOS Sharpe |
|---|---|--:|--:|--:|
| Gold | ungated (gating never looked better IS) | 0.702 | −0.104 | −0.104 |
| NAS100 | ungated (gating never looked better IS) | −0.161 | −1.398 | −1.398 |
| EURUSD | top-third | −0.135 | **−0.624** | +0.333 |
| GBPUSD | median | 0.320 | **+0.311** | −0.076 |
| USDJPY | top-third | 0.497 | **−1.049** | −0.055 |
| AUDUSD | ungated (gating never looked better IS) | −0.054 | +0.209 | +0.209 |
| USDCAD | median | −0.269 | **−0.741** | +0.172 |

**Reading it straight: this doesn't work either, and it isn't just neutral —
on 3 of 7 instruments (EURUSD, USDJPY, USDCAD) the gate that looked best
in-sample made the out-of-sample result measurably WORSE than just taking
every setup ungated**, including turning USDJPY's roughly-flat ungated OOS
(−0.055) into a clearly bad one (−1.049). On 3 more (gold, NAS100, AUDUSD)
gating never looked better than the baseline even in-sample, so nothing was
selected. **GBPUSD is the one instrument where the honestly-picked gate
also improved OOS** (−0.076 → +0.311) — one instrument out of seven is not
a cross-instrument finding, and is exactly the kind of single hit a
7-instrument × multi-gate sweep would produce by chance alone.

**Verdict:** RESULTS.md §5's VWAP-distance/reversal-size correlation is real
as a descriptive statistic — but turning it into an entry filter on this
specific pinned fade trade does not produce a validated improvement. If
anything, adding the gate made the failure of the base rule worse on the
majority of instruments tried, not better.

## Reproduce

```
node scripts/fade_extension_trade.mjs <pairKey> ../data <stopRungsOut>
# e.g.: node scripts/fade_extension_trade.mjs xauusd ../data 1
```
Reuses the impulses already saved by `run_analysis.mjs` (`data/<pair>.impulses.json`)
— only re-loads the M1 packed arrays, no re-detection.
