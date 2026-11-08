"""Add the scored FX legs (overnight-hold-fx) to analysis/output/overnight-hold-toolkit/page_trades.json, in the same
layout build_page_data.py writes for NAS100/gold, so overnight-hold-real-costs.html shows all four books.

NAS100 and gold are left exactly as they are. FX has one financing option, the OANDA model of the study
(negative = credit); the owner's accounts were not measured on FX. MAE/MFE and daily candles are built the same way
as build_page_data.py, from the mid bars in the OANDA M1 bid/ask file.
Usage: python scripts/overnight-hold-fx/build_page_data.py   (after honest.py)
"""
import json
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
PAGE = ROOT / 'analysis/output/overnight-hold-toolkit/page_trades.json'
FX = ROOT / 'analysis/output/overnight-hold-fx'


def main():
    out = json.loads(PAGE.read_text())
    res = json.loads((FX / 'results.json').read_text())['instruments']
    r = lambda a: [round(float(x), 5) for x in a]
    for key in ('gbpusd', 'usdjpy'):
        t = pd.read_csv(FX / f'honest_trades_{key}.csv', parse_dates=['date'])
        m1 = pd.read_parquet(ROOT / 'data/m1_bidask' / f'{key}_m1.parquet', columns=['time', 'open', 'high', 'low', 'close'])
        m1 = m1.rename(columns={'open': 'o', 'high': 'h', 'low': 'l', 'close': 'c'})
        m1 = m1[(m1.time >= t.date.iloc[0] - pd.Timedelta(days=3)) & (m1.time <= pd.Timestamp(t.exitDate.iloc[-1]) + pd.Timedelta(days=3))]
        day = m1.groupby(m1.time.dt.floor('D')).agg(o=('o', 'first'), h=('h', 'max'), l=('l', 'min'), c=('c', 'last'))
        day = day[day.index.dayofweek < 5]
        ep = m1.time.astype('datetime64[s]').astype('int64').to_numpy()
        i0, i1 = np.searchsorted(ep, t.entryEpoch.to_numpy()), np.searchsorted(ep, t.exitEpoch.to_numpy() + 60)
        hi, lo = m1.h.to_numpy(), m1.l.to_numpy()
        mfe = [max(0.0, (hi[a:b].max() - p) / p * 100) if b > a else 0.0 for a, b, p in zip(i0, i1, t.entryPrice)]
        mae = np.minimum.reduce([[(lo[a:b].min() - p) / p * 100 if b > a else 0.0 for a, b, p in zip(i0, i1, t.entryPrice)],
                                 t.grossPct.to_numpy(), np.zeros(len(t))])
        bh = res[key]['buy_hold_cfd']
        out['instruments'][key] = {
            'entry': t.date.dt.strftime('%Y-%m-%d').tolist(), 'exit': t.exitDate.tolist(),
            'entry_epoch': t.entryEpoch.astype(int).tolist(), 'exit_epoch': t.exitEpoch.astype(int).tolist(),
            'exit_price': r(t.exitPrice),
            'daily': {'t': [int(x.timestamp()) for x in day.index], **{k: r(day[k]) for k in 'ohlc'}},
            'hold_h': r((t.exitEpoch - t.entryEpoch) / 3600), 'price': r(t.entryPrice),
            'gross': r(t.grossPct), 'mae': r(mae), 'mfe': r(mfe), 'spread': r(t.spread),
            'fin': {'oanda': r(t.financing)},
            'bh_cfd_net_cagr': bh['net_cagr'], 'bh_cfd_net_total': bh['net_totalPct'],
            'verdict': res[key]['verdict'],
        }
        print(key, len(t), 'MAE mean', round(float(np.mean(mae)), 3), 'financing mean', round(float(t.financing.mean()), 5))
    PAGE.write_text(json.dumps(out, separators=(',', ':')))
    print(PAGE, PAGE.stat().st_size // 1024, 'KB')


if __name__ == '__main__':
    main()
