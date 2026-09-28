# Adding a new tradeable pair to Fib Atlas — checklist

Written 2026-09-28, after adding the 6 indices exposed exactly this problem:
the pair identity lives in one canonical registry, but the actual list of
"which pairs does X part of the system know about" is duplicated by hand in
at least **four separate places**, plus two independent broker-verification
steps that must never be guessed. Every item below is either a place this
session found a real bug from a step being skipped, or a place directly
upstream/downstream of one.

Order matters — earlier phases must be genuinely verified, not just
"added," before the next phase depends on them.

## Phase 1 — Identity & data (do this first, nothing else works without it)

1. **`pylego/instruments.json`** — add the canonical entry: pip size,
   price digits, `assetClass` (`fx` / `index` / `commodity` — this one
   field is what `assetClassFor()` reads first, before falling back to
   regex pattern-matching the pair name, so get it right here rather than
   relying on the fallback), OANDA symbol, Yahoo symbol, a default MT5
   symbol, display name. Everything downstream reads this.
2. **`pylego/point_values.json`** — add a real $-per-pip-per-lot value.
   Skip this and it silently falls back to `default` (10.0), which will
   be wrong for anything that isn't a $10/pip FX pair — indices/gold are
   nowhere near that.
3. **`REFERENCE_ENGINE_PAIRS`** (server.js) — add here so the pair is
   picked up by every shared nightly M1-pull/regen job (Level Atlas,
   Session Path, Session Handoff, Fib Atlas all draw from this one list).
   `fibAtlasPairsBase`'s own filter (fixed 2026-09-28) currently excludes
   only `BTCUSD`/`NZDCAD` — a pair added here should get swept in
   automatically, but double-check that filter hasn't grown a new
   exclusion since (that's exactly the bug that left the 6 indices'
   books stale for a month: filter written when they didn't exist yet,
   never revisited when they were added elsewhere).
4. **First cold-start pull** — a genuinely new pair has no existing R2
   live-snapshot and no M1 parquet archive, so the first `getFastLive()`
   call (or the next nightly job) does a full multi-year OANDA pull from
   scratch. Expect it to be slow once. Verify it actually finished —
   check the live-snapshot R2 key and the first `votetrades.json`'s
   `generatedAt` — don't just assume coverage exists because you added
   the pair to a list.

## Phase 2 — Generate and validate the book (before touching live config)

5. Trigger (`POST /api/fib-atlas-bot/refresh-now`) or wait for the 00:30
   London nightly job to produce a first `votetrades.json` for **both**
   ladders (asia + monday).
6. Sanity-check the resulting book on the interactive portfolio page
   (`asia-fib-atlas-vote-portfolio.html`) — does it look like a real
   instrument (sane Sharpe/drawdown/trade count), not noise? Same bar
   the original 6 indices were held to before shipping ("12/12 positive"
   pilot result) — don't skip straight to live config on an unvetted book.
7. If you want the new pair included in the leave-one-out/OOS
   pair-selection research or any of the two dozen `analysis/fib_atlas_*`
   scripts, also add it to **`RANGE_FIB_INSTRUMENTS`**
   (`js/rangeFibEngine.js`) — this is a SEPARATE list, FX+gold only right
   now, doesn't include the 6 indices either. Not required for live
   trading, only for that research tooling.

## Phase 3 — Broker execution (verify against the real account, never guess)

8. Run the standalone scanner on the trading PC:
   `python -m pylego.broker.scan_symbols --bot <bot> --pairs <pair> --try <pair>=<your best guess>`
   to find the REAL MT5 symbol name on the account(s) that will trade it.
   Never copy a symbol name from a different broker/account (that's
   exactly how the 6 indices got hardcoded-wrong guesses the first time).
9. Set the confirmed name in that bot's own `broker_symbols` KV override
   (bot-config.html's Broker Symbols card).
10. Same scan checks the real $/pip/lot against `point_values.json`'s
    assumption — set a `point_values` override if it's off. Don't assume
    a new instrument is exempt: gold was 10x off on this exact account.
11. Restart and confirm both `BROKER SYMBOL MISMATCH` and
    `POINT VALUE MISMATCH` are silent in the startup log before trusting
    it live — these checks exist specifically so this is a log line, not
    a live order failure or a silently-wrong position size.

## Phase 4 — UI/config wiring (so the whole system agrees the pair exists)

12. **`FA_PAIRS`** (`js/bot-config.js`) — the pair-checkbox list both
    Fib Atlas tabs (fa/fa2) render from.
13. **`FA_RECOMMENDED_EXCLUDE`** (`js/bot-config.js`) — decide up front:
    should this pair be checked by default under "Select recommended"/
    "Load best config," or excluded pending more validation? This is the
    exact lever the correlated-pair drawdown investigation was about —
    don't let a new, thin instrument ride straight into the trusted
    preset on day one.
14. **`PAIRS` / `INDEX_PAIRS`** (`asia-fib-atlas-vote-portfolio.html`) —
    the interactive backtest page's OWN separate pair-checkbox list.
    Does not share `FA_PAIRS` — needs its own edit.
15. **`enabled_pairs`** in `fib_atlas_bot_config` / `_v2_config` — the
    ACTUAL live-trading gate. Only flip this on (with `paper_mode:false`)
    once Phases 1–3 are genuinely verified, not just "added."

## Phase 5 — Reconciliation (should just work — confirm, don't assume)

16. `js/fibAtlasDriftAudit.js`'s `countFibAtlasCandidates`/
    `auditFibAtlasDrift` read `enabled_pairs` live from KV — no hardcoded
    pair list to update here. Still: confirm the REC tab shows real
    numbers (not blank/`—`) for the new pair within a day or two of going
    live, the same way DOW's month-long staleness got caught.

## What happens if a step gets skipped (this session's own case studies)

- **Skip step 3** (nightly regen list): the book goes stale forever with
  zero warning — the live bot trades off month-old data. This happened
  for real: DOW's book was 27 days stale before anyone noticed, because
  the filter excluding it was written before it existed and never
  revisited.
- **Skip step 8/10** (broker symbol / point-value verification): live
  orders either fail outright or size wrong (found: gold sized 10x too
  small, silently, until `verify_point_values` was built).
- **Skip step 13** (recommended-exclude decision): an unvalidated pair
  gets swept into "Load best config" and inflates the headline Sharpe
  with zero scrutiny behind it.
