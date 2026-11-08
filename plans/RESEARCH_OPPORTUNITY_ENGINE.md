# Research Opportunity Engine (ROE): design, v2

*v2, 2026-11-08. Owner-approved design (v1 decisions 1-4: yes); v2 is the owner's second design pass after a second reviewer
(nine changes, section 0). This replaces the "Data Agent" in `plans/DATA_AGENT.md` wherever the two differ (section 16 lists the
changes). **Status: documentation and flow-chart data only.** No server route, no KV key, no agent is implemented. Everything
below that is not built is drawn dashed and marked `planned` on the Agents tab (`js/agentRegistry.js`, flows "Research case" and
"Research discovery").*

## Changelog

| Version | Date | What |
|---|---|---|
| v1 | 2026-11-08 | First design (PR #1702): scanner, writer, queue, evaluator, one registry, board, forward tracker, Research QA, three approvals, no daily cap. |
| v2 | 2026-11-08 | Second design pass: the nine changes in section 0. Design preserved; no new agent added. New boxes are stores, stage gates, a boundary and two owner-decision boxes (all in the flow charts, all `planned` except the lockbox boundary, which is an existing rule). Two v1 statements corrected (section 21): the trial ledger does not read register rows; "Research approved" was set by the Head in section 9 but by the owner in v1 section 15. The lockbox section (8) is a **release blocker**. |
| v2.1 | 2026-11-08 | Two owner additions: one trial pool across all three routes (section 22) and the Evidence Pack and audit trail (section 23). Windows agreed by the owner (Q1: practice to 2025-09-04, confirmation 2025-09-05 to 2026-08-20). Docs only. |
| v2.2 | 2026-11-08 | Owner decisions: Q1 windows agreed; Q2 default applied (windows end 2026-08-20); Q3 changed by the owner: the three frozen layers may still be alive, but H-A sessions MAY be used to FORM hypotheses (section 8.6). No lockbox rule changed. Docs only. |

## 0. The nine changes at a glance

Each row says what changes, why, whether new code is needed, whether an existing workflow is affected, and whether any existing
research or lockbox rule changes. "Code" always means code that does not exist today; nothing is built in this round.

| # | Change | Why | Needs new code? | Affects an existing workflow? | Changes an existing research or lockbox rule? |
|---|---|---|---|---|---|
| 1 | **Discovery episodes and hypothesis families** (section 6). Unlimited discovery stays. A multi-day anomaly is one episode; variants of one mechanism are one family. The unit of a trial is the family-wise test: Holm over all of a family's variants and horizons (cumulative), then Benjamini-Hochberg across **families** each month; Benjamini-Yekutieli shown beside it. | Counting every day of one anomaly, or every instrument of one mechanism, as a separate test miscounts the search both ways (daily repeats overstate the sample; unmerged variants understate the multiplicity). | Yes: episode and family IDs in the scanner, the family table, the count logic in the evaluator, a monthly roll-up file, and a **new** ledger channel (the ledger does not read register rows; section 21). | No (nothing built). The quick test keeps its own Holm; research-protocol is untouched. | **DATA_AGENT.md section 4.3 rule 4 changes the BH unit from "question" to "family"** (stated in section 6.6). No lockbox rule. No research-protocol rule. |
| 2 | **Three-stage evaluation** (section 7): Stage 1 Discovery, Stage 2 Confirmation (frozen, one look), Stage 3 Forward. Provenance recorded per experiment. Baseline library; incremental value over the baseline is required. | Walk-forward inside the discovery data is stability evidence, not independent confirmation; the three stages stop it being called that. | Yes: evaluator stages, freeze record, baseline library, provenance fields. | No. | No. It applies research-protocol's "confirmation once" and the lockbox's one-look idea to ROE questions. v1 discovery window (to 2026-08-21) becomes shorter if Q1 is accepted (section 7.3). |
| 3 | **Research QA refinement** (section 9): six outcomes; "can this be interpreted", not "is it true"; power from effective N, autocorrelation, overlap and a minimum detectable effect; no universal 750 rule. | A null that could not have found the effect is not a negative finding, and "750" means three different things. | Yes: the QA service (effective N, MDE, outcome rules). | No. The quick test keeps its 750-day floor for itself. | No. The quick test's `MIN_OVERLAP = 750` stays for the quick test; for ROE questions QA's effective-N reasoning decides interpretability. |
| 4 | **Four logical stores** (section 5): Opportunity Registry, Evaluation Store, Forward Ledger, Research Case Registry, with owners and data contracts. May share physical storage at first. | One registry was doing four jobs, and the board needed a clean place to read results from that is not the trial-count store. | Yes: three new stores (names to be proposed in P2); the case store gets new fields. | The case store (`research_cases`) gains fields; nothing existing changes meaning. | No. The "never label, hide, demote or feed results to the writer" rule is kept and tested. |
| 5 | **Approval authorities** (section 13): the Head recommends, the **owner authorises** Research approved; the architect recommends, the **owner authorises** Design approved; the Validation desk reviews and the deterministic Acceptance check sets Validation approved. | v1 section 9 said the Head sets Research approved; v1 section 15 said the owner presses. The owner's preference resolves it. | Yes (small): status fields and two owner buttons in P6. | No: no approval statuses exist today. | No. Resolves a v1 inconsistency only. |
| 6 | **Ranking** (section 11): no single league table; rank inside comparable families; show adjusted significance, effect size and interval, power, gain over baseline and related-test count; "could not tell" apart from "no effect found with adequate power". Direction questions keep the neutral "base rate: low" tag. | A single score across unlike hypotheses is a scoreboard of truth; the board should only help choose what to investigate. | Yes: board page logic (P3). | No. | No. v1 section 6 item 11 (base-rate tag) kept. |
| 7 | **Data architecture and reproducibility** (section 10): immutable daily snapshots, freshness checks, run IDs and idempotent push, data and feature versions, commit references, reproducible evaluation records, explicit failure states. | Without them a rerun can differ from the first run, a repeated push can double-count trials, and a stale board can look current. | Yes: snapshot writer, freshness checker, run-ID push, "not completed" board state. | The laptop push and the queue (both planned). | No. Uses `/api/data-health` (existing) as the existing stale-feed check. |
| 8 | **Lockbox** (section 8, **RELEASE BLOCKER**): mapped from the files; a stage-by-stage date and dataset table; the rule that discovery may observe current data but selection and replay exclude protected data. | The lockbox is the repo's one clean out-of-sample test; the ROE must not spoil it, and must not claim independence it does not have. | Yes: explicit date arguments and a truncation test in every ROE loader (P1, P4). | No. | **No lockbox rule is changed.** Ambiguities are reported (section 8.5) and three need owner answers (Q1-Q3). |
| 9 | **Literature integration** (section 14): the Literature route is the third way into the Research Case Registry beside the owner and the ROE; same evidence standard; the synthesis keeps `published_evidence` and `internal_replication_evidence` apart; a paper's finding never becomes validated evidence here by itself. | The literature desk already ends in a dossier that opens as a case; the evidence it produces must not be mistaken for internal evidence. | Yes (small): two output fields, a code lookup of internal evidence, a `route` field. | The synthesis prompt and dossier validator (not changed this round). | No. |

**Rules that bind everything below** (data-rules, research-protocol, research-director): session = London date; no lookahead
(every statistic for day t uses data strictly before t); the lockbox (sessions after 2026-08-21 are H-A; nothing scores layers 3, 5,
6 on them; the one evaluation is `python -m forge.lockbox_check --evaluate`, expected late November 2026; see section 8);
every question is a trial; exploratory answers are labelled and never banked as validated; Evidence Book entries are written only
through research-protocol.

**Earlier owner decisions kept (v1, unchanged):** no daily cap on questions (nothing suppressed or deleted); the hand-off is a
button ("Open case") with de-duplication of identical specs only; the registry never labels failed ideas; the scan is a Python job
on the owner's laptop pushing to a server queue; the ROE has its own group (Data) on the Agents tab.

---

## 1. What the ROE is, in one paragraph

After each daily run, the laptop freezes the day's inputs as an immutable snapshot with a run ID, and a deterministic scan of
everything the owner holds finds unusual readings and divergences. A multi-day anomaly is one **episode**; a mechanism tested
across instruments, horizons and conditioning variants is one **family**. Each episode becomes a written question (rules first).
Each question goes through **Stage 1 (Discovery)** on the permitted history, and a frozen hypothesis may go to **Stage 2
(Confirmation)**, one look, on data it never touched. Results are read by **Research QA** (can this result be interpreted?) and
shown on a **board ranked within comparable families**, with an evidence pack. The owner (or the Head of Research, by
recommending it) presses **Open case**; only then does the existing research flow run (librarian, three researchers, Head
review). Every observation, question and result is kept in four stores. The registry is used for two things only: dropping
identical specs and counting trials. A **forward tracker (Stage 3)** scores each frozen hypothesis on data that arrived after the
freeze; that, not the discovery result, is the real test.

## 2. Three kinds of box (do not turn boxes into agents unnecessarily)

| Kind | What it is | Examples | Model call |
|---|---|---|---|
| **Specialist agent** | An LLM role with a prompt in `desk/roles/` | the three researchers, Head of Research, System architect, Validation desk, Red team, librarian | yes |
| **Processing service** | Plain code with fixed inputs and outputs. Registry field `kind: 'service'` | scanner, question writer (rules), historical evaluator (Stages 1-2), forward tracker (Stage 3), **Research QA**, **acceptance check**, quick test, paper intake | no |
| **Decision authority** | A person or a rule that sets a status. Never a model acting on its own work | **owner** (authorises Research approved and Design approved), acceptance check (sets Validation approved) | n/a |

Stores (the four stores of section 5, the questions queue, the Evidence Book) and stage gates are not agents; they are drawn as
boxes of kind `store`, `stage`, `boundary`. A model never marks its own work validated, and no model sets any approval status
(the Head and the architect recommend; section 13).

## 3. Architecture and data flow

```
 LAPTOP (Python, owner's machine)                       SERVER (authenticated endpoint; KV keys to be proposed, not created)
 --------------------------------                       ----------------------------------------------------------------
 IBKR files, skew, cross-currency basis,
 feature store, M1 cache  +  GET /api/state
            |
   0 Daily snapshot  (immutable; snapshot id, run ID, hashes, freshness flags)
            |
   1 Opportunity scanner   (percentiles, z-scores, extremes, divergences, lead-lag screens,
            |               regime shifts, breakdowns; episode ID + family ID per flag;
            |               logs how many items it scanned)
   2 Question writer       (templates; why it arose, observation, hypothesis, data needed,
            |               pre-registered test, baseline, smallest effect of interest)
            +--- push (keyed by run ID; a repeat changes nothing) -->  3 Questions queue --> Opportunity Registry
                                                                          |        (every observation, episode, family,
                                                                          |         question, spec, trial; provenance)
                                              4 Historical evaluator  <---+--- trial + family count, same-spec check
                                              |   Stage 1 Discovery  (permitted history only)
                                              |   Stage 2 Confirmation (frozen spec, one look, untouched slice)
                                              v
                                       Evaluation Store  --> Research QA (Pass / Underpowered / Misaligned / ...)
                                              v
                                       6 Ranked board  (ranked inside comparable families; evidence pack)
                                              |
                          owner presses Open case   (NO automatic opening)
                                              v
                      Research Case Registry <- three routes: owner | ROE board | literature dossier
                      library librarian -> three researchers -> [Research QA] -> Head of Research (recommends)
                                              |
        owner authorises Research approved -> System architect (recommends) -> owner authorises Design approved
                                              -> Validation desk + acceptance check -> Validation approved (check sets it)
 7 Forward tracker, Stage 3: data that arrived after the freeze date, frozen spec -> Forward Ledger
```

Why the scan runs on the laptop: the inputs that matter most (IBKR files, FX skew, cross-currency basis, the feature store, the
M1 cache) are laptop-only or stale on the server (DATA_AGENT.md section 1.12); the server's own view comes from `GET /api/state`
(read it, do not re-fetch). The laptop pushes to an authenticated endpoint (same login rule as the research-pod POSTs). The scan
is Python so it can share `forge/` code with the evaluator and the lockbox tooling.

Where the evaluator runs is an open question carried from v1 (v1 Q2, default unchanged: laptop Python for M1/IBKR-dependent
tests, the existing quick test on the server for daily-close questions; results land in the same Evaluation Store).

## 4. Components, responsibilities, deterministic vs LLM

| # | Component | Responsibility | Deterministic? | Model call | Built? |
|---|---|---|---|---|---|
| 0 | **Daily snapshot** (laptop) | Freezes the day's inputs once: manifest of series, sources, as-of dates, row counts, SHA-256; run ID; freshness flags. Never overwritten. | yes | none | planned |
| 1 | **Opportunity scanner** (laptop, Python) | Daily statistics after the daily run: percentile (252/756/all, causal), robust z, d1/d5/d20, extremes, divergences, lead-lag screens, regime shifts, breakdowns. Assigns episode ID and family ID. Records `scanBreadth` (items scanned) and the code `watchVersion`. | yes | none | planned |
| 2 | **Question writer** | Fills a template per flag family (the 22 in DATA_AGENT.md section 3). Each question states: why it arose, the observation, the hypothesis, the data needed, the pre-registered test, the baseline, the smallest effect of interest. Never shown earlier results. | yes (rules) | none now; an optional capped DeepSeek wording tidy later (may reword, never change spec, items, horizons or numbers) | planned |
| 3 | **Questions queue** | Holds every written question. No daily cap. | store | none | planned |
| 4 | **Historical evaluator** | Stage 1 and Stage 2 (section 7). The quick-test and backtest machinery (`js/quickTest.js`, `forge`, harness `runStudy`) on the permitted windows: pre-specified horizons, relevant baseline, incremental value, regime splits, costs, uncertainty, power. Holm within a family, BH across families in a month (section 6). | yes | none | planned (machinery exists in part: section 15) |
| 5 | **Opportunity Registry** and the other three stores | Section 5. | store | none | planned |
| 6 | **Ranked board** | Ranked inside comparable families, evidence pack, neutral history (section 11). The only place the owner opens a case from. | output | none | planned |
| 7 | **Forward tracker** (Stage 3) | Records outcomes on data after the freeze date against the frozen spec (`js/directionLedger.js` pattern: write once, resolve later, never back-issue). | yes | none | planned |
| 8 | **Research QA** | Whether a result can be interpreted (section 9). | yes | none | planned |
| 9 | **Acceptance check** | Checks acceptance criteria from the system card; the only thing that sets *Validation approved* when all required conditions pass. | yes | none | planned |

LLM steps stay where they are today: librarian pick, the three researchers, the Head review, the System architect, the
Validation desk, and the literature desk (section 14). The ROE adds no model call in its first phases.

## 5. The four stores: responsibilities and data contracts

Four **logical** stores, each with one owner (the writer of record). They may share physical storage at first (one KV key or one
R2 prefix with a `kind` field); the contracts below are what must hold regardless. Names of new keys are to be proposed in P2 and
registered in the three places `js/agentRegistry.test.mjs` enforces (`kv.js`, both `_worker.js` lists, `js/storeRegistry.js`).

| Store | Owner (the only writer) | Holds | Maps to today | New |
|---|---|---|---|---|
| **Opportunity Registry** | the scanner and writer (via the queue push) and the evaluator (spec, window, hash) | observations, discovery episodes, hypothesis families, questions, specs, trials (counts), provenance | nothing for questions; the **trial ledger** (`MD files/TRIAL_LEDGER.md`, from `js/deskEvidence.js` by `scripts/build_trial_ledger.mjs`) counts *banked* tests and lists preregs with no verdict | everything |
| **Evaluation Store** | the historical evaluator (Stages 1-2) and Research QA (outcome field) | every historical test result with its provenance | `analysis/output/<slug>/results.json` and `research_pod_quicktests` (KV) hold single runs but have no schema in common | everything |
| **Forward Ledger** | the forward tracker (Stage 3) only | prospective outcomes, written once, resolved later | the pattern exists: R2 `forward/direction_ledger/<date>.json` and `out/<date>_h<h>.json` (`js/directionLedger.js`), and other write-once `forward/...` ledgers (`js/serviceFlags.js`) | a `forward/roe/` prefix |
| **Research Case Registry** | the case flow (owner actions, the Head's review, the owner's approvals, the acceptance check) | formal cases, the Head's recommendation, approvals with who set them | KV `research_cases` (`js/researchCase.js`: question, rounds, reviews, `origin`, `dossierId`, `status`, `nextStep`); proposals in `research_pod_library` | fields `route`, `roeId`, `recommendation`, three approval statuses with actor and time |

**Data contracts (field lists; sketched, not created).**

```
Opportunity Registry
  observation: { obsId, date, runId, item, trigger, triggerVersion, side, value, percentiles, inputFlags[], episodeId, familyId, scanBreadth }
                 // obsId = hash(item, trigger, triggerVersion, side, date): deterministic, so a repeated push is a no-op
  episode:     { episodeId, item, trigger, side, openedAt, lastSeenAt, closedAt|null, state: 'open'|'persisting'|'closed', obsIds[], familyId }
  family:      { familyId, mechanismTemplate, variableClass, outcomeClass, tableVersion, members: [specHash], mergedFrom[] }   // merge-only
  question:    { id, createdAt, episodeId, familyId, text, why, observation, hypothesis, dataNeeded, item, watchVersion, baseline, smallestEffect }
  spec:        { specHash, variable, condition, horizons[], baseline, target, minN, outcome, splitRule, familyId, trialIndexInFamily, postHocVariant: bool }
  trial:       { familyId, monthKey, mFamily, nPrimaryTests }       // counts only; never a result, never a label
  provenance:  { runId, snapshotId, watchVersion, featureVersion, codeCommit }

Evaluation Store
  result: { evalId, specHash, stage: 1|2, window: { from, to }, n, nEff, effect, ci, power, mde, smallestEffect, baselineUsed, baselineDelta, ciBaselineDelta,
            regimeSplits, costsApplied, pRaw, pHolmFamily, pFamily, qBH, qBY, qaOutcomes[], qaNumbers,
            provenance: { snapshotId, featureVersion, codeCommit, testSpecHash, seed, frozenAt, confirmationDataset } }

Forward Ledger
  entry: { entryId, specHash, frozenAt, firstEligibleSession, horizon, outcomeDate, outcome, baselineOutcome, runId }   // write once

Research Case Registry   (additions to the research_cases shape)
  case: { ...existing, route: 'owner'|'roe'|'literature', roeId?, dossierId?, recommendation: { by, at, nextStep, evidenceIds[] },
          approvals: { research: {status, recommendedBy, authorisedBy, at}, design: {...}, validation: {status, setBy: 'acceptance-check', at} } }
```

**Rule kept from v1:** the registry never labels, suppresses or demotes a question and never feeds results to the question writer
(or any model). Reason: failed ideas must not bias new analysis. The board shows only neutral history ("tested 2026-11-08 on
2019-2025-09-04: no incremental power over momentum"). In the flow data this is enforced by tests: the writer's only input is the
scanner; the registry's only reader is the evaluator; results flow from the Evaluation Store to QA and the board, never to the
writer. The same question on new data, or with a new mechanism, is a **fresh test** (new spec hash, new trial in its family).
`specHash` collisions are the only automatic action (the evaluator skips a rerun and points to the earlier row). Rows are
append-only. Because the discovery window is fixed (section 7.3), a same-spec rerun is not expected; it is only a guard.

## 6. Discovery episodes, hypothesis families and trial accounting (change 1)

**Nothing is capped, suppressed or deleted.** Every observation of every flag, every day, stays in the Opportunity Registry.
Episodes and families are labels added to observations; they decide how the search is *counted*, not what is *kept*.

### 6.1 Definitions

- **Observation.** One (item, trigger, side) firing in one daily run. Kept forever.
- **Discovery episode.** The same underlying anomaly seen again: the same (item, trigger, side) firing on consecutive sessions
  is one episode. States: *opened* (first firing), *persisting* (fires again, or has not fired for fewer than `g` sessions),
  *closed* (not fired for `g` consecutive sessions). Default `g = 3` sessions, frozen in the watch file with `watchVersion`
  (Q6). All observations in the episode are retained and listed under its ID. A question is written once per episode (at
  opening); the persisting days are appended as observations, which is bookkeeping, not suppression: the board row shows
  "persisting, day 4". An episode is computed by the scanner from its own immutable snapshots; the registry only records it
  (so no result ever flows back to the scanner).
- **Hypothesis family.** The same *mechanism* tested across instruments, horizons and conditioning variants (percentile window,
  threshold, regime split). Defined by a frozen **family table** (initially the 22 templates of DATA_AGENT.md section 3, by
  `mechanismTemplate` x `variableClass` x `outcomeClass`). Two readings that differ in mechanism (term-structure inversion to
  equity range; credit-spread widening to equity range) are **different families** even if the target is the same.
- **Variant.** A distinct `specHash` inside a family.
- Controls (mirror, placebo, one-session delay, shifted dates) are recorded in the Evaluation Store but are **not** counted as
  variants: they are diagnostics, not candidates for selection.
- **Family assignment is by rule, before any result exists, and is merge-only**: a later review may merge two families (which only
  makes the count stricter), never split one. An ambiguous variant is assigned to the existing family.

### 6.2 The unit of a trial

| Level | Unit | Correction | Why |
|---|---|---|---|
| Inside a family | a primary test = one (variant, horizon) p-value | **Holm** over all of the family's primary tests to date (m_f, cumulative, never reset) | Holm controls the family-wise error rate under any dependence; no independence assumption. v1's "Holm across the horizon family inside a question" is the special case of one variant. |
| Family p-value | `p_fam = min(1, m_f x smallest p in the family)` (the Holm-adjusted smallest p) | none further | One number per family: "is there any effect in this mechanism, after paying for every variant tried". |
| Across families, per calendar month | **families that received at least one new test in the month** | **Benjamini-Hochberg q = 0.10** on `p_fam` (m = number of such families, underpowered ones included with their p, none dropped) | The FDR across mechanisms. Matches DATA_AGENT.md's q = 0.10; only the unit changes. |
| Sensitivity, always shown | the same families | **Benjamini-Yekutieli** (BH divided by the harmonic sum, valid under arbitrary dependence) | Shown as `qBY` beside `qBH`; a row that passes BH but not BY is tagged "dependence-sensitive". |
| The event sample inside one test | **one event per episode** (the episode's first session, with historical episodes separated by at least the longest horizon) | block bootstrap on top, as the quick test does | Days of one episode are serially dependent; treating them as independent events would overstate the sample (anti-conservative). `n` in the evidence pack is the number of historical episodes. |

### 6.3 A new variant inside an existing family

It is given the next trial index in the family (`m_f` becomes `m_f + 1`). Holm and `p_fam` are recomputed over all `m_f + 1`
tests; **earlier results can only get weaker** (the adjusted p is revised and appended, history not rewritten). The board shows
"related tests: k". A variant written after an earlier family result exists is flagged `postHocVariant: true`; it is counted like
any other and cannot be offered as independent confirmation of the variant that suggested it.

### 6.4 Assumptions, stated plainly, and the conservative choice

1. **Holm** needs no independence assumption. **BH** controls the FDR if the family p-values are independent or positively
   regression-dependent (PRDS). Families are not independent (they share the dollar, rates and equity-vol factors; the repo's own
   cross-instrument forecast errors correlate about 0.47, data-rules item 7). Positive dependence is plausible and typical, but
   **PRDS is assumed, not shown**. Hence `qBY` is displayed; the gate for "worth a preregistration" remains BH q <= 0.10 (as in
   DATA_AGENT.md), and a BH pass that fails BY is labelled as such. This is the less conservative of the two defensible gates and
   the owner should know that. (Using BY as the gate costs a factor of about the harmonic sum of m: roughly 6 at 200 families.)
2. `p_fam` is Bonferroni-type, so under the null it is stochastically *larger* than uniform. That makes BH on `p_fam` conservative
   for families with many variants.
3. **Family assignment is a human-defined rule.** Too coarse hides distinct hypotheses (a false merge makes the family test
   stricter, which is the safe direction); too fine inflates the count of families and loosens BH. Merge-only protects against the
   second.
4. **BH resets each month.** Over a year there are about 12 separate FDR controls and no year-level control. Cumulative `m_f`
   inside a family does not reset, so a family tested repeatedly keeps paying.
5. Rejected alternatives: (a) an *effective number of independent tests* (eigenvalue methods on a correlation matrix of the test
   statistics): needs a stable correlation estimate across hundreds of heterogeneous statistics, and it tends to shrink m, which is
   anti-conservative. (b) A **permutation / max-T (Westfall-Young) approach**: exact under dependence and the right tool *inside a
   family whose variants share dates* (cross-instrument date-block resampling, as data-rules already requires); it is a P4 option
   for within-family p-values, not required for P4. (c) Treating every observation as a trial: the most conservative, but it makes
   persistence itself a penalty and would make every real anomaly unprovable.

### 6.5 What the registry still records, and the ledger

The registry records every observation (section 5). The monthly roll-up writes `analysis/output/roe/<YYYY-MM>/rollup.json` with:
`nObservations`, `nEpisodes`, `nFamilies`, `nPrimaryTests`, `nNewFamilyTests`, `scanBreadth` totals, and the BH/BY results. **The
repo's trial ledger does not read the research register** (`scripts/build_trial_ledger.mjs` reads `js/deskEvidence.js` and lists
preregs with no verdict; it has no register or EXPLORATORY code path, verified 2026-11-08), so v1's statement that a monthly
register row makes the ledger count the looks was wrong (section 21). The honest options are a small ledger section that reads the
roll-up files (needs code) or leaving the ledger as it is and disclosing the search in the roll-up (default; Q5). A Stage 2 result
that matters is banked through research-protocol exactly as today: one prereg and one ledger entry **per family confirmation**
(the variants are listed inside it).

### 6.6 Interaction with DATA_AGENT.md and the existing rules

| DATA_AGENT.md section 4.3 | v2 |
|---|---|
| Rule 3: "Every sent question is a trial" | A question is still a recorded trial in the registry; for correction the **family** is the counting unit and the primary tests inside it are the Holm unit. |
| Rule 4: "Holm across the horizon family inside a question (already in QT); BH q = 0.10 across all questions run in the same calendar month" | Holm now spans the whole family's variants and horizons (stricter inside a family). BH's unit is the **family** (smaller m across mechanisms, so others get a slightly easier BH threshold; the within-family cost is paid in `p_fam`). **This changes the BH unit and is the one existing research-counting rule v2 changes.** Everything else in rule 4 (|t| >= 2 second half, placebo, sweep rank, promotion needs |t| >= 3 or a passed forward test) stands. |
| "A monthly full sweep" (rule 2) | Unchanged. The sweep's items are families' generic variants; the sweep rank stays the noise reference. |
| Lockbox rules, cut-off 2026-08-21 | Unchanged (section 8). |

`js/preregStats.js` already has `holm` (labelled "for the SCORED cells") and `benjaminiHochberg` (labelled "for DISAGGREGATION
cells"); **no BY function exists**, so BY is new code (a few lines).

## 7. Three-stage evaluation (change 2)

### 7.1 The stages

| | Stage 1 Discovery | Stage 2 Confirmation | Stage 3 Forward |
|---|---|---|---|
| Purpose | Identify promising questions. **Never proof of an edge.** | Test a *frozen* hypothesis on data it never touched. | Test on data that arrived after the question was generated. |
| Data | the discovery window (section 8.3) | the confirmation slice (section 8.3), never read in Stage 1 | sessions strictly after the freeze date |
| Rule | Internal walk-forward inside the window is **stability evidence** and must never be called independent confirmation (labelled so in every pack). | Hypothesis, specification and procedure frozen and hashed before the run. **One look**: the run is written once; a second run on the same spec is refused (the `lockbox_check --evaluate` pattern). | The hypothesis cannot be rewritten; a change is a new spec, a new trial, a new freeze date. |
| Who runs it | historical evaluator | historical evaluator | forward tracker |
| Output | Evaluation Store row (stage 1) | Evaluation Store row (stage 2) | Forward Ledger rows |
| Counted in | family Holm and monthly BH (section 6) | the Stage 2 looks of the month are counted and BH-corrected together (the slice is shared by all hypotheses) | not corrected; each frozen spec is its own prospective test, pooled only by a registered rule |

Stage 2 starts when Stage 1 meets a pre-stated promise rule (default: family BH q <= 0.10 and a QA outcome of Pass or
Underpowered-with-a-plan); no model money is involved. Whether it is automatic or a button is Q4.

### 7.2 What is recorded per experiment

`snapshotId` (exact data snapshot), `featureVersion` (feature-calculation version), `codeCommit`, `testSpecHash`, `seed` (one per
study, as research-protocol requires), `frozenAt` (date the hypothesis was frozen), `confirmationDataset` (the exact permitted
dataset: series ids, `from`, `to`, content hash). A Stage 2 run that finds `confirmationDataset` different from the frozen one
refuses to run.

### 7.3 Baseline library and incremental value

The question template names the baseline(s) before any result; the evaluator selects from this library per hypothesis:

| Baseline | Use when the hypothesis is about |
|---|---|
| unconditional mean / no-change | always included as the floor |
| momentum | direction or return after an extreme |
| mean reversion | levels, spreads, extremes that should revert |
| volatility-only | ranges, vol, and anything whose target scales with vol |
| regime-only | a condition that is really a regime label |

A result must show **incremental predictive value over the relevant baseline**, not just significance: the signal added to the
baseline versus the baseline alone, out of sample (walk-forward), as a loss difference with a block-bootstrap interval; the claim
needs the interval above zero **and** the gain at or above the question's smallest effect of interest. A significant effect that the
baseline already explains is reported as "no incremental value". Baselines must not be the frozen lockbox layers' outputs (section
8.4).

## 8. LOCKBOX: what the repo says, what each stage may use

> **RELEASE BLOCKER: owner must confirm before P1.** Nothing in this section changes a lockbox rule. It maps the existing files,
> proposes how the ROE stays outside them, and lists what is ambiguous. P1 (the first code) does not start until the owner
> confirms section 8.3 (the date table), reads 8.5, and answers Q1-Q3.

### 8.1 What the existing files say (read in this worktree, quoted)

| Source (line) | Quote or fact |
|---|---|
| `forge/LOCKBOX_PROTOCOL.md` L3-4 | "Written and frozen 2026-10-06 ... Frozen; this file is not amended. A later lockbox needs its own file and a new holdout." |
| L8-9 (Why) | "The 2025-09-05 -> 2026-08-21 test year has been scored across about ten variants ... It is now research data." |
| L28-29 (H-A) | "**H-A (history not yet seen):** every London session **after 2026-08-21** in the OANDA M1 data, once downloaded ... None of this has been loaded locally or used in any fit or score." |
| L30 | "**H-B (forward):** the shadow screens' sessions **from 2026-10-07**." |
| L34-35 (when) | "The evaluation runs **once**, on the first date when H-A + H-B together hold **>= 60 sessions** with usable data (expected late November 2026)." |
| L36-38 | "the shadow screens may be watched for operation ... **no model, parameter or rule may be changed because of what they show**; no script may score layers 3, 5 or 6 on H-A." |
| L40-41 | "`python -m forge.lockbox_check --evaluate` is the only sanctioned evaluation: it verifies the hashes, scores each layer with its own pre-registered rule, appends the result to `forge/lockbox_log.json`, and refuses to run again." |
| Layers (table) | 3: HAR-800 ladder (`js/forecastLadderParamsHar800.js`, `scripts/rangebook/har800_sigma.mjs`, `js/forecastSigma.js`, `js/forecastLadder.js`, `js/forecastLadderParams.js`); 5: R3 per-hour multipliers (`js/remainingTravelParamsR3.js`); 6: M2 recipe (`analysis/pathmap/confidence_fit.py`). 13 files hashed in `forge/lockbox_manifest.json` (frozen 2026-10-06). |
| `forge/lockbox_check.py` L17-18, L43 | `HOLDOUT_AFTER = "2026-08-21"`, `MIN_SESSIONS = 60`; sessions counted: `days > HOLDOUT_AFTER` and weekday, from `VolRangeForecaster/data/m1/eurusd_m1.parquet` only. |
| L58 | "ready - wire the per-layer scorers here before the one evaluation (see protocol)". The evaluation itself is not wired. |
| `forge/lockbox_log.json` | **does not exist** in this worktree, so no evaluation has been recorded (L51 refuses a second run only if a logged entry has `evaluated`). |
| `forge/LOCKBOX_ADDENDUM_1.md` | The evaluation also **reports** a neutral-bucket 30-cell regime miss beside the frozen layer-3 rule; the protocol is not changed. |
| `.claude/skills/data-rules/references/lookahead-and-oos.md` L5-11 | Blocks: FIT < 2022-09-05; CHECK 2022-09-05 -> 2025-09-04; "Former test year 2025-09-05 -> 2026-08-21 ... is now research data"; H-A "every London session after 2026-08-21 ... no script may score layers 3, 5 or 6 on it"; H-B "shadow sessions from 2026-10-07". Also: "`loadM1ForPair` always merges the nightly R2 tail, so with R2 credentials any JS research script ... can see H-A sessions. Truncate explicitly." |
| `js/quickTest.js` header | "every date after 2026-08-21 is dropped from both series before anything is computed". |
| `plans/DATA_AGENT.md` section 4.3 item 6 (L485-490) | "Replay and the quick test cut at 2026-08-21. The forward record is, by construction, after the lockbox date. The rule proposed (open question 3): the Data Agent records forward outcomes but does not display or use forward scores in any decision until `python -m forge.lockbox_check --evaluate` has run once ... After that, scoring forward data of the Data Agent's own questions is not scoring layers 3, 5, 6 and is allowed." This is DATA_AGENT's own proposal (open question 3, L630-632), **not** a lockbox rule. |

### 8.2 Protected today, in one list

- **Datasets protected by the lockbox rule:** the three frozen layers' *scoring* (3, 5, 6) on every London session after 2026-08-21
  (H-A), and the shadow screens' operation from 2026-10-07 (H-B: nothing may change because of what they show).
- **Not literally forbidden by the lockbox file:** other analyses on H-A. The file restricts *scoring layers 3, 5, 6* and
  *changing things because of the shadow screens*. Other studies have already touched post-cutoff data (section 8.5, A5). The ROE
  was stricter than the file in v2 (8.4). **v2.2: the owner relaxed this for hypothesis FORMATION (8.6).** The remaining reason for
  care is unchanged: evidence for a hypothesis must come from data that did not inspire or tune it.

### 8.3 Which dates and datasets each stage may use (PROPOSED; owner confirms: Q1, Q2)

"Cut" below means the last permitted London session. The protocol's own cut is "after 2026-08-21", i.e. 2026-08-21 itself is not
H-A; the local research M1 stops at 2026-08-20 (`forge/INTRADAY_EXTREME_PATHS_PREREG.md` L148) and that prereg treats 2026-08-21
onwards as its forward block. The default here is the stricter **2026-08-20** for every ROE evaluation window (Q2); no lockbox
rule changes.

| Use | Dates available | Datasets | Notes |
|---|---|---|---|
| **Scanner inputs** (state and observation only) | everything up to and including today's run, including sessions after 2026-08-21 | laptop files, `GET /api/state`, today's snapshot | Used to see *today's* readings and open episodes. The scanner computes **no forward outcome** and selects nothing by outcome. Percentiles are causal. Outputs of the frozen layers 3, 5, 6 and the shadow screens are **not** watch items (8.4). |
| **Hypothesis selection** (Stage 1) | series start through **2025-09-04** (end of the repo's CHECK block); never later | committed daily/NY-close series, feature store, history with explicit `to` | A question is *selected* (kept for Stage 2) only on Stage 1 results from this window. |
| **Replay evaluation** (Stage 1) | the same window | same | Stage 1 sees nothing in the confirmation slice. |
| **Stage 2 Confirmation** | **2025-09-05 through 2026-08-20** (the "former test year": research data for layers 3/5/6, but no ROE question has been run on it) | same series, same snapshots | One look per frozen hypothesis; the slice is shared, so the count of looks is recorded and BH-corrected. About 11.5 months: many questions will return Underpowered, which is the honest answer (`plans/FORECAST_INFORMATION_ROADMAP.md` L58 already says the post-cutoff lockbox "is about 45 sessions, too short for most questions"). |
| **Stage 3 Forward** | sessions **strictly after the freeze date** of each hypothesis; in practice all after 2026-08-21 | forward data as it arrives | Written to the Forward Ledger; display and use in any decision are **held until the one lockbox evaluation has run** (DATA_AGENT.md open question 3, kept). |
| **H-A** (all sessions after 2026-08-21) | **v2.2: may inspire and form hypotheses** (the scanner sees it; section 8.6). Not used as Stage 2 confirmation. Stage 3 counts only sessions after a hypothesis's freeze date. Questions whose target is a frozen layer's own forecast are not scored on it (8.6). | n/a | The only sanctioned use is `forge.lockbox_check --evaluate`, scoring layers 3/5/6. Even after it has run, the ROE does not treat H-A as untouched (the scanner has seen it); Q3. |

**The rule.** The scanner and discovery must not use H-A-protected observations to select hypotheses that are later evaluated
against those same observations as independent validation. How it holds:

1. The scanner may *look* at current data (state, percentiles, which episodes are open), because a question has to come from
   somewhere. It computes no outcome and selects nothing by outcome.
2. Hypothesis *selection* and replay *evaluation* are cut at the Stage 1 and Stage 2 windows above, by an explicit `to` on every
   loader plus a **truncation test** (feed the loader a series that extends past the cut and assert nothing past the cut arrives).
   `loadM1ForPair` merges the R2 tail by design (data-rules), so the v1 claim that "the data-loading code path takes an explicit
   `to` and cannot see later sessions" is **a requirement of P1/P4, not a fact today** (not verified for any ROE loader, because
   none exists).
3. **What "forward" means relative to H-A.** A hypothesis is frozen on date t (the day its spec is written, before any later
   outcome exists). "Forward" is every session strictly after t. Calendar-wise those sessions are inside H-A (everything after
   2026-08-21), but they are a different object from "H-A as an independent validation set": the lockbox forbids *scoring layers
   3, 5, 6* on H-A; Stage 3 scores the ROE's own frozen hypotheses on data that did not exist when they were written. Observations
   of the same pattern between 2026-08-21 and t were visible to the scanner and are therefore **not** independent evidence for
   that question; only data after t counts.

### 8.4 ROE self-restrictions (stricter than the lockbox file; not lockbox changes)

- No ROE baseline, feature or watch item may be an *output* of the frozen layers (HAR-800 sigma, R3 remaining-travel multipliers,
  M2 confidence) or of the shadow screens until the lockbox has been evaluated. The volatility-only baseline uses a plain trailing
  realised-vol estimate, not `forecastSigma`/HAR-800.
- Forward scores are recorded but not displayed or used until the evaluation has run (DATA_AGENT.md open question 3, v1 kept).
- The ROE changes no model, parameter or rule of any frozen file (hashes in `forge/lockbox_manifest.json`).

### 8.6 Owner decision on H-A (v2.2): hypotheses may be formed from it

The owner's answer to Q3: the three frozen layers (HAR-800 ladder, R3 remaining travel, M2 confidence) **may still be good**, but
the post-2026-08-21 data **can still be used to form hypotheses**. Recorded as follows. No lockbox rule is changed (the protocol
never forbade this; A4).

| Question | Rule from v2.2 |
|---|---|
| May the scanner and question writer use H-A sessions to *observe* and *form* hypotheses? | **Yes.** |
| May any ROE result be scored on H-A as independent confirmation of a hypothesis that H-A inspired? | **No.** Confirmation stays on 2025-09-05 to 2026-08-20 (Stage 2); Stage 3 forward counts only sessions strictly after the hypothesis's freeze date. The evidence must come from data that did not inspire or tune the hypothesis. |
| May the ROE score layers 3, 5 or 6 on H-A, or change them because of what H-A or the shadow screens show? | **No** (the existing lockbox rule, unchanged). The one sanctioned evaluation is `forge.lockbox_check --evaluate`. |
| May the ROE propose and test questions about the layers' own targets (daily range, remaining travel, confidence in EURUSD) using H-A? | **Not on H-A** until the lockbox evaluation has run: such a hypothesis can be formed and tested on the Stage 1 and Stage 2 windows only. |
| May ROE baselines, features or watch items be outputs of layers 3/5/6 or the shadow screens? | **No**, until the evaluation has run (8.4, unchanged). |
| Is H-A treated as untouched after the evaluation? | **No**: the scanner has seen it. |

Effect on the stage table (8.3): none for Stages 1 and 2; the H-A row now says "may inspire hypotheses". A hypothesis inspired by
a post-2026-08-21 observation is therefore tested on earlier windows that exclude the inspiring observation, then followed forward.
Q2: the 2026-08-20 default is applied (every ROE window ends on 2026-08-20); say if you want 2026-08-21 included.

### 8.5 Ambiguities in the existing lockbox files (reported, not resolved; no rule changed)

| # | Ambiguity | Where | Needs the owner? |
|---|---|---|---|
| A1 | **The 2026-08-21 seam.** The protocol puts 2026-08-21 outside H-A ("after 2026-08-21") and `lockbox_check.py` counts `days > "2026-08-21"`; but local M1 ends 2026-08-20 and `forge/INTRADAY_EXTREME_PATHS_PREREG.md` L148-153 and `data-rules/references/sources.md` L19 call the "post-2026-08-20" bars the forward/holdout block, and that prereg says "These sessions are also H-A". Which side of the line 2026-08-21 falls on is not stated once. | protocol; code; two other files | Q2 (default: ROE uses 2026-08-20) |
| A2 | **"H-A + H-B together hold >= 60 sessions"** (protocol L34-35) versus the code, which counts only `days > 2026-08-21` in one EURUSD parquet (`holdout_sessions`). H-B (from 2026-10-07) lies inside the H-A calendar span, so "together" (sum or union) is not defined. | protocol L34-35 vs `lockbox_check.py` L43 | informational for the ROE; owner may want it stated |
| A3 | **The evaluation is not wired** (`lockbox_check.py` L58) and `forge/lockbox_log.json` does not exist; "expected late November 2026" is an expectation, not a schedule. By my count there are about 55 weekdays from 2026-08-24 to 2026-11-06 and the 60th weekday is 2026-11-13 (not holiday-adjusted, not checked against any data; it also needs the M1 refresh, which needs the OANDA key). | protocol; code | no |
| A4 | **Scope of the restriction.** The protocol forbids *scoring layers 3, 5 or 6* on H-A and *changing things because of shadow screens*. It does not say whether *selecting new hypotheses* from H-A observations is allowed. | protocol L36-38 | Q3 |
| A5 | **The holdout is already not clean for other studies.** `plans/REPO_REVIEW_2026-10-31.md` L219: "Lockbox leaks ... the holdout is no longer clean for these families: v4 dirtag and stage1 run to 2026-09-28; the macro-confluence re-run scored to 2026-10-02; the fetchD1Aligned studies have no cap." `plans/DATA_AGENT.md` section 1.13 item 6: the OI-book parquets hold rows 2026-08-21 -> 2026-09-04. | review; inventory | informational |
| A6 | **Two lockboxes, same dates.** The intraday-extreme-paths block ("scored once ... >= 3,000 distinct instrument-sessions", its own rules) is described as also being H-A, with the protocol's rules "unaffected". | `forge/INTRADAY_EXTREME_PATHS_PREREG.md` L148-153 | informational |
| A7 | "H-A" and "H-B" are also used as local hypothesis names in `plans/RATES_NASDAQ_WORKLOG.md` L92-97 ("H-A 45 cells, H-B 20 cells"); those are not the lockbox sets. | worklog | no (naming) |

The ROE does not need A2, A3, A5-A7 answered to be safe; it needs A1 (Q2) and A4 (Q3), and the date table in 8.3 (Q1).

## 9. Research QA (change 3)

**What QA is, and is not.** QA states whether a result can be **interpreted**. It does not say whether the hypothesis is true. It
runs automatically on every ROE evaluation result (Stage 1 and Stage 2) and, as in v1, before the Head accepts any null or "no
relationship" claim from the researchers or the quick test. Plain code, no model call.

**Outcomes** (several may apply; each carries its numbers):

| Outcome | Meaning |
|---|---|
| **Pass** | The result can be interpreted: data, alignment, control, test and power are adequate for the claim made. (A Pass can still be a null: "no effect found with adequate power".) |
| **Underpowered** | The minimum detectable effect is larger than the question's smallest effect of interest, so the test could not have seen the effect that matters. "Could not tell". Never reported as a negative finding. |
| **Misaligned** | Timestamps, session definition, unit, vintage or period do not match the hypothesis (X not known before Y's window; wrong London session; revised macro data where first print is needed). |
| **Missing control** | No baseline, placebo or mirror was run where the hypothesis needs one. |
| **Wrong test** | The test does not fit the question (overlap not handled, wrong horizon family, no multiple-testing correction, event sample that counts days of one episode as independent). |
| **Not replicated** | A held-out half or later slice, same sign, was required and is missing or disagrees. |

**Power.** From the **effective sample size** `n_eff = n / deff` (design effect from autocorrelation and overlapping observations;
for an event study `n_eff` is the number of episodes separated by at least the longest horizon), the outcome's standard deviation,
and a minimum detectable effect from `mdeMeanDiff({ sd, n1, n2, alpha, power, deff })` in `js/preregStats.js` (it already takes a
design-effect `deff`). The smallest effect of interest (SESOI) is written in the question before any result (from the mechanism or
the cost hurdle). `Underpowered` if MDE > SESOI. "No effect found with adequate power" needs MDE <= SESOI **and** a confidence
interval excluding the SESOI.

**There is no universal "750 observations" rule.** "750" means three different things and must never be compared across them:

| Quantity | Example | Typical effective N |
|---|---|---|
| 750 daily observations | about three years of daily returns, one-day horizon | close to 750 |
| 750 overlapping observations | daily samples of 20-day forward windows; or 750 five-minute windows inside a few dozen sessions | about 750/20 = 37 for the first; far fewer independent sessions for the second |
| 750 independent event observations | 750 separate episodes | 750 |

**Relation to the existing quick test.** `js/quickTest.js` sets `MIN_OVERLAP = 750` and returns UNDERPOWERED (data) when X and Y
share fewer than 750 days (header: "Under 750 overlapping days -> UNDERPOWERED (data)"). That is a data-sufficiency floor on the
number of shared dates, **not** an effective-N statement. It **stays exactly as it is for the quick test**. For ROE questions QA's
effective-N reasoning decides whether a result can be interpreted: a long-horizon question on 750 days can fail QA; a rare-event
question on fewer than 750 shared days is judged on its episodes. If an ROE question is routed through the quick test, the quick
test's floor still applies to that run and QA reports it as Underpowered with the reason "quick-test floor".

**Consequence (unchanged from v1).** The Head may not accept a null that QA marked anything but Pass; it carries it as
*inconclusive* with the QA reason. The board shows the reason in plain words. In the flow charts QA sits between the Evaluation
Store and the board, and between the researchers/quick test and the Head.

## 10. Data architecture and reproducibility (change 7)

1. **Immutable daily input snapshots.** The snapshot job writes a manifest once per session: series ids, source, as-of date, row
   count, SHA-256 per input, snapshot id. Never overwritten; a correction is a new snapshot with a new id. (Proposed storage:
   write-once under R2 `forward/roe/snapshots/<date>/<runId>/`, the existing write-once `forward/...` pattern; nothing is
   created now.)
2. **Dataset freshness checks**, run before the scan, producing flags that travel with every observation (`inputFlags[]`):
   missing series; stale (no new print, or an identical-value run: the quick test already checks "stale runs (>= 5 identical
   prints)"); unexpected timestamps (future-dated, wrong timezone, a Sunday stub); incomplete session (before 22:00 London for a
   `london22` session); **revised macro data** (a value that differs from its first print is flagged, because the point-in-time
   rule needs the first print). `/api/data-health` is today's only check for stale laptop feeds (DATA_AGENT.md section 1.13 item
   5), so it is the model, not a substitute.
3. **No opportunity from bad or incomplete inputs without a flag.** A flagged question is still written and shown (nothing is
   suppressed), with the flag on its row; the board states "input flagged: stale skew".
4. **Run IDs and idempotent submission.** `runId = hash(date, watchVersion, snapshot manifest hash, codeCommit)`. The server
   records a push by `runId`, with a commit marker written last. A repeated push of the same `runId` returns "already recorded" and
   creates **no** duplicate observation, question, opportunity or trial (observation IDs and spec hashes are deterministic, trial
   indexes are assigned server-side by spec hash).
5. **Data and feature versions, code commit.** `featureVersion` and `watchVersion` (frozen trigger file) and `codeCommit` are
   stored on every observation and every Evaluation Store row.
6. **Reproducible evaluation records.** An Evaluation Store row holds enough (snapshot id, hashes, spec hash, seed, commit,
   windows) to rerun and match. If a source cannot be re-read to the same hash (a revised series), the row is flagged
   `not-reproducible-from-source` and the stored extract is the evidence.
7. **Explicit failure states.** The board header always shows the run it is built from: *completed* (with its date and run ID),
   *completed with flags*, *partial*, **"discovery not completed for <date>; last completed run <date>"**, or *stale*. If the laptop
   did not run, the board says discovery was not completed and **never shows yesterday's board as today's**. A server-side check
   at a fixed time compares the expected session date with the latest completed `runId` (a new check; the pattern exists in
   `/api/data-health`).

## 11. Ranking and the board (change 6)

The board helps decide **what to investigate**; it is not a scoreboard of truth.

- **No single league table across unlike hypothesis families.** Rows are grouped by comparable family (same mechanism, same
  target class, same horizon class) and ranked **inside** the group.
- Ranking key inside a group: the lower bound of the interval of the **incremental gain over the baseline** (conservative), then
  power. It is never "has failed before".
- Every row shows: adjusted significance (`pFamily`, `qBH`, `qBY`), effect size with its interval, power and the MDE against the
  smallest effect of interest, the **incremental performance over the baseline** (and which baseline), the **number of related
  tests** (family trial count `m_f`) and the number of historical episodes, the QA outcome, the input flags, and the neutral history.
- **"Could not tell" is separate from "no effect found with adequate power".** Underpowered, Misaligned, Missing control, Wrong
  test and Not replicated results sit under "could not tell"; only a QA Pass with MDE <= SESOI and an interval excluding the
  SESOI may say "no effect found with adequate power".
- Direction questions keep the neutral tag **"base rate: low"** (Evidence Book: macro direction 0 of 82 validated), shown, never
  used as a demotion.
- The forward column shows counts only ("0 events") until the lockbox evaluation has run (section 8).
- No row is hidden and no label says rejected, dead or failed.

```
RESEARCH OPPORTUNITIES   run 2026-11-07 (completed)  scanned 412 items, 31 flags (23 episodes: 9 new, 14 persisting)   [PLANNED: mock, no data]
this month: 640 observations, 118 episodes, 41 families (BH unit)

FAMILY: implied-vol term structure -> equity range       (comparable rows ranked inside this group)
 #  Question (why it arose)                  Stage 1 (to 2025-09-04)             Adj.            Power / MDE      vs baseline        Related   Stage 2 / Fwd      History (neutral)         Action
 1  VIX9D/VIX 97th pct, day 3 of episode:    NQ 5d range vs IV line              pFam .012       0.82 / 0.11 sd   momentum: +0.03    6 tests   Stage 2 not run /  not tested before         [Open case]
    next 1/5/10 sessions, NQ range           +0.21 sd, CI 0.08 to 0.34; n=212    qBH .04 qBY .21  (SESOI 0.10)     CI 0.01 to 0.05   in family  0 events

FAMILY: credit stress -> equity range
 2  CCC OAS +68bp in 20d, IG calm            SPX range 20d: +0.05 sd             pFam .31        0.41 / 0.19 sd   vol-only: +0.01    9 tests   -                  tested 2026-10-02:        [Open case]
    equity range and credit, 5/20/60d        CI -0.09 to 0.19; n=97              qBH .31 qBY 1.0  (SESOI 0.10)     CI -0.04 to 0.05  in family                    no incremental power

COULD NOT TELL (not a negative finding)
 3  EUR spec share 0th pct, commercials 100th   EURUSD 4-week return: n=9 episodes   -               0.12 / 0.9 sd    -                  3 tests   -                  not tested before         [Open case]
    QA: Underpowered (MDE far above the effect that would matter)
```

Only the button opens a case. Same question with new data or a new mechanism shows as a fresh row.

## 12. Anti-snooping controls

Carried over from DATA_AGENT.md section 4.3, with the owner's decisions and the v2 changes:

1. **No cap, full count.** No daily cap on questions. Log how many items were scanned (`scanBreadth` x triggers) and correct for
   the full count at the family level (section 6). Show a ranked list instead of limiting.
2. **Every question is a recorded trial** in the Opportunity Registry; counting follows section 6. The monthly roll-up is a file
   (section 6.5); whether the ledger reads it is Q5.
3. **Correction.** Holm inside a family (cumulative), BH q = 0.10 across the month's families, BY shown. The evidence pack shows
   adjusted numbers beside raw ones.
4. **Windows are separate** (section 8.3). Stage 1 sees the discovery window only; Stage 2 the confirmation slice once; H-A is
   untouched.
5. **Forward tracking is the real test** (Stage 3), held from display until the lockbox evaluation has run.
6. **Frozen watch list, triggers, family table and episode parameters** in one versioned file; a change bumps `watchVersion` and
   starts a new forward record.
7. **Monthly full sweep** of every item at its generic trigger, so a question's effect is ranked against all items.
8. **Built-in controls:** mirror (opposite extreme), a placebo series, one-session delay, shifted dates, concentration by year.
9. **No model chooses which extreme to study.** Stage 1 has no model call; the writer is a lookup into frozen templates.
10. **Registry isolation** (section 5): no prior results reach the writer; no label can demote a question.
11. **Direction questions** carry the neutral "base rate: low" tag (section 11).

## 13. Head of Research, approval authorities (change 5)

The Head is an **adjudicator, not a researcher**. In the case flow it identifies disagreements between the three researchers and
unsupported conclusions; separates facts from assumptions; decides per claim *supported*, *rejected* or *inconclusive*; and
**recommends** a next step with evidence ids. The next-step vocabulary is unchanged (quick-test | architect | preregister | park |
drop) and is a recommendation, not an approval. The Head receives the three answers, the library papers, the whole Evidence Book
and the **Research QA outcome** for every null or "no relationship" claim; it may not accept a null that QA did not Pass.

### 13.1 Approval statuses and who sets them

| Status | Meaning | Recommended by | **Authorised / set by** | Never implies |
|---|---|---|---|---|
| **Research approved** | The evidence supports proceeding to design | Head of Research (after adjudication and after QA has cleared any null it leans on) | **Owner** (a button; records who and when) | a build instruction; that an edge is validated |
| **Design approved** | Architecture and implementation are specified | System architect (its system card) | **Owner** (a button) | that it works |
| **Validation approved** | Tests and acceptance criteria passed | Validation desk (reviews) | **The deterministic Acceptance check**, when every required condition passes | that it is live or sized |

Rules: the three are separate fields on the case; no status implies another; **no LLM authorises its own work**: a model may
recommend, the named authority sets the status; the Head's recommendation is stored as `recommendation`, distinct from the
`approvals.research` the owner authorises. This resolves the v1 inconsistency (section 9 said the Head sets Research approved;
section 15 said the owner presses). In the flows: `Head of Research -> Owner: research -> Research approved` and
`System architect -> Owner: design -> Design approved` (control edges from the owner boxes), and
`Validation desk -> Acceptance check -> Validation approved`. Today there are no approval statuses; the Head's plan names a next
step (the `plan` box).

### 13.2 Role tweak list (documented only; `desk/roles/head_of_research.md` is NOT changed this round)

Current role already has: fact-checking of the researchers' numbers, a side taken on disagreements, peer review (errors,
overclaiming, contradictions with the Evidence Book), one next step, "proposals and reviews, not results".

| # | Tweak | Status in the current role |
|---|---|---|
| H1 | Say "adjudicator, not researcher": do not add new hypotheses or new analysis; write the combined plan only from the researchers' material | partly: it writes ONE combined plan "from the best of the three"; no explicit ban on new ideas |
| H2 | Output a table of **disagreements** and a list of **unsupported conclusions** as separate fields | partly: disagreements covered in prose |
| H3 | Separate **facts** (cited, checked) from **assumptions** in each section | gap |
| H4 | A per-claim decision: supported / rejected / inconclusive, each with evidence ids | gap (today: a side per disagreement, one step per plan) |
| H5 | Read the **Research QA outcome**; never accept a null QA did not Pass; carry it as inconclusive | gap (QA does not exist) |
| H6 | **Recommend** Research approved only when the evidence supports proceeding; state that it is a recommendation, not a build instruction, and that the owner authorises it | gap (status does not exist) |
| H7 | Recommend with **evidence ids** on every recommendation, not only in the register paragraph | partly |
| H8 | When the case came from the ROE board, treat the ROE evidence pack as input data, not as a conclusion; do not read the registry history as a verdict; keep published and internal evidence apart (section 14) | gap |

## 14. Literature integration (change 9)

The literature desk workflow is: **idea -> literature librarian -> scholar search -> paper reader -> research synthesis ->
dossier -> research case** (flow "Research an idea"; agents `literature-librarian`, `paper-reader`, `research-synthesist`). It
becomes the **third route** into the Research Case Registry beside the owner's own question and the ROE board:

| Route | Today | `route` field (planned) |
|---|---|---|
| Owner asks a question | `newCase`: `origin: 'owner'` (or `'weekly'` when no question) | `owner` |
| ROE board, Open case | does not exist | `roe` (with `roeId`) |
| Literature dossier opened as a case | `caseFromDossier`: `origin: 'dossier'`, `dossierId` (one case per dossier; the dossier is the context every prompt reads via `dossierText`) | `literature` |

**One standard of evidence for all three routes.** Whatever the route, a case must state a testable hypothesis with its data and
its smallest effect of interest; keep published and internal evidence apart; pass nulls through Research QA; consult the Evidence
Book; and the Head's recommendation must cite evidence ids. *Research approved* means "worth building a registered test", never
"an edge exists", and no route has a lower bar. A paper's finding never becomes validated evidence in MacroFXModel by itself:
only an internal result (an Evidence Book `validated` entry, an ROE Stage 2 result that passed QA, or a registered prereg run) does.

**The synthesis output keeps two separate fields** (planned):

- `published_evidence`: what the cited papers claim (their data, period, method, effect, out-of-sample, costs). This is the existing
  `evidenceFor` / `evidenceAgainst` (each point must cite a paper the dossier read; the validator already drops points with no
  paper) plus the paper notes.
- `internal_replication_evidence`: what this repo has itself tested, as **Evidence Book ids with their four-word verdicts**,
  filled by **code lookup**, not by the model's say-so. Today's `testHere.alreadyHere[]` is a list of free-text strings written by
  the model (`js/literature.js`, `validateDossier`), not checked against the Evidence Book; that is the gap.

**What exists vs what is new** (verified in `js/literature.js`, `js/researchCase.js`, `js/storeRegistry.js`):

| Exists | New |
|---|---|
| Paper notes: `claim, mechanism, data{market,period,frequency}, method, effect, outOfSample, costs, relevance, stance, caveats, testHere, crossRefs` (validator `validatePaperNotes`; KV `research_pod_papers`) | none for notes (a structured instruments/data-period record is already backlog item 10) |
| Dossier: `hypothesis, summary, evidenceFor[], evidenceAgainst[], unknowns[], testHere{design,data[],alreadyHere[]}, verdict (worth-testing / weak / already-tested), verdictWhy, proposals[], questionsForOwner[]` (`validateDossier`; KV `research_pod_dossiers`) | `published_evidence` and `internal_replication_evidence` as two fields; a lookup that fills the second from `js/deskEvidence.js` |
| Case from a dossier (`caseFromDossier`, KV `research_cases`, `origin: 'dossier'`) | `route` and `roeId`; the Case Registry fields of section 5 |
| Role `desk/roles/research_synthesist.md` | a prompt line telling it to keep the two apart (role text not changed this round, as for the Head) |

## 15. Improvement backlog: what exists in the repo and what is a gap

Verified against the repo on 2026-11-08 (v1). "Exists" means found in code or role files; "partial" says what is missing.

| # | Recommendation | State | Evidence in the repo / what is missing | Priority |
|---|---|---|---|---|
| 1 | Head of Research peer review of the researchers | **Exists** | `desk/roles/head_of_research.md` (peer review: errors, overclaiming, contradictions) | - |
| 2 | Conservative risk veto | **Exists** | `desk/roles/risk_conservative.md` (veto, sparing); Head of Desk: a veto for a top-tier event "should usually stand" | - |
| 3 | Red team | **Exists** (scope: partial) | `desk/roles/red_team.md`: attacks the draft book before the Head of Desk. Gap: it does not challenge the Head of Desk's *final* conclusions and does not receive the underlying evidence beyond the rulings and Evidence Book entries | P2 |
| 4 | Research register / trial ledger / Evidence Book | **Exists** | `plans/RESEARCH_REGISTER.md`, `scripts/build_trial_ledger.mjs`, `js/deskEvidence.js` | - |
| 5 | Librarian "none" = knowledge gap, and a "why" per paper | **Exists** | `js/libraryLibrarian.js`: `none` flag, `why` per pick, closing text "no held paper covers this". Gap: the knowledge-gap statement is not stored as a structured record the Head can cite | P3 |
| 6 | Shared analyst output schema (observation, direction, horizon, confidence, evidence ids, contradictions, catalysts, implication, invalidation) | **Partial** | `analyst_report` in `js/deskSchemas.js` has headline, points (claim, evidence, impact), gaps, confidence. Missing: horizon, contradictions, catalysts, invalidation, an explicit direction field | P2 |
| 7 | Red team challenges the Head of Desk's proposed conclusions, with access to the underlying evidence | **Gap** | Today it runs *before* the Head and sees rulings and the draft book | P2 |
| 8 | Risk desk as a proper gate (event risk, vol regime, liquidity, correlation/exposure, drawdown, sizing) | **Partial** | Three voices plus book factor risk/scenarios (VaR/ES, effective bets) exist; events and vol are covered in prose by the Conservative voice. Missing: a deterministic gate with liquidity and drawdown checks that can block a card | P2 |
| 9 | Economist must not issue market recommendations | **Mostly exists** | `desk/roles/economist.md`: "history is not a forecast; never say which way the number will surprise". Missing: an explicit "no recommendation" line; `bookAtRisk` lists cards with views, which is context, not advice | P3 (one sentence) |
| 10 | Paper metadata record (methodology, instruments, data period, limitations, replication status = our own verdicts, evidence quality) | **Partial** | `desk/roles/paper_reader.md` captures setting, method, out-of-sample, costs, cross-references. Missing: structured fields for instruments and data period, "replication status" as our own verdicts, an evidence-quality grade | P2 |
| 11 | Paper versioning | **Gap** | `js/paperCatalog.js` dates a paper, but there is no version chain (v1/v2 of the same working paper) | P3 |
| 12 | Equation provenance (page and bbox traceable; symbol dictionary later) | **Partial** | `js/paperText.js` blocks carry `page` and `bbox`; equation LaTeX layers keyed by block. Not verified: whether every LaTeX result keeps the link to its bbox. Symbol dictionary: gap | P3 |
| 13 | Experiment registry | **Exists in part** | The research register + trial ledger cover studies; the Opportunity Registry (section 5) is the planned registry for *questions and specs* | P1 (ROE P1) |
| 14 | Model / agent evaluation framework | **Partial** | `js/analystScorecard.js` scores analysts; the control (one prompt) agent is the benchmark. Missing: evaluation of the research pod's agents (did the Head's recommendation survive?) | P3 |
| 15 | Agent Operating Framework (input/output contracts, task lifecycle, quality gates, cost tracking, human approval points) | **Gap** (pieces exist) | Pieces: role frontmatter, `js/deskSchemas.js`, model cost caps, the Agents tab. Missing: one document and one machine-readable contract per agent; quality gates and approval points as data | P2 |
| 16 | Approval statuses with named authorities | **Gap** | Section 13 | P0 (flow data done) |
| 17 | Research QA gate | **Gap** | Section 9 | P1 |

Priority key: P0 documented now; P1 build with the ROE core; P2 next; P3 when convenient.

## 16. What changed from `plans/DATA_AGENT.md`

| Topic | DATA_AGENT.md | ROE (this document) |
|---|---|---|
| Name and place | "Data Agent", a standalone agent | **Research Opportunity Engine**: scanner + writer + evaluator + four stores + forward tracker; group "Data" on the Agents tab |
| Where the scan runs | Server job at about 22:30 London, reads `/api/state` and R2 | **Owner's laptop, Python**; reads local data and `GET /api/state`; pushes to an authenticated server endpoint, keyed by run ID |
| Daily cap | At most 5 new questions a day | **No cap.** Log the number scanned; correct at the family level; show a ranked list |
| Banked nulls | A question re-asking a banked null is queued as "context only" unless a new mechanism is stated | **Removed.** The registry never labels, hides or demotes; history is a neutral line; same question on new data or a new mechanism is a fresh test. Only an identical spec on the same window is de-duplicated |
| Evidence Book screen | "already answered: <ids>" attached to the question | The Evidence Book still informs researchers and the Head in a case; the ROE board shows neutral history only and the **question writer never sees prior results** |
| Hand-off | Owner sends to a case or a quick test; `POST /api/data-agent/send` | **Button: Open case** on the ranked board, never automatic |
| Replay / forward | Replay then forward record | Three stages: Discovery, Confirmation (one look), Forward |
| Multiple testing | Holm over horizons; BH q = 0.10 across all questions in the month | **Holm over the family (cumulative); BH q = 0.10 across families in the month; BY shown** (section 6) |
| Approvals | none | Research approved / Design approved (owner authorises on recommendation) / Validation approved (acceptance check) |
| Null results | none | **Research QA** on every ROE result and before the Head accepts a null |
| Storage names | `data_agent_*` | Four logical stores; names to be proposed in the build phase; none created now |
| Lockbox rules, watch list, templates, inventory | as written | Lockbox rules **stand unchanged** (section 8); DATA_AGENT.md remains the inventory, watch list and templates |

## 17. Later enhancements (not for P1)

1. **Knowledge-gap detector.** Join the scanner's current readings with the paper library: for a flagged relationship, ask what
   the library holds about it and whether the reading departs from it. Example: the gold / real-yield relationship has weakened in
   the data while the library's papers describe it as stable; the detector raises "the library describes X, the data now shows
   not-X" as a *question for the owner*, with the paper ids. It never tells the writer which questions are good or bad, and it
   reads only the library and today's state (no registry results). Needs the structured paper metadata of backlog item 10 first.
2. **Feedback from validated research to the engine.** A monthly, owner-reviewed note on which **datasets and methods** have
   produced reproducible findings (for example, "series from the feature store with first-print vintages reproduced; Yahoo cash-index
   sigma did not"), used to improve data hygiene and method defaults. **Explicitly not** a signal about which *questions* are good
   or bad: the registry still never feeds results to the writer, and the writer never learns from outcomes.

## 18. Phases, estimate and what each needs from the nine changes

**The 6-7 week estimate is not a commitment.** It stays a rough guide only until three dependencies have been inspected and
tested: **data integration** (laptop files, the feature store, `/api/state`, snapshot storage), **the evaluator** (the quick-test
machinery and loaders do not yet cut at a date by construction; `loadM1ForPair` merges the R2 tail), and **the lockbox
dependencies** (the date table of section 8, the A1-A4 ambiguities, and the not-yet-wired lockbox evaluation). P0 is this document
and the flow data. P1-P7 below are the phases (v1 P8, the optional wording tidy, is unchanged and later).

| Phase | What | What it needs from the nine changes |
|---|---|---|
| **P0** | v1 plan, flows, tests; **v2 (this round)**: plan, flow data, tests | done in docs and data only |
| **P1** Scanner and triggers | Frozen watch list, trigger file, causal state module (`forge/roe/`); tests on synthetic series (a planted extreme must fire; noise must fire at the nominal rate); `scanBreadth` logging | (1) episode and family IDs and the family table with episode parameters; (7) snapshot, freshness flags, run ID and deterministic IDs; (8) **owner confirmation of section 8 first**, explicit-`to` loaders and a truncation test, no frozen-layer outputs as watch items |
| **P2** Laptop / server integration | Snapshot job, push client, **server endpoint + KV keys** (registered in the three places; plus a `js/serviceFlags.js` row if a server job is added); questions queue | (7) idempotent push by run ID, "discovery not completed" state, `/api/data-health`-style check; (4) physical layout for the stores (names proposed, owner go-ahead) |
| **P3** Question writer and board | 22 templates as rules (with baseline and SESOI per template); evidence-pack format; ranked board page | (1) one question per episode, family on each question; (2) baseline selection and SESOI in the template; (6) grouped, no-league-table board with the could-not-tell split |
| **P4** Historical evaluator | Extend the quick-test catalogue and loader, range runner on committed NY-close parquets, Stage 1 and Stage 2, provenance, Holm/BH/BY, registry counts | (1) family Holm, BH over families, BY (new function), roll-up file and the ledger channel (Q5); (2) stages, freeze record, one-look refusal, incremental-over-baseline test; (8) the date table enforced in code, truncation tests; (7) reproducible records |
| **P5** Research QA | Deterministic QA service; wired before Head review and onto every ROE result; Head role tweaks H1-H8 (owner approval of the role text first) | (3) effective N, MDE vs SESOI, six outcomes, relation to the quick-test floor; (9) published vs internal evidence |
| **P6** Case workflow and approvals | Open case button and hand-off route; case registry fields; two owner buttons; acceptance check; literature `route` and the two evidence fields | (4) Research Case Registry fields; (5) recommend / authorise / set; (9) route field, `published_evidence` and `internal_replication_evidence` |
| **P7** Forward tracker | Stage 3; Forward Ledger; display held until the lockbox evaluation has run | (2) Stage 3 rules; (8) "forward" = after freeze, display hold; (1) per-spec prospective record |
| P8 (optional) | Capped DeepSeek wording tidy; remaining watch items to 72; weekly COT run | owner call; cap key in three places |
| Backlog | Section 15 items by priority, independent of the ROE | S each |

Size guide (indicative only, per the caveat above): P1 S-M, P2 M, P3 M, P4 L (the heavy part), P5 M, P6 M, P7 M. Stage-1 value (a
daily ranked list) arrives after P4.

## 19. Reuse

`js/quickTest.js` (walk-forward quintile, block bootstrap, Holm, 750-day floor), `js/preregStats.js` (`holm`,
`benjaminiHochberg`, `mdeMeanDiff` with its `deff` argument; no BY function yet), `js/harness/stats.mjs`, `js/directionLedger.js`
(write-once forward pattern), `js/deskEvidence.js`, `scripts/build_trial_ledger.mjs`, `forge/lockbox_check`, `GET /api/state`
(`js/stateEngine.js`, `js/stateLayers.js`), `js/literature.js` and `js/researchCase.js` (section 14).

## 20. Open questions (6 new in v2, each with a default)

v1's open questions 1 (endpoint and keys), 2 (where the evaluator runs) are unchanged; v1 Q3 (who sets Research approved and
Design approved) and Q4 (who presses Open case) are **resolved** (section 13: the owner authorises; the Head only recommends; the
owner presses Open case); v1 Q5 (ranking) is replaced by section 11.

1. **Q1 (release blocker): discovery, confirmation and forward boundaries.** *Default:* Stage 1 on data through 2025-09-04; Stage 2 on
   2025-09-05 through 2026-08-20 (the former test year, which no ROE question has used), one look per frozen hypothesis; Stage 3
   strictly after each freeze date. Cost: a shorter discovery window than v1's "to 2026-08-21", and a Stage 2 slice of about 11.5
   months that will often return Underpowered. Alternative if you disagree: reserve a different slice, or accept that Stage 2 is
   skipped and Stage 3 forward is the only independent test.
2. **Q2 (release blocker): the 2026-08-21 seam (A1).** *Default:* every ROE window ends at 2026-08-20 (the stricter reading; costs at
   most one session; changes no lockbox rule). Say if you want 2026-08-21 included, as the protocol text and `lockbox_check.py`
   allow.
3. **Q3 (ANSWERED by the owner in v2.2, see section 8.6): selection from H-A, and the frozen layers (A4).** *Original v2 default (superseded):* the ROE never selects hypotheses using H-A
   sessions, never uses the outputs of layers 3/5/6 or the shadow screens as baselines or watch items until the lockbox has
   been evaluated, and does **not** treat H-A as untouched even after that evaluation (the scanner will have seen it).
4. **Q4: how Stage 2 starts.** *Default:* automatically when Stage 1 meets the promise rule (no model money; every look is counted
   and BH-corrected together). Alternative: the owner presses a "Confirm" button.
5. **Q5: how the discovery search enters the trial ledger.** `build_trial_ledger.mjs` reads the Evidence Book and preregs, not the
   register. *Default:* disclose in the monthly roll-up file only, and bank Stage 2 results through research-protocol (one ledger
   entry per family confirmation). Alternative: a small ledger section reading the roll-up files (needs code).
6. **Q6: family table and episode parameters.** *Default:* the 22 templates of DATA_AGENT.md section 3 are the initial families
   (merge-only afterwards), episodes close after `g = 3` sessions without firing, and the smallest effect of interest per template is
   proposed with the template and frozen in P1 with your approval.

## 21. What could not be verified, and corrections to v1

Not verified (marked, not asserted):

- That any ROE data loader cuts at a given date by construction: no ROE loader exists; `loadM1ForPair` is documented to merge the
  R2 tail (data-rules), so "cannot see later sessions" (v1 section 6 item 4) is a requirement, not a fact.
- The count of H-A sessions available locally and the date the lockbox will be ready: the local cache was not read; the 55 / 60
  weekday arithmetic (section 8.5 A3) ignores holidays and data gaps.
- Whether `forge/lockbox_log.json` exists on main or in R2 (it is absent in this worktree).
- Contents of R2, KV and `/api/data-health` (no production reads were made; nothing was called).
- That the Agents tab shows the new `boundary`, `stage` and `owner` box kinds correctly in the browser beyond the rendered flow images
  (the SVG renderer draws any box kind; the page was driven by the repo's mock server).
- Whether the quick test can run for episodes as events (it takes daily closes and a walk-forward quintile); the episode-based
  event sample of section 6.2 is new evaluator code.

Corrections to v1:

1. v1 section 6 item 2 said the monthly roll-up writes a register row "so `scripts/build_trial_ledger.mjs` counts the looks".
   Verified: that script reads `js/deskEvidence.js` and preregs only; it does not read register rows. See section 6.5 and Q5.
2. v1 section 9 said the Head of Research sets Research approved; v1 section 15 (Q3) said the Head recommends and the owner
   presses. v2 follows the second (section 13).

## 22. One trial pool across all three routes (owner addition, v2.1)

Ideas reach a case by three routes (owner, ROE board, literature dossier, section 14) and every one of them is tested against the
same practice and confirmation windows. So the false-discovery accounting of section 6 is **not** an ROE-only rule:

1. **One pool.** Every hypothesis from every route is written to the Opportunity Registry with `route: owner | roe | literature`
   and enters the same families and the same monthly Benjamini-Hochberg set. The route never changes the count, the window or the
   standard of evidence.
2. **Looks on the confirmation window are counted and shown.** Each frozen hypothesis gets one look at 2025-09-05 to 2026-08-20.
   The registry keeps a running `confirmationLooks` count (all routes) and the board and every evidence pack show "look N". A pass
   on look 40 is read knowing it is look 40; a family's adjusted p already includes its own variants (section 6) and the month's
   BH runs across all families that were looked at that month, whichever route they came from.
3. **A paper's idea is a replication, not a search, but not a free pass.** The hypothesis was fixed before it met our data, which is
   an advantage over an idea the scanner picked from our own history. Published results are also often the best of many tries and
   frequently fail to replicate, so a literature-derived hypothesis is held to the same test and its paper stays `published_evidence`
   (section 14). Several variants from one paper (horizons, instruments, specifications) are one family.
4. **The sealed data (H-A) rule applies to every route equally** (section 8): no route may select or confirm on it.
5. **Forward tracking is the evidence that cannot be spoiled by reuse** of the confirmation window, for all three routes alike.

What changes: the registry gains `route` and `confirmationLooks`; section 6 text is read as covering all routes. New code: two
fields and a counter (P1). Existing workflows: none. Existing rules: none (the trial ledger gap of section 6.5 is unchanged).

## 23. Evidence Pack and audit trail (owner addition, v2.1)

**Goal:** for any result or conclusion, anyone (including you in a year) can see what was done, on exactly which data, with exactly
which code, what came out, **why it came out that way**, and re-run it to check. This is separate from, and does not replace, the
Evidence Book (which banks verdicts); the pack is the proof behind a verdict.

### 23.1 What an Evidence Pack holds (one per evaluation and per case conclusion)

| Block | Contents | Produced by |
|---|---|---|
| 1. Claim | The hypothesis, route, stage, family, and the verdict word (supported / rejected / inconclusive / underpowered) | evaluator, then Head's recommendation |
| 2. Inputs | Snapshot id; content hash of every dataset used; window boundaries and the stage table of section 8; freshness flags; feature versions | scanner / evaluator |
| 3. Procedure | Frozen spec and its hash, code commit, seed, package versions, freeze date, the confirmation dataset permitted | evaluator |
| 4. Raw results | Result tables, outcome distributions, baseline comparisons and deltas, intervals, n and effective n, power and minimum detectable effect, the Research QA outcome with the checks and numbers behind it | evaluator, Research QA |
| 5. Why (computed, not narrated) | A deterministic breakdown of where the result comes from: by year, regime, instrument and event; leave-one-out (does it survive removing the best month or the biggest event); cost sensitivity; placebo and mirror results; parameter sensitivity; the effect before and after the multiple-testing adjustment | evaluator (new code, P4) |
| 6. Trial context | Family id, trial index in the family, `confirmationLooks`, the adjustment applied and the adjusted value | registry |
| 7. Interpretation | The Head's review and any model-written explanation, **with every claim linked to evidence ids** (blocks above, Evidence Book ids, paper ids); a claim without a link is flagged "unsupported" | Head of Research |
| 8. Literature context | `published_evidence` and `internal_replication_evidence` kept apart | research synthesis |
| 9. Lineage | The pack's own hash, parent packs, and `supersededBy`; a pack is never edited, a correction is a new version | registry |

Block 5 is the answer to "why were the outcomes what they were": it is arithmetic on the stored results, so it can be checked, and
it never rests on a model's account alone. It describes where an effect lives; it does not prove causation.

### 23.2 Tamper evidence and replay

- **Append-only, chained.** Packs are written once to R2 and logged with the hash of the previous log entry, so a later edit is
  detectable. The registry stores the pack hash with the result row.
- **Replay check.** A "reproduce" job re-runs the frozen spec on the stored snapshot at the stored commit and compares with block 4
  within stated tolerances; the answer (reproduced / differs, with the differences) is stored on the pack. Banked results are
  re-run on a sample every month.
- **Claim check (deterministic).** A script scans a case conclusion or Head review: every number must appear in a linked pack block
  and every cited id must exist; anything else is listed as unsupported. No model is involved.

### 23.3 What exists, what is new, and when

| Item | Status |
|---|---|
| Prereg files, `results.json`, Evidence Book ids, trial ledger, forward ledgers (R2) | Exist and keep being used |
| Provenance fields (snapshot, feature version, commit, spec hash, seed, freeze date) in the result record | Designed in section 5 and 10; new storage |
| Evidence Pack layout, blocks 5 and 6, the chain log, replay job, claim check | New code |

Phasing: blocks 1 to 4 and 9 with the evaluator (P4); block 5 (the "why" diagnostics) with the evaluator (P4); Research QA fields in
block 4 (P5); the claim links and the claim check with the case workflow (P6); the monthly replay sample with the forward tracker
(P7). None of it is needed for P1 (scanner and triggers), which only needs the snapshot and run id.

What changes: new pack storage and a chain log. New code: yes (P4 to P7). Existing workflows: none until P6 (the Head's review
prompt would ask for evidence links). Existing research or lockbox rules: none.
