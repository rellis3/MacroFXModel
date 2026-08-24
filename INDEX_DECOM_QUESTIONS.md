# Decommissioning `index.html` — the questions that need answering

**Date** 2026-08-24 · Companion to [PER_PAIR_VIEW_PROPOSAL.md](PER_PAIR_VIEW_PROPOSAL.md).
Goal: demote `index.html` to a background page, `today.html` to the front door, eventually retire
`index.html`. **This document is questions, not a plan.**

---

## 0. The finding that reframes the decom

**`index.html` is not a view. It is a live producer, and three trading bots depend on a browser
tab being open.**

`js/alerts.js` — loaded only by `index.html` — is a browser-side compute loop that, on every
price tick, writes to KV:

| KV key | Written by | Read by | Server-side producer? |
|---|---|---|---|
| `ai_goldmodel` | `js/alerts.js:916` (browser) | `Gold/main.py:416`, `GoldV2/main.py:310`, `ConfluenceBot/main.py:458`, `bot/modules/gold_macro_module.py` | ❌ **none** |
| `arima_price_{SYM}` | `js/alerts.js:293` (browser) | `bot/utils/state_reader.py:61` | ❌ **none** |
| `ai_decision_meta_{SYM}` | `js/alerts.js:371` (browser) | `server.js:637` | ❌ **none** |
| `ai_alert_cfg` | `js/alerts.js:135` (🔔 modal) | `server.js:607` (reloaded every 60 s), `cron-worker.js:196` | ❌ UI exists only here |
| caps config (`confluencePriceMode`, `clusterMerge`) | `js/caps.js` (⚙ modal) | `levels.js:570` — the **server** level engine | ❌ UI exists only here |
| `decision_audit_log` | `js/alerts.js:87` (browser) | `/api/decision-audit` | ❌ none |
| `ai_entries_{SYM}` | browser **and** `levels.js:647` (`source:'server'`, every 30 min) | `bot/modules/macro_regime.py`, `server.js:636` | ✅ yes — but two writers race |

`GoldV2/main.py:305` says it out loud:
`MACRO_MAX_AGE_SECS = 12 * 3600   # ai_goldmodel is refreshed by the dashboard page`

**So the real decom sequence is not a UI migration. It is: port `alerts.js`'s compute loop to the
server first — then the UI is free to move.** Everything below is downstream of that.

---

## Tier A — blocking. Answer before anything is demoted.

### A1. What replaces the browser as the producer of `ai_goldmodel`, `arima_price_*` and `ai_decision_meta_*`?

Three live bots read these. Options: (a) port the compute into `runLevelsRefresh()`'s existing
30-minute server loop; (b) a small dedicated server job; (c) declare the consumers stale-tolerant
and let the bots degrade gracefully.

Until this is answered, closing the tab silently degrades live trading — and *silently* is the
operative word: `GoldV2` has a 12-hour staleness window, so the failure would not surface for
half a day.

### A2. Is anything already broken because the tab isn't always open?

Cheap and decisive: read the `timestamp` on `ai_goldmodel` and a couple of `arima_price_*` keys
right now. If they are hours or days old, the bots are *already* running on stale macro and the
decom is a **fix, not a risk**. This should be checked first — it changes the priority of
everything else in this document.

### A3. Which writer of `ai_entries_{SYM}` wins, and is the browser's copy ever better?

`levels.js:647` writes `source:'server'` every 30 min. `alerts.js:384` writes a browser copy.
`alerts.js`'s own comment says the server "overwrites it". If the server copy is complete, the
browser writer is dead weight and can go today. If the browser adds fields the server lacks, that
gap is a porting task, not a deletion.

### A4. Where do the two config UIs live after decom?

- ⚙ **Caps** (`js/caps.js`) sets `confluencePriceMode` / `clusterMerge`, read by the **server**
  level engine.
- 🔔 **Alerts** sets `ai_alert_cfg`, reloaded by `server.js` every 60 s.

Both are live production config with exactly one UI, and that UI is on the page being retired.
`bot-config.html` is the obvious new home — but it is already flagged as a 546 KB monolith in
`august analysis.md`.

### A5. Does `today.html` need to become a producer too, or stay read-only?

Today it is read-only plus AI-analysis persistence. If A1 lands on "the server does it",
`today.html` stays clean. If any of it stays client-side, `today.html` inherits the same
always-open-tab fragility and the decom has achieved nothing but moving the problem.

---

## Tier B — front-door mechanics

### B1. What does `/` serve?

`server.js:25807` sets `index: 'index.html'` on the static handler. Flipping the front door is a
one-line change — but it should be deliberate and reversible, not a side effect of a later edit.

### B2. What happens to the 73 HTML files that link to `index.html`?

Rewrite them, redirect `index.html` → `today.html`, or leave them pointing at a background page?
`js/commandHub.js`, `js/siteApiMap.js` and `hub.html` are the three nav files `august analysis.md`
identifies as needing updating on any cull.

### B3. Does `index.html` stay reachable and functional as a background page, or frozen?

"Background page" needs a definition. If it keeps running `alerts.js`, it is still load-bearing
and A1 is still unanswered. If it is frozen as read-only reference, its write paths must be
disabled deliberately — a half-live page that *sometimes* writes stale KV is worse than either
extreme.

### B4. What is the retirement test?

Concretely: *"`index.html` has been closed for N days; no bot degraded, no KV key went stale, no
config was unreachable."* Without a stated bar the page never actually gets retired — it just
stops being maintained while still being depended on.

---

## Tier C — what earns migration (the "don't add bad things in" filter)

One question per block: **does this answer something `today.html` cannot already answer, and is it
honest?** Three fail.

### C1. The 7-tier macro score, Bayesian ±18, driver hierarchy

Macro-as-signal is a banked null ×5. It is real *framing* — "here is why the market sits here" —
and worth keeping in that role. **Question: is it migrated as labelled context, or dropped?**
There is no third option where it stays an unlabelled number.

### C2. "RECOMMENDED SIZE %"

Driven by that score. Conviction is measured *anti-predictive* in this repo
(`analysis/backtest_entry_quality.py`), and BUG_LIST #32 has the high-confidence multiplier
*shrinking* size. **Question: does size come from stop distance and a fixed fraction from day one,
or does the current formula get carried over "for now"?** The second answer is exactly how the bad
thing survives the migration.

### C3. The stars heuristic

Additive, hand-set, unvalidated — and `range-level-edge.html`, the placebo test that would settle
whether *any* level bounce is real, has never been run. **Question: run that test before or after
the migration?** If after, stars migrate with `today.html`'s existing warning banner attached and
no wording softened.

### C4. What is genuinely unique to `index.html` and must be preserved?

My read: the OI board detail · the vol-model comparison (EWMA/GARCH/GJR/LEFT) · regime transition
risk · the Macro Compass · the entry scanner's R:R and entry/SL/TP prices · live spread · retail
crowd. Everything else on that page either exists in `today.html` already or is a banked null.
**Worth you confirming — you use the page daily and I am reading it cold.**

### C5. Which modals become pages, and which just die?

V2 HMM shadow · OI analyser · COT · site map · API map · journal-save · analyse-all. Several have
standalone pages already (`oi-dashboard`, `cot-extremes`, `hub.html`). Question per modal:
*already exists elsewhere / becomes a tab / dies.*

---

## Tier D — sequencing

### D1. Does the tab work (proposal §3–§4) happen before or after the `alerts.js` port?

They are independent. The tab work is safe and reversible; the port touches live bot inputs.
Recommendation: **do the port first** — it is the actual risk — then the UI can move at leisure.

### D2. Is there an interim state where both pages are live and one is authoritative?

Almost certainly yes, and it needs naming — because during it, two pages compute overlapping
things, and "which one is right?" arrives at exactly the wrong moment.

### D3. What is the rollback?

If `today.html` becomes the front door and something is missing mid-session, what is the one-step
path back? Right now it is a one-line `server.js` change — worth keeping it that way until B4's
bar is met.

---

## The four to answer first, in order

1. **A2** — read the timestamps on `ai_goldmodel` and `arima_price_*`. One command. It tells you
   whether this whole thing is a fix or a risk.
2. **A1** — decide the server-side producer for the three browser-only keys.
3. **A3** — settle the `ai_entries` double-writer; it may *delete* work rather than create it.
4. **C4** — confirm what is genuinely unique to `index.html`; the whole migration scope hangs off it.
