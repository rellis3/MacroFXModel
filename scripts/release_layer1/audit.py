"""Release Reaction audit: re-derives the headline facts of each layer from the data, independently of the page code where possible.
    python scripts/release_layer1/audit.py   -> prints the facts and writes analysis/output/release_layer1/AUDIT_FACTS.json
Checks: (1) event counts and gaps against the expected monthly calendar, (2) surprise fields, (3) one release recomputed by hand from the raw parquet,
(4) 15-minute CFD fallback vs 1-minute futures where both exist, (5) daily Treasury path recomputed from the raw CSV, (6) Nasdaq daily vs minute day-0 sign,
(7) what exists for Layer 2 and Layer 3."""
import json, sys, io, urllib.request
from pathlib import Path
import numpy as np, pandas as pd
sys.path.insert(0, str(Path(__file__).resolve().parent))
from layer1_lib import *
from schedule import all_events

OUT = AO / 'release_layer1'
R = json.load(open(OUT / 'summary.json'))['rows']; P = json.load(open(OUT / 'paths.json'))
F = {}
df = pd.DataFrame([dict(id=r['id'], t=pd.Timestamp(r['t']), fam=r['family'], status=r['status'], act=r.get('actual'), con=r.get('consensus'), sur=r.get('surprise')) for r in R])
F['n_events'] = len(df); F['by_family'] = df.fam.value_counts().to_dict(); F['first'] = str(df.t.min()); F['last'] = str(df.t.max())

# 1. gaps: monthly families should have one release per calendar month between first and last
months = pd.period_range(df.t.min(), df.t.max(), freq='M'); gaps = {}
for fam in ('CPI', 'NFP'):
    have = set(df[df.fam == fam].t.dt.tz_convert(None).dt.to_period('M')); gaps[fam] = [str(m) for m in months if m not in have]
fo = df[df.fam == 'FOMC'].t.dt.tz_convert(None); gaps['FOMC_count'] = len(fo); gaps['FOMC_expected_approx'] = int(round(len(months) / 12 * 8))
F['calendar_gaps'] = gaps

# 2. surprise fields
F['surprise'] = dict(missing_actual=int(df.act.isna().sum()), missing_consensus=int(df.con.isna().sum()), zero=int((df.sur == 0).sum()), nonzero=int((df.sur.fillna(0) != 0).sum()),
                     fomc_nonzero=int(((df.fam == 'FOMC') & (df.sur.fillna(0) != 0)).sum()), by_family_nonzero={f: int(((df.fam == f) & (df.sur.fillna(0) != 0)).sum()) for f in df.fam.unique()})

# 3. hand recompute of one release (the first CPI in 2026-10) straight from the raw parquet, no library helpers other than the file path
ev = next(r for r in R if r['id'].startswith('2026-10-14'))
t = pd.Timestamp(ev['t']); raw = pd.read_parquet(DEEP / 'CME_SR3U6.parquet', columns=['time', 'close']); raw['time'] = pd.to_datetime(raw['time'], utc=True); raw = raw.set_index('time')['close']
b0 = raw[raw.index < t].iloc[-1]; b30 = raw[raw.index < t + pd.Timedelta(minutes=30)].iloc[-1]       # last bar that STARTED before the instant = ended by it (1-min bars)
by_hand = round(((100 - b30) - (100 - b0)) * 100, 3)
F['hand_recompute'] = dict(release=ev['id'], sofr_m30_page=ev['M']['sofr']['m30'], sofr_m30_by_hand=by_hand, match=bool(abs(by_hand - ev['M']['sofr']['m30']) < 1e-6))

# 4. CFD 15-min fallback vs 1-minute futures where both exist
S = load_sources(); rows = []
for r in R:
    t = pd.Timestamp(r['t'])
    for k in ('zt', 'zn'):
        src = S[k]
        if src.cfd is None or t >= pd.Timestamp('2026-08-22', tz='UTC'): continue
        one = next((a for a in src.cands if covers(a[1], t)), None)
        if one is None: continue
        s = one[1]; tr = src.tf(s); a = at_many(tr, [t, t + pd.Timedelta(minutes=30)])
        c = src.cfd; tc = src.tf(c); px = lambda tt: c.get(tt - pd.Timedelta(minutes=15), np.nan)
        b, e = px(t), px(t + pd.Timedelta(minutes=30))
        if np.isfinite(a).all() and np.isfinite([b, e]).all(): rows.append((k, a[1] - a[0], float(np.log(e / b) * 100)))
if rows:
    x = pd.DataFrame(rows, columns=['k', 'fut', 'cfd']); F['cfd_vs_futures'] = {k: dict(n=int((x.k == k).sum()), sign_agree=float((np.sign(q.fut) == np.sign(q.cfd)).mean()), corr=float(q.fut.corr(q.cfd)), median_abs_diff=float((q.fut - q.cfd).abs().median())) for k, q in x.groupby('k')}
else: F['cfd_vs_futures'] = 'no overlap'

# 5. daily path recomputed from the raw Treasury CSV (independent of daily_lib)
def tsy(kind, col):
    out = []
    for y in (2026,):
        url = f'https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/{y}/all?type={kind}&field_tdr_date_value={y}&page&_format=csv'
        d = pd.read_csv(io.StringIO(urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'}), timeout=40).read().decode()))
        out.append(d.assign(Date=pd.to_datetime(d.Date, format='%m/%d/%Y')).set_index('Date')[col])
    return pd.concat(out).sort_index()
try:
    y10 = tsy('daily_treasury_yield_curve', '10 Yr'); d = pd.Timestamp('2026-10-14'); i = y10.index.get_loc(d)
    hand = round((y10.iloc[i + 1] - y10.iloc[i - 1]) * 100, 3); page = ev['D']['y10'][7]
    F['daily_recompute'] = dict(release=ev['id'], y10_plus1d_page=page, y10_plus1d_by_hand=float(hand), match=bool(abs(hand - page) < 1e-6))
except Exception as e: F['daily_recompute'] = f'failed: {type(e).__name__}'

# 6. daily Nasdaq-100 day-0 vs the minute Nasdaq 30-min move: same sign more often than chance?
pairs = [(r['D']['nq'][6], r['M']['nq']['m30']) for r in R if r.get('D') and r['D'].get('nq') and r['D']['nq'][6] is not None and r['M'].get('nq') and r['M']['nq'].get('m30') is not None]
F['nq_day0_vs_30m'] = dict(n=len(pairs), sign_agree=float(np.mean([np.sign(a) == np.sign(b) for a, b in pairs])) if pairs else None)

# 7. layers: what exists
nz = lambda k, m: sum(1 for r in R if (r['M'].get(k) or {}).get(m) is not None)
F['layer3_zcond_cells'] = {k: nz(k, 'z_cond') for k in KEYS}; F['layer3_zcond_cells']['of'] = len(R)
F['res_1min_share'] = {k: round(sum(1 for r in R if (r['M'].get(k) or {}).get('res') == 1) / len(R), 2) for k in KEYS}
(OUT / 'AUDIT_FACTS.json').write_text(json.dumps(F, indent=1, default=str), encoding='utf-8'); print(json.dumps(F, indent=1, default=str))
