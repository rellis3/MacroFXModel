"""
Tier 1 — does market-STATE improve the trend edge (sizing / conviction)?

The honest north star: not "does budget predict direction" (it doesn't) but "does the
trend-follower's edge deserve full conviction right now, given the volatility state?"
Two claims, kept separate:

  (a) MECHANICAL vol-sizing — inverse-vol vs fixed notional. Expected to help (vol
      targeting is replicated). This is not "state", it's just risk scaling.
  (b) STATE-GATING — down-weight the position when the market is in a spent/chaotic
      state (prior day blew through its 75th OR prior-day efficiency < 0.35 — a
      no-fit, pre-registered rule, clustering makes prior-day a proxy for today).
      This is the folklore-risk claim: does conditioning on state add edge BEYOND
      mechanical vol-sizing? Default prior: mostly null.

Metric: OOS Sharpe of (i) each pair and (ii) an equal-weight daily basket (the
engine's real target — diversification is the edge). Time-ordered 60/40 split.

PRE-REGISTERED:
  (a) PASS if OOS basket Sharpe(inverse-vol) > Sharpe(fixed) AND >=4/6 pairs improve.
  (b) PASS if OOS basket Sharpe(state-gated) > Sharpe(inverse-vol) by a non-trivial
      margin AND >=4/6 pairs improve. Else NULL — state does not add beyond sizing.
  Also report the IS conditional edge (signal-aligned return in spent/chaotic vs
  calm) so we can SEE whether there was anything to exploit before asking if it holds.
"""
import sys
import numpy as np
from budget_research_lib import (FX_MAJORS, build_daily, state_features, base_position,
                                 strat_returns, sharpe)

TRAIN_FRAC = 0.60
EFF_CHAOS = 0.35


def basket(series_by_pair):
    """Equal-weight daily basket over the union of day indices (missing = absent, not 0)."""
    acc = {}
    for pair, (didx, dr) in series_by_pair.items():
        for d, r in zip(didx, dr):
            acc.setdefault(int(d), []).append(r)
    days = sorted(acc)
    port = np.array([np.mean(acc[d]) for d in days])
    return port


def split_sharpe(port):
    n = port.size; ntr = int(n * TRAIN_FRAC)
    return sharpe(port[:ntr]), sharpe(port[ntr:])


def run():
    fixed, invvol, gated = {}, {}, {}
    per_pair = {}
    is_edge = {'spent_chaos': [], 'calm': []}
    for pair in FX_MAJORS:
        dd = build_daily(pair)
        st = state_features(dd)
        didx = dd['day_idx']
        pos_fixed = base_position(dd, use_vol=False)
        pos_iv = base_position(dd, use_vol=True)
        # pre-registered no-fit state gate (known at entry)
        chaos = ((st['exc_prev'] == 1) | (st['eff_prev'] < EFF_CHAOS))
        gate = np.where(chaos, 0.5, 1.0)
        pos_g = pos_iv * gate

        fixed[pair] = (didx, strat_returns(dd, pos_fixed))
        invvol[pair] = (didx, strat_returns(dd, pos_iv))
        gated[pair] = (didx, strat_returns(dd, pos_g))

        # conditional edge (IS half only): signal-aligned next-day return by state
        n = dd['close'].size; ntr = int(n * TRAIN_FRAC)
        sig_m = np.sign(pos_iv)
        aligned = np.zeros(n); aligned[1:] = sig_m[:-1] * dd['rets'][1:]
        for i in range(2, ntr):
            if not np.isfinite(st['eff_prev'][i]):
                continue
            (is_edge['spent_chaos'] if chaos[i] else is_edge['calm']).append(aligned[i])

        f_is, f_oos = split_sharpe(np.array(strat_returns(dd, pos_fixed)))
        v_is, v_oos = split_sharpe(np.array(strat_returns(dd, pos_iv)))
        g_is, g_oos = split_sharpe(np.array(strat_returns(dd, pos_g)))
        per_pair[pair] = dict(fixed_oos=f_oos, iv_oos=v_oos, gated_oos=g_oos,
                              iv_is=v_is, gated_is=g_is)

    # baskets
    fx_is, fx_oos = split_sharpe(basket(fixed))
    iv_is, iv_oos = split_sharpe(basket(invvol))
    g_is, g_oos = split_sharpe(basket(gated))

    print('=== per-pair OOS Sharpe ===')
    print(f'{"pair":8} {"fixed":>7} {"invVol":>7} {"gated":>7}')
    for p in FX_MAJORS:
        r = per_pair[p]
        print(f'{p:8} {r["fixed_oos"]:7.2f} {r["iv_oos"]:7.2f} {r["gated_oos"]:7.2f}')

    n_iv_gt_fixed = sum(1 for p in FX_MAJORS if per_pair[p]['iv_oos'] > per_pair[p]['fixed_oos'])
    n_g_gt_iv = sum(1 for p in FX_MAJORS if per_pair[p]['gated_oos'] > per_pair[p]['iv_oos'])

    sc = np.array(is_edge['spent_chaos']); ca = np.array(is_edge['calm'])
    print('\n=== IS conditional edge (signal-aligned daily return) ===')
    print(f'  spent/chaotic: mean {sc.mean()*1e4:+.2f} bp/day  (n={sc.size})')
    print(f'  calm         : mean {ca.mean()*1e4:+.2f} bp/day  (n={ca.size})')
    print(f'  (gating helps only if calm edge > spent/chaotic edge, and it HOLDS OOS)')

    print('\n=== BASKET Sharpe (equal-weight, the diversified edge) ===')
    print(f'  fixed    IS {fx_is:+.2f}  OOS {fx_oos:+.2f}')
    print(f'  inv-vol  IS {iv_is:+.2f}  OOS {iv_oos:+.2f}')
    print(f'  gated    IS {g_is:+.2f}  OOS {g_oos:+.2f}')

    print('\n=== PRE-REGISTERED VERDICT ===')
    a_pass = (iv_oos > fx_oos) and (n_iv_gt_fixed >= 4)
    b_pass = (g_oos > iv_oos + 0.05) and (n_g_gt_iv >= 4)
    print(f'  (a) vol-sizing helps ....... {a_pass}  (basket {iv_oos:+.2f} vs {fx_oos:+.2f}, {n_iv_gt_fixed}/6 pairs)')
    print(f'  (b) state-gating adds ...... {b_pass}  (basket {g_oos:+.2f} vs {iv_oos:+.2f}, {n_g_gt_iv}/6 pairs)')
    print(f'  --> (a) {"PASS" if a_pass else "null"} · (b) {"PASS" if b_pass else "NULL"}')
    return dict(basket=dict(fixed_oos=fx_oos, iv_oos=iv_oos, gated_oos=g_oos),
                per_pair=per_pair, a_pass=bool(a_pass), b_pass=bool(b_pass),
                is_edge_spent=float(sc.mean()), is_edge_calm=float(ca.mean()))


if __name__ == '__main__':
    run()
