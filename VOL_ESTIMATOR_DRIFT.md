# Vol-estimator drift: bot/book σ vs live forecaster σ

**Status: KNOWN DRIFT — deferred, monitoring (2026-07-02).**
Decision: do **not** align yet. Watch it; escalate to a fix only if the signal
below crosses threshold. Raised from a live gold + eurusd level comparison
(bot bands vs forecaster bands).

## What diverges

The live forecaster (`js/volForecast.js` `computeForecast`) was migrated
estimator-by-estimator through Jun-2026. The bot's plan producer and the
per-line **book** both source `volSigmaSeries`
(`js/forecastCore.js:260`, mirrored in `js/volBacktestEngine.js`), which was
**never brought along**. So the σ that sizes the bot's live bands no longer
matches the σ the forecaster shows.

| Asset class | Bot / book (`volSigmaSeries`) | Forecaster (`computeForecast`) | Gap |
|---|---|---|---|
| commodity (gold) | **HV20** | **Yang-Zhang** | **large** — HV20 holds prior-week run-up vol ~20 sessions; YZ sheds in days. Measured HV20 +19.8% vs ref, YZ +1.6% (`volForecast.js:426`). |
| index (de30/uk100) | GARCH(1,1), **legacy ω** | GARCH(1,1), **interim ω/β** (faster decay, `garch_omega_interim`/`garch_beta_interim`) | moderate — same family, different persistence |
| fx (eurusd) | Yang-Zhang(30) | Yang-Zhang(30) | **small** — estimator identical; residual is only (a) correction constants + (b) news multiplier |

Secondary drift, all asset classes — the empirical correction constants differ
between the two files:

| fx constant | bot (`volBacktestEngine.js:33`) | forecaster (`volForecast.js:124`) |
|---|---|---|
| oc_50 / oc | 1.038 | 1.10 |
| oc_75 | 1.015 | 1.08 |
| hl_50 | 0.965 | 1.04 |
| hl_75 | 0.912 | 0.99 |

Plus: the forecaster inflates σ by `newsMult` on US-event days
(`volForecast.js:450`); the bot's plan producer does not. Quiet day ⇒ they
track; event day ⇒ forecaster jumps wider.

## Why not fix now

`volSigmaSeries` is the exact math the **per-line book was learned on**, and
CLAUDE.md deliberately keeps the bot bit-identical to that book (the plan must
never source the live forecast). Changing any estimator path means re-baking
the book and re-validating OOS (old-σ book vs new-σ book A/B) — otherwise the
plan and the book it executes silently drift apart. That's a deliberate task,
not a hotfix, so it waits.

## Watch signal (what "monitor" means here)

Per pair, roughly weekly, compare the bot plan's σ/bands against the live
forecaster's for the same session:

- **fx** — expect near-match on quiet days. Escalate if the OC-med band gap
  exceeds ~10% on a **non-news** day (would mean the constant drift, not news,
  is biting).
- **commodity** — expect the bot wider after any multi-day run. Escalate if the
  bot's realized band-hit rate degrades (fades getting run over because bands
  are too wide to be reached, or too wide to fade profitably) — i.e. watch the
  per-line book's OOS on gold, not just the level gap.
- **index** — watch after a vol spike; the legacy-ω bot will lag the
  interim-ω forecaster in shedding it.

The trigger to actually do the alignment is **behavioural**: bot fade/follow
performance on gold (or index) visibly hurt by stale-wide bands. A cosmetic
level gap alone is not enough — the book is internally consistent with its own
σ; the question is whether that σ is empirically too wide to trade well.
