# The non-US yield legs — gilts, JGBs, bunds against Treasuries

*Pre-registered 2026-09-20, before any data was pulled. The chain on today.html
is the US-dollar transmission machine; it cannot say "this was a UK day" or
"this was a yen day". These three series are the only free daily feeds that
could. The question is what, if anything, the gap between a foreign 10-year and
the Treasury 10-year carries for the pair — and the desk already knows that
rate differentials do not predict FX direction here (yield/asset coupling
2026-08-23, L1 2026-09-19, the yield-spread bot). So the claims below are a
labelling claim, a range claim and a direction base rate, in that order.*

## Data

| leg | series | source | cadence |
|---|---|---|---|
| gilt 10Y | IUDMNZC (nominal par yield) | BoE IADB | daily, ~1-2 business days behind |
| JGB 10Y | 10Y column | MoF Japan `jgbcme_all.csv` + current month `jgbcme.csv` | daily, ~1 day behind |
| bund 10Y | BBSIS.D.I.ZAR.ZI.EUR.S1311.B.A604.R10XX.R.A.A._Z._Z.A | Bundesbank | daily, same day |
| UST 10Y | DGS10 | FRED (fredgraph.csv) | daily |
| pairs | GBP_USD, USD_JPY, EUR_USD | OANDA D1, London-midnight bars | daily |

Window: 2008-01 to now, common dates only. Gap = foreign − UST, in bp. A day's
FX return is the London-day log return on the same calendar date as the yield
prints (yields print inside that London day).

## Definitions, frozen

- **Foreign-led rise** (the day's label): Δforeign ≥ +T and Δgap ≥ +T, where T
  is 5bp for gilts and bunds, 3bp for JGBs (JGB moves are smaller). Foreign-led
  fall: the mirror.
- **Textbook sign** for the chain: gilt gap up → GBP/USD up (+1); bund gap up →
  EUR/USD up (+1); JGB gap up → yen bought → USD/JPY down (−1).
- **Big gap day** for the range test: |Δgap| ≥ 8bp (gilts, bunds), ≥ 5bp (JGBs).

## Claims

**Y1 — the label (same day, descriptive).** On the pair's worst 5% of days
(and, as the mirror, its best 5%), what share were foreign-led rise days,
against the unconditional share? Reported as a ratio with a bootstrap 95%
interval over the tail days. The pre-stated reading: a gilt-led rise
over-represented on GBP/USD's *worst* days is the fiscal-stress read (the
"bad rise" of September 2022); over-represented on its *best* days is the carry
textbook; neither is a label that carries nothing. Real only if the interval
on the ratio excludes 1.

**Y2 — the range (next session, the desk's standard).** After a big gap day,
the next session's realised range (high − low, as a share of close) against
the trailing 20-session median for the same pair: ratio, block-bootstrap 95%
interval (blocks of 10 sessions, 1000 reps). Real only if the interval excludes
1. Also reported: the same after a foreign-led rise day specifically.

**Y3 — direction (base rate, not a claim).** After a foreign-led rise day, the
share of next-session pair moves in the textbook direction, with its interval.
And the chain's own question: over rolling 20-session windows, the share where
sign(Δgap) × sign(ΔFX) agrees with the textbook. Both expected near 50%.

## What each verdict does to the page

- Y1 real on the worst tail → the chain chip reads "when this link breaks —
  yields up, currency down — it is the fiscal-stress read", and the day gets a
  desk-watch label. Y1 real on the best tail → the chip's textbook wording
  stands and the "bad rise" line is dropped. Y1 null → the chip is a
  description only and says so.
- Y2 real → a Desk Watch trigger for the next session's range, in the ledger.
  Y2 null → no trigger; the chip carries no range claim.
- Y3 is written into the ledger as the base rate whatever it says.

Harness: `analysis/nonus_yields_study.mjs`. Output: `analysis/output/nonus_yields.json`.

## Findings — run 2026-09-20

Data as pulled: gilts 2008-01-02 → 2026-09-16 (4,727 days), bunds → 2026-09-18
(4,753), JGBs → 2026-09-17 (4,577). Cross-check against FRED's monthly mirrors:
gilts sit a steady +8–10bp above (par vs benchmark basis, constant, so changes
agree), bunds +4–7bp, JGBs within ±10bp (FRED's Japan mirror is the stale one).
Common dates with London-day OANDA bars run from November 2010: n = 3,457 (GBP),
3,464 (EUR), 3,315 (JPY).

Base rates: a foreign-led rise is 5% of days for gilts and bunds, 3% for JGBs;
a big gap day is 8% (gilts), 16% (bunds), 32% (JGBs — the 5bp bar is low for a
series that moves 3bp on an ordinary day; kept as frozen).

**Y1 — the label.** *Null for the gilt "bad rise".* On GBP/USD's worst 5% of
days a gilt-led rise appears 6.9% of the time against 5.0% unconditional:
×1.39 [0.69, 2.20]. The episodes that make up that 6.9% are the famous ones —
2022-09-26 (gap +45bp, the mini-budget), five other 2022 days, 2024-10-02,
2025-01-08 — but they are twelve days in sixteen years, not a pattern the
label can carry. A gilt-led *fall* on the worst days is ×1.89 [1.005, 2.89],
just clear of 1: the ordinary carry read (UK yields down, pound down), marginal.
*Real for bunds, the carry way round:* on EUR/USD's worst days a bund-led fall
is ×2.37 [1.54, 3.32]; on its best days a bund-led rise is ×1.81 [1.07, 2.77].
JGBs: a JGB-led rise on USD/JPY's worst days (yen strength) ×2.02 [0.92, 3.30],
not clear of 1, though the same-day correlation is the strongest of the three
(−0.26 against +0.09 gilts, +0.08 bunds). All of this is same-day.

**Y2 — the range.** *Null.* The pre-registered bar ("ratio excludes 1") was
the wrong bar: the next-session/trailing-median ratio sits at 1.09–1.13 on
*ordinary* days too, because the ratio is skewed. Everything cleared it,
including the controls. Judged honestly — the difference against the
ordinary-day control, and against a US-led control (a big Treasury day with no
divergence), both post-hoc and stated as such — gilts +0.12 [−0.001, +0.25]
and +0.10 [−0.02, +0.26], bunds +0.02 and −0.01, JGBs +0.03 and −0.04. One cell
of nine, JGB-led fall, is +0.13 [0.007, 0.28]. A big yield day is followed by a
wider session whether the foreign leg led or not: this is vol clustering,
already on the book, and the foreign leg adds nothing to it. **No range trigger.**

**Y3 — direction.** Next-session textbook direction after a foreign-led rise:
50% [43–58] GBP, 55% [48–62] EUR, 50% [40–59] JPY; after a foreign-led fall
45%, 49%, 60% [50–70]. All include the coin. Over rolling 20-session windows
the gap and the pair agree with the textbook 57% [47–67] for GBP/USD, 74%
[64–83] for EUR/USD, 70% [60–79] for USD/JPY.

## What goes on the page

- Three gap chips on the chain — **Gilt − UST 10Y → GBP/USD**, **Bund − UST
  10Y → EUR/USD**, **JGB − UST 10Y → USD/JPY** — judged the way every other
  link is (same 20-day window, noise floors). The bund and JGB links hold in
  seven windows of ten, like a textbook link should. The gilt link is the
  weakest on the board and its card says so: 57%, a coin flip, and the
  exceptions are the days everyone remembers.
- No "bad rise" claim, no range trigger, no direction lean. The ledger carries
  Y1 (bunds real on the tails, gilts null), Y2 null, Y3 as the base rate.

---

## RE-RUN — 2026-11-28 (data fault #13; FRED user-agent)

Inputs fixed, nothing else: London-dated OANDA D1 bars from the fixed `fetchD1Aligned` (DATA_SPEC §5 #13: London
calendar date, weekends dropped, cut at the lockbox 2026-08-21), the shared event bootstrap
`analysis/lib/eventBootstrap.mjs` where the script used the copied `drawBlock` (§5 #14), and FRED fetched with a
named user-agent (`analysis/lib/fredCsv.mjs`; FRED 503s the default node UA, faults-log 2026-11-01). Same
definitions, thresholds, seeds and gates as the original. Branch `wf2/rerun-a`; outputs and logs in
`analysis/output/rerun-2026-11-28/`. Post-hoc data re-run: it can only describe or demote. Output `analysis/output/rerun-2026-11-28/nonus_yields.json`.

Common dates now n = 3,823 (GBP), 3,822 (EUR), 3,675 (JPY), 2011-01 → 2026-08-21 (as run: 3,457 / 3,464 / 3,315;
the summer Fridays are back and "next session" is the next London session, not two later).

**Y2 — range (post-hoc bar, as before: difference against the ordinary-day control and against a US-led control).**

| | big gap − control | led rise − control | led fall − control | big gap − US-led |
|---|---|---|---|---|
| gilts / GBP | **+0.138 [0.021, 0.292]** | **+0.108 [0.003, 0.253]** | +0.037 [−0.04, 0.13] | +0.089 [−0.046, 0.239] |
| bunds / EUR | +0.031 [−0.022, 0.09] | −0.011 | −0.001 | +0.008 [−0.084, 0.089] |
| JGBs / JPY | **+0.084 [0.025, 0.149]** | +0.099 [−0.018, 0.163] | **+0.248 [0.075, 0.426]** | +0.055 [−0.095, 0.174] |

A big gap day is now followed by a wider session on gilts and JGBs (the gilt cell crossed zero as run). Against a
big US-led Treasury day with no divergence, nothing clears on any leg. **Verdict nonus-yield-gap-range: CONTEXT**
(was NULL): a big yield day widens the next session, but no more when the foreign leg led than when the US did,
so it is vol clustering, which is already on the book. The foreign-specific part (big gap − US-led) cannot be
told apart from zero on these counts (intervals about ±0.13).

**Y3 — direction.** Next-session textbook direction after a foreign-led rise 50% [42–57] GBP (n 169), 50% [43–57] EUR
(n 199), 51% [42–61] JPY (n 105); after a foreign-led fall 48%, 48%, 49%. All hold the coin, more tightly than as run.
**Verdict nonus-yield-gap-direction: NULL** (unchanged).

**Y1 (the context label, not one of the re-run rows; stated so its entry can be updated):** gilt-led rise on GBP/USD
worst days ×1.41 [0.71, 2.24] (bad-rise label still null), gilt-led FALL on worst days ×2.24 [1.37, 3.36]; bund-led
fall on EUR/USD worst days ×2.57 [1.68, 3.69], bund-led rise on best days ×1.49 [0.80, 2.29] (now crosses 1);
JGB-led rise on USD/JPY worst days ×3.23 [1.71, 4.76] (now clear); same-day corr(Δgap, return) +0.16 GBP, +0.15
EUR, −0.43 JPY (as run +0.09, +0.08, −0.26). 20-session windows agree with the textbook 69% GBP, 69% EUR, 75% JPY.
