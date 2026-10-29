"""Release schedule for the Release Reaction page: which US releases, when, and what the surprise was.
History 2024-04 -> 2026-07-02: the repo's own event table (FOMC, core CPI, payrolls). From 2026-07-03 on: the server's surprise store (/api/econ-surprise) for what has printed, and the
server's calendar feed (/api/calendar-feed) for what is ahead. Families: FOMC (rate decision), CPI (core m/m), NFP, plus the other tier-1 US prints (core PCE, GDP, core retail sales) from the
store onward, so next week's releases are covered as well as the three the earlier tables used.
"""
import json
import urllib.request
from datetime import datetime, timezone
import numpy as np, pandas as pd
from layer1_lib import ROOT

BASE = 'https://macrofxmodel-production.up.railway.app'
FAMILY = {'federal funds rate': 'FOMC', 'core cpi m/m': 'CPI', 'non-farm employment change': 'NFP',
          'core pce price index m/m': 'PCE', 'advance gdp q/q': 'GDP', 'core retail sales m/m': 'RETAIL'}
HIST_END = pd.Timestamp('2026-07-03', tz='UTC')


def _get(path, timeout=90):
    return json.load(urllib.request.urlopen(BASE + path, timeout=timeout))


def _num(x):
    try: return float(str(x).replace('%', '').replace(',', '').replace('K', 'e3').replace('M', 'e6').replace('B', 'e9'))
    except ValueError: return np.nan


def history_events():
    E = pd.read_parquet(ROOT / 'analysis' / 'output' / 'rate-surprise-events' / 'events.parquet')
    E = E[(E.t >= pd.Timestamp('2024-04-15', tz='UTC')) & (E.t < HIST_END)].sort_values('t')
    return [dict(t=r.t, family=r.family, name={'FOMC': 'Fed rate decision', 'CPI': 'Core CPI m/m', 'NFP': 'Non-farm payrolls'}[r.family], actual=_nz(r.actual), consensus=_nz(r.consensus), status='history') for r in E.itertuples()]


def _nz(x):
    return None if x is None or (isinstance(x, float) and not np.isfinite(x)) else float(x)


def printed_events(since='2026-07-03'):
    """US prints from the surprise store (a thin store: some releases are missing, which the page says rather than hides)"""
    d = _get(f'/api/econ-surprise?since={since}&history=1', 120)
    out = []
    for key, rows in d['series'].items():
        if not key.startswith('US|'): continue
        fam = FAMILY.get(key[3:])
        if not fam: continue
        for x in rows:
            t = pd.Timestamp(x['ms'], unit='ms', tz='UTC')
            if t < HIST_END or x.get('actual') in (None, ''): continue
            out.append(dict(t=t, family=fam, name={'FOMC': 'Fed rate decision', 'CPI': 'Core CPI m/m', 'NFP': 'Non-farm payrolls', 'PCE': 'Core PCE m/m', 'GDP': 'GDP q/q', 'RETAIL': 'Core retail sales m/m'}[fam],
                            actual=_nz(_num(x['actual'])), consensus=_nz(_num(x['estimate'])), status='printed'))
    return out


def upcoming_events():
    """US high-impact releases ahead from the server's calendar feed (ForexFactory week), restricted to the same families"""
    d = _get('/api/calendar-feed', 60); out = []
    for day in d.get('ahead', []):
        for e in day['events']:
            if e.get('ccy') != 'USD': continue
            fam = FAMILY.get(str(e['event']).lower())
            if not fam: continue
            out.append(dict(t=pd.Timestamp(e['ms'], unit='ms', tz='UTC'), family=fam, name={'FOMC': 'Fed rate decision', 'CPI': 'Core CPI m/m', 'NFP': 'Non-farm payrolls', 'PCE': 'Core PCE m/m', 'GDP': 'GDP q/q', 'RETAIL': 'Core retail sales m/m'}[fam],
                            actual=None, consensus=_nz(_num(e.get('forecast'))), previous=e.get('previous'), status='upcoming'))
    return out


def all_events(include_ahead=True, usdjpy=None):
    """US releases plus the central-bank and fiscal events (cb_schedule.py); usdjpy = a 1-minute USD/JPY series for timing the BoJ"""
    from cb_schedule import cb_events
    now = pd.Timestamp.now(tz='UTC'); cb = cb_events(usdjpy)
    ev = history_events() + printed_events() + [e for e in cb if e['t'] <= now]
    if include_ahead:
        ev += [e for e in cb if e['t'] > now]
        have = {(e['t'], e['family']) for e in ev}
        ev += [e for e in upcoming_events() if (e['t'], e['family']) not in have and e['t'] > pd.Timestamp.now(tz='UTC')]
    seen = set(); res = []
    for e in sorted(ev, key=lambda z: z['t']):
        k = (e['t'], e['family'])
        if k in seen: continue
        seen.add(k); res.append(e)
    return res
