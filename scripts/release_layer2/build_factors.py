"""Release Reaction, Layer 2 (why): the going-in factor sheet. One row per release; every factor is a value known BEFORE the release (the last daily close before the release date,
or the calendar), so the sheet describes the setting and never uses the reaction. The Layer 1 outcomes are not copied in: the page joins them by release id, which keeps the two layers separate.
    python scripts/release_layer2/build_factors.py [--no-refresh] [--push]   -> analysis/output/release_layer2/factors.json (and POST to KV release_layer2_v1 with --push)
Exploratory and descriptive, not pre-registered (plans/RESEARCH_REGISTER.md row release-layer2). A factor here is a hypothesis about a driver, not an explanation, and none has been tested for effect."""
import argparse, json, sys, urllib.request
from datetime import datetime, timezone, date, timedelta
from pathlib import Path
import numpy as np, pandas as pd
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE)); sys.path.insert(0, str(HERE.parent / 'release_layer1'))
from layer1_lib import AO, DEEP, load_sources, _rd
from daily_lib import refresh_daily, load_daily, _close_from_minutes
from schedule import all_events, BASE
from register import R as REG, GROUPS, STATUS

OUT = AO / 'release_layer2'; OUT.mkdir(exist_ok=True)
KV_KEY = 'release_layer2_v1'
rate = lambda s: (100 - s) * 100                    # price -> rate in bp

# key, label, unit, family, one-line meaning (register items it stands for are in register.py)
DEFS = [
 ('strip_u6', 'SOFR Sep26 rate', '%', 'Priced in and policy', 'the rate the SOFR Sep26 future implies, at the pre-release close'),
 ('strip_slope', 'SOFR strip slope (Mar27 - Sep26)', 'bp', 'Priced in and policy', 'negative = easing priced over the next two quarters, positive = tightening'),
 ('strip_slope_chg5', 'SOFR strip slope, 5-day change', 'bp', 'Priced in and policy', 'did the market move its policy path in the week before'),
 ('eur_slope', 'Euribor strip slope (Mar27 - Dec26)', 'bp', 'Priced in and policy', 'the same read for the euro area'),
 ('line', 'SOFR - Euribor line', 'bp', 'Priced in and policy', 'the C.OG line, at the pre-release close'),
 ('y2', 'US 2y yield', '%', 'Priced in and policy', 'level'),
 ('y2_chg60', 'US 2y yield, 60-day change', 'bp', 'Priced in and policy', 'momentum in the policy-sensitive end'),
 ('c2s10s', '2s10s curve', 'bp', 'Priced in and policy', '10y minus 2y'),
 ('c3m10y', '3m10y curve', 'bp', 'Priced in and policy', '10y minus 3-month bill'),
 ('real10', '10y real yield', '%', 'Priced in and policy', 'level'),
 ('real10_chg20', '10y real yield, 20-day change', 'bp', 'Priced in and policy', ''),
 ('be10', '10y breakeven', '%', 'Priced in and policy', 'inflation priced in, level'),
 ('be10_chg20', '10y breakeven, 20-day change', 'bp', 'Priced in and policy', ''),
 ('vix', 'VIX', 'pt', 'Volatility and risk', 'level at the pre-release close'),
 ('vix_pct', 'VIX percentile', '%', 'Volatility and risk', 'rank within the previous 250 closes'),
 ('vix_chg5', 'VIX, 5-day change', 'pt', 'Volatility and risk', ''),
 ('nq_rv20', 'Nasdaq realised vol (20d)', '% ann.', 'Volatility and risk', 'standard deviation of daily returns x sqrt(252)'),
 ('nq_ret20', 'Nasdaq 20-day return', '%', 'Trend and cross-asset', ''),
 ('nq_dist50', 'Nasdaq vs its 50-day mean', '%', 'Trend and cross-asset', 'how stretched the index is'),
 ('dx_chg20', 'Dollar index 20-day change', '%', 'Trend and cross-asset', ''),
 ('gold_chg20', 'Gold 20-day change', '%', 'Trend and cross-asset', ''),
 ('corr60', 'Stock-bond correlation (60d)', 'r', 'Trend and cross-asset', 'Nasdaq daily return vs daily 10y yield change; positive = stocks fall when yields fall'),
 ('dow', 'Weekday', 'cat', 'Calendar and mechanics', 'release day of the week'),
 ('hour_utc', 'Release time (UTC)', 'h', 'Calendar and mechanics', ''),
 ('days_to_fomc', 'Days to next Fed decision', 'd', 'Calendar and mechanics', 'calendar days; 0 = the release is the decision'),
 ('days_since_fomc', 'Days since last Fed decision', 'd', 'Calendar and mechanics', ''),
 ('days_to_monthend', 'Days to month end', 'd', 'Calendar and mechanics', ''),
 ('days_to_qtrend', 'Days to quarter end', 'd', 'Calendar and mechanics', ''),
 ('opex_gap', 'Days from monthly option expiry', 'd', 'Calendar and mechanics', 'release date minus the third Friday of its month'),
 ('roll_week', 'Quarterly roll week', 'cat', 'Calendar and mechanics', 'yes = within 7 days before a quarterly futures expiry'),
 ('prev_surprise', 'Previous surprise, same release', 'own', 'Release history', 'actual minus consensus of the last release of this type, in its own unit'),
]
FAMILIES = ['Priced in and policy', 'Volatility and risk', 'Trend and cross-asset', 'Calendar and mechanics', 'Release history']


def third_friday(y, m):
    d = date(y, m, 1); first_fri = d + timedelta(days=(4 - d.weekday()) % 7); return first_fri + timedelta(days=14)


def build(refresh=True):
    note = refresh_daily() if refresh else 'daily not refreshed'
    S = load_sources(); D = load_daily(S)
    # strip and Euribor series as daily closes (rate bp)
    sofr = lambda f: _close_from_minutes(rate(_rd(DEEP / f)), 15.0)
    eurb = lambda f: _close_from_minutes(rate(_rd(DEEP / f)), 12.5)
    u6, h7, ez6, eh7 = sofr('CME_SR3U6.parquet'), sofr('CME_SR3H7.parquet'), eurb('ICEEU_IZ6.parquet'), eurb('ICEEU_IH7.parquet')
    slope = (h7 - u6).dropna(); eslope = (eh7 - ez6).dropna(); line = (u6 - eh7).dropna()
    EV = all_events(include_ahead=True)
    fomc = sorted({pd.Timestamp(e['t']).tz_convert('America/New_York').tz_localize(None).normalize() for e in EV if e['family'] == 'FOMC'})
    last_sur = {}; rows = []
    for e in EV:
        t = pd.Timestamp(e['t']); day = t.tz_convert('America/New_York').tz_localize(None).normalize()
        def pos(s):
            i = s.index.searchsorted(day) - 1                                   # last date strictly before the release date
            return i if i >= 0 else None
        def lvl(s, back=0):
            i = pos(s)
            return None if (i is None or i - back < 0) else float(s.iloc[i - back])
        def chg(s, n):
            a, b = lvl(s), lvl(s, n); return None if a is None or b is None else a - b
        f = {}
        a = lvl(u6); f['strip_u6'] = None if a is None else a / 100
        f['strip_slope'] = lvl(slope); f['strip_slope_chg5'] = chg(slope, 5); f['eur_slope'] = lvl(eslope); f['line'] = lvl(line)
        y2 = lvl(D['y2']); f['y2'] = None if y2 is None else y2 / 100; f['y2_chg60'] = chg(D['y2'], 60)
        y10, y3m = lvl(D['y10']), lvl(D['y3m']) if 'y3m' in D else None
        f['c2s10s'] = None if (y10 is None or y2 is None) else y10 - y2; f['c3m10y'] = None if (y10 is None or y3m is None) else y10 - y3m
        r = lvl(D['real10']); f['real10'] = None if r is None else r / 100; f['real10_chg20'] = chg(D['real10'], 20)
        b = lvl(D['be10']); f['be10'] = None if b is None else b / 100; f['be10_chg20'] = chg(D['be10'], 20)
        vx = D['vix']; i = pos(vx)
        f['vix'] = lvl(vx); f['vix_chg5'] = chg(vx, 5)
        f['vix_pct'] = None if (i is None or i < 60) else round(100 * float((vx.iloc[max(0, i - 249):i + 1] <= vx.iloc[i]).mean()), 1)
        nq = D['nq']; i = pos(nq); rt = nq.diff()
        f['nq_rv20'] = None if (i is None or i < 25) else float(rt.iloc[i - 19:i + 1].std() * np.sqrt(252))
        f['nq_ret20'] = chg(nq, 20); f['nq_dist50'] = None if (i is None or i < 50) else float(nq.iloc[i] - nq.iloc[i - 49:i + 1].mean())
        f['dx_chg20'] = chg(D['dx'], 20); f['gold_chg20'] = chg(D['gold'], 20)
        if i is not None and i >= 70:
            j = pd.concat([rt, D['y10'].diff()], axis=1, keys=['q', 'y'], sort=True).dropna(); j = j[j.index <= nq.index[i]].iloc[-60:]
            f['corr60'] = round(float(j.q.corr(j.y)), 3) if len(j) >= 40 else None
        else: f['corr60'] = None
        f['dow'] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][day.weekday()]; f['hour_utc'] = round(t.hour + t.minute / 60, 2)
        nxt = [d for d in fomc if d >= day]; prv = [d for d in fomc if d < day]
        f['days_to_fomc'] = int((nxt[0] - day).days) if nxt else None; f['days_since_fomc'] = int((day - prv[-1]).days) if prv else None
        eom = (day + pd.offsets.MonthEnd(0)); f['days_to_monthend'] = int((eom - day).days)
        qe = pd.Timestamp(day.year, ((day.month - 1) // 3 + 1) * 3, 1) + pd.offsets.MonthEnd(0); f['days_to_qtrend'] = int((qe - day).days)
        tf = pd.Timestamp(third_friday(day.year, day.month)); f['opex_gap'] = int((day - tf).days)
        f['roll_week'] = 'yes' if (day.month in (3, 6, 9, 12) and -7 <= (day - tf).days <= 0) else 'no'
        f['prev_surprise'] = last_sur.get(e['family'])
        if e.get('actual') is not None and e.get('consensus') is not None: last_sur[e['family']] = round(e['actual'] - e['consensus'], 4)
        f = {k: (None if v is None or (isinstance(v, float) and not np.isfinite(v)) else (round(v, 3) if isinstance(v, float) else v)) for k, v in f.items()}
        rows.append(dict(id=f"{t.strftime('%Y-%m-%dT%H:%M:%SZ')}|{e['family']}", t=t.strftime('%Y-%m-%dT%H:%M:%SZ'), family=e['family'], name=e['name'], status=e['status'], f=f))
    last = {k: str(v.index.max().date()) for k, v in {'treasury y2': D['y2'], 'vix': D['vix'], 'nasdaq100': D['nq'], 'sofr strip': u6, 'euribor strip': eh7}.items()}
    reg = [dict(n=n, item=it, group=g, status=st, note=nt) for n, it, g, st, nt in REG]
    on_sheet = sum(1 for r in reg if r['status'] == 'sheet')
    return dict(built=datetime.now(timezone.utc).isoformat(), note=note, lastData=last, defs=[dict(key=k, label=l, unit=u, family=fa, meaning=m) for k, l, u, fa, m in DEFS], families=FAMILIES,
                rows=rows, register=reg, groups=GROUPS, statusLabels=STATUS, onSheet=on_sheet)


def kv_set(obj):
    body = json.dumps({'key': KV_KEY, 'data': obj, 'timestamp': int(datetime.now(timezone.utc).timestamp() * 1000)}).encode()
    req = urllib.request.Request(f'{BASE}/api/kv/set', data=body, headers={'Content-Type': 'application/json'}, method='POST')
    with urllib.request.urlopen(req, timeout=60) as r: return r.getcode(), r.read().decode()[:120]


if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('--no-refresh', action='store_true'); ap.add_argument('--push', action='store_true'); a = ap.parse_args()
    P = build(refresh=not a.no_refresh)
    (OUT / 'factors.json').write_text(json.dumps(P, separators=(',', ':')), encoding='utf-8')
    miss = {d['key']: sum(1 for r in P['rows'] if r['f'].get(d['key']) is None) for d in P['defs']}
    print(f"{len(P['rows'])} releases, {len(P['defs'])} factors, {P['onSheet']} register items on the sheet; {P['note']}; last data {P['lastData']}")
    print('missing values per factor:', {k: v for k, v in miss.items() if v})
    if a.push: code, resp = kv_set(P); print(f'POST /api/kv/set {KV_KEY} ({len(json.dumps(P)) // 1024} KB) -> HTTP {code} {resp}')
