"""cost-verification re-score: the banked overnight-hold trades re-costed with each account group's MEASURED financing.

Prereg: forge/COST_VERIFICATION_PREREG.md §3 "Re-score (descriptive)". Reads results.json from verify.py.
Spread stays OANDA's (part B could not isolate a spread); a sensitivity uses part B's realised fill cost.
Also runs the toolkit replica (FTMO 2-step) on each re-costed net book. Writes rescore.json.
"""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'analysis/output/cost-verification'
sys.path.insert(0, str(ROOT / 'scripts/overnight-hold-toolkit'))
import toolkit as TK  # noqa: E402

SEED = 20261025


def stats(net, years):
    eq = np.cumprod(1 + net / 100)
    dd = (eq / np.maximum.accumulate(eq) - 1).min() * 100
    se = net.std(ddof=1) / np.sqrt(len(net))
    return {'mean_pct': float(net.mean()), 't_iid': float(net.mean() / se), 'cagr': float((eq[-1] ** (1 / years) - 1) * 100),
            'max_dd': float(dd)}


def main():
    v = json.loads((OUT / 'results.json').read_text())
    cells = {(c['instrument'], c['group']): c for c in v['A']['cells'] if c['side'] == 'long'}
    fills = {k: (v['B'][k]['entry']['cost_per_side_bp'] + v['B'][k]['exit']['cost_per_side_bp']) / 100 for k in ('nq', 'gold')}
    dff = pd.read_csv(ROOT / 'analysis/output/overnight-hold/dff.csv', parse_dates=['observation_date']).set_index('observation_date')['DFF']
    dff = dff.reindex(pd.date_range(dff.index.min(), '2026-09-01')).ffill()
    rng = np.random.default_rng(SEED)
    out = {}
    for key in ('nq', 'gold'):
        t = pd.read_csv(ROOT / f'analysis/output/overnight-hold/honest_trades_{key}.csv', parse_dates=['date'])
        years = (pd.Timestamp(t.exitDate.iloc[-1]) - t.date.iloc[0]).days / 365.25
        is_wed = t.date.dt.dayofweek == 2
        books = {'banked (OANDA model)': t.financing.to_numpy()}
        for (k, grp), c in cells.items():
            if k != key:
                continue
            wed = c['wed_multiple'] if c['wed_multiple'] is not None else 1.0
            days = np.where(is_wed, round(wed), 1)
            if grp == 'B':        # rate-linked: DFF of that night + the measured markup
                fin = (dff.reindex(t.date).to_numpy() + c['implied_markup_pp']) / 365 * days
            else:                 # group A is not rate-linked (below Fed funds): measured per-night rate held constant
                fin = -c['per_night_pct'] * days
            books[f'account group {grp} (measured)'] = fin
        res = {}
        for name, fin in books.items():
            net = t.grossPct.to_numpy() - t.spread.to_numpy() - fin
            mae = np.minimum(t.maePct, 0).to_numpy() - t.spread.to_numpy() - fin
            r = {'financing_per_trade_pct': float(np.mean(fin)), **stats(net, years)}
            net_f = t.grossPct.to_numpy() - fills[key] - fin
            r['with_realised_fill_cost'] = {'fill_round_trip_pct': fills[key], **stats(net_f, years)}
            rows = pd.DataFrame({'Date': t.exitDate, 'Return %': net, 'MAE %': mae})
            r['ftmo_funded'] = {str(k): TK.simulate(rows, k, TK.FTMO, rng)['funded'] for k in (0.5, 1, 2)}
            res[name] = r
            print(key, name, {x: round(y, 4) if isinstance(y, float) else y for x, y in r.items() if x != 'with_realised_fill_cost'})
        out[key] = res
    (OUT / 'rescore.json').write_text(json.dumps({'seed': SEED, 'books': out}, indent=1))


if __name__ == '__main__':
    main()
