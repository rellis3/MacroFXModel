"""zone_backtest.py - is ConfluenceBot's M30 zone engine actually worse than H4?

WHY THIS EXISTS
  152 live trades showed M30 losing in both halves of the sample (-275 then
  -105 pips) while H4 and RT flipped sign. That is the only stable finding the
  live log can support - everything else I sliced out of 152 trades was
  indistinguishable from search noise. The question needs thousands of trades,
  and ten years of M1 is sitting right there.

WHAT THIS IS, AND IS NOT
  IS:  the bot's REAL zone engine. `modules/level_matrix.py` is pure (no MT5,
       no network, only dataclasses), so `build_level_matrix` is driven here
       with historical bars exactly as the live bot drives it, and the trade is
       anchored on the zone's own `swing_origin` (SL) and `swing_end` (TP) -
       the bot's own "structure-anchored SL, level-to-level TP" geometry.

  IS NOT: the full live bot. `score_zones` needs VolumeProfile / SessionLevels /
       HTFBias objects, and the live entry additionally requires an M5 VuManChu
       exhaustion confirmation plus session and risk filters. None of that is
       here. So this measures THE ZONE ENGINE IN ISOLATION, which is precisely
       the M30-vs-H4 question, and it deliberately leaves out the VuManChu
       confirmation whose value this whole programme has already found to be
       ~nil.

  Read the output as "do M30 zones locate worse trade locations than H4 zones",
  not as "this is what the bot would have made".
"""
from __future__ import annotations

import os
import sys

import numpy as np
import pandas as pd

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)
sys.path.insert(0, os.path.join(ROOT, 'ConfluenceBot'))

from modules.level_matrix import build_level_matrix  # noqa: E402
from vmcResearch.panel import load_m1, resample  # noqa: E402

# Instrument scale, matching what the live bot resolves from pylego.
SCALE = {'eurusd': (1e-4, 5), 'gbpusd': (1e-4, 5), 'usdjpy': (1e-2, 3),
         'audusd': (1e-4, 5), 'usdchf': (1e-4, 5), 'usdcad': (1e-4, 5),
         'eurjpy': (1e-2, 3), 'gbpjpy': (1e-2, 3), 'xauusd': (1.0, 2),
         'nq': (1.0, 2)}
SPREAD = {'eurusd': 0.6, 'gbpusd': 0.9, 'usdjpy': 0.7, 'audusd': 0.7,
          'usdchf': 0.8, 'usdcad': 0.8, 'eurjpy': 1.0, 'gbpjpy': 1.4,
          'xauusd': 0.25, 'nq': 1.0}

REBUILD_EVERY = 4 * 60      # minutes between zone rebuilds
LOOKBACK_BARS = 400         # trailing bars fed to the engine per TF
MAX_HOLD = 48 * 60          # minutes before a trade is abandoned
TIGHT_PIPS = 8.0            # the live bot's median stop, for the width comparison


def run(inst, tfs=('M30', 'H4'), years=None, verbose=True):
    pip, digits = SCALE[inst]
    m1 = load_m1(inst)
    if years:
        m1 = m1[m1.index >= m1.index[-1] - pd.Timedelta(days=365 * years)]
    bars_tf = {'M30': resample(m1, 30), 'H4': resample(m1, 240)}

    h = m1['high'].to_numpy(float)
    l = m1['low'].to_numpy(float)
    c = m1['close'].to_numpy(float)
    idx = m1.index
    n = len(c)

    def to_dicts(df, end_ts, k=LOOKBACK_BARS):
        sub = df[df.index <= end_ts]
        if len(sub) < 60:
            return []
        sub = sub.iloc[-k:]
        return [{'time': int(t.timestamp()), 'open': float(o), 'high': float(hh),
                 'low': float(ll), 'close': float(cc)}
                for t, o, hh, ll, cc in zip(sub.index, sub['open'], sub['high'],
                                            sub['low'], sub['close'])]

    trades = []
    step = REBUILD_EVERY
    for i in range(LOOKBACK_BARS * 30, n - MAX_HOLD, step):
        ts = idx[i]
        price = c[i]
        for tf in tfs:
            bars = to_dicts(bars_tf[tf], ts)
            if not bars:
                continue
            try:
                # cluster_tolerance is in PRICE UNITS and the live bot scales
                # it: cfg['cluster_tolerance'](=3.0 pips) * instr.pip. Passing
                # the raw 3.0 default made EURUSD zones 7,575 pips wide and
                # produced zero valid trades - the exact pip bug this bot's own
                # docstring warns about.
                zones, _ = build_level_matrix({tf: bars}, price, pip=pip, digits=digits,
                                              cluster_tolerance=3.0 * pip)
            except Exception:
                continue
            for z in zones:
                if not z.active or z.swing_origin == 0.0 or z.swing_end == 0.0:
                    continue
                lo, hi = min(z.gp_low, z.gp_high), max(z.gp_low, z.gp_high)
                # Only zones price has NOT yet reached - a zone already touched
                # is not a forward trade.
                if lo <= price <= hi:
                    continue
                fh, fl = h[i + 1:i + MAX_HOLD], l[i + 1:i + MAX_HOLD]
                if fh.size < 10:
                    continue
                touch = np.where((fl <= hi) & (fh >= lo))[0]
                if not touch.size:
                    continue
                e = i + 1 + int(touch[0])
                entry = float(np.clip(c[e], lo, hi))
                sl, tp = float(z.swing_origin), float(z.swing_end)
                long_ = z.direction == 'long'
                if (long_ and not (sl < entry < tp)) or ((not long_) and not (tp < entry < sl)):
                    continue
                risk = abs(entry - sl)
                if risk <= 0:
                    continue
                ph, pl = h[e + 1:i + MAX_HOLD], l[e + 1:i + MAX_HOLD]
                if ph.size < 5:
                    continue
                def resolve(stop_px):
                    """Same zone, same target - only the stop width differs."""
                    rk = abs(entry - stop_px)
                    if rk <= 0:
                        return None
                    if long_:
                        aa = np.where(ph >= tp)[0]
                        bb = np.where(pl <= stop_px)[0]
                    else:
                        aa = np.where(pl <= tp)[0]
                        bb = np.where(ph >= stop_px)[0]
                    A_ = aa[0] if aa.size else 10**9
                    B_ = bb[0] if bb.size else 10**9
                    if A_ == B_ == 10**9:
                        px = c[i + MAX_HOLD - 1]
                        return (((px - entry) if long_ else (entry - px)) / rk, 'timeout', rk)
                    if A_ < B_:
                        return (abs(tp - entry) / rk, 'tp', rk)
                    return (-1.0, 'sl', rk)

                # The LIVE bot does NOT use the zone's structural invalidation.
                # Its logs show sl_basis='confirm_swing' with a median stop near
                # 8 pips where the structure implies ~46 - a 5x tighter stop.
                # Resolving both on identical zones isolates the stop WIDTH.
                res_struct = resolve(sl)
                res_tight = resolve(entry - (TIGHT_PIPS * pip if long_ else -TIGHT_PIPS * pip))
                if res_struct is None or res_tight is None:
                    continue
                r, out, risk = res_struct
                rt, outt, riskt = res_tight
                trades.append({'instrument': inst, 'tf': tf, 'time': idx[e],
                               'direction': z.direction, 'in_gp': bool(z.in_gp),
                               'legs': len(z.legs),
                               'r': r, 'outcome': out, 'risk_pips': risk / pip,
                               'cost_r': SPREAD[inst] / (risk / pip),
                               'r_tight': rt, 'outcome_tight': outt,
                               'cost_r_tight': SPREAD[inst] / (riskt / pip)})
        if verbose and i % (step * 500) == 0:
            print('    %s %s  trades=%d' % (inst, str(idx[i])[:10], len(trades)), flush=True)

    d = pd.DataFrame(trades)
    if len(d):
        # Charge the spread once per round trip, in R.
        d['r_net'] = d['r'] - d['cost_r']
        d['r_net_tight'] = d['r_tight'] - d['cost_r_tight']
        d = d.drop_duplicates(subset=['tf', 'time', 'direction'])
    return d


if __name__ == '__main__':
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument('--instruments', default='eurusd,gbpusd,xauusd')
    ap.add_argument('--years', type=int, default=4)
    a = ap.parse_args()
    allt = []
    for inst in [s.strip() for s in a.instruments.split(',') if s.strip()]:
        print('[%s]' % inst, flush=True)
        d = run(inst, years=a.years)
        if len(d):
            allt.append(d)
            print('  %s trades' % format(len(d), ','), flush=True)
    t = pd.concat(allt, ignore_index=True)
    t.to_parquet(os.path.join(HERE, 'data', 'zone_backtest.parquet'))
    print('\nZONE ENGINE ONLY (no score filter, no VuManChu confirm, no session filter)')
    print('%-9s %-5s %8s %10s %10s %8s %9s' % ('inst', 'tf', 'n', 'mean R', 'net R', 'win%', 'total R'))
    for (inst, tf), g in t.groupby(['instrument', 'tf']):
        print('%-9s %-5s %8s %10.4f %10.4f %7.1f%% %+9.1f'
              % (inst, tf, format(len(g), ','), g.r.mean(), g.r_net.mean(),
                 100 * (g.r > 0).mean(), g.r_net.sum()))
    print('\nPOOLED BY TIMEFRAME - the question the live log could not answer')
    for tf, g in t.groupby('tf'):
        h = len(g) // 2
        gs = g.sort_values('time')
        print('  %-5s n=%s  net R/trade %+.4f  win %.1f%%  |  1st half %+.4f  2nd half %+.4f'
              % (tf, format(len(g), ','), g.r_net.mean(), 100 * (g.r > 0).mean(),
                 gs.r_net.iloc[:h].mean(), gs.r_net.iloc[h:].mean()))
