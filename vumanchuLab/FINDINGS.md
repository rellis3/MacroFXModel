# VuManChu Lab — slice 1 findings

Built 2026-07-30. Generalised conditional-probability analysis of VuManChu state
vs forward price, across asset classes and timeframes. **Descriptive terrain map,
not a strategy.** Nothing here is wired into a bot.

Instruments: `eurusd` (FX, 2016-01→2026-05, 3.75M M1 bars), `gold` (commodity,
2021-07→2026-07), `nq` (index, 2021-06→2026-06). Panels are stride-5 off the M1
grid — 750k / 353k / 351k rows.

---

## 0. A bug found and fixed first

Gold and NQ initially showed multi-timeframe agreement sitting *exactly* on its
chance baseline while EURUSD showed +43pp. That is a mechanical property of the
oscillator, so it should not differ by instrument — which flagged it as a bug
rather than a finding.

Cause: the M1 parquet caches carry **mixed datetime resolutions** — `eurusd` is
`datetime64[ns]`, `gold` and `nq` are `datetime64[us]`. The epoch conversion
`index.view('int64') // 10**9` is only correct for nanoseconds; on the
microsecond files it divided 1000× too far, collapsing every timestamp into a
few-second span and reducing the causal HTF alignment to noise. It raised
nothing — the columns were populated, finite, and wrong.

Fixed via a resolution-safe `epoch_seconds()` plus a **loud guard**: the panel
now asserts each timeframe's median `close_sec` spacing equals `tf × 60` and
raises otherwise. EURUSD's numbers were never affected.

---

## 1. The conditional structure is real, and it is mean-reverting

Every headline cell reverts. At h=60m, P(up) vs each instrument's **matched
(hour × vol-bucket) baseline**:

| cell | eurusd Δpp (t) | gold Δpp (t) | nq Δpp (t) | transfers |
|---|---|---|---|---|
| WT oversold (zone −1) | **+2.28** (8.1) | **+1.73** (3.8) | **+1.13** (3.5) | ✅ |
| WT overbought (zone +1) | **−2.17** (−7.4) | **−1.52** (−3.2) | **−1.22** (−3.9) | ✅ |
| stack all-bearish (1/5/15) | **+2.66** (6.8) | **+1.96** (4.0) | +0.84 (1.9) | ✅ |
| stack all-oversold (1/5/15) | **+5.30** (6.8) | **+3.76** (4.2) | +0.89 (0.9) | ✅ |

Standard errors are **batch means** over 40 contiguous time blocks, not binomial
— adjacent rows are minutes apart with overlapping forward windows, so a naive
SE would be roughly √(bars per block) times too small.

## 2. It survives the falsifier that kills most reversion results

The obvious artifact: WaveTrend is a function of `hlc3[i]`, and the forward
return is measured **from `close[i]`**. Noise in that one bar inflates the
oscillator *and* depresses the forward return through the same term, producing
a textbook mean-reversion signal that is entirely mechanical and untradeable.

`falsify.py` re-anchors the entry at `close[i+k]` while holding the state read
fixed at bar `i`. Pre-registered: collapse between k=0 and k=1 ⇒ anchor noise,
call it null.

| cell | k=1 | k=5 | k=15 |
|---|---|---|---|
| wt_zone | 91.1% | 70.2% | 45.9% |
| stack_side | **95.8%** | **85.2%** | **69.2%** |
| mf_sign | 88.8% | 65.9% | 44.4% |

No collapse. Decay is smooth and gradual. **It is not anchor noise.** Notably
the multi-timeframe cell decays *slowest* — consistent with it tagging a slower,
more persistent state rather than a one-bar blip.

## 3. Multi-timeframe agreement does add — roughly doubles the single-TF read

This was the engine output asked for, and it holds where the signal is strong:

- EURUSD: WT oversold alone **+2.28pp** → all three timeframes oversold **+5.30pp**
- gold: **+1.73pp** → **+3.76pp**
- nq: +1.13pp → +0.89pp (not significant; the index does not carry it)

Cost: the all-agree state is rare — `stack_zone` is comparable on ~2% of bars.

**Read the mode, not the headline.** Measured on real data, all three
instruments (independently confirming the fixture prediction in `js/vumanchuMtf.js`):

| mode | 1m vs 5m Δ vs baseline | 1m vs 15m Δ |
|---|---|---|
| `direction` | **−5 to −6pp** (BELOW chance) | −5pp |
| `level` | +11pp | +1 to +2pp |
| `zone` | +43pp (comparable ~10% of bars) | +8 to +11pp |

`direction` — the intuitive "are both waves rolling the same way" — sits *below*
its own chance baseline on FX, gold and index alike. That is differential
smoothing lag, not the timeframes fighting. **Do not build on `direction`.**

The agreement structure is near-identical across all three asset classes, which
confirms it is a property of the indicator's geometry, not of any market.

## 4. Money Flow adds essentially nothing beyond WaveTrend

MF alone is weakly directional (eurusd +1.17pp t=5.1; gold +0.96 t=2.0; nq +0.52
t=1.8, IS/OOS-inconsistent). But **conditionally it is flat** — splitting the
oversold cell by MF sign moves nothing:

| | eurusd | gold | nq |
|---|---|---|---|
| WT oversold | +2.28 | +1.73 | +1.13 |
| WT oversold **&** MF < 0 | +2.28 | +1.75 | +1.17 |
| WT oversold **&** MF > 0 | +2.25 | +1.21 | +0.47 |

So MF is largely a restatement of what WT already says. Caveat that cuts both
ways: OANDA `volume` is a **tick count**, not size traded, so this tests
activity-weighted candle direction, not real money flow. A genuine volume feed
is the only way to retest it honestly.

## 5. Cross-asset: same sign, different strength — FX > gold > index

The state means the same thing directionally in all three classes at h=60m. The
strength ordering is consistent: **EURUSD > gold > NQ**, with NQ weakest on every
cell and failing significance on the multi-timeframe ones. That is the expected
direction if an index's trend character dilutes short-horizon reversion, but
n=1 per class here — it is a lead, not a measured asset-class law.

## 6. The horizon: the effect lives at ~1h and is gone by a day

| horizon | eurusd wt_zone | gold | nq |
|---|---|---|---|
| 60m | +2.28 (t 8.1) | +1.73 (t 3.8) | +1.13 (t 3.5) |
| 240m | +1.12 (t 3.3) | +0.87 (t 1.1) | −0.15 (t −0.3) |
| 1440m | +0.23 (t 0.3) | +0.08 (t 0.1) | −0.57 (t −0.5) |

By 4h only EURUSD survives; by a day everything is noise.

## 7. Economics: nothing clears cost where the signal actually lives

Mean move per cell converted to pips/points against the round-trip spread from
`pylego.costs.DEFAULT_SPREAD_PIPS` (the table the live bots size off):

- **h=60m — 0 of 15 cells clear cost.** The best is `stack_zone`: EURUSD 0.85×,
  gold 0.91× round-trip. Close, but under.
- **h=240m — 4 of 15 "clear" cost, and every one of them has |t| < 2.** Every
  cell that IS significant at h=240 (all EURUSD) sits at 0.35–0.67× cost.

The clean statement: **the cells that are significant don't clear cost, and the
cells that clear cost aren't significant.** The structure is real; it is not a
standalone tradeable edge at these definitions.

---

## Honest summary

**Built and validated:** a causal feature panel + matched-baseline conditional
tables + an anchor-offset falsifier + cross-asset transfer. The brick is
golden-tested bit-for-bit against `js/vumanchuCore.js` (73 checks), so the panel
and the live chart cannot drift.

**Found:** VuManChu state carries a real, IS/OOS-consistent, falsifier-surviving
mean-reversion signal at ~1h that transfers across FX/gold/index with strength
ordered FX > gold > index; multi-timeframe zone agreement roughly doubles it;
Money Flow adds nothing incremental; `direction`-mode agreement is an artifact.

**Not found:** anything tradeable on its own. Best cell reaches 85–91% of the
round-trip spread.

**What this does NOT establish:** that the effect is monetisable with a better
exit, as a filter on an existing entry, or at a different horizon/parameter set.
Those are separate tests. A 2–5pp probability edge that does not clear a spread
is exactly the kind of thing that can still matter as a *sizing or veto input*
to a signal that already has its own edge — and exactly the kind of thing that
becomes a losing strategy if traded directly.

---

# Slice 2 — SHAPE, not snapshot (`shapes.py`)

Slice 1 conditioned on the wave's reading at a single bar. This conditions on
its **path** across all three timeframes, and scores **revert vs continue**
relative to the prior 60m move (not P(up)) — bars whose prior move is under
0.5σ are dropped, since "revert" is meaningless without a move. Baseline is
stratified on hour × vol × **prior-move size**, because shape correlates
strongly with how big the preceding move was.

Two encodings run side by side: a readable symbolic one (per timeframe, LEVEL
∈ OS/mid/OB × FORM ∈ rise/fall/turn-up/turn-down) and k-means over the raw
concatenated 3-timeframe trajectory. They agree, which is the point of running
both.

## S1. The law that emerged: alignment reverts, conflict does nothing

When **all three timeframes sit in the same zone** (eurusd, 384,660 shaped
bars, uncond. P(revert) = 0.519):

| cell | freq | eurusd Δpp (t) | gold Δpp (t) | nq Δpp (t) |
|---|---|---|---|---|
| all three OVERSOLD | 3.4% | **+3.79** (5.3) | **+2.90** (3.2) | +1.95 (1.7) |
| all three OVERBOUGHT | 3.5–4.5% | **+3.42** (4.8) | −1.17 (−1.0) | −1.74 (−1.6) |
| all three MID | 25% | **−1.44** (−4.9) | −0.11 (−0.3) | +0.05 (0.1) |
| mixed / conflicting | 67% | +0.17 (0.8) | −0.03 (−0.1) | 0.00 (0.0) |

Three readings, in order of confidence:

1. **Synchronised stretch → reversion.** All three in the same extreme is the
   condition that carries information. It is rare (~3–4% of bars).
2. **Synchronised mid → continuation** (eurusd −1.44pp, t −4.9). No stretch,
   trend persists.
3. **Conflicting timeframes → nothing.** The `mixed` bucket is 67% of all bars
   and its delta is 0.00–0.17pp on every instrument. That is also a good check
   that the stratified baseline is doing its job.

Tightening the shape sharpens it further — the strongest symbolic cells push
into the 6–12pp range at ~0.2% frequency, IS/OOS-consistent: eurusd
`OB/rise|OB/rise|OB/Vup` **+9.4pp** (t 4.3), gold `OS/fall|OS/fall|OS/fall`
**+9.6pp** (t 4.1), nq `OS/Vdn|OS/Vdn|OS/fall` **+12.0pp** (t 3.7). The
k-means clusters independently recover the same families — cluster 4 (all three
deep and deepening into oversold) +2.40pp t 3.8; cluster 2 (the mirror, all
three climbing into overbought) +1.97pp t 2.8.

## S2. The asset-class asymmetry is on the OVERBOUGHT side only

This is the sharpest cross-asset result, and it is monotone along the drift
axis:

- **FX symmetric** — eurusd reverts from both extremes at nearly the same
  strength (+3.79 / +3.42).
- **Gold: oversold only** — +2.90 (t 3.2) from oversold, but overbought is
  −1.17 (t −1.0, IS/OOS-inconsistent), i.e. gone.
- **Index: sign-flipped** — nq overbought is −1.74pp, IS/OOS-consistent:
  stretched-overbought across all three timeframes **continues** rather than
  reverts.

The more an instrument drifts upward, the more its overbought stretch stops
being a top and starts being a trend. So "train on one FX pair and it crosses
all" is defensible for the **oversold** half and **false for the overbought
half** the moment you leave FX. That is an argument for fitting per asset
class, not per instrument — and for never assuming the two sides are mirrors.

## S3. The reverse question answers itself — and it is a warning

"What is VuManChu doing when price reverts?" — measured directly, as
lift = P(shape | reverted) ÷ P(shape):

| shape | freq | at reversals | lift |
|---|---|---|---|
| fall>Vdn>fall | 0.82% | 0.86% | 1.047 |
| Vup>Vup>Vup | 0.58% | 0.61% | 1.047 |
| rise>rise>rise | 1.51% | 1.57% | 1.043 |
| … | | | ≤1.05 |

**Every shape sits within 5% of its own base frequency at reversals.** There is
no signature to read off reversals — the shapes present when price turns are
almost exactly the shapes present the rest of the time.

That is not a contradiction of S1. The strong forward cells are rare (0.2–3% of
bars), so they account for a tiny share of all reversals; and most reversals
happen with utterly ordinary oscillator shapes. It is the selection-on-outcome
trap made visible: looking at charts of past reversals and noting what the
oscillator did will convince you of patterns that have no forward content. The
forward table is the one with information; the backward view is the one that
feels persuasive.

---

# Slice 3 — start from PRICE (`events.py`)

The inverse of slice 2: find every confirmed reversal and continuation over the
full history, then read what all three VuManChu parts were doing at each.

Events on the 5m grid: a pivot high/low over +/-12 bars (1h) whose swing in AND
out both exceed 1sigma = REVERSAL; a bar with an equally large prior move that
kept going >=1sigma further in the same direction = CONTINUATION. eurusd 6,126
vs 28,431; gold 2,468 vs 12,888; nq 2,435 vs 14,498.

Every feature is a CONTRAST, `lift = P(f | reversal) / P(f | continuation)`.
Describing reversals alone is worthless — it would report "oversold-ish and
turning", and so is half the chart.

**A correction made mid-build:** the first cut oriented reversals to the
direction they turned TO and continuations to the direction they kept going.
Different reference frames, so "stretched against the move" was near-guaranteed
at one class and near-impossible at the other — it returned lifts of 277x. That
was arithmetic, not a finding. Both classes are now oriented to the PRIOR move,
so every feature means the same thing in both and only the outcome differs.

## E1. The oscillator TURNING is a continuation marker, not a reversal marker

The largest effects in the whole study, and they run opposite to intuition:

| feature | eurusd | gold | nq |
|---|---|---|---|
| WT crossed back through signal | **0.33** (z −48) | **0.38** (z −28) | **0.44** (z −24) |
| WT slope turned back | 0.40 (z −40) | 0.43 (z −23) | 0.47 (z −21) |
| VWAP distance turning back | 0.45 | 0.50 | 0.54 |
| Money Flow fading | 0.54 | 0.60 | 0.60 |
| Money Flow flipped against move | 0.32 | 0.39 | 0.64 |

Every "the wave is rolling over" feature is **2-3x MORE common at continuations
than at reversals**, on all three instruments.

Why: at an actual pivot bar the oscillator has NOT turned yet — it is still
stretched and still pushing into its extreme. The visible roll-over is a
lagging event, and it happens most often mid-move, while the oscillator cycles
and price grinds on. So "wait for the cross-back to confirm the turn"
systematically points at continuation bars.

## E2. The only part that marks reversals is WaveTrend stretch

| feature | eurusd | gold | nq |
|---|---|---|---|
| **WT stretched** (extreme the way price came) | **1.156** (0.694 vs 0.600) | **1.093** | **1.126** |
| VWAP stretched | 1.023 (0.985 vs 0.963) | 1.028 | 1.018 |
| MF still with the move | 1.036 (0.983 vs 0.950) | 1.029 | 1.014 |

VWAP-stretch and MF-with-move are **saturated — 95-99% at BOTH event classes**.
They carry z-scores up to 11 purely because n is large; the lift is ~1.02. They
describe "a move happened", not "the move is ending". **Read lift, not z**: with
34k events a 2pp difference is significant and useless.

By WT level, consistent across all three: **mid** lift 0.76-0.83 (turns do not
happen from the middle), **oversold** lift 1.16-1.24 on every instrument, but
**overbought** lift 1.16 (eurusd) / 0.96 (gold) / 1.01 (nq) — the OB side only
marks reversals on FX. That independently reproduces the drift asymmetry found
by the completely separate forward analysis in S2.

## E3. Divergences do NOT separate reversals from continuations

| | eurusd | gold | nq |
|---|---|---|---|
| divergence warning of exhaustion | 1.077 (z 0.96) | 1.038 (z 0.34) | 1.137 (z 1.07) |
| regular divergence (any) | 0.934 (z −1.4) | 0.863 (z −2.1) | 0.865 (z −1.9) |
| hidden divergence (any) | 0.765 (z −3.4) | 1.290 (z 1.9) | 1.089 (z 0.7) |
| VWAP-oscillator divergence | 0.820 | 1.044 | 0.966 |
| Money-Flow divergence | 0.997 | 1.019 | 1.033 |

**No divergence measure is significant at reversals on any instrument.** There
is NO divergence at all at ~89-90% of reversals *and* ~89% of continuations.
Regular divergence trends mildly toward CONTINUATIONS on all three.

The one consistent-with-theory result: eurusd HIDDEN divergence is
significantly more common at continuations (lift 0.765, z −3.4) — which is
exactly what hidden divergence is defined to mean, so read it as validation
that the detector works rather than as a discovery. It does not replicate on
gold or nq.

## E4. Two parts, not three — and the third barely matters

Count of the three parts stretched/opposing at the event:

| n parts | eurusd lift | gold | nq | n at reversal (eurusd) |
|---|---|---|---|---|
| 0 | 0.31 | 0.14 | 0.32 | 29 |
| 1 | 0.82 | 0.89 | 0.84 | 1,825 |
| **2** | **1.14** | **1.09** | **1.12** | 4,258 |
| 3 | 0.28 | 0.09 | 0.51 | **14** |

Two is the modal and best case on every instrument — but the lift is only
~1.1. All three is **functionally impossible** (14 of 6,126 eurusd reversals),
because MF-flipped-against-the-move occurs at just 1.6-2.5% of bars, and it
does not help when it does happen.

Combined with E2: **WaveTrend is the main indicator and very nearly the only
one.** MF and VWAP are saturated at both event classes, so adding them as
confirmation mostly adds a condition that is almost always true. Requiring 2
buys ~1.1x; requiring 3 buys nothing and costs almost every signal.

## Honest limits of slice 3

The LABEL is hindsight — you only know a bar was a pivot after price leaves it.
Features are read causally at the event bar, so this is a valid description of
"what the indicator looks like at a turn", but it is NOT a forward claim. The
strongest lift here (WT stretch, 1.16) is a modest tilt, not a detector: WT was
stretched at 60% of continuations too.

---

# Slice 4 — how big is a "reversal"? (`sweep_size.py`)

Slice 3 used one definition (5m grid, +/-12 bar = 1h window, >=1sigma both
sides). That is a choice, so it gets swept rather than defended. **The sweep
changed two of slice 3's conclusions.**

Median REALISED size of a qualifying turn, so the threshold is tangible:

| setting | eurusd | gold | nq |
|---|---|---|---|
| 1h window, 1.0sigma | 19.0 pips | 8.9 pts | 87.8 pts |
| 1h window, 2.0sigma | 30.0 pips | — | — |
| 3h window, 1.0sigma | 33.6 pips | 15.3 pts | 148.1 pts |
| 6h window, 1.0sigma | — | 20.5 pts | 201.3 pts |

So the original setting was never catching one-minute candles — but it was
catching ~19-pip turns, which is small.

## Z1. WINDOW LENGTH matters; the sigma threshold barely does

WT-stretch lift, replicated on all three instruments:

| pivot window | eurusd | gold | nq |
|---|---|---|---|
| 1h | 1.156 | 1.093 | 1.126 |
| 3h | **1.640** | **1.613** | **1.603** |
| 6h | — | **1.999** | **1.874** |

Monotone, and near-identical across FX / commodity / index. At a 6h window WT
stretch is **~2x more common at reversals than at continuations**.

Raising the SIGMA threshold at a fixed window does the opposite — eurusd 1h
goes 1.156 -> 1.087 -> 1.044 as the bar is raised 1.0 -> 1.5 -> 2.0sigma. So
what matters is **how long a window the pivot dominates** (is this a structural
turn?), not how many sigma the move was. That is a useful distinction: "big"
should be defined in TIME, not in volatility units.

Slice 3's "modest tilt, not a detector" was therefore right for 1h turns and
understated for structural ones.

## Z2. The "2 of 3 parts" number was WT wearing a hat

`two_parts` lift tracks `wt_stretched` to three decimals — gold 1.610 vs 1.613,
nq 1.564 vs 1.603, eurusd 1.613 vs 1.640. The second component contributes
essentially nothing; the count was just WT stretch relabelled. This strengthens
E2/E4: **WaveTrend is the discriminating part, full stop.**

Meanwhile `mf_against` collapses to 0.07-0.15 at the longer windows on all
three instruments — money flow flipping against the move is, at scale, a
strong CONTINUATION marker.

## Z3. Divergence — a partial walk-back on slice 3, but still not a yes

Slice 3 said divergences do not separate reversals from continuations. At the
1h window that holds. At the **3h** window `div_wt_warns` rose above 1 on all
three (eurusd 1.27 z 2.58, gold 1.66, nq 1.35), and on eurusd it climbed
monotonically with size (1.27 -> 1.56 -> 1.79) alongside `div_wt_regular`
(1.22 -> 1.36 -> 1.70, z 2.5-3.0).

It does not survive scrutiny:
- **It reverses at 6h** — gold 0.938, nq 0.842. A real effect that strengthens
  with structural size should not vanish at the next window up.
- **`div_wt_regular` does not replicate** — eurusd 1.22, but gold 0.99 and
  nq 0.98, i.e. exactly no discrimination.
- **The most dramatic cell is noise** — nq `div_vwap_warns` lift 9.47 is built
  on **14 reversals vs 19 continuations**. Counts were pulled specifically to
  check this.
- 15 settings x 7 features were swept.

Honest statement: **no consistent, replicated divergence effect across assets
and windows.** Not the clean "no" of slice 3, but nowhere near a yes — the one
region where it looked strong does not survive moving the window.

## Z4. A bug the sweep exposed

`divergence_at` had a fixed 60-bar lookback. Once the pivot window grew past
~28 bars there was no room to hold two confirmed pivots, so it returned NONE
for every event — which reads as "no divergences at large reversals" rather
than "the detector had nowhere to look". The 3h rows were initially all NaN.
Lookback now scales as `max(60, 5k + min_gap)`. **Every divergence number above
is post-fix**; the pre-fix run would have supported slice 3's "no" for the
wrong reason.

---

# Slice 5 — divergence STACKING and the size of what follows (`divergence_stack.py`)

The owner's hypothesis, from two annotated pullbacks on a gold 5m chart: one
divergence -> small pullback; the divergence repeating over two peaks (a
"double") AND the VWAP oscillator diverging too -> a much bigger reversal.

That is a MAGNITUDE question ("given a divergence, how big is what follows"),
not the binary one slice 3 tested and nulled. Divergences are detected
causally as they confirm (5-bar fractal, reach 2), logged with their streak,
which components co-diverge, and the forward MFE/MAE in sigma. Baseline is a
RANDOM-BAR control drawn to the same direction mix — in a trending market an
MFE in any direction looks impressive without one.

12,754 (gold) / 26,768 (eurusd) / 12,669 (nq) WaveTrend divergences, 180m
forward.

## D1. The "double" on its own — NULL, 3 out of 3

| streak | gold | eurusd | nq |
|---|---|---|---|
| double, WT only (vs control) | −0.021 | −0.005 | −0.034 |

Stacking divergences without VWAP does nothing anywhere. Gold's own streak
table: 1 -> +0.000, 2 -> +0.021 (t 1.32), 3 -> −0.037. Flat.

## D2. VWAP co-divergence — REAL, and it replicates

| cell (vs random-bar control, σ) | gold | eurusd | nq |
|---|---|---|---|
| single + VWAP | +0.046 (t 1.6) | **+0.130** (t 5.9) | **+0.101** (t 3.5) |
| **double + VWAP** | **+0.216** (t 4.2) | **+0.150** (t 4.5) | **+0.148** (t 3.4) |
| double, WT only | −0.021 | −0.005 | −0.034 |
| single, WT only | −0.005 | −0.013 | −0.036 |

`double + VWAP` is the best cell on all three instruments. But on eurusd it is
barely better than `single + VWAP` (0.150 vs 0.130) — so **the VWAP
co-divergence is doing the work, not the double.** Gold is the only instrument
where the double clearly adds on top.

Money Flow again contributes nothing: gold `WT+MF` = −0.002 vs `WT` alone
−0.014. Only VWAP joining changes anything.

## D3. The catch — on FX and the index it is VOLATILITY, not direction

`edge_ratio` = MFE ÷ |MAE|, i.e. does price actually go the divergence's way
more than against it:

| double + VWAP | MFE | MAE | edge ratio |
|---|---|---|---|
| gold | 0.970 | −0.752 | **1.29** |
| eurusd | 0.871 | −0.896 | 0.97 |
| nq | 0.886 | −0.868 | 1.02 |

On **gold** the excursion is genuinely asymmetric — it goes the divergence's
way. On **eurusd the MAE is LARGER than the MFE**, and nq is symmetric. There,
a WT+VWAP co-divergence says "a bigger move is coming", not "a reversal is
coming". Alerting it as a reversion signal on FX or an index would be
mislabelling a volatility-expansion signal.

## D4. Regular vs hidden, finally the textbook sign

Regular beats hidden on all three (gold +0.024/−0.023, eurusd +0.019/−0.014,
nq −0.002/−0.038). Small, but consistently signed the way the definitions say
— regular = reversal, hidden = continuation.

## D5. Vol-regime caveat

Gold split by volatility tercile: `double + VWAP` is the best cell in all
three buckets (+0.342 calm, +0.091 mid, +0.177 high) but only 2 of 3 clear
t>=2, and in the calm bucket EVERY cell beats the control — meaning the
random-bar control is not volatility-matched and the pooled +0.216 is
flattered. The within-bucket numbers are the honest ones, and they are roughly
half the pooled figure.

## Verdict on the hypothesis

- **"the double makes it bigger"** — not supported. Null on all three without
  VWAP.
- **"VWAP diverging too makes it bigger"** — supported, replicated 3/3,
  t = 3.4–5.9.
- **"...and that means a reversal"** — supported on gold only. On eurusd and
  nq the move is bigger in BOTH directions.

This is the first mechanism-specific positive in the study. It is a
descriptive magnitude effect measured against a control, not a tested entry —
no costs, no exit rule, no OOS split on this slice yet. Those are the next
steps, in that order.

---

# Slice 6 — unguided search (`discover.py`)

Every earlier slice tested a hand-framed hypothesis. This one enumerates the
condition space itself — all discrete VMC state plus continuous features cut
into terciles, as singles AND all pairs — and puts every cell through a funnel
where each stage is a real holdout.

## X1. The funnel (discovery = gold, confirmation = eurusd + nq)

| stage | test | survivors | chance |
|---|---|---|---|
| 0 | enumerated | 1,808 | — |
| 1 | \|t_IS\| >= 2.5 (first 60% by time) | 150 | ~22 |
| 2 | + OOS same sign, \|t\| >= 1 (last 40%) | 102 | ~24 |
| 3 | + same sign on BOTH other markets | 102 | ~26 |

102 vs ~26. Deduplicating cells that are the same underlying bar-set wearing
different feature names (checked explicitly — max 6 aliases, median 1) leaves
**77 distinct survivors, still ~3x chance.**

Independently of any hypothesis, the search rediscovered the study's two main
findings: fast-timeframe WT oversold confirmed by a slower timeframe -> reverts,
and its mirror (timeframes in conflict + stretched VWAP -> continues, the one
cell with a consistently NEGATIVE delta on all three markets). That is a real
validation — hand-framing and blind search converged.

## X2. The oddity the search surfaced, and why it matters more than the survivors

Nearly every survivor had **OOS delta roughly DOUBLE its IS delta** (1.55 ->
3.57, 1.29 -> 3.31, 1.38 -> 3.30, 1.57 -> 3.29 ...). Selection bias inflates
in-sample and deflates out-of-sample. This was the opposite, on almost every
row — which is a signature of the effect changing over time, not of robustness.

Chasing it with a per-year breakdown of the core condition (WT oversold):

| year | eurusd | gold | nq |
|---|---|---|---|
| 2016 | +2.00 | | |
| 2017 | +1.59 | | |
| 2018 | +0.30 | | |
| 2019 | +1.11 | | |
| 2020 | +2.68 | | |
| 2021 | +0.40 | +1.12 | +3.04 |
| 2022 | +0.21 | +1.65 | −0.18 |
| 2023 | +1.23 | +0.46 | +1.97 |
| 2024 | +0.65 | +2.16 | +3.02 |
| 2025 | +2.11 | +3.35 | +2.51 |
| 2026 | +0.24 | +2.71 | +1.65 |

Two readings, and they pull in opposite directions:

**The good one — the SIGN is extraordinarily persistent.** 22 of 23
instrument-years are positive (eurusd 11/11, gold 6/6, nq 5/6). Under a
coin-flip null that is p ~ 5e-6. This is the strongest single piece of evidence
in the whole study, and it is about DIRECTION, not size.

**The bad one — the MAGNITUDE is regime-dependent and not stable.** Gold's
effect roughly TRIPLED from 2021-23 (~1.1pp) to 2024-26 (~2.7pp); eurusd swings
between +0.21 and +2.68 with no pattern; nq has a negative year. So gold's
"strong OOS" in the funnel above was its 2024-26 regime, **not** evidence of a
durable edge — the funnel's stage-2 result is flattered by exactly that.

Practical consequence: the direction of this effect is about as well
established as anything gets in this repo; the size of it on any given year is
not forecastable from its own history.

## X3. Honest limits of the search

- It can only search features that exist in the panel. The divergence-stacking
  idea (slice 5) was outside the panel's vocabulary — blind search could never
  have proposed it. Widening the feature set is the fix, and it is the main
  thing that would make this engine better.
- Survivors are still SEARCH results. Clearing three holdouts makes them leads
  worth a forward test, not established effects.
- The chance expectations assume independence between cells; the cells overlap
  heavily by construction, so treat "3x chance" as corroboration of a small
  number of underlying effects, not as 77 findings.

## Multiple testing

41 cells per instrument per horizon; ~1.9 expected to clear |t|≥2 by chance.
EURUSD returned 13 IS/OOS-consistent survivors at h=60 — comfortably above the
chance count. Gold 13, NQ fewer. The survivors are also not independent (the
cells overlap heavily by construction), so treat the count as corroboration of
one effect, not as 13 findings.
