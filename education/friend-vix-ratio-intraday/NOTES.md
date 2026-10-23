# A friend's intraday VIX-per-index ratio study (received 2026-10-23)

This is a friend's analysis, not C.OG's and not ours. Rich shared it on 2026-10-23 as three phone screenshots, saved
next to this file. The friend isn't named in what was shared. It is their own version of C.OG's VIX-to-Nasdaq ratio idea
(`education/cog-snippets.md` §3 and §3b).

- `1_es_chart.png`: title, method and the ES chart
- `2_nq_chart_and_notes.png`: the NQ chart and their conclusions
- `3_table.png`: the numbers

## What they did (their words, from the screenshots)

> **When VIX reacts hard, ES leans up afterwards.** The ratio: how much VIX moves for every 1% the index moves since
> the session start (10:00 ET). Sign-adjusted so bigger = VIX reacting harder. Bars show what the index did from that
> hour to 16:55, in units of its normal move (+ = up). In-sample 2016–2020, hourly readings, measurement only.

Hourly readings fall into three buckets: VIX barely reacting, middle, and reacting hard. Each day is split by whether
the index was down or up since 10:00.

| Index / day | Barely | Middle | Hard | Years same way |
|---|---|---|---|---|
| ES · down since 10:00 | −0.039 | +0.005 | +0.081 | 4/5 |
| ES · up since 10:00 | +0.035 | +0.086 | +0.133 | 5/5 |
| NQ · down since 10:00 | +0.040 | +0.027 | +0.033 | 3/5 |
| NQ · up since 10:00 | +0.119 | +0.165 | +0.104 | 3/5 |

Their conclusions, verbatim:

> **ES:** on down days a hard VIX reaction (fear overdone) is followed by a small bounce; on up days a hard VIX fall
> (relief) is followed by more upside. Same direction in 4/5 and 5/5 years — consistent, but small (rank correlation
> 0.00–0.12).
>
> **NQ:** no consistent pattern (3/5 years either way).
>
> **Typical ratio:** ES ≈ 4.2 (VIX +4.2% per −1% ES), NQ ≈ 2.8. How fast the ratio changes (dR/dt) is mostly noise at
> hourly resolution and is not shown.

## How it sits next to our two daily tests (ours)

Our studies are daily, from 2009 to the 2026-08-21 lockbox, pre-registered, with three periods, placebos and a
multiple-testing correction. Theirs is intraday and in-sample only, 2016–2020.

| Question | Friend, intraday | Us, daily |
|---|---|---|
| VIX reacting hard against the index, then the index | **ES:** small lean up (rank correlation 0.00–0.12). **NQ:** no pattern. | **NQ:** the 20-session level adds nothing (`vix-beta-level`; bottom decile → next 5 sessions −0.003 SD, null). The unsigned ratio's extreme predicts the VIX falling, not Nasdaq's direction (`vvix-ratio-range`). |
| dR/dt | "Mostly noise at hourly resolution", not shown | **Bottom tenth → Nasdaq +0.57% over the next 5 sessions** (`vix-beta-change`, t 3.0, research only) |

**Where they agree:**

- Neither finds that a hard VIX reaction leads to **further falls**. Wherever there is a lean, it is up, which fits
  "fear overdone".
- On NQ, neither finds anything from the ratio *level*. Their NQ null matches our level null.

**Where they differ:**

- They find nothing in dR/dt hourly. We find something in its 5-session change. These are different timescales, not a
  contradiction: an hourly change of a since-10:00 ratio is a very noisy number.
- Their ES lean is ES only. We haven't tested ES daily.

**What their result hasn't had yet (before treating it as a finding):**

- It hasn't been checked on years outside 2016–2020.
- There is no correction for 4 rows × 3 buckets and for choosing buckets after seeing them.
- No placebo yet.
- "Years same way" is a count, not a test: 5/5 by chance is about 1 in 32 for a single row.
- Its effects are in units of a normal move, with no costs. +0.13 of a normal ES move from that hour to 16:55 is small
  next to ES's spread and slippage.

**Possible next step:** test their ES rule out-of-sample on 2021–2026, exactly as they define it. That needs intraday
ES and VIX history. The IB legs give about 60 days of intraday VIX, so the history would have to come from another
source first.
