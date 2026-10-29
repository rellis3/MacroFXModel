"""Release Reaction, Layer 1, the days view: what each asset did in the days around a release (run-up before, release day, and 1-5 trading days after).
Daily closes: US 2y and 10y yields, 10y real yield and 10y breakeven (US Treasury), dollar index and Nasdaq-100 (Yahoo), and the SOFR Sep26 leg, Euribor Mar27 leg and their line
(the last 1-minute bar at or before the 17:00 New York close; the Euribor future stops trading at 19:00 London so its close is earlier). One trading-day calendar per series.
Path convention: P[k] = level(day D+k) - level(day D-1), for k = -6..+5 trading days, where D is the New York date of the release. So P[-1] = 0, P[0] is the release-day close
(it includes the hours before the release as well), P[+1] the next day, and the run-up is the 5 days to the pre-release close = -P[-6]. Rates and spreads in bp, prices as log %.
Descriptive only. The Treasury yields are end-of-day quotes, a few minutes before the futures close, which is immaterial at day horizons."""
import csv, io, json, time, urllib.request
from datetime import datetime, timezone
import numpy as np, pandas as pd
from layer1_lib import AO

OUTDIR = AO / 'release_layer1'
CACHE = OUTDIR / 'daily.json'
KS = list(range(-6, 6))
DKEYS = ['sofr', 'eur', 'spr', 'y2', 'y10', 'real10', 'be10', 'dx', 'nq', 'eurusd', 'gbpusd', 'usdjpy', 'gold', 'es', 'vix', 'vxn', 'gilt', 'bund', 'ftse', 'dax', 'nikkei']
MINUTE_DAILY = ['eurusd', 'gbpusd', 'usdjpy', 'gold', 'es', 'gilt', 'bund', 'ftse', 'dax', 'nikkei']      # daily closes built from the 1-minute sources (CFD, then futures), chained by returns so no level is ever spliced
DLABEL = {'sofr': 'SOFR Sep26 leg (bp)', 'eur': 'Euribor Mar27 leg (bp)', 'spr': 'SOFR - Euribor line (bp)', 'y2': 'US 2y yield (bp)', 'y10': 'US 10y yield (bp)',
          'real10': '10y real yield (bp)', 'be10': '10y breakeven (bp)', 'dx': 'Dollar index (%)', 'nq': 'Nasdaq-100 (%)',
          'eurusd': 'EUR/USD (%)', 'gbpusd': 'GBP/USD (%)', 'usdjpy': 'USD/JPY (%)', 'gold': 'Gold (%)', 'es': 'S&P 500 (%)', 'vix': 'VIX (points)', 'vxn': 'VXN (points)',
          'gilt': 'UK 10y gilt price (%)', 'bund': 'German 10y Bund price (%)', 'ftse': 'FTSE 100 (%)', 'dax': 'DAX (%)', 'nikkei': 'Nikkei 225 (%)'}
MIN_ET = {'gilt': 10.0, 'bund': 10.0}      # the gilt and Bund CFDs stop with the London / Frankfurt session (about 11:00-12:00 New York), so their daily close is the last bar of that session
TREASURY = {'y2': ('daily_treasury_yield_curve', '2 Yr'), 'y10': ('daily_treasury_yield_curve', '10 Yr'), 'real10': ('daily_treasury_real_yield_curve', '10 YR'), 'y3m': ('daily_treasury_yield_curve', '3 Mo')}
YAHOO = {'dx': 'DX-Y.NYB', 'nq': '^NDX', 'vix': '^VIX', 'vxn': '^VXN'}
UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36', 'Accept': 'application/json, text/csv, */*'}
START = '2024-01-01'


def _get(url, timeout=40, tries=3):
    last = None
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r: return r.read().decode('utf-8', 'replace')
        except Exception as e: last = e; time.sleep(1.5 * (i + 1))
    raise last


def _treasury(kind, col, year):
    """US Treasury daily par yield curve / real yield curve (the source FRED copies); returns [[iso date, %], ...] for one column"""
    url = f'https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/{year}/all?type={kind}&field_tdr_date_value={year}&page&_format=csv'
    out = []
    for r in csv.DictReader(io.StringIO(_get(url))):
        v = r.get(col)
        if v not in (None, ''): out.append([datetime.strptime(r['Date'], '%m/%d/%Y').strftime('%Y-%m-%d'), float(v)])
    return sorted(out)


def _treasury_all(kind, col):
    out = []
    for y in range(2024, datetime.now(timezone.utc).year + 1): out += _treasury(kind, col, y)
    return out


def _yahoo(sym):
    """exchange-local date for non-FX symbols (checked in scripts/market-review/fetch.py); Yahoo repeats the live bar under the last date, so keep the last value per date"""
    import urllib.parse
    j = json.loads(_get(f'https://query1.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(sym)}?range=3y&interval=1d'))
    r = j['chart']['result'][0]; off = r['meta'].get('gmtoffset', 0); out = {}
    for t, c in zip(r['timestamp'], r['indicators']['quote'][0]['close']):
        if c is None: continue
        out[datetime.fromtimestamp(t + off, timezone.utc).strftime('%Y-%m-%d')] = c
    return [[k, v] for k, v in sorted(out.items())]


def refresh_daily(max_age_h=0.0):
    """fetch the FRED/Yahoo daily series into the cache; per series, a failure keeps the cached copy and is recorded (FRED blocks in bursts). Returns the note."""
    OUTDIR.mkdir(exist_ok=True)
    cur = json.loads(CACHE.read_text(encoding='utf-8')) if CACHE.exists() else dict(series={}, fetched=None, errors={})
    if cur.get('fetched') and max_age_h and (datetime.now(timezone.utc) - datetime.fromisoformat(cur['fetched'])).total_seconds() < max_age_h * 3600: return 'daily cache fresh'
    errs = {}
    for k, (kind, col) in TREASURY.items():
        try: cur['series'][k] = _treasury_all(kind, col)
        except Exception as e: errs[k] = f'Treasury {col}: {type(e).__name__}'
    try:                                                                                               # 10y breakeven = nominal 10y - real 10y (FRED's T10YIE is built the same way)
        n, r = dict(cur['series']['y10']), dict(cur['series']['real10']); cur['series']['be10'] = [[d, round(n[d] - r[d], 4)] for d in sorted(n) if d in r]
    except Exception as e: errs['be10'] = f'breakeven: {type(e).__name__}'
    for k, sym in YAHOO.items():
        try: cur['series'][k] = _yahoo(sym)
        except Exception as e: errs[k] = f'Yahoo {sym}: {type(e).__name__}'
    cur['errors'] = errs; cur['fetched'] = datetime.now(timezone.utc).isoformat()
    CACHE.write_text(json.dumps(cur, separators=(',', ':')), encoding='utf-8')
    return 'daily refreshed' + (f' ({len(errs)} failed, cache kept: {"; ".join(errs.values())})' if errs else '')


def _close_from_minutes(s, min_et):
    """daily close of a 1-minute series: the last bar of each New York date that starts at or before 17:00 and no earlier than min_et (hours), else no close that day"""
    x = s.copy(); et = x.index.tz_convert('America/New_York'); h = et.hour + et.minute / 60
    x = x[h <= 17]; et = et[h <= 17]; h = h[h <= 17]
    df = pd.DataFrame(dict(v=x.values, h=h, d=et.date), index=x.index)
    g = df.groupby('d').last(); g = g[g.h >= min_et]
    return pd.Series(g.v.values, index=pd.to_datetime(g.index))


def load_daily(S):
    """-> dict key -> pd.Series (index = trading date, values in the unit of the series: yields as %, spreads/rates as bp (rate), prices as log %)"""
    D = {}
    c = json.loads(CACHE.read_text(encoding='utf-8')) if CACHE.exists() else dict(series={})
    for k in ('y2', 'y10', 'real10', 'be10', 'y3m'):
        if c['series'].get(k): D[k] = pd.Series([v * 100 for _, v in c['series'][k]], index=pd.to_datetime([d for d, _ in c['series'][k]]))            # % -> bp
    for k in ('dx', 'nq'):
        if c['series'].get(k): D[k] = pd.Series([np.log(v) * 100 for _, v in c['series'][k]], index=pd.to_datetime([d for d, _ in c['series'][k]]))
    for k in ('vix', 'vxn'):                                                                           # points, not %
        if c['series'].get(k): D[k] = pd.Series([v for _, v in c['series'][k]], index=pd.to_datetime([d for d, _ in c['series'][k]]))
    for k in MINUTE_DAILY:                                                                             # per source: NY-close log-returns between consecutive closes of that source; first source wins a date, later ones fill the rest; level = cumulative return
        rets = []
        for _, ser in S[k].cands:
            cl = _close_from_minutes(S[k].tf(ser), MIN_ET.get(k, 15.5))
            if len(cl) > 1: rets.append(cl.diff().dropna())
        if rets:
            r = rets[0]
            for x in rets[1:]: r = r.combine_first(x)
            D[k] = r.sort_index().cumsum()
    sf = next((s for _, s in S['sofr'].cands), None); eu = next((s for _, s in S['eur'].cands), None)
    if sf is not None: D['sofr'] = _close_from_minutes(S['sofr'].tf(sf), 15.0)
    if eu is not None: D['eur'] = _close_from_minutes(S['eur'].tf(eu), 12.5)
    if 'sofr' in D and 'eur' in D: D['spr'] = (D['sofr'] - D['eur']).dropna()
    return {k: v[~v.index.duplicated(keep='last')].sort_index() for k, v in D.items()}


def daily_path(D, key, day, family=None):
    """P[k] for k=-6..+5 trading days around release date `day` (a pd.Timestamp at midnight), relative to the close of the day before; None where the series has no data"""
    s = D.get(key)
    if s is None or day not in s.index: return None
    i = s.index.get_loc(day)
    if i < 7: return None
    base = s.iloc[i - 1]
    out = []
    for k in KS:
        j = i + k
        out.append(None if j >= len(s) else round(float(s.iloc[j] - base), 3))
    if key == 'eur' and family == 'FOMC': out[KS.index(0)] = None       # the Euribor future has stopped trading before a US evening decision, so release-day is not a reaction
    return out
