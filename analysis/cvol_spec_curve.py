"""
DOES THE OPTIONS MARKET'S OWN STATE PREDICT PINNING VS ACCELERATION?

COG's suggestion was an EXTERNAL factor with predictive power over pin-vs-accelerate,
and open interest as the usual starting point. The OI arm of that question is stuck
at 26 days of history and its test came back UNDERPOWERED (see gamma_spec_curve.py:
on FX it could only have detected a 29-53% effect). CVOL is the same kind of factor -
options-derived, not a transform of the price series - with 10 YEARS behind it.

THE OUTCOME IS THE QUESTION, STATED DIRECTLY.
  realised movement / what the options market implied
    < 1  price came in UNDER what was priced   -> pinned
    > 1  price exceeded what was priced        -> accelerated
So this asks, on 23k instrument-days: is that ratio PREDICTABLE from the option
market's state on the prior close?

METHODOLOGY IS DELIBERATELY SYMMETRIC. The prior work in this repo treated a
positive result and a null differently: positives were stress-tested across ninety
specifications until they broke, nulls were accepted on sight and banked as closed.
Applied consistently that rule converges on "everything fails" no matter what is
true. Three rules here, applied to every result regardless of which way it points:

  1. NOTHING IS SELECTED. Every combination of every analytic choice is run and the
     whole distribution reported. A single good cell is not a finding.
  2. EVERY RESULT CARRIES ITS POWER. The minimum detectable effect is printed next
     to the estimate. A null with a huge MDE is an absence of evidence and is
     labelled UNDERPOWERED, never NULL.
  3. THE PLACEBO SETS THE BAR. The identical curve is run on predictors decoupled
     from outcomes. "Better than placebo" is the standard - for nulls too, because
     a curve that is WORSE than placebo is itself informative.

AXES
  predictor   cvol_z, skew, skew_ratio, convexity, updn, cvol_chg5, vrp_trail20
  horizon     1 / 5 / 10 / 21 trading days
  outcome     high-low range / |close-to-close|, each over implied
  class       all 7 / FX only (6) / gold
  zlookback   126 / 252 days
  demean      raw / date-demeaned (cross-sectional only)

NO LOOKAHEAD. The predictor is CVOL's settle on day t; the outcome spans t+1..t+h.
Trailing z-scores and the trailing VRP use only data up to and including t.
Overlapping windows are removed by sampling every h-th date, and t-statistics use
the count of distinct DATES, never rows - 7 USD-linked instruments on one day are
not 7 independent observations.

SIGN CONVENTION. CME quotes USDCAD / USDCHF / USDJPY inverted (quote_orientation
-1), so `skew` is negated for those to put every skew in pair terms - the same trap
js/oi.js documents for strikes.

  python analysis/cvol_spec_curve.py
  python analysis/cvol_spec_curve.py --placebos 12

---------------------------------------------------------------------------
RESULT - run 2026-08-23. 7 instruments, 2,676 dates, 16,656 instrument-days,
2016-01-04 .. 2026-08-20. 560 specifications, 8 placebo curves.

                        real     placebo mean [min, max]
  median |t|            0.647    0.482  [0.339, 0.600]     above all 8
  frac |t| > 1.96      13.0%     5.1%   [3.6%, 7.5%]       2.5x chance
  frac |t| > 4          3.9%     1.1%   [0.7%, 2.9%]       3.5x chance

VERDICT: PREDICTABILITY PRESENT, SMALL, AND CONFINED TO ONE DAY.

The placebo validates itself - decoupled predictors clear |t|>1.96 in 5.1% of
specifications, almost exactly the 5% a correct null reference should produce. The
real curve runs at 13.0%. That gap is not forking paths; forking paths is precisely
what the placebo measures, and the real data is 2.5x it.

  strongest cells (shape only - a selected cell is not a finding)
    convexity    FX   h=1 rng demeaned   r = -0.111   t = -5.79   n = 2675
    cvol_z       gold h=1 rng raw        r = +0.112   t = +5.71   n = 2549
    vrp_trail20  gold h=1 rng raw        r = +0.106   t = +5.51   n = 2654
    updn         FX   h=1 rng demeaned   r = -0.105   t = -5.44   n = 2675
    skew_ratio   FX   h=1 rng demeaned   r = -0.105   t = -5.44   n = 2675

  power by horizon
    h= 1d   n=2674 dates   MDE r=0.054   |t|>1.96 in 47.1% of specs
    h= 5d   n= 534 dates   MDE r=0.121   |t|>1.96 in  2.9%
    h=10d   n= 267 dates   MDE r=0.171   |t|>1.96 in  0.0%
    h=21d   n= 127 dates   MDE r=0.248   |t|>1.96 in  2.1%

FOUR HONEST QUALIFICATIONS, none of which cancel the result.

  1. IT IS A ONE-DAY EFFECT. The entire 13% is h=1; 5/10/21d are at or below the
     placebo rate. But note those horizons are also far weaker tests (MDE r rises
     from 0.054 to 0.248 as non-overlapping sampling eats dates), so their flatness
     is UNDERPOWERED, not evidence of absence. h=1 is the only properly powered arm
     and it is the only one showing anything - those two facts are not independent.
  2. THE EFFECT IS SMALL. |r| ~ 0.11 is about 1.2% of variance. Real, not large.
  3. skew_ratio AND updn ARE COLLINEAR - identical t to three decimals, because
     skew_ratio is a transform of upvar/dnvar. They are ONE finding, not two.
  4. THIS IS CORRELATION, NOT A BOOK. No costs, no execution, no position sizing.

WHAT WOULD MAKE IT A RESULT. Out-of-sample split by year, then a costed rule. The
symmetry rule from the header applies to the confirmation too: if the OOS arm comes
back flat, report its MDE before calling it dead.
---------------------------------------------------------------------------
"""
import argparse, math
from pathlib import Path
import pandas as pd, numpy as np

ROOT = Path(__file__).resolve().parent.parent
TRADING_DAYS = 252
HORIZONS = [1, 5, 10, 21]
PRED = ['cvol_z', 'skew', 'skew_ratio', 'convexity', 'updn', 'cvol_chg5', 'vrp_trail20']


def load():
    cv = pd.read_parquet(ROOT / 'cme_cvol_eod_available_history.parquet')
    cv['date'] = cv['timestamp'].dt.tz_localize(None).dt.normalize()
    # skew into pair terms: CME quotes CAD/USD, CHF/USD, JPY/USD inverted
    cv['skew'] = cv['skew'] * cv['quote_orientation']
    cv['updn'] = cv['upvar'] / cv['dnvar'].replace(0, np.nan)
    cv = cv[['date', 'product', 'cvol', 'skew', 'skew_ratio', 'convexity', 'updn']]

    px = pd.read_parquet(ROOT / 'portfolioBacktest/cache/all_pairs_d1.parquet')
    px = px.reset_index()
    px['date'] = pd.to_datetime(px['datetime']).dt.tz_localize(None).dt.normalize()
    px = px.rename(columns={'pair': 'product'})[['date', 'product', 'high', 'low', 'close']]

    df = px.merge(cv, on=['date', 'product'], how='inner').sort_values(['product', 'date'])
    return df.reset_index(drop=True)


def features(df, zlb):
    out = []
    for prod, g in df.groupby('product', sort=False):
        g = g.sort_values('date').reset_index(drop=True)
        # ---- predictors, all using data up to and including t
        g['cvol_z'] = ((g.cvol - g.cvol.rolling(zlb).mean()) /
                       g.cvol.rolling(zlb).std())
        g['cvol_chg5'] = g.cvol - g.cvol.shift(5)
        daily_imp = g.close * (g.cvol / 100.0) / math.sqrt(TRADING_DAYS)
        realised_1 = (g.close - g.close.shift(1)).abs()
        g['vrp_trail20'] = (realised_1 / daily_imp.shift(1)).rolling(20).mean()

        # ---- outcomes over t+1..t+h, normalised by the implied move at t
        for h in HORIZONS:
            fwd_hi = g.high.shift(-1).rolling(h).max().shift(-(h - 1))
            fwd_lo = g.low.shift(-1).rolling(h).min().shift(-(h - 1))
            exp_move = g.close * (g.cvol / 100.0) / math.sqrt(TRADING_DAYS) * math.sqrt(h)
            g[f'rng{h}'] = (fwd_hi - fwd_lo) / exp_move
            g[f'ret{h}'] = (g.close.shift(-h) - g.close).abs() / exp_move
        out.append(g)
    return pd.concat(out, ignore_index=True)


def stat(sub, pcol, ycol, demean):
    """t of corr(predictor, outcome), with n = distinct DATES. Returns (t, r, n, mde_r)."""
    s = sub[['date', 'product', pcol, ycol]].replace([np.inf, -np.inf], np.nan).dropna()
    if len(s) < 50:
        return None
    if demean:
        s = s.assign(**{pcol: s[pcol] - s.groupby('date')[pcol].transform('mean'),
                        ycol: s[ycol] - s.groupby('date')[ycol].transform('mean')})
    if not (s[pcol].std() > 0 and s[ycol].std() > 0):
        return None
    r = s[pcol].corr(s[ycol])
    n = s.date.nunique()
    if not np.isfinite(r) or abs(r) >= 1 or n < 20:
        return None
    t = r * math.sqrt((n - 2) / max(1e-12, 1 - r * r))
    mde_r = 2.80 / math.sqrt(n)          # r detectable at alpha .05, power .80
    return t, r, n, mde_r


def curve(frames, shift=0):
    """frames: {zlb: feature frame}. `shift` rolls ONLY the predictor columns within
    each instrument, leaving the outcome (and the cvol-derived normaliser inside it)
    at its true alignment.

    NB an earlier version rolled raw `cvol` and recomputed everything downstream. That
    was invalid: the outcome is realised movement DIVIDED BY the implied move, so
    rolling cvol moved the outcome too, and the placebo manufactured correlation
    rather than destroying it - it scored roughly twice the real curve. A placebo
    that beats the real data is a broken placebo, not a finding."""
    rows = []
    for zlb, f in frames.items():
        if shift:
            f = f.sort_values(['product', 'date']).copy()
            f[PRED] = f.groupby('product')[PRED].transform(
                lambda s: np.roll(s.values, shift))
        for cls, sub0 in (('all', f), ('FX', f[f['product'] != 'XAUUSD']),
                          ('gold', f[f['product'] == 'XAUUSD'])):
            for h in HORIZONS:
                # non-overlapping: keep every h-th date
                keep = sorted(sub0.date.unique())[::h]
                sub = sub0[sub0.date.isin(keep)]
                for outcome in ['rng', 'ret']:
                    ycol = f'{outcome}{h}'
                    for p in PRED:
                        for dm in [False, True]:
                            if dm and cls == 'gold':
                                continue          # demeaning a single instrument is degenerate
                            r = stat(sub, p, ycol, dm)
                            if r:
                                t, rho, n, mde = r
                                rows.append(dict(zlb=zlb, cls=cls, h=h, outcome=outcome,
                                                 pred=p, demean=dm, t=t, r=rho,
                                                 n_dates=n, mde_r=mde))
    return pd.DataFrame(rows)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--placebos', type=int, default=12)
    a = ap.parse_args()

    df = load()
    print(f'panel: {df["product"].nunique()} instruments, {df.date.nunique()} dates, '
          f'{len(df)} instrument-days, {df.date.min().date()} .. {df.date.max().date()}\n')

    frames = {zlb: features(df, zlb) for zlb in [126, 252]}
    real = curve(frames)
    print('=' * 74)
    print('REAL SPECIFICATION CURVE')
    print('=' * 74)
    print(f'  {len(real)} specifications')
    print(f'  median |t|            {real.t.abs().median():.2f}')
    print(f'  |t| > 1.96            {(real.t.abs() > 1.96).mean():.1%}  '
          f'({(real.t.abs() > 1.96).sum()} specs)')
    print(f'  |t| > 4               {(real.t.abs() > 4).mean():.1%}  '
          f'({(real.t.abs() > 4).sum()} specs)')
    print(f'  median |r|            {real.r.abs().median():.4f}')
    print(f'  median MDE (r)        {real.mde_r.median():.4f}   '
          f'<- effect this curve CAN see at 80% power')
    print(f'  median n (dates)      {real.n_dates.median():.0f}')

    print('\n  median signed t by predictor (sign is the direction of the relationship):')
    for p, v in real.groupby('pred').t.median().sort_values().items():
        share = (real[real.pred == p].t.abs() > 1.96).mean()
        print(f'    {p:14} {v:+7.2f}   |t|>1.96 in {share:5.1%} of its specs')

    real = real.assign(abs_t=real.t.abs())
    print('\n  median |t| by axis:')
    for ax in ['cls', 'h', 'outcome', 'demean', 'zlb']:
        s = ' · '.join(f'{k}={v:.2f}' for k, v in real.groupby(ax).abs_t.median().items())
        print(f'    {ax:8} {s}')

    print('\n  POWER BY HORIZON (non-overlapping sampling costs dates as h grows):')
    pw = real.groupby('h').agg(n_dates=('n_dates', 'median'), mde_r=('mde_r', 'median'),
                               med_abs_r=('r', lambda s: s.abs().median()),
                               frac_sig=('abs_t', lambda s: (s > 1.96).mean()))
    for h, row in pw.iterrows():
        verdict = ('median spec detectable' if row.med_abs_r > row.mde_r
                   else 'median spec UNDERPOWERED')
        print(f'    h={h:>2}d  n={row.n_dates:>6.0f} dates   MDE r={row.mde_r:.3f}   '
              f'median |r|={row.med_abs_r:.3f}   |t|>1.96 {row.frac_sig:5.1%}   {verdict}')

    # ---- placebo: decouple predictor from outcome, keep every marginal
    print(f'\n  running {a.placebos} placebo curves (predictor shifted against outcome)...')
    lags = [250 * (i + 1) for i in range(a.placebos)]
    pl = []
    for k in lags:
        c = curve(frames, shift=k)
        if len(c):
            pl.append(dict(median_abs_t=c.t.abs().median(),
                           frac_sig=(c.t.abs() > 1.96).mean(),
                           frac_sig4=(c.t.abs() > 4).mean()))
    pl = pd.DataFrame(pl)

    print('\n' + '=' * 74)
    print('PLACEBO REFERENCE')
    print('=' * 74)
    for col, label, rv in [('median_abs_t', 'median |t|', real.t.abs().median()),
                           ('frac_sig', 'frac |t|>1.96', (real.t.abs() > 1.96).mean()),
                           ('frac_sig4', 'frac |t|>4', (real.t.abs() > 4).mean())]:
        v = pl[col]
        print(f'  {label:16} real {rv:7.3f}   placebo mean {v.mean():7.3f} '
              f'[{v.min():.3f}, {v.max():.3f}]   beats {(v < rv).mean():.0%} of placebos')

    print('\n' + '=' * 74)
    print('STRONGEST CELLS  (reported for shape only - selected cells are not findings)')
    print('=' * 74)
    top = real.reindex(real.t.abs().sort_values(ascending=False).index).head(12)
    print(top[['pred', 'cls', 'h', 'outcome', 'demean', 'zlb', 'r', 't', 'n_dates']]
          .to_string(index=False, float_format=lambda x: f'{x:.3f}'))

    p = ROOT / 'analysis' / 'output' / 'cvol_spec_curve.csv'
    p.parent.mkdir(parents=True, exist_ok=True)
    real.sort_values('t').to_csv(p, index=False)
    print(f'\nfull curve written to {p}')


if __name__ == '__main__':
    main()
