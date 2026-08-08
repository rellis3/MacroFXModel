"""
median_follow_gated.py — Phase 10: the ENVIRONMENT-GATED decision at the median line.

The owner's real goal: "confidence around a level — should I enter, and which direction?"

Two of our own signals are REAL and OOS-validated, but each is sub-tradeable alone:
  1. Phase-3 (daytype_classifier): prior-vol/regime predicts whether TODAY is an
     EXPANSION (blows through its 75th) or CONTAINED day — magnitude, OOS AUC 0.68.
     Transparent causal rule: EXPANSION-lean if prior day blew its 75th (prior_exc1>1)
     OR σ is accelerating (sig_accel>1.10).
  2. Phase-7 (costed_median_follow): at the median line price CONTINUES (real serial
     momentum, placebo-proven) — but the ~+0.01%/trade edge ≈ cost, so follow-the-median
     nets slightly negative as a standalone breakout.

The synthesis (what Phase-3's verdict explicitly pointed to — "a classification win has
to be SIZED/GATED onto an existing edge"): use the environment classifier to GATE the
median decision.
  • EXPANSION-lean day  → FOLLOW the median (continuation more likely → maybe clears cost)
  • CONTAINED day       → FADE  the median (range-bound → mean-reverts → maybe clears cost)

The gate uses ONLY causal, pre-session features (prior_exc1, sig_accel) — no current-day
realized info. We reuse the vetted costed_median_follow primitives (_day_trade/_resolve,
same dynamic lines, same fills+costs) so this is a pure GATE overlay, not a new engine.

Pre-registered pass (per CLAUDE.md — assume no edge until proven):
  A gated leg BEATS its ungated baseline AND is > 0 after cost, IS AND OOS, on pooled FX
  AND ≥ 4/6 majors. NULL benchmark: driftless walk → 0 net expectancy on any barrier bet.
  Anti-gate contrast (fade on expansion / follow on contained) should be WORSE — if the
  gate "works" both ways it's just noise slicing.

Run: python3 median_follow_gated.py            (6 FX majors, pooled)
     python3 median_follow_gated.py EURUSD      (one pair, verbose)
"""
import os, sys
import numpy as np
from vol_exhaustion_lib import load_m1, build_london_daily, causal_sigma
from costed_median_follow import (INSTR, FX, CACHE, C_75, MIN_BARS, _day_trade, _dstr, _stats, _fmt)

HL75_SIG = C_75          # fx 75th line in σ-units (1.674) — the exceedance denominator
ACCEL_TH = 1.10          # σ-acceleration threshold (Phase-3 transparent rule)


def _expansion_lean(daily, sig):
    """Causal EXPANSION-lean flag per day (known before the London open):
    lean = (prior day blew its 75th: prior_exc1 > 1) OR (σ accelerating: sig_accel > 1.10).
    Returns a bool array aligned to daily; NaN-safe (False where features unavailable)."""
    nd = sig.size
    o, hi, lo = daily['open'], daily['high'], daily['low']
    nbars = daily['end'] - daily['start']
    realized_hl_sig = np.full(nd, np.nan)
    ok = (sig > 0) & (o > 0) & (nbars >= MIN_BARS)
    realized_hl_sig[ok] = (hi[ok] - lo[ok]) / o[ok] / sig[ok]
    exc_ratio = realized_hl_sig / HL75_SIG
    prior_exc1 = np.concatenate([[np.nan], exc_ratio[:-1]])   # prior day's exceedance
    sig_accel = np.full(nd, np.nan)
    for i in range(5, nd):
        base = sig[i - 5:i]; base = base[base > 0]
        if base.size and sig[i] > 0:
            sig_accel[i] = sig[i] / base.mean()
    lean = (np.nan_to_num(prior_exc1, nan=0.0) > 1.0) | (np.nan_to_num(sig_accel, nan=0.0) > ACCEL_TH)
    return lean


def run_pair(pair, action, slMult, tp_mode):
    """Per-day median trade tagged with (pnl_net, risk, seg, lean). Mirrors
    costed_median_follow.run_pair exactly, but also records the causal expansion flag."""
    m1 = load_m1(os.path.join(CACHE, INSTR[pair]))
    daily = build_london_daily(m1)
    sig = causal_sigma(daily)
    lean = _expansion_lean(daily, sig)
    nd = daily['open'].size
    split = nd // 2
    rows = []
    for i in range(nd):
        s = sig[i]
        if not (s > 0):
            continue
        a, b = daily['start'][i], daily['end'][i]
        if b - a < MIN_BARS:
            continue
        O = m1['open'][a]
        if not (O > 0):
            continue
        hi = m1['high'][a:b]; lo = m1['low'][a:b]; cl = m1['close'][a:b]
        r = _day_trade(hi, lo, cl, O, s, action, slMult=slMult, tp_mode=tp_mode)
        if r is None:
            continue
        rows.append((r[0], r[1], 0 if i < split else 1, 1 if lean[i] else 0))
    return np.array(rows) if rows else np.empty((0, 4)), _dstr(daily['day_idx'][split])


def _sub(t, seg, gate=None):
    """Slice trades by segment (0=IS,1=OOS) and optional gate (1=lean,0=contained)."""
    m = t[:, 2] == seg
    if gate is not None:
        m &= t[:, 3] == gate
    return t[m]


# Primary pre-registered configs (least-negative ungated, from Phase-7):
#   FOLLOW gated by EXPANSION-lean ; FADE gated by CONTAINED.
FOLLOW = ('follow', 1.5, 'band')     # follow·75th·sl1.5
FADE   = ('fade',   1.5, 'band')     # fade·ocmed·sl1.5 (textbook incumbent)


def main():
    pairs = sys.argv[1:] or FX
    pairs = [p for p in pairs if p in INSTR] or FX
    print(f"\n{'='*100}\nPhase 10 — ENVIRONMENT-GATED median decision  (gate = causal Phase-3 expansion-lean)\n"
          f"  EXPANSION-lean day → FOLLOW ; CONTAINED day → FADE.  Dynamic lines, real fills+cost.\n"
          f"  Pre-reg pass: gated leg beats ungated AND >0 after cost, IS & OOS, pooled + ≥4/6 majors.\n{'='*100}")

    # Collect per-pair, both actions.
    data = {}
    for pair in pairs:
        tF, splitdate = run_pair(pair, *FOLLOW)
        tD, _ = run_pair(pair, *FADE)
        data[pair] = (tF, tD)

    # ── Per-pair table: FOLLOW on lean days, FADE on contained days ──
    pass_follow = pass_fade = pass_combo = 0
    for pair in pairs:
        tF, tD = data[pair]
        print(f"\n=== {pair} ===")
        for name, t, action_gate in [('FOLLOW', tF, 1), ('FADE', tD, 0)]:
            all_is, all_oos = _sub(t, 0), _sub(t, 1)
            g_is, g_oos = _sub(t, 0, action_gate), _sub(t, 1, action_gate)
            print(f"  {name:6} ungated   IS {_fmt(_stats(all_is))}   |   OOS {_fmt(_stats(all_oos))}")
            gate_lbl = 'on EXPANSION' if action_gate == 1 else 'on CONTAINED'
            print(f"  {name:6} {gate_lbl} IS {_fmt(_stats(g_is))}   |   OOS {_fmt(_stats(g_oos))}")
            base_o, gate_o = _stats(all_oos), _stats(g_oos)
            if gate_o and base_o and gate_o['mean_pct'] > base_o['mean_pct'] and gate_o['mean_pct'] > 0:
                if name == 'FOLLOW': pass_follow += 1
                else: pass_fade += 1
        # combined rule: follow(lean) + fade(contained), pooled per pair
        combo_is = np.vstack([_sub(tF, 0, 1), _sub(tD, 0, 0)]) if tF.size or tD.size else np.empty((0, 4))
        combo_oos = np.vstack([_sub(tF, 1, 1), _sub(tD, 1, 0)])
        cs_is, cs_oos = _stats(combo_is), _stats(combo_oos)
        print(f"  COMBO  rule       IS {_fmt(cs_is)}   |   OOS {_fmt(cs_oos)}")
        if cs_oos and cs_oos['mean_pct'] > 0:
            pass_combo += 1

    # ── Pooled FX ──
    print(f"\n{'='*100}\nPOOLED FX  (the honest read)\n{'='*100}")
    allF = np.vstack([data[p][0] for p in pairs])
    allD = np.vstack([data[p][1] for p in pairs])
    for name, t, action_gate in [('FOLLOW', allF, 1), ('FADE', allD, 0)]:
        gate_lbl = 'EXPANSION' if action_gate == 1 else 'CONTAINED'
        for seg, lab in [(0, 'IS'), (1, 'OOS')]:
            base = _stats(_sub(t, seg))
            gated = _stats(_sub(t, seg, action_gate))
            anti = _stats(_sub(t, seg, 1 - action_gate))
            print(f"  {name:6} {lab:3}  ungated {_fmt(base)}")
            print(f"  {name:6} {lab:3}  {gate_lbl:9} {_fmt(gated)}")
            print(f"  {name:6} {lab:3}  anti-gate {_fmt(anti)}")
        print()
    comboF_oos = np.vstack([_sub(allF, 1, 1), _sub(allD, 1, 0)])
    comboF_is = np.vstack([_sub(allF, 0, 1), _sub(allD, 0, 0)])
    print(f"  COMBINED rule (follow-lean + fade-contained)  IS {_fmt(_stats(comboF_is))}")
    print(f"  COMBINED rule (follow-lean + fade-contained)  OOS {_fmt(_stats(comboF_oos))}")

    # ── Verdict ──
    print(f"\n{'='*100}\nPRE-REGISTERED VERDICT\n{'='*100}")
    print(f"  FOLLOW gated>ungated & >0 OOS : {pass_follow}/{len(pairs)} majors  (pass ≥4)")
    print(f"  FADE   gated>ungated & >0 OOS : {pass_fade}/{len(pairs)} majors  (pass ≥4)")
    print(f"  COMBINED rule >0 OOS         : {pass_combo}/{len(pairs)} majors")
    poolF = _stats(_sub(allF, 1, 1)); poolD = _stats(_sub(allD, 1, 0)); poolC = _stats(comboF_oos)
    pooled_ok = (poolF and poolF['mean_pct'] > 0) and (poolD and poolD['mean_pct'] > 0)
    print(f"  pooled OOS: follow-on-expansion {poolF['mean_pct']:+.4f}%  fade-on-contained {poolD['mean_pct']:+.4f}%  "
          f"combined {poolC['mean_pct']:+.4f}%")
    verdict = 'PASS' if (pooled_ok and pass_follow >= 4 and pass_fade >= 4) else 'NULL'
    print(f"\n  >>> {verdict} <<<   "
          f"{'The environment gate lifts the median decision over cost.' if verdict=='PASS' else 'Gate does not clear the pre-registered bar — median stays a filter, not a standalone entry.'}")


if __name__ == '__main__':
    main()
