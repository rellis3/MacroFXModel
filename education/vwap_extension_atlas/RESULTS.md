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
direct answer to "does it fade back to VWAP":

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

---

## Reproduce

```bash
npm install   # hyparquet etc. aren't vendored; needed once per environment
node js/vwapExtensionAtlasEngine.test.mjs
node education/vwap_extension_atlas/scripts/run_one.mjs gold       education/vwap_extension_atlas/data commodity
node education/vwap_extension_atlas/scripts/run_one.mjs nas100_usd education/vwap_extension_atlas/data index
node education/vwap_extension_atlas/scripts/run_one.mjs eurusd     education/vwap_extension_atlas/data fx
node education/vwap_extension_atlas/scripts/run_one.mjs gbpusd     education/vwap_extension_atlas/data fx
```

Per-instrument raw rows: `data/<pair>.rows.json`. Full dimension book
(cell × dimension × bucket, IS/OOS, `holds`): `data/<pair>.book.json`.
