# net-liquidity-tailwind — When Fed net liquidity (balance sheet − TGA − RRP) is rising, do US equity indices do better over the next four weeks than when it is falling?

**Pre-registered 2026-10-21, before any outcome was computed.**

| | |
|---|---|
| ID / ledger id | `net-liquidity-tailwind-spx`, `net-liquidity-tailwind-nq` (two scored cells) |
| Branch | `main` |
| Register row | `plans/RESEARCH_REGISTER.md` → `net-liquidity-tailwind` |
| Data | Feature store, point-in-time: `fed_assets` (WALCL, ALFRED vintages), `fed_tga` (WTREGEN, ALFRED), `rrp_on` (RRPONTSYD daily, fixed_lag:1), `px_d1_spx500`, `px_d1_nas100` (OANDA daily closes, close+1h). Primary sample: Fridays from 2011-07 (where WALCL vintages begin) whose 4-week outcome ends by 2026-08-21 (lockbox). |
| Seed | `20261021` |
| Uncertainty | Moving-block bootstrap over weeks, block 8 (4-week outcomes overlap), B = 2000 |
| Scripts / outputs | `scripts/net-liquidity-tailwind/` → `analysis/output/net-liquidity-tailwind/` |
| Harness | Own script reading the feature-store parquet files with the as-of rule (`asof <= t`), and the unit rules of `js/netLiquidity.js`. |

## 1. The claim (required)

C.OG, in the Education Bank (Central Bank Policy; Understanding What Moves Markets; Cross-Asset Synthesis; Quant Macro lesson 4), verbatim:

> "Traders track 'net liquidity' — a simplified measure of money available to flow into markets: Net Liquidity = Fed Balance Sheet − TGA − RRP … Track net liquidity weekly. When it's rising, risk assets have a tailwind. When it's falling, headwinds emerge."

> "Central bank balance sheets drive asset prices. In March 2020, the worst GDP print ever coincided with a 45% rally — because liquidity said so. Track Fed balance sheet, RRP, and TGA weekly. Don't fight the flow."

This is his most repeated macro rule. The test reads "tailwind" as a forward claim: knowing net liquidity is rising this week should mean better equity returns over the coming weeks than when it is falling.

## 2. Why it is not already settled (required)

- `macro-confluence-direction` (context, untestable) and `macro-confluence-baa-credit` (null) used net-liquidity momentum only as **one of three** domains that all had to agree, and they are flagged RE-RUN for the net-liquidity unit fault (DATA_SPEC §5 #8, fixed in `js/netLiquidity.js`). Neither tests the rule on its own.
- `MD files/LEAD_LAG_TESTS.md` lists exactly this test ("Net liquidity → S&P 4-week sign") under "Queued, not run".
- `growth-vs-yields` and the liquidity gate are different variables.
- So the rule itself has never been tested, and never with point-in-time vintages.

## 3. Definitions, fixed in advance (required)

- **Net liquidity, weekly.** For each H.4.1 Wednesday w: `NL(w) = WALCL(w)/1000 − WTREGEN(w)/1000 − RRP(w)`, in $bn, using the units of `js/netLiquidity.js` (WALCL and WTREGEN in $ millions; RRPONTSYD in $ billions; RRP taken on that Wednesday, or the last print before it). Each value is the first-published vintage.
- **Knowable when?** A Wednesday's NL counts at Friday t only if the WALCL and TGA vintages and the RRP print all have `asof <= t` (Friday 21:00 UTC). In practice this is the Wednesday two days earlier.
- **Signal.** `ΔNL4(t)` = NL at the latest known Wednesday minus NL four Wednesdays earlier. **Rising** = ΔNL4 > 0; **falling** = ΔNL4 ≤ 0. This is the course's own reading.
- **Outcome.** The log return × 100 of the instrument from Friday t's daily close to the close four weeks later (20 trading days).
- **Instruments, reported separately:** `spx` (SPX500) and `nq` (NAS100).
- **Statistic.** The mean forward return in rising weeks minus the mean in falling weeks (percentage points per 4 weeks).
- **Controls.**
  - A circular shift of the signal by at least 26 weeks (the placebo, which must give ≈ 0).
  - A +1-week lag of the signal (robustness: the effect should not depend on the exact week).
  - The **same-window** version (ΔNL4 against the return over the SAME four weeks) is reported to separate "moves together" from "comes first". It is descriptive only.
- **Sample.** Primary: Fridays 2011-07 → the last Friday whose outcome ends by 2026-08-21. Halves split at 2019-01-01.

## 4. Hypotheses, expectation first (required)

| # | Question | Pre-registered expectation |
|---|---|---|
| a | `spx`: rising-minus-falling forward 4-week return > 0? | **Small positive or null.** The same-window link is likely strong (QE weeks, 2020); the forward link is likely weaker. |
| b | `nq`: the same? | Same as (a). |
| — | **THE GATE** (per cell): Holm CI excludes 0 with a positive sign; positive in both halves; above the shift-placebo 95%; the +1-week lag keeps the sign. | |
| — | **THE MIRROR**: falling net liquidity → worse returns. The rising-minus-falling difference covers both sides. | |

## 5. Power (required)

There are about 790 weekly signals and the 4-week outcomes overlap, so there are about 200 independent windows, split roughly half and half. With a 4-week SPX return SD of about 4.5% (NQ about 5.5%), the SE of the difference is about 4.5 × √(2/100) ≈ 0.64 pp. MDE at 80% power, Holm α 0.025: 3.08 × 0.64 ≈ **2.0 pp per 4 weeks** (NQ ≈ 2.4 pp).

| Cell | Weeks | Independent windows | MDE (pp / 4 weeks) | Useful bar | Verdict |
|---|---|---|---|---|---|
| spx | ~790 | ~200 | 2.0 | 1.0 | **UNDERPOWERED by design at 1.0; powered at 2.0** |
| nq | ~790 | ~200 | 2.4 | 1.0 | **UNDERPOWERED by design at 1.0** |

A 1 pp per 4-week gap (about 13% a year) would be valuable, and one series over 15 years cannot reliably detect it. The run still matters because it can rule out the large effect the rule implies ("don't fight the flow"). Verdict words: VALIDATED if the gate holds; NULL if the CI lies inside (−1.0, +1.0) pp; UNDERPOWERED otherwise.

## 6. Multiplicity (required)

- Scored cells: `spx`, `nq` (Holm at α 0.05, p from `pFromCI`).
- Descriptive only: the same-window link; the continuous version (ΔNL4 z-score against the forward return, as r); 1-week and 13-week horizons; GOLD; an extended sample 2003-04 → 2011-06 using latest-vintage WALCL (H.4.1 revisions are small; labelled not point-in-time); excluding 2020.
- Promotion: |t| ≥ 3 plus a forward record.

## 7. What this does NOT test (required)

- Other liquidity definitions (ECB/BoJ balance sheets, the GLI composite, reserves alone).
- Intraday or daily timing, FX pairs, or position sizing.
- Whether liquidity *causes* moves. Even a pass would be a forward association.

## 8. What each verdict changes (required)

- **VALIDATED** → ledger entry (research-only). The today.html liquidity gate and the funding block may say "rising net liquidity has historically been followed by +x pp over 4 weeks" with its CI. A forward record starts from funding_read_v1. No sizing until |t| ≥ 3.
- **NULL** → ledger entry. The course rule is recorded as tested-null forward, and pages describe net liquidity as **same-period context only**, never as a tailwind for the coming weeks.
- **UNDERPOWERED** → ledger entry. The same display rule as NULL. The CI says how large an effect is still possible.
