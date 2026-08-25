"""
DOES THE GAMMA BAND SPOT SITS IN PREDICT NEXT-DAY REALISED MOVEMENT?

The cleanest possible test of the dealer-gamma thesis, and the one COG's advice
points at: forget levels, forget touches, ask only whether the band spot sits in
today says anything about how much price moves tomorrow.

WHY NOT THE LEVEL TEST. `oi_recon/score_expectations.mjs` asks whether individual
levels reject or break by band. That test drags in a selection effect: spot
usually sits in the long-gamma band, so long-band levels get touched by smaller
moves than short-band ones and the two populations are not comparable. Here there
are no levels and no touches - every pair-day enters the sample exactly once.

THE MECHANISM BEING TESTED.
  LONG gamma  -> dealers sell rallies / buy dips -> movement SUPPRESSED -> pin
  SHORT gamma -> dealers buy rallies / sell dips -> movement AMPLIFIED  -> accelerate

NORMALISATION. Raw range is useless across pairs (gold moves more than EURUSD) and
across time (August is quiet). Two normalisers, and the result must hold on both:
  (a) CVOL  - the CME options market's own annualised IV for that instrument, on
              day D, used to price day D+1. External, not price-derived, and it is
              precisely "what the options market expected". Covers 6 FX + gold.
  (b) ATR20 - trailing daily range, price-derived and cruder, but covers all 11
              instruments including the four indices CVOL does not carry.

CLUSTERING IS THE REAL SAMPLE-SIZE PROBLEM. 26 days x 11 instruments is 286
pair-days but nowhere near 286 independent observations - on a big USD day every
FX pair moves together. The headline test is therefore the DAY-CLUSTERED one:
collapse each date to one long-band mean and one short-band mean, then pair them
across dates. n becomes the number of DATES (~19), which is the honest figure.
The unclustered t-test is printed too, purely to show how much clustering flatters it.

---------------------------------------------------------------------------
PRE-REGISTERED BAR - written before any output was looked at.

  DIRECTIONAL PREDICTION: normalised next-day movement is LOWER in the long-gamma
  band than in the short-gamma band.

  SUPPORTED if: the day-clustered paired test is significant at p < 0.05 with that
                sign, on BOTH normalisers.
  NULL if:      |mean difference| < 0.05 (in normalised units) on both normalisers,
                or the sign disagrees between them.
  INCONCLUSIVE otherwise - which at n~19 dates is the likeliest outcome and is NOT
                a licence to re-cut until something appears.

  A result that holds on one normaliser and not the other is INCONCLUSIVE, not a
  finding. Reporting it as a finding is how the QMR free-hour artifact happened.
---------------------------------------------------------------------------

RESULT - run 2026-08-22 on 26 days x 11 instruments (264 pair-days, 24 dates).
VERDICT: NULL by the pre-registered rule (the sign disagrees between normalisers).

  horizon   metric      long    short    diff     p      n dates
  1d        rng_atr     0.917   0.901   +0.016   0.817     24
  1d        ret_atr     0.541   0.483   +0.058   0.370     24
  1d        rng_cvol    1.331   1.370   -0.040   0.743     18
  1d        ret_cvol    0.716   0.722   -0.006   0.958     18
  2d/3d     - same picture: nothing below p=0.18, ATR arm +ve, CVOL arm -ve.

Not one test reaches significance at any horizon, and the point estimates are
near zero in MAGNITUDE as well as insignificant: 0.9% to 6% relative differences
where a real damping/amplifying mechanism should show tens of percent. Three of
the four headline metrics carry the WRONG sign.

The one non-zero relationship is `corr(depth, normalised range)`, which is
consistently POSITIVE (+0.11 to +0.31, strengthening with horizon) when the thesis
predicts negative - i.e. the deeper spot sits above the flip, the MORE it moves.
That is most likely a trend artifact rather than a contrary finding: a rally
carries spot above a slow-moving flip AND produces large ranges, so depth proxies
recent trend. It is not evidence of an inverse gamma effect and should not be
traded as one.

POWER. n = 16-24 effective dates. This rules out a large effect, not a small one.
It is a null at THIS power - the honest statement is "no effect big enough to
matter is present in a month of data", not "gamma does nothing".

*** RETRACTED 2026-08-23 - see analysis/gamma_spec_curve.py ***
The post-hoc index/FX finding below did NOT survive a specification curve. Run as
one axis among 90 specifications, INDEX sits at median t -0.88 and FX/gold at -1.10:
both lean AGAINST the thesis and neither is distinguishable from the other. It was
one selected cut out of ~70 defensible ones, and it pooled across dates so market
regime confounded the cross-sectional question. Read it as a worked example of
forking paths, not as a result. The text is kept unedited as the record.

POST-HOC (2026-08-22, EXPLORATORY - NOT part of the pre-registered test).
Split by asset class, a prior this repo recorded BEFORE the run (gammaFlow.js:
"folklore-tier edge, partial on FX"). The two classes behave OPPOSITELY:

  corr(signed depth into band, normalised range)      h=1     h=2     h=3
    FX + gold  (7 instruments)                       +0.262  +0.381  +0.373
    INDICES    (4 instruments)                       -0.121  -0.164  -0.217

Indices carry the PREDICTED sign at every horizon and strengthen with it; FX
carries the wrong one. On indices the deepest long-gamma quintile is also the
quietest at all three horizons (0.777 / 1.042 / 1.160, lowest or near-lowest).

This also exposes a MIS-SPECIFICATION in the pre-registered test above. The binary
long/short band lumps "spot sitting AT the flip" together with "spot deep inside
long gamma". Those are opposite states: the flip is the unstable regime boundary
(loudest bucket at every horizon) while deep long gamma is the pinned one
(quietest). Averaging them cancels the effect, which is why the binary test reads
null on FX and reads BACKWARDS on indices (+0.049/+0.110/+0.155, p=0.25/0.04/0.02)
while the continuous measure on the same rows points the other way. Distance to
the flip, signed and continuous, is the right variable - not which side of it.

TREAT AS A HYPOTHESIS, NOT A RESULT. 4 highly-correlated indices, ~20 dates, and
this is the fourth cut of the same 26 days. Everything above is the shape of an
idea worth testing properly, and nothing here should be traded or banked as edge.
The honest test needs (a) far more history than 26 days and (b) intraday
resolution, since dealer hedging acts within the session, not across the daily bar.

SIDE OBSERVATION (not the question asked, but it falls out of the CVOL arm):
realised |return| runs at ~0.72 of the CVOL-implied 1-sigma daily move against a
Brownian expectation of 0.798, and realised range at ~1.35 vs ~1.60. Realised is
running ~10-15% under implied across the window - a visible positive variance
risk premium. That is the quantity `fx-vol-carry-backtest.html` is blocked on,
and unlike the gamma band it has 10 years of history in the parquet.
---------------------------------------------------------------------------

  python analysis/gamma_band_realised.py
  python analysis/gamma_band_realised.py --horizon 2
"""
import argparse, math, sys
from pathlib import Path
import pandas as pd, numpy as np, requests

ROOT = Path(__file__).resolve().parent.parent
BASE = 'https://macrofxmodel-production.up.railway.app'

OANDA = {'EUR/USD': 'EUR_USD', 'GBP/USD': 'GBP_USD', 'USD/JPY': 'USD_JPY',
         'AUD/USD': 'AUD_USD', 'USD/CAD': 'USD_CAD', 'USD/CHF': 'USD_CHF',
         'XAU/USD': 'XAU_USD', 'NAS100_USD': 'NAS100_USD', 'SPX500_USD': 'SPX500_USD',
         'US30_USD': 'US30_USD', 'US2000_USD': 'US2000_USD'}
CVOL = {'EURUSD': 'EUR/USD', 'GBPUSD': 'GBP/USD', 'USDJPY': 'USD/JPY',
        'AUDUSD': 'AUD/USD', 'USDCAD': 'USD/CAD', 'USDCHF': 'USD/CHF',
        'XAUUSD': 'XAU/USD'}
TRADING_DAYS = 252


def load_oi_history():
    r = requests.get(f'{BASE}/api/kv/get', params={'key': 'oi_history'}, timeout=60)
    d = (r.json() or {}).get('data') or {}
    rows = []
    for pair, days in d.items():
        for date, e in (days or {}).items():
            spot, flip, gex = e.get('spot'), e.get('gammaFlip'), e.get('gex')
            if not (isinstance(spot, (int, float)) and spot > 0):
                continue
            band, depth = None, None
            if isinstance(flip, (int, float)) and flip > 0:
                band = 'long' if spot >= flip else 'short'
                depth = (spot - flip) / spot          # signed: +ve = above the flip
            rows.append(dict(pair=pair, date=date, spot=spot, flip=flip, gex=gex,
                             band=band, depth=depth))
    return pd.DataFrame(rows)


def load_candles(pair, start, end):
    r = requests.get(f'{BASE}/api/ohlc-range',
                     params={'symbol': OANDA[pair], 'granularity': 'D',
                             'from': start, 'to': end}, timeout=60)
    vals = (r.json() or {}).get('values') or []
    c = pd.DataFrame([{'date': v['datetime'][:10], 'o': float(v['open']),
                       'h': float(v['high']), 'l': float(v['low']),
                       'c': float(v['close'])} for v in vals])
    return c.sort_values('date').reset_index(drop=True) if len(c) else c


def load_cvol():
    p = ROOT / 'cme_cvol_eod_available_history.parquet'
    if not p.exists():
        return None
    df = pd.read_parquet(p, columns=['timestamp', 'product', 'cvol'])
    df['pair'] = df['product'].map(CVOL)
    df = df.dropna(subset=['pair'])
    df['date'] = df['timestamp'].dt.strftime('%Y-%m-%d')
    return df[['pair', 'date', 'cvol']]


def paired_day_test(df, col):
    """Collapse each date to one long-band mean and one short-band mean, then pair
    across dates. This is the honest test: n = number of dates, not pair-days."""
    g = df.groupby(['date', 'band'])[col].mean().unstack()
    if not {'long', 'short'} <= set(g.columns):
        return None
    g = g.dropna(subset=['long', 'short'])
    if len(g) < 3:
        return None
    d = g['long'] - g['short']
    n, mean, sd = len(d), d.mean(), d.std(ddof=1)
    if not sd > 0:
        return None
    t = mean / (sd / math.sqrt(n))
    try:
        from scipy import stats
        p = 2 * (1 - stats.t.cdf(abs(t), n - 1))
    except Exception:                       # normal approx if scipy is absent
        p = 2 * (1 - 0.5 * (1 + math.erf(abs(t) / math.sqrt(2))))
    return dict(n_dates=n, mean_long=g['long'].mean(), mean_short=g['short'].mean(),
                diff=mean, t=t, p=p)


def welch(df, col):
    a = df[df.band == 'long'][col].dropna()
    b = df[df.band == 'short'][col].dropna()
    if len(a) < 3 or len(b) < 3:
        return None
    va, vb = a.var(ddof=1) / len(a), b.var(ddof=1) / len(b)
    if va + vb <= 0:
        return None
    return dict(n_long=len(a), n_short=len(b), mean_long=a.mean(), mean_short=b.mean(),
                diff=a.mean() - b.mean(), t=(a.mean() - b.mean()) / math.sqrt(va + vb))


def report(df, col, label):
    print(f'\n--- {label}  (metric: {col})')
    sub = df.dropna(subset=[col, 'band'])
    if not len(sub):
        print('  no rows')
        return
    print(f'  instruments {sub.pair.nunique():>3}   pair-days {len(sub):>4}   '
          f'dates {sub.date.nunique():>3}')
    w = welch(sub, col)
    if w:
        print(f'  unclustered : long {w["mean_long"]:.3f} (n={w["n_long"]})  '
              f'short {w["mean_short"]:.3f} (n={w["n_short"]})  '
              f'diff {w["diff"]:+.3f}  t={w["t"]:+.2f}   <- flattered by clustering')
    r = paired_day_test(sub, col)
    if r:
        verdict = ('SUPPORTS' if (r['diff'] < 0 and r['p'] < 0.05) else
                   'CONTRADICTS' if (r['diff'] > 0 and r['p'] < 0.05) else 'no signal')
        print(f'  DAY-PAIRED  : long {r["mean_long"]:.3f}  short {r["mean_short"]:.3f}  '
              f'diff {r["diff"]:+.3f}  t={r["t"]:+.2f}  p={r["p"]:.3f}  '
              f'(n={r["n_dates"]} dates)  -> {verdict}')
        print('                prediction was diff < 0 (long gamma suppresses)')
    else:
        print('  DAY-PAIRED  : too few dates with both bands present')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--horizon', type=int, default=1, help='trading days forward')
    a = ap.parse_args()

    oi = load_oi_history()
    if oi.empty:
        print('oi_history is empty')
        sys.exit(2)
    print(f'oi_history: {oi.pair.nunique()} instruments, {oi.date.nunique()} dates, '
          f'{len(oi)} pair-days')
    nb = int(oi.band.isna().sum())
    if nb:
        print(f'  {nb} pair-days have no gammaFlip and are dropped')

    lo, hi = oi.date.min(), oi.date.max()
    start = (pd.Timestamp(lo) - pd.Timedelta(days=40)).strftime('%Y-%m-%d')
    end = (pd.Timestamp(hi) + pd.Timedelta(days=a.horizon + 6)).strftime('%Y-%m-%d')

    out = []
    for pair in sorted(oi.pair.unique()):
        c = load_candles(pair, start, end)
        if not len(c):
            print(f'  {pair}: no candles')
            continue
        prev = c.c.shift()
        c['tr'] = np.maximum(c.h - c.l, np.maximum((c.h - prev).abs(), (c.l - prev).abs()))
        c['atr20'] = c.tr.rolling(20).mean()
        dates = list(c.date)
        for _, r in oi[oi.pair == pair].iterrows():
            prior = [i for i, d in enumerate(dates) if d <= r.date]
            if not prior:
                continue
            i0 = max(prior)
            i1 = i0 + a.horizon
            if i1 >= len(c):
                continue
            base, atr = c.c.iloc[i0], c.atr20.iloc[i0]
            fwd = c.iloc[i0 + 1:i1 + 1]
            if not len(fwd) or not (base > 0) or not (atr > 0):
                continue
            out.append(dict(pair=pair, date=r.date, band=r.band, depth=r.depth, gex=r.gex,
                            base=base, atr=atr, rng=fwd.h.max() - fwd.l.min(),
                            absret=abs(fwd.c.iloc[-1] - base), fwd_date=c.date.iloc[i1]))

    df = pd.DataFrame(out)
    if df.empty:
        print('no resolvable rows')
        sys.exit(2)

    # (b) ATR-normalised - all instruments
    df['rng_atr'] = df.rng / df.atr
    df['ret_atr'] = df.absret / df.atr

    # (a) CVOL-normalised - the external normaliser, 6 FX + gold
    cv = load_cvol()
    if cv is not None:
        df = df.merge(cv, on=['pair', 'date'], how='left')
        exp_move = df.base * (df.cvol / 100.0) / math.sqrt(TRADING_DAYS) * math.sqrt(a.horizon)
        df['rng_cvol'] = df.rng / exp_move
        df['ret_cvol'] = df.absret / exp_move
    else:
        print('  CVOL parquet not found - ATR arm only')

    print(f'\nresolved {len(df)} pair-days, horizon {a.horizon}d, {df.date.nunique()} dates')
    print('band split: ' + ', '.join(f'{k}={v}' for k, v in df.band.value_counts().items()))

    report(df, 'rng_atr', 'ATR-normalised RANGE - all 11')
    report(df, 'ret_atr', 'ATR-normalised |return| - all 11')
    if 'rng_cvol' in df:
        report(df.dropna(subset=['rng_cvol']), 'rng_cvol', 'CVOL-normalised RANGE - 6 FX + gold')
        report(df.dropna(subset=['ret_cvol']), 'ret_cvol', 'CVOL-normalised |return| - 6 FX + gold')

    # continuous view: does DEPTH into the band matter, not just its sign?
    print('\n--- continuous: signed depth into band vs normalised range')
    for col in [c for c in ['rng_atr', 'rng_cvol'] if c in df]:
        s = df.dropna(subset=[col, 'depth'])
        if len(s) > 10:
            print(f'  corr(depth, {col:8}) = {s.depth.corr(s[col]):+.3f}  (n={len(s)})'
                  f'   prediction: negative (deeper into long gamma = quieter)')

    p = ROOT / 'analysis' / 'output' / 'gamma_band_realised.csv'
    p.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(p, index=False)
    print(f'\nrows written to {p}')


if __name__ == '__main__':
    main()
