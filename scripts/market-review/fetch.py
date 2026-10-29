"""Fetch everything the weekly market review needs into one raw JSON.

Usage:  python -I scripts/market-review/fetch.py [--asof YYYY-MM-DD] [--out DIR]
Sources (all read-only, keyless unless noted):
  Yahoo chart API (FX, indices, ETFs, futures, US yields ^FVX ^TNX ^TYX), 2y history
  FRED fredgraph CSV (DGS2, DFII10, T10YIE, BAMLH0A0HYM2); FRED API instead if FRED_KEY is set.
    FRED blocks in bursts (403 / connection reset): failures are recorded, never silently dropped.
  ECB Data Portal (euro-area AAA 2y), Bundesbank (Bund 10y), BoE IADB (gilt 10y), Japan MoF (JGB 10y),
  Bank of Canada Valet (Canada 2y/10y)
  CFTC Socrata: TFF futures-only (gpe5-46if) and Disaggregated futures-only (72hh-3qpy), 3 years
  Nasdaq economic calendar (next 7 days; its 'gmt' column is US Eastern time; ?date=D holds day D-1)
  Local futures captures (if present): OAT/Bund/BTP futures -> French and Italian spread proxies;
    fed funds futures (analysis/output/stir/CBOT_ZQ*.csv) -> Fed path.
"""
import argparse, csv, datetime as dt, glob, io, json, os, re, sys, time, urllib.parse, urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from universe import UNIVERSE, REGIME_PAIRS  # noqa: E402

UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      'Accept': 'application/json, text/csv, text/html, */*'}  # Nasdaq throttles non-browser agents
def get(url, timeout=40, tries=2):
    last = None
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
                return r.read().decode('utf-8', 'replace')
        except Exception as e:  # noqa: BLE001
            last = e; time.sleep(1.5 * (i + 1))
    raise last

EXTRA_YAHOO = ['^FVX', '^TNX', '^TYX', 'HYG', 'TLT', 'LQD', 'RSP', 'SPY', 'SOXX', 'XLE', 'MTUM', 'EWZ', '^VIX', '^MOVE',
               'DX-Y.NYB', 'BZ=F', 'CL=F', 'ETH-USD']
FRED = ['DGS2', 'DFII10', 'T10YIE', 'BAMLH0A0HYM2', 'BAMLC0A0CM']

def yahoo(sym):
    j = json.loads(get(f'https://query1.finance.yahoo.com/v8/finance/chart/{urllib.parse.quote(sym)}?range=2y&interval=1d'))
    r = j['chart']['result'][0]
    q = r['indicators']['quote'][0]['close']
    # Date rule, checked 2026-10-24 by lagged correlation (EURUSD vs DX-Y.NYB is -0.89 same-day only this way):
    #  FX pairs (=X) are stamped ~23:00 UTC and belong to that UTC date; adding the London offset makes them a day late.
    #  Other symbols use the exchange-local date (an Asian index stamped 00:00 local = 15:00 UTC the day before).
    #  Yahoo repeats the live bar under the same date as the last close, so keep the last value per date.
    off = 0 if sym.endswith('=X') else r['meta'].get('gmtoffset', 0)
    out = {}
    for t, c in zip(r['timestamp'], q):
        if c is None: continue
        out[dt.datetime.fromtimestamp(t + off, dt.timezone.utc).strftime('%Y-%m-%d')] = c
    return [[k, v] for k, v in sorted(out.items())]

def fred(sid, start):
    key = os.environ.get('FRED_KEY')
    if key:
        j = json.loads(get(f'https://api.stlouisfed.org/fred/series/observations?series_id={sid}&api_key={key}&file_type=json&observation_start={start}'))
        return [[o['date'], float(o['value'])] for o in j['observations'] if o['value'] not in ('.', '')]
    rows = list(csv.reader(io.StringIO(get(f'https://fred.stlouisfed.org/graph/fredgraph.csv?id={sid}&cosd={start}', tries=3))))[1:]
    return [[a, float(b)] for a, b in rows if b not in ('', '.')]

def ecb_2y(start):
    txt = get(f'https://data-api.ecb.europa.eu/service/data/YC/B.U2.EUR.4F.G_N_A.SV_C_YM.SR_2Y?format=csvdata&startPeriod={start}')
    rd = csv.DictReader(io.StringIO(txt))
    return [[r['TIME_PERIOD'], float(r['OBS_VALUE'])] for r in rd if r.get('OBS_VALUE')]

def bund10():
    txt = get('https://api.statistiken.bundesbank.de/rest/download/BBSIS/D.I.ZAR.ZI.EUR.S1311.B.A604.R10XX.R.A.A._Z._Z.A?format=csv&lang=en')
    out = []
    for line in txt.splitlines():
        c = line.split(',')
        if re.match(r'^\d{4}-\d{2}-\d{2}$', c[0]) and len(c) > 1 and c[1] not in ('', '.'):
            try: out.append([c[0], float(c[1])])
            except ValueError: pass
    return out

MON = {m: f'{i:02d}' for i, m in enumerate(['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], 1)}
def gilt10(start):
    d = dt.date.fromisoformat(start)
    url = ('https://www.bankofengland.co.uk/boeapps/database/_iadb-fromshowcolumns.asp?csv.x=yes'
           f'&Datefrom={d.day:02d}/{list(MON)[d.month-1]}/{d.year}&Dateto=now&SeriesCodes=IUDMNZC&CSVF=TN&UsingCodes=Y&VPD=Y&VFD=N')
    out = []
    for line in get(url).strip().split('\n')[1:]:
        p = line.split(','); m = re.match(r'^(\d{2}) (\w{3}) (\d{4})$', p[0].strip())
        if m and len(p) > 1 and p[1].strip():
            out.append([f'{m[3]}-{MON[m[2]]}-{m[1]}', float(p[1])])
    return out

def jgb10():
    out = []
    for path in ['historical/jgbcme_all.csv', 'jgbcme.csv']:
        txt = get('https://www.mof.go.jp/english/policy/jgbs/reference/interest_rate/' + path, timeout=60)
        lines = [l.strip() for l in txt.split('\n') if l.strip()]
        hi = next((i for i, l in enumerate(lines) if l.startswith('Date,')), None)
        if hi is None: continue
        col = lines[hi].split(',').index('10Y')
        for l in lines[hi + 1:]:
            c = l.split(','); m = re.match(r'^(\d{4})/(\d{1,2})/(\d{1,2})$', c[0])
            if m and len(c) > col and c[col] not in ('', '-'):
                try: out.append([f'{m[1]}-{int(m[2]):02d}-{int(m[3]):02d}', float(c[col])])
                except ValueError: pass
    return out

def boc(start):
    j = json.loads(get(f'https://www.bankofcanada.ca/valet/observations/BD.CDN.2YR.DQ.YLD,BD.CDN.10YR.DQ.YLD/json?start_date={start}'))
    o2, o10 = [], []
    for ob in j['observations']:
        for k, arr in (('BD.CDN.2YR.DQ.YLD', o2), ('BD.CDN.10YR.DQ.YLD', o10)):
            v = ob.get(k, {}).get('v')
            if v not in (None, ''): arr.append([ob['d'], float(v)])
    return o2, o10

def cftc(dataset, start):
    out, off = [], 0
    while True:
        q = urllib.parse.urlencode({'$where': f"report_date_as_yyyy_mm_dd>'{start}'", '$limit': 50000, '$offset': off,
                                    '$order': 'report_date_as_yyyy_mm_dd'})
        rows = json.loads(get(f'https://publicreporting.cftc.gov/resource/{dataset}.json?{q}', timeout=120))
        out += rows
        if len(rows) < 50000: break
        off += 50000
    return out

def nasdaq_calendar(start, days=7):
    """Nasdaq sometimes answers 200 with no rows (rate limit). A weekday with < 10 rows is retried, then recorded
    as an error so the pack says so instead of showing a quiet week (see memory: silent empty feeds)."""
    # Nasdaq's ?date=D returns the events of US-Eastern day D-1 (documented in scripts/calendar/fetch_nasdaq_calendar.py;
    # checked 2026-10-24: the 2026-09-16 FOMC appears only under date=2026-09-17). So query day+1 and label it day.
    # The earnings endpoint does NOT have this offset (MSFT/GOOGL/META 2025-10-29 appear under date=2025-10-29).
    out = []
    for i in range(days):
        day = start + dt.timedelta(days=i); d = day.isoformat(); q = (day + dt.timedelta(days=1)).isoformat()
        try:
            rows = []
            for attempt in range(4):
                j = json.loads(get(f'https://api.nasdaq.com/api/calendar/economicevents?date={q}', timeout=30))
                rows = (j.get('data') or {}).get('rows') or []
                if len(rows) >= 10 or day.weekday() >= 5: break
                time.sleep(4 * (attempt + 1))
            if len(rows) < 10 and day.weekday() < 5:
                out.append({'date': d, 'error': f'only {len(rows)} calendar rows after retries'})
            time.sleep(1.5)
            for r in rows:
                out.append({'date': d, 'time_et': r.get('gmt'), 'country': r.get('country'), 'event': r.get('eventName'),
                            'consensus': (r.get('consensus') or '').replace('&nbsp;', '').strip(),
                            'previous': (r.get('previous') or '').replace('&nbsp;', '').strip()})
        except Exception as e:  # noqa: BLE001
            out.append({'date': d, 'error': str(e)})
    return out

def local_futures():
    """Daily closes (last bar per UTC date) of the newest local OAT/Bund/BTP futures captures, and the fed funds strip."""
    res = {}
    deep = os.path.join(ROOT, 'analysis', 'output', 'stir_1m_deep')
    try:
        import pandas as pd
        for key, pat in (('OAT', 'EUREX_FOAT*.parquet'), ('BUND', 'EUREX_FGBL*.parquet'), ('BTP', 'EUREX_FBTP*.parquet')):
            files = sorted(glob.glob(os.path.join(deep, pat)), key=os.path.getmtime)
            if not files: continue
            x = pd.read_parquet(files[-1]); x['d'] = x['time'].astype(str).str[:10]
            s = x.groupby('d')['close'].last()
            res[key] = {'file': os.path.basename(files[-1]), 'series': [[k, float(v)] for k, v in s.items()]}
    except Exception as e:  # noqa: BLE001
        res['error_eu'] = str(e)
    zq = {}
    for f in glob.glob(os.path.join(ROOT, 'analysis', 'output', 'stir', 'CBOT_ZQ*.csv')):
        m = re.search(r'ZQ([FGHJKMNQUVXZ])(\d)\.csv$', f)
        if not m: continue
        rows = list(csv.DictReader(open(f, encoding='utf-8')))
        if rows:
            zq[m[1] + m[2]] = {'last_time': rows[-1]['time'], 'implied': round(100 - float(rows[-1]['close']), 4),
                               'week_ago': round(100 - float(rows[max(0, len(rows) - 1 - 5 * 23)]['close']), 4)}
    res['ZQ'] = zq
    return res

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--asof', default=dt.date.today().isoformat())
    ap.add_argument('--out', default=None)
    ap.add_argument('--name', default=None, help="output folder name (default: the as-of date; the daily run uses 'latest')")
    a = ap.parse_args()
    asof = dt.date.fromisoformat(a.asof)
    out_dir = a.out or os.path.join(ROOT, 'analysis', 'output', 'market-review', a.name or a.asof)
    os.makedirs(out_dir, exist_ok=True)
    start2y = (asof - dt.timedelta(days=740)).isoformat()
    res = {'asof': a.asof, 'fetched_utc': dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds'),
           'yahoo': {}, 'series': {}, 'cftc': {}, 'calendar': [], 'local': {}, 'errors': []}

    syms = set(EXTRA_YAHOO)
    for m in UNIVERSE.values():
        syms.add(m['sym'])
        syms.update(k for k, _, _ in m['drivers'])
    for a_, b_, _, _ in REGIME_PAIRS: syms.update([a_, b_])
    syms = sorted(s for s in syms if any(ch in s for ch in '^=-.') or s.isupper() and len(s) <= 5 and s not in
                  {'US2Y', 'US10Y', 'US30Y', 'US5Y', 'DE10Y', 'GB10Y', 'JP10Y', 'CA2Y', 'CA10Y', 'EA2Y', 'FR_DE', 'IT_DE',
                   'DFII10', 'T10YIE'})
    syms = [s for s in syms if '_' not in s]
    for s in syms:
        try: res['yahoo'][s] = yahoo(s)
        except Exception as e: res['errors'].append(f'yahoo {s}: {e}')  # noqa: BLE001
        time.sleep(0.25)
    for sid in FRED:
        try: res['series'][sid] = fred(sid, start2y)
        except Exception as e: res['errors'].append(f'fred {sid}: {e}')  # noqa: BLE001
    for key, fn in (('EA2Y', lambda: ecb_2y(start2y)), ('DE10Y', bund10), ('GB10Y', lambda: gilt10(start2y)), ('JP10Y', jgb10)):
        try: res['series'][key] = [r for r in fn() if r[0] >= start2y]
        except Exception as e: res['errors'].append(f'{key}: {e}')  # noqa: BLE001
    try:
        res['series']['CA2Y'], res['series']['CA10Y'] = boc(start2y)
    except Exception as e: res['errors'].append(f'boc: {e}')  # noqa: BLE001
    start3y = (asof - dt.timedelta(days=3 * 365 + 10)).isoformat()
    for name, ds in (('tff', 'gpe5-46if'), ('disagg', '72hh-3qpy')):
        try:
            rows = cftc(ds, start3y)
            wanted = {m['cot'][1] for m in UNIVERSE.values() if m.get('cot') and m['cot'][0] == name}
            keep = {}
            for r in rows:
                nm = r.get('market_and_exchange_names', '').split(' - ')[0].strip()
                if nm in wanted:
                    keep.setdefault(nm, []).append({k: r.get(k) for k in (
                        'report_date_as_yyyy_mm_dd', 'open_interest_all',
                        'lev_money_positions_long', 'lev_money_positions_short', 'asset_mgr_positions_long', 'asset_mgr_positions_short',
                        'm_money_positions_long_all', 'm_money_positions_short_all', 'prod_merc_positions_long', 'prod_merc_positions_short')})
            res['cftc'][name] = keep
            missing = wanted - set(keep)
            if missing: res['errors'].append(f'cftc {name}: no rows for {sorted(missing)}')
        except Exception as e: res['errors'].append(f'cftc {name}: {e}')  # noqa: BLE001
    nxt = asof + dt.timedelta(days=1)
    res['calendar'] = nasdaq_calendar(nxt, 7)
    # Keep rows from an earlier run of the same as-of date for days this fetch could not get (flaky API).
    prev_path = os.path.join(out_dir, 'raw.json')
    if os.path.exists(prev_path):
        try:
            prev = json.load(open(prev_path, encoding='utf-8')).get('calendar', [])
            have = {e['date'] for e in res['calendar'] if 'error' not in e}
            kept = [e for e in prev if 'error' not in e and e['date'] not in have]
            if kept:
                res['calendar'] = [e for e in res['calendar'] if not ('error' in e and e['date'] in {k['date'] for k in kept})] + kept
                res['errors'].append(f'calendar: kept {len(kept)} rows from the previous run for {sorted({k["date"] for k in kept})}')
        except Exception as e: res['errors'].append(f'calendar merge: {e}')  # noqa: BLE001
    res['errors'] += [f'calendar {e["date"]}: {e["error"]}' for e in res['calendar'] if 'error' in e]
    res['local'] = local_futures()
    path = os.path.join(out_dir, 'raw.json')
    json.dump(res, open(path, 'w', encoding='utf-8'))
    print(f'wrote {path}: yahoo {len(res["yahoo"])}, series {len(res["series"])}, cftc {[len(v) for v in res["cftc"].values()]}, '
          f'calendar {len(res["calendar"])} rows')
    for e in res['errors']: print('  ERROR', e)

if __name__ == '__main__':
    main()
