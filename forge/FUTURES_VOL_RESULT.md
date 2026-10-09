# Futures volatility forecast — result (pre-reg: forge/FUTURES_VOL_PREREG.md, 4e68b573)

*Run 2026-10-09 with `python -m forge.run_futures_vol`. Raw output: `analysis/output/nt8/futures_vol_results.json`
(local). Shadow study: nothing live changed.*

## Integrity gate

C0 (own HAR on log gk) ÷ A0 (`forge/vol.py::har_rv_log_sigma`) pooled loss ratio = **1.0004** (required 0.97–1.03).
The harness reproduces the live incumbent. Disclosure: before the full run I looked at C1 on NQ and ES alone (2 of the
12 primary roots) as a harness trial; the full registered run was not changed after seeing them.

## Primary set (12 CFD-matched roots, 6 expanding folds, OOS 2020-04 → 2026-10)

| arm | pooled loss ratio vs A0 | 95% block-bootstrap CI | first half / second half | roots better |
|---|---|---|---|---|
| **C1 (primary)** HAR on 5-min realised variance | **0.9866** | [0.9822, 0.9909] | 0.9821 / 0.9911 | 12 / 12 |
| C2 + gk HAR terms | 0.9886 | [0.9844, 0.9926] | 0.9849 / 0.9921 | 12 / 12 |
| C3 + jump share + volume surprise | 0.9870 | [0.9828, 0.9911] | 0.9835 / 0.9905 | 11 / 12 |

Pooled HL p75 exceed-rate: A0 0.253, C1 0.254 (target 0.25).

**C1 verdict: PASS** — all four pre-registered rules hold (pooled upper bound < 1; both halves < 1; 12/12 ≥ 9/12;
exceed-rate in 0.20–0.30).

## How big is it

Small. C1 lowers pooled pinball loss by **1.3%**, with a spread by asset: indices 1.3–2.7% (NQ 0.975, ES 0.973,
YM 0.983, RTY 0.987), gold 2.0%, FX 0.5–1.8% (6B 0.982, 6E 0.989, 6S 0.990, 6J 0.992, 6A 0.994, 6C 0.995, 6N 1.000).
The registered test is whether it is real, and it is; it is not a large improvement in the ladder. Calibration is
unchanged (exceed-rates match the control), so the gain is sharper σ, not different widths.

## What C2 / C3 say (diagnostics, cannot rescue or promote anything)

Adding volume surprise and jump share (C3) did **not** help on the primary set (0.9870 vs C1 0.9866). On the
secondary set (commodities, rates, DAX) C3 and C2 were slightly better than C1 (0.9838 / 0.9851 vs 0.9881).
Nothing here shows volume or jumps carry range information beyond the 5-minute realised variance for the 12 roots.

## Secondary set (14 roots, not in the pass rule)

C1 pooled 0.9881 [0.9834, 0.9934], better on 13/14. Weakest: ZT (C1 1.038, but C2/C3 0.996/0.992 — a 2-year note
whose 5-min RV is dominated by the quote tick size), NG 0.999, ZC 0.999. Strongest: FDAX 0.968, CL 0.977, BZ 0.978,
ZW 0.978.

## Caveats

- Futures-on-futures test. Whether the futures forecast beats the **CFD** forecast on CFD ranges is not tested here
  (needs the translation step).
- Four arms were examined; one (C1) was pre-declared. C2/C3 results are descriptive.
- 5-minute RV is a standard, not tuned, choice. No sampling frequency or lag structure was searched.
- Roll-adjusted prices; volume comes from the unadjusted series. Sessions with <500 bars dropped.

## Next

1. CFD translation: score the futures-based σ against the live CFD ranges for the same sessions (is it better than the
   CFD HAR on the target the live system uses?).
2. If the gain survives translation, add a shadow row to `har-shadow.html` (read-only), per owner rule.
3. Order-book information is untested: the live feed is 10-min delayed, recording is on hold.

---

# Step 2 result — CFD translation (pre-reg: Step 2 section of forge/FUTURES_VOL_PREREG.md, c740b12f)

*Run 2026-10-09 with `python -m forge.run_futures_vs_cfd`. Scored on the live CFD `london22` session ranges; OOS
2020-04 → CFD data end (2026-07/08). Widths refit on the CFD target per arm.*

| arm | pooled loss ratio vs B0 (live HAR on CFD) | 95% CI | halves | roots better |
|---|---|---|---|---|
| B1 futures daily HAR (data source only) | 0.9983 | [0.9938, 1.0023] | 0.9994 / 0.9975 | 6 / 12 |
| **B2 PRIMARY** futures 5-min-RV HAR | **0.9847** | [0.9785, 0.9908] | 0.9819 / 0.9878 | **12 / 12** |
| B3 50/50 blend of B0 and B2 | 0.9862 | [0.9828, 0.9893] | 0.9851 / 0.9874 | 12 / 12 |

Pooled HL p75 exceed-rate: control 0.256, B2 0.256.

**B2 verdict: PASS** — all four rules (upper bound < 1; both halves < 1; 12/12 ≥ 9/12; exceed-rate 0.256 in 0.20–0.30).

## Reading it

- **The futures data source alone changes nothing** (B1 ≈ B0, interval spans 1). The gain comes from the intraday
  information (5-minute realised variance), not from "futures vs CFD".
- The gain on CFD targets (1.5%) is the same size as on futures targets (1.3%): it translates intact.
- Per root: NQ 0.977, ES 0.978, YM 0.987, RTY 0.986, gold 0.990, 6E 0.975, 6B 0.969, 6J 0.989, 6A 0.988, 6N 0.993,
  6C 0.998, 6S 0.986. Indices and EUR/GBP gain most; CAD and NZD barely.
- The blend (B3) has a tighter interval but no better point estimate than B2 alone; nothing here favours blending.
- DAX (secondary, one root): B2 0.985, interval [0.971, 1.001] — consistent, not conclusive alone.
- The size is unchanged from Step 1: a real ~1.5% lower ladder loss, not a new edge. It is cheap to get: the CFD M1
  bars we already hold can compute 5-minute RV, so this may not even need futures data. **Untested:** whether the same
  5-minute-RV HAR run on the CFD M1 bars (no futures) captures the same gain. If it does, the live path needs no bridge.
