# Six-week review — due on or after 1 November 2026

*Written 2026-09-20. Everything below was built in the week of 15–20 September
and then deliberately left alone so its records could fill. On or after
**1 November 2026**, paste the block at the bottom into a Claude Code session in
this repo. It reviews the records and decides what earns building next.*

## Why six weeks

Four records started filling themselves this week. None of them meant anything
on day one; all of them mean something at thirty sessions:

| record | what it scores | where |
|---|---|---|
| the page's leans | the direction tag on every card, at the next close | `/api/ledger` (pair ledger, since 2026-09-13) |
| your calls | ▲/▼ higher-or-lower than consensus, before each high-impact print | `/api/release-calls` (snapshot `calls`) |
| the scorecards | each print's 30-minute reaction vs the ordinary half-hour and the Event Response Book | `/api/release-calls` (snapshot `scorecards`) |
| the expected range | the 07:00 range call (1.0 ATR + firing tested effects) vs the realised session | `/api/range-calls` (snapshot `ranges`) |

Plus two things to watch rather than score: whether the chain's **funding**
node breaks at every month-end (its 5bp floor may need to be month-end-aware),
and whether the surprise store's non-US fills keep landing (`/api/econ-surprise`
→ `health.latestPrintAt`).

## What was parked, and what would unpark it

- **Revisions as events** — build if the scorecards show revisions changing a
  print's read more than once or twice a month.
- **The weekly review on a button** — build if you find yourself reading the
  daily snapshots by hand on Sundays.
- **The lean-cell cut** (by pair, regime, time of day, print-due) — build only
  if the ledger's overall hit rate is still a coin flip *and* any single cell
  looks above 55% with n ≥ 40; otherwise the page should say "no cell above
  chance" and stop wording leans as if they might.
- **Surprise index vs the next three weeks of FX** — a cheap pre-registration
  once there are 60+ live non-US prints in the store.
- **Per-currency regime for AUD/JPY/CHF/NZD** — only if a validated series
  turns up (RBA/ABS/BoJ/e-Stat); the OECD mirrors stay out.
- **Breadth** and **cross-currency basis** — no free feed; revisit only if one
  appears.

## The paste

Copy from the line below to the end of the file into a new session.

---

Read `MD files/SIX_WEEK_REVIEW.md` first — it says why this review exists and what was parked. Then do the review, in this order, and do not build anything until step 6.

1. **Pull the four records** from production (`https://macrofxmodel-production.up.railway.app`): `/api/ledger` (summary and `byDay`), `/api/release-calls?days=60` (calls, summary, scorecards), `/api/range-calls?days=60` (summary, by instrument), `/api/daily-snapshot?days=60`. Report n for each. If any record has fewer than 20 entries, say so and say why (feed down? nobody pressed the button?) before drawing anything from it.
2. **The leans.** Overall hit rate at the next close with its interval. Then cut it by pair, by the day's regime label (from the snapshot rows), by whether a high-impact print was due, and by session. Any cell above 55% with n ≥ 40? If none, write the sentence the page should carry ("direction: no cell above chance") and change the lean wording on today.html to say so. If one exists, pre-register it as a claim in a new MD file before anything else.
3. **The calls.** Your hit rate vs consensus (50%) and vs the Fed models on the same prints. By family (CPI, jobs, GDP, rate decisions). Say plainly whether you beat the bar.
4. **The scorecards.** For each family × pair with ≥ 5 cards: the median realised multiple of an ordinary half-hour vs the Event Response Book's figure. Is the book's size still right? Any family the book calls a mover that did nothing three times running? Recompute `js/eventImpactMap.js` only if the book is off by more than 40% on a cell with n ≥ 8.
5. **The expected range.** Days the digest flagged above 1.05× vs days it called ordinary: mean realised ATR for each. Did flagged days run wider? If the flagged mean is not above the ordinary mean with a clear interval, the range facts are not adding up the way they were combined — say so and pre-register a better combination before touching it.
6. **Only now decide what to build**, from the parked list in the file, using what the records said. One thing at a time. Pre-register it, run it, verdict in the MD, ledger entry, then the page.
7. Also check: `railway deployment list` shows SUCCESS at the top; `/api/econ-surprise` `health.latestPrintAt` is inside nine days; the chain's funding node has not been "broken" on every month-end (if it has, make its floor month-end-aware).

Write the findings into `MD files/SIX_WEEK_REVIEW.md` under a "Findings" heading with the date, and update the memory file `project_six_week_review.md` with the date it was done and what was decided.
