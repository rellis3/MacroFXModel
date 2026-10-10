# Session-aware forecast: shadow specification (v2, reviewed)

**Status:** v2 written 2026-10-10 for owner approval. Nothing is built yet. **No shadow prediction has been logged so far.**

v1 (same file, git history) is replaced. The reasons are listed in "Changes from v1" at the end.

**Evidence base:**
- `forge/IEP_TIME_PREREG.md` (results record);
- `forge/INTRADAY_EXTREME_PATHS_PREREG.md` (Stages 0–3);
- `analysis/output/intraday_extreme_paths/{TIME,TIME_CHECK,STAGE2,STAGE3}.md`.

**Hard constraints:**
- No production code path, export, bot, trade selection or execution reads anything this shadow writes.
- It runs side by side and read-only (owner rule: new models are shadows until chosen).
- Approval of this spec does not approve any live change.

---

## 1. What is scored, and what is only shown

| Output | Role in this shadow | Why |
|---|---|---|
| **E1: band-hit probability**, export OH/OL p75 on the extension and opposite side, first touched after the checkpoint and by 22:00 London | **Scored: primary endpoint 1** | New conditional forecast; the existing live read (T7 band read) is the comparison. |
| **E2: 2-hour consolidation probability** (no ±1u move, IEP definition) | **Scored: primary endpoint 2** | New; nothing live produces it. |
| p90 band-hit (same definition) | Scored, secondary (no decision) | Sparse; reported for calibration. |
| Expected daily range (σ with weekday correction) | **Shown only** | Already a live shadow, the persistence/IV "chosen" ladder (`js/forecastLadderPersist.js`, FORECAST_PICK). Scoring it again here would double-count one test. |
| Remaining range today | **Shown only** | Existing validated Live Range / layer-5 tables, with their own record. |
| Range consumed | **Shown only** | A measurement, not a forecast. |
| Direction / first touch / late reversal / gold Friday | **Not produced** (see §7) | Null or unstable in the research. |

## 2. Models: frozen before the first logged prediction

All models are fitted once on outcomes up to **2026-08-20**: IEP rows 2016-01-04 → 2026-08-20, with the export lines from `analysis/output/forecast_history` (`pit_*`).

At freeze, the following are written to `forge/shadow_models/session_aware_v1.json`:
- coefficients;
- feature means and scales;
- the discovery vol-time profile;
- the hash of the T7 table;
- the code commit.

That file's SHA-256 becomes the **model_version**. Any later refit or feature change is a new version. Earlier predictions keep their own version and are never rescored with a newer model.

| Id | Role | Model (logistic) and inputs | Status |
|---|---|---|---|
| **E1-core** | headline E1 | z = (line − price) ÷ (σ_export × √v_left), log v_left, range used ÷ export HL p50, class | Reduced form of the tested model: dev-check before freeze (§9 item 1) |
| E1-ext | monitored | E1-core + extension flag (p50 on that side already touched) | Research: +4.2pp registered, **+2.4pp with range used controlled**. Not shown as the headline. |
| **E2-hour** | headline E2 | IEP M0 without IV (|D|, pullback and age of the extension-side extreme, 1 h momentum, log σ-regime, range used, event tag, class, log v_left) + London-hour dummies | Hour credited +1.05% Brier [0.85, 1.26]. IV dropped because the live IV source (QuikStrike capture) is not the research source (CME CVOL settlement). |
| E2-event | monitored | E2-hour + tier-1-event-day × session | Passed BH-FDR in research. **Evaluated only once its sample minimum is met (§5).** |
| B-geom | E1 baseline | z, log v_left only | The relationship the lines are built on (distance + time left). |
| B-T7 | E1 baseline | The live band-read table (`js/bandReachParams.js`, hash frozen at go-live) at the nearest checkpoint, given the median-reached state; 8 instruments only | The existing live forecast. |
| B-M0 | E2 baseline | E2-hour without the hour dummies | The state model the hour term must improve. |
| B-clim | E1 and E2 baseline | Training frequency by class × London hour (× target for E1) | Climatology. |

Every logged prediction carries **all** model and baseline probabilities computed from the same inputs, so comparisons are always on the same rows.

## 3. The prediction record (immutable)

**When:** one record per instrument × London checkpoint h ∈ {02, …, 20} (E1 at 02–18 only: later hours have under 6% band hits and fall in the unsupported late stratum; a design choice of this spec), written within 5 minutes after h:00.

**Key:** `sas1:<model_version_short>:<YYYY-MM-DD>:<INST>:<hh>`, written once (write-if-absent). A second write is refused and logged as an error.

**Fields:**
- **Identity:** `pred_id` (the key), `model_version`, `code_commit`, `created_utc` (server clock), `checkpoint_london`, `checkpoint_utc`, `session_date`, `instrument`, `class`.
- **Inputs, as used:**
  - `open` and its bar time;
  - `price` (P0) and its bar time (`input_age_s`);
  - running high and low;
  - export lines OH/OL p50/p75/p90, HL p50 and OC p75 for that date, as the export calculation produced them, with `export_source` and `export_hash`;
  - `sigma_export_daily`, `sigma_har_daily`, `sigma_rel`;
  - `v_left`, `v_window2h`;
  - `z_*` per target;
  - `used50`, extension flags, pullback, age, 1 h momentum;
  - `event_tag` with its source and raw event names;
  - a `features_complete` flag listing anything missing. Missing inputs are logged as missing, never imputed silently.
- **Targets (definitions, frozen):**
  - `targets` = for each of EXT75, OPP75, EXT90, OPP90: the line price and whether it was already touched at h;
  - `cons_barrier` = P0 ± u, with u = σ_HAR,daily × √v_window2h × open, horizon h+2 h;
  - `horizon_end` = 22:00 London for E1.
- **Predictions:** `p[model][output]` for E1-core, E1-ext, E2-hour, E2-event, B-geom, B-T7 (or null), B-M0 and B-clim.
- **Integrity:** `record_hash` = SHA-256 of the record, plus a daily manifest that chains `prev_manifest_hash` with that day's sorted record hashes.

**Outcomes** are a separate record, `sas1-out:<pred_id>`, written after `horizon_end` from the same 1-minute bars:
- first-touch minute of each target;
- the CONS result (CONT / REV / CONS / AMB);
- the outcome-window bar count and largest gap;
- `outcome_complete`.

Outcome records never edit prediction records.

**Storage:** KV with no TTL. The key prefixes must be added to **both** permanent-key gates (`kv.js` `_CF_EXACT` and `_worker.js` `PERMANENT_KEYS`); otherwise they silently expire after 48 hours. The daily manifest is also mirrored to R2. Any job id must be registered with svcInterval. Run `node analysis/deploy_precheck.mjs` before the push.

## 4. Observation windows: what counts

| Window | Dates | What it is | Counts toward the 60? |
|---|---|---|---|
| W-past | 2016 → 2026-08-20 | Training data | — |
| **W0, retrospective holdout** | 2026-08-21 → day before go-live (34 complete sessions in the downloaded data, to 2026-10-08, plus any later sessions before go-live) | Frozen models run once on the downloaded forward M1, never examined (`data/m1_forward/`, manifest SHA-256s), and export lines rebuilt with the causality-checked `forecast_history` builder. Valid out-of-sample, but **not recorded before outcomes were known**: it is labelled retrospective everywhere. | **No.** Reported separately, once. A W0 failure does **not** permit changing the model before W1. |
| **W1, prospective** | From go-live | Predictions written live before their outcomes | **Yes** |

**Logged so far: 0.** No shadow existed between 21 August and today. v1's line "log from 2026-08-21" was wrong and is removed.

**Lockbox:** W0 overlaps lockbox window H-A (`forge/LOCKBOX_PROTOCOL.md`). This shadow scores none of the frozen layer-3/5/6 models (the HAR-800 ladder, R3 remaining travel, M2 confidence), so the lockbox is unaffected. Using HAR-800 σ as an input is not scoring layer 3.

**A valid session** (counted per session date in W1) must meet all of these:
1. at least 30 of 34 instruments have at least 15 of their 19 checkpoint records written on time (≤ h:05) with `features_complete`;
2. the export lines for that date exist and their hash is logged;
3. for at least 90% of those records, the outcome is complete (outcome window has no bar gap over 15 minutes, and 22:00 London has passed);
4. it is not a scheduled half-day.

Invalid sessions are listed with the reason and are never back-filled.

**The 60-session requirement** = 60 valid W1 sessions, about 13 trading weeks. Instrument-level rows inside a valid session are scored only if their own record is valid.

## 5. Acceptance criteria (fixed now)

All intervals are 95%, from a **session-block bootstrap** (blocks of 5 consecutive valid sessions, all instruments resampled together, 2,000 draws). Skill = 1 − Brier(model) ÷ Brier(baseline). Log loss is reported beside it.

**E1 (headline E1-core): all of the following.**
1. Brier skill vs **B-geom** ≥ +0.3% with the interval's lower bound > 0. This is the incremental-value test: it beats distance and time left.
2. Brier skill vs **B-T7** on T7's 8 instruments with a lower bound > 0. This is the existing-forecast test.
3. Calibration:
   - every decile with at least 300 rows within 3pp of its realised rate;
   - logistic recalibration slope 95% interval inside [0.80, 1.20].
4. Stability:
   - skill vs B-geom positive in at least 2 of 3 chronological thirds of W1;
   - positive for at least 60% of instruments that have at least 300 E1 rows;
   - no class whose interval lies wholly below 0.

**E2 (headline E2-hour): all of the following.**
1. Brier skill vs **B-M0** ≥ +0.3% with a lower bound > 0. This shows hour adds to the state model.
2. Brier skill vs **B-clim** with a lower bound > 0. This shows the state model adds to the clock.
3. Calibration and stability rules as for E1.

**Coverage:** at least 90% of scheduled records in valid sessions are written on time. Below that, the evaluation is reported as **incomplete**, not passed or failed.

**Monitored variants (never change the headline mid-window):**
- **E1-ext vs E1-core:** reported at the confirmatory look. It is a candidate for a later version only if skill ≥ +0.3% with a lower bound > 0 **and** positive in all three thirds. Until then its weight on the page is zero.
- **E2-event vs E2-hour:** evaluated only once W1 holds at least **20 tier-1 sessions** with at least **1,500 resolved overlap-session rows** on those days. That is about 5 months, since roughly 1 session in 7 is a tier-1 day. Before then it is "insufficient sample".

**Safeguards against repeated testing:**
- The weekly page shows running numbers marked **"interim — not a decision"**. Interim numbers trigger nothing.
- **One confirmatory evaluation** is made, at 60 valid sessions. E1 and E2 are tested with Holm across the two endpoints.
- If an endpoint fails, it stays a shadow and is reported as failed. Any retune is a **new model_version** with a **new 60-session window**, and the old predictions stay scored under their own version.
- The baselines (including the frozen T7 hash) and these criteria are frozen with the model. A later regeneration of `bandReachParams.js` does not change B-T7 for this version.
- A pass leads to a written proposal for review, never to an automatic live change.

## 6. How the page is laid out (three visually separate bands)

1. **Validated forecast information** (with evidence links):
   - export lines;
   - σ weekday note: "Mondays run ~6pp under the HL p75 line, Thursdays ~4pp over — the chosen ladder corrects this";
   - remaining range;
   - range consumed;
   - **E1-core** and **E2-hour** probabilities, each shown with its baselines (B-geom and B-T7 for E1, B-M0 and B-clim for E2), the model_version and "shadow — under prospective test (n valid sessions / 60)".
2. **Exploratory and monitored** (greyed, labelled "not validated, not used in any number above"):
   - the E1-ext and E2-event deltas;
   - the gold band-read decomposition ("~51% of days like this reach p75; ~43% is explained by distance and time left");
   - the gold Friday effect as a *watch item* only.
3. **Not supported** (a fixed text block, no numbers that look like signals):
   - "No directional forecast: no model beat 50/50 out of sample. Up/down first-touch shares are ~50% at every session and weekday."
   - "Late-session reversal: reversed between periods — not used."
   - "Earlier-session highs/lows are not levels (placebo test)."

No element in bands 2 or 3 feeds any probability in band 1, a bot, the export or a trade.

## 7. Never promoted by this shadow
- direction or first-touch calls;
- the late-session (19–21 London) reversal;
- the gold Friday effect;
- Family C subgroups;
- session-extreme levels.

These need their own registration and fresh data.

## 8. Research-to-live definition gaps (to resolve or log)

| Item | Research | Live | Handling |
|---|---|---|---|
| Export lines | `pit_*` (walk-forward fold specs) | The export as produced that day (live spec) | Log the live lines verbatim. The models' coefficients come from `pit` lines; this mismatch is documented and is part of what the shadow tests. |
| σ for u | HAR-800 from NY-close bars | `harShadowCore` HAR-800 | Same function; log both σs. |
| Event tag | Repaired ForexFactory archive buckets | Live ForexFactory feed (`econCalendar.js`) | Map live names to the same buckets (FOMC/NFP/CPI/high/none) with the `ff_calendar.event_tags` rules. Log the raw names. Vendor vocabularies differ (known issue). |
| Bars | OANDA M1 mid | Server in-memory 1-minute OANDA bars | Log bar times and gaps. A gap > 15 min in the outcome window makes the outcome incomplete. |
| Open | First bar at or after 00:00 London | `fetchSessionOpenLondon` | Log it. |

## 9. Before implementation (must be done and recorded first)

1. **Dev check of the reduced models** (development only, not evidence): fit E1-core / E2-hour on 2016–2021, score 2022–24, and confirm they are within 0.2% Brier of the registered models (H4d geometry; M0 + hour). If not, keep the registered feature sets.
2. **Freeze**: fit on data through 2026-08-20, write `session_aware_v1.json` and its hash, and commit before any W0 or W1 scoring.
3. **W0 data**: rebuild export lines for 2026-08-21 onward with the `forecast_history` builder on `data/m1_forward/`, run its causality check, then run W0 once.
4. **Event-name mapping test** on the live feed, and the KV permanent-key registration plus deploy precheck.

---

## Changes from v1
1. **Logging claim corrected:** 0 predictions exist. "From 2026-08-21" becomes W0, retrospective and labelled, which doesn't count. The 60 sessions count prospectively from go-live.
2. **Scored outputs cut to two primary endpoints** (E1, E2). The expected range is already the persistence/IV chosen shadow; the remaining range is already validated. Both are shown, not rescored.
3. **Baselines made explicit:** B-geom (distance + time left), B-T7 (the existing live read), B-M0, B-clim. Acceptance is against the baseline that embodies what the model was built from.
4. **v1's "7 features" was never tested as a model.** It is now defined as frozen reduced models, with a dev check against the registered models.
5. **IV dropped** from E2 (the live source differs from the research source).
6. **Extension moved** to a monitored variant with zero headline weight.
7. **Event × session** is monitored until at least 20 tier-1 sessions.
8. **Immutable log schema**, write-once keys, hash chain, separate outcome records, KV permanent-key gates.
9. **One confirmatory look**, Holm across E1/E2; a version change resets the window; interim numbers trigger nothing.
10. **Page split into three bands:** validated / exploratory / not supported.
11. **Research-to-live definition gaps** listed with how each is handled.
