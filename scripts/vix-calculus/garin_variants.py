"""vix-calculus part D, POST-HOC descriptive (prereg A5): our rebuild did not reproduce Garin's 2016-2020 signs, so which plausible reading of his
method does? Only 2016-2020 (his sample) is shown; nothing here changes the scored 2021-2026 cells. Writes garin_variants.json."""
import os, json
import numpy as np, pandas as pd
OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'analysis', 'output', 'vix-calculus')
R = pd.read_parquet(os.path.join(OUT, 'readings.parquet')); R = R[np.isfinite(R['y'])]
IS = R[R['day'] < pd.Timestamp('2021-01-01')].copy()
IS['unsigned'] = (IS['vix_pct'].abs() / IS['idx_pct'].abs()).where(~IS['tiny'])
IS['y_raw'] = IS['fwd'] * 100
def tab(D, col, groups, ycol='y'):
    D = D[np.isfinite(D[col])].copy()
    D['b'] = D.groupby(groups)[col].transform(lambda s: pd.qcut(s.rank(method='first'), 3, labels=['barely', 'middle', 'hard'])) if groups else pd.qcut(D[col].rank(method='first'), 3, labels=['barely', 'middle', 'hard'])
    out = {}
    for (i, dn), g in D.groupby(['index', 'down']):
        m = g.groupby('b', observed=True)[ycol].mean(); out[f"{i}-{'down' if dn else 'up'}"] = round(float(m['hard'] - m['barely']), 3)
    return out
V = {
 'as registered (signed, thirds per index)': tab(IS, 'ratio', ['index']),
 'thirds per index x hour': tab(IS, 'ratio', ['index', 'hour']),
 'thirds per index x day type': tab(IS, 'ratio', ['index', 'down']),
 'thirds per index x hour x day type': tab(IS, 'ratio', ['index', 'hour', 'down']),
 'unsigned |VIX%|/|index%|, thirds per index x day type': tab(IS, 'unsigned', ['index', 'down']),
 'signed, thirds per index x day type, outcome in raw %': tab(IS, 'ratio', ['index', 'down'], 'y_raw'),
 'Garin (his table)': {'ES-down': 0.120, 'ES-up': 0.098, 'NQ-down': -0.007, 'NQ-up': -0.015},
}
for k, v in V.items(): print(f'{k:58s}', v)
json.dump(V, open(os.path.join(OUT, 'garin_variants.json'), 'w'), indent=1)
