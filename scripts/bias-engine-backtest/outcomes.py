"""bias-engine-backtest step 3: the outcome table (prices only; never joined to the engine before the prereg commit).

Per London issue date D and market:
  sameday   ln(mid 21:00 London / mid 07:00 London) on day D from real OANDA bid/ask M1 (data/m1_bidask, 2016-10-24 ->),
            entry = bid/ask mid at the open of the first M1 bar in [07:00, 07:10), exit = mid at the close of the last bar in
            [20:30, 21:00) (else the day is unresolved and COUNTED); cost = half the quoted spread at entry + half at exit.
  ny5, ny20 ln(C[D+h] / C[D]) on New York 17:00 closes (C[D] = the close of trade date D, after the 07:00 London
            issue); majors/gold/NAS100/SPX500 from features/px_d1 (2002 ->), crosses as ratios of the USD majors,
            US30/US2000/DE30/UK100 from Oanda mid M1 (2016 ->). Cost = the instrument's median quoted round-trip spread
            at the 21:00 London exit bar over 2016-10 -> 2026-08 (one entry + one exit).
  sigma     SD of the previous 60 NY-close daily log returns (ending at D-1's close, >= 40), the R unit for every horizon.
  b0        point-in-time base rates from outcomes fully realised before D (exit before D's issue): P(up) (expanding,
            0.5 until 120 resolved) and drift mu (mean outcome in sigma units, 0 until 120 resolved).
    python -X utf8 -I scripts/bias-engine-backtest/outcomes.py
"""
import json
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *  # noqa

USD_LEG = {'EUR': ('EURUSD', 1), 'GBP': ('GBPUSD', 1), 'AUD': ('AUDUSD', 1), 'NZD': ('NZDUSD', 1),
           'JPY': ('USDJPY', -1), 'CAD': ('USDCAD', -1), 'CHF': ('USDCHF', -1)}
SCORED = ALL_PAIRS + ASSETS_SCORED


def ny_closes():
    px = {m: px_d1(PRICE_SRC[m][1]) for m in MAJORS + ['GOLD', 'NQ', 'SPX500']}
    maj = pd.concat({m: px[m] for m in MAJORS}, axis=1).dropna()
    usd_per = {'USD': pd.Series(1.0, index=maj.index)}
    for c, (p, s) in USD_LEG.items():
        usd_per[c] = maj[p] if s == 1 else 1.0 / maj[p]
    out = {}
    for pr in ALL_PAIRS:
        out[pr] = (usd_per[pr[:3]] / usd_per[pr[3:]]).rename(pr)
    for a in ['GOLD', 'NQ', 'SPX500']:
        out[a] = px[a]
    for a in ['US30', 'US2000', 'DE30', 'UK100']:
        out[a] = ny_close_from_m1(read_m1_mid(PRICE_SRC[a][0]))
    return out


def sameday_and_spread(market):
    key = market.lower() if market in ALL_PAIRS else PRICE_SRC[market][2]
    p = MAIN / 'data' / 'm1_bidask' / f'{key}_m1.parquet'
    if not p.exists():
        return None, None
    df = read_m1_bidask(key)
    t = pd.DatetimeIndex(df['time']).tz_localize('UTC').tz_convert(LON)
    df['ldate'] = t.tz_localize(None).normalize()
    df['lmin'] = t.hour * 60 + t.minute
    w_in = df[(df['lmin'] >= 7 * 60) & (df['lmin'] < 7 * 60 + 10)]
    a = w_in.groupby('ldate').head(1).set_index('ldate')                      # first bar at/after 07:00
    w_out = df[(df['lmin'] >= 20 * 60 + 30) & (df['lmin'] < 21 * 60)]
    b = w_out.groupby('ldate').tail(1).set_index('ldate')                     # last bar before 21:00 (close)
    j = a[['bid_o', 'ask_o']].join(b[['bid_c', 'ask_c']], how='outer')
    j = j[j.index.dayofweek < 5]
    mid_in = (j['bid_o'] + j['ask_o']) / 2
    mid_out = (j['bid_c'] + j['ask_c']) / 2
    res = pd.DataFrame({'ret': np.log(mid_out / mid_in),
                        'cost': ((j['ask_o'] - j['bid_o']) / 2 + (j['ask_c'] - j['bid_c']) / 2) / mid_in})
    spr = (b['ask_c'] - b['bid_c']) / ((b['ask_c'] + b['bid_c']) / 2)
    spr = spr[(spr > 0) & np.isfinite(spr)]
    return res, float(spr.median()) if len(spr) else None


def main():
    INP.mkdir(parents=True, exist_ok=True)
    closes = ny_closes()
    dates = issue_dates()
    frames, spread_rt, unresolved = [], {}, {}
    for m in SCORED:
        c = closes[m].sort_index()
        c = c[c.index <= LOCKBOX]
        lr = np.log(c).diff()
        sig = lr.rolling(60, min_periods=40).std().shift(1)        # ends at D-1's close
        pos = pd.Series(np.arange(len(c)), index=c.index)
        df = pd.DataFrame(index=dates)
        df['market'] = m
        ix = pos.reindex(dates)                                     # D must itself be a trading day for the NY series
        for h in (5, 20):
            fwd = np.log(c.shift(-h) / c)
            df[f'ret{h}'] = fwd.reindex(dates).to_numpy()
            exit_dt = pd.Series(c.index, index=c.index).shift(-h)
            df[f'exit{h}'] = exit_dt.reindex(dates).to_numpy()
        df['sigma'] = sig.reindex(dates).to_numpy()
        sd, rt = sameday_and_spread(m)
        spread_rt[m] = rt
        if sd is not None:
            sd = sd[(sd.index >= pd.Timestamp('2016-10-24')) & (sd.index <= LOCKBOX)]
            df['ret0'] = sd['ret'].reindex(dates).to_numpy()
            df['cost0'] = sd['cost'].reindex(dates).to_numpy()
            span = (dates >= pd.Timestamp('2016-10-24'))
            unresolved[m] = int((span & ~np.isfinite(df['ret0'].to_numpy())).sum())
        else:
            df['ret0'] = np.nan
            df['cost0'] = np.nan
        frames.append(df.reset_index(names='date'))
        log(m, 'rows', len(df), 'sameday', int(np.isfinite(df['ret0']).sum()), 'spread_rt', rt)
    o = pd.concat(frames, ignore_index=True)
    # lockbox: slow exits after the lockbox are dropped (never scored), sameday already cut
    for h in (5, 20):
        late = o[f'exit{h}'] > LOCKBOX
        o.loc[late, f'ret{h}'] = np.nan
    o['costS'] = o['market'].map(spread_rt)
    # sigma-unit outcomes and PIT base rates
    for h, col in ((0, 'ret0'), (5, 'ret5'), (20, 'ret20')):
        o[f'o{h}'] = o[col] / o['sigma']
        o[f'c{h}'] = (o['cost0'] if h == 0 else o['costS']) / o['sigma']
    o = o.sort_values(['market', 'date']).reset_index(drop=True)
    for h in (0, 5, 20):
        pu, mu = np.full(len(o), np.nan), np.full(len(o), np.nan)
        for m, g in o.groupby('market'):
            idx = g.index.to_numpy()
            d = g['date'].to_numpy()
            ov = g[f'o{h}'].to_numpy()
            realised = d if h == 0 else g[f'exit{h}'].to_numpy()       # an outcome is known once its exit has passed
            ok = np.isfinite(ov)
            if not ok.any():
                pu[idx], mu[idx] = 0.5, 0.0
                continue
            rd = np.where(ok, realised, np.datetime64('NaT')).astype('datetime64[ns]')
            order = np.argsort(rd[ok])
            r_sorted, o_sorted = rd[ok][order], ov[ok][order]
            cs_up, cs_o = np.cumsum(o_sorted > 0), np.cumsum(o_sorted)
            k = np.searchsorted(r_sorted, d.astype('datetime64[ns]'), side='left')  # strictly before D
            n = k
            up = np.where(n > 0, cs_up[np.maximum(n - 1, 0)], 0)
            so = np.where(n > 0, cs_o[np.maximum(n - 1, 0)], 0.0)
            pu[idx] = np.where(n >= 120, up / np.maximum(n, 1), 0.5)
            mu[idx] = np.where(n >= 120, so / np.maximum(n, 1), 0.0)
        o[f'pup{h}'], o[f'mu{h}'] = pu, mu
    keep = ['date', 'market', 'sigma', 'o0', 'c0', 'o5', 'c5', 'o20', 'c20', 'pup0', 'mu0', 'pup5', 'mu5', 'pup20', 'mu20', 'exit5', 'exit20']
    o[keep].to_parquet(OUT / 'outcomes.parquet', index=False)
    (OUT / 'outcome_meta.json').write_text(json.dumps({'spread_round_trip_median_21uk': spread_rt, 'sameday_unresolved_days': unresolved}, indent=1))
    log('outcomes written', len(o))


if __name__ == '__main__':
    main()
