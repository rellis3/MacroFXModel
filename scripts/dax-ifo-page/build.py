"""Data for dax-ifo.html: the DAX IFO system (banked NULL, `dax-ifo-lookahead`) with costs, daily paths and exports.

Rule (Dax Base IFO System/System): long the DAX when the IFO business climate rose month on month, short when it fell.
Three timings, exactly as scripts/dax-ifo-lookahead/check.py, which this reproduces before writing anything:
  A  original: s(M) earns month M (IFO(M) is published ~25th of M, so this is LOOKAHEAD; shown for reference only)
  B  next month: s(M) earns month-end(M) close -> month-end(M+1) close
  C  at release: s(M) earns release day(M) close -> release day(M+1) close (first DAX day on/after the 25th)
Modes: long/short (the original rule) and long/flat.

Prices: Dax Base IFO System data/dax_raw.csv (cash index daily OHLC, 2006-01-02 -> 2026-07-20). MAE / MFE from the daily
highs and lows after the entry close (cash hours only: a CFD's overnight extremes aren't in this file).
Costs (a model: none of the owner's accounts has held DAX overnight, so nothing is measured):
  spread     OANDA DE30_EUR bid/ask half-spread at the fill (16:30 London, the cash close), charged only when the
             position changes (a flip = close + open); before the bid/ask file starts (2016-10-24) the median of later fills
  financing  per calendar night, OANDA's method: long pays (ECB deposit rate + 2.44pp)/365, short receives
             (ECB deposit rate - 2.56pp)/365 (pays when that is negative). Markups from the 2026-10-20 OANDA snapshot
             (long -4.94%, short -0.06% a year, ECB deposit 2.50%). FRED ECBDFR.
Toolkit replica (scripts/overnight-hold-toolkit/toolkit.py, FTMO 2-step) on DAILY mark-to-market rows, because a
monthly position's daily-loss check needs its daily path; zero-edge control = the same rows with the mean removed.

Writes analysis/output/dax-ifo-page/{page.json, toolkit.json}. Seed 20261026.
Usage: python scripts/dax-ifo-page/build.py
"""
import json
import sys
from datetime import datetime, time
from pathlib import Path
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / 'Dax Base IFO System' / 'System' / 'data'
OUT = ROOT / 'analysis' / 'output' / 'dax-ifo-page'
OUT.mkdir(parents=True, exist_ok=True)
sys.path.insert(0, str(ROOT / 'scripts' / 'overnight-hold-toolkit'))
import toolkit as TK  # noqa: E402

SEED = 20261026
LON = ZoneInfo('Europe/London')
ECB_SNAPSHOT = 2.50
MARKUP_LONG = 4.94 - ECB_SNAPSHOT      # 2.44pp
MARKUP_SHORT = ECB_SNAPSHOT + 0.06     # short pays 0.06% at ECB 2.50 -> earns ECB - 2.56
SIZES = [0.5, 1, 2, 3]


def num(s):
    return pd.to_numeric(s.astype(str).str.replace(',', ''), errors='coerce')


def load():
    ifo = pd.read_csv(SRC / 'RAWDATA.csv')
    ifo.columns = ifo.columns.str.strip()
    ifo['Date'] = pd.to_datetime(ifo['Date'], format='%d/%m/%Y')
    ifo = ifo.rename(columns={'ISO BE': 'ifo'})[['Date', 'ifo']]
    ifo['ym'] = ifo['Date'].dt.to_period('M')
    dax = pd.read_csv(SRC / 'dax_raw.csv', encoding='utf-8-sig')
    dax.columns = dax.columns.str.strip()
    dax['Date'] = pd.to_datetime(dax['Date'], format='%d/%m/%Y')
    for c in ('Price', 'Open', 'High', 'Low'):
        dax[c] = num(dax[c])
    dax = dax.sort_values('Date').reset_index(drop=True)
    # a few rows carry no high/low: use the close so they never invent an excursion
    dax['High'] = dax[['High', 'Price']].max(axis=1, skipna=True)
    dax['Low'] = dax[['Low', 'Price']].min(axis=1, skipna=True)
    dax['Open'] = dax['Open'].fillna(dax['Price'])
    return ifo, dax


def signals(ifo):
    s = ifo.set_index('ym')['ifo']
    d = s.diff()
    sig = pd.Series(np.where(d > 0, 1, -1), index=s.index)[d.notna()]
    return sig, s


def trades_for(timing, sig, dax):
    """List of (signal month, entry row, exit row, sign) using check.py's exact alignment."""
    dax = dax.assign(ym=dax.Date.dt.to_period('M'))
    mend = dax.groupby('ym').apply(lambda g: g.index[-1])
    out = []
    if timing in ('A', 'B'):
        for ym, s in sig.items():
            if timing == 'A':
                a, b = ym - 1, ym
            else:
                a, b = ym, ym + 1
                if ym < pd.Period('2005-03', 'M'):
                    continue
            if a in mend.index and b in mend.index:
                out.append((ym, int(mend[a]), int(mend[b]), int(s)))
    else:
        rel = {}
        for ym in sig.index:
            hit = dax.index[(dax.Date >= pd.Timestamp(ym.year, ym.month, 25))]
            if len(hit) and dax.Date[hit[0]].to_period('M') == ym:
                rel[ym] = int(hit[0])
        keys = sorted(rel)
        for k0, k1 in zip(keys[:-1], keys[1:]):
            if (k1 - k0).n == 1:
                out.append((k0, rel[k0], rel[k1], int(sig[k0])))
    return out


def fill_epoch(d):
    return int(datetime.combine(d.date(), time(16, 30), LON).timestamp())


def main():
    ifo, dax = load()
    sig, level = signals(ifo)
    banked = json.loads((ROOT / 'analysis/output/dax-ifo-lookahead/results.json').read_text())

    # ── reproduce the banked study first ─────────────────────────────────────
    C = dax.Price.to_numpy()
    tr = {t: trades_for(t, sig, dax) for t in 'ABC'}
    chk = {'A': 'A_original_same_month', 'B': 'B_next_month', 'C': 'C_release_day25'}
    for t, key in chk.items():
        g = np.array([s * (C[j] / C[i] - 1) * 100 for _, i, j, s in tr[t]])
        b = banked[key]
        print(f'{t}: n {len(g)} (banked {b["n"]}), mean {g.mean():+.4f}% (banked {b["mean"]:+.4f}%)')
        assert len(g) == b['n'] and abs(g.mean() - b['mean']) < 1e-6, f'timing {t} does not reproduce the banked study'

    # ── costs ────────────────────────────────────────────────────────────────
    ecb = pd.read_csv(ROOT / 'analysis/output/dax-ifo-lookahead/ecbdfr.csv', parse_dates=['observation_date']).set_index('observation_date')['ECBDFR']
    ecb = ecb.reindex(pd.date_range('2005-01-01', '2026-12-31')).ffill()
    ba = pd.read_parquet(ROOT / 'data/m1_bidask/dax_m1.parquet', columns=['time', 'bid_c', 'ask_c'])
    be = ba.time.astype('datetime64[s]').astype('int64').to_numpy()
    hs_all = ((ba.ask_c - ba.bid_c) / 2 / ((ba.ask_c + ba.bid_c) / 2) * 100).to_numpy()
    fe = np.array([fill_epoch(d) for d in dax.Date])
    ix = np.searchsorted(be, fe, side='right') - 1
    ok = (ix >= 0) & (fe - be[np.clip(ix, 0, None)] <= 1800)
    hs = np.where(ok, hs_all[np.clip(ix, 0, None)], np.nan)
    hs_fallback = float(np.nanmedian(hs))
    hs_src = np.where(ok, 1, 0)                     # 1 = measured at that fill, 0 = median fallback
    hs = np.where(ok, hs, hs_fallback)
    print(f'half-spread at the 16:30 London fill: median {hs_fallback:.4f}% ({ok.sum()} days measured, {(~ok).sum()} use the median)')

    dates = dax.Date
    # financing per day d (the nights between close d-1 and close d), for a long and for a short, in % of notional
    nights = dates.diff().dt.days.fillna(0).to_numpy().astype(int)
    fin_long = np.zeros(len(dax)); fin_short = np.zeros(len(dax))
    for d in range(1, len(dax)):
        nd = pd.date_range(dates[d - 1], periods=nights[d], freq='D')
        rate = ecb.reindex(nd).to_numpy()
        fin_long[d] = ((rate + MARKUP_LONG) / 365).sum()              # cost to a long
        fin_short[d] = (-(rate - MARKUP_SHORT) / 365).sum()           # cost to a short (negative = earned)

    H, L = dax.High.to_numpy(), dax.Low.to_numpy()
    page = {'built': pd.Timestamp.now().strftime('%Y-%m-%d'), 'seed': SEED,
            'daily': {'d': dates.dt.strftime('%Y-%m-%d').tolist(), 'o': dax.Open.round(2).tolist(), 'h': dax.High.round(2).tolist(),
                      'l': dax.Low.round(2).tolist(), 'c': dax.Price.round(2).tolist(),
                      'fin_long': [round(float(x), 5) for x in fin_long], 'hs': [round(float(x), 5) for x in hs]},
            'ifo': {'m': [str(p) for p in level.index], 'v': level.round(2).tolist()},
            'costs': {'half_spread_fallback_pct': hs_fallback, 'measured_from': '2016-10-24', 'markup_long_pp': MARKUP_LONG,
                      'markup_short_pp': MARKUP_SHORT, 'ecb_snapshot': ECB_SNAPSHOT},
            'books': {}}
    tk_out = {'seed': SEED, 'paths': TK.PATHS, 'rules': 'FTMO 2-step (toolkit.py)', 'books': {}}
    rng = np.random.default_rng(SEED)
    r5 = lambda a: [round(float(x), 5) for x in a]

    for t in 'ABC':
        for mode in ('ls', 'lf'):
            T = [(ym, i, j, s if mode == 'ls' else max(s, 0)) for ym, i, j, s in tr[t]]
            n = len(T)
            rows = []
            dpos = np.zeros(len(dax)); first, last = T[0][1], T[-1][2]
            d_sp = np.zeros(len(dax))
            for k, (ym, i, j, s) in enumerate(T):
                prev_s = T[k - 1][3] if k and T[k - 1][2] == i else 0
                next_s = T[k + 1][3] if k + 1 < n and T[k + 1][1] == j else 0
                sp_in = hs[i] if (s != 0 and s != prev_s) else 0.0      # opening (or reversing into) this position
                sp_out = hs[j] if (s != 0 and s != next_s) else 0.0     # closing (or reversing out of) it
                dpos[i + 1:j + 1] = s
                d_sp[i + 1] += sp_in; d_sp[j] += sp_out
                if s == 0:
                    continue
                g = s * (C[j] / C[i] - 1) * 100
                seg = slice(i + 1, j + 1)
                adv = (L[seg].min() / C[i] - 1) * 100 if s > 0 else -(H[seg].max() / C[i] - 1) * 100
                fav = (H[seg].max() / C[i] - 1) * 100 if s > 0 else -(L[seg].min() / C[i] - 1) * 100
                fin = (fin_long if s > 0 else fin_short)[seg].sum()
                rows.append({'m': str(ym), 'i': i, 'j': j, 's': s, 'g': g, 'mae': min(0.0, adv, g), 'mfe': max(0.0, fav, g),
                             'sp': sp_in + sp_out, 'fin': fin, 'hs_measured': int(hs_src[i] and hs_src[j]),
                             'ifo': float(level[ym]), 'ifo_prev': float(level[ym - 1])})
            # daily mark-to-market over the book's whole window (flat days are rows with 0)
            dd = np.arange(first + 1, last + 1)
            s_d = dpos[dd]
            dg = s_d * (C[dd] / C[dd - 1] - 1) * 100
            adv_d = np.where(s_d > 0, (L[dd] / C[dd - 1] - 1) * 100, np.where(s_d < 0, -(H[dd] / C[dd - 1] - 1) * 100, 0))
            dm = np.minimum.reduce([adv_d, dg, np.zeros(len(dd))])
            dfin = np.where(s_d > 0, fin_long[dd], np.where(s_d < 0, fin_short[dd], 0))
            dsp = d_sp[dd]
            book = f'{t}_{mode}'
            page['books'][book] = {
                'trades': {k: ([r[k] for r in rows] if k in ('m', 'i', 'j', 's', 'hs_measured') else r5([r[k] for r in rows]))
                           for k in ('m', 'i', 'j', 's', 'g', 'mae', 'mfe', 'sp', 'fin', 'hs_measured', 'ifo', 'ifo_prev')},
                'daily': {'start': int(first), 'g': r5(dg), 'm': r5(dm), 'fin': r5(dfin), 'sp': r5(dsp), 'pos': s_d.astype(int).tolist()},
            }
            # toolkit replica on the daily rows
            res = {}
            for cost in ('gross', 'net'):
                c = (dfin + dsp) if cost == 'net' else 0
                df = pd.DataFrame({'Date': dates.iloc[dd].dt.strftime('%Y-%m-%d').to_numpy(), 'Return %': dg - c, 'MAE %': dm - c})
                zero = df.assign(**{'Return %': df['Return %'] - df['Return %'].mean(), 'MAE %': df['MAE %'] - df['Return %'].mean()})
                res[cost] = {str(k): TK.simulate(df, k, TK.FTMO, rng) for k in SIZES}
                res[cost + '_zero_edge'] = {str(k): TK.simulate(zero, k, TK.FTMO, rng) for k in SIZES}
                print(book, cost, {k: round(v['funded'], 3) for k, v in res[cost].items()},
                      'zero', {k: round(v['funded'], 3) for k, v in res[cost + '_zero_edge'].items()})
            tk_out['books'][book] = res
            nt = np.array([r['g'] - r['sp'] - r['fin'] for r in rows])
            print(f'{book}: {len(rows)} trades, gross mean {np.mean([r["g"] for r in rows]):+.3f}%, net mean {nt.mean():+.3f}%')

    (OUT / 'page.json').write_text(json.dumps(page, separators=(',', ':')))
    (OUT / 'toolkit.json').write_text(json.dumps(tk_out, separators=(',', ':')))
    print(OUT / 'page.json', (OUT / 'page.json').stat().st_size // 1024, 'KB')


if __name__ == '__main__':
    main()
