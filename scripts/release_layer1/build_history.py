"""Release Reaction, Layer 1: build the history record (every release with data on disk) and the clock check.
    python scripts/release_layer1/build_history.py   -> analysis/output/release_layer1/{summary.json, paths.json, LAYER1_CHECKS.md}
summary.json = one row per release (metrics for each asset, agreement, clock offset); paths.json = the rebased minute paths (served one event at a time, the page never downloads it whole).
Exploratory, descriptive, not pre-registered (plans/RESEARCH_REGISTER.md row release-layer1)."""
import json, sys
from pathlib import Path
import numpy as np, pandas as pd
sys.path.insert(0, str(Path(__file__).resolve().parent))
from layer1_lib import *
from schedule import all_events

OUT = AO / 'release_layer1'; OUT.mkdir(exist_ok=True)
S = load_sources()
EV = all_events(include_ahead=False)
event_days = {e['t'].date() for e in EV}
rows, paths, skipped = [], {}, []
for e in EV:
    if S['sofr'].cands and not covers(S['sofr'].cands[0][1], e['t']): skipped.append(e); continue
    r, P = build_event(S, e, event_days); r['id'] = f"{r['t']}|{e['family']}"
    rows.append(r); paths[r['id']] = P
print(len(rows), 'events built;', len(skipped), 'skipped (no leg data)')
(OUT / 'summary.json').write_text(json.dumps(dict(built=pd.Timestamp.now(tz='UTC').isoformat(), n=len(rows), rows=rows, offs=[OFFS[0], OFFS[-1]]), separators=(',', ':')), encoding='utf-8')
(OUT / 'paths.json').write_text(json.dumps(paths, separators=(',', ':')), encoding='utf-8')

# ---- checks (the clock, the coverage, the thin quotes) ----
D = pd.DataFrame([dict(id=r['id'], t=pd.Timestamp(r['t']), fam=r['family'], jump=r['jump'], thin_eur=(r['M']['eur'] or {}).get('m30') is None, **{f'{k}_m30': (r['M'][k] or {}).get('m30') for k in KEYS}) for r in rows])
md = ['# Release Reaction, Layer 1: data checks', '', f'Releases built: {len(rows)} ({", ".join(f"{k} {v}" for k, v in D.fam.value_counts().items())}); skipped for no leg data: {len(skipped)}.', '',
      '## Clock check: which minute holds the largest 1-minute move of the SOFR leg, relative to the stamped release time (0 = the release minute)', '']
D['era'] = np.where(D.t.dt.tz_convert('America/New_York').map(lambda x: x.dst().total_seconds() > 0), 'US summer time', 'US winter time')
md += ['| family | era | events | at 0 | within +-1 min | elsewhere | median offset of the elsewhere ones |', '|---|---|---|---|---|---|---|']
for (fam, era), q in D.groupby(['fam', 'era']):
    j = q.jump.dropna(); el = j[j.abs() > 1]
    md.append(f'| {fam} | {era} | {len(q)} | {int((j == 0).sum())} | {int((j.abs() <= 1).sum())} | {len(el)} | {el.median() if len(el) else "-"} |')
bad = D[D.jump.notna() & (D.jump.abs() > 1)][['id', 'jump']]
md += ['', 'Releases whose largest SOFR-leg move is more than a minute from the stamped time: ' + (', '.join(f'{a} ({b:+.0f})' for a, b in bad.values) if len(bad) else 'none'), '']
md += ['## Coverage by asset (releases with a path / 1-minute path / 15-minute CFD path / none)', '', '| asset | with a path | 1-minute | 15-minute | none |', '|---|---|---|---|---|']
for k in KEYS:
    st = [(p[k] or {}).get('step') for p in paths.values()]
    md.append(f'| {LABEL[k]} | {sum(s is not None for s in st)} | {sum(s == 1 for s in st)} | {sum(s == 15 for s in st)} | {sum(s is None for s in st)} |')
D['sofr_bars'] = [(paths[i]['sofr'] or {}).get('bars') for i in D.id]; D['eur_bars'] = [(paths[i]['eur'] or {}).get('bars') for i in D.id]
t = D.dropna(subset=['sofr_bars', 'eur_bars'])
md += ['', '## Quote density in the 30 minutes after the release (1-minute bars present, of 30)', '',
       f'- SOFR leg: median {t.sofr_bars.median():.0f}, fewer than 20 bars in {int((t.sofr_bars < 20).sum())} of {len(t)} releases.',
       f'- Euribor leg: median {t.eur_bars.median():.0f}, fewer than 20 bars in {int((t.eur_bars < 20).sum())} of {len(t)} releases.',
       f'- Euribor leg unchanged at +30 minutes in {int(((D.eur_m30 == 0)).sum())} of {int(D.eur_m30.notna().sum())} releases; of those, {int(((D.eur_m30 == 0) & (D.eur_bars < 20)).sum())} had fewer than 20 bars (a stale midpoint, not a measured non-reaction).', '']
(OUT / 'LAYER1_CHECKS.md').write_text('\n'.join(md) + '\n', encoding='utf-8'); print('\n'.join(md))
