"""Data for overnight-hold-real-costs.html: the banked overnight-hold trades with every cost component kept separate.

The page picks the financing (none / OANDA model / measured account A or B) and the spread (none / OANDA bid/ask /
the owner's fill bracket) and builds the toolkit CSVs in the browser. Financing per account follows
scripts/cost-verification/rescore.py exactly, so the page's numbers match rescore.json.
Also daily candles (OANDA M1 mid, UTC days, trade window only) for the trade-marker chart, and MFE per trade:
the highest M1 high between entry and exit, the same window and bars that reproduce the stored MAE to 0.005%.
Writes analysis/output/overnight-hold-toolkit/page_trades.json (percentages and prices only: the repo is public).
"""
import json
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'analysis/output/overnight-hold-toolkit/page_trades.json'


def main():
    v = json.loads((ROOT / 'analysis/output/cost-verification/results.json').read_text())
    cells = {(c['instrument'], c['group']): c for c in v['A']['cells'] if c['side'] == 'long'}
    fills = {k: (v['B'][k]['entry']['cost_per_side_bp'] + v['B'][k]['exit']['cost_per_side_bp']) / 100 for k in ('nq', 'gold')}
    dff = pd.read_csv(ROOT / 'analysis/output/overnight-hold/dff.csv', parse_dates=['observation_date']).set_index('observation_date')['DFF']
    dff = dff.reindex(pd.date_range(dff.index.min(), '2026-09-01')).ffill()
    banked = json.loads((ROOT / 'analysis/output/overnight-hold/results.json').read_text())['instruments']
    out = {'built': pd.Timestamp.now().strftime('%Y-%m-%d'), 'fill_round_trip_pct': fills, 'instruments': {}}
    for key in ('nq', 'gold'):
        t = pd.read_csv(ROOT / f'analysis/output/overnight-hold/honest_trades_{key}.csv', parse_dates=['date'])
        is_wed = (t.date.dt.dayofweek == 2).to_numpy()
        fin = {'oanda': t.financing.to_numpy()}
        for grp in ('A', 'B'):
            c = cells.get((key, grp))
            if c is None:
                continue
            days = np.where(is_wed, round(c['wed_multiple']), 1)
            if grp == 'B':
                fin[grp] = (dff.reindex(t.date).to_numpy() + c['implied_markup_pp']) / 365 * days
            else:
                fin[grp] = -c['per_night_pct'] * days
        r = lambda a: [round(float(x), 5) for x in a]
        bh = banked[key]['buy_hold_cfd']
        m1 = pd.read_parquet(ROOT / 'data/m1_bidask' / f'{key}_m1.parquet', columns=['time', 'open', 'high', 'low', 'close'])
        m1 = m1[(m1.time >= t.date.iloc[0] - pd.Timedelta(days=3)) & (m1.time <= pd.Timestamp(t.exitDate.iloc[-1]) + pd.Timedelta(days=3))]
        day = m1.groupby(m1.time.dt.floor('D')).agg(o=('open', 'first'), h=('high', 'max'), l=('low', 'min'), c=('close', 'last'))
        day = day[day.index.dayofweek < 5]   # drop the few-hour Sunday-evening stub bar
        ep = m1.time.astype('datetime64[s]').astype('int64').to_numpy()
        i0, i1 = np.searchsorted(ep, t.entryEpoch.to_numpy()), np.searchsorted(ep, t.exitEpoch.to_numpy() + 60)
        hi, lo = m1.high.to_numpy(), m1.low.to_numpy()
        mfe = [max(0.0, (hi[a:b].max() - p) / p * 100) for a, b, p in zip(i0, i1, t.entryPrice)]
        # The engine stored MAE rounded to 2dp, which can sit just inside the trade's own loss; use the unrounded low,
        # and never less adverse than the close-to-close result.
        mae = np.minimum.reduce([[(lo[a:b].min() - p) / p * 100 for a, b, p in zip(i0, i1, t.entryPrice)], t.grossPct.to_numpy(), np.zeros(len(t))])
        out['instruments'][key] = {
            'entry': t.date.dt.strftime('%Y-%m-%d').tolist(),
            'exit': t.exitDate.tolist(),
            'entry_epoch': t.entryEpoch.astype(int).tolist(), 'exit_epoch': t.exitEpoch.astype(int).tolist(),
            'exit_price': r(t.exitPrice),
            'daily': {'t': [int(x.timestamp()) for x in day.index], **{k: r(day[k]) for k in 'ohlc'}},
            'hold_h': r((t.exitEpoch - t.entryEpoch) / 3600),
            'price': r(t.entryPrice),
            'gross': r(t.grossPct),
            'mae': r(mae),
            'mfe': r(mfe),
            'spread': r(t.spread),
            'fin': {g: r(a) for g, a in fin.items()},
            'bh_cfd_net_cagr': bh['net_cagr'], 'bh_cfd_net_total': bh['net_totalPct'],
        }
        print(key, len(t), {g: round(float(np.mean(a)), 4) for g, a in fin.items()})
    OUT.write_text(json.dumps(out, separators=(',', ':')))
    print(OUT, OUT.stat().st_size // 1024, 'KB')


if __name__ == '__main__':
    main()
