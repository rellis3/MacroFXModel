"""Major + Moderate releases with surprise z (forge/NEWS_TOUCH_PREREG.md).
    python scripts/rangebook/news_prep.py  -> analysis/output/rangebook/news_releases.json
z = (actual - consensus) / SD of that event's past surprises (>= 12 prior, past only); null if not scorable."""
import json, re
import numpy as np, pandas as pd

def num(s):
    if not isinstance(s, str): return None
    m = re.search(r'-?\d+(\.\d+)?', s)
    if not m: return None
    return float(m.group(0)) * {'K': 1e3, 'M': 1e6, 'B': 1e9, 'T': 1e12}.get(s.strip()[-1:].upper(), 1)

c = pd.read_csv('calendar_events.csv', encoding='latin1', low_memory=False)
c = c[c['impact'].isin(['Major', 'Moderate'])].copy()
c['t'] = pd.to_datetime(c['datetime_raw'], errors='coerce', utc=True)
c = c.dropna(subset=['t']).sort_values('t')
hist, rel = {}, {}
for r in c.itertuples():
    a, f = num(r.actual), num(r.consensus); s = a - f if a is not None and f is not None else None
    k = (r.ccy, r.event); past = hist.setdefault(k, []); z = None
    if s is not None:
        if len(past) >= 12:
            sd = float(np.std(past, ddof=1)); z = round(s / sd, 3) if sd > 0 else None
        past.append(s)
    rel.setdefault(r.ccy, []).append([int(r.t.timestamp()), 'M' if r.impact == 'Major' else 'm', z])
json.dump(rel, open('analysis/output/rangebook/news_releases.json', 'w'))
for k, v in rel.items(): print(k, len(v), 'major', sum(x[1] == 'M' for x in v), 'with z', sum(x[2] is not None for x in v))
