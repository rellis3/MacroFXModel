# Pre-registered forward evaluations (locked 2026-07-12)

Written BEFORE the post-fix records accrue, per the working agreement
("pre-register both outcomes before running a test, so a null can't be
re-narrated into a maybe"). Each evaluation states: the record that counts,
the pass bar, the fail bar, the chance baseline, and what we will do in each
case. Changing a bar after data has accrued voids the evaluation — restart
the clock instead.

**Global rules (apply to every evaluation below):**
- Only trades executed on post-fix code count (Batches 1–7 merged; each bot
  restarted). Anything earlier is contaminated (cost-free fills, degenerate
  FX levels, drifted rules) and is excluded.
- All numbers are after-cost. Demo-live fills use broker spreads; paper fills
  use the Batch-4 cost model.
- Sample floor: **no conclusion below 30 closed trades** in the cell being
  judged. Interim peeks are allowed for bug-hunting only, never for
  keep/kill decisions or config changes.
- A "winner" must beat its bar AND be sign-stable across at least two
  disjoint sub-periods of its record (first half vs second half).
- Nulls are the base rate and finding one cheaply is a win. Expected
  outcome for every folklore-signal system below is null.

---

## 1. ConfluenceBot — 17-instrument fleet

- **Record:** per-instrument paper/demo journal from first post-Batch-2
  session (FX records before the scale fix are void).
- **Pass bar (per instrument):** after-cost expectancy > 0 AND profit
  factor ≥ 1.15 over ≥ 30 closed trades, sign-stable across halves.
- **Chance baseline (state it every time results are read):** with 17
  instruments each judged at ~30 trades, expect **2–3 instruments to pass
  by chance alone** if the true edge is zero everywhere. Therefore:
  - 0–3 passers ⇒ consistent with null; do NOT scale the passers.
  - ≥5 passers, or ≥3 passers that are also IS-consistent with each other
    (same direction of edge, same trade profile) ⇒ evidence worth a second
    30-trade confirmation window on the passers only.
- **Fail:** fleet-wide expectancy ≤ 0 at n ≥ 300 pooled ⇒ the confluence
  entry stack is null at fleet level; freeze the bot rather than re-tune.
- **Forbidden move:** re-tuning weights/thresholds mid-window and keeping
  the record. Any config change restarts that instrument's clock.

## 2. Gold V1 vs GoldV2 (the A/B)

- **Record:** both bots, same account, same $0.30 paper spread (test-pinned
  identical), from first post-Batch-4 session.
- **V2 wins if:** over the SAME calendar window with ≥ 30 closed trades
  each: V2 net-R > V1 net-R AND V2's EXPIRED-rate < half of V1's.
- **V1 wins / tie:** anything else at the floor ⇒ V2's redesign did not pay;
  keep V1 frozen, stop V2, write the post-mortem.
- **Note:** neither winning implies edge — the winner earns continued paper
  time, not live capital. Both may be net-negative; that outcome ⇒ retire
  the gold confluence family (it matches the TDE reversion null).

## 3. Volatility bot — book vs ride (A/B)

- **Record:** both variants off the same frozen plan, post-Batch-4/5 code
  (EOD close, costs, slip logging, RiskGuard).
- **Primary metric:** after-cost expectancy per touch vs the learned book's
  claimed cells; **slip audit**: median realized entry slip per decision
  class.
- **Kill condition (either variant):** median follow-entry slip > 0.006%
  (the book's charged slip) sustained over ≥ 50 fills ⇒ the book's cost
  assumption is broken for follows; suspend follow cells until re-learned
  with realized costs.
- **Ride wins if:** ride net-R > book net-R at ≥ 30 closed trades each and
  the ride's OOS-claimed advantage direction holds. Otherwise book stays
  incumbent.

## 4. Range-line bot — confluence gate (pending owner decision)

- If run as A/B (recommended): gate-off (today's live) vs gate-on
  (`confluence_min: 2`, the OOS-best book) as separate identities.
- **Gate wins if:** gated net expectancy > ungated by ≥ the round-trip cost
  at n ≥ 30 each. Gate loses ⇒ the OOS confluence result didn't transfer;
  record it and keep the simpler book.
- Clock starts only when the owner picks (a) flip or (b) A/B.

## 5. QMR forward record (all four indices)

- **Record:** the live forward tracker (entry-alert snapshot → engine-walk
  resolution, after-cost), starting 2026-07-13.
- **Per instrument:** at n ≥ 30 resolved signals — cumulative levered
  return > 0 AND win rate within 15 points of the backtest's claim for the
  same period ⇒ the in-sample defaults survived contact; then (and only
  then) consider the walk-forward re-derivation of defaults.
- **Chance baseline:** 4 instruments ⇒ expect ~1 to look positive at n=30
  by luck if all are null. One positive index alone is not evidence.
- **Fail:** an instrument at n ≥ 30 with negative cumulative net ⇒ stop its
  entry alerts (gates may keep logging for the record); DAX/DOW/SPX were
  never validated, so failure is the expected outcome there.

## 5b. QMR direction-vs-geometry control arm (registered 2026-07-28)

Registered **before** the run — the arm exists in code (`_computeNqQmr`'s
`showControl`) but has never been executed against data at the time of
writing, and this bar is committed in the same push as the code.

- **The question:** S1's payoff is deliberately asymmetric (stop ≈ 0.45%,
  TP 1.5% ≈ 3.3R). On any day that trends far enough to touch a TP, the
  *average of both directions* is positive — so "S1 makes money" is not by
  itself evidence the gates predict direction. Does the direction call add
  anything over a coin flip on the same gate-selected days?
- **Test:** inverse-direction control on every S1 day, identical
  stop/TP/leverage/costs. `coinFlip = (S1 + inverse)/2`;
  `dirAlpha = S1 − coinFlip` per trade, paired t across the same days.
- **Direction has edge if:** `dirAlpha > 0` with paired t ≥ 2.0 at n ≥ 300.
- **Direction is null if:** the 95% CI on `dirAlpha` contains 0, or
  `dirAlpha` ≤ the per-trade cost floor. Then QMR is a **day-selector
  feeding an asymmetric payoff**, not a continuation forecast — the gates
  keep their job (choosing days), the direction claim is retired, and the
  successor to test is a both-sides / synthetic-straddle construction on
  the same selected days.
- **Either outcome is publishable and neither rescues the other.** A null
  here does NOT invalidate the walk-forward OOS result in
  `QMR_WALKFORWARD_RESULT.md` — that money was made either way. It changes
  only the *explanation*, and therefore what gets built next.
- **Already-known partial evidence (why this is worth running):** on the
  three subsets where the engine already computes both directions, the coin
  flip pays +0.21% to +0.25% per trade against a cost floor of −0.027%, and
  direction's own contribution measures −0.136% (extended), +0.011%
  (choppy), −0.006% (rejection). The clean-day majority is untested.

## 6. Regime V7 (post slope-fix record)

- **Record:** paper/demo from the slope-window fix onward (earlier live
  trades were a different strategy).
- **Judge:** per cfg_hash via `scripts/grade_v7_audit.py`; the config must
  reproduce the direction of its backtest claim (positive expectancy) at
  n ≥ 30 after costs. If it can't, the V7 stack is falsified live and gets
  frozen — no re-tuning on the live record.

---

*Any edit to a bar in this file after its record has begun must be recorded
as a new evaluation version with a fresh clock, and the old version's
outcome reported anyway.*
