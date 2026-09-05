"""triage.py - apply the execution feasibility gate to the existing systems.

WHY
  Four independent systems in this repo lose money, and all four lose to COSTS
  rather than to signal quality: the vol fade (-0.167 ATR/trade), ConfluenceBot
  (-335 pips over 152 live trades), levelEngine (net R -0.20, positive on 3 of
  243 cells), backtestSystem (-38k). That is not four strategy failures, it is
  one structural problem appearing four times.

  The VWAP-extension work produced the tool that predicts it in advance
  ([[project_execution_feasibility_gate]]): above spread/ATR ~0.15 nothing
  survived, 0 of 30 cells.

THE METRIC, GENERALISED
  spread/ATR was the right unit for a trade sized in ATR. For a strategy with
  its own stop, the equivalent and more direct quantity is

      cost_fraction = round-trip cost / stop distance

  i.e. what share of the risk budget is handed to the broker on every trade. It
  converts straight into a hurdle: with reward:risk R, breakeven win rate is

      w* = (1 + c) / (1 + R)

  so the cost does not just subtract, it RAISES THE BAR the signal must clear.

VERDICT BANDS (from the extension grid, where 0/30 cells above 0.15 survived)
  < 0.05  comfortable      - signal quality is the binding constraint
  0.05-0.15  workable      - viable, but cost is material
  0.15-0.30  hostile       - needs an unusually strong edge
  > 0.30  structurally dead - no signal work will fix it
"""
from __future__ import annotations

import glob
import json
import os
import sys

import numpy as np
import pandas as pd

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

# Round-trip cost in PIPS for FX, price units otherwise.
SPREAD_PIPS = {'EURUSD': 0.6, 'GBPUSD': 0.9, 'USDJPY': 0.7, 'AUDUSD': 0.7,
               'USDCAD': 0.8, 'USDCHF': 0.8, 'EURJPY': 1.0, 'GBPJPY': 1.4,
               'AUDJPY': 1.0, 'EURGBP': 0.8, 'EURAUD': 1.4, 'AUDNZD': 1.6,
               'NZDUSD': 0.9, 'GBPAUD': 2.0, 'GBPNZD': 2.6, 'EURNZD': 2.2,
               'AUDCAD': 1.2, 'AUDCHF': 1.4, 'CADJPY': 1.2, 'CHFJPY': 1.6,
               'EURCAD': 1.4, 'EURCHF': 1.0, 'GBPCAD': 1.8, 'GBPCHF': 1.8,
               'NZDCAD': 1.8, 'NZDJPY': 1.4, 'CADCHF': 1.4,
               # ConfluenceBot's own pip convention, DERIVED from its logs
               # (|entry-sl| / sl_pips): gold pip = 1.0, so a $0.25 spread is
               # 0.25 of ITS pips, not 25. Setting this to 25.0 (pip=$0.01)
               # made gold look structurally dead at cost fraction 2.929 when
               # it is actually 0.029 and the bot's ONLY profitable symbol.
               # This is the gold-pip drift already logged in project memory.
               'XAUUSD': 0.25,
               'GER40': 1.0, 'US30': 2.0, 'NAS100': 1.0}


def band(c):
    if not np.isfinite(c):
        return '?'
    if c < 0.05:
        return 'comfortable'
    if c < 0.15:
        return 'workable'
    if c < 0.30:
        return 'HOSTILE'
    return 'STRUCTURALLY DEAD'


def hurdle(c, rr):
    """Breakeven win rate given cost fraction c and reward:risk rr."""
    return (1.0 + c) / (1.0 + rr)


def confluence_bot():
    """Live trades carry sl_pips and rr - the geometry is directly measurable."""
    rows = []
    for f in glob.glob(os.path.join(ROOT, 'logs', 'confluence_*_trades.csv')):
        try:
            d = pd.read_csv(f)
        except Exception:
            continue
        if 'sl_pips' not in d.columns:
            continue
        d['sym'] = d['symbol'].astype(str).str.upper()
        rows.append(d)
    if not rows:
        return None
    d = pd.concat(rows, ignore_index=True)
    d['sl_pips'] = pd.to_numeric(d.sl_pips, errors='coerce')
    d['rr'] = pd.to_numeric(d.get('rr'), errors='coerce')
    d['pnl_pips'] = pd.to_numeric(d.get('pnl_pips'), errors='coerce')
    d['spread'] = d.sym.map(SPREAD_PIPS)
    d = d.dropna(subset=['sl_pips', 'spread'])
    d = d[d.sl_pips > 0]
    d['cost_frac'] = d.spread / d.sl_pips
    return d


def level_engine():
    """cost_model.py already reports cost relative to the barrier - use it."""
    rows = []
    for f in glob.glob(os.path.join(ROOT, 'levelEngine', '*_cog_base_rate.json')):
        try:
            j = json.load(open(f))
        except Exception:
            continue
        c = j.get('costed_out_of_sample') or j.get('costed_full')
        if not isinstance(c, dict):
            continue
        for lvl, v in c.items():
            if not isinstance(v, dict):
                continue
            cr = v.get('cost_r')
            if cr is None:
                for k in v:
                    if 'cost' in k and isinstance(v[k], (int, float)):
                        cr = v[k]
                        break
            if cr is None:
                continue
            rows.append({'instrument': j.get('instrument'), 'level': lvl,
                         'cost_frac': float(cr),
                         'fade_net_r': v.get('fade_mean_net_r'),
                         'follow_net_r': v.get('follow_mean_net_r')})
    return pd.DataFrame(rows)


def report():
    print('=' * 82)
    print('EXECUTION FEASIBILITY TRIAGE - cost as a share of each trade\'s own risk budget')
    print('=' * 82)
    print('  bands: <0.05 comfortable | 0.05-0.15 workable | 0.15-0.30 HOSTILE | >0.30 DEAD\n')

    d = confluence_bot()
    if d is not None and len(d):
        print('CONFLUENCEBOT  (live trades, %d with measurable geometry)' % len(d))
        print('  %-9s %6s %9s %9s %10s %9s %8s %s'
              % ('symbol', 'n', 'med SL', 'spread', 'cost frac', 'med RR', 'need w*', 'band'))
        for sym, g in d.groupby('sym'):
            if len(g) < 4:
                continue
            cf = float(np.median(g.cost_frac))
            rr = float(np.nanmedian(g.rr)) if g.rr.notna().any() else np.nan
            print('  %-9s %6d %9.1f %9.2f %10.3f %9.2f %8s %s'
                  % (sym, len(g), np.median(g.sl_pips), g.spread.iloc[0], cf, rr,
                     ('%.1f%%' % (100 * hurdle(cf, rr))) if np.isfinite(rr) else '  -  ',
                     band(cf)))
        cf = float(np.median(d.cost_frac))
        rr = float(np.nanmedian(d.rr))
        aw = float((d.pnl_pips > 0).mean())
        print('  %-9s %6d %9.1f %9s %10.3f %9.2f %8.1f%% %s'
              % ('POOLED', len(d), np.median(d.sl_pips), '-', cf, rr, 100 * hurdle(cf, rr), band(cf)))
        print('  actual win rate %.1f%%  vs  required %.1f%%   -> shortfall %.1f pts'
              % (100 * aw, 100 * hurdle(cf, rr), 100 * (hurdle(cf, rr) - aw)))
        print('  total P&L over these trades: %+.1f pips\n' % d.pnl_pips.sum())

    le = level_engine()
    if len(le):
        print('LEVELENGINE  (%d instrument x level cells, cost_r from its own cost model)' % len(le))
        q = le.cost_frac.describe(percentiles=[0.25, 0.5, 0.75])
        print('  cost fraction: median %.3f   p25 %.3f   p75 %.3f' % (q['50%'], q['25%'], q['75%']))
        for lo, hi, lbl in ((0, 0.05, 'comfortable'), (0.05, 0.15, 'workable'),
                            (0.15, 0.30, 'HOSTILE'), (0.30, 99, 'STRUCTURALLY DEAD')):
            g = le[(le.cost_frac >= lo) & (le.cost_frac < hi)]
            if not len(g):
                continue
            nr = pd.to_numeric(g.fade_net_r, errors='coerce')
            print('    %-18s cells %4d (%4.1f%%)   mean fade net R %+.3f   positive %d'
                  % (lbl, len(g), 100 * len(g) / len(le), nr.mean(), int((nr > 0).sum())))
        print()

    print('VOL-FORECAST FADE  (measured directly in this study)')
    print('  stop = 0.5 x HL_75; spread/ATR on 1m: gold 0.565, EURUSD 0.428, NQ 0.296')
    print('  -> cost fraction on the 1m implementation is far above 0.30: STRUCTURALLY DEAD')
    print('  -> same strategy on 15m bars: gold 0.125, EURUSD 0.093, NQ 0.056: workable')
    print('     (but gross edge decays as fast as cost falls - see phase 2)\n')


if __name__ == '__main__':
    report()
