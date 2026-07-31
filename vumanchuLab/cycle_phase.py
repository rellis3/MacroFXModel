"""cycle_phase.py — WHERE IN ITS CYCLE is the wave, and does that matter?

The one genuinely untested idea to come out of the VMC discussion: not "what is
the oscillator reading" but "how far through its swing is it". The claim being
chased is the timing one — "we're ~17 candles into a normal cycle, so a turn is
due" — which nothing else in this platform addresses.

THE CAUSALITY TRAP, AND HOW IT IS AVOIDED
─────────────────────────────────────────
The natural phrasing is "how far are we between the last trough and the NEXT
peak". That needs the next peak, which has not happened. Any feature built that
way leaks the future and will look spectacular.

Everything here is phrased backwards-only:

  * an extreme at bar r is CONFIRMED at r + reach (it takes `reach` bars to know
    it was an extreme). Nothing may reference it before then.
  * `bars_since` counts from the last CONFIRMED extreme.
  * the typical cycle length is an EXPANDING median over cycles that had already
    completed and confirmed by this bar — never the full-sample median.
  * `phase` = bars_since ÷ that trailing median. So phase ~1.0 means "as far
    through as a typical cycle gets", and >1 means overdue. It can exceed 1
    precisely because the future is unknown; capping it at 1 would be the leak.

`cycle_features` is a pure function of one oscillator series and is asserted
truncation-invariant in `--selftest` — computing on bars[:n] reproduces the
first n values exactly. That test is the whole guarantee.

WHAT IT EMITS (per timeframe, ready for the panel)
──────────────────────────────────────────────────
  cycle_since     bars since the last confirmed WT extreme
  cycle_len       trailing median cycle length (bars between extremes)
  cycle_phase     cycle_since / cycle_len   (unbounded above)
  cycle_dir       +1 if the last confirmed extreme was a TROUGH (wave rising
                  out of it), -1 if a PEAK
  cycle_amp       the oscillator value at that last confirmed extreme

  # analysis + selftest
  python vumanchuLab/cycle_phase.py --selftest
  python vumanchuLab/cycle_phase.py --instrument gold
"""
from __future__ import annotations

import argparse
import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from vumanchuLab.panel import TIMEFRAMES, load_m1, resample  # noqa: E402
from pylego.indicators.vumanchu import OPERATOR_WT, wave_trend  # noqa: E402

REACH = 3          # bars either side to call an oscillator extreme
MIN_CYCLES = 5     # cycles needed before a median is trusted
MAX_PHASE = 4.0    # clip only for display sanity; the raw value is unbounded


def cycle_features(osc: np.ndarray, reach: int = REACH,
                   min_cycles: int = MIN_CYCLES) -> pd.DataFrame:
    """Causal cycle state of an oscillator. Pure; truncation-invariant."""
    x = np.asarray(osc, dtype=float)
    n = x.size
    out = {k: np.full(n, np.nan) for k in
           ('cycle_since', 'cycle_len', 'cycle_phase', 'cycle_dir', 'cycle_amp')}
    if n < 2 * reach + 3:
        return pd.DataFrame(out)

    # --- extremes, with the bar at which each becomes knowable ---------------
    s = pd.Series(x)
    rmax = s.rolling(2 * reach + 1, center=True).max().to_numpy()
    rmin = s.rolling(2 * reach + 1, center=True).min().to_numpy()
    is_pk = np.isfinite(rmax) & (x == rmax)
    is_tr = np.isfinite(rmin) & (x == rmin)
    # A flat run can satisfy both; treat it as neither rather than guessing.
    both = is_pk & is_tr
    is_pk &= ~both
    is_tr &= ~both

    idx = np.flatnonzero(is_pk | is_tr)
    if idx.size < 2:
        return pd.DataFrame(out)
    kind = np.where(is_pk[idx], 1, -1)          # +1 peak, -1 trough
    confirm = idx + reach                        # knowable from here on

    # Collapse consecutive same-kind extremes to the more extreme one, so a
    # "cycle" is genuinely peak->trough->peak and not peak->peak noise.
    keep = [0]
    for j in range(1, idx.size):
        if kind[j] == kind[keep[-1]]:
            better = x[idx[j]] > x[idx[keep[-1]]] if kind[j] == 1 else \
                     x[idx[j]] < x[idx[keep[-1]]]
            if better:
                keep[-1] = j
        else:
            keep.append(j)
    keep = np.array(keep)
    idx, kind, confirm = idx[keep], kind[keep], confirm[keep]

    # --- trailing median cycle length, knowable-only -------------------------
    # Cycle k spans idx[k-1] -> idx[k]; it is complete and knowable at
    # confirm[k]. The median at any bar uses only cycles confirmed by then.
    lens = np.diff(idx).astype(float)
    lens_conf = confirm[1:]
    med_at = np.full(lens.size, np.nan)
    for k in range(lens.size):
        if k + 1 >= min_cycles:
            med_at[k] = np.median(lens[:k + 1])

    # --- map every bar to the last extreme CONFIRMED by that bar ------------
    bars = np.arange(n)
    last = np.searchsorted(confirm, bars, side='right') - 1
    ok = last >= 0
    li = last[ok]
    out['cycle_since'][ok] = bars[ok] - idx[li]
    out['cycle_dir'][ok] = -kind[li]      # after a TROUGH the wave rises: +1
    out['cycle_amp'][ok] = x[idx[li]]

    # median available at each bar = median over cycles whose confirm <= bar
    lastc = np.searchsorted(lens_conf, bars, side='right') - 1
    okc = lastc >= 0
    vals = np.full(n, np.nan)
    vals[okc] = med_at[lastc[okc]]
    out['cycle_len'] = vals
    with np.errstate(divide='ignore', invalid='ignore'):
        out['cycle_phase'] = np.where(vals > 0, out['cycle_since'] / vals, np.nan)
    return pd.DataFrame(out)


# ── selftest ─────────────────────────────────────────────────────────────────

def selftest():
    checks = 0

    def ok(c, label):
        nonlocal checks
        checks += 1
        if not c:
            raise AssertionError('FAIL: ' + label)
        print('  ok  ' + label)

    rng = np.random.default_rng(3)
    t = np.arange(3000)
    osc = (60 * np.sin(t / 9.0) + 25 * np.sin(t / 31.0) + rng.normal(0, 4, t.size))

    full = cycle_features(osc)
    for cut in (600, 1400, 2200):
        pre = cycle_features(osc[:cut])
        for c in full.columns:
            a, b = pre[c].to_numpy(), full[c].to_numpy()[:cut]
            same = (np.isnan(a) == np.isnan(b)).all() and \
                   np.allclose(a[~np.isnan(a)], b[~np.isnan(b)], atol=1e-12)
            ok(same, f'truncation invariant at {cut}: {c}')

    ok(bool(np.all(full['cycle_since'].dropna() >= 0)), 'cycle_since is non-negative')
    ok(set(np.unique(full['cycle_dir'].dropna())) <= {-1.0, 1.0}, 'cycle_dir is +/-1')
    ok(bool(full['cycle_phase'].dropna().max() > 1.0),
       'phase can exceed 1 (not capped — capping would need the future)')
    ok(bool(np.isnan(full['cycle_len'].to_numpy()[:50]).all()),
       'cycle_len is NaN until enough cycles have completed')

    # A pure sine of known period should recover roughly that period.
    clean = 50 * np.sin(np.arange(4000) / (20 / (2 * np.pi)))
    cl = cycle_features(clean)['cycle_len'].dropna()
    ok(8 <= float(cl.median()) <= 12,
       f'recovers ~half-period 10 on a 20-bar sine (got {cl.median():.1f})')

    print(f'\nAll {checks} checks passed.')


# ── analysis ─────────────────────────────────────────────────────────────────

def analyse(instrument: str, event_tf: int, horizon: int, prior: int):
    from vumanchuLab.discover import score
    from vumanchuLab.panel import SIGMA_MIN, SIGMA_WINDOW

    m1 = load_m1(instrument)
    bars = resample(m1, event_tf)
    wt = wave_trend(bars['high'].to_numpy(float), bars['low'].to_numpy(float),
                    bars['close'].to_numpy(float), **OPERATOR_WT)
    cyc = cycle_features(wt.wt1)
    cyc.index = bars.index

    c = bars['close']
    sig = c.pct_change().rolling(SIGMA_WINDOW, min_periods=SIGMA_MIN).std().to_numpy()
    pw, hw = max(1, prior // event_tf), max(1, horizon // event_tf)
    with np.errstate(divide='ignore', invalid='ignore'):
        pr = (c / c.shift(pw) - 1.0).to_numpy() / (sig * np.sqrt(pw))
        fw = (c.shift(-hw) / c - 1.0).to_numpy() / (sig * np.sqrt(hw))

    df = cyc.copy()
    df['wt1'] = wt.wt1
    df['reverted'] = (np.sign(fw) != np.sign(pr)).astype(float)
    df.loc[~np.isfinite(fw) | ~np.isfinite(pr) | (np.abs(pr) < 0.5), 'reverted'] = np.nan
    df['hour'] = df.index.hour
    df['vol_bucket'] = (pd.Series(sig, index=df.index).rolling(20000, min_periods=2000)
                        .rank(pct=True).mul(3).clip(0, 2.999).fillna(-1).astype(int))
    df['prior_bucket'] = (pd.Series(np.abs(pr), index=df.index)
                          .rolling(20000, min_periods=2000).rank(pct=True)
                          .mul(3).clip(0, 2.999).fillna(-1).astype(int))
    df['zone'] = np.where(df['wt1'] >= 53, 'OB', np.where(df['wt1'] <= -53, 'OS', 'mid'))
    df = df.dropna(subset=['reverted', 'cycle_phase'])

    pb = pd.cut(df['cycle_phase'], [0, .25, .5, .75, 1.0, 1.5, 99],
                labels=['0-25%', '25-50%', '50-75%', '75-100%', '100-150%', 'overdue'])
    df['pb'] = pb.astype(str)

    print(f'\n{"="*88}')
    print(f'CYCLE PHASE — {instrument}, {event_tf}m grid, {horizon}m forward')
    print(f'{len(df):,} bars · median cycle {df["cycle_len"].median():.1f} bars '
          f'({df["cycle_len"].median()*event_tf:.0f} min) · '
          f'uncond P(revert) {df["reverted"].mean():.4f}')
    print(f'{"="*88}')

    print('\n-- phase alone --')
    t = score(df, df['pb'], min_n=400)
    t['delta_pp'] = (t['delta'] * 100).round(2); t['t'] = t['t'].round(2)
    print(t[['cell', 'n', 'delta_pp', 't']].to_string(index=False))

    print('\n-- phase x zone (does phase modulate the zone read?) --')
    t2 = score(df, df['zone'] + ' @ ' + df['pb'], min_n=300)
    t2['delta_pp'] = (t2['delta'] * 100).round(2); t2['t'] = t2['t'].round(2)
    t2 = t2[~t2['cell'].str.startswith('mid')]
    print(t2.sort_values('delta_pp', ascending=False)[['cell', 'n', 'delta_pp', 't']]
          .to_string(index=False))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--selftest', action='store_true')
    ap.add_argument('--instrument', default='gold')
    ap.add_argument('--event-tf', type=int, default=5)
    ap.add_argument('--horizon', type=int, default=60)
    ap.add_argument('--prior', type=int, default=60)
    a = ap.parse_args()
    if a.selftest:
        selftest(); return
    analyse(a.instrument, a.event_tf, a.horizon, a.prior)


if __name__ == '__main__':
    main()
