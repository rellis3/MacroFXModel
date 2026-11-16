# Agenda: prop EV (is a prop challenge worth buying with our systems, and how much of that is edge?)

Set 2026-11-16 by learn-intake from C.OG's EV modeler video (`education/intake/cog/2026-11-16-ev-modeler-roi.md`).
Theme keywords for `evidence_map.mjs`: `prop ftmo funded challenge payout fee toolkit ev`. Builds on
`overnight-hold-toolkit` and `portfolio-book-prop` (both CONTEXT), whose replica is `scripts/overnight-hold-toolkit/toolkit.py`.
Their key finding sets the benchmark for every card here: **a zero-edge copy under the same rules already has positive EV
against a ~0.54% fee**, so each answer is read as the gap to that copy. Method lessons #28, #29.

## Cards, in rank order

### Q1. Does our replica agree with C.OG's toolkit on the same files? (owner-run) — score 12/15

> Upload `analysis/output/prop-toolkit-check/upload_*.csv` and the `_ZERO_EDGE` twins to his toolkit at FTMO 2-step,
> k = 1.00, preserve streaks block 5, 5,000+ paths. Compare funded rate, cleared step 1 and median days with
> `COMPARE.md`.

Noise: MC error ±0.7pp at 5,000 paths, so agreement = within ~2pp · benchmark: our replica · if yes → our
replica can stand in for his tool in every later card · if no → find the rule that differs (daily loss on intraday
equity vs close, phase reset, min days) before trusting either. The zero-edge files also show, in his own tool, how
much of a pass rate is luck.

### Q2. What do his funded-stage outputs say against the zero-edge copy? — score 10/15

> For each banked system at 1×: P(cover fee), P(any withdrawal), days from pass to first withdrawal, payout quantiles
> by week (P25/P50/P75), EV per challenge with and without the fee refund, each minus the zero-edge copy's.

Construct: the replica's funded stage extended with FTMO's payout rules (first payout eligibility, 80% split, refund on
first payout) · horizons: weeks 2, 4, 6, 8, 12, 26, 52 funded · noise: MC SE plus the edge-CI band (mean at the CI ends)
· mechanism: capped downside (the fee) + kept upside · if the gap is ~0 → the "EV" is the prop structure, not the system;
don't buy on it.

### Q3. Are several accounts on one system one bet? — score 9/15

> Buy N = 1, 3, 5 challenges on the same system at the same start date vs staggered by 1–3 months vs on different
> systems. Report P(all fees lost), P(at least one payout) and EV per fee, against N independent draws.

Mechanism: the same trades on the same days make the accounts pass and fail together · benchmark: independence (C.OG's
"four fail, one passes" arithmetic) · if correlated → size the number of accounts as one bet; stagger or mix systems.

### Q4. Does the live risk guard change the pass rate? — score 8/15

> Apply a live guard (stop after 2 losses a day, max trades a day, news blocks, daily soft stop at the P5 drawdown) to
> the trade stream inside the simulation, vs the raw stream. Same firm rules, same size.

Mechanism: the guard removes trades, mostly after losses, which changes the distribution the toolkit was fed · if the
pass rate moves by more than MC error → the toolkit must be fed the guarded stream, and the planner and the live gate
must read one rules file (see the Stephen EA review, 2026-11-15).
