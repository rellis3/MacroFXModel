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

### What changed
- Book: T1 null (NR7 → calmer), T2 base rates, T3 validated range with the
  continuation base rate and its stated trap. Brief and chain read see all three.
- Queued: T3b (after-09:00 continuation, close vs 09:00); T3 as a live trigger once
  the watch reads intraday bars.
