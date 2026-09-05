"""vol_overlay.py - does VuManChu improve the Vol Forecast fade at its touch points?

This is the ONE use case the main study left open. Every VuManChu edge found
was smaller than the spread, which kills it as a signal generator - but the Vol
Forecaster is already:

  * fading an extension (the exhaustion setup the divergence finding lives in)
  * entering on a LIMIT at open +/- HL_75 (a passive fill, no spread crossed)
  * paying its costs regardless

So consulting VuManChu at the touch is free. It only has to move the hit rate.

FAITHFUL TO THE HOST STRATEGY
-----------------------------
Forecast levels reproduce `VolRangeForecaster/vol_backtest.py` exactly:
sigma_d from EWMA(0.94) of log returns to T-1, HL_75 = 2.049 * corr * sigma_d,
OC_median = 0.6745 * corr * sigma_d, RANGE/fade_both geometry (TP = open,
SL = open +/- HL_75 * sl_mult), first fill only.

ONE DELIBERATE IMPROVEMENT
--------------------------
The daily simulator checks `high >= sl` BEFORE `low <= tp`, so a day touching
both is scored a loss. That is a conservative daily-bar approximation. This
walks the actual M1 path and resolves which came FIRST, which is what really
happened. Baseline numbers here will therefore differ slightly from the daily
backtest - the difference is the approximation being removed, not a change of
strategy.

  python vmcResearch/vol_overlay.py --instruments eurusd
"""
from __future__ import annotations

import argparse
import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from vmcResearch.panel import load_m1  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, 'data')

EWMA_LAMBDA = 0.94
BM_RANGE_P75 = 2.049
HALFNORM_P50 = 0.6745
CORR = {'fx': {'hl': 0.894, 'oc': 0.948},
        'commodity': {'hl': 0.989, 'oc': 1.163},
        'index': {'hl': 0.950, 'oc': 1.111}}
ASSET = {'xauusd': 'commodity', 'nq': 'index'}
SL_MULT = 1.5
MIN_LOOKBACK = 50


def ewma_var(log_ret, lam=EWMA_LAMBDA):
    v = float(np.var(log_ret[:min(20, len(log_ret))]))
    if v == 0:
        v = float(log_ret[0] ** 2) or 1e-10
    for r in log_ret:
        v = lam * v + (1.0 - lam) * r * r
    return v


def run(instrument, verbose=True):
    m1 = load_m1(instrument)
    ac = ASSET.get(instrument, 'fx')
    corr = CORR[ac]

    d1 = m1.resample('1D').agg({'open': 'first', 'high': 'max',
                                'low': 'min', 'close': 'last'}).dropna()
    closes = d1['close'].to_numpy(float)
    opens = d1['open'].to_numpy(float)
    days = d1.index

    # VuManChu state on the M1 grid, from the fast panel.
    fp = os.path.join(DATA, 'fast_%s.parquet' % instrument)
    if not os.path.exists(fp):
        raise SystemExit('missing %s - run fast_panel.py --instruments %s' % (fp, instrument))
    keep = ['tf1_div_vwap_n3_reg', 'tf1_div_vwap_n5_reg', 'tf1_div_wt_n3_reg',
            'tf15_wt1', 'tf1_wt_spread', 'tf1_wt1', 'hour']
    vmc = pd.read_parquet(fp, columns=keep)
    LIVE = [c + '_live' for c in ('tf1_div_vwap_n3_reg', 'tf1_div_vwap_n5_reg', 'tf1_div_wt_n3_reg')]

    # A divergence fires on ~3% of minutes, so demanding one at the EXACT fill
    # minute leaves ~16 of 539 trades - untestable. A trader does not require
    # that either; the read is "was there a divergence on the approach". So each
    # divergence is held forward for LOOKBACK minutes and the fill asks whether
    # one is still live.
    LOOKBACK = 60
    for c in ('tf1_div_vwap_n3_reg', 'tf1_div_vwap_n5_reg', 'tf1_div_wt_n3_reg'):
        s = pd.Series(np.sign(np.nan_to_num(vmc[c].to_numpy(float))))
        s = s.replace(0.0, np.nan).ffill(limit=LOOKBACK).fillna(0.0)
        vmc[c + '_live'] = s.to_numpy()

    m1i = m1.index
    hi = m1['high'].to_numpy(float)
    lo = m1['low'].to_numpy(float)
    day_of = m1i.normalize()

    # Row ranges per day, so each day's path is a contiguous slice.
    starts = np.searchsorted(day_of, days, side='left')
    ends = np.searchsorted(day_of, days, side='right')

    recs = []
    for i in range(MIN_LOOKBACK, len(d1)):
        lr = np.log(closes[1:i] / closes[:i - 1])
        if len(lr) < 20:
            continue
        sigma_d = np.sqrt(ewma_var(lr))
        hl75_pct = BM_RANGE_P75 * corr['hl'] * sigma_d * 100.0
        o = opens[i]
        hl_d = o * hl75_pct / 100.0
        if not np.isfinite(hl_d) or hl_d <= 0:
            continue

        up_entry, dn_entry = o + hl_d, o - hl_d
        s, e = starts[i], ends[i]
        if e - s < 30:
            continue
        dh, dl = hi[s:e], lo[s:e]

        # First fill of either side (RANGE / fade_both, first fill only).
        up_hit = np.where(dh >= up_entry)[0]
        dn_hit = np.where(dl <= dn_entry)[0]
        fu = up_hit[0] if up_hit.size else 10**9
        fd = dn_hit[0] if dn_hit.size else 10**9
        if fu == fd:
            continue                      # same bar both sides: unresolvable
        if fu < fd:
            side, entry, k = 'SELL', up_entry, fu
            tp, sl = o, o + hl_d * SL_MULT
        else:
            side, entry, k = 'BUY', dn_entry, fd
            tp, sl = o, o - hl_d * SL_MULT

        # Resolve TP vs SL on the ACTUAL forward path, in true order.
        ph, pl = dh[k + 1:], dl[k + 1:]
        if side == 'SELL':
            t_tp = np.where(pl <= tp)[0]
            t_sl = np.where(ph >= sl)[0]
        else:
            t_tp = np.where(ph >= tp)[0]
            t_sl = np.where(pl <= sl)[0]
        a = t_tp[0] if t_tp.size else 10**9
        b = t_sl[0] if t_sl.size else 10**9
        if a == b == 10**9:
            # Neither barrier touched by end of day: mark to the close, exactly
            # as the host does. Dropping these instead of marking them removes
            # most of the strategy's P&L - they are the small reverting winners.
            outcome = 'open'
            eod = closes[i]
            pnl = ((entry - eod) if side == 'SELL' else (eod - entry)) / o * 100.0
        elif a < b:
            outcome = 'win'
            pnl = abs(entry - tp) / o * 100.0
        else:
            outcome = 'loss'
            pnl = -abs(sl - entry) / o * 100.0

        recs.append({'date': days[i], 'fill_idx': s + k, 'side': side,
                     'outcome': outcome, 'pnl_pct': pnl,
                     'r': pnl / (abs(entry - tp) / o * 100.0) if entry != tp else 0.0})

    t = pd.DataFrame(recs)
    if t.empty:
        raise SystemExit('no trades')

    # Attach the VuManChu state at the exact fill minute.
    v = vmc.iloc[t['fill_idx'].to_numpy()].reset_index(drop=True)
    for c in keep + LIVE:
        t[c] = v[c].to_numpy()
    t['instrument'] = instrument
    t.to_parquet(os.path.join(DATA, 'overlay_%s.parquet' % instrument))
    if verbose:
        print('  [%s] %d trades  %s -> %s' % (instrument, len(t), t.date.min().date(), t.date.max().date()), flush=True)
    return t


def report(t, instrument):
    # Fade direction: SELL wants bearish confirmation (-1), BUY wants bullish (+1).
    want = np.where(t['side'].to_numpy() == 'SELL', -1, 1)
    pnl = t['pnl_pct'].to_numpy()
    # Every filled trade counts, including end-of-day marks. "win" here means
    # a positive outcome, not specifically a TP touch.
    win = pnl > 0
    resolved = np.ones(len(t), bool)

    def line(lbl, m):
        m = m & resolved
        n = int(m.sum())
        if n < 60:
            return
        wr = 100.0 * win[m].sum() / n
        exp = float(np.mean(pnl[m]))
        tot = float(np.sum(pnl[m]))
        gp = pnl[m][pnl[m] > 0].sum()
        gl = -pnl[m][pnl[m] < 0].sum()
        pf = gp / gl if gl > 0 else np.nan
        print('  %-38s %6d %8.1f%% %10.4f %8.2f %9.1f' % (lbl, n, wr, exp, pf, tot))

    print('\n%s  -  VuManChu as a FILTER on the vol-forecast fade' % instrument.upper())
    print('  %-38s %6s %8s %10s %8s %9s' % ('filter', 'n', 'win%', 'exp %/trade', 'PF', 'total %'))
    line('ALL TRADES (baseline)', np.ones(len(t), bool))

    for col, nm in (('tf1_div_vwap_n3_reg_live', '1m VWAP div n3 (60m)'),
                    ('tf1_div_vwap_n5_reg_live', '1m VWAP div n5 (60m)'),
                    ('tf1_div_wt_n3_reg_live', '1m WT div n3 (60m)')):
        d = np.sign(np.nan_to_num(t[col].to_numpy(float)))
        line('+ %s AGREES' % nm, d == want)
        line('- %s OPPOSES' % nm, (d == -want) & (d != 0))

    wt15 = t['tf15_wt1'].to_numpy(float)
    line('+ M15 OB/OS agrees', ((wt15 >= 53) & (want < 0)) | ((wt15 <= -53) & (want > 0)))
    line('- M15 OB/OS opposes', ((wt15 <= -53) & (want < 0)) | ((wt15 >= 53) & (want > 0)))

    sp = t['tf1_wt_spread'].to_numpy(float)
    line('+ 1m WT cross agrees (control)', np.sign(sp) == want)
    h = t['hour'].to_numpy(float)
    line('+ late NY fill (17-24 UTC)', h >= 17)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--instruments', default='eurusd')
    a = ap.parse_args()
    for inst in [s.strip() for s in a.instruments.split(',') if s.strip()]:
        t = run(inst)
        report(t, inst)


if __name__ == '__main__':
    main()
