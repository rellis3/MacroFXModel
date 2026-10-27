"""pre-fomc-drift: scored exactly as forge/PRE_FOMC_DRIFT_PREREG.md. Run once."""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from common import *  # noqa: E402,F401

OUT = os.path.join(ROOT, 'analysis', 'output', 'pre-fomc-drift')
LAST = '2026-08-12'


def win(s, d, a_fn, b_fn):
    a, b = px_at_or_before(s, a_fn(d)), px_at_or_before(s, b_fn(d))
    return float(np.log(b / a)) if (a and b) else None


PRE = (lambda d: local(add_weekdays(d, -1), 14, 0, ET), lambda d: local(d, 13, 45, ET))
POST = (lambda d: local(d, 14, 0, ET), lambda d: local(d, 16, 0, ET))
EARLIER = (lambda d: local(add_weekdays(d, -2), 14, 0, ET), lambda d: local(add_weekdays(d, -1), 13, 45, ET))


def collect(key, fed, start, fns):
    s = load_m15(key)
    ex = set()
    for d in fed:
        for j in range(-2, 3):
            ex.add(add_weekdays(d, j) if j else d)
    ev = [(d, win(s, d, *fns)) for d in fed if d >= start]
    ctrl = [(d, win(s, d, *fns)) for d in weekdays(start, LAST) if d not in ex]
    ev = pd.DataFrame([x for x in ev if x[1] is not None], columns=['date', 'r'])
    ctrl = pd.DataFrame([x for x in ctrl if x[1] is not None], columns=['date', 'r'])
    return ev, ctrl


def score(ev, ctrl, rng):
    diff = float(ev.r.mean() - ctrl.r.mean())
    eb = ev.r.values[cluster_resample(len(ev), rng)].mean(axis=1)
    cb = block_means(ctrl.r.values, rng)
    boot = eb - cb
    se = float(boot.std(ddof=1)); lo, hi = np.percentile(boot, [2.5, 97.5])
    pl = ctrl.r.values[rng.integers(0, len(ctrl), size=(B_PLACEBO, len(ev)))].mean(axis=1)
    pct = float((pl < ev.r.mean()).mean())
    halves = {}
    for nm, (a, b) in {'h1': ('2014-01-01', '2019-12-31'), 'h2': ('2020-01-01', '2026-12-31')}.items():
        e = ev[(ev.date >= a) & (ev.date <= b)]; c = ctrl[(ctrl.date >= a) & (ctrl.date <= b)]
        halves[nm] = dict(n=int(len(e)), diff=float(e.r.mean() - c.r.mean()))
    return dict(n=int(len(ev)), n_control=int(len(ctrl)), event_mean=float(ev.r.mean()),
                control_mean=float(ctrl.r.mean()), diff=diff, se=se, t=diff / se, ci95=[float(lo), float(hi)],
                p=norm_p(diff, se), placebo_pct=pct, halves=halves, win=float((ev.r > 0).mean()),
                ctrl_win=float((ctrl.r > 0).mean()), median=float(ev.r.median()))


def verdict(s, null_bar=0.0020):
    if s['ci95'][0] > 0 and s['placebo_pct'] > 0.95 and all(h['diff'] > 0 for h in s['halves'].values()):
        return 'VALIDATED'
    if s['ci95'][1] < 0:
        return 'CONTEXT (mirror: significant fall)'
    return 'NULL' if s['ci95'][1] < null_bar else 'UNDERPOWERED'


def main():
    os.makedirs(OUT, exist_ok=True)
    rng = np.random.default_rng(SEED)
    fed = [d for d, _ in events('Fed Interest Rate Decision')]
    ev, ctrl = collect('NQ', fed, '2014-01-01', PRE)
    h1 = score(ev, ctrl, rng); h1['verdict'] = verdict(h1)
    desc = {}
    e2, c2 = collect('SPX', fed, '2018-01-08', PRE); desc['spx_pre'] = score(e2, c2, rng)
    e3, c3 = collect('NQ', fed, '2014-01-01', POST); desc['nq_post_14_16'] = score(e3, c3, rng)
    e4, c4 = collect('NQ', fed, '2014-01-01', EARLIER); desc['nq_day_before'] = score(e4, c4, rng)
    top = ev.r.abs().nlargest(3).index
    desc['nq_pre_drop_top3_diff'] = float(ev.drop(top).r.mean() - ctrl.r.mean())
    desc['nq_pre_by_year'] = ev.assign(y=ev.date.str[:4]).groupby('y').r.agg(['count', 'mean']).round(5).to_dict('index')
    level = float(load_m15('NQ')['2014-01-01':].median())  # 1 index point round trip as a share of a typical level
    desc['nq_pre_net_1pt_diff'] = h1['diff'] - 1.0 / level
    res = dict(study='pre-fomc-drift', prereg='forge/PRE_FOMC_DRIFT_PREREG.md', seed=SEED, H1=h1, descriptive=desc)
    json.dump(res, open(os.path.join(OUT, 'results.json'), 'w'), indent=1, default=float)
    ev.to_csv(os.path.join(OUT, 'events.csv'), index=False)
    print(json.dumps(res, indent=1, default=float)[:4000])


if __name__ == '__main__':
    main()
