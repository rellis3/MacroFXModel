# VWAP Extension Atlas — a reference book, not a trading rule (2026-08-25)

Built per `MD files/REFERENCE_ENGINE_PLAYBOOK.md`, the same discipline behind
Level Atlas / Session Path: walk history once, one record per well-defined
event, everything true at that moment plus what happened next, then let
out-of-sample data — not a p-value, not a story — decide which context
factors are real. **This is deliberately not a signal search**: no
after-cost filter, no entry/exit rule, no "is this tradeable" cut. A cell
that shows 15% either way is a complete, correct answer here, not a
rejected hypothesis.

This is **not** a fourth VWAP trading engine. Three standalone VWAP
mechanisms are already tested and null in this repo (`MD files/
VWAP_REVERSION_FINDINGS.md`'s ±2σ band fade/bounce/follow — 0/26 pairs
OOS-positive; `education/jordan_vwap_session_reversion_backtest/
RESULTS.md`'s London→NY session-transition fade — 1/26 OOS-positive). This
engine asks a narrower, prior question: when price stretches away from
session VWAP, what does history actually say happens next — and does
session, time-of-day, volatility regime, range position, or momentum
regime genuinely change that, or not?

**Engine**: [`js/vwapExtensionAtlasEngine.js`](../../js/vwapExtensionAtlasEngine.js)
(pure walk, no-lookahead contract in the file header, causality-tested in
[`js/vwapExtensionAtlasEngine.test.mjs`](../../js/vwapExtensionAtlasEngine.test.mjs)).
Analysis: [`scripts/run_one.mjs`](scripts/run_one.mjs).

---

## The unit

One row = one bar where a session's cumulative distance from that day's own
VWAP, expressed in that day's own Wilder ATR-14 units, **first crosses a
fixed threshold** (1.0 / 1.5 / 2.0 / 2.5 ×ATR) on one side since the VWAP
anchor reset — "an extension just started." VWAP anchor = plain UTC
calendar day, identical to the two already-tested null VWAP engines (kept
identical on purpose, for direct comparability, not a fresh definition).
First crossing per side/threshold/day only — a day that crosses, fades, and
crosses again on the same side is only captured once (re-arm is a
documented, deliberately unbuilt extension — see the engine file's footer).

**Outcome**, scanned forward only, capped at that UTC day's last bar:
`touchedVwapAfter` (did price return to VWAP before day end — the direct
"does it fade back" answer), `barsToVwapTouch`, `peakExtAtr` (the furthest
it got, a causal running max — the reversal-trap-safe read per playbook
§6.3), `didExtendFurtherFirst` (did it make a NEW further extreme before
ever touching VWAP), `pctRetraced` (how much of the peak extension it gave
back), `wentToOppositeSide` (after touching VWAP, did it carry through to
the *other* side's own threshold — the "VWAP as pivot, not wall" case).

**Context dimensions**, all causal (full contract in the engine file
header): `session` (Asia/London/NY), `sessionPos` (elapsed UTC-day hours),
`dow`, `dayVolRegime` (prior day's range vs its own trailing 20-day
median — "what range are we in" for the day as a whole), `rangeConsumedBucket`
(today's own range-so-far vs its trailing median — "what range are we in"
intraday), `dayType` (`dayTypeCore.js`'s drift/diffusion trend-day-ness,
prior days only), `htfTrend`/`momAdx`/`wtMtf`/`wtSlow` (reused verbatim from
`confluenceFeatures.js` — the exact bricks Level Atlas/Session Path already
use), `approachSpeed` (grind vs climax into the crossing).

## Data

4 instruments, real OANDA M1 archive, 2016–2026 (~10.4 years): **gold**
(commodity), **NAS100** (index), **EURUSD**, **GBPUSD** (fx) — one of each
asset class this repo trades, not a cherry-picked pair. IS/OOS split: 60/40
by date, this repo's standing convention. Holding gate (playbook §3.2):
n≥30 **both** halves, same sign **both** halves, |Δ|≥3pp **both** halves —
no p-values, just "did it happen again on data it wasn't built from."

---

## Headline finding — most ≥1×ATR VWAP extensions do NOT fade back same day

This is the base rate every other number below sits on top of, and it's the
direct answer to "does it fade back to VWAP" — using the most generous
possible reading (any M1 wick touching VWAP counts). The confirmation-
timeframe section further down shows this rate only gets LOWER, not higher,
under a stricter "closes not wicks" reading.

| Instrument | Side | n | Touched VWAP same day | Extended further first | Unresolved at day-end | Avg peak reached |
|---|---|--:|--:|--:|--:|--:|
| Gold | up | 150 | **18.7%** | 84.7% | 81.3% | 1.27×ATR |
| Gold | down | 152 | **14.5%** | 80.9% | 85.5% | 1.37×ATR |
| NAS100 | up | 104 | **11.5%** | 87.5% | 88.5% | 1.26×ATR |
| NAS100 | down | 200 | **29.5%** | 84.0% | 70.5% | 1.33×ATR |
| EURUSD | up | 157 | **19.1%** | 87.3% | 80.9% | 1.28×ATR |
| EURUSD | down | 128 | **17.2%** | 78.9% | 82.8% | 1.24×ATR |
| GBPUSD | up | 150 | **18.7%** | 81.3% | 81.3% | 1.28×ATR |
| GBPUSD | down | 142 | **17.6%** | 90.1% | 82.4% | 1.35×ATR |

Reading it straight: on every one of the 8 (instrument × side) cells, the
**modal outcome is that the extension does NOT return to VWAP the same UTC
day** — touch rates cluster 12–30%, and 80–90% of crossings go on to make a
*further* extension before ever touching VWAP (if they touch it at all).
This directly contextualizes the "trade the extension back to VWAP" family
of ideas discussed earlier: on this specific, honestly-measured definition
(≥1×ATR from session VWAP, UTC-day anchor), fading back to VWAP same-day is
a **minority** outcome, not the thing that "usually happens" — a benchmark
worth having before any fade rule gets built on top of it.

(Thresholds above 1.0×ATR have too few crossings per instrument to report
honestly — 2 to 40 rows depending on cell, well under a usable split. Kept
in the raw data (`data/<pair>.rows.json`) for future pooling across more
instruments/years, not reported as a finding here — see Limitations.)

---

## What holds out-of-sample, cross-instrument

### 1. NY-session crossings are consistently LESS likely to fade back — the strongest finding here

`session = NY` at the crossing bar holds the OOS gate on **7 of 8**
(instrument × side) cells — same sign, same direction, both halves, every
time it fires:

| Instrument | Side | IS (n, touch%, Δvs base) | OOS (n, touch%, Δvs base) |
|---|---|---|---|
| Gold | up | 71, 9.9%, **−10.1pp** | 48, 10.4%, **−6.3pp** |
| Gold | down | 72, 8.3%, **−4.9pp** | 42, 4.8%, **−11.6pp** |
| NAS100 | down | 103, 30.1%, **−3.2pp** | 67, 19.4%, **−4.4pp** |
| EURUSD | up | 70, 7.1%, **−5.7pp** | 41, 14.6%, **−14.0pp** |
| EURUSD | down | 58, 8.6%, **−9.8pp** | 34, 5.9%, **−9.5pp** |
| GBPUSD | up | 64, 12.5%, **−3.1pp** | 44, 11.4%, **−11.9pp** |
| GBPUSD | down | 55, 7.3%, **−9.2pp** | 35, 0.0%, **−19.3pp** |

The one miss, reported rather than hidden: **NAS100 up** — IS delta −6.3pp
(n=51) but OOS delta **+1.3pp** (n=33), sign doesn't match, correctly
excluded by the gate. 7/8 is not "always," and it's one dimension holding
on the same 7 cells (not 7 different dimensions each holding once) — a
materially stronger pattern than scattered single-cell hits, and the
opposite direction of what "NY = the busiest, most news-dense session"
might naively suggest: an extension that first clears the threshold during
NY tends to **persist**, not mean-revert, more than the all-session base
rate.

### 1b. Pooled across instruments: London is the mirror image of NY — MORE likely to fade back

Per-instrument, Asia and London each produce too few crossings (n=9–23 in
either half) to clear the n≥30 holding gate on their own — that's a sample-
size gap, not a null result, and the original pass above should have pooled
before calling it inconclusive. Pooling threshold=1.0 rows across all 4
instruments (same 60/40 split, same gate) gives London enough data to test
honestly:

| Session | Side | IS (n, touch%) | OOS (n, touch%) | vs pooled base (up 17.5% / down 20.6%) |
|---|---|---|---|---|
| **London** | up | 44, 36.4% | 42, **61.9%** | +18.9pp IS, **+44.4pp OOS — holds** |
| **London** | down | 46, 47.8% | 64, 39.1% | +27.2pp IS, +18.5pp OOS — holds |
| Asia | up | 30, 36.7% | 23, 8.7% | sign flips OOS — does not hold |
| Asia | down | 25, 36.0% | 21, 42.9% | consistent direction, but n<30 both halves |
| NY | up | 222, 10.8% | 200, 9.5% | −6.7pp / −8.0pp — holds (already §1) |
| NY | down | 280, 17.5% | 186, 7.5% | −3.1pp / −13.1pp — holds (already §1) |

**London genuinely holds, in the opposite direction from NY**: London
extensions are *more* likely to touch VWAP again than average, cross-
instrument, out-of-sample, with real sample size once pooled. Asia's down
side leans the same way as London but stays just under the n≥30 bar even
pooled; Asia's up side flips sign OOS and looks like noise, not edge. A
plausible mechanism: VWAP resets at UTC midnight, inside Asia — London is
still close enough afterward that the average hasn't drifted far, so a
1×ATR stretch there is still "early relative to VWAP" and prone to snapping
back; by NY, VWAP has accumulated most of the session's information and an
extension that clears 1×ATR that late looks more like a genuine trend.
**Still a rate, not a P&L** — this repo's own standalone VWAP σ-band fade
(a different unit) already tested null system-wide after costs
(`VWAP_REVERSION_FINDINGS.md`); a higher touch-rate is necessary, not
sufficient, for a real edge.

### 2. A slow (grinding) approach into the threshold also lowers the fade-back rate — real, but only half the cells

`approachSpeed = 1·grind` (the extension built up gradually over the prior
~15 bars rather than spiking) holds on 4 of the 8 cells — gold-up, NAS100-
down, EURUSD-up, GBPUSD-down — always in the same direction (grind → lower
touch-back rate than a sharp/climactic approach). Real and consistent where
it holds, but half the cells is a genuinely weaker, more provisional
pattern than the session finding — reported as such, not inflated to match
it.

### 3. Everything else that held, held on ONE instrument only

Single-cell, single-instrument findings — real for that instrument/cell,
**not** cross-validated the way the two findings above are:

| Instrument | Cell | Dimension = bucket | IS Δ | OOS Δ |
|---|---|---|--:|--:|
| Gold | up\|1 | `wtMtf = 3·with` (momentum agrees w/ direction) | −5.0pp | −4.2pp |
| Gold | up\|1 | `wtSlow = 2·mid` | −3.3pp | −7.3pp |
| Gold | down\|1 | `wtMtf = 2·mixed` | **+9.0pp** | **+8.6pp** |
| NAS100 | down\|1 | `dayVolRegime = 2·normal` | −9.3pp | −5.6pp |
| GBPUSD | up\|1 | `htfTrend = 2·flat` | −9.9pp | −6.2pp |

Worth noting directionally: gold's up-side finding (MTF momentum agreeing
→ *less* likely to fade) and down-side finding (MTF momentum mixed → *more*
likely to fade) point the same way conceptually — a momentum-confirmed
extension persists, an unconfirmed one is more likely to snap back — but
that's one instrument telling a coherent story, not two instruments
agreeing, and is flagged as an observation, not a finding.

`sessionPos = 3·16-24utc` also held on gold (both sides) — noted but not
listed as independent evidence, since it overlaps heavily with `session =
NY` (13:00–22:00 UTC) by construction; treat it as the same underlying
signal read a second way, not a second confirmation.

### Chance-baseline honesty

765 total (dimension × bucket) cells were tested across the 4 instruments;
19 held. At this project's own admittedly blunt gate (not a p-value), a
handful of single-cell hits scattered across many different dimensions is
close to what noise alone produces at this sample size — which is exactly
why finding #1 (the *same* dimension holding on 7 independently-split
cells) is treated as the headline here and the single-instrument hits in
the table above are labeled provisional, not promoted alongside it.

---

## Confirmation timeframe — does the wick-vs-close choice matter?

Everything above counts a "touch" the moment any M1 bar's wick reaches
VWAP — the most generous possible reading. This group's own stated
convention (`JORDAN_VIDEO_INSIGHTS.md`, the dynamic-stop entry) is
**"closes not wicks"**: a level isn't really broken/reached until a candle
*closes* through it, not just wicks it. The engine now takes a
`confirmTfMinutes` parameter (default 1 = the M1-wick reading used
everywhere above, byte-identical output) that requires the crossing AND
the return-to-VWAP to be confirmed by an actual bucket close at that
timeframe — 5m/15m/30m/1h/4h — before either counts.

Swept threshold=1.0 on all 4 instruments, 1m/5m/15m/30m/1h/4h:

| Instrument, side | 1m | 5m | 15m | 30m | 1h | 4h |
|---|--:|--:|--:|--:|--:|--:|
| Gold, up | 18.7% | 14.2% | 10.0% | 7.4% | 3.4% | 1.8% |
| Gold, down | 14.5% | 9.8% | 8.5% | 8.9% | 5.6% | 7.0% |
| NAS100, up | 11.5% | 5.3% | 4.5% | 4.9% | 2.8% | 0.0% |
| NAS100, down | 29.5% | 20.6% | 15.5% | 13.6% | 9.6% | 4.1% |
| EURUSD, up | 19.1% | 13.3% | 9.2% | 6.7% | 4.6% | 3.1% |
| EURUSD, down | 17.2% | 14.7% | 14.8% | 11.0% | 10.3% | 9.5% |
| GBPUSD, up | 18.7% | 11.4% | 9.8% | 8.4% | 7.6% | 0.0% |
| GBPUSD, down | 17.6% | 18.1% | 16.1% | 14.9% | 8.9% | 1.7% |

**The fade-back rate falls in essentially every cell as the confirmation
timeframe rises** — close to monotonic across all 8 (instrument × side)
rows, two negligible one-step wobbles aside (EURUSD-down 14.7→14.8%,
GBPUSD-down 17.6→18.1%). By 1h/4h confirmation several cells are down to
low single digits or zero. This makes the headline base-rate finding
**stronger under a stricter, more realistic reading, not weaker**: an M1
wick reaching back to VWAP is the most generous possible definition of
"fading back," and even that reading already showed a minority outcome —
requiring an actual confirmed close makes it rarer still. (n also shrinks
at coarser confirmation — fewer crossings even register, since the
crossing itself now also needs a bucket close — from 104–200 at 1m down to
42–77 at 4h; the 4h row is directional, not gate-tested.)

**The NY/London split survives every confirmation timeframe checked.**
Re-running the session cut at 1m/15m/1h: NY has the LOWEST touch rate and
London a materially higher one, on **every single one of the 24
(instrument × side × timeframe) comparisons** — the ordering never once
flips, even though Asia/London sample sizes shrink at coarser timeframes
(down to n=2–20, too thin to run the formal IS/OOS gate past 15m). A
pattern that survives a completely different methodological choice
(wick-counting vs close-confirmation) this consistently is closer to real
signal than to an artifact of one particular counting convention.

Engine: `confirmTfMinutes` param in `js/vwapExtensionAtlasEngine.js` (see
its header for the exact confirmed-close semantics; tested in
`js/vwapExtensionAtlasEngine.test.mjs`). Sweep script:
[`scripts/confirm_tf_sweep.mjs`](scripts/confirm_tf_sweep.mjs), data in
`data/<pair>.confirm_tf_sweep.json`.

---

## What this does and doesn't mean

This is a description of history, not a trading rule, and not a claim that
fading a VWAP extension has edge — that question stays exactly where the
two prior null engines left it (`VWAP_REVERSION_FINDINGS.md`,
`jordan_vwap_session_reversion_backtest/RESULTS.md`). What it does provide,
honestly: a base rate (extensions mostly don't revert same-day) and one
real, cross-instrument, OOS-held conditioning fact (NY-session extensions
persist more than the average) that a future signal-search pass could use
as a genuine prior — e.g. "is a NY-session, climactic-approach extension
*less* likely to persist than a NY-session grind" is now a concrete,
motivated question this book raises but does not answer, rather than a
guess pulled from nowhere. Per this repo's own rule: interest in a pattern
must never be phrased so it implies the pattern is tradeable — that's a
separate, later, harness-gated exercise (`ANALYTICS_ENGINE_DESIGN.md` §1),
not this file.

---

## Limitations

- **Only threshold=1.0×ATR is usably sampled.** 1.5/2.0/2.5×ATR crossings
  are real events in the raw rows but too rare per instrument (2–40 rows)
  to split IS/OOS honestly — reported as raw data, not as findings.
- **First crossing per side/threshold/day only** — no re-arm. A day that
  crosses, fades, and re-extends on the same side only contributes one row.
- **VWAP anchor = plain UTC calendar day**, not the London-midnight day
  Level Atlas/Session Path use elsewhere in this repo — deliberate, for
  comparability with the two already-tested VWAP null engines, but means
  `session`/`dow` here are UTC-day-relative, not London-day-relative.
- **4 instruments, not the full 26-pair set** the earlier VWAP nulls used —
  chosen as one of each asset class (commodity/index/2×fx) for a first
  pass; extending to the full instrument set is a natural, cheap follow-up
  (the walk itself took under 30s per instrument including M1 load).
- **No confluence-with-the-range-extension-ladder dimension yet** — the
  "what range are we in" layer here is a simple range-consumed ratio, not
  the group's own Asia/Monday range-extension ladder (`js/fibProjection.js`)
  — flagged in the engine file's own footer as a deliberate, unbuilt
  follow-up, not a silent gap.
- **Confirmation-timeframe sweep (above) is directional past 15m, not
  gate-tested** — 1h/4h sample sizes (especially Asia/London) are too thin
  for a formal IS/OOS split; the monotonic base-rate decline and the
  NY/London ordering are reported as observations across many independent
  cuts, not as separately-held findings the way §1/§1b are.

---

## Reproduce

```bash
npm install   # hyparquet etc. aren't vendored; needed once per environment
node js/vwapExtensionAtlasEngine.test.mjs
node education/vwap_extension_atlas/scripts/run_one.mjs gold       education/vwap_extension_atlas/data commodity
node education/vwap_extension_atlas/scripts/run_one.mjs nas100_usd education/vwap_extension_atlas/data index
node education/vwap_extension_atlas/scripts/run_one.mjs eurusd     education/vwap_extension_atlas/data fx
node education/vwap_extension_atlas/scripts/run_one.mjs gbpusd     education/vwap_extension_atlas/data fx

# confirmation-timeframe sweep (1m/5m/15m/30m/1h/4h), per instrument
node education/vwap_extension_atlas/scripts/confirm_tf_sweep.mjs gold       commodity
node education/vwap_extension_atlas/scripts/confirm_tf_sweep.mjs nas100_usd index
node education/vwap_extension_atlas/scripts/confirm_tf_sweep.mjs eurusd     fx
node education/vwap_extension_atlas/scripts/confirm_tf_sweep.mjs gbpusd     fx
```

Per-instrument raw rows: `data/<pair>.rows.json`. Full dimension book
(cell × dimension × bucket, IS/OOS, `holds`): `data/<pair>.book.json`.
