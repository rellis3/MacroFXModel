"""levels_pooled.py - section 18 at full power, pooled across instruments.

One instrument gives ~9.8k level touches, which resolves a 1pp effect only to
+/-1.3pp - not enough to call a null a null. Pooling 12 instruments gives
~120k touches and an SE near 0.15pp, which can.

Also carries section 14 (MFE/MAE by state) and section 10 (reversal anatomy),
because all three need the same per-instrument pass over the panels and doing
them separately would mean loading 2GB of parquet three times.
"""
from __future__ import annotations

import os
import sys

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from vmcResearch import events, levels  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, 'data')

INSTRUMENTS = ['eurusd', 'gbpusd', 'usdjpy', 'audusd', 'usdcad', 'usdchf',
               'eurjpy', 'gbpjpy', 'audjpy', 'eurgbp', 'xauusd', 'nq']


def vmc_states(p):
    """The conditioning states, named by the read they are supposed to support."""
    s = {}
    for tf in (5, 15, 60, 240):
        w = p['tf%d_wt1' % tf].to_numpy(float)
        sp = p['tf%d_wt_spread' % tf].to_numpy(float)
        mf = p['tf%d_mf' % tf].to_numpy(float)
        mfs = p['tf%d_mf_slope' % tf].to_numpy(float)
        vw = p['tf%d_vwap_dist' % tf].to_numpy(float)
        reg = p['tf%d_div_regular' % tf].to_numpy(float)
        s['tf%d_bull' % tf] = (w > 0) & (sp > 0)
        s['tf%d_bear' % tf] = (w < 0) & (sp < 0)
        s['tf%d_OB' % tf] = w >= 53
        s['tf%d_OS' % tf] = w <= -53
        s['tf%d_mf_pos' % tf] = mf > 0
        s['tf%d_mf_rising' % tf] = mfs > 0
        s['tf%d_extended_vwap' % tf] = np.abs(vw) > 2.0
        s['tf%d_div_bear' % tf] = reg < 0
        s['tf%d_div_bull' % tf] = reg > 0
    b = {tf: ((p['tf%d_wt1' % tf].to_numpy(float) > 0) &
              (p['tf%d_wt_spread' % tf].to_numpy(float) > 0)).astype(int) -
         ((p['tf%d_wt1' % tf].to_numpy(float) < 0) &
          (p['tf%d_wt_spread' % tf].to_numpy(float) < 0)).astype(int) for tf in (5, 15, 60, 240)}
    nb = sum((b[tf] > 0).astype(int) for tf in (5, 15, 60, 240))
    ns = sum((b[tf] < 0).astype(int) for tf in (5, 15, 60, 240))
    for k in range(5):
        s['mtf_bull_%d' % k] = nb == k
        s['mtf_bear_%d' % k] = ns == k
    # The brief's explicit "reversal confluence" stack at a resistance test.
    s['stack_bear_conf'] = (p['tf240_wt1'].to_numpy(float) > 0) & \
                           (p['tf60_wt1_slope'].to_numpy(float) < 0) & \
                           (p['tf15_div_regular'].to_numpy(float) < 0) & \
                           (p['tf5_wt_spread'].to_numpy(float) < 0) & \
                           (p['tf60_mf_slope'].to_numpy(float) < 0)
    s['stack_bull_cont'] = (p['tf240_wt1'].to_numpy(float) > 0) & \
                           (p['tf60_wt1'].to_numpy(float) > 0) & \
                           (p['tf15_wt1'].to_numpy(float) > 0) & \
                           (p['tf60_mf'].to_numpy(float) > 0)
    return s


def run():
    rows_touch, rows_path, rows_rev = [], [], []
    for inst in INSTRUMENTS:
        f = os.path.join(DATA, 'panel_%s.parquet' % inst)
        if not os.path.exists(f):
            continue
        p = events.add_events(pd.read_parquet(f))
        st = vmc_states(p)

        # -- section 18: level touches ---------------------------------------
        tt = levels.all_touches(p)
        mask = np.zeros(len(p), bool)
        out = np.zeros(len(p), np.int8)
        kind = np.zeros(len(p), np.int8)      # +1 resistance, -1 support
        for name, (t, o, is_res) in tt.items():
            mask |= t
            np.putmask(out, t, o)
            np.putmask(kind, t, np.int8(1 if is_res else -1))
        idx = np.where(mask & (out != 0))[0]
        bo = (out[idx] == 1).astype(float)
        rows_touch.append({'instrument': inst, 'state': 'ALL', 'n': len(idx),
                           'p_breakout': bo.mean(), 'is_res': 0})
        for lbl, m in st.items():
            mm = m[idx]
            if mm.sum() >= 100:
                rows_touch.append({'instrument': inst, 'state': lbl, 'n': int(mm.sum()),
                                   'p_breakout': float(bo[mm].mean()), 'is_res': 0})

        # -- section 14: MFE / MAE by state ----------------------------------
        td = p['trend_dir'].to_numpy()
        for h in (20, 48):
            mfe = p['mfe_%d' % h].to_numpy(float)
            mae = p['mae_%d' % h].to_numpy(float)
            # Re-express in the direction of the prevailing leg, so "favourable"
            # means "the move continued" rather than "price went up".
            fav = np.where(td > 0, mfe, -mae)
            adv = np.where(td > 0, mae, -mfe)
            for lbl, m in st.items():
                mm = m & np.isfinite(fav) & np.isfinite(adv)
                if mm.sum() < 2000:
                    continue
                rows_path.append({'instrument': inst, 'state': lbl, 'h': h,
                                  'n': int(mm.sum()),
                                  'mfe': float(np.mean(fav[mm])),
                                  'mae': float(np.mean(adv[mm])),
                                  'ratio': float(np.mean(fav[mm]) / abs(np.mean(adv[mm])))
                                  if np.mean(adv[mm]) != 0 else np.nan,
                                  't_mfe': float(np.nanmean(p['t_mfe_%d' % h].to_numpy(float)[mm]))})
            base = np.isfinite(fav) & np.isfinite(adv)
            rows_path.append({'instrument': inst, 'state': 'ALL', 'h': h,
                              'n': int(base.sum()), 'mfe': float(np.mean(fav[base])),
                              'mae': float(np.mean(adv[base])),
                              'ratio': float(np.mean(fav[base]) / abs(np.mean(adv[base]))),
                              't_mfe': float(np.nanmean(p['t_mfe_%d' % h].to_numpy(float)[base]))})

        # -- section 10: what distinguished a real reversal ------------------
        r48 = p['resolve_48'].to_numpy()
        ph = p['phase'].to_numpy()
        interesting = (ph == 1) | (ph == 2)          # impulse or pullback
        for lbl, m in st.items():
            for res, nm in ((-1, 'reversal'), (1, 'continuation')):
                mm = interesting & (r48 == res)
                if mm.sum() < 1000:
                    continue
                rows_rev.append({'instrument': inst, 'state': lbl, 'outcome': nm,
                                 'n': int(mm.sum()), 'share': float(m[mm].mean())})
        print('  [%s] touches=%d' % (inst, len(idx)), flush=True)

    pd.DataFrame(rows_touch).to_parquet(os.path.join(DATA, 'pooled_touch.parquet'))
    pd.DataFrame(rows_path).to_parquet(os.path.join(DATA, 'pooled_path.parquet'))
    pd.DataFrame(rows_rev).to_parquet(os.path.join(DATA, 'pooled_rev.parquet'))
    print('written pooled_touch / pooled_path / pooled_rev')


if __name__ == '__main__':
    run()
