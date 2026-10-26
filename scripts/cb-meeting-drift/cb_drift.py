"""cb-meeting-drift: scored exactly as forge/CB_MEETING_DRIFT_PREREG.md. Run once."""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from common import *  # noqa: E402,F401

OUT = os.path.join(ROOT, 'analysis', 'output', 'cb-meeting-drift')
BOE_UNSCHEDULED = {'2020-03-11', '2020-03-19'}
BANKS = {'ECB': ('ECB Interest Rate Decision', 'EURUSD', '2014-01-01'),
         'BoE': ('BoE Interest Rate Decision', 'GBPUSD', '2018-01-08')}
LAST_START = '2026-08-12'


def window(s, d, react_start=None):
    a = px_at_or_before(s, local(d, 16, 0, LON))
    b = px_at_or_before(s, local(add_weekdays(d, 5), 16, 0, LON))
    r0 = px_at_or_before(s, react_start if react_start is not None else local(d, 12, 0, LON))
    if not (a and b and r0):
        return None
    return dict(out=float(np.log(b / a)), react=float(np.log(a / r0)))


def build():
    fed = {d for d, _ in events('Fed Interest Rate Decision')}
    ev, ctrl = [], {}
    for bank, (name, pair, start) in BANKS.items():
        s = load_m15(pair)
        evs = [(d, t) for d, t in events(name) if d >= start and not (bank == 'BoE' and d in BOE_UNSCHEDULED)]
        ex = set()
        for d, t in evs:
            for j in range(-1, 6):
                ex.add(add_weekdays(d, j) if j else d)
            rs = None
            if t.tz_convert(LON).hour < 12:
                rs = t - pd.Timedelta('15min')  # prereg: the price known 15 min before the stamped time
            w = window(s, d, rs)
            if w is None:
                print('missing', bank, d); continue
            win_days = {add_weekdays(d, j) for j in range(0, 6)}
            ev.append(dict(bank=bank, date=d, week=pd.Timestamp(d).strftime('%G-%V'),
                           fomc_in_window=bool(win_days & fed), **w))
        rows = []
        for d in weekdays(start, LAST_START):
            if d in ex:
                continue
            w = window(s, d)
            if w is not None:
                rows.append(dict(date=d, **w))
        ctrl[bank] = pd.DataFrame(rows)
    return pd.DataFrame(ev), ctrl


def score(ev, ctrl, val, rng):
    """val(df) -> per-row value. Returns the registered statistics for the pooled cell."""
    e = ev.assign(v=val(ev))
    cm = {b: val(c).mean() for b, c in ctrl.items()}
    diff = float(np.mean([r.v - cm[r.bank] for r in e.itertuples()]))
    weeks = e.week.unique()
    wk_idx = {w: np.where(e.week.values == w)[0] for w in weeks}
    cboot = {b: block_means(val(c).values, rng) for b, c in ctrl.items()}
    res = cluster_resample(len(weeks), rng)
    boot = np.empty(B_BOOT)
    vv, bb = e.v.values, e.bank.values
    for k in range(B_BOOT):
        idx = np.concatenate([wk_idx[weeks[j]] for j in res[k]])
        boot[k] = np.mean(vv[idx] - np.where(bb[idx] == 'ECB', cboot['ECB'][k], cboot['BoE'][k]))
    se = float(boot.std(ddof=1))
    lo, hi = np.percentile(boot, [2.5, 97.5])
    # placebo: n_ECB and n_BoE control windows, raw pooled mean
    nE, nB = (e.bank == 'ECB').sum(), (e.bank == 'BoE').sum()
    cE, cB = val(ctrl['ECB']).values, val(ctrl['BoE']).values
    pl = (cE[rng.integers(0, len(cE), size=(B_PLACEBO, nE))].sum(1) +
          cB[rng.integers(0, len(cB), size=(B_PLACEBO, nB))].sum(1)) / (nE + nB)
    raw = float(e.v.mean())
    pct = float((pl < raw).mean())
    halves = {}
    for nm, m in [('h1', e.date < '2020-07-01'), ('h2', e.date >= '2020-07-01')]:
        sub = e[m]
        cmh = {b: val(c[(c.date < '2020-07-01') if nm == 'h1' else (c.date >= '2020-07-01')]).mean()
               for b, c in ctrl.items()}
        halves[nm] = dict(n=int(len(sub)), diff=float(np.mean([r.v - cmh[r.bank] for r in sub.itertuples()])))
    return dict(n=int(len(e)), n_ecb=int(nE), n_boe=int(nB), event_mean=raw, control_mean=cm, diff=diff,
                se=se, ci95=[float(lo), float(hi)], p=norm_p(diff, se), placebo_pct=pct, halves=halves,
                win_rate=float((e.v > 0).mean()))


def per_bank(ev, ctrl, val):
    out = {}
    for b in ctrl:
        e = val(ev[ev.bank == b]); c = val(ctrl[b])
        se = float(np.sqrt(e.var(ddof=1) / len(e) + c.var(ddof=1) / len(c) * 5))  # 5-day windows overlap: design effect ~5
        d = float(e.mean() - c.mean())
        out[b] = dict(n=int(len(e)), diff=d, se=se, p=norm_p(d, se), event_mean=float(e.mean()),
                      median=float(e.median()), win=float((e > 0).mean()), ctrl_win=float((c > 0).mean()))
    return out


def bh(ps, q=0.10):
    m = len(ps); order = np.argsort(ps); k = 0
    for r, i in enumerate(order, 1):
        if ps[i] <= q * r / m:
            k = r
    keep = set(order[:k]); return [i in keep for i in range(m)]


def verdict(s, holm_pass, null_bar=0.0015):
    gate = holm_pass and s['ci95'][0] > 0 and s['placebo_pct'] > 0.95 and all(h['diff'] > 0 for h in s['halves'].values())
    if gate:
        return 'VALIDATED'
    if holm_pass and s['diff'] < 0:
        return 'CONTEXT (mirror: significant on the negative side)'
    return 'NULL' if s['ci95'][1] < null_bar else 'UNDERPOWERED'


def main():
    os.makedirs(OUT, exist_ok=True)
    rng = np.random.default_rng(SEED)
    ev, ctrl = build()
    h1 = lambda df: df['out']  # own currency up (XXXUSD rising = own currency up)
    h2 = lambda df: np.sign(df['react']) * df['out']
    s1, s2 = score(ev, ctrl, h1, rng), score(ev, ctrl, h2, rng)
    hp = holm([s1['p'], s2['p']])
    s1['holm_pass'], s2['holm_pass'] = hp
    s1['verdict'], s2['verdict'] = verdict(s1, hp[0]), verdict(s2, hp[1])
    pb1, pb2 = per_bank(ev, ctrl, h1), per_bank(ev, ctrl, h2)
    ps = [pb1['ECB']['p'], pb1['BoE']['p'], pb2['ECB']['p'], pb2['BoE']['p']]
    bhk = bh(ps)
    desc = dict(
        per_bank_H1=pb1, per_bank_H2=pb2, bh_q10=dict(zip(['H1-ECB', 'H1-BoE', 'H2-ECB', 'H2-BoE'], bhk)),
        excl_fomc_window_H1=score(ev[~ev.fomc_in_window], ctrl, h1, np.random.default_rng(SEED + 1))['diff'],
        n_fomc_in_window=int(ev.fomc_in_window.sum()),
        net_of_1p5pip_H1=s1['diff'] - 0.00015 / 1.2,
        by_year_H1=ev.assign(y=ev.date.str[:4]).groupby('y')['out'].agg(['count', 'mean']).round(5).to_dict('index'))
    res = dict(study='cb-meeting-drift', prereg='forge/CB_MEETING_DRIFT_PREREG.md', seed=SEED, H1=s1, H2=s2,
               descriptive=desc, n_control={b: int(len(c)) for b, c in ctrl.items()})
    json.dump(res, open(os.path.join(OUT, 'results.json'), 'w'), indent=1, default=float)
    ev.to_csv(os.path.join(OUT, 'events.csv'), index=False)
    print(json.dumps({k: res[k] for k in ('H1', 'H2')}, indent=1, default=float))
    print(json.dumps(desc, indent=1, default=float)[:3000])


if __name__ == '__main__':
    main()
