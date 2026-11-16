"""bias-engine-backtest step 1b: the engine's macro inputs, point-in-time, one JSON line per London issue date.

Mirrors server.js _beGather field by field (shape, rounding, asOf convention) with history in place of the live stores:
  rates      the live short-rate series (USD GS2, EUR DE call money, GBP BoE Bank Rate, JPY call, AUD 3m, CAD call,
             CHF 3m, NZD 3m), FIRST PRINTS from the feature store's ALFRED vintages, known only from their vintage date
             (the 2013-06-03 bulk vintage -> month end + 45 days); level = latest known (2 dp), z = latestZScore (24-print
             baseline, rateDiffScore needs >= 8 prints), asOf = observation date (as the live store stamps it)
  realYield  USD only: GS10 (monthly mean of DGS10, known after month end) - CPIAUCSL YoY from first prints
             (mergeRealYield); EUR / CHF CPI vintages are not held, so their real yield is missing (counted against
             coverage, as live when the store fails)
  usReal     FRED DFII10, points dated before the previous business day (H.15 posts the afternoon after)
  risk       VIX / VIX3M (CBOE, dated before the issue date), HY OAS (FRED; history from 2023-10 only, the ICE licence;
             points dated before the previous business day)
  cot        CFTC TFF leveraged funds / disaggregated managed money (analysis/output/cot-crowding-programme/cot_weekly.csv):
             share of OI, percentile vs the prior up-to-155 reports (worker pctRank, >= 52 reports), public Friday
             20:30 UTC after the Tuesday report; JPY/CAD/CHF turned to currency terms exactly as live
  policy     computed in the node driver from the 2y yields (fetch_y2.mjs) via the engine's own yieldWeekChange +
             fillPolicyFallback
  data, stance   NOT reconstructible point-in-time (macro scorecard composite, statement sentiment): left out, so the
             engine drops them and renormalises, as it does live when those stores fail.
    python -X utf8 -I scripts/bias-engine-backtest/build_inputs.py
"""
import json
import math
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import *  # noqa

FS = MAIN / 'features'
RATE_SRC = {'USD': 'y2m_usd', 'EUR': 'rate_on_de', 'GBP': 'rate3m_gbp', 'JPY': 'rate_on_jp', 'AUD': 'rate3m_aud',
            'CAD': 'rate_on_ca', 'CHF': 'rate3m_chf', 'NZD': 'rate3m_nzd'}
COT_FOR = {'EUR': 'EUR', 'GBP': 'GBP', 'AUD': 'AUD', 'NZD': 'NZD', 'JPY': 'JPY', 'CAD': 'CAD', 'CHF': 'CHF',
           'GOLD': 'GOLD', 'NQ': 'NQ', 'SPX500': 'ES', 'US30': 'YM', 'US2000': 'RTY'}
FLIPPED = {'JPY', 'CAD', 'CHF'}


def r2(x):
    return None if x is None or not math.isfinite(x) else float(f'{x:.2f}')


def latest_z(values, lookback=24, min_baseline=6):
    """js/yieldCurveEngine.js latestZScore, line for line."""
    clean = [v for v in values if v is not None and math.isfinite(v)]
    if len(clean) < min_baseline + 1:
        return None
    latest = clean[-1]
    base = clean[max(0, len(clean) - 1 - lookback):len(clean) - 1]
    if len(base) < min_baseline:
        return None
    m = sum(base) / len(base)
    sd = math.sqrt(sum((v - m) ** 2 for v in base) / len(base))
    floor = max(1e-9, abs(m) * 1e-9)
    if sd < floor:
        return 0 if abs(latest - m) < floor else (4 if latest > m else -4)
    return float(f'{(latest - m) / sd:.2f}')


def day_end(d):
    return f'{pd.Timestamp(d).strftime("%Y-%m-%d")}T23:59:00.000Z'


def first_prints(key):
    d = pd.read_parquet(FS / f'{key}.parquet')
    d['date'] = pd.to_datetime(d['date'])
    d['asof'] = pd.to_datetime(d['asof'], utc=True).dt.tz_localize(None)
    d = d.sort_values(['date', 'asof']).drop_duplicates('date', keep='first')
    bulk = d['asof'].dt.strftime('%Y-%m-%d').eq('2013-06-03')
    d['eff'] = np.where(bulk, d['date'] + pd.offsets.MonthEnd(0) + pd.Timedelta(days=45), d['asof'])
    d['eff'] = pd.to_datetime(d['eff'])
    d['value'] = d['value'].astype(float)
    return d[['date', 'eff', 'value']].reset_index(drop=True)


def known_series(fp, t):
    return fp[fp['eff'] <= t].sort_values('date')


def daily_feature(key):
    d = pd.read_parquet(FS / f'{key}.parquet')
    s = pd.Series(pd.to_numeric(d['value'], errors='coerce').to_numpy(), index=pd.to_datetime(d['date'])).dropna()
    return s[~s.index.duplicated(keep='last')].sort_index()


def csv_series(path):
    f = pd.read_csv(path)
    f.columns = ['date', 'value']
    s = pd.Series(pd.to_numeric(f['value'], errors='coerce').to_numpy(), index=pd.to_datetime(f['date'])).dropna()
    return s[~s.index.duplicated(keep='last')].sort_index()


def cot_table():
    c = pd.read_csv(MAIN / 'analysis' / 'output' / 'cot-crowding-programme' / 'cot_weekly.csv')
    out = {}
    for name, sym in COT_FOR.items():
        g = c[c['sym'] == sym].sort_values('report_date').drop_duplicates('report_date', keep='last').reset_index(drop=True)
        share = np.where(g['oi'] > 0, (g['spec_long'] - g['spec_short']) / g['oi'], np.nan)
        rows = []
        for i in range(len(g)):
            cur = share[i]
            hist = share[max(0, i - 155):i]                     # the prior up-to-155 reports (worker: 156 rows, h = slice(1))
            n_total = min(i + 1, 156)
            if not np.isfinite(cur) or n_total < 52:
                continue
            h = hist[np.isfinite(hist)]
            pct = 50 if not len(h) else int(math.floor((h < cur).sum() / len(h) * 100 + 0.5))
            sh = float(f'{cur * 100:.2f}')
            if name in FLIPPED:
                pct, sh = 100 - pct, -sh
            rd = pd.Timestamp(g.loc[i, 'report_date'])
            rel = rd + pd.Timedelta(days=3, hours=20, minutes=30)
            rows.append((rel, {'pct': pct, 'share': sh, 'asOf': rel.strftime('%Y-%m-%dT%H:%M:%S.000Z'), 'source': f'cftc {sym} report {rd.date()}'}))
        out[name] = rows
    return out


def main():
    dates = issue_dates()
    rates_fp = {c: first_prints(k) for c, k in RATE_SRC.items()}
    dgs10 = daily_feature('y10_usd')
    gs10 = dgs10.resample('MS').mean().dropna()
    gs10_known = gs10.index + pd.offsets.MonthEnd(0) + pd.Timedelta(days=1)
    cpi = first_prints('cpi_usd')
    vix, vix3m = daily_feature('vix'), daily_feature('vix3m')
    tips = csv_series(MAIN / 'analysis' / 'output' / 'cot-crowding-programme' / 'macro_DFII10.csv')
    hy = pd.concat([csv_series(MAIN / 'analysis' / 'output' / 'rangebook' / 'macro' / 'BAMLH0A0HYM2.csv'), daily_feature('credit_hy_oas')])
    hy = hy[~hy.index.duplicated(keep='last')].sort_index()
    cot = cot_table()
    cot_t = {k: np.array([r[0] for r in v], dtype='datetime64[ns]') for k, v in cot.items()}
    bdays = pd.bdate_range('2008-01-01', LOCKBOX)

    out = (INP / 'macro_daily.jsonl').open('w')
    cov = {}
    for D in dates:
        ims = issue_ms(D)
        t_issue = pd.Timestamp(ims, unit='ms')
        prev_bd = bdays[bdays < D][-1]
        rec = {'date': D.strftime('%Y-%m-%d'), 'issueMs': ims, 'rates': {}, 'realYield': {}, 'cot': {}, 'risk': {}}
        for c, fp in rates_fp.items():
            k = known_series(fp, t_issue)
            if not len(k):
                continue
            vals = k['value'].tolist()
            z = latest_z(vals) if len(vals) >= 8 else None
            rec['rates'][c] = {'level': r2(vals[-1]), 'z': z, 'asOf': day_end(k['date'].iloc[-1]), 'source': f'{RATE_SRC[c]} first print'}
        y10 = gs10[gs10_known <= t_issue]
        ck = known_series(cpi, t_issue)
        if len(y10) and len(ck) > 12:
            cs = ck.set_index('date')['value']
            yoy = []
            for i, (d, v) in enumerate(cs.items()):
                ref = cs.iloc[i - 12] if i >= 12 else None
                yoy.append((d, float(f'{(v / ref - 1) * 100:.2f}') if ref else None))
            merged, ci = [], -1
            for d, yv in y10.items():
                while ci + 1 < len(yoy) and yoy[ci + 1][0] <= d:
                    ci += 1
                if ci < 0 or yoy[ci][1] is None:
                    continue
                merged.append((d, yv - yoy[ci][1]))
            if merged:
                z = latest_z([m[1] for m in merged]) if len(merged) >= 8 else None
                rec['realYield']['USD'] = {'level': r2(merged[-1][1]), 'z': z, 'asOf': day_end(merged[-1][0]), 'source': 'GS10 - CPI YoY first print'}
        tp = tips[tips.index < prev_bd]
        if len(tp) >= 21:
            rec['usReal'] = {'level': float(tp.iloc[-1]), 'chg20bp': int(round((tp.iloc[-1] - tp.iloc[-21]) * 100)), 'asOf': day_end(tp.index[-1]), 'source': 'FRED DFII10'}
        v = vix[vix.index < D]
        if len(v):
            yr, last = v.iloc[-252:], v.iloc[-1]
            rec['risk']['vix'] = {'level': float(last), 'pct1y': 100 * float((yr <= last).sum()) / len(yr), 'asOf': day_end(v.index[-1]), 'source': 'CBOE VIX (FRED VIXCLS)'}
            m3 = vix3m.get(v.index[-1])
            if m3 is not None and m3 > 0:
                rec['risk']['vixTerm'] = {'ratio': float(last / m3), 'asOf': day_end(v.index[-1]), 'source': 'VIX / VIX3M'}
        h = hy[hy.index < prev_bd]
        if len(h) >= 21:
            rec['risk']['hy'] = {'level': float(h.iloc[-1]), 'chg20bp': int(round((h.iloc[-1] - h.iloc[-21]) * 100)), 'asOf': day_end(h.index[-1]), 'source': 'FRED BAMLH0A0HYM2'}
        for name, rows in cot.items():
            j = int(np.searchsorted(cot_t[name], np.datetime64(t_issue), side='right')) - 1
            if j >= 0:
                rec['cot'][name] = rows[j][1]
        out.write(json.dumps(rec) + '\n')
        cv = cov.setdefault(D.year, {})
        cv['days'] = cv.get('days', 0) + 1
        cv['usReal'] = cv.get('usReal', 0) + ('usReal' in rec)
        for k in ('vix', 'vixTerm', 'hy'):
            cv[k] = cv.get(k, 0) + (k in rec['risk'])
        cv['rates_n'] = cv.get('rates_n', 0) + len(rec['rates'])
        cv['ratesZ_n'] = cv.get('ratesZ_n', 0) + sum(1 for x in rec['rates'].values() if x['z'] is not None)
        cv['realUSD'] = cv.get('realUSD', 0) + ('USD' in rec['realYield'])
        cv['cot_n'] = cv.get('cot_n', 0) + len(rec['cot'])
    out.close()
    (INP / 'macro_coverage.json').write_text(json.dumps(cov, indent=1))
    log('macro_daily.jsonl written', len(dates), 'days')
    for y, cv in sorted(cov.items()):
        print(y, cv)


if __name__ == '__main__':
    main()
