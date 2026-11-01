"""Edges by regime (EXPLORATORY). Prereg: analysis/output/edges-by-regime/PREREG.md.

    python3 analysis/edges_by_regime.py            # fetch (or reuse cached data/), compute, write RESULTS.md + results.json
    python3 analysis/edges_by_regime.py --offline  # cached data only

Real data only: Yahoo ^NDX/^GSPC daily OHLC, committed Cboe VIX/VIX3M seeds, FRED public CSV. Rows after the
2026-08-21 lockbox are dropped before anything is computed.
"""
import io, json, os, sys, time, urllib.request
from datetime import datetime, timezone
import numpy as np
import pandas as pd

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'analysis/output/edges-by-regime')
DATA = os.path.join(OUT, 'data')
LOCKBOX = '2026-08-21'
SEED, REPS, BLOCK = 20261101, 2000, 20
UA = {'User-Agent': 'Mozilla/5.0 (compatible; MacroFXModel research)'}


def _get(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read().decode()


def yahoo_ohlc(ticker, offline):
    f = os.path.join(DATA, f"{ticker.strip('^')}.csv")
    if offline or os.path.exists(f):
        return pd.read_csv(f, parse_dates=['date']).set_index('date')
    p2 = int(time.time())
    j = json.loads(_get(f'https://query1.finance.yahoo.com/v8/finance/chart/{urllib.request.quote(ticker)}?period1=0&period2={p2}&interval=1d'))
    r = j['chart']['result'][0]
    q = r['indicators']['quote'][0]
    off = r['meta'].get('gmtoffset', 0)
    dates = [datetime.fromtimestamp(t + off, tz=timezone.utc).strftime('%Y-%m-%d') for t in r['timestamp']]
    df = pd.DataFrame({'date': dates, 'open': q['open'], 'high': q['high'], 'low': q['low'], 'close': q['close']}).dropna()
    df = df.drop_duplicates('date', keep='last')
    df.to_csv(f, index=False)
    return pd.read_csv(f, parse_dates=['date']).set_index('date')


def fred(sid, offline):
    f = os.path.join(DATA, f'{sid}.csv')
    if not (offline or os.path.exists(f)):
        txt = _get(f'https://fred.stlouisfed.org/graph/fredgraph.csv?id={sid}')
        with open(f, 'w') as fh:
            fh.write(txt)
    d = pd.read_csv(f)
    d.columns = ['date', 'value']
    d['date'] = pd.to_datetime(d['date'])
    d['value'] = pd.to_numeric(d['value'], errors='coerce')
    return d.dropna().set_index('date')['value']


def cboe(sym):
    d = pd.read_csv(os.path.join(ROOT, 'analysis/surfaces/cboe', f'{sym}.csv'))
    d['date'] = pd.to_datetime(d['DATE'], format='%m/%d/%Y')
    return d.set_index('date')['CLOSE'].astype(float)


def m1_nyclose(name):
    """Committed NY-close daily bars built from M1 (data-rules item 2); n = M1 bars in the day, keep n >= 60."""
    d = pd.read_parquet(os.path.join(ROOT, 'oi_research_book/data/gex_range_es', f'{name}_nyclose_d1.parquet')).sort_index()
    d = d[d['n'] >= 60]
    d.index = pd.to_datetime(d.index).normalize()
    return d[['open', 'high', 'low', 'close']]


def committed_fred(sid):
    """FRED series already committed to the repo (analysis/output/cog_yield_dir/fred/)."""
    d = pd.read_csv(os.path.join(ROOT, 'analysis/output/cog_yield_dir/fred', f'{sid}.csv'))
    d.columns = ['date', 'value']
    d['date'] = pd.to_datetime(d['date']); d['value'] = pd.to_numeric(d['value'], errors='coerce')
    return d.dropna().set_index('date')['value']


def frame(ohlc, vix, vix3m, hy, curve):
    df = ohlc[ohlc.index <= LOCKBOX].copy()
    df = df[df.index.dayofweek < 5]
    df['hl'] = df['high'] - df['low']
    df = df[df['hl'] > 0]
    df['atr14'] = df['hl'].rolling(14).mean()                    # ends at t: known at t's close
    df['r1'] = df['hl'].shift(-1) / df['atr14']                  # next session
    df['r5'] = df['hl'][::-1].rolling(5).mean()[::-1].shift(-1) / df['atr14']   # mean HL t+1..t+5
    df['ret5'] = df['close'] / df['close'].shift(5) - 1
    v = vix.reindex(df.index).ffill(limit=3)
    df['vix'] = v
    df['vix_med252'] = v.rolling(252, min_periods=200).median()
    df['term'] = v / vix3m.reindex(df.index).ffill(limit=3)
    # FRED: published next business day → value as of t−1 (shift one trading row after aligning)
    hy_a = hy.reindex(df.index).ffill(limit=5)
    cv_a = curve.reindex(df.index).ffill(limit=5)
    df['hy_chg20'] = (hy_a - hy_a.shift(20)).shift(1)
    df['curve'] = cv_a.shift(1)
    df['reg_vol'] = np.where(df['vix_med252'].isna(), None, np.where(df['vix'] > df['vix_med252'], 'high vol', 'low vol'))
    df['reg_credit'] = np.where(df['hy_chg20'].isna(), None, np.where(df['hy_chg20'] > 0, 'credit widening', 'credit not widening'))
    df['reg_curve'] = np.where(df['curve'].isna(), None, np.where(df['curve'] < 0, 'curve inverted', 'curve not inverted'))
    return df


def block_boot(dates_idx, ev_mask, y, rng):
    """Moving-block bootstrap over the date index; returns 2.5/97.5 pct of mean(event) − mean(control)."""
    n = len(y)
    nb = int(np.ceil(n / BLOCK))
    out = np.empty(REPS)
    for k in range(REPS):
        starts = rng.integers(0, n - BLOCK + 1, nb)
        idx = (starts[:, None] + np.arange(BLOCK)[None, :]).ravel()[:n]
        e, yy = ev_mask[idx], y[idx]
        out[k] = (yy[e].mean() - yy[~e].mean()) if e.any() and (~e).any() else np.nan
    return np.nanpercentile(out, [2.5, 97.5])


def effect(df, ev_col, out_col, rng):
    d = df.dropna(subset=[out_col])
    ev = d[ev_col].to_numpy(bool)
    y = d[out_col].to_numpy(float)
    if ev.sum() < 8 or (~ev).sum() < 30:
        return {'n_event': int(ev.sum()), 'n_control': int((~ev).sum()), 'effect': None, 'ci': None}
    eff = float(y[ev].mean() - y[~ev].mean())
    lo, hi = block_boot(d.index, ev, y, rng)
    return {'n_event': int(ev.sum()), 'n_control': int((~ev).sum()), 'effect': round(eff, 3), 'ci': [round(float(lo), 3), round(float(hi), 3)],
            'mean_event': round(float(y[ev].mean()), 3), 'mean_control': round(float(y[~ev].mean()), 3)}


def clear(c):
    return c['ci'] is not None and (c['ci'][0] > 0 or c['ci'][1] < 0)


def run(offline=False, source='m1'):
    os.makedirs(DATA, exist_ok=True)
    vix, vix3m = cboe('VIX'), cboe('VIX3M')
    if source == 'm1':      # Amendment 1: the repo's own data (NY-close bars from M1, committed BAA10Y / T10Y2Y)
        ndx, spx = m1_nyclose('nas100'), m1_nyclose('spx500')
        hy, curve = committed_fred('BAA10Y'), committed_fred('T10Y2Y')
    else:                   # v1, superseded: Yahoo cash index + FRED public HY OAS (2023-10 →)
        ndx, spx = yahoo_ohlc('^NDX', offline), yahoo_ohlc('^GSPC', offline)
        hy, curve = fred('BAMLH0A0HYM2', offline), fred('T10Y2Y', offline)
    rng = np.random.default_rng(SEED)
    edges = []
    # E1 nq-down-week on NDX
    a = frame(ndx, vix, vix3m, hy, curve)
    a['ev'] = a['ret5'] <= -0.01
    edges.append(('nq-down-week', 'Nasdaq down ≥1% over 5 sessions → next session wider (NDX, HL/ATR14)', a, 'r1'))
    # E2 vix-inversion first day on SPX
    b = frame(spx, vix, vix3m, hy, curve)
    b['ev'] = (b['term'] > 1) & (b['term'].shift(1) <= 1)
    b = b[b['term'].notna()]
    edges.append(('vix-inversion', 'First day VIX > VIX3M → wider next 5 sessions (SPX, mean HL/ATR14)', b, 'r5'))

    results = {'generated': datetime.now(timezone.utc).strftime('%Y-%m-%d'), 'lockbox': LOCKBOX, 'seed': SEED, 'reps': REPS, 'block': BLOCK,
               'status': 'EXPLORATORY', 'verdict': 'CONTEXT', 'source': source,
               'data': {'m1': 'NY-close D1 from M1 (oi_research_book/data/gex_range_es/*_nyclose_d1.parquet); credit BAA10Y, curve T10Y2Y (analysis/output/cog_yield_dir/fred); VIX/VIX3M Cboe seeds',
                        'yahoo': 'Yahoo cash index OHLC; FRED public HY OAS; superseded'}[source], 'edges': []}
    for eid, label, df, out in edges:
        rec = {'id': eid, 'label': label, 'outcome': out, 'span': [df.index.min().strftime('%Y-%m-%d'), df.index.max().strftime('%Y-%m-%d')],
               'all': effect(df, 'ev', out, rng), 'splits': {}}
        for axis in ['reg_vol', 'reg_credit', 'reg_curve']:
            cells = {}
            for lvl in sorted(x for x in df[axis].dropna().unique()):
                cells[lvl] = effect(df[df[axis] == lvl], 'ev', out, rng)
            pos = [k for k, c in cells.items() if clear(c) and c['effect'] > 0]
            neg = [k for k, c in cells.items() if clear(c) and c['effect'] < 0]
            if len(pos) == len(cells) and cells: read = 'seen in both'
            elif len(pos) == 1 and not neg: read = f'measured in {pos[0]} only'
            elif neg: read = 'sign flips: ' + ', '.join(neg)
            else: read = 'not resolved'
            rec['splits'][axis.replace('reg_', '')] = {'cells': cells, 'read': read}
        results['edges'].append(rec)
    if source != 'm1':
        return results          # v1 is kept only as results_v1_yahoo.json
    with open(os.path.join(OUT, 'results.json'), 'w') as fh:
        json.dump(results, fh, indent=1)
    write_md(results)
    return results


def write_md(res):
    L = ['# Edges by regime: results (EXPLORATORY, verdict CONTEXT)', '',
         f"*Generated {res['generated']} by `analysis/edges_by_regime.py` from `PREREG.md`, with no changes after the "
         f"prereg. Data runs to the lockbox ({res['lockbox']}). Moving-block bootstrap: {res['block']}-session blocks, "
         f"{res['reps']} reps, seed {res['seed']}. Outcome: HL / ATR14 (ATR known at the signal close). Effect = mean "
         f"on event days − mean on all other days in the same regime.*", '']
    for e in res['edges']:
        a = e['all']
        L += [f"## {e['id']}: {e['label']}", '', f"Span {e['span'][0]} → {e['span'][1]}. Unconditional: effect {a['effect']} "
              f"[{a['ci'][0]}, {a['ci'][1]}] (n event {a['n_event']}, control {a['n_control']}).", '',
              '| Split | Regime | n event | effect | 95% CI | read |', '|---|---|---|---|---|---|']
        for axis, sp in e['splits'].items():
            for lvl, c in sp['cells'].items():
                ci = f"[{c['ci'][0]}, {c['ci'][1]}]" if c['ci'] else '—'
                L.append(f"| {axis} | {lvl} | {c['n_event']} | {c['effect'] if c['effect'] is not None else '—'} | {ci} | {sp['read']} |")
        L.append('')
    L += ['## Data (Amendment 1: the repo\'s own data)', '',
          '- Index bars: committed NY-close daily bars built from M1 (`oi_research_book/data/gex_range_es/`),',
          '  2016-01-04 to 2026-08-20; days with fewer than 60 M1 bars dropped. These are the bars the live σ uses.',
          '- Credit regime: Moody\'s BAA − 10Y (`analysis/output/cog_yield_dir/fred/BAA10Y.csv`, 1986 →), the long credit',
          '  series the feature store carries. FRED serves the ICE HY spread for 3 years only.',
          '- Curve: `T10Y2Y.csv` from the same folder. VIX and VIX3M: committed Cboe seeds.',
          '- v1 (Yahoo cash index + 3-year HY OAS) broke the data rules and is kept as `RESULTS_v1_yahoo.md`, superseded.', '',
          '## How to read this', '',
          '- These are twelve cells read as a pattern. None of them validates or kills an edge. The audit grades in',
          '  `js/evidenceAudit.js` still govern.',
          '- "Seen in both" means the edge did not depend on that regime, over this sample.',
          '- "Measured in X only" means the evidence for today is thin when today is not X.',
          '- `state.html` shows the read for today\'s regime next to each edge.', '']
    with open(os.path.join(OUT, 'RESULTS.md'), 'w') as fh:
        fh.write('\n'.join(L))


if __name__ == '__main__':
    r = run(offline='--offline' in sys.argv, source='yahoo' if '--v1-yahoo' in sys.argv else 'm1')
    for e in r['edges']:
        print(e['id'], e['all'])
        for ax, sp in e['splits'].items():
            print('  ', ax, sp['read'], {k: (c['effect'], c['ci'], c['n_event']) for k, c in sp['cells'].items()})
