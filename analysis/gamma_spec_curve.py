"""
SPECIFICATION CURVE + PLACEBO for the dealer-gamma pin/accelerate question.

WHY THIS EXISTS. `gamma_band_realised.py` pre-registered one specification, got a
null, and was then re-cut by asset class, by horizon, and by binary-vs-continuous
parameterisation until something appeared. Each cut was defensible on its own and
the sequence is still a garden of forking paths: with ~70 defensible ways to slice
26 days, several will clear p<0.05 with no effect present at all. Anything selected
that way is uninterpretable, and reporting the best one is how this repo produced
the QMR artifact.

THE FIX. Do not choose a specification. Enumerate EVERY combination of the analytic
choices that were ever on the table, run all of them, and report the DISTRIBUTION.
Then run the identical curve on data where the gamma reading has been deliberately
decoupled from the outcome, and ask whether the real curve is distinguishable from
the fake ones. If it is not, every result in the previous script - null and positive
alike - was forking paths, and that includes the index/FX split.

This design cannot be biased by what the author expects, because nothing is
selected: the output is the whole curve either way.

THE AXES (every one of these was used somewhere in the prior analysis):
  class          all 11 / FX+gold (7) / indices (4)
  horizon        1 / 2 / 3 trading days forward
  normaliser     ATR20 (all instruments) / CVOL implied (6 FX + gold only)
  outcome        high-low range / |close-to-close return|
  parameterisation
                 binary   - day-paired mean difference between bands
                 depth    - correlation with signed distance into the band

ORIENTATION. Every statistic is signed so that POSITIVE SUPPORTS the thesis
(long gamma suppresses movement, short gamma amplifies it). A curve centred on
zero means no effect; a curve shifted positive means the effect is there across
specifications rather than in one lucky corner.

THE PLACEBO. Within each instrument, the OI reading (band, depth) is circularly
shifted by k days against the price outcomes, for every k from 1 to n-1. This
preserves every marginal distribution - the same flips, the same spots, the same
ranges, the same clustering - and destroys only the date alignment that any real
effect must live in. Each k yields a complete specification curve. The real curve
is then read against that reference distribution.

  python analysis/gamma_spec_curve.py
  python analysis/gamma_spec_curve.py --placebos 25

---------------------------------------------------------------------------
RESULT - run 2026-08-23. 11 instruments, 24 dates, 261 pair-days, 90 specifications.

  median t                        -0.861     (positive would support the thesis)
  fraction of specs with t > 0     21.1%
  specs significantly SUPPORTING    0 of 90
  specs significantly CONTRADICTING 3 of 90

  median t by axis
    class      FX/gold -1.10 · INDEX -0.88 · all -0.79
    param      binary -0.17 · depth_raw -0.82 · depth_demeaned -1.08
    normaliser ATR -0.88 · CVOL -0.75
    horizon    1d -0.72 · 2d -1.07 · 3d -0.90
    outcome    range -0.77 · |return| -0.88

  placebo (20 circular shifts, OI reading decoupled from outcome)
    median t            real -0.861  placebo mean +0.263 [-0.340, +0.875]
    sig-support count   real  0      placebo mean 3.05   [0, 12.1]
    10% of placebo curves reached a median |t| this large -> NOT distinguishable
    from noise at 5%.

VERDICT: UNDERPOWERED - the thesis is neither supported nor ruled out.

  Not one of 90 specifications supports the thesis significantly, while decoupled
  placebo data averages 3. That is a real observation. But it must be read next to
  the minimum detectable effect, which was computed AFTER the fact and should have
  been computed first (alpha .05, power .80, two-sided, on the day-paired test):

    class      horizon   MDE as % of the mean normalised level
    FX/gold    1-3d      29% - 53%
    all 11     1-3d      21% - 40%
    INDEX      1-3d      11% - 19%

  So on FX this test could only ever have seen a difference of a THIRD TO A HALF in
  realised movement between gamma bands. No one claims dealer gamma does that. The
  FX arm of this null is close to vacuous - it rules out only effects far larger
  than anybody asserts. The index arm is more informative (an 11-19% floor) but
  still cannot see the single-digit effect a real hedging flow would plausibly
  produce.

  THE ASYMMETRY THIS CORRECTS. A positive result here was stress-tested across 90
  specifications until it died; the null was accepted on sight. Apply that rule
  consistently and everything converges to "failure" regardless of what is true.
  A null is only a finding when paired with the effect size the test could have
  detected. This one is not - it is an absence of evidence, and the honest label is
  UNDERPOWERED, not NULL. It should not be banked as a closed question, and
  `oi_expect_log` should keep accumulating toward an n where the MDE falls below
  the effect sizes actually being claimed.

RETRACTION. This supersedes the exploratory index/FX finding in
`gamma_band_realised.py`. That result reported corr(depth, range) as negative
(supporting) on indices and positive on FX, across three horizons. It does not
survive here: with the class split as one axis among ninety, INDEX sits at -0.88
and FX/gold at -1.10 - both leaning AGAINST the thesis, and neither distinguishable
from the other. Two things killed it: (a) it was one selected cut out of ~70
defensible ones, which is what this script exists to prevent, and (b) it pooled
across dates, mixing the cross-sectional question with a time-series one that market
regime confounds. `depth_raw` vs `depth_demeaned` is now an explicit axis and the
demeaned version is the more negative of the two.

WHAT THIS DOES NOT ESTABLISH. Daily bars over 24 dates. Dealer hedging acts
intraday, so the correct-resolution test has not been run. CME FX options are a
sliver of a mostly-OTC market and only 4 index instruments are here, all correlated.
This is evidence that the effect is not visible at DAILY resolution in ONE MONTH of
CME data - it is not evidence that dealer gamma does nothing, and it does not
adjudicate anyone's intraday method.

CAVEAT ON THE PLACEBO ITSELF: its mean median-t is +0.26 rather than 0, so the
circular shift may carry mild bias (depth is autocorrelated; vol is not stationary
over the window). The conservative reading is therefore the magnitude test (10%),
not the "real sits below every placebo" percentile.
---------------------------------------------------------------------------
"""
import argparse, math, sys
from pathlib import Path
import pandas as pd, numpy as np, requests

ROOT = Path(__file__).resolve().parent.parent
BASE = 'https://macrofxmodel-production.up.railway.app'
IDX = {'NAS100_USD', 'SPX500_USD', 'US30_USD', 'US2000_USD'}
OANDA = {'EUR/USD': 'EUR_USD', 'GBP/USD': 'GBP_USD', 'USD/JPY': 'USD_JPY',
         'AUD/USD': 'AUD_USD', 'USD/CAD': 'USD_CAD', 'USD/CHF': 'USD_CHF',
         'XAU/USD': 'XAU_USD', 'NAS100_USD': 'NAS100_USD', 'SPX500_USD': 'SPX500_USD',
         'US30_USD': 'US30_USD', 'US2000_USD': 'US2000_USD'}
CVOL = {'EURUSD': 'EUR/USD', 'GBPUSD': 'GBP/USD', 'USDJPY': 'USD/JPY',
        'AUDUSD': 'AUD/USD', 'USDCAD': 'USD/CAD', 'USDCHF': 'USD/CHF',
        'XAUUSD': 'XAU/USD'}
TRADING_DAYS = 252
HORIZONS = [1, 2, 3]


def build_panel():
    """One row per (pair, date) with the OI reading and every horizon's outcome."""
    r = requests.get(f'{BASE}/api/kv/get', params={'key': 'oi_history'}, timeout=60)
    hist = (r.json() or {}).get('data') or {}

    oi = []
    for pair, days in hist.items():
        for date, e in (days or {}).items():
            spot, flip = e.get('spot'), e.get('gammaFlip')
            if not (isinstance(spot, (int, float)) and spot > 0):
                continue
            if not (isinstance(flip, (int, float)) and flip > 0):
                continue
            oi.append(dict(pair=pair, date=date, depth=(spot - flip) / spot))
    oi = pd.DataFrame(oi)
    if oi.empty:
        return oi

    lo, hi = oi.date.min(), oi.date.max()
    start = (pd.Timestamp(lo) - pd.Timedelta(days=40)).strftime('%Y-%m-%d')
    end = (pd.Timestamp(hi) + pd.Timedelta(days=max(HORIZONS) + 6)).strftime('%Y-%m-%d')

    rows = []
    for pair in sorted(oi.pair.unique()):
        rr = requests.get(f'{BASE}/api/ohlc-range',
                          params={'symbol': OANDA[pair], 'granularity': 'D',
                                  'from': start, 'to': end}, timeout=60)
        vals = (rr.json() or {}).get('values') or []
        c = pd.DataFrame([{'date': v['datetime'][:10], 'h': float(v['high']),
                           'l': float(v['low']), 'c': float(v['close'])} for v in vals])
        if not len(c):
            continue
        c = c.sort_values('date').reset_index(drop=True)
        prev = c.c.shift()
        c['tr'] = np.maximum(c.h - c.l, np.maximum((c.h - prev).abs(), (c.l - prev).abs()))
        c['atr20'] = c.tr.rolling(20).mean()
        dates = list(c.date)
        for _, o in oi[oi.pair == pair].iterrows():
            prior = [i for i, d in enumerate(dates) if d <= o.date]
            if not prior:
                continue
            i0 = max(prior)
            base, atr = c.c.iloc[i0], c.atr20.iloc[i0]
            if not (base > 0) or not (atr > 0):
                continue
            row = dict(pair=pair, date=o.date, depth=o.depth, base=base, atr=atr)
            ok = False
            for h in HORIZONS:
                i1 = i0 + h
                if i1 >= len(c):
                    row[f'rng{h}'] = np.nan
                    row[f'ret{h}'] = np.nan
                    continue
                fwd = c.iloc[i0 + 1:i1 + 1]
                row[f'rng{h}'] = fwd.h.max() - fwd.l.min()
                row[f'ret{h}'] = abs(fwd.c.iloc[-1] - base)
                ok = True
            if ok:
                rows.append(row)

    df = pd.DataFrame(rows)
    if df.empty:
        return df

    p = ROOT / 'cme_cvol_eod_available_history.parquet'
    if p.exists():
        cv = pd.read_parquet(p, columns=['timestamp', 'product', 'cvol'])
        cv['pair'] = cv['product'].map(CVOL)
        cv = cv.dropna(subset=['pair'])
        cv['date'] = cv['timestamp'].dt.strftime('%Y-%m-%d')
        df = df.merge(cv[['pair', 'date', 'cvol']], on=['pair', 'date'], how='left')
    else:
        df['cvol'] = np.nan
    df['cls'] = df.pair.apply(lambda x: 'INDEX' if x in IDX else 'FX/gold')
    return df


def normalised(df, horizon, outcome, norm):
    raw = df[f'{outcome}{horizon}']
    if norm == 'atr':
        return raw / df.atr
    exp = df.base * (df.cvol / 100.0) / math.sqrt(TRADING_DAYS) * math.sqrt(horizon)
    return raw / exp


def stat_binary(sub, y):
    """Day-paired t of (short - long). POSITIVE = long band quieter = SUPPORTS."""
    s = sub.assign(y=y, band=np.where(sub.depth >= 0, 'long', 'short')).dropna(subset=['y'])
    g = s.groupby(['date', 'band']).y.mean().unstack()
    if not {'long', 'short'} <= set(g.columns):
        return None
    g = g.dropna(subset=['long', 'short'])
    if len(g) < 4:
        return None
    d = g['short'] - g['long']
    sd = d.std(ddof=1)
    if not sd > 0:
        return None
    return d.mean() / (sd / math.sqrt(len(d)))


def stat_depth(sub, y, demean):
    """t of -corr(depth, y). POSITIVE = deeper into long gamma is quieter = SUPPORTS.

    `demean` is itself a specification axis, not a silent choice. Raw pooling mixes
    the cross-sectional question (is the pair deep in long gamma quieter than its
    peers today?) with a time-series one (are quiet WEEKS also deep-gamma weeks?),
    and the latter is confounded by market regime. Date-demeaning isolates the
    cross-section. Both are defensible, so both are run."""
    s = sub.assign(y=y).dropna(subset=['y', 'depth'])
    if len(s) < 12 or s.date.nunique() < 4:
        return None
    if demean:
        s = s.assign(yv=s.y - s.groupby('date').y.transform('mean'),
                     dv=s.depth - s.groupby('date').depth.transform('mean'))
    else:
        s = s.assign(yv=s.y, dv=s.depth)
    if not (s.yv.std() > 0 and s.dv.std() > 0):
        return None
    r = -s.dv.corr(s.yv)
    n = s.date.nunique()          # dates, not rows - the honest degrees of freedom
    if n < 4 or not np.isfinite(r) or abs(r) >= 1:
        return None
    return r * math.sqrt((n - 2) / max(1e-9, 1 - r * r))


def curve(df):
    """Every specification. Returns a DataFrame of signed t-statistics."""
    out = []
    for cls in ['all', 'FX/gold', 'INDEX']:
        sub0 = df if cls == 'all' else df[df.cls == cls]
        for norm in ['atr', 'cvol']:
            sub = sub0 if norm == 'atr' else sub0.dropna(subset=['cvol'])
            if sub.empty:
                continue
            for h in HORIZONS:
                for outcome in ['rng', 'ret']:
                    y = normalised(sub, h, outcome, norm)
                    if y.notna().sum() < 12:
                        continue
                    specs = (('binary', lambda s, v: stat_binary(s, v)),
                             ('depth_raw', lambda s, v: stat_depth(s, v, False)),
                             ('depth_demeaned', lambda s, v: stat_depth(s, v, True)))
                    for name, fn in specs:
                        t = fn(sub, y)
                        if t is not None and np.isfinite(t):
                            out.append(dict(cls=cls, norm=norm, h=h, outcome=outcome,
                                            param=name, t=t))
    return pd.DataFrame(out)


def summarise(c):
    return dict(n=len(c), median_t=c.t.median(), frac_pos=(c.t > 0).mean(),
                n_sig_support=(c.t > 1.96).sum(), n_sig_contra=(c.t < -1.96).sum())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--placebos', type=int, default=25)
    a = ap.parse_args()

    df = build_panel()
    if df.empty:
        print('no data')
        sys.exit(2)
    print(f'panel: {df.pair.nunique()} instruments, {df.date.nunique()} dates, {len(df)} pair-days\n')

    real = curve(df)
    if real.empty:
        print('no specifications resolved')
        sys.exit(2)
    rs = summarise(real)

    print('=' * 72)
    print('REAL SPECIFICATION CURVE   (t > 0 supports "long gamma suppresses")')
    print('=' * 72)
    print(f'  {rs["n"]} specifications')
    print(f'  median t          {rs["median_t"]:+.3f}')
    print(f'  fraction t > 0    {rs["frac_pos"]:.1%}')
    print(f'  significant support   (t > +1.96)  {rs["n_sig_support"]}')
    print(f'  significant contra    (t < -1.96)  {rs["n_sig_contra"]}')

    print('\n  median t by axis:')
    for ax in ['cls', 'param', 'norm', 'h', 'outcome']:
        s = ' · '.join(f'{k}={v:+.2f}' for k, v in real.groupby(ax).t.median().items())
        print(f'    {ax:8} {s}')

    # ---- placebo: decouple the OI reading from the outcome, keep every marginal
    dates_by_pair = {p: sorted(g.date.unique()) for p, g in df.groupby('pair')}
    nmax = min(len(v) for v in dates_by_pair.values())
    shifts = [k for k in range(1, nmax)][:a.placebos]
    print(f'\n  running {len(shifts)} placebo curves (circular shift of the OI reading)...')

    pl = []
    for k in shifts:
        fake = df.copy()
        fake['depth'] = (fake.sort_values(['pair', 'date'])
                             .groupby('pair').depth
                             .transform(lambda s: np.roll(s.values, k)))
        c = curve(fake)
        if not c.empty:
            pl.append(summarise(c))
    pl = pd.DataFrame(pl)

    print('\n' + '=' * 72)
    print('PLACEBO REFERENCE   (same curve, OI reading decoupled from outcome)')
    print('=' * 72)
    for col, label in [('median_t', 'median t'), ('frac_pos', 'fraction t > 0'),
                       ('n_sig_support', 'sig. support count')]:
        v = pl[col]
        real_v = rs[col]
        pct = (v < real_v).mean()
        print(f'  {label:20} real {real_v:+.3f}   placebo mean {v.mean():+.3f} '
              f'[{v.quantile(.05):+.3f}, {v.quantile(.95):+.3f}]   real pctl {pct:.0%}')

    print('\n' + '=' * 72)
    p_med = (pl.median_t.abs() >= abs(rs['median_t'])).mean()
    print('READ THIS AS THE VERDICT')
    print('=' * 72)
    print(f'  {p_med:.0%} of placebo curves produced a median |t| at least as large')
    print(f'  as the real one. Below ~5% would mean the real curve is distinguishable')
    print(f'  from noise. Anything higher means the specification search - INCLUDING')
    print(f'  the index/FX split reported earlier - is consistent with forking paths.')

    p = ROOT / 'analysis' / 'output' / 'gamma_spec_curve.csv'
    p.parent.mkdir(parents=True, exist_ok=True)
    real.sort_values('t').to_csv(p, index=False)
    print(f'\n  full curve written to {p}')


if __name__ == '__main__':
    main()
