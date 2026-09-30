"""Cross-pair range book, Q3 — does the P+CVOL big-day forecast hold on pairs it was not
found on? forge/CROSSPAIR_RANGE_BOOK_PREREG.md. Same model step as forge/EURUSD_MODEL_PREREG.md
section 2, via daytable.py.
    python scripts/rangebook/crosspair_model.py >> analysis/output/rangebook/CROSSPAIR_RESULTS.md
"""
import json
import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor as HGBR
from daytable import GBM, YEARS, P, IV, day_table, walk, boot_skill, pinball

NEW = {'gbpusd': 'GBPUSD', 'audusd': 'AUDUSD', 'usdcad': 'USDCAD', 'usdchf': 'USDCHF', 'usdjpy': 'USDJPY', 'gold': 'XAUUSD'}
SEEN = {'eurusd': 'EURUSD'}
cv = json.load(open('js/data/cmeCvolEod.json'))['series']
rng = np.random.default_rng(7)
HL_RATIO = {}
fmt = lambda s: f'{s[0]:+.3f} ({s[1]:+.3f} to {s[2]:+.3f})' + (' ✔' if s[1] > 0 else '')

def losses(pair, key):
    D = day_table(json.load(open(f'analysis/output/rangebook/{pair}.json'))['records'], cv[key])
    T = D[D['year'].isin(YEARS)]
    out = {}
    for tau, rung in ((0.75, 'hl75'), (0.9, 'hl90')):
        q0 = np.log(D[rung] / D['hl50'])
        mk = lambda cols: walk(D, lambda tr, te: HGBR(loss='quantile', quantile=tau, **GBM).fit(tr[cols], tr['logr']).predict(te[cols]))
        q2, q3 = mk(P), mk(P + IV)
        out[tau] = {k: pinball(D['logr'], q, tau)[T.index].to_numpy() for k, q in (('lines', q0), ('m2', q2), ('m3', q3))}
        if tau == 0.75 and pair in NEW:   # walk-forward q75 per day, for the big-day switch (forge/RUBBER_BAND_PREREG.md)
            json.dump({d: (None if np.isnan(v) else float(v)) for d, v in zip(D['date'], q3)},
                      open(f'analysis/output/rangebook/{pair}_pred_q75.json', 'w'))
            HL_RATIO[pair] = float(np.median(np.log(D['hl75'] / D['hl50'])))
    return out, (pair + '|' + T['date']).to_numpy(), len(T)

print('\n## 5. Q3 — does the big-day forecast hold on pairs it was not found on?\n')
print('Quantile gradient boosting of log(day range ÷ hl p50), walk-forward by year 2023–2026, each instrument\'s own '
      'fitted widths. Skill = pinball-loss improvement; ✔ = 95% bootstrap interval above 0.\n')
print('| instrument | test days | 0.75: M3 vs your lines | 0.90: M3 vs your lines | 0.90: IV added (M3 vs M2) |')
print('|---|---|---|---|---|')
pool = {k: [] for k in ('l', 'm2', 'm3', 'g')}; wins90 = 0
for pair, key in list(NEW.items()) + list(SEEN.items()):
    L, g, n = losses(pair, key)
    s75 = boot_skill(L[0.75]['m3'], L[0.75]['lines'], g, rng)
    s90 = boot_skill(L[0.9]['m3'], L[0.9]['lines'], g, rng)
    siv = boot_skill(L[0.9]['m3'], L[0.9]['m2'], g, rng)
    tag = '' if pair in NEW else ' (seen — not counted)'
    print(f'| {pair.upper()}{tag} | {n} | {fmt(s75)} | {fmt(s90)} | {fmt(siv)} |')
    if pair in NEW:
        wins90 += s90[0] > 0
        pool['l'].append(L[0.9]['lines']); pool['m2'].append(L[0.9]['m2']); pool['m3'].append(L[0.9]['m3']); pool['g'].append(g)
cat = lambda k: np.concatenate(pool[k])
p90 = boot_skill(cat('m3'), cat('l'), cat('g'), rng)
piv = boot_skill(cat('m3'), cat('m2'), cat('g'), rng)
print(f'\nPooled over the 6 new instruments, 0.90: M3 vs your lines {fmt(p90)}; IV added {fmt(piv)}. '
      f'M3 beats the lines at 0.90 on {wins90} of 6.\n')
print(f"**Q3 verdict:** big-day forecast {'CONFIRMED' if p90[1] > 0 and wins90 >= 4 else 'NOT confirmed'}; "
      f"implied vol {'adds' if piv[1] > 0 else 'does not add'} information (pooled).")

# big-day threshold per instrument: log(hl p75 / hl p50) (EURUSD from its fitted widths)
HL_RATIO['eurusd'] = float(np.log(1.8877 / 1.4417))
json.dump(HL_RATIO, open('analysis/output/rangebook/hl_ratio.json', 'w'))
