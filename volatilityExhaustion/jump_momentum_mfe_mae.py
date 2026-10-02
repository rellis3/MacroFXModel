"""
jump_momentum_mfe_mae.py — Phase 20: even with the endpoint return NULL (Phase 19), is
there a favourable MFE/MAE shape worth designing a stop/target around — hold-for-X,
exit-on-best-excursion rather than exit-at-a-fixed-close?

THE CONFOUND THIS EXISTS TO ISOLATE. A jump is, by definition, a burst of volatility.
Phase 13 already found real, replicated evidence that jump-driven sessions carry elevated
NEAR-TERM volatility (faster RV decay afterward, but decay FROM a higher level). So both
MFE (best excursion) and MAE (worst excursion) after a jump are mechanically larger than
after a quiet bar, in EITHER direction, regardless of whether the jump's sign carries any
information. Naively reporting "MFE(H) > MAE(H) in the arrow's direction" would mostly be
re-discovering that volatility clusters, not a tradeable directional edge. So every number
here is reported against the SAME placebo used in Phase 19: each jump's own unsigned path,
re-signed at random (matching the true up/down base rate). A placebo jump sits on the
identical volatility burst — it just doesn't know the true direction. If real MFE/MAE only
matches the placebo's, the "volatility, not direction" explanation wins outright.

PRE-REGISTERED CLAIM (fixed before running): for at least one horizon H in the grid below,
mean MFE (true-signed) beats the placebo MFE band AND mean |MAE| (true-signed, adverse
excursion) is no worse than the placebo MAE band, replicated IS -> OOS, on a majority of
core instruments. That is the minimum bar for "there's a hold-and-manage edge here even
though the fixed-close endpoint is flat." Anything short of that is NULL, same verdict as
Phase 19 at a different angle.

MECHANICS (shared with Phase 19, not re-derived): entry at the flagged bar's CLOSE,
detection imported verbatim from `jump_detect_lm.py`, jumps from `jump_momentum_ignition.
detect_jumps`. NEW here: the full forward PATH per jump (not just the horizon's endpoint),
so MFE(H)=max and MAE(H)=min of the signed cumulative path over steps 1..H. Contiguity is
checked per STEP along the path (a session gap freezes the path at the last clean bar, it
is never bridged), matching Phase 19's per-horizon gap guard.

Usage:  python3 jump_momentum_mfe_mae.py [pair ...]   |   --selftest
"""
import os, sys, math, json
import numpy as np
from jump_detect_lm import asset_class, discover, STEP
from jump_momentum_ignition import detect_jumps, split_is_oos, AUDIT, CORE

HORIZONS = [1, 2, 3, 4, 6, 9, 12, 18, 24]     # -> 5,10,15,20,30,45,60,90,120 minutes
OOS_FRAC = 0.40
N_PLACEBO = 200
SEED = 11
MAX_H = max(HORIZONS)


def build_paths(jumps, r, u_ret):
    """Per jump: the RAW (unsigned) cumulative-return path for steps 1..valid_to, where
    valid_to is the number of consecutive, gap-free steps available (path freezes there,
    never bridges a gap). Returns jumps augmented with 'raw_path' (np.ndarray) and
    'valid_to' (int); jumps with valid_to==0 are dropped (no usable forward bar at all)."""
    n = r.size
    csum = np.concatenate([[0.0], np.cumsum(r)])
    out = []
    for j in jumps:
        i = j['i']
        if i + 1 >= n:
            continue
        max_k = min(MAX_H, n - 1 - i)
        valid_to = 0
        for k in range(1, max_k + 1):
            if u_ret[i + k] - u_ret[i] != k * STEP:
                break
            valid_to = k
        if valid_to == 0:
            continue
        raw_path = csum[i + 2:i + valid_to + 2] - csum[i + 1]   # raw_path[k-1] = sum(r[i+1..i+k])
        row = dict(j); row['raw_path'] = raw_path; row['valid_to'] = valid_to
        out.append(row)
    return out


def path_stat(raw_path, sign, h, stat):
    if h > raw_path.size:
        return None
    seg = raw_path[:h] * sign
    if stat == 'end':
        return seg[-1]
    if stat == 'mfe':
        return seg.max()
    if stat == 'mae':
        return seg.min()
    raise ValueError(stat)


def placebo_stat_band(jf, h, stat, rng):
    """Same logic as Phase 19's placebo_band, generalised to end/mfe/mae."""
    usable = [j for j in jf if j['valid_to'] >= h]
    if len(usable) < 10:
        return float('nan'), float('nan'), float('nan')
    p_up = np.mean([j['sign'] > 0 for j in usable])
    means = np.empty(N_PLACEBO)
    for t in range(N_PLACEBO):
        vals = np.empty(len(usable))
        rs = rng.random(len(usable)) < p_up
        for k, j in enumerate(usable):
            s = 1.0 if rs[k] else -1.0
            vals[k] = path_stat(j['raw_path'], s, h, stat)
        means[t] = vals.mean()
    return means.mean(), np.percentile(means, 5), np.percentile(means, 95)


def welch_t(a):
    a = np.asarray(a, dtype=float); a = a[np.isfinite(a)]
    if a.size < 2:
        return float('nan'), float('nan')
    se = a.std(ddof=1) / math.sqrt(a.size)
    return (a.mean() / se if se > 0 else float('nan')), a.mean()


def summarize(jf, h, rng):
    usable = [j for j in jf if j['valid_to'] >= h]
    if len(usable) < 30:
        return None
    end = np.array([path_stat(j['raw_path'], j['sign'], h, 'end') for j in usable])
    mfe = np.array([path_stat(j['raw_path'], j['sign'], h, 'mfe') for j in usable])
    mae = np.array([path_stat(j['raw_path'], j['sign'], h, 'mae') for j in usable])
    t_end, m_end = welch_t(end)
    t_mfe, m_mfe = welch_t(mfe)
    t_mae, m_mae = welch_t(mae)
    pm_mfe, plo_mfe, phi_mfe = placebo_stat_band(jf, h, 'mfe', rng)
    pm_mae, plo_mae, phi_mae = placebo_stat_band(jf, h, 'mae', rng)
    mfe_beats = m_mfe > phi_mfe
    mae_no_worse = m_mae > plo_mae            # MAE is negative; "no worse" = less negative than placebo's low tail
    return dict(n=len(usable), m_end=m_end, t_end=t_end, m_mfe=m_mfe, t_mfe=t_mfe,
                plo_mfe=plo_mfe, phi_mfe=phi_mfe, m_mae=m_mae, t_mae=t_mae,
                plo_mae=plo_mae, phi_mae=phi_mae, mfe_beats=mfe_beats,
                mae_no_worse=mae_no_worse, edge=bool(mfe_beats and mae_no_worse))


def main(argv):
    if '--selftest' in argv:
        return selftest()
    if not os.path.exists(AUDIT):
        print('run m1_gap_audit.py first'); return 1
    audit = json.load(open(AUDIT))
    found = discover()
    want = [a for a in argv[1:] if not a.startswith('-')] or CORE

    print('=' * 108)
    print('PHASE 20 — post-jump MFE/MAE: is there a hold-and-manage edge once the fixed-close return is flat?')
    print('=' * 108)
    print(f'  horizons (min)  : {[h*STEP for h in HORIZONS]}')
    print('  placebo         : jump SIGN replaced by a random draw at the true up/down base rate,')
    print('                    applied to the SAME unsigned path — isolates direction from generic')
    print('                    post-jump volatility clustering (Phase 13\'s real, replicated finding)\n')

    rng = np.random.default_rng(SEED)
    per_pair_edges = {}
    for p in want:
        if p not in found or p not in audit:
            print(f'  {p:9s} : skipped (missing or unaudited)'); continue
        jumps, r, u_ret = detect_jumps(p, found[p], set(audit[p]['exclude_dates']))
        if not jumps:
            print(f'  {p:9s} : no jumps detected'); continue
        jf = build_paths(jumps, r, u_ret)
        is_j, oos_j = split_is_oos(jf)
        print(f'  -- {p} [{asset_class(p)}]  n_jumps={len(jf)} (IS {len(is_j)} / OOS {len(oos_j)}) --')
        print(f'    {"min":>4s} {"half":4s} {"n":>6s} {"end(bp)":>8s} {"MFE(bp)":>8s} {"plc90hi":>8s}'
              f' {"MAE(bp)":>8s} {"plc90lo":>8s}  edge?')
        edges = []
        for h in HORIZONS:
            for half, g in (('IS', is_j), ('OOS', oos_j)):
                s = summarize(g, h, rng)
                if s is None:
                    print(f'    {h*STEP:4d} {half:4s} (thin)'); continue
                edges.append(s['edge'] if half == 'OOS' else None)
                print(f'    {h*STEP:4d} {half:4s} {s["n"]:6d} {s["m_end"]*10000:8.2f} '
                      f'{s["m_mfe"]*10000:8.2f} {s["phi_mfe"]*10000:8.2f} '
                      f'{s["m_mae"]*10000:8.2f} {s["plo_mae"]*10000:8.2f}  '
                      f'{"EDGE" if s["edge"] else "-"}')
        oos_edges = [e for e in edges if e is not None]
        per_pair_edges[p] = oos_edges
        print()

    print('=' * 108)
    print('VERDICT')
    any_real = False
    for p, edges in per_pair_edges.items():
        n_edge = sum(1 for e in edges if e)
        print(f'  {p:9s}: {n_edge}/{len(edges)} OOS horizons show MFE beating placebo AND MAE no worse')
        if n_edge > 0:
            any_real = True
    if not any_real:
        print('\n  NULL, replicating Phase 19 from the MFE/MAE angle: no horizon shows a real hold-and-manage')
        print('  edge once matched against the placebo. The post-jump excursion IS bigger than after a quiet')
        print('  bar (that part is real, per Phase 13) -- but it is bigger by the same amount whichever')
        print('  direction you guess, so there is nothing here a stop/target design can convert into edge.')
    else:
        print('\n  At least one OOS cell beat both bars -- needs a costed race (spread, slippage) before')
        print('  treating it as more than noise across this many (pair, horizon) comparisons.')
    print('=' * 108)
    return 0


def selftest():
    rng = np.random.default_rng(4)
    n = 40000
    r = rng.normal(0, 1e-4, n)
    u = np.arange(n) * STEP

    # 1. No-effect series: real MFE/MAE must sit inside the placebo band (harness must not
    #    manufacture an edge out of a symmetric random walk).
    jumps = [dict(pair='synthetic', date='2020-01-01', i=int(k), sign=1.0 if r[k] > 0 else -1.0, tod=0)
             for k in rng.choice(np.arange(200, n - 200), size=2000, replace=False)]
    jf = build_paths(jumps, r, u)
    s = summarize(jf, 6, rng)
    print(f'  [ok] no-effect: MFE {s["m_mfe"]*10000:.2f}bp vs placebo 90%hi {s["phi_mfe"]*10000:.2f}bp, '
          f'MAE {s["m_mae"]*10000:.2f}bp vs placebo 90%lo {s["plo_mae"]*10000:.2f}bp -> edge={s["edge"]}')
    assert not s['edge'], s

    # 2. Planted one-sided drift WITH direction (real edge): must be caught as MFE-beats,
    #    MAE-fine at the horizon it was planted over.
    r2 = rng.normal(0, 1e-4, n)
    jumps2 = []
    for k in rng.choice(np.arange(200, n - 200), size=2000, replace=False):
        s_ = 1.0 if rng.random() < 0.5 else -1.0
        r2[k] = 0.003 * s_
        for step in range(1, 5):
            r2[k + step] += 0.0008 * s_       # sustained drift in the jump's direction, 4 bars
        jumps2.append(dict(pair='synthetic', date='2020-01-01', i=int(k), sign=s_, tod=0))
    jf2 = build_paths(jumps2, r2, u)
    s2 = summarize(jf2, 4, rng)
    print(f'  [ok] planted drift: MFE {s2["m_mfe"]*10000:.2f}bp vs placebo 90%hi {s2["phi_mfe"]*10000:.2f}bp '
          f'-> edge={s2["edge"]}')
    assert s2['edge'], s2

    # 3. Gap freezes the path rather than bridging it.
    u3 = u.copy(); u3[300:] += 2880
    jumps3 = [dict(pair='synthetic', date='2020-01-01', i=295, sign=1.0, tod=0)]
    jf3 = build_paths(jumps3, r, u3)
    print(f'  [ok] gap freezes path: valid_to={jf3[0]["valid_to"]} (expect 4, since i+5=300 crosses the gap)')
    assert jf3[0]['valid_to'] == 4, jf3[0]['valid_to']
    print('selftest PASSED\n')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
