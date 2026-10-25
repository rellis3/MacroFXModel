"""cost-verification parts A (swaps) and B (fills) from the owner's live Trade History.

Prereg: forge/COST_VERIFICATION_PREREG.md. Usage:
    python scripts/cost-verification/verify.py [--fetch]
--fetch pulls /api/trade-history (read-only GET, 90-day chunks) into analysis/output/cost-verification/trades.json
(gitignored: it carries account P&L and the repo is public);
without it the saved file is used. Writes results.json and cost_table.json next to it.
"""
import argparse
import json
import urllib.request
from datetime import date, timedelta
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'analysis/output/cost-verification'
API = 'https://macrofxmodel-production.up.railway.app/api/trade-history'
SEED = 20261025
B = 10000
SYMS = {'US100': 'nq', 'XAUUSD': 'gold'}
# our overnight-hold model (forge/OVERNIGHT_HOLD_PREREG.md): markup over DFF, financing days on a Wednesday rollover
MODEL = {'nq': dict(markup=2.51, wed_days=1), 'gold': dict(markup=1.44, wed_days=3)}
# OANDA half-spread charged per side in the overnight-hold re-score (analysis/output/overnight-hold/RESULTS.md)
OANDA_SPREAD_PER_TRADE = {'nq': 0.0068, 'gold': 0.0225}   # % per round trip


def fetch():
    out, d, end = [], date(2026, 3, 1), date.today()
    while d <= end:
        e = min(d + timedelta(days=89), end)
        with urllib.request.urlopen(f'{API}?from={d}&to={e}', timeout=120) as r:
            out += json.loads(r.read()).get('trades', [])
        d = e + timedelta(days=1)
    (OUT / 'trades.json').write_text(json.dumps(out))


def load_trades():
    t = pd.DataFrame(json.loads((OUT / 'trades.json').read_text()))
    t = t[t.symbol.isin(SYMS)].copy()
    t['key'] = t.symbol.map(SYMS)
    t['sign'] = np.where(t.direction == 'BUY', 1, -1)
    for c in ('time_open', 'time_close'):
        t[c + '_srv'] = pd.to_datetime(t[c], unit='s')       # broker server clock (rollover = server midnight)
    return t


def dff():
    d = pd.read_csv(ROOT / 'analysis/output/overnight-hold/dff.csv', parse_dates=['observation_date'])
    return d.set_index('observation_date')['DFF']


def boot_median(x, days, rng):
    """Median with a 95% interval, resampling calendar days."""
    x, days = np.asarray(x, float), np.asarray(days)
    u = np.unique(days)
    groups = [x[days == g] for g in u]
    meds = np.empty(B)
    for i in range(B):
        pick = rng.integers(0, len(u), len(u))
        meds[i] = np.median(np.concatenate([groups[j] for j in pick]))
    return float(np.median(x)), float(np.percentile(meds, 2.5)), float(np.percentile(meds, 97.5))


# ---------------------------------------------------------------- part A: swaps
def part_a(t, rates):
    s = t[(t.swap != 0) & (t.close_price != t.open_price) & (t.profit != 0)].copy()
    units = s.profit / ((s.close_price - s.open_price) * s.sign)          # account ccy per 1.0 of price
    s['swap_pct'] = s.swap / (units * s.open_price) * 100                  # % of notional, currency-free
    d0, d1 = s.time_open_srv.dt.normalize(), s.time_close_srv.dt.normalize()
    s['midnights'] = (d1 - d0).dt.days
    s['roll_day'] = d0.dt.day_name().str[:3]
    s['dff'] = [rates.asof(x) for x in d0]
    single = s[s.midnights == 1].copy()

    # account groups: identified from the gold long per-night rate (the trade rows carry no account number)
    gl = single[(single.key == 'gold') & (single.sign == 1) & (single.roll_day.isin(['Mon', 'Tue', 'Thu']))]
    bot_rate = gl.groupby('bot_key').swap_pct.median()
    group_of = {b: ('A' if abs(r) < 0.008 else 'B') for b, r in bot_rate.items()}
    # bots with no gold-long overnight: any gold overnight row decides (group A gold shorts PAY, group B shorts are
    # paid); bots with no gold overnight at all stay unassigned rather than guessed
    for b in s.bot_key.unique():
        if b in group_of:
            continue
        g = single[(single.bot_key == b) & (single.key == 'gold')]
        group_of[b] = ('B' if g[g.sign == -1].swap_pct.median() > 0 else 'A') if len(g) else 'unassigned'
    s['group'] = s.bot_key.map(group_of)
    # US100 is traded overnight only by group B bots plus oi_vol (no gold rows); its rate is identical, so it pools as B
    s.loc[(s.key == 'nq') & (s.group == 'unassigned'), 'group'] = 'B'
    single['group'] = s.loc[single.index, 'group']

    cells = []
    for (key, grp, sign), g in single.groupby(['key', 'group', 'sign']):
        by_day = g.groupby('roll_day').swap_pct.agg(['median', 'count'])
        base = g[g.roll_day.isin(['Mon', 'Tue', 'Thu'])].swap_pct
        if not len(base):
            base = g.swap_pct
        per_night = float(base.median())
        wed = by_day['median'].get('Wed')
        fri = by_day['median'].get('Fri')
        cell = {'instrument': key, 'group': grp, 'side': 'long' if sign == 1 else 'short', 'n_single_night': int(len(g)),
                'per_night_pct': per_night, 'annual_pct': per_night * 365,
                'wed_multiple': None if wed is None else float(wed / per_night),
                'fri_multiple': None if fri is None else float(fri / per_night),
                'dff_mean': float(g.dff.mean()),
                'implied_markup_pp': float(-per_night * 365 - g.dff.mean()) if sign == 1 else None,
                'by_weekday': {d: {'median': float(r['median']), 'n': int(r['count'])} for d, r in by_day.iterrows()}}
        if sign == 1:
            m = MODEL[key]
            model_night = (g.dff.mean() + m['markup']) / 365
            cell['model_per_night_pct'] = float(model_night)
            cell['model_wed_multiple'] = m['wed_days']
            cell['ratio_model_over_measured_night'] = float(model_night / -per_night)
            # what the overnight hold actually pays per week (Mon-Thu rollovers held): model vs measured
            wm = cell['wed_multiple'] if cell['wed_multiple'] is not None else 1.0
            cell['week_model_pct'] = float(model_night * (3 + m['wed_days']))
            cell['week_measured_pct'] = float(-per_night * (3 + wm))
            cell['ratio_model_over_measured_week'] = cell['week_model_pct'] / cell['week_measured_pct']
        cells.append(cell)
    # multi-night trades as a consistency check: measured vs per-night × trading-day midnights (weekday multiples)
    return {'cells': cells, 'group_of_bot': group_of, 'n_overnight_trades': int(len(s)),
            'n_single_night': int(len(single))}, s


# ---------------------------------------------------------------- part B: fills vs OANDA mid
def part_b(t, rng):
    res = {}
    for key in ('nq', 'gold'):
        q = pd.read_parquet(ROOT / f'data/m1_bidask/{key}_m1.parquet', columns=['time', 'bid_o', 'ask_o', 'bid_c', 'ask_c'])
        q = q[q.time >= '2026-03-01'].set_index('time')
        mid = ((q.bid_o + q.ask_o) / 2 + (q.bid_c + q.ask_c) / 2) / 2
        half = ((q.ask_o - q.bid_o) + (q.ask_c - q.bid_c)) / 4 / mid * 1e4       # bp
        g = t[t.key == key].copy()
        rows = []
        for side, col, px, sgn in (('entry', 'time_open_srv', 'open_price', 1), ('exit', 'time_close_srv', 'close_price', -1)):
            ts = g[col].dt.floor('min')
            # server -> UTC offset per calendar month, chosen among UTC+2 / UTC+3 by the smallest median |fill - mid|
            best = {}
            for mth, idx in ts.groupby(ts.dt.to_period('M')).groups.items():
                errs = {}
                for off in (2, 3):
                    u = ts.loc[idx] - pd.Timedelta(hours=off)
                    mm = mid.reindex(u.values).to_numpy()
                    errs[off] = np.nanmedian(np.abs(g.loc[idx, px].to_numpy() - mm) / mm * 1e4)
                best[str(mth)] = min(errs, key=errs.get)
            off = ts.dt.to_period('M').astype(str).map(best)
            u = ts - pd.to_timedelta(off, unit='h')
            mm = mid.reindex(u.values).to_numpy()
            hs = half.reindex(u.values).to_numpy()
            signed = g.sign.to_numpy() * sgn * (g[px].to_numpy() - mm) / mm * 1e4
            uk = u.dt.tz_localize('UTC').dt.tz_convert('Europe/London')
            rows.append(pd.DataFrame({'side': side, 'sign': g.sign.to_numpy(), 'signed_bp': signed, 'oanda_half_bp': hs,
                                      'uk_hour': uk.dt.hour.to_numpy() + uk.dt.minute.to_numpy() / 60,
                                      'day': u.dt.date.to_numpy(), 'bot': g.bot_key.to_numpy()}))
            res.setdefault(key, {})[f'{side}_utc_offset_by_month'] = best
        d = pd.concat(rows).dropna(subset=['signed_bp'])
        d = d[np.abs(d.signed_bp) < 50]       # feed glitches / wrong-minute matches; count reported
        res[key]['n_matched'] = int(len(d))
        for side in ('entry', 'exit'):
            x = d[d.side == side]
            buys, sells = x[x.sign == 1], x[x.sign == -1]
            if len(buys) < 10 or len(sells) < 10:
                continue
            mb = boot_median(buys.signed_bp, buys.day, rng)
            ms = boot_median(sells.signed_bp, sells.day, rng)
            res[key][side] = {'n_buys': int(len(buys)), 'n_sells': int(len(sells)),
                              'median_signed_buys_bp': mb, 'median_signed_sells_bp': ms,
                              'cost_per_side_bp': (mb[0] + ms[0]) / 2,
                              'cost_per_side_ci_bp': [(mb[1] + ms[1]) / 2, (mb[2] + ms[2]) / 2],
                              'basis_bp': (mb[0] - ms[0]) / 2,
                              'oanda_half_spread_bp_same_minutes': float(np.nanmedian(x.oanda_half_bp))}
            for tag, lo, hi in (('near_20_uk', 19, 21), ('near_1430_uk', 13.5, 15.5)):
                w = x[(x.uk_hour >= lo) & (x.uk_hour < hi)]
                wb, ws = w[w.sign == 1], w[w.sign == -1]
                res[key][side][tag] = {'n': int(len(w)), 'oanda_half_bp': float(np.nanmedian(w.oanda_half_bp)) if len(w) else None,
                                       'cost_per_side_bp': float((np.median(wb.signed_bp) + np.median(ws.signed_bp)) / 2)
                                       if len(wb) >= 5 and len(ws) >= 5 else None}
    return res


def band(ratio):
    return 'verified' if 0.67 <= ratio <= 1.5 else ('overstated' if ratio > 1.5 else 'understated')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--fetch', action='store_true')
    a = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    if a.fetch or not (OUT / 'trades.json').exists():
        fetch()
    rng = np.random.default_rng(SEED)
    t = load_trades()
    A, swaps = part_a(t, dff())
    Bres = part_b(t, rng)
    # the repo is public: per-trade rows keep only currency-free fields (no profit, swap amount, lots or position id)
    swaps[['symbol', 'direction', 'bot_key', 'group', 'time_open', 'time_close', 'midnights', 'roll_day', 'swap_pct',
           'dff']].to_csv(OUT / 'swaps.csv', index=False)

    table = {'source': 'cost-verification 2026-10-25', 'financing': [], 'spread': {}}
    for c in A['cells']:
        if c['side'] != 'long':
            continue
        c['band_week'] = band(c['ratio_model_over_measured_week'])
        table['financing'].append({k: c[k] for k in ('instrument', 'group', 'per_night_pct', 'annual_pct', 'wed_multiple',
                                                     'implied_markup_pp', 'band_week')})
    for key, r in Bres.items():
        if 'entry' in r:
            measured_rt = 2 * r['entry']['cost_per_side_bp'] / 100      # % per round trip
            model_rt = OANDA_SPREAD_PER_TRADE[key]
            r['entry']['model_round_trip_pct'] = model_rt
            r['entry']['measured_round_trip_pct'] = measured_rt
            r['entry']['band'] = band(model_rt / measured_rt) if measured_rt > 0 else 'measured <= 0'
            table['spread'][key] = {'measured_round_trip_pct': measured_rt, 'oanda_model_round_trip_pct': model_rt,
                                    'band': r['entry']['band']}
    (OUT / 'results.json').write_text(json.dumps({'seed': SEED, 'B': B, 'n_trades': int(len(t)), 'A': A, 'B': Bres},
                                                 indent=1, default=str))
    (OUT / 'cost_table.json').write_text(json.dumps(table, indent=1))
    print(json.dumps({'A': [{k: c.get(k) for k in ('instrument', 'group', 'side', 'n_single_night', 'per_night_pct',
                                                     'annual_pct', 'wed_multiple', 'fri_multiple', 'implied_markup_pp',
                                                     'ratio_model_over_measured_week', 'band_week')} for c in A['cells']],
                      'groups': A['group_of_bot'], 'B': Bres}, indent=1, default=str))


if __name__ == '__main__':
    main()
