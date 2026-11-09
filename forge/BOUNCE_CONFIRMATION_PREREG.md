# bounce-confirmation — does cross-asset confirmation separate post-drop Nasdaq bounces that persist from those that fade?

**Pre-registered 2026-11-09, before any outcome was computed.**

| | |
|---|---|
| ID / ledger id | `bounce-confirmation` (one id; two scored questions banked in the result text: H1 the confirmed-minus-unconfirmed difference, H2 the fade) |
| Branch | `ccr-dfef37e6-2ty8zi` |
| Register row | `plans/RESEARCH_REGISTER.md` → `bounce-confirmation` |
| Data | Yahoo adjusted daily closes, keyless: `^NDX` (Nasdaq 100), `SMH`, `RSP`, `HYG`, `LQD`, `^GSPC` (descriptive). Window **2007-04-11 → 2026-08-21** (HYG's first print to the lockbox cut; every series is truncated at 2026-08-21 before any join). Daily, no M1, no σ. FRED `BAMLH0A0HYM2` (HY OAS) as a sensitivity only if FRED answers at run time (503 from this sandbox on 2026-11-09). |
| Seed | `20261109` |
| Uncertainty | episode-level block bootstrap over bounce episodes in time order, block 3 episodes, B = 2000 (`js/harness/stats.mjs` `clusteredBlockBootstrap`, one cluster per episode); label-shuffle placebo B = 2000 |
| Scripts / outputs | `scripts/bounce-confirmation/score.mjs` → `analysis/output/bounce-confirmation/RESULTS.md`, `results.json` |
| Harness | own node script (daily ETF/index closes; not an M1/σ study so `js/harness/runStudy.mjs` does not fit; `analysis/study.mjs` reads `MD files/` only). Reuses `js/harness/stats.mjs` (bootstrap, BH) and `js/preregStats.js` (MDE, Holm, `pFromCI`). |

## 1. The claim (required)

An unnamed educator, clip shared by the owner 2026-11-09 (`MD files/CLIP_WATCH.md`, 2026-11-09 entry):

> *"Here's how you know whether a bounce is one that you should fade or one that may have
> persistence... what you want to look for is cross-asset confirmation. One of those is
> credit... if we have the bounce in the Nasdaq and while it's bouncing credit spreads are
> widening, that is something I would look to fade. But if the Nasdaq is bouncing and we see
> semiconductors outperforming the equal weight... while the credit spreads are cooling off,
> that is a sign there's likely further upside as long as that relationship holds."*

Stated as one testable claim: **after a sharp drop, a Nasdaq bounce during which credit does
not widen and semiconductors lead the equal-weight index goes on to outperform, over the next
handful of sessions, a bounce during which credit widens; and the credit-widening bounce
gives back ground (the fade).**

## 2. Why it is not already settled (required)

- `credit-leads-equities` (**NULL**, 2026-10-19): on 22 years of Moody's spreads, a widening
  in credit at a 20-session z does not lead equity direction or vol at 1–20 sessions —
  *"credit and equities agree in the same window; never write that credit moves first."*
  That is an **unconditional lead** test. This claim is **conditional and coincident**: it
  asks whether, *inside a post-drop bounce*, the credit move that happens *during* the bounce
  separates bounces that persist from bounces that fade. If credit and equities agree in the
  same window, "credit joined the bounce" is a statement about the bounce's breadth across
  asset classes, and whether that breadth predicts persistence is not something the banked
  null scored. Prior from it, written down: **the split will not separate** — the credit
  move during the bounce will be as informative about the next five sessions as the bounce
  itself, which is to say about nothing.
- `hy-spread-vol-idx` (CONTEXT): HYG/IEF underperformance over 20 sessions is followed by
  more index vol, demoted because it is the leverage effect (S&P 20-day return explains it).
  Vol, not direction; and the same leverage confound applies here, so the design controls for
  the drop's own depth (§3).
- `gr-risk-tone-direction` (NULL, 2026-11-05): credit tone as a next-day direction read on
  seven dollar pairs. FX, next day, no conditioning on a bounce.
- `nq-down-week` (VALIDATED, range only), `breadth-all-down` (VALIDATED, range only): what
  follows a drop is a wider week; direction after a drop is a 58–61% up-share, the ordinary
  drift. Neither conditions on credit or semis.
- `breadth-tilt-semis` (NULL): semis vs SPY after a *narrowing*, 20–60 sessions. The semis
  leg here is semis vs **equal-weight during the bounce**, as the clip states it, a different
  object at a different horizon.
- The register (`research_status.mjs`, 2026-11-09): nothing in flight on bounce
  confirmation or on HY-vs-IG as a conditioning variable.

The desk has validated **direction** rules on the Nasdaq (`vix-beta-change`,
`vvix-ratio-*`), so a direction pass is not impossible here; it is simply rare, and every
credit-direction test so far has been null.

## 3. Definitions, fixed in advance (required)

- **Series.** `N_D` = `^NDX` close; `S_D` = SMH; `R_D` = RSP; `H_D` = HYG; `L_D` = LQD; all
  adjusted closes at 16:00 ET on session D. Sessions = dates present in all five.
- **The drop and the bounce (the setup).** Session `L` is a **10-session low** if
  `N_L ≤ N_k` for every k in `[L−9, L]`. Session `D` is a **bounce day** if there is a
  10-session low `L` with `D − 3 ≤ L < D` and `N_D / N_L − 1 ≥ 1.5%`. The first qualifying
  `D` after `L` is the episode's bounce day; **de-clustering 10 sessions** (no new episode
  within 10 sessions of the previous bounce day). Setup count on this definition, computed
  before registration without any outcome: **177 episodes** 2007-04 → 2026-08-21 (216 from
  2003 on NDX; the HYG start sets the window).
- **Knowable when?** Everything is a 16:00 ET close on D. No publication lag (ETFs and the
  cash index print together). The outcome starts at the close of D.
- **The confirmation, measured from the low to the bounce day (the window the clip names,
  "while it's bouncing").**
  - **Credit leg** `C = H_D/L_D ÷ H_L/L_L − 1`: the HY-over-IG price ratio's change from the
    low to D. `C ≥ 0` = credit not widening (HY held or outperformed IG); `C < 0` = credit
    widening. HYG over LQD is used rather than HYG alone so a Treasury rally in a risk-off
    bounce does not read as "credit fine".
  - **Semis leg** `M = S_D/R_D ÷ S_L/R_L − 1`: semis over equal-weight from the low to D.
    `M > 0` = semis leading the bounce.
  - **Arms.** **CONFIRMED** = `C ≥ 0` and `M > 0`. **UNCONFIRMED** = `C < 0` (credit
    widening during the bounce; the clip's fade case, regardless of semis). **MIXED** =
    `C ≥ 0` and `M ≤ 0` (credit fine, semis lagging): reported, not scored.
- **The outcome.** `Y_h = N_{D+h} / N_D − 1` in percent, `h ∈ {5, 10}` sessions, from the
  bounce-day close. Also the **hit rate** `P(Y_5 > 0)` per arm, and the **give-back**: the
  share of episodes where `N` closes back below `N_L` within 10 sessions (the bounce failed
  outright). Descriptive: `Y_20`; the same on `^GSPC`.
- **The leverage control.** Episodes differ in how deep the drop was and how big the bounce
  is, and `hy-spread-vol-idx` showed credit's "signal" was the index's own return. Each
  scored difference is reported raw **and** after regressing `Y_h` on the drop depth
  (`N_L / max(N_{L−19..L}) − 1`) and the bounce size (`N_D/N_L − 1`) and comparing arm
  residuals. The gate uses the **residual** difference, so a split that is only "confirmed
  bounces were the bigger bounces" does not pass.
- **Instruments.** `^NDX` scored (the clip's instrument). `^GSPC` descriptive.
- **The control.** (i) **Label-shuffle placebo**: the confirmed/unconfirmed labels are
  permuted across the episodes 2,000 times; the real difference must sit beyond the 95th
  percentile of that distribution, and the §4 bar is checked against the distribution's SD
  (2026-10-21 lesson: a bar inside the placebo's noise is not a bar). (ii) **Shifted-window
  placebo**: the confirmation computed over the window `[L−10, L]` (the drop itself, before
  the bounce) instead of `[L, D]`; a "confirmation" that works as well on the wrong window
  is not confirmation. (iii) The unconditional post-bounce return (all episodes) against the
  ordinary 5-session return, for scale.
- **De-clustering.** 10 sessions between bounce days (above). Outcome windows of 10 can
  still touch; the episode block bootstrap (block 3) carries that.
- **Sample and halves.** 2007-04-11 → 2026-08-21. Halves: 2007-04 → 2016-12 and 2017-01 →
  2026-08-21. Concentration (descriptive): by year; without 2008 and 2020; the last three
  years alone.
- **Lockbox.** Nothing after 2026-08-21 is read. The clip's own instance (the 2026-11-05 drop
  and the 11-06 / 11-09 bounce) is **post-lockbox** and is shown in the write-up as a live
  description only, never scored.

## 4. Hypotheses, expectation first (required)

| # | Question | Pre-registered expectation |
|---|---|---|
| H1 (scored, h = 5 and 10) | Is the CONFIRMED arm's forward return higher than the UNCONFIRMED arm's — residual difference after the leverage control? | **Null.** Expected residual difference within ±0.5 pp at 5 sessions, interval across zero. Prior: the split restates the bounce's breadth, which the desk has not found to carry forward information. |
| H2 (scored, h = 5) | Does the UNCONFIRMED arm (credit widening during the bounce) give back ground — mean `Y_5 < 0`, the fade? | **Null**, with the 58–61% post-drop up-share as the base rate: expected `Y_5` near the unconditional +0.3 to +0.6%, not negative. |
| D1 (descriptive) | Each leg alone: the credit split and the semis split separately at h = 5, 10. | Reported for attribution; no pass weight. |
| D2 (descriptive) | Give-back share and hit rate per arm; `Y_20`; `^GSPC`; the FRED OAS proxy where available. | Reported. |
| **THE GATE** | H1 at a horizon PASSES only if all hold: (i) the residual difference has the claimed sign and is **≥ 1.5 pp at h = 5 (≥ 2.0 pp at h = 10)**; (ii) its 95% episode-bootstrap interval excludes zero; (iii) both halves have the claimed sign; (iv) the real difference sits beyond the 95th percentile of the label-shuffle placebo, and the bar exceeds that placebo's SD; (v) the shifted-window placebo does **not** pass (i)–(ii) — if the drop-window "confirmation" separates arms as well, the effect is the leverage confound, not confirmation. H2 PASSES if the UNCONFIRMED mean `Y_5` is **≤ −1.0 pp** with an interval excluding zero and both halves negative. | Both expected to fail at (i). |
| **THE MIRROR** | The semis-only split with the credit leg removed, and the credit-only split with the semis leg removed (D1): a pass on the composite that neither leg carries alone is reported as a pass with that caveat; a pass carried by the semis leg alone is reported as a breadth result, not a credit one. | — |

## 5. Power — what this design can and cannot find (required)

Control-sample quantities (computed 2026-11-09 before registration; no conditional outcome
touched): 5-session `^NDX` return SD over the 10 sessions after any 10-session low,
2007-04 → 2026-08-21, **3.27%**; 10-session **4.43%**; 177 episodes, assumed to split about
evenly between CONFIRMED and UNCONFIRMED (the split is unknown until run; MIXED episodes
reduce both arms — the table assumes 80 per arm and the results will restate power at the
actual counts).

`mdeMeanDiff({ sd, n1, n2, alpha 0.05, power 0.8 })` for a difference of means; design
effect 1 (episodes de-clustered; block 3 carries residual overlap).

| Cell | n per arm (assumed) | Outcome SD | **MDE** | Pass bar | Verdict |
|---|---|---|---|---|---|
| H1, h = 5 | 80 / 80 | 3.27 pp | **1.45 pp** | 1.5 pp | **POWERED** (narrowly; restated at run time) |
| H1, h = 10 | 80 / 80 | 4.43 pp | **1.96 pp** | 2.0 pp | **POWERED** (narrowly) |
| H2, h = 5 (one arm vs 0) | 80 | 3.27 pp | **1.02 pp** | −1.0 pp | **POWERED** |
| halves (sign only) | ~40 / 40 | 3.27 pp | 2.05 pp | sign only | adequate for a sign check |
| D1 legs, D2, `^GSPC`, `Y_20` | — | — | — | — | descriptive |

- If the actual arm counts at run time give an MDE above the bar for a scored cell, that
  cell is **UNDERPOWERED by design** and is banked as such, never as null — recorded in a
  PRE-RESULTS amendment with the counts before any outcome is read.
- A 1.5 pp difference over five sessions is small relative to a 3.3 pp SD: a pass is a
  statistical separation, research-only until |t| ≥ 3 or a forward record.
- **Planted-signal positive control** before scoring: add +1.5 pp to `Y_5` on the episodes
  the real labels mark CONFIRMED and confirm the pipeline recovers it (interval clear of
  zero, placebo 95th percentile beaten). If it does not, the design is fixed and amended
  PRE-RESULTS before any real outcome is read.

## 6. Multiplicity — how many cells, and the corrected bar (required)

- **Scored cells: three** — H1 at h = 5, H1 at h = 10, H2 at h = 5. **Holm at α = 0.05**
  across the three (`holm(pvals, 0.05)`, intervals → p via `pFromCI`). The half-sign, placebo
  and shifted-window conditions are conjunctive on top and need no further correction.
- **Descriptive cells** (D1 four cells, D2, `^GSPC`, `Y_20`, by-year, ex-2008/2020,
  last-three-years): reported with **Benjamini–Hochberg q = 0.10** and `chanceBaseline`. A
  descriptive cell that survives BH is a candidate for its own pre-registration, never a
  result.
- **Variants.** None beyond this table. The setup definition (10-session low, 1.5% within 3,
  de-cluster 10) was chosen from four candidate definitions **by setup count and MDE only**
  (the 20-session-low version gave 80 episodes and an MDE of 2.3 pp, underpowered); no
  outcome was seen for any of them. Any further variant goes in `## Amendments` PRE-RESULTS
  before it runs.

## 7. What this does NOT test (required)

- **Tradability.** Close-to-close, no costs, no slippage. A 1.5 pp edge over five sessions
  pre-cost is the bar, not a trade.
- **"AI credit risk."** HYG over LQD is broad high-yield against broad investment-grade;
  the hyperscaler and neocloud paper the clip has in mind is a subset of both. The proxy
  tests "credit" as the clip says to read it on a screen, not AI credit specifically.
- **Cause.** A pass says a credit-joined bounce persisted more often; it does not say credit
  caused it.
- **Intraday.** "While it's bouncing" is measured low-to-close, not tick by tick.
- **The decision rule.** The clip says "fade unless there is a significant reason not to";
  the reasons are not specified and are not tested.

## 8. What each verdict changes (required)

- **Pass (H1)** → ledger `bounce-confirmation` `validated`, research-only, with the pp size;
  a `watch-` row on the Setup Watch register (a live post-drop bounce with its credit and
  semis legs read) and a forward record under its own prereg before any page says "fade" or
  "persist". If the composite passes but the semis-only leg carries it (mirror), it is banked
  as a breadth result and the credit wording is not used.
- **Null** → ledger `null`; `CLIP_WATCH.md` 2026-11-09 entry gets the pointer; the clip's
  rule is recorded as "credit during a bounce does not separate bounces that persist from
  bounces that fade on 177 episodes"; `credit-leads-equities` gains a one-line cross-reference
  in `use`.
- **Underpowered** → recorded as such with the arm counts; closes until a longer HY proxy
  (FRED OAS from 1996, if it answers) or a pooled multi-index design under a new prereg.
- **Pass (H2 only)** → the fade is banked as a base rate (`context`) with the hit rate, never
  as a rule, until a forward record.

---

### 2026-11-09 — PRE-RESULTS (planted runs seen) — planted-signal control

`--planted` (the registered +1.5 pp on `Y_5` of the real-label CONFIRMED episodes) gave a
residual difference of **+1.23 pp, 95 % interval [−0.07, +2.55]**, p 0.068: it beat the
label-shuffle 95th percentile (1.06) and the shifted-window placebo failed (−0.56), but the
interval touched zero, so the registered recovery criterion was **missed**. This is what
the first amendment predicted: a 1.5 pp plant against an MDE of 1.65 pp has roughly 70 %
power. A second, purely mechanical plant of **+3.0 pp** (`--planted=3`, not pre-registered,
run only to show the pipeline) was recovered cleanly: +2.72 pp [1.43, 4.04], p 0.001,
Holm-rejected, every gate leg true. The pipeline recovers a signal it can see; the design is
not changed, the bars and gate stand, and the verdict rules of the first amendment apply.

**Disclosure.** Planting only `Y_5` of CONFIRMED leaves the other two scored cells untouched,
and the harness prints all three cells in the planted pass, so the H1 h = 10 and H2 cells were
seen before the real run (+0.50 pp [−0.95, 1.83] and +0.11 pp [−0.86, 0.99] respectively), and
the real H1 h = 5 raw difference is implied at about 1.23 − 1.5 ≈ **−0.3 pp**. Nothing in the
gate or bars is adjusted in light of this, but this amendment is not blind and is tagged
accordingly. Future preregs with a planted control should print only the planted cell.

---

## RESULTS — run <YYYY-MM-DD>

*Written to `analysis/output/bounce-confirmation/RESULTS.md`. Nothing above this line changes
after the run. Amendments go in an `## Amendments` section above this one, each dated and
tagged `PRE-RESULTS` or `POST-HOC (results seen)`; a post-hoc amendment can only demote or
describe.*
