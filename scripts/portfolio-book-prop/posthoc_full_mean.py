"""portfolio-book-prop A1 (POST-HOC, describe only): Book A's 2016+ rows with the mean reset to the full-history
Sharpe 0.21 (portfolio-book-validate, all haircuts, CFD-only, 2008-2026). Same replica, seed stream 1000+."""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts' / 'overnight-hold-toolkit'))
import toolkit as tk  # noqa: E402

OUT = ROOT / 'analysis/output/portfolio-book-prop'
SEED, FEE, FULL_SHARPE = 20261104, 0.54, 0.21
df = pd.read_csv(OUT / 'rows_A.csv')
r = df['Return %'].to_numpy()
mu, target = r.mean(), FULL_SHARPE / np.sqrt(252) * r.std()
out = {'mean_window_pct': mu, 'mean_full_sharpe_pct': target, 'cells': {}}
for i, k in enumerate([0.5, 1]):
    res = {}
    for j, (name, shift, col) in enumerate([('book', target - mu, 'MAE %'), ('zero', -mu, 'MAE %'),
                                            ('book_close_only', target - mu, 'MAE_cc %'), ('zero_close_only', -mu, 'MAE_cc %')]):
        rows = pd.DataFrame({'Date': df.Date, 'Return %': df['Return %'] + shift, 'MAE %': df[col] + shift})
        s = tk.simulate(rows, k, tk.FTMO, np.random.default_rng([SEED, 1000 + 10 * i + j]))
        res[name] = {'funded': round(s['funded'], 4), 'median_days': s['median_days_to_funded'],
                     'ev': round(s['breakeven_fee_pct_of_account'] - FEE, 3)}
    res['edge_pp'] = round(100 * (res['book']['funded'] - res['zero']['funded']), 2)
    res['edge_ev'] = round(res['book']['ev'] - res['zero']['ev'], 3)
    res['edge_pp_close_only'] = round(100 * (res['book_close_only']['funded'] - res['zero_close_only']['funded']), 2)
    res['edge_ev_close_only'] = round(res['book_close_only']['ev'] - res['zero_close_only']['ev'], 3)
    out['cells'][str(k)] = res
(OUT / 'posthoc_full_mean.json').write_text(json.dumps(out, indent=1))
print(json.dumps(out, indent=1))
