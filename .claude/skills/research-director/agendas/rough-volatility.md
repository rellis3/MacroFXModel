# Agenda: rough volatility (is log realised volatility "rough", and does it change what we forecast?)

Set 2026-11-12 by research-director, from Quant Guild's lecture "Rough Volatility for Quantitative Finance" (Roman
Paolucci, https://www.youtube.com/watch?v=Io_f4G7a_Eo; intake note
`education/intake/technical/quant-guild/2026-11-12-volatility-is-rough.md`; **not C.OG**; a free walkthrough of
Gatheral, Jaisson and Rosenbaum on "a few hundred days" of five-minute S&P 500 bars from Interactive Brokers, rolling
realised-variance windows; slope 0.155 at q=1 with no interval, which he calls "an academic educational exercise"). A lead, not a source. Theme keywords for `evidence_map.mjs`:
`rough roughness hurst structure function realised vol HAR forecast`. Hand chosen cards to `research-protocol` to
claim. Logged beside it as the 2026-11-12 entry in `MD files/CLIP_WATCH.md`.

## What the lecture claims, and what holds

| Claim in the lecture | Verdict | Why |
|---|---|---|
| Log realised volatility is a latent process; proxy it with windows of squared returns | Sound | The standard frame, and the same object as `rv5` in the Step 0 tables |
| The q-th absolute increment moment of log vol scales as a power law, slope zeta(q) = qH, with H near 0.1 not 0.5 | **A published claim, contested** | Gatheral, Jaisson and Rosenbaum (2018, *Quantitative Finance* 18(6)) report H about 0.1. Cont and Das (arXiv 2203.13820, *Sankhya* 2024) argue the apparent roughness of realised volatility is mostly estimation error: a plain Brownian-driven volatility, measured through realised variance, already looks rough. Abstracts and summaries only; full texts not read this session |
| The estimated slope (0.155 on his sample) shows roughness | **Not yet** | His regression has no artefact control. The lecture says five-minute bars "shake out some noise" but never runs the same estimator on a process known to be smooth |
| Plain fractional Brownian motion cannot be the volatility (non-stationary); use a fractional Ornstein-Uhlenbeck process | Sound | Mean reversion is the right instinct, and the same instinct the desk's reverting weekly and monthly lines use |
| Wrong volatility dynamics gives wrong surface calibration and exotic prices | True for a derivatives desk | We do not calibrate surfaces or price exotics. This is outside the desk's job |
| Memory kernels are costly to simulate; Markovian lifting trades memory for speed | Engineering, not a market claim | Theory Lab material at most |

Sources: [Volatility is rough, arXiv 1410.3394](https://arxiv.org/abs/1410.3394) (the paper reports its rough forecast at
or ahead of HAR on one index, the gap larger at 20 days than at 1; table direction not re-checked) ·
[Rough volatility: fact or artefact?, arXiv 2203.13820](https://arxiv.org/abs/2203.13820).

## Evidence map (honest numbers)

- **We already forecast this object, and HAR is the benchmark the rough papers beat.** `forecast-pick` (VALIDATED):
  persistence 0.980 [0.974, 0.985] of the plain forecast, HAR-800 0.984; chosen for the daily lines.
  `vol-layer-rv5-increment` (VALIDATED): adding yesterday's and last week's M1 realised vol gives 0.9884 [0.9856,
  0.9910] of persistence, 32 of 34 better. A real gain, about 1.2%.
- **The ceiling on a better vol forecast is small.** `vol-target` (VALIDATED): which sigma is used does not matter for
  sizing (arms within about 0.03); better forecasts earn their keep on the range lines only. `iv-forecast`: HAR plus
  implied vol beats HAR on 7 of 7 (+5% to +21% on 21-bar realised vol). Implied vol, not model form, has been the
  big lever.
- **The fade over weeks is already an exponential half-life.** `horizon-reversion` (VALIDATED): weekly 0.968 of the
  sqrt-h line (33 of 33 instruments), monthly 0.936. A rough model implies a power-law kernel in its place.
- **Nothing on roughness itself.** No ledger entry or register row measures the Hurst exponent of log volatility. The
  repo's Hurst code (`hurstBench`, the trend engine) is a Hurst of **price returns** for trend and mean-reversion
  votes, a different object. `vix-brownian-scaling` (CONTEXT) measured VIX move scaling (variance ratio 0.50 at 20
  sessions, mean reversion), nearby but not the structure-function slope.
- **Data.** The `rv5` series lives in the Step 0 tables (`analysis/output/forecast_history/<SYM>.csv`, 34
  instruments, out-of-sample sessions 2020-08-21 to 2026-08-20, built from M1). **Those tables are not in the sandbox
  checkout** (only `CHECKS.md` is): they live on the laptop or in R2. So Q1 and Q2 need a session with the data, or the
  owner to supply the tables. Lockbox applies: nothing after 2026-08-21 scored.

## Mechanism

Why would volatility be rough at all? The literature's answer is order-flow structure: self-exciting trading
(El Euch, Fukasawa and Rosenbaum, from memory, not re-checked) makes volatility respond sharply and decay with a long
tail. If true it is a statement about how fast vol surprises arrive and fade, which is exactly what a range line has to
price. If it is an artefact of measuring volatility, there is no mechanism and no forecasting gain to chase.

## Cards, in rank order

### Q1. Is it rough on our series, or is that the proxy? — score 13/15

> Build the structure function of log daily realised variance for each of the 34 instruments, q from 0.5 to 3, lags
> 1 to 40 sessions. Read the slope. Then run the identical estimator on a simulated smooth-volatility process pushed
> through the same five-minute pipeline, and read where the real slopes sit against that band.

| | |
|---|---|
| Construct | log `rv5` per session; m(q, lag) = mean of |increment|^q; slope of log m on log lag = zeta(q); H = zeta(q)/q |
| Knowable when | descriptive; no forward outcome, no entry |
| Condition | whole sample, then split: FX vs indices vs gold, first vs second half, calm vs stressed volatility |
| Horizons | lags 1 to 40 sessions |
| Noise threshold | the artefact band: slopes from a simulated Brownian-driven stochastic volatility with matched noise and sampling, same estimator, 2,000 draws |
| Outcome distribution | H per instrument with interval, zeta(q) against q (is it linear?), real H against the artefact band |
| Benchmark / control / mirror | the simulated smooth-volatility control; implied-vol series (VIX, VXN, GVZ, OVX from the drill bundle, 2020-11 on) as the mirror: do they show the same slope |
| Mechanism | self-exciting order flow, or no mechanism if the band covers the data |
| Builds on | `vix-brownian-scaling` (CONTEXT, VIX variance ratio 0.50 at 20); the lecture's own regression; Cont and Das as the critique to beat |
| Data & power | rv5 Step 0 tables (not in the sandbox), about 1,500 sessions per instrument; descriptive, so the verdict word is CONTEXT |
| If yes → | rough and outside the artefact band: Q2 and Q3 become worth running; the Theory Lab gets a lesson with a live slope plot |
| If no → | inside the band: stop saying "volatility is rough" on this desk, close Q2 and Q3, note the Cont and Das result in the HAR lesson |
| Construct note | non-overlapping per-session log rv5 only; lag >= the proxy window (the lecture's overlapping rolling windows make short-lag increments mechanical); report H on two proxy specs (M1-built rv5 and a 1h-bar RV) |
| Falsifier | real slopes sit inside the smooth-volatility band, or zeta(q) is not linear in q; linear zeta(q) alone is not support, since a noise-driven artefact is also linear in q, so only the artefact band discriminates |

### Q2. Does a rough forecast beat HAR-800 on the range lines? — score 11/15, gated on Q1

> If Q1 finds roughness outside the band: forecast next-session log realised vol with the fractional-kernel
> conditional expectation (H fixed from Q1, fitted on the discovery years only), score it against HAR-800,
> persistence and the shipped persistence-plus-RV form, at 1, 5 and 20 sessions.

| | |
|---|---|
| Construct | rough forecast of log rv5 at horizon h from the last 200 sessions of log rv5, converted to a sigma line |
| Knowable when | prior close; scores the next session's range |
| Condition | none first; then calm vs stressed volatility (where the papers say it helps most) |
| Horizons | 1, 5, 20 sessions |
| Noise threshold | the paired bootstrap spread of the HAR-800 vs persistence gap, about 0.3% on 34 instruments |
| Outcome distribution | pinball and QLIKE ratio to HAR-800 by instrument, fold and regime |
| Benchmark / control / mirror | HAR-800 (the shipped base), `vol-layer-rv5-increment` form (0.9884 of persistence); mirror: an exponential-kernel forecast with the same number of parameters |
| Mechanism | as above; a longer, power-law memory should help most at 5 to 20 sessions |
| Builds on | `forecast-pick`, `vol-layer-rv5-increment`, `ladder-calibration`, `iv-forecast` |
| Data & power | rv5 Step 0 tables; the rv5 study had interval width about 0.3% across 34 instruments, so a 1% gap is detectable; the literature's own gap to HAR is small at one day |
| If yes → | a new forecaster candidate for the lines, a shadow arm beside HAR-800, nothing live |
| If no → | ledger entry null or underpowered; the Q1 result stays descriptive; no forecaster built |
| Falsifier | no better than HAR-800 beyond its own noise, or only better in the sample used to fit H |

The ceiling is honest: the best gain the volatility-forecast work has banked is about 1.2% (rv5) and a better sigma does
not change sizing (`vol-target`). A yes here is a small improvement to the lines, not a new edge.

### Q3. Power-law fade or exponential half-life for weekly and monthly lines? — score 10/15, gated on Q1

> Horizons 5 to 60 sessions: does letting volatility fade toward its long-run level through a power-law kernel
> calibrate the weekly and monthly range lines better than the exponential half-life the shipped lines use?

| | |
|---|---|
| Construct | the 250-day-level fade with kernel (a) exponential, (b) fractional, same free parameters |
| Condition | calm, normal, stressed by the existing state tercile |
| Horizons | 5, 10, 20, 40, 60 sessions |
| Benchmark / control / mirror | `horizon-reversion` weekly 0.968 and monthly 0.936 of sqrt-h; exponential-kernel arm as the mirror |
| Builds on | `horizon-reversion`, `ladder-calibration` |
| Data & power | same tables; weekly and monthly overlapping windows, clustered by month |
| If yes → | a candidate for the "Forecast Weekly · Reverting" export; shadow only |
| If no → | the exponential half-life stays; no change |
| Falsifier | power-law kernel adds under 1% in pinball beyond the exponential one |

## Parked

- **Rough Heston or quadratic rough Heston calibrated to the 0DTE skew.** The desk does not price exotics, has no
  calibration engine, and the ES options data (Databento, quarterly series) is for the gamma work. A large build with no
  line, page or decision that depends on it. Revisit only if the owner wants option-model work.
- **Markovian lifting and neural pricing surrogates.** Engineering for pricing. Theory Lab only.
- **Roughness at five-minute resolution rather than daily.** Needs the M1 on the laptop, and the artefact problem is
  worse the finer the bars. After Q1, if Q1 survives.

## Teaching (not research)

The Theory Lab has `heston-model`, `fractional-brownian-motion` and `institutional-har-rv`, and nothing between them.
A short lesson on the structure function and the slope as a measurement, **with the Cont and Das critique in the same
box**, is worth writing after Q1 so the live plot is our own series and the verdict word is ours. Written before Q1 it
would state a contested claim as settled.

## Housekeeping

- `plans/vol-layer/L1_LITERATURE_SPEC.md` lists the forecaster literature with verification marks and has no
  roughness entry; add the two papers above, unverified, when a card is claimed.
- Q1 to Q3 are one family on the same seen window (2020 to 2026-08): count them together for multiplicity, and Q1 is
  descriptive so it carries none.

## Owner calls

(none yet)
