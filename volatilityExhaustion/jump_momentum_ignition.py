"""
jump_momentum_ignition.py — Phase 19: does price CONTINUE in the direction of an
individual Lee-Mykland jump over the next few bars?

Phase 13 (`jump_detect_lm.py`) already closed the DAILY version of this question —
next-day close-to-open continuation sits at 44-52% in every cell, NULL. But that is a
different claim from the one the live page's orange arrows invite: "a jump just printed
on the M5 chart, in this direction — is the next 5/15/30/60 minutes biased to extend it?"
Nothing in this folder tests that specific, short, per-jump horizon. This does, directly,
using the exact same detector `/api/jump-diffusion/live` draws its arrows from.

PRE-REGISTERED CLAIM (fixed before running): at a Lee-Mykland-flagged jump, the
CUMULATIVE forward log-return over the next H grid steps, SIGNED to the jump's own
direction, has mean > 0 (continuation) — tested at H in {1,3,6,12} steps (5/15/30/60 min),
on BOTH halves of a chronological 60/40 split, on a MAJORITY of core instruments.
FLAT / sign-disagreeing across halves or instruments = NULL, matching the daily-scope
verdict already on record.

MECHANICS, so the horizon is never fabricated:
  * Entry is at the CLOSE of the flagged bar (bar i) — the earliest a live trader could
    actually act once the marker appears, mirroring how `_markJumpsOnChart` places it.
  * Forward return = sum of the next H grid returns (bar i+1 .. bar i+H), signed by
    sign(r[i]) so + always means "continued the jump's direction".
  * CONTIGUITY IS CHECKED, not assumed. `instrument_grid`'s own gap-drop only removes
    the single return that SPANS a gap — two clean returns can still sit next to each
    other in the filtered array with a weekend between them. Each candidate horizon is
    verified against the bar's own true epoch-minute timestamps
    (`m1['utc_min'][ridx]`, reconstructed via the row indices `instrument_grid` already
    returns) and dropped if the H-step span isn't exactly H*STEP minutes — i.e. no
    weekend, no session break, no missing bar silently counted as "quiet".
  * Detection is IMPORTED verbatim from `jump_detect_lm.py` (grid, periodicity,
    local_sigma, per-day threshold) so this measures the SAME jumps the live page
    flags, not a re-derived approximation.
  * PLACEBO: the same measurement re-run with each jump's sign replaced by a random
    +-1 (matching the true up/down base rate). A real effect must beat this placebo,
    not just beat zero — zero is not automatically the right null once a single big
    bar is already conditioned on (one-bar mean-reversion / bid-ask bounce could show
    up as a "real"-looking negative number at H=1 for purely mechanical reasons).

Usage:  python3 jump_momentum_ignition.py [pair ...]   |   --selftest
"""
import os, sys, math, datetime, json
import numpy as np
from vol_exhaustion_lib import load_m1, build_london_daily
from jump_detect_lm import (instrument_grid, local_sigma, periodicity, lm_threshold,
                             asset_class, discover, STEP, IS_FRAC, MIN_RET)

HERE = os.path.dirname(os.path.abspath(__file__))
AUDIT = os.path.join(HERE, 'm1_gap_audit_summary.json')

CORE = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'nzdusd', 'usdcad', 'usdchf', 'gold']
HORIZONS = [1, 3, 6, 12]           # grid steps -> 5 / 15 / 30 / 60 minutes at STEP=5
OOS_FRAC = 0.40                    # matches js/volForecastBench.js / jump_event_validation.py
N_PLACEBO = 200                    # random-sign draws for the placebo band
SEED = 7


def detect_jumps(pair, path, exclude):
    """Same causal, per-day detection as jump_detect_lm.collect(), but returns one row
    PER JUMP (grid index, sign, date) instead of aggregating to a daily summary."""
    m1 = load_m1(path)
    daily = build_london_daily(m1)
    r, ridx, tod = instrument_grid(m1)
    if r.size < 5000:
        return []
    u_ret = m1['utc_min'][ridx]                  # true epoch-minute of each filtered return's end bar
    n_is = int(r.size * IS_FRAC)
    fac, b = periodicity(r, tod, n_is)
    rr = r / fac[b]
    sig = local_sigma(rr)
    with np.errstate(invalid='ignore', divide='ignore'):
        L = np.abs(rr) / sig

    order = np.searchsorted(daily['start'], ridx, side='right') - 1
    jumps = []
    for i in range(daily['day_idx'].size):
        d = (datetime.date(1970, 1, 1) + datetime.timedelta(days=int(daily['day_idx'][i]))).isoformat()
        if d in exclude:
            continue
        m = np.flatnonzero(order == i)
        if m.size < MIN_RET:
            continue
        thr = lm_threshold(m.size)
        isj = np.isfinite(L[m]) & (L[m] > thr)
        for k in m[isj]:
            jumps.append(dict(pair=pair, date=d, i=int(k), sign=1.0 if r[k] > 0 else -1.0,
                               tod=int(tod[k])))
    return jumps, r, u_ret


def forward_returns(jumps, r, u_ret):
    """Attach a signed cumulative forward return per horizon to each jump, dropping any
    horizon whose span isn't contiguous (verified on true timestamps, not array position)."""
    n = r.size
    csum = np.concatenate([[0.0], np.cumsum(r)])   # csum[j] = sum(r[:j]); cum(i+1..i+H) = csum[i+H+1]-csum[i+1]
    out = []
    for j in jumps:
        i = j['i']
        row = dict(j)
        for h in HORIZONS:
            if i + h >= n:
                row[f'fwd_{h}'] = None
                continue
            if u_ret[i + h] - u_ret[i] != h * STEP:
                row[f'fwd_{h}'] = None            # crosses a gap — not a clean same-session read
                continue
            fwd = csum[i + h + 1] - csum[i + 1]
            row[f'fwd_{h}'] = fwd * j['sign']     # signed to the jump's own direction
        out.append(row)
    return out


def welch_t(a):
    """One-sample t-stat for mean(a) != 0."""
    a = np.asarray(a, dtype=float)
    a = a[np.isfinite(a)]
    if a.size < 2:
        return float('nan'), float('nan')
    se = a.std(ddof=1) / math.sqrt(a.size)
    return (a.mean() / se if se > 0 else float('nan')), a.mean()


def placebo_band(jumps_fwd, h, rng):
    """Re-sign each jump randomly (matching the true up/down base rate) N_PLACEBO times;
    return the (mean, 5th, 95th) of the resulting mean-forward-return distribution —
    the "could this look like a real effect purely from conditioning on a big bar" band."""
    vals = np.array([j[f'fwd_{h}'] for j in jumps_fwd if j[f'fwd_{h}'] is not None])
    true_signs = np.array([j['sign'] for j in jumps_fwd if j[f'fwd_{h}'] is not None])
    if vals.size < 10:
        return float('nan'), float('nan'), float('nan')
    unsigned = vals * true_signs                 # back out the raw (unsigned) forward return
    p_up = (true_signs > 0).mean()
    means = np.empty(N_PLACEBO)
    for t in range(N_PLACEBO):
        rs = np.where(rng.random(vals.size) < p_up, 1.0, -1.0)
        means[t] = (unsigned * rs).mean()
    return means.mean(), np.percentile(means, 5), np.percentile(means, 95)


def split_is_oos(jumps_fwd):
    g = sorted(jumps_fwd, key=lambda r: (r['date'], r['i']))
    cut = int(len(g) * (1 - OOS_FRAC))
    return g[:cut], g[cut:]


def main(argv):
    if '--selftest' in argv:
        return selftest()
    if not os.path.exists(AUDIT):
        print('run m1_gap_audit.py first'); return 1
    audit = json.load(open(AUDIT))
    found = discover()
    want = [a for a in argv[1:] if not a.startswith('-')] or CORE

    print('=' * 100)
    print('PHASE 19 — per-jump momentum ignition: does the NEXT 5/15/30/60 min continue the jump?')
    print('=' * 100)
    print(f'  horizons (min)      : {[h*STEP for h in HORIZONS]}')
    print(f'  split               : {int((1-OOS_FRAC)*100)}/{int(OOS_FRAC*100)} chronological, per pair')
    print('  placebo             : jump SIGN replaced by a random draw at the true up/down base rate\n')

    rng = np.random.default_rng(SEED)
    all_verdicts = {}
    for p in want:
        if p not in found or p not in audit:
            print(f'  {p:9s} : skipped (missing or unaudited)'); continue
        jumps, r, u_ret = detect_jumps(p, found[p], set(audit[p]['exclude_dates']))
        if not jumps:
            print(f'  {p:9s} : no jumps detected'); continue
        jf = forward_returns(jumps, r, u_ret)
        is_j, oos_j = split_is_oos(jf)
        print(f'  ── {p} [{asset_class(p)}]  n_jumps={len(jf)} (IS {len(is_j)} / OOS {len(oos_j)}) ──')
        print(f'    {"min":>4s} {"half":4s} {"n":>6s} {"mean(bp)":>9s} {"t":>7s} '
              f'{"placebo mean(bp)":>17s} {"placebo 90%CI(bp)":>20s}  verdict')
        signs = []
        for h in HORIZONS:
            for half, g in (('IS', is_j), ('OOS', oos_j)):
                vals = [j[f'fwd_{h}'] for j in g if j[f'fwd_{h}'] is not None]
                if len(vals) < 30:
                    print(f'    {h*STEP:4d} {half:4s} (thin: {len(vals)})'); continue
                t, mean = welch_t(vals)
                pm, plo, phi = placebo_band(g, h, rng)
                beats_placebo = mean > phi if mean > 0 else mean < plo
                ok = (t > 1.96) and beats_placebo
                signs.append(ok)
                print(f'    {h*STEP:4d} {half:4s} {len(vals):6d} {mean*10000:9.2f} {t:7.2f} '
                      f'{pm*10000:17.2f} [{plo*10000:7.2f},{phi*10000:6.2f}]  '
                      f'{"REAL continuation" if ok else ("reversion" if t < -1.96 and (mean < plo) else "null")}')
        all_verdicts[p] = signs
        print()

    print('=' * 100)
    print('VERDICT')
    n_pairs_real = sum(1 for p, s in all_verdicts.items() if s and sum(s) >= max(1, len(s) // 2))
    for p, s in all_verdicts.items():
        frac = sum(s) / len(s) if s else 0
        print(f'  {p:9s}: {sum(s)}/{len(s)} (pair,horizon,half) cells beat both zero AND the placebo band')
    print(f'\n  {n_pairs_real}/{len(all_verdicts)} instruments show a majority-real signal.')
    if n_pairs_real <= len(all_verdicts) // 2:
        print('  Consistent with Phase 13\'s daily-scope finding: direction is NULL. The arrow tells you')
        print('  a jump happened, not which way price goes next.')
    else:
        print('  Disagrees with Phase 13\'s daily-scope null — a genuinely short-horizon effect the daily')
        print('  read could not see. Needs a costed IS/OOS trade test before anything is built on it.')
    print('=' * 100)
    return 0


def selftest():
    rng = np.random.default_rng(3)
    # A pure-diffusion draw (no real jump effect) must show placebo and true-sign means
    # statistically indistinguishable — the harness itself must not manufacture a signal.
    # Sized generously (2000 jumps) so the check is about correctness, not the ~10% false
    # -flag rate a 90% band carries at small n.
    n = 40000
    r = rng.normal(0, 1e-4, n)
    u = np.arange(n) * STEP
    jumps = [dict(pair='synthetic', date='2020-01-01', i=int(k), sign=1.0 if r[k] > 0 else -1.0, tod=0)
             for k in rng.choice(np.arange(200, n - 200), size=2000, replace=False)]
    jf = forward_returns(jumps, r, u)
    pm, plo, phi = placebo_band(jf, 1, rng)
    t, mean = welch_t([j['fwd_1'] for j in jf if j['fwd_1'] is not None])
    inside = plo <= mean <= phi
    print(f'  [ok] synthetic no-effect series: true mean {mean*10000:.2f}bp sits inside the '
          f'placebo 90% band [{plo*10000:.2f},{phi*10000:.2f}]bp: {inside}')
    assert inside, (mean, plo, phi)

    # A planted forward-continuation effect must be caught (harness sensitivity check).
    # Signs mixed ~50/50 (realistic base rate) so the placebo reshuffle has real variance
    # to compare against — an all-one-sign placebo is degenerate (no shuffling possible).
    r2 = rng.normal(0, 1e-4, n)
    jumps2 = []
    for k in rng.choice(np.arange(200, n - 200), size=2000, replace=False):
        s = 1.0 if rng.random() < 0.5 else -1.0
        r2[k] = 0.003 * s
        r2[k + 1] += 0.0015 * s      # planted continuation: next bar drifts WITH the jump
        jumps2.append(dict(pair='synthetic', date='2020-01-01', i=int(k), sign=s, tod=0))
    jf2 = forward_returns(jumps2, r2, u)
    t2, mean2 = welch_t([j['fwd_1'] for j in jf2 if j['fwd_1'] is not None])
    pm2, plo2, phi2 = placebo_band(jf2, 1, rng)
    caught = mean2 > phi2 and t2 > 1.96
    print(f'  [ok] planted continuation: true mean {mean2*10000:.2f}bp vs placebo 90% high '
          f'{phi2*10000:.2f}bp, t={t2:.1f} -> caught: {caught}')
    assert caught

    # Contiguity guard: a horizon spanning a fabricated gap must be dropped, not measured.
    u3 = u.copy(); u3[300:] += 2880          # a 2-day gap inserted after index 300
    jumps3 = [dict(pair='synthetic', date='2020-01-01', i=295, sign=1.0, tod=0)]
    jf3 = forward_returns(jumps3, r, u3)
    print(f'  [ok] gap-spanning horizon dropped: fwd_12={jf3[0]["fwd_12"]} (expect None)')
    assert jf3[0]['fwd_12'] is None
    print('selftest PASSED\n')
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
