"""calendar_test.py - the one genuinely untested lever: scheduled events.

Nothing in this study touched `calendar_events.csv` (102,759 events, 2014-2026,
5,189 of them Major). Scheduled releases are one of the few moments a market is
reliably different, so this asks three things:

1. VOLATILITY   how much does an event move price, and for how long. This one
                is near-certain to show something; it is included because it is
                the input to position sizing, which is where the study
                concluded the real value lies.
2. REVERSAL     does P(the prevailing leg reverses) change around an event?
                Events could either cause turns or cause trends - worth knowing
                which.
3. THE EDGE     does the extension read (the one thing that worked) get better
                or worse near events? That decides whether to lean in or stand
                aside, which is directly actionable.

Event times in `datetime_raw` are UTC (verified: US 08:30 ET releases carry
13:30 stamps in winter).

  python vmcResearch/calendar_test.py --instruments xauusd,eurusd
"""
from __future__ import annotations

import argparse
import os
import sys

import numpy as np
import pandas as pd

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DATA = os.path.join(HERE, 'data')

# Which event currencies matter for which instrument.
RELEVANT = {'xauusd': ('USD',), 'eurusd': ('USD', 'EUR'), 'nq': ('USD',),
            'gbpusd': ('USD', 'GBP')}
HORIZON = 120
TREND_W = 60


def load_events(impact='Major'):
    d = pd.read_csv(os.path.join(ROOT, 'calendar_events.csv'), encoding='latin-1')
    d = d[d.impact == impact].copy()
    d['ts'] = pd.to_datetime(d['datetime_raw'], errors='coerce', utc=True)
    d = d.dropna(subset=['ts'])
    a = pd.to_numeric(d['actual'], errors='coerce')
    c = pd.to_numeric(d['consensus'], errors='coerce')
    # Surprise, scaled by the event's own historical spread so different units
    # (jobs in thousands, CPI in percent) become comparable.
    d['surprise'] = a - c
    d['surprise_z'] = d.groupby('event')['surprise'].transform(
        lambda s: (s - s.mean()) / s.std() if s.std() and s.std() > 0 else np.nan)
    return d


def run(inst, events):
    p = pd.read_parquet(os.path.join(DATA, 'fast_%s.parquet' % inst),
                        columns=['close', 'high', 'low', 'sigma_price', 'tf1_vwap_dist'])
    c = p['close'].to_numpy(float)
    s = p['sigma_price'].to_numpy(float)
    n = len(p)

    ev = events[events.ccy.isin(RELEVANT.get(inst, ('USD',)))]
    pos = p.index.searchsorted(ev['ts'].to_numpy())
    pos = pos[(pos > TREND_W) & (pos < n - HORIZON)]
    pos = np.unique(pos)

    # 1. Volatility profile around the event, in units of a normal 1-min move.
    print('\n%s   %s Major-event stamps matched to bars' % (inst.upper(), format(len(pos), ',')))
    print('  realised move over the next N min, vs a typical N-min move:')
    for w in (5, 15, 30, 60, 120):
        mv = np.abs(c[pos + w] - c[pos]) / (s[pos] * np.sqrt(w))
        allmv = np.abs(c[w:] - c[:-w]) / (s[w:] * np.sqrt(w))
        print('    %3dmin: event %.3f   normal %.3f   ratio %.2fx'
              % (w, np.nanmean(mv), np.nanmean(allmv), np.nanmean(mv) / np.nanmean(allmv)))

    # 2. Reversal rate near events vs away from them.
    prior = np.full(n, np.nan)
    prior[TREND_W:] = (c[TREND_W:] - c[:-TREND_W]) / (s[TREND_W:] * np.sqrt(TREND_W))
    td = np.sign(np.nan_to_num(prior))
    td[np.abs(prior) < 0.5] = 0
    fwd = np.full(n, np.nan)
    fwd[:-HORIZON] = c[HORIZON:] - c[:-HORIZON]
    rev = np.where(td != 0, (np.sign(fwd) != td).astype(float), np.nan)

    near = np.zeros(n, bool)
    for k in pos:
        near[max(0, k - 15):min(n, k + 60)] = True
    ok = np.isfinite(rev)
    print('  P(prevailing leg reverses within 2h):')
    print('    near an event (-15..+60min): %.4f   (n=%s)'
          % (np.nanmean(rev[near & ok]), format(int((near & ok).sum()), ',')))
    print('    away from events           : %.4f   (n=%s)'
          % (np.nanmean(rev[~near & ok]), format(int((~near & ok).sum()), ',')))

    # 3. Does the extension edge survive near events?
    ext = np.abs(p['tf1_vwap_dist'].to_numpy(float))
    for lbl, m in (('near event', near & ok & np.isfinite(ext)),
                   ('away', ~near & ok & np.isfinite(ext))):
        q = pd.qcut(pd.Series(ext[m]), 5, labels=False, duplicates='drop').to_numpy()
        r = rev[m]
        print('    extension edge %-11s Q1 %.4f -> Q5 %.4f   spread %+.4f'
              % (lbl, r[q == 0].mean(), r[q == q.max()].mean(),
                 r[q == q.max()].mean() - r[q == 0].mean()))

    # 4. Does the surprise predict direction over the next hour?
    # Several releases share a timestamp (jobless claims + ongoing claims both
    # at 13:30), so collapse to one surprise per stamp before reindexing.
    sv = events.groupby('ts')['surprise_z'].mean()
    ez = sv.reindex(p.index[pos]).to_numpy()
    m = np.isfinite(ez)
    if m.sum() > 500:
        f60 = (c[pos + 60] - c[pos]) / (s[pos] * np.sqrt(60))
        good = m & np.isfinite(f60)
        r = np.corrcoef(ez[good], f60[good])[0, 1]
        hi = np.abs(ez[good]) > 1.0
        print('  surprise (actual-consensus, z) vs next-60min move:')
        print('    corr %.4f  (n=%s)   |z|>1 subset: mean move %+.4f sigma (n=%s)'
              % (r, format(int(good.sum()), ','),
                 float(np.mean(np.sign(ez[good][hi]) * f60[good][hi])), format(int(hi.sum()), ',')))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--instruments', default='xauusd,eurusd')
    ap.add_argument('--impact', default='Major')
    a = ap.parse_args()
    ev = load_events(a.impact)
    print('%s events: %s   %s -> %s' % (a.impact, format(len(ev), ','),
                                        ev.ts.min().date(), ev.ts.max().date()))
    for i in [s.strip() for s in a.instruments.split(',') if s.strip()]:
        f = os.path.join(DATA, 'fast_%s.parquet' % i)
        if os.path.exists(f):
            run(i, ev)
        else:
            print('  [%s] no fast panel' % i)


if __name__ == '__main__':
    main()
