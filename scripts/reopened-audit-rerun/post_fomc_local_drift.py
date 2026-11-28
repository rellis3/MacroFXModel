"""reopened-audit-rerun 3E (forge/REOPENED_AUDIT_RERUN_PREREG.md): post-fomc-usd-drift against the LOCAL dollar drift.
Same 81 event windows (analysis/fomc_event_study/stage1_events.csv, join_ok) and baseline (baseline_r5.csv) as
MD files/POST_FOMC_DRIFT_TEST.md. Excess per event = event R5 - mean baseline R5 within +/-60 trading days (weekday count).
Event t i.i.d. (meetings >= 5 weeks apart). Local placebo: 10,000 draws, each event replaced by one baseline day from its
own +/-60-day neighbourhood. Halves 2016-2020 / 2021-2026 as registered. Writes analysis/output/reopened-audit-rerun/post_fomc.json."""
import os, json
import numpy as np, pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__)); REPO = os.path.abspath(os.path.join(HERE, '..', '..'))
SRC = os.path.join(REPO, 'analysis', 'fomc_event_study'); OUT = os.path.join(REPO, 'analysis', 'output', 'reopened-audit-rerun')
SEED, DRAWS, W = 20261128, 10000, 60; rng = np.random.default_rng(SEED)
ev = pd.read_csv(os.path.join(SRC, 'stage1_events.csv')); ev = ev[ev['join_ok']].dropna(subset=['r5']).reset_index(drop=True)
base = pd.read_csv(os.path.join(SRC, 'baseline_r5.csv')).dropna()
bd = base['date'].to_numpy().astype('datetime64[D]'); br = base['r5'].to_numpy()
nb_idx, loc_mean = [], []
for d in ev['date'].to_numpy().astype('datetime64[D]'):
    gap = np.abs(np.busday_count(np.minimum(bd, d), np.maximum(bd, d)))
    ix = np.where(gap <= W)[0]; nb_idx.append(ix); loc_mean.append(br[ix].mean())
ev['local_base'] = loc_mean; ev['excess'] = ev['r5'] - ev['local_base']; ev['n_nb'] = [len(i) for i in nb_idx]
x = ev['excess'].to_numpy(); n = len(x); t = x.mean() / (x.std(ddof=1) / np.sqrt(n))
# local placebo: replace each event by a random neighbourhood baseline day, excess against the same local mean
lm = ev['local_base'].to_numpy()
pl = np.array([np.mean([br[ix[rng.integers(len(ix))]] for ix in nb_idx] - lm) for _ in range(DRAWS)])
p95 = float(np.percentile(pl, 95)); pctl = float((pl < x.mean()).mean())
h1 = float(ev.loc[ev['date'] < '2021', 'excess'].mean()); h2 = float(ev.loc[ev['date'] >= '2021', 'excess'].mean())
oos = ev.loc[ev['date'] >= '2022', 'excess'].to_numpy()
ok = (x.mean() > 0) and (t >= 2.0) and (x.mean() > p95) and h1 > 0 and h2 > 0
verdict = 'validated' if ok else ('underpowered' if x.mean() > 0 else 'null')
out = dict(id='reopened-audit-rerun', part='3E', seed=SEED, draws=DRAWS, window_trading_days=W, n_events=n,
           raw_mean_bp=float(ev['r5'].mean() * 1e4), local_base_mean_bp=float(np.mean(lm) * 1e4), excess_mean_bp=float(x.mean() * 1e4),
           excess_t=float(t), share_positive=float((x > 0).mean()), placebo_p95_bp=p95 * 1e4, placebo_percentile=pctl,
           half_2016_2020_bp=h1 * 1e4, half_2021_2026_bp=h2 * 1e4, n_h1=int((ev['date'] < '2021').sum()), n_h2=int((ev['date'] >= '2021').sum()),
           from_2022_bp=float(oos.mean() * 1e4), from_2022_t=float(oos.mean() / (oos.std(ddof=1) / np.sqrt(len(oos)))), n_from_2022=int(len(oos)),
           median_neighbourhood=int(np.median(ev['n_nb'])), verdict=verdict)
json.dump(out, open(os.path.join(OUT, 'post_fomc.json'), 'w'), indent=1)
for k, v in out.items(): print(k, round(v, 3) if isinstance(v, float) else v)
