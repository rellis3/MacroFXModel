"""Bug check: the generalised engine must reproduce the banked q1 run exactly
(education/residual_pca_currency_test/data/real_results.json) on q1's own closes."""
import json, os, sys
import numpy as np, pandas as pd
sys.path.insert(0, os.path.dirname(__file__))
import engine as E

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
Q1 = os.path.join(ROOT, "education/residual_pca_currency_test/data")
CCY_PAIR = {"EUR": ("eurusd", 1), "GBP": ("gbpusd", 1), "AUD": ("audusd", 1), "NZD": ("nzdusd", 1),
            "JPY": ("usdjpy", -1), "CAD": ("usdcad", -1), "CHF": ("usdchf", -1)}
COST = {"EUR": 0.008, "GBP": 0.010, "AUD": 0.011, "NZD": 0.013, "JPY": 0.009, "CAD": 0.011, "CHF": 0.011, "USD": 0.0}
d = pd.read_csv(os.path.join(Q1, "daily_closes.csv"), index_col=0, parse_dates=True)
lr = np.log(d).diff().dropna()
r = pd.DataFrame(0.0, index=lr.index, columns=["USD", "EUR", "GBP", "AUD", "NZD", "JPY", "CAD", "CHF"])
for c, (p, s) in CCY_PAIR.items():
    r[c] = s * lr[p]
x = E.basket(r)
n_is = E.WINDOW + (len(x) - E.WINDOW) // 2
K, hist, _ = E.choose_k(x, n_is)
disp, e, rec = E.walk(x, r, K, COST)
ic = E.daily_ic(disp, e)
h = len(ic) // 2
ref = json.load(open(os.path.join(Q1, "real_results.json")))
out = {"K": K, "K_hist": hist, "IS_ic": round(float(ic.iloc[:h].mean()), 4), "OOS_ic": round(float(ic.iloc[h:].mean()), 4),
       "OOS_t": round(float(E.tstat(ic.iloc[h:])), 2),
       "OOS_net_sharpe": E.perf(rec.net.iloc[len(rec) // 2:])["sharpe"],
       "ref": {"K": ref["K"], "IS_ic": ref["gate_IS"]["mean_ic"], "OOS_ic": ref["gate_OOS"]["mean_ic"],
               "OOS_t": ref["gate_OOS"]["t_ic"], "OOS_net_sharpe": ref["loop"]["OOS_net"]["sharpe"]}}
print(json.dumps(out, indent=1))
