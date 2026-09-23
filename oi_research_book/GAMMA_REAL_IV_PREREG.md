# Pre-registration — Gamma flip / net GEX rebuilt with REAL implied vol

Written 2026-09-23, before `16_real_iv_gamma.py` exists. Frozen.

## Why

Every gamma number in RESEARCH_BOOK.md (Parts 5, 6, 9, 9b) used 20-day trailing
realized vol for every strike, and Part 0/10 explicitly leave open that "a real IV
could reveal a genuine gamma effect the proxy hides". Real per-strike IV now exists
(`14_iv_surface.py`, validated in IV_FORECAST_PREREG.md: VXN corr 0.977).

## Construction

- Contract-level forward-filled OI from `data/cache/contract_level_ffilled*.parquet`
  (script 01's own output), near surface (DTE ≤ 45) — the book's primary surface.
- Everything in CME-NATIVE terms: strike, forward F (from put-call parity, per
  expiry) and IV. Per-contract IV = that strike's OTM inverted IV; strikes outside
  the inverted band take the nearest inverted strike's IV on the same expiry.
- Black-76 gamma at F with the real T; GEX sign convention unchanged from the book
  (calls +, puts −, in native terms — identical to 01's convention).
- Gamma flip: the book's own method (cumulative net GEX by strike, zero crossing
  nearest the underlying), underlying = front-expiry F.
- Regime = F above flip (positive gamma) vs below (negative gamma).
  `gex_norm` = net GEX / Σ(OI·gamma·F) ∈ [−1, 1].

## Tests

- **G0 (descriptive)** How different is the real-IV flip from the book's RV-proxy
  flip? Median |difference| as % of spot; share of days the regime disagrees
  (EUR_USD, where the book's regime is directly comparable).
- **G1** Replicates Part 5 with real IV: next-bar log(high−low) below-flip minus
  above-flip, Newey-West t (lag 5). Textbook sign: below > above.
  Pass = textbook sign on ≥ 5 of 7 AND t > 2 on ≥ 4 of 7.
- **G2 (PRIMARY — the stronger question)** Does gamma add anything BEYOND implied
  vol? Model A = HAR + log iv30 + log iv_front (the model that passed H2).
  Model C = A + regime dummy + gex_norm. Same expanding-window OOS protocol, same
  pass rule as H2: lower OOS error on ≥ 5/7 AND one-sided DM p < 0.05 on ≥ 4/7.

## Expectation stated up front

The book found the RV-proxy gamma null at daily and intraday resolution. The prior is
that it stays null; real IV mostly rescales gamma rather than reordering strikes, so
the flip location may barely move (G0 will show this). A G2 pass would be the first
positive gamma result in this book and would need out-of-period replication before
touching the live bot.

---

## RESULTS (run 2026-09-23) — NULL, now without the proxy excuse

Raw numbers: `data/results/gamma_real_iv_results.json`. Flip found on 48–71% of days
(no zero-crossing otherwise); NAS100 has only 743 days with a ≤45-DTE quarterly in the
file, so its G2 has just 26 OOS rows — underpowered, read as no information.

- **G0** (EUR_USD, 679 days): real-IV flip sits a median 0.28% of spot from the book's
  RV-proxy flip, and the regime label disagrees on 20% of days. So real IV DID change the
  input materially — this is not a rerun of the same numbers.
- **G1 FAIL** — textbook sign (more range below the flip) on 1 of 7; t > 2 on 0 of 7.
  6 of 7 point the OTHER way (calmer below the flip); only EUR_USD is significant
  (−0.14 log range, t = −2.36). One wrong-way hit in 7 is not grounds to flip the rule;
  it does say the book's call/put sign convention (a positioning ASSUMPTION — the data
  has no dealer side) is not supported either way.
- **G2 FAIL** — gamma regime + net GEX added to the HAR+IV range model: lower OOS error
  on 2 of 7 (+0.003%, +0.29%), DM-significant on 0; worse on 5.

**Verdict.** The book's gamma null was not an artefact of the realized-vol proxy. Whatever
gamma positioning does, the IV surface already prices it for next-day range.
