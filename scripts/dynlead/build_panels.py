"""COG-DYNAMIC-LEAD data build: daily yield panel (US, Germany, Japan, UK) and daily asset closes at 17:00 New York.
    python scripts/dynlead/build_panels.py
Writes analysis/output/dynlead/yields_daily.parquet, assets_daily.parquet, panel_audit.md
Yields: FRED fredgraph.csv (DGS3MO, DGS1, DGS2, DGS5, DGS10, DGS30), Bundesbank BBSIS Svensson par yields (R01XX R02XX R05XX R10XX R30XX), MoF Japan jgbcme_all.csv (2Y 5Y 10Y 30Y),
BoE IADB 10y gilt. Assets: OANDA 1-minute research cache (VolRangeForecaster/data/m1), last close at or before 17:00 America/New_York, to 2026-08-20 only (the later forward block is reserved).
"""
import io
import re
import urllib.request
from pathlib import Path
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'analysis' / 'output' / 'dynlead'
OUT.mkdir(parents=True, exist_ok=True)
UA = {'User-Agent': 'Mozilla/5.0 MacroFXResearch'}
START = '2005-01-01'


def get(url, timeout=60):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode('utf-8', errors='replace')


def fred(series):
    txt = get(f'https://fred.stlouisfed.org/graph/fredgraph.csv?id={series}&cosd={START}')
    df = pd.read_csv(io.StringIO(txt))
    df.columns = ['date', 'v']
    df['v'] = pd.to_numeric(df['v'], errors='coerce')
    return pd.Series(df['v'].values, index=pd.to_datetime(df['date']), name=series).dropna()


def bund(code):
    txt = get(f'https://api.statistiken.bundesbank.de/rest/data/BBSIS/D.I.ZST.ZI.EUR.S1311.B.A604.{code}.R.A.A._Z._Z.A?format=csv&startPeriod={START}')
    rows = []
    for ln in txt.split('\n'):
        m = re.match(r'^"?(\d{4}-\d{2}-\d{2})"?;"?(-?\d+[.,]?\d*)"?', ln.strip())
        if m:
            rows.append((m.group(1), float(m.group(2).replace(',', '.'))))
    s = pd.Series({pd.Timestamp(d): v for d, v in rows}, name=code).sort_index()
    return s


def jgb(tenor):
    txt = get('https://www.mof.go.jp/english/policy/jgbs/reference/interest_rate/historical/jgbcme_all.csv')
    lines = [ln.strip() for ln in txt.split('\n') if ln.strip()]
    hi = next(i for i, ln in enumerate(lines) if ln.startswith('Date,'))
    cols = lines[hi].split(',')
    c = cols.index(tenor)
    rows = []
    for ln in lines[hi + 1:]:
        p = ln.split(',')
        if len(p) <= c:
            continue
        m = re.match(r'^(\d{4})/(\d{1,2})/(\d{1,2})$', p[0])
        if not m:
            continue
        try:
            v = float(p[c])
        except ValueError:
            continue
        rows.append((pd.Timestamp(int(m.group(1)), int(m.group(2)), int(m.group(3))), v))
    return pd.Series(dict(rows), name=f'JP{tenor}').sort_index()


def gilt10():
    txt = get('https://www.bankofengland.co.uk/boeapps/database/_iadb-fromshowcolumns.asp?csv.x=yes&Datefrom=01/Jan/2005&Dateto=now&SeriesCodes=IUDMNZC&CSVF=TN&UsingCodes=Y&VPD=Y&VFD=N')
    rows = []
    for ln in txt.strip().split('\n')[1:]:
        p = ln.split(',')
        try:
            rows.append((pd.to_datetime(p[0].strip(), format='%d %b %Y'), float(p[1])))
        except Exception:
            continue
    return pd.Series(dict(rows), name='GB10').sort_index()


Y = {}
for name, fn in (('US3M', lambda: fred('DGS3MO')), ('US1', lambda: fred('DGS1')), ('US2', lambda: fred('DGS2')), ('US5', lambda: fred('DGS5')), ('US10', lambda: fred('DGS10')), ('US30', lambda: fred('DGS30')),
                 ('DE1', lambda: bund('R01XX')), ('DE2', lambda: bund('R02XX')), ('DE5', lambda: bund('R05XX')), ('DE10', lambda: bund('R10XX')), ('DE30', lambda: bund('R30XX')),
                 ('JP2', lambda: jgb('2Y')), ('JP5', lambda: jgb('5Y')), ('JP10', lambda: jgb('10Y')), ('JP30', lambda: jgb('30Y')), ('GB10', gilt10)):
    try:
        s = fn()
        s = s[s.index >= START]
        Y[name] = s
        print(f'{name}: {len(s)} obs {s.index[0].date()} -> {s.index[-1].date()}', flush=True)
    except Exception as e:
        print(f'{name}: FAILED {type(e).__name__} {e}', flush=True)
yd = pd.DataFrame(Y).sort_index()
yd.to_parquet(OUT / 'yields_daily.parquet')

# ---- asset closes at 17:00 New York (last 1-minute close at or before the cut, per New York trading day that starts 17:00 the day before)
M1 = ROOT / 'VolRangeForecaster' / 'data' / 'm1'
ASSETS = {'EURUSD': 'eurusd', 'GBPUSD': 'gbpusd', 'USDJPY': 'usdjpy', 'USDCHF': 'usdchf', 'USDCAD': 'usdcad', 'AUDUSD': 'audusd', 'NZDUSD': 'nzdusd', 'EURGBP': 'eurgbp', 'EURJPY': 'eurjpy', 'EURCHF': 'eurchf',
          'EURAUD': 'euraud', 'EURCAD': 'eurcad', 'EURNZD': 'eurnzd', 'GBPJPY': 'gbpjpy', 'GBPCHF': 'gbpchf', 'GBPAUD': 'gbpaud', 'GBPCAD': 'gbpcad', 'GBPNZD': 'gbpnzd', 'AUDJPY': 'audjpy',
          'AUDCAD': 'audcad', 'AUDCHF': 'audchf', 'AUDNZD': 'audnzd', 'CADJPY': 'cadjpy', 'CADCHF': 'cadchf', 'CHFJPY': 'chfjpy', 'NZDJPY': 'nzdjpy', 'NZDCAD': 'nzdcad',
          'GOLD': 'xauusd', 'SPX500': 'spx500', 'US30': 'us30', 'US2000': 'us2000', 'NAS100': 'nq', 'DE30': 'de30', 'UK100': 'uk100'}
closes = {}
for nm, f in ASSETS.items():
    p = M1 / f'{f}_m1.parquet'
    if not p.exists():
        print(nm, 'MISSING file', f)
        continue
    d = pd.read_parquet(p)['close']
    d.index = pd.to_datetime(d.index, utc=True)
    d = d[d.index <= pd.Timestamp('2026-08-20 23:59', tz='UTC')]
    ny = d.index.tz_convert('America/New_York')
    day = (ny + pd.Timedelta(hours=7)).normalize()                  # a trading day = 17:00 ET to 17:00 ET, labelled by the date it closes
    g = d.groupby(day.tz_localize(None)).last()
    cnt = d.groupby(day.tz_localize(None)).count()
    g = g[cnt >= 60]                                                # at least an hour of minutes in the day
    g = g[g.index.dayofweek < 5]
    closes[nm] = g
    print(f'{nm}: {len(g)} days {g.index[0].date()} -> {g.index[-1].date()}', flush=True)
ad = pd.DataFrame(closes).sort_index()
ad = ad[(ad.index >= '2008-01-01') & (ad.index <= '2026-08-20')]          # the 2026-08-21 label would be a partial trading day (cache ends 2026-08-20 23:59 UTC)
ad.to_parquet(OUT / 'assets_daily.parquet')

aud = ['# COG-DYNAMIC-LEAD panel audit', '', '## Yields (daily, % p.a.)', '']
for c in yd.columns:
    s = yd[c].dropna()
    aud.append(f'- {c}: {len(s)} obs, {s.index[0].date()} to {s.index[-1].date()}, missing business days since 2016: {int((~yd.loc["2016-01-01":, c].notna()).sum())}')
aud += ['', '## Assets (daily close at 17:00 New York)', '']
for c in ad.columns:
    s = ad[c].dropna()
    aud.append(f'- {c}: {len(s)} days, {s.index[0].date()} to {s.index[-1].date()}')
(OUT / 'panel_audit.md').write_text('\n'.join(aud), encoding='utf-8')
print('done')
