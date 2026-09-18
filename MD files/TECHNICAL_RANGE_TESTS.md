# Technical range tests — three price-only claims, pre-registered together

> **Status: PRE-REGISTERED 2026-09-18 (commit bbead67), run the same day.**
> T1 (inside day / NR7 → expansion): **NULL — and NR7 is followed by a *calmer*
> day on five of eight instruments.** T2: base rates measured (first hour ≈ 21–23%
> of the day on FX, 12–13% on indices). T3 (fast first two hours → the rest of the
> day): **PASS** — the range after 09:00 runs +0.15 to +0.75 ATR wider, and the
> session closes on the side of the morning move 80–90% of the time vs 60–70% on
> ordinary mornings. Nothing above the Results line changed after the run.

## Data

The local M1 archive (`VolRangeForecaster/data/m1`, via `loadM1ForPair`), bucketed
into **London calendar sessions** (the same session definition as the vol
forecaster and the squeeze study). Instruments: EUR/USD, GBP/USD, USD/JPY, AUD/USD,
USD/CAD, gold (XAU/USD), NAS100, SPX500 — the eight the page trades most and the
ones with the deepest M1 history. Daily OHLC is built from the M1 sessions
(open = first bar, close = last). ATR14 from those sessions. Sessions with fewer
than 300 M1 bars are dropped (holidays, feed gaps) and counted in the audit.

## Shared method

Setup day → one paired control (same instrument, different ISO week, same
ATR-percentile quintile over the trailing 250 sessions, same 20-session trend
tercile, not itself a setup). Paired mean difference, ISO-week block bootstrap,
1,000 reps, 95% CI. Fewer than 40 paired days = reported, not scored. Pass bar
for a range claim: ≥ +0.10 ATR with the CI clear of zero; a *narrower* result
with the CI clear of zero is reported as "calmer". Robustness: R1 = 2022-01-01
onward. Per-session-band splits (Asia / London / New York) are reported where
the claim is about a band.

## The three tests

**T1 — Inside day / narrow-range day → expansion.**
The oldest range claim in technical analysis: a day whose range sits inside the
prior day's (inside day), or the narrowest of the last seven (NR7), is followed by
a wider day. Setups: (a) inside day (high ≤ prior high AND low ≥ prior low);
(b) NR7 (range ≤ min of the prior six). Outcome: next session's range / ATR14,
and the next-5-session range. Control as above. Direction reported only as the
base rate of the next day's close vs open (expected ~50%).

**T2 — The first hour as a fraction of the day.**
A base-rate study, no pass bar: what fraction of the session's eventual range
had been travelled by the end of the first hour after the London open (07:00 UK)
and after the New York open (13:30 UK), by instrument, with p25/p50/p75; split
by whether a high-impact release for the instrument's currencies falls in the
session (calendar from the surprise store's dates where available, else
none-marked). The number the vol forecaster could use directly: "by 08:00 the day
has typically used X% of its range". Also: the share of sessions whose first-hour
high or low held as the session extreme.

**T3 — Trend-day recognition from early range expansion.**
Claim: when the first two hours after the London open have already travelled
≥ 60% of ATR14, the day tends to become a trend day — closing near its extreme
with a range well above ATR. Setup: first-2h range ≥ 0.6 ATR14 (and ≥ 0.8 as R2).
Outcomes: (i) full-session range / ATR14 vs matched control (range claim, pass bar
as above); (ii) "trend-day" base rate — close within the top or bottom 20% of the
session's range — on setup days vs control days, with intervals; (iii) the
continuation base rate: does the session close on the same side of the open as the
2-hour move, vs control. (ii) and (iii) are base rates: a difference of ≥ 15
percentage points with the interval clear of zero is reported as a finding,
anything less as "no different from an ordinary day". The obvious trap is stated:
a big first two hours mechanically raises the full-session range, so (i) is
compared against a control matched on the same trailing ATR quintile AND the
remaining-session range (open+2h → close) is reported separately — that is the
honest version of "the day keeps going".

## Batch 2 — pre-registered 2026-09-18 after T1–T3 had run, before any of these ran

**T3b — After-09:00 continuation (the honest version of T3's 80–90%).** Setup as
T3 (first 2h ≥ 0.6 ATR). Outcome: sign of (close − 09:00 price) equals sign of the
2h move, on setup days vs ordinary mornings (first 2h < 0.4 ATR), with intervals;
and the mean after-09:00 move in the direction of the morning, in ATR. A base rate;
finding bar ≥ 15pp with the interval clear of zero.

**T4 — Opening-range breakout: follow-through or fade.** Opening range = the first
London hour (07:00–08:00 UK). Breakout = first M1 close beyond the range before
13:30 UK. Outcomes, as base rates with intervals: (a) the break extends by ≥ 0.5 ×
the opening range before price returns inside it (follow-through) vs returns inside
within 60 minutes (fade); (b) the session closes beyond the broken side; (c) the
range after the break vs matched non-breakout sessions (paired, range claim, pass
bar as above). Split by tape speed at the break (the 15-min approach speed quintile,
js/tapeSpeedEngine.js convention) — the one conditioner this desk has validated.

**T5 — Gaps.** Instruments: NAS100, SPX500, gold. Gap = Monday's first London bar
open vs Friday's last close (the only gap a near-24h CFD reliably has), in ATR14.
Outcomes as base rates by gap size (< 0.25, 0.25–0.5, > 0.5 ATR): share filled (price
trades back to Friday's close) within the session, within 5 sessions; Monday's range
vs matched non-Monday sessions.

**T6 — Calendar range profiles.** Session range / ATR14 by weekday, and for the
last two and first two sessions of the month and of the quarter, vs all sessions:
mean, p50, with intervals. No pass bar; a profile the range chip can quote.

**M7 — Yen firming into rising US yields → the week after.** Daily data (OANDA
USD/JPY, FRED DGS10). Setup: USD/JPY 5-session change ≤ −1% AND DGS10 5-session
change ≥ +8bp (the divergence panel's "carry unwind" condition). Outcome: next-5
range on USD/JPY, EUR/JPY, AUD/JPY vs matched controls (range claim). Direction as
a base rate only.

**M9 — Implied above realised → compression.** VIX vs 20-session realised
annualised vol of SPX500 (from daily log returns). Setup: VIX / realised in the top
decile of its trailing-500 distribution (fear over-priced). Outcome: next-5 and
next-20 range on SPX500 and NAS100 vs matched controls; a *narrower* result with the
CI clear is the claim ("calmer"), reported as such.

**M12 — Breadth: every index down for N days.** Daily OANDA closes for NAS100,
SPX500, US30, US2000, DE30, UK100. Setup: all six closed down on the same session
(N=1), and two consecutive such sessions (N=2). Outcomes: next-5 range on SPX500 and
NAS100 vs matched controls; next-5 direction as a base rate.

Queued, not run (data not held): options walls as range fences (needs the OI
archive to reach 200+ sessions).

## What a pass changes on the page

A validated T1 or T3 range effect earns a ✓ chip on the day tier, worded as range
in the instrument's units (the same `expect` block the Desk Watch uses). T2 feeds
the range-used chip's tooltip with the measured fraction for that hour. Any
direction base rate goes in the book as a base rate and nowhere else.

---

## Results

Eight instruments, ~2,490 London sessions each with features (2016-01 → 2026-08;
~560 thin sessions per instrument dropped — weekends and holidays in the archive).
Unconditional next-session range ≈ 1.0 ATR, next-5 ≈ 2.3. Output:
`analysis/output/technical_range_studies.json`.

### T1 — Inside day / NR7 → expansion. **NULL; NR7 runs calmer.**
Inside days (n=292–396 per instrument): next-session range diff between −0.09 and
+0.04 ATR, every CI across zero, on all eight; 5-session the same. NR7 (n=359–402):
the next session is **narrower** with the CI clear of zero on USD/JPY (−0.17),
SPX500 (−0.17), NAS100 (−0.13), USD/CAD (−0.09), AUD/USD (−0.08); null on the rest;
the 5-session range is narrower too on USD/JPY, NAS100, SPX500, GBP/USD. R1 (2022+)
agrees where scored. Next-day direction after either: 49–55%, intervals across 50.
Reading: quiet days cluster — that is volatility persistence, the opposite of the
"coiled spring" story. A narrow day is a reason to expect a narrow day.

### T2 — The first hour as a fraction of the day (base rates).
| | London 07:00–08:00 p25 / p50 / p75 | New York 13:30–14:30 p25 / p50 / p75 | first-hour extreme held all session |
|---|---|---|---|
| EUR/USD | 16 / **22** / 30% | 22 / **31** / 43% | 11% |
| GBP/USD | 16 / 23 / 32% | 21 / 29 / 40% | 12% |
| USD/JPY | 15 / 21 / 29% | 19 / 27 / 40% | 6% |
| AUD/USD | 16 / 21 / 29% | 19 / 26 / 37% | 8% |
| USD/CAD | 13 / 19 / 25% | 23 / 32 / 44% | 8% |
| gold | 14 / 19 / 27% | 23 / 33 / 46% | 7% |
| NAS100 | 9 / 12 / 17% | 13 / 19 / 29% | 4% |
| SPX500 | 9 / 13 / 18% | 14 / 20 / 30% | 5% |

By 08:00 UK an FX pair has typically used a fifth of its eventual range; the New York
first hour uses more (a third on FX, a fifth on indices). The first London hour's high
or low survives as the session's extreme only 4–12% of the time — "the first hour sets
the day's range" is false nineteen times in twenty.

### T3 — A fast first two hours → the rest of the day. **PASS (range); continuation
is a strong base rate.**
Setup: first 2h after 07:00 UK ≥ 0.6 ATR14 (n=36–151). Full-session range is wider
mechanically (+0.45 to +1.03 ATR); the honest number is the range **after 09:00**:
EUR/USD +0.15 [+0.07, +0.25], GBP/USD +0.17, USD/JPY +0.39, AUD/USD +0.20, gold
+0.47, SPX500 +0.75 — all CIs clear of zero; USD/CAD +0.17 with the CI touching
zero; NAS100 n=36 unscored. At ≥0.8 ATR (R2) the after-09:00 effect holds on
EUR/USD (+0.22) and is unscored elsewhere (n<40). "Trend-day close" (close in the
top or bottom fifth of the range): **no different** from ordinary mornings anywhere
(43–56% vs 40–52%) — a fast start does not make a day close at its extreme. "Close
on the side of the 2h move": 80–91% on setups vs 60–72% on ordinary mornings, +14 to
+28pp with CIs clear on EUR/USD, GBP/USD, AUD/USD, USD/CAD, NAS100 and the R2 cells.
Stated trap: that share measures open→close and so contains the morning move
itself; the after-09:00 continuation (close vs the 09:00 price) was not registered
and is queued as T3b before anyone reads the 80–90% as "the afternoon continues".

## Batch 2 results (run 2026-09-18; designs frozen above before running)

### T3b — After-09:00 continuation. **NULL — T3's 80–90% was the morning itself.**
Close vs the 09:00 price continued the morning's direction in 47–60% of fast
starts (n=36–151) vs 48–52% on ordinary mornings; every difference inside ±10pp
with the interval across zero; mean after-09:00 move in the morning's direction
−0.10 to +0.16 ATR, all intervals across zero. So: a fast first two hours widens
the afternoon (T3 stands) but says nothing about which way the afternoon goes.
The T3 ledger entry is corrected accordingly.

### T4 — Opening-range breakout. **A base rate: the London first-hour range breaks
almost every day and price is back inside within the hour 83–86% of the time.**
Breakouts occurred in 99% of sessions (the first hour is ~22% of the day, T2).
Extended ≥ 0.5 × the opening range before returning: 24–32%. Back inside within
60 minutes: 83–86%. Session closed beyond the broken side: 50–52% on every
instrument (intervals straddle 50%). Fast-tape breaks (top speed tercile at the
break) followed through 5–8pp more often than slow ones on all eight, with the
intervals clear of zero, but below the pre-registered 15pp bar — consistent with
tape-speed persistence and reported as that, not as a breakout edge. Reading:
the London opening-range break is not a signal in either direction; the
first-hour range is simply too small to be a fence.

### T5 — Monday gaps (indices, gold). **Small gaps fill because they are small;
large ones mostly do not fill the same day.**
| gap (Monday open vs Friday close) | n | filled same session | within 5 sessions | Monday range vs matched |
|---|---|---|---|---|
| NAS100 < 0.25 ATR | 395 | 82% [78, 86] | 93% | −0.11 (calmer) |
| NAS100 0.25–0.5 | 71 | 61% | 83% | null |
| NAS100 > 0.5 ATR | 29 | 34% [17, 52] | 59% | too few |
| SPX500 < 0.25 | 381 | 81% | 93% | −0.19 (calmer) |
| SPX500 > 0.5 | 36 | 36% | 64% | too few |
| gold < 0.25 | 419 | 87% | 93% | −0.15 (calmer) |
| gold > 0.5 | 30 | 30% | 73% | too few |

"Gaps fill" is true of gaps a quarter of an ATR or smaller, and those Mondays run
calmer than ordinary sessions. A gap over half an ATR fills the same session only
about a third of the time (n≈30, thin).

### T6 — Calendar range profiles (range / ATR14; * = interval clear of the mean).
Monday is the quietest session on all eight (0.87–0.96×*). Thursday is the widest
on FX (1.05–1.09×*; Wednesday 1.05–1.10×* on several). The first two sessions of
a month run wider on seven of eight (1.09–1.16×*); quarter-end sessions run calmer
where they clear (GBP/USD 0.92, AUD/USD 0.88, NAS100 0.90, SPX500 0.92*); month-end
is mixed (USD/JPY 1.11* wider, the rest inside the interval). Friday: gold 1.07*,
USD/CAD 1.06*, others ordinary.

### What changed
- Book: T1 null (NR7 → calmer), T2 base rates, T3 validated range with the
  continuation base rate and its stated trap. Brief and chain read see all three.
- T3b run: the continuation is null; T3's ledger entry says range only.
- T4 (opening-range break: 85% back inside within the hour), T5 (gap fill by size),
  T6 (calendar profile) added to the book as base rates.
- Queued: T3 and T4 as live triggers once the watch reads intraday bars.
