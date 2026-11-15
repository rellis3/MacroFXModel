# hold-day-one-confirm — When a day closes ≥ 1σ one way, does the way it closed (at its extreme, fast, through the p90 band, on a tier-1 event) say whether it keeps running over the next one to five days, and does holding it from 21:00 with a 1σ stop pay?

**Pre-registered 2026-11-14, before any outcome was computed.**

| | |
|---|---|
| ID / ledger id | `hold-day-one-confirm`; six scored ledger entries (§4): `hold-day-one-confirm-run`, `-close`, `-speed`, `-band`, `-event`, `-hold-r` |
| Branch | `claude/signal-bot-bias-analysis-bwr1qv` |
| Register row | `plans/RESEARCH_REGISTER.md` → `hold-day-one-confirm` |
| Data | EURUSD GBPUSD USDJPY AUDUSD USDCAD USDCHF NZDUSD EURJPY GBPJPY GOLD NQ SPX500 US30. OANDA mid M1 (day one and the forward paths); production point-in-time σ and ladder widths (`analysis/output/vf3_stage_b/part1_lines.parquet`, `oos == 1`). Day-one London sessions **2020-08-24 → 2026-08-21**; every forward window must also end on or before 2026-08-21 (the lockbox); nothing after it is read |
| Seed | `20261114` (every script in this study) |
| Uncertainty | moving-block bootstrap over **dates** (all instruments of a date move together), block 21 sessions, B = 2000; SE floor = Monte-Carlo null SD on the real setup dates (§3.8) |
| Scripts / outputs | `scripts/hold-day-one-confirm/` → `analysis/output/hold-day-one-confirm/` |
| Harness | own Python script (multi-day forward paths and a stop on M1; `runStudy.mjs` / `study.mjs` have no multi-session path). Power: `scripts/hold-day-one-confirm/power_sim.py` (reads setup-side columns and unconditional control moments only). The M1 is not in this container: **the owner runs the runner on the laptop** |

## 1. The claim (required)

Daily-bias agenda Q6 (`.claude/skills/research-director/agendas/daily-bias.md`, Part 2, added 2026-11-14; owner: "what
would improve the bias so we can take the trade and hold?"):

> *Take every day an instrument closed ≥ k·σ in one direction. Map the next one to five days against how that day closed
> (at its extreme or not), how fast it got there, how much of its band it used, and whether a tier-1 release or a macro
> view was behind it. Read where continuation lives, against same-size days that closed mid-range.*

Card falsifier: *outer-close days continue no more than mid-close days at any horizon.* The card's two outcomes: if yes,
the 21:00 review gets a rule, "hold only when day one confirmed"; if no, "holding overnight is not supported; trade the
day and re-enter". The owner's brief adds an R version: hold from 21:00 on day one with a 1σ stop, against staying flat.

**Edge source (lesson #4).** A forecasting claim about **direction after information**: slow-moving money and
repositioning carry a decisive day on (close-location value is the classic "who won the day" read). The opposite view
has evidence in this repo: late New York reverts intraday moves (`reversal-hour`), and the plain 4h-trend hold loses
(`h4-trend-hold`, exploratory). Who is on the other side if it works: liquidity providers fading the late move and
mean-reversion books. What would crowd it out: everyone reads the same daily candle.

## 2. Why it is not already settled (required)

Nearest entries in `js/deskEvidence.js`:

| Entry | Verdict | Why it does not answer this |
|---|---|---|
| `band-reach-from-here` | VALIDATED | intraday range: reaching p50 early raises P(p75) **before the close**. Nothing past 21:00, and no direction after the day |
| `fast-start-rest-of-day` | VALIDATED | a fast first 2h widens the afternoon; the afternoon's direction is a coin flip and a trend-day close is not more likely. Same-day only; here the fast start is a day-one feature and the outcome is days later |
| `extreme-in-probability` | VALIDATED | P(running extreme is the final one) within the day. Says when a move is done **today**, not whether it resumes tomorrow |
| `tape-speed-persistence` | VALIDATED | speed persists 15 min → next hour; size, not multi-day direction |
| `reversal-hour` | VALIDATED | 20:00–22:00 UTC reverts intraday moves. A confound here (our entry is 21:00 London, inside or next to that window), named in §7 and read through the +1 cell |
| `h4-trend-hold` | exploratory (register) | 07:00 entry on the 4h slope, hold if same sign at 21:00: −0.11R a trade. Not conditioned on how day one closed; not pre-registered |
| `overnight-hold-*` (fx, nq, gold) | NULL / UNDERPOWERED | an unconditional long 20:00 → 14:30. No day-one condition, no side from the day |
| `gr-hmm-trend-direction`, `gr-dollar-tape-direction`, `fx-factor-momentum` | NULL / UNDERPOWERED | next-day or next-month direction from slow trend signals; not from the shape of one decisive day |
| `close-window-momentum*` | NULL / CONTEXT | intraday last-half-hour momentum; ends the same day |
| `cb-tone-direction` | NULL | FOMC first-30-minute reaction → next day; one event family, no close-location or σ condition |
| `post-fomc-usd-drift` | VALIDATED (FRAGILE) | the dollar drifts 5 sessions after FOMC. The only multi-day drift in the book; the `-event` cell here asks whether a big tier-1 day carries more than a big ordinary day, across all three tier-1 families |
| `jump-next-day-miss` | CONTEXT | next-day **range** after a jump day; not direction |

None conditions forward direction on how a σ-sized day closed. It is not a re-cut of a banked null: the conditioning
variable (close location, speed, band, event, all on a ≥ 1σ day) has never been scored, and the trend-signal nulls
above used slow signals, not one decisive day.

## 3. Definitions, fixed in advance (required)

### 3.1 Sessions, keys, data

- Day one d: a London calendar weekday with a row in `part1_lines.parquet` (`oos == 1`) for the instrument
  (US30 is `DOW` there; M1 key `us30`). Joined by **date**, never row position (stats-defaults 2026-10-24); the runner
  asserts every join and prints match shares.
- M1: OANDA mid, `VolRangeForecaster/data/m1/{key}_m1.parquet` (FX, gold) and `portfolioBacktest/cache/` (nq, spx500,
  us30), loaded with `forge.bars.load_m1`, timestamps converted to Europe/London (never a fixed UTC hour). M1 at or
  after 2026-08-21 21:00 London is never read (`M1_CUTOFF` asserted). If an instrument's M1 is missing on the laptop
  the runner stops and lists it; the study does not run on fewer than the 13 without an amendment.
- σ1 = `pit_sig_used` of (instrument, d): the shipped point-in-time daily σ (NY-close bars from M1, walk-forward,
  × the event multiplier), % of price (data-rules item 2). Known before day one opens. Fixed for the whole forward
  window. Ladder widths w50, w75, w90 = `pit_oh_p50/p75/p90` (up) or `pit_ol_p50/p75/p90` (down), % of price.

### 3.2 Day one (07:00 → 21:00 London)

- Window W = M1 bars starting 07:00 ≤ t < 21:00 London on d. O = open of the first bar (must start 07:00–07:04);
  C = close of the last bar (must start 20:55–20:59); H, L = max high, min low over W. Coverage ≥ 756 of 840 minutes.
  A day failing any rule is dropped as a day one and counted per instrument (US half-days fall out here).
- m = 100·(C − O)/O; z1 = m/σ1; side s = sign(m).
- **Setup (big day):** |z1| ≥ **k = 1.0**. (k = 0.75 and 1.5 are descriptive only.)
- **Close location** q = (C − L)/(H − L) if s > 0, (H − C)/(H − L) if s < 0 (1 = closed at the extreme in its own direction).
  - **STRONG**: q ≥ 0.90 (the outer 10% of the range).
  - **MID**: q < 0.75 (closed off the extreme, in the body of the range). 0.75 ≤ q < 0.90 is in neither class; it is in the decile ladder.
  - Fixed wider than "the middle third" because a ≥ 1σ day rarely closes mid-range: on the setup-side proxy (§5)
    the 10th percentile of q on big days is 0.72 and only 8% sit in [0.30, 0.70).
- **Speed**: the p50 level in the close direction, P50 = O·(1 + s·w50/100). t50 = minutes from 07:00 to the first M1 bar
  whose high (s > 0) or low (s < 0) reaches P50. **FAST**: t50 ≤ 120 (reached by 09:00, the `fast-start-rest-of-day`
  window); **SLOW**: t50 > 120. A ≥ 1σ close is beyond P50 (w50 ≈ 0.62σ), so every setup has a t50; the runner asserts it.
- **Band used**: **P90** = the move from O in the close direction reached O·(1 + s·w90/100) at some bar in W; **NOP90** otherwise.
- **Event**: **EVT** = `event` ∈ {NFP, CPI, FOMC} on d; **NOEVT** = `event` ∈ {none, high}. `unknown` (calendar
  coverage ends 2026-07-02) is excluded from this split only, never imputed.
- **THE MIRROR, FADED**: a day whose excursion from O reached ≥ k·σ1 in direction s′ (s′·(H or L − O)) but whose close
  kept < 50% of that excursion in s′. If both directions qualify, s′ = the larger excursion. The side for the forward
  read is s′ (the direction that faded). A FADED day may also be a big day; it keeps both labels.
- **Macro side** (desk rating / Global Read) is **not** a feature: that history starts 2026-10-14 / 2026-11-03, after
  the lockbox. It stays in agenda Q10's forward record.

### 3.3 Forward outcome (21:00 → 21:00)

- Sessions after d are the instrument's next valid London weekday sessions (§3.2 close rule; a holiday is skipped, so h
  counts trading sessions). P_h = C of session d+h (last bar starting 20:55–20:59 London).
- **Continuation** R_h = s · 100 · (P_h − C)/C / σ1, in σ1 units, h ∈ {1, 2, 3, 5}. A row whose d+h falls after
  2026-08-21 or lacks a valid close is dropped for that h and counted.
- **B0 drift**: per instrument, b = expanding mean of the one-session 21:00 → 21:00 move / σ1 over all sessions dated
  before d (min 120 sessions, else 0). B0_h = s·h·b.
- Path quantities: MFE_h and MAE_h (σ1 units, from the M1 path after 21:00 on d to P_h); the share reaching +1σ1
  before −1σ1 within 5 sessions.

### 3.4 The R version (hold from 21:00 day one, 1σ stop, vs flat)

- Entry at C (21:00, mid) in side s; 1R = σ1; stop at C·(1 − s·σ1/100). Exit at P_h (21:00 on session d+h) or at the stop,
  whichever is first, checked on every M1 bar from 21:00 on d. Fill at the stop price, or at the bar's open when the
  bar opens beyond the stop (weekend and news gaps; MAE from the real path, data-rules item 6).
- Cost **0.03R** a round trip (as `h4-trend-hold`); sensitivity 0.06R (the 21:00 rollover spread is wider) and −0.01R
  a night for financing (descriptive; financing is not otherwise modelled).
- One open position per instrument: a setup that arrives while that instrument's trade is open is skipped and counted.
- Flat = 0R. **Management placebo (lesson #27)**: the same entry time, stop, exit and one-position rule on every valid
  instrument-day with a seeded coin-flip side. Its mean must sit within ±0.02R of −cost (pipeline check); the scored
  effect is read against it (§4).
- Legs reported (lesson #20): P(win), E[win], E[loss], payoff ratio, stopped share, the share of P&L from the top 10%
  of trades, expected shortfall of the worst 5% (lesson #26).

### 3.5 Pooled statistic (the scored form)

For a cell X with per-horizon means X_h (σ1 units or R): **P̄(X) = ¼ Σ_h X_h / √h**, h ∈ {1, 2, 3, 5}, in σ per √day.
One number per question keeps the scored count at six and does not split α over horizons; per-horizon values are
reported beside it with their own intervals (descriptive, BH). A one-off jump that persists scores ≈ 0.70× its size;
a steady drift of δ a day scores ≈ 1.64·δ.

### 3.6 Split (fixed)

No parameter is fitted; every threshold above is fixed here. **H1 (fit half)** = day ones 2020-08-24 → 2023-08-18;
**H2 (test half)** = 2023-08-21 → 2026-08-21. Both halves enter the stability gate (G2). Descriptive ladders (q deciles,
t50 bins, z1 bins) may be read on H1 to propose a new threshold; any such threshold is a candidate for its own
prereg and is only reported on H2, never scored here.

### 3.7 De-clustering

Every qualifying instrument-day is kept (each is a real 21:00 decision); overlapping forward windows on one instrument
are handled by the date-block bootstrap (block 21 ≥ h). Sensitivity (descriptive): thinned, no new setup on an
instrument within h sessions of the last one taken. The R version uses the one-position rule (§3.4). Big days cluster
on the same dates across instruments (USD days); the bootstrap and the Monte-Carlo SE are by date for that reason.

### 3.8 Uncertainty, placebo, p-values, positive control

- **Bootstrap**: moving-block over day-one dates, block 21, B = 2000, seed 20261114; each resample recomputes B0, the
  class means and P̄. 95% percentile CIs.
- **SE floor (stats-defaults 2026-11-04)**: the runner reruns `power_sim.py`'s generator on the **real** setup dates
  and classes (synthetic correlated forward paths, 300 draws, no outcome read) and takes **SE = max(bootstrap SE,
  MC SD)**. p = two-sided normal from P̄ / SE (`pFromCI` logic), stated as such.
- **Shifted-date placebo (stats-defaults 2026-10-21, 2026-11-07)**: shift every day-one label (setup, side, σ1, class)
  by s sessions against the forward-outcome series, the same s for all 13 instruments (whole-date clusters),
  s ∈ {25, 30, 35, …, n − 25}, circular; recompute P̄ for each s. Gate on the real value's percentile in that
  all-shift distribution, and report its SD beside the bootstrap SE.
- **Positive control (lesson #1), before any real forward outcome is read**: the runner's exact pipeline on the real
  day-one table with synthetic forward paths from the power generator. (a) Planted drift +0.15σ a day in side s on
  STRONG days only: `-run`, `-close` and `-hold-r` must pass G1–G3. (b) Planted 0: no scored cell may pass G1 + G3, and
  the management placebo must come out within ±0.02R of −cost. Output `analysis/output/hold-day-one-confirm/positive_control.json`.
  If it fails, fix the code; no real forward outcome is scored until it passes.

## 4. Hypotheses, expectation first (required)

| # | Ledger id | Statistic (P̄, §3.5) | Pre-registered expectation |
|---|---|---|---|
| a | `-run` | STRONG continuation minus B0 | **Null to slightly negative**: ≈ −0.02 (late-NY reversion takes a little back at +1; nothing after). FX daily momentum has been nil everywhere in the book |
| b | `-close` | STRONG − MID (MID reweighted to STRONG's instrument and z1-bin mix: z1 ∈ [1, 1.5), [1.5, 2), ≥ 2) | **Null**: \|P̄\| < 0.05 |
| c | `-speed` | FAST − SLOW (big days) | **Null** (`fast-start-rest-of-day`: the afternoon's direction was a coin flip) |
| d | `-band` | P90 − NOP90 (big days) | **Null** |
| e | `-event` | EVT − NOEVT (big days, `unknown` excluded) | **Small yes on USD pairs, pooled ≈ +0.03 to +0.06** (the FOMC drift), underpowered |
| f | `-hold-r` | STRONG hold R net of cost minus the management placebo's R (both P̄) | **Null**: STRONG ≈ −0.02R (the cost), placebo ≈ −0.02R, difference ≈ 0 |
| — | **THE GATE** (each scored cell): **G1** P̄ 95% CI lower > 0 **and** Holm-adjusted p < 0.05 over the six cells; **G2** P̄ > 0 in both H1 and H2; **G3** real P̄ above the 95th percentile of the all-shift placebo; **G4** (`-hold-r` only) STRONG hold P̄ net of cost has its own CI lower > 0 (it beats flat as well as the placebo); **G5** (`-run` and `-close` only) the mirror below | |
| — | **THE MIRROR** | FADED continuation minus B0 (P̄, in the faded direction s′) | Expect ≤ 0. G5: P̄(STRONG) − P̄(FADED) has CI lower > 0. If FADED days "continue" as much as STRONG ones, the effect belongs to big days, not to how the day closed, and `-close`/`-run` cannot be VALIDATED (CONTEXT at most) |

**Verdict per ledger id** (U = useful effect = **+0.10σ per √day** on P̄, ≈ 0.10σ at +1 session; the R cell in R):

| Result | Word |
|---|---|
| G1–G3 pass, plus G4/G5 where they apply | `VALIDATED` (research-only; promotion to anything that sizes or gates a live position needs \|t\| ≥ 3 or a forward record) |
| G1 passes but G2, G3, G4 or G5 fails; **or** the cell is significant in the opposite sign (CI upper < 0 and Holm p < 0.05) for `-run`, `-close`, `-speed`, `-band`, `-event` (a reversal is information, described as such) | `CONTEXT` |
| G1 fails and the P̄ 95% CI upper bound < U (for `-hold-r`, also any significant negative) | `NULL` |
| Otherwise, including every cell marked UNDERPOWERED in §5 that comes back without a pass | `UNDERPOWERED` |

"Which features keep running" is answered by which of `-close`, `-speed`, `-band`, `-event` come back VALIDATED.
A horizon is named as "where it lives" only when its pooled cell is VALIDATED and that horizon's own CI excludes 0.

## 5. Power — what this design can and cannot find (required)

From `scripts/hold-day-one-confirm/power_sim.py` (seed 20261114, 300 draws; run 2026-11-14:
`python -I scripts/hold-day-one-confirm/power_sim.py 300 1.0`). It reads, from `part1_lines.parquet` only:
(1) the **setup side** on the 00:00–22:00 London session as a proxy for 07:00–21:00 (|OC|/σ, close location from
`r_oh/r_ol/r_hl/r_ocs`, first-touch minute `ft_OH/OL_p50`, p90 reach, the event tag) to count each cell, and (2) the
**control moments** over all days: per-instrument SD of OC/σ (0.99–1.09) and the 13 × 13 correlation of OC/σ. No
forward move is read. Forward paths are synthetic correlated Gaussian days (24 sub-steps a day for the stop). Assumption:
07:00–21:00 carries ≈ 75% of the day's variance, so a 1σ close on the window ≈ 1.15σ on the proxy. Real counts are known
only on the laptop; **the runner recomputes this table on the real setup dates before reading any forward outcome**
(§3.8) and its column decides POWERED / UNDERPOWERED (a registered rule; no outcome is involved).

Planned counts (proxy, k = 1.0, 2020-08-24 → 2026-08-20, 19,973 instrument-days): big days 4,648 (23%) on 1,209 dates;
STRONG 2,268 (859 dates); MID 617 (358); FAST 2,289 / SLOW 2,359; P90 3,297 / NOP90 1,351; EVT 713 (139 dates) / NOEVT 3,837;
FADED 2,042 (859 dates). The effective sample is about the number of dates, not instrument-days: the MC SD of the STRONG
mean at +1 (0.033σ) matches about 900 independent draws, not 2,268.

MDE = (z + 0.84) × SD; z = 2.64 (Holm's first step, α = 0.05/6) and 1.96 (last step):

| Cell (P̄) | Planned n (instrument-days) | SD of P̄ (MC null) | Design effect | **MDE** first / last Holm step | Pass bar U | Verdict |
|---|---|---|---|---|---|---|
| `-run` STRONG − B0 | 2,268 | 0.029 | in the date correlation | **0.101 / 0.081** | 0.10 | POWERED (marginal at the first step) |
| `-close` STRONG − MID | 2,268 vs 617 | 0.053 (t(4) tails: ~25% more) | same | **0.183 / 0.147** | 0.10 | **UNDERPOWERED by design** |
| `-speed` FAST − SLOW | 2,289 vs 2,359 | 0.035 | same | **0.123 / 0.099** | 0.10 | UNDERPOWERED at the first step, POWERED at the last |
| `-band` P90 − NOP90 | 3,297 vs 1,351 | 0.033 | same | **0.116 / 0.094** | 0.10 | UNDERPOWERED at the first step, POWERED at the last |
| `-event` EVT − NOEVT | 713 vs 3,837 | 0.065 | same | **0.224 / 0.181** | 0.10 | **UNDERPOWERED by design** |
| `-hold-r` STRONG hold R | ~2,020 / 1,870 / 1,780 / 1,650 trades (h 1/2/3/5, one-position rule) | 0.023 | same | **0.081 / 0.066** | 0.10R | POWERED |
| mirror FADED − B0 | 2,042 | 0.026 | same | 0.091 / 0.073 | — | descriptive (G5) |

Per-horizon scale (descriptive cells; MC SD): STRONG − B0 0.033 / 0.049 / 0.058 / 0.075 at h = 1/2/3/5; STRONG − MID
0.063 / 0.086 / 0.101 / 0.135. The hold-R legs under zero drift: SD per trade 0.98 / 1.28 / 1.49 / 1.77R, mean
−0.02R (the cost), which is what the management placebo must reproduce.

Readings:
1. **The card's "powered for ~0.05σ at +1 day" was wrong.** Big days land on the same dates across the 13
   instruments (USD days), so the date, not the instrument-day, is the unit. Only effects of about 0.1σ per √day are
   findable. That is the decision-relevant size anyway: a one-night hold costs ~0.03R spread plus ~0.01R financing, and
   direction-bar Phase 0 put the 1-day detectability floor at 0.13σ.
2. **`-close` (the card's own falsifier) and `-event` cannot resolve U.** MID is thin (a ≥ 1σ day rarely closes in the
   body of its range) and tier-1 days are 139 dates. Kept as scored cells because a large effect would still show; an
   empty result banks `UNDERPOWERED`, never `NULL`, unless the CI upper bound falls below U.
3. The fixes that would power them are a longer history (the PIT σ export starts 2020-08-24; a 2016–2020 backcast with
   `scripts/forecast_history/build.mjs` ~1.6× the dates) or the forward record. Neither is in scope here (§8).
4. Lesson 2026-11-04: the date-block bootstrap matched the MC SD within ~10% here (e.g. 0.034 vs 0.033), but the SE
   floor stays (§3.8).

## 6. Multiplicity — how many cells, and the corrected bar (required)

- **Scored cells: 6**, one per ledger id: P̄ of `-run`, `-close`, `-speed`, `-band`, `-event`, `-hold-r`. **Holm at
  α = 0.05** over the six (G1). G2–G5 are conjunctive on top.
- **Disaggregation (BH q = 0.10, with `chanceBaseline`)**: the 24 per-horizon cells (6 × h); 13 instruments × 6 P̄;
  3 families (FX 9, gold, indices 3) × 6; per year. A survivor is a candidate for its own prereg, never a result.
- **Descriptive, no weight**: k = 0.75 and 1.5; σ1 = HAR-800 (`har_ann/√252`, same file; lesson #10); bands anchored at
  the 00:00 London open as shipped (lesson #10, second spec); the q decile ladder and the z1 ladder (lesson #25); the
  [0.30, 0.70) "true middle" class; MFE/MAE paths; +1σ before −1σ share; the thinned de-clustering; cost 0.06R and
  financing; the hold-R legs and tails; concentration (by year, without the top 1% |R_5| days, the last two years alone);
  STRONG and MID hold R side by side.
- p-values from P̄ / SE (§3.8 floor), normal approximation, stated as such.

## 7. What this does NOT test (required)

- **Entry edge for the day itself.** Day one is taken as known at 21:00; nothing here says how to pick it at 07:00.
- **Tradability beyond the stated costs.** Fills on mid at 21:00 (inside the wide rollover spread), a flat 0.03R,
  financing only as a sensitivity. A pass is research-only.
- **Exits.** One stop (1σ1) and four time exits. Trails, partials and "hold while the bias holds" are agenda Q7
  (`exit-on-fixed-entries`). Lesson #27: an exit cannot create edge, so this study does not tune one.
- **Cause.** The late-NY reversal (`reversal-hour`) sits at the entry; a negative `-run` at +1 is that, not a
  forecast. Event days overlap high-σ regimes; no feature is read as a mechanism.
- **Macro side and regimes.** Excluded (§3.2); regimes are agenda Q9 and wait on this result.
- **Other instruments, the lockbox period, pre-2020.** Nothing after 2026-08-21; no backcast σ.

## 8. What each verdict changes (required)

- **VALIDATED** (`-run`, and a feature cell) → ledger entries; the 21:00 review card gets a research-only line, "day one
  confirmed (closed in the outer 10% / fast / through p90 / tier-1): history says it carried +x σ over n days", shadow
  only. `-hold-r` VALIDATED → the copier and the desk card may show a "hold allowed" tag in shadow; live use needs
  |t| ≥ 3 or a forward record.
- **CONTEXT** → ledger entry; the card may describe the tilt (including "big strong closes give some back overnight"),
  no hold rule.
- **NULL** (`-run`, `-hold-r`) → ledger entry; the desk line becomes "holding a big day overnight is not supported: close
  at 21:00 and re-enter"; Q9 (regimes) is dropped unless another cell is VALIDATED. A NULL feature cell retires that
  feature from the hold read.
- **UNDERPOWERED** → ledger entry with the MDE; testable on the 2016–2020 backcast (σ rebuilt point-in-time with
  `scripts/forecast_history/build.mjs`) or on the forward record after the lockbox evaluation; otherwise closed as
  untestable here.

## 9. Method lessons applied (`education/RESEARCH_METHOD_LESSONS.md`)

- **#27 trade management is not an edge (DO WORSE)**: the R version carries a coin-flip management placebo with the
  same stop, exits and one-position rule; it must come out ≈ −cost, and the scored `-hold-r` cell is the difference
  from it (G4 also requires beating flat). No exit is tuned here.
- **#1 positive control (DO WORSE)**: planted drift and zero-drift runs of the exact pipeline before any real forward
  outcome (§3.8); the power table itself comes from that generator.
- **#4 name the edge source (DON'T DO)**: §1.
- **#10 two proxy specs (DO WORSE)**: σ1 PIT vs HAR-800; bands at 07:00 vs the shipped 00:00 anchor.
- **#11 horizon-matched, overlapping outcomes (DON'T DO)**: overlapping 21:00 → 21:00 windows are handled by the
  date-block bootstrap with block ≥ h, plus a thinned sensitivity.
- **#14 causal labels**: every threshold fixed here; B0 expanding, prior data only.
- **#20 decompose expectancy into legs**, **#26 tails**: the hold-R legs and expected shortfall (§3.4).
- **#25 quantile ladder**: q, z1 and t50 ladders, not only the binary splits.
- stats-defaults lessons: all-shift placebo distribution, not one shift (2026-10-21); whole-date clusters and an MC SE
  floor (2026-11-04); a placebo gate on the percentile of many shifts, registered up front (2026-11-07); join by date and
  assert (2026-10-24); same-day is not forward (2026-10-14): the outcome starts at 21:00, after every feature is known.

## Amendments

### A1 — 2026-11-14 — PRE-RESULTS
Runner details fixed while writing `scripts/hold-day-one-confirm/run.py`; no real forward outcome had been computed
(the M1 is not in this container; only synthetic data was scored by `--selftest`).
1. **CI and the SE floor.** When the MC null SD exceeds the bootstrap SE, the percentile CI is widened about P̄ by
   the ratio MC SD / bootstrap SE, so G1's CI and its p use the same floor.
2. **Shift placebo for `-hold-r`** moves the STRONG labels (membership and side) without re-applying the one-position
   rule; the coin-flip management placebo term stays fixed. Shifted labels are read against the outcome date's own σ1
   and hold R (only membership and side move), for every cell.
3. **One-position rule** counts sessions on the date spine (the union of `part1_lines` dates); an instrument holiday can
   shorten a busy window by a day. The coin-flip placebo uses seed 20261115 (= seed + 1); the MC null and the positive
   control use seed + 2 … + 4. All derive from the one study seed.
4. **MID weights** (instrument × z1-bin) are fixed on the full sample, not re-estimated inside each bootstrap draw.
5. **Positive control (b)** checks the coin placebo's mean at h = 1; the SE floor inside the positive control comes
   from 100 null draws (the scored run uses 300).
6. **Synthetic engine** (MC null, positive control): sessions on the spine, 24 sub-steps a day, stop fill at the first
   sub-step at or below −1R (gap-through), rows present only where a real forward row exists. The existence of a row is
   known before any forward price is read (a later valid 21:00 close inside the lockbox).

---

### A2 — 2026-11-14 — PRE-RESULTS

Loader bug fix, no design change. On the laptop's real M1 caches (`VolRangeForecaster/data/m1`, `portfolioBacktest/cache`) the time column `datetime` is stored as the pandas index in the parquet metadata, so `to_table(...).to_pandas()` in `scripts/hold-day-one-confirm/run.py` (read_m1) restored it as the index and the column lookup raised `KeyError: 'datetime'` before any M1 was scored (the selftest's synthetic files carry no pandas index metadata, so it passed). Fix: `.to_pandas()` → `.to_pandas(ignore_metadata=True)` on that one line. Same rows, same values, same read-time lockbox filter and asserts; no pass bar, metric, window or design changed. No scored result had been printed when this was made.

## RESULTS — run <YYYY-MM-DD>

*Written to `analysis/output/hold-day-one-confirm/RESULTS.md` and `results.json` (seed 20261114). Nothing above this
line changes after the run.*
