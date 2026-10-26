"""Shared loaders and event lists for cb-meeting-drift and pre-fomc-drift (M15 closes, UTC)."""
import os
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
UTC, LON, ET = ZoneInfo('UTC'), ZoneInfo('Europe/London'), ZoneInfo('America/New_York')
END = pd.Timestamp('2026-08-21 21:00', tz='UTC')  # lockbox: nothing after the 2026-08-21 session
SEED = 20261026
UNSCHEDULED_FOMC = {'2020-03-03', '2020-03-15'}

M15 = {
    'EURUSD': 'analysis/output/rate-surprise-events/m15/EUR_USD.parquet',  # 2009-11 ->
    'NQ': 'analysis/output/rate-surprise-events/m15/NAS100_USD.parquet',   # 2009-11 ->
    'GBPUSD': 'analysis/output/rates_residual/m15/GBP_USD.parquet',        # 2018-01 ->
    'SPX': 'analysis/output/rates_residual/m15/SPX500_USD.parquet',        # 2018-01 ->
}


def load_m15(key):
    d = pd.read_parquet(os.path.join(ROOT, M15[key]))
    idx = pd.DatetimeIndex(d.index)
    d.index = idx.tz_localize('UTC') if idx.tz is None else idx.tz_convert('UTC')
    d = d[~d.index.duplicated(keep='last')].sort_index()
    return d['close'][d.index <= END]


def px_at_or_before(s, ts, lookback='2h'):
    """Last price KNOWN at ts. Bars are stamped at their open (the FOMC spike lands in the bar stamped at the
    release minute), so a bar stamped t closes at t+15min: use bars stamped <= ts - 15min."""
    ts = ts - pd.Timedelta('15min')
    w = s.loc[ts - pd.Timedelta(lookback): ts]
    return float(w.iloc[-1]) if len(w) else None


def events(name):
    c = pd.read_csv(os.path.join(ROOT, 'calendar_events.csv'), encoding='latin-1', low_memory=False)
    m = c[c.event == name].drop_duplicates(['date', 'event'])
    out = []
    for _, r in m.iterrows():
        if name.startswith('Fed') and r.date in UNSCHEDULED_FOMC:
            continue
        t = pd.Timestamp(r.datetime_raw, tz='UTC')
        out.append((r.date, t))
    return out


def local(date_str, hh, mm, tz):
    d = datetime.strptime(date_str, '%Y-%m-%d')
    return pd.Timestamp(datetime(d.year, d.month, d.day, hh, mm, tzinfo=tz)).tz_convert('UTC')


def add_weekdays(date_str, n):
    d = datetime.strptime(date_str, '%Y-%m-%d')
    step = 0
    while step < abs(n):
        d += timedelta(days=1 if n > 0 else -1)
        if d.weekday() < 5:
            step += 1
    return d.strftime('%Y-%m-%d')


def weekdays(start, end):
    return [d.strftime('%Y-%m-%d') for d in pd.bdate_range(start, end)]


# ---- statistics shared by both studies (defaults from research-protocol stats-defaults) ----
B_BOOT = 2000
B_PLACEBO = 10000
BLOCK = 21


def block_means(vals, rng, B=B_BOOT, block=BLOCK):
    """Moving-block bootstrap of the mean of an overlapping-window series (date order)."""
    v = np.asarray(vals, float)
    n = len(v)
    nb = int(np.ceil(n / block))
    c = np.concatenate([[0.0], np.cumsum(v)])
    bs = c[block:] - c[:-block]
    starts = rng.integers(0, n - block + 1, size=(B, nb))
    return bs[starts].sum(axis=1) / (nb * block)


def cluster_resample(n_clusters, rng, B=B_BOOT):
    return rng.integers(0, n_clusters, size=(B, n_clusters))


def norm_p(est, se):
    from math import erf, sqrt
    z = abs(est / se) if se > 0 else 0.0
    return 2 * (1 - 0.5 * (1 + erf(z / sqrt(2))))


def holm(pvals, alpha=0.05):
    order = sorted(range(len(pvals)), key=lambda i: pvals[i])
    passed = [False] * len(pvals)
    for rank, i in enumerate(order):
        if pvals[i] <= alpha / (len(pvals) - rank):
            passed[i] = True
        else:
            break
    return passed
