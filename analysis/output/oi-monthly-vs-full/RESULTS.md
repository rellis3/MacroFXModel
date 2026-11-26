# oi-monthly-vs-full: is the Databento (monthly / quarterly only) OI history a fair stand-in for full-book OI Profile levels?

**Exploratory, not pre-registered** (2026-11-26, owner question). Register row `oi-monthly-vs-full`. No outcome is scored here; this is a
structural comparison of two builds of the same book.

## What was done

- Our own nightly QuikStrike capture (`oi_raw_<date>`, local cache `data/oi_raw_cache/`), weekdays 2026-08-20 .. 2026-11-23, 11 instruments,
  718 instrument-dates (11 dropped for no forecast σ, 19 where even the full build gives no profile).
- Each instrument-date built **twice** through the live path (`buildOIEntry` -> hedging map maxDte 3 -> `buildOiProfile`, strongest book,
  ±3σ window, σ = that day's vol forecast), exactly as `/api/oi-profile/export` and `scripts/oi-profile-lines/replay.mjs`:
  1. **full**: the matrix as captured;
  2. **monthly-only**: every expiry column outside the standard family blanked (the family Databento holds: `OG` gold monthlies;
     `EUU/GBU/JPU/ADU/CAU/CHU` FX monthlies; `NQ`, `ES`, `YM`, `RTO` quarterlies only).
- Expiry family is read from the series code on each matrix column (`OGZ6` standard, `OG3X6` / `G4WU6` weekly; `JPUZ6` standard, `4JYX6` /
  `MJ2Z6` weekly). All 1,056 captures had a complete code per column once the code pattern allowed a leading digit or single letter
  (the live parser's narrower pattern drops `4JYQ6` and `G4WU6`; it only affects this script, nothing live).
- Also an **all-expiry aggregate** (every kept column summed, walls and max pain within ±4σ of spot, in spot terms), closer to how the
  Databento studies built walls.
- Distance = |full − monthly-only| in units of the day's σ. **0.25σ** is the touch tolerance of the line studies, so "within 0.25σ" means
  a study would treat it as the same line. A day where the monthly-only build has no line of that type counts as a miss.

Scripts: `scripts/oi-monthly-vs-full/compare.mjs` (build), `score.py` (summary). Numbers: `results.json`.

## Results

Share of the book in weekly / daily expiries (median day), and how often the strongest line of each type lands within 0.25σ of the full
build (days a standard expiry was in the capture):

| Instrument | Days monthly in capture | Weekly/daily share of OI | Call wall | Put wall | Gamma peak | Max pain | Zero gamma (hedging map) | PIN/BREAKOUT agrees |
|---|---|---|---|---|---|---|---|---|
| Gold | 100% | **2%** | 99% | 96% | 96% | 100% | 8% | 84% |
| USDCHF | 100% | 4% | 86% | 87% | 79% | 100% | 48% | 76% |
| USDCAD | 100% | 11% | 70% | 78% | 79% | 100% | 11% | 63% |
| AUDUSD | 100% | 14% | 84% | 87% | 76% | 100% | 9% | 81% |
| GBPUSD | 100% | 15% | 81% | 82% | 70% | 100% | 11% | 73% |
| USDJPY | 100% | 17% | 64% | 70% | 57% | 100% | 13% | 72% |
| EURUSD | 100% | 18% | 70% | 79% | 75% | 100% | 6% | 88% |
| NQ | 34% | **54%** | 39% | 61% | 26% | 71% | 17% | 74% |
| SPX | 34% | **72%** | 65% | 65% | 44% | 83% | 14% | 74% |
| US2000 | 34% | 44% | 57% | 87% | 44% | 100% | 8% | 100% |
| US30 | 25% (12 days) | 20% | 89% | 91% | 83% | 80% | — | 100% |

When a line does move it moves a long way: the p90 distance for walls and the gamma peak on FX is 1–2.5σ (a different strike, not a nudge).

All-expiry aggregate walls (all days; indices count the days with no quarterly as misses): gold call / put wall / max pain within 0.25σ
on 93% / 91% / 90% of days; FX call wall 54–100%, put wall 61–100%, max pain 36–88%; NQ / SPX 13–30%.

Notes:
- **Vanna flip** matched on 100% of days everywhere because it comes from the IV smile paste, not the OI matrix; this comparison says
  nothing about it.
- **Zero gamma and the PIN/BREAKOUT regime** come from the hedging map, which only uses expiries ≤ 3 days away. A monthly-only book has
  one only in expiry week (the map was on 15–18% of days monthly-only vs 73–100% full), so outside that week the zero-gamma line simply
  isn't there, and the regime falls back to the net-GEX sign. This is a property of the build, not a data error.
- **Indices**: our capture of NQ/ES/RTY only reaches about 30 days to expiry, so the quarterly is in it on about a third of days. On the
  other two thirds this comparison can't be made at all, and the "full" book is itself missing the far quarterlies Databento has.

## Verdict (plain words)

- **Gold: yes, a fair stand-in** for walls, gamma peak and max pain (weeklies hold ~2% of the OI; the lines are the same strike on
  95–100% of days). Not for the short-dated zero gamma or the PIN/BREAKOUT call, which need the weeklies.
- **FX majors: mostly.** Weeklies hold 4–18% of the OI. The strongest walls and gamma peak are the same line on roughly 6–8 days in 10;
  on the rest they sit 1–2σ away. Usable for wall/gamma-peak studies with that noise stated; USDCHF best, USDJPY worst. Zero gamma and
  regime: no.
- **NQ / SPX / US2000: no.** Weeklies and dailies are half to three quarters of the near book even on the days the quarterly is
  captured, and the gamma peak matches on only a quarter to under half of them. A quarterly-only history (Databento NQ/ES) describes a
  different book from the one education's gamma maps (and our live export) use. US30 looks closer but rests on 12 days.

Consequence: Databento history can power multi-year tests of **gold and FX walls / gamma peak / max pain** (the question underpowered on
our 66-day capture). It cannot stand in for index gamma levels, zero gamma, or the regime; those need our own capture as it grows, or
the weekly/daily families bought separately.
