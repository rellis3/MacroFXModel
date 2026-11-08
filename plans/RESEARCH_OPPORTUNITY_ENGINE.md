# Research Opportunity Engine (ROE): design

*2026-11-08. Owner-approved design (decisions 1-4: yes). This replaces the "Data Agent" in `plans/DATA_AGENT.md` wherever the
two differ (section 12 lists the changes). **Status: documentation and flow-chart data only.** No server route, no KV key,
no agent is implemented. Everything below that is not built is drawn dashed and marked `planned` on the Agents tab
(`js/agentRegistry.js`, flows "Research case" and "Research discovery").*

**Rules that bind everything below** (data-rules, research-protocol, research-director): session = London date; no lookahead
(every statistic for day t uses data strictly before t); the lockbox (sessions after 2026-08-21 are H-A; nothing scores
layers 3, 5, 6 on them; the one evaluation is `python -m forge.lockbox_check --evaluate`, expected late November 2026);
every question is a trial; exploratory answers are labelled and never banked as validated; Evidence Book entries are written
only through research-protocol.

---

## 1. What the ROE is, in one paragraph

After each daily run, a deterministic scan of everything the owner holds finds unusual readings and divergences. Each one
becomes a written question (rules first). Each question is tested on a **discovery window only**, and the result goes to
a **ranked board** with an evidence pack. The owner (or the Head of Research, by recommending it) presses **Open case**;
only then does the existing research flow run (librarian, three researchers, Head review). Every question and result is
kept in a **registry** that is used for two things only: dropping identical specs and counting trials for the multiple-
testing correction. A **forward tracker** scores each suggestion on new data from the suggestion date; that, not the
discovery result, is the real test.

## 2. Three kinds of box (do not turn boxes into agents unnecessarily)

| Kind | What it is | Examples | Model call |
|---|---|---|---|
| **Specialist agent** | An LLM role with a prompt in `desk/roles/` | the three researchers, Head of Research, System architect, Validation desk, Red team, librarian | yes |
| **Processing service** | Plain code with fixed inputs and outputs. Registry field `kind: 'service'` | scanner, question writer (rules), historical evaluator, forward tracker, **Research QA**, **acceptance check**, quick test, paper intake | no |
| **Decision authority** | A person or a rule that sets a status. Never a model acting on its own work | owner, Head of Research (sets *Research approved* after adjudication), acceptance check (sets *Validation approved*) | n/a |

Stores (the registry, the questions queue, the Evidence Book) are not agents at all; they are drawn as boxes of kind `store`.
A model never marks its own work validated.

## 3. Architecture and data flow

```
 LAPTOP (Python, owner's machine)                       SERVER (authenticated endpoint; KV key to be proposed, not created)
 --------------------------------                       --------------------------------------------------------------
 IBKR files, skew, cross-currency basis,
 feature store, M1 cache  +  GET /api/state
            |
   1 Opportunity scanner   (percentiles, z-scores, extremes, divergences,
            |               lead-lag screens, regime shifts, breakdowns;
            |               logs how many items it scanned)
   2 Question writer       (templates; why it arose, observation, hypothesis,
            |               data needed, pre-registered test)
            +--- push: snapshot + questions + scan count --->  3 Questions queue
                                                                  |
                                          4 Historical evaluator (discovery window only; horizons fixed in advance,
                                          |   baseline e.g. momentum, out-of-sample, regime splits, costs, CI, power)
                                          |      <--->  5 Opportunity registry (trial count + same-spec check only)
                                          v
                                       6 Ranked board  (ranked list + evidence pack + neutral history line)
                                          |
                          owner presses Open case   (NO automatic opening)
                                          v
                        Research case: library librarian -> three researchers -> [Research QA] -> Head of Research
                                          |
                      Research approved -> (owner presses Architect) System architect -> Design approved
                                          -> Validation desk + acceptance check -> Validation approved
 7 Forward tracker: from the suggestion date, new data only, against the frozen spec -> registry
```

Why the scan runs on the laptop: the inputs that matter most (IBKR files, FX skew, cross-currency basis, the feature store,
the M1 cache) are laptop-only or stale on the server (DATA_AGENT.md section 1.12); the server's own view comes from
`GET /api/state` (read it, do not re-fetch). The laptop pushes to an authenticated endpoint (same login rule as the
research-pod POSTs). The scan is Python so it can share `forge/` code with the evaluator and the lockbox tooling.

Where the evaluator runs is an open question (section 15, Q2). The question-writer stage is pure rules, so it runs next to
the scanner.

## 4. Components, responsibilities, deterministic vs LLM

| # | Component | Responsibility | Deterministic? | Model call | Built? |
|---|---|---|---|---|---|
| 1 | **Opportunity scanner** (laptop, Python) | Daily statistics after the daily run: percentile (252/756/all, causal), robust z, d1/d5/d20, extremes, divergences, lead-lag screens, regime shifts, breakdowns. Records `scanBreadth` (items scanned) and the code `watchVersion`. | yes | none | planned |
| 2 | **Question writer** | Fills a template per flag family (the 22 in DATA_AGENT.md section 3). Each question states: why it arose, the observation, the hypothesis, the data needed, the pre-registered test. Never shown earlier results. | yes (rules) | none now; an optional capped DeepSeek wording tidy later (may reword, never change spec, items, horizons or numbers) | planned |
| 3 | **Questions queue** | Holds every written question. No daily cap. | store | none | planned |
| 4 | **Historical evaluator** | The quick-test and backtest machinery (`js/quickTest.js`, `forge`, harness `runStudy`) on the discovery window: pre-specified horizons, baseline, out-of-sample, regime splits, costs, uncertainty, power. Holm within a question, BH across a month. | yes | none | planned (machinery exists in part: section 11) |
| 5 | **Opportunity registry** | Records everything (section 5). Used only for same-spec de-duplication and trial counting. | store | none | planned |
| 6 | **Ranked board** | Ranked list with evidence pack and neutral history (section 8). The only place the owner opens a case from. | output | none | planned |
| 7 | **Forward tracker** | Records outcomes on new data after the suggestion date against the frozen spec (`js/directionLedger.js` pattern: write once, resolve later, never back-issue). | yes | none | planned |
| 8 | **Research QA** | Power gate before the Head accepts a null (section 10). | yes | none | planned |
| 9 | **Acceptance check** | Checks acceptance criteria from the system card; the only thing that sets *Validation approved*. | yes | none | planned |

LLM steps stay where they are today: librarian pick, the three researchers, the Head review, the System architect, the
Validation desk. The ROE adds no model call in its first phases.

## 5. Research Opportunity Registry

**Purpose, and the owner rule that limits it.** The registry exists to (a) drop an *identical* spec that was already run on
the *same* data window, and (b) supply the trial count for the multiple-testing correction. It must **never**:
label a question "rejected", "dead" or "failed"; suppress, demote or hide a question; or feed prior results to the question
writer (or any model) as context. Reason: failed ideas must not bias new analysis. The board shows only neutral history
("tested 2026-11-08 on 2019-2026-08-21: no incremental power over momentum"). The same question on new data, or with a new
mechanism, is a **fresh test** (a new spec hash, a new trial).

Schema (one row per evaluation; sketched, not created). Storage: a server KV key to be proposed (registered in the three
places `js/agentRegistry.test.mjs` enforces: `kv.js`, both `_worker.js` lists, `js/storeRegistry.js`), with R2 archive
under `forward/roe/` for growth.

```
{ id, createdAt,
  question: { text, why, observation, hypothesis, dataNeeded, item, family, watchVersion },
  spec:     { variable, condition, horizons[], baseline, target, minN, outcome, splitRule },
  specHash,                       // hash of the canonical spec + data window; same hash = identical spec
  dataWindow: { from, to, cutoff },          // discovery window; cutoff never later than 2026-08-21 for replays
  scan:     { date, scanBreadth, triggersFired },   // how many items were scanned that day
  result:   { n, effect, ci, power, mde, baselineDelta, regimeSplits, costsApplied, pRaw, pHolm, qBH },
  trial:    { monthKey, trialIndex, correctionFamily },   // the trial count used for BH
  forward:  { suggestedAt, events: [ { date, outcome } ] },
  caseId?, boardState: 'listed' | 'case-opened' }           // neutral states only: no 'rejected', 'dead', 'dismissed-as-bad'
```

Rules: `specHash` collisions are the only automatic action (the evaluator skips a rerun and points to the earlier row).
Rows are append-only. A human may add a note; nothing ranks by the history of a previous failure.

## 6. Anti-snooping controls

Carried over from DATA_AGENT.md section 4.3, with the changes the owner decided:

1. **No cap, full count.** No daily cap on questions. Log how many items were scanned (`scanBreadth` x triggers) and apply the
   correction for the full count. Show a ranked list instead of limiting.
2. **Every question is a trial.** Trial counts live in the registry; the monthly roll-up also writes one register row
   (`research-protocol`, status `EXPLORATORY`) so `scripts/build_trial_ledger.mjs` counts the looks.
3. **Correction.** Holm across the horizon family inside a question; BH q = 0.10 across all questions in the calendar month. The
   evidence pack shows the adjusted numbers beside the raw ones.
4. **Discovery vs confirmation windows are separate.** The evaluator sees the discovery window only. The confirmation window and the
   lockbox are not touched. Replays stop at the cut-off date in DATA_AGENT.md section 4.3 (2026-08-21); the data-loading code path
   takes an explicit `to` and cannot see later sessions.
5. **Forward tracking is the real test.** From the suggestion date on new data, recorded against the frozen spec. Forward scores are not
   displayed or used in any decision until the one lockbox evaluation has run (DATA_AGENT.md open question 3 stands).
6. **Frozen watch list and triggers** in one versioned file; a change bumps `watchVersion` and starts a new forward record.
7. **Monthly full sweep** of every item at its generic trigger, so a question's effect is ranked against all items (the best of
   N noise variants is the bar).
8. **Built-in controls:** mirror (opposite extreme), a placebo series, one-session delay, shifted dates, concentration by year.
9. **No model chooses which extreme to study.** Stage 1 has no model call at all; the writer is a lookup into frozen templates.
10. **Registry isolation** (section 5): no prior results reach the writer; no label can demote a question.
11. **Direction questions rank by the Evidence Book base rate** (macro direction 0 of 82 validated), shown as a neutral tag
    "base rate: low", never as a demotion.

## 7. Integration with the Head of Research

The Head is an **adjudicator, not a researcher**. Its job in the case flow: identify disagreements between the three
researchers and unsupported conclusions; separate facts from assumptions; decide per claim *supported*, *rejected* or
*inconclusive*; recommend a next step with evidence ids. Next-step vocabulary is unchanged (quick-test | architect |
preregister | park | drop) and is a recommendation, not an approval.

What the Head receives in the planned flow: the three answers, the library papers, the whole Evidence Book, and (new) the **Research QA
verdict** for every null or "no relationship" claim. The Head may not accept a null that QA marked underpowered, misaligned,
without a control or not replicated; it must carry it as *inconclusive* with the QA reason.

**Role tweak list (documented only; `desk/roles/head_of_research.md` is NOT changed this round).** Current role already has:
fact-checking of the researchers' numbers, a side taken on disagreements, peer review (errors, overclaiming, contradictions with
the Evidence Book), one next step, "proposals and reviews, not results".

| # | Tweak | Status in the current role |
|---|---|---|
| H1 | Say "adjudicator, not researcher": do not add new hypotheses or new analysis; write the combined plan only from the researchers' material | partly: it writes ONE combined plan "from the best of the three"; no explicit ban on new ideas |
| H2 | Output a table of **disagreements** and a list of **unsupported conclusions** as separate fields | partly: disagreements covered in prose |
| H3 | Separate **facts** (cited, checked) from **assumptions** in each section | gap |
| H4 | A per-claim decision: supported / rejected / inconclusive, each with evidence ids | gap (today: a side per disagreement, one step per plan) |
| H5 | Read the **Research QA verdict**; never accept a null QA flagged; carry it as inconclusive | gap (QA does not exist) |
| H6 | Set **Research approved** only when the evidence supports proceeding; state that it is not a build instruction | gap (status does not exist) |
| H7 | Recommend with **evidence ids** on every recommendation, not only in the register paragraph | partly |
| H8 | When the case came from the ROE board, treat the ROE evidence pack as input data, not as a conclusion; do not read the registry history as a verdict | gap |

Because the Head is a model, *Research approved* needs a human or rule to take effect (section 15, Q3).

## 8. Board mock (text)

```
RESEARCH OPPORTUNITIES   scanned 2026-11-07: 412 items, 31 flags   |  this month: 640 questions (trial count for BH)   [PLANNED: mock, no data]

 #  Question (why it arose)                         Discovery result (2019 - 2026-08-21)                Adj.   Power  Forward since   History (neutral)                       Action
 1  VIX9D/VIX at 97th pct (term inversion):         NQ 5-day range vs IV line: +0.21 sd                 q=.04  0.82   0 events        not tested before                       [Open case]
    next 1/5/10 sessions of NQ range vs VXN        CI 0.08 to 0.34; momentum baseline: +0.03; n=212
 2  CCC OAS +68bp in 20d, IG calm:                  SPX range 20d: +0.05 sd, CI -0.09 to 0.19           q=.31  0.41   0 events        tested 2026-10-02 on 2019-2026-06:      [Open case]
    equity range and credit, 5/20/60d                                                                                                no incremental power (new data added)
 3  EUR spec share 0th pct, commercials 100th:      EURUSD 4-week return: not enough events (n=9)       -      0.12   not started     not tested before                       [Open case]
    forward move over 1/4/13/26 weeks               (marked: underpowered; this is not a negative finding)
```

Rules for the board: the list is ranked by a stated key (adjusted effect over its interval, then power), never by "has failed before". A
row with low power says "underpowered", not "no effect". The history column is a neutral sentence generated from the registry
(date, window, outcome in words); there is no "rejected", "dead" or "failed" label, and no row is hidden. Same question with new data
or a new mechanism shows as a fresh row. Only the button opens a case.

## 9. Approval statuses (three, distinct, in the Research case flow)

| Status | Meaning | Set by | Never implies |
|---|---|---|---|
| **Research approved** | The evidence supports proceeding | Head of Research, after adjudication (and after Research QA has cleared any null it leans on) | a build instruction |
| **Design approved** | Architecture and implementation are specified | After the System architect's system card is accepted (owner accepts the card) | that it works |
| **Validation approved** | Tests and acceptance criteria passed | Validation desk review **plus** the deterministic acceptance check (the check is what sets it) | that it is live or sized |

Rules: the three are separate fields on the case; no status implies another; a model never marks its own work validated; an LLM
may *recommend* a status, but the status is set by the named authority. Drawn in the flows as output points (all `planned`).
Current state in the repo: the Head's plan names a next step (`plan` box); there are no approval statuses yet.

## 10. Research QA gate (planned, deterministic, no model call)

Runs **before** the Head accepts any null result or "no relationship" conclusion (researcher claim, quick-test result or
ROE evaluation). Checks:

1. **Dataset**: the named series exist, cover the stated period, are the right unit and the right version (first release vs revised).
2. **Timestamp alignment**: X known before Y's window opens; session = London date; no lookahead; known-at times respected.
3. **Sample size**: effective n after overlap and clustering (the quick test already refuses < 750 overlapping days).
4. **Power / minimum detectable effect**: could the test have found the effect the hypothesis needs? (`mdeMeanDiff` in `js/preregStats.js`.)
   If the MDE exceeds the effect the mechanism plausibly gives, the verdict is *underpowered*.
5. **Controls and baseline**: a baseline (e.g. momentum), a placebo and a mirror were run.
6. **Appropriate test**: horizon family, overlap handled (block bootstrap), multiple-testing correction applied.
7. **Out-of-sample replication**: a held-out half or a later period was evaluated, same sign.

Output per null claim: `pass` | `underpowered` | `misaligned` | `no-control` | `wrong-test` | `not-replicated` (several may apply),
with the numbers. Consequence: only `pass` lets the Head record "no relationship"; otherwise the claim is *inconclusive* and the
board/case shows the reason in plain words. Where it sits: researchers and the quick test -> Research QA -> Head of Research
(drawn dashed in the "Research case" flow).

## 11. Improvement backlog: what exists in the repo and what is a gap

Verified against the repo on 2026-11-08. "Exists" means found in code or role files; "partial" says what is missing.

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
| 13 | Experiment registry | **Exists in part** | The research register + trial ledger cover studies; the ROE registry (section 5) is the planned registry for *questions and specs* | P1 (ROE P1) |
| 14 | Model / agent evaluation framework | **Partial** | `js/analystScorecard.js` scores analysts; the control (one prompt) agent is the benchmark. Missing: evaluation of the research pod's agents (did the Head's recommendation survive?) | P3 |
| 15 | Agent Operating Framework (input/output contracts, task lifecycle, quality gates, cost tracking, human approval points) | **Gap** (pieces exist) | Pieces: role frontmatter (`layer`, `tier`, `reads`, `output`), `js/deskSchemas.js`, model cost caps, the Agents tab. Missing: one document and one machine-readable contract per agent; quality gates and approval points as data | P2 |
| 16 | Three approval statuses | **Gap** | Section 9 | P0 (flow data done) |
| 17 | Research QA power gate | **Gap** | Section 10 | P1 |

Priority key: P0 documented now; P1 build with the ROE core; P2 next; P3 when convenient.

## 12. What changed from `plans/DATA_AGENT.md`

| Topic | DATA_AGENT.md | ROE (this document) |
|---|---|---|
| Name and place | "Data Agent", a standalone agent | **Research Opportunity Engine**: scanner + writer + evaluator + registry + forward tracker; group "Data" on the Agents tab |
| Where the scan runs | Server job at about 22:30 London, reads `/api/state` and R2 | **Owner's laptop, Python**; reads local data (IBKR files, skew, cross-currency basis, feature store, M1 cache) and `GET /api/state`; pushes to an authenticated server endpoint |
| Daily cap | At most 5 new questions a day | **No cap.** Log the number scanned; correct for the full count; show a ranked list |
| Banked nulls | A question re-asking a banked null is queued as "context only" unless a new mechanism is stated | **Removed.** The registry never labels, hides or demotes; history is a neutral line; the same question on new data or with a new mechanism is a fresh test. Only an identical spec on the same window is de-duplicated |
| Evidence Book screen | "already answered: <ids>" attached to the question | The Evidence Book still informs researchers and the Head in a case; the ROE board shows neutral history only and the **question writer never sees prior results** |
| Hand-off | Owner sends to a case or a quick test; `POST /api/data-agent/send` | **Button: Open case** on the ranked board, never automatic. The Head of Research may recommend it; a person or an explicit rule presses it |
| Replay / forward | Replay then forward record | Same, renamed: discovery-window evaluation, then forward tracking; confirmation window separated |
| Approvals | none | Research approved / Design approved / Validation approved, three distinct statuses |
| Null results | none | **Research QA** power gate before the Head accepts a null |
| Storage names | `data_agent_*` | Names to be proposed in the build phase (`roe_*`); none created now |
| Lockbox rules, Holm / BH, watch list, templates, inventory | as written | **Stand unchanged** (DATA_AGENT.md remains the inventory, watch list and templates) |

## 13. Phases (P0 reuses DATA_AGENT.md section 4.10, adjusted)

| Phase | What | Size | Notes |
|---|---|---|---|
| **P0** | **This round**: this plan, DATA_AGENT.md banner, registry data and flow charts (dashed, `planned`), tests | S (done) | docs and flow data only |
| P1 | Watch list and trigger file frozen; causal state module in Python (`forge/roe/`), tests on synthetic series (a planted extreme must fire; noise must fire at the nominal rate); `scanBreadth` logging | S-M: 3-4 days | laptop only, no server change |
| P2 | Laptop snapshot job for the first 25 items; push client; **server endpoint + KV keys** (registered in the three places, plus a `js/serviceFlags.js` row if a server job is added); questions queue | M: 4-5 days | first server change; needs the owner's go-ahead on key names |
| P3 | Question writer: 22 templates as rules; evidence pack format; ranked board page | M: 4-5 days | the writer reads no results |
| P4 | Historical evaluator: extend the quick-test catalogue and loader (`cboe:*`, MOVE, spreads, ratios), range runner on committed NY-close parquets, discovery-window cut, Holm and BH; **Registry** (same-spec drop, trial count) | L: 8-10 days | the heavy part |
| P5 | **Research QA gate** (deterministic) wired before Head review; Head role tweaks H1-H8 (owner approval of the role text first) | M: 3-4 days | |
| P6 | **Open case** button and hand-off route; the three approval statuses on the case (fields + UI); acceptance check | M: 4-5 days | statuses are fields set by named authorities |
| P7 | Forward tracker and scoreboard; forward display only after the lockbox evaluation | M: 3-4 days | |
| P8 (optional) | Capped DeepSeek wording tidy; remaining watch items to 72; weekly COT run | S-M | owner call; cap key in three places |
| Backlog | Section 11 items by priority, independent of the ROE | S each | |

Total for P1-P7 about 6-7 weeks of one session's work. Stage-1 value (a daily ranked list) arrives after P4.

## 14. Reuse

`js/quickTest.js` (walk-forward quintile, block bootstrap, Holm, 750-day floor), `js/preregStats.js` (`holm`, `benjaminiHochberg`,
`mdeMeanDiff`), `js/harness/stats.mjs`, `js/directionLedger.js` (write-once forward pattern), `js/deskEvidence.js`,
`scripts/build_trial_ledger.mjs`, `forge/lockbox_check`, `GET /api/state` (`js/stateEngine.js`, `js/stateLayers.js`).

## 15. Open questions (5, each with a default)

1. **Endpoint name and storage keys.** *Default:* `POST /api/roe/push` (login-gated, same rule as research-pod POSTs), KV keys `roe_queue_v1` and `roe_registry_v1`, archive under R2 `forward/roe/`; nothing is created until P2 is approved.
2. **Where does the evaluator run?** *Default:* on the laptop in Python for backtests that need M1 or IBKR data, and on the server through the existing quick test for daily-close questions; results land in the same registry row.
3. **Who sets Research approved and Design approved?** The Head is a model. *Default:* the Head recommends; the owner presses the button that sets the status (Validation approved is set by the acceptance check alone).
4. **How does the Head of Research "press" Open case?** *Default:* the Head can only recommend ("open this one") in its review; the owner presses the button. No model opens a case, because a case spends model money.
5. **How is the board ranked?** *Default:* adjusted effect over its interval (Holm within a question, BH across the month), then power; direction questions carry a neutral "base rate: low" tag and rank by the same key.
