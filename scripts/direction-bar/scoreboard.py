"""
direction-bar scoreboard (forge/DIRECTION_BAR_PREREG.md §4.S): the existing direction cells re-scored against a
point-in-time drift baseline (B0) on one scale, with the evidence split H-D / H-R / F and the multiplicity history.
Descriptive: it may only propose demotions. Reads nothing after 2026-08-21. Seed 20261031.
A1 (post-hoc, widens only): time-series cells (S4, S5, S7) bootstrap by calendar-month clusters, because their
overlapping windows made a row bootstrap too narrow (S4 row p ~0.000 vs circular-shift placebo p 0.039).

Usage: python -I scripts/direction-bar/scoreboard.py   (MFX_DATA_ROOT = checkout holding the banked outputs)
"""
import importlib.util, json, os, sys
from pathlib import Path
import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
DATA = Path(os.environ.get('MFX_DATA_ROOT', ROOT))
OUT = ROOT / 'analysis/output/direction-bar'
SEED = 20261031
END = pd.Timestamp('2026-08-21')
LEDGER_N = 241
R = 2000
# NQ futures round trip (% of price) from bar.py's cost table at the last pre-lockbox price; read from results.json
BAR = json.loads((OUT / 'results.json').read_text())


def nq_cost(venue='futures'):
    return BAR['instruments']['nq']['h']['1']['costs'][venue]['round_trip_pct'] / 100


def gold_cost(venue='futures'):
    return BAR['instruments']['gold']['h']['1']['costs'][venue]['round_trip_pct'] / 100


def expanding_known(dates, values, known_lag, min_n):
    """For each date: mean and P(>0) and SD of `values` whose outcome was complete before that date."""
    s = pd.Series(values, index=pd.DatetimeIndex(dates)).sort_index()
    known_at = s.index + known_lag
    order = np.argsort(known_at)
    ka, v = known_at[order], s.to_numpy()[order]
    cs, cp, cq = np.cumsum(v), np.cumsum(v > 0), np.cumsum(v ** 2)

    def at(t):
        k = np.searchsorted(ka, t, side='left')        # strictly before t
        if k < min_n:
            return (np.nan, np.nan, np.nan)
        m = cs[k - 1] / k
        return (m, cp[k - 1] / k, np.sqrt(max(cq[k - 1] / k - m * m, 1e-18)))
    return at


def summarise(name, d, sign_col='dir', ret='r', b0m='b0_mean', b0p='b0_p', b0s='b0_sd', cluster=None, rng=None, cost=None,
              placebo=None, orig=None, family=None, cls=None, units=''):
    """d: one row per cell event with direction, outcome, and B0 fields at that date."""
    d = d.dropna(subset=[ret, b0m, b0p]).copy()
    sgn = d[sign_col].to_numpy(); r = d[ret].to_numpy()
    up = (r > 0).astype(float)
    hit = np.where(sgn > 0, up, 1 - up)
    p_base = np.where(sgn > 0, d[b0p], 1 - d[b0p])
    e_hit = hit - p_base                                           # excess hit over B0 in the cell's direction
    e_ret = sgn * (r - d[b0m].to_numpy())                          # excess return over B0 drift, cell's direction
    e_sd = e_ret / d[b0s].to_numpy() if b0s in d else None
    raw = sgn * r
    out = {'cell': name, 'n': int(len(d)), 'class': cls, 'family': family, 'units': units,
           'from': str(d.date.min().date()), 'to': str(d.date.max().date()),
           'raw_mean': float(raw.mean()), 'b0_mean_in_direction': float((sgn * d[b0m]).mean()),
           'hit': float(hit.mean()), 'b0_hit': float(p_base.mean()), 'excess_hit': float(e_hit.mean()),
           'excess_ret': float(e_ret.mean()), 'excess_sd': float(np.nanmean(e_sd)) if e_sd is not None else None,
           'b0_share_of_raw': float((sgn * d[b0m]).mean() / raw.mean()) if raw.mean() else None}
    # cluster block bootstrap (clusters = dates/weeks given; else each row)
    cl = d[cluster].to_numpy() if cluster else np.arange(len(d))
    uc, inv = np.unique(cl, return_inverse=True)
    sums_r = np.bincount(inv, e_ret); sums_h = np.bincount(inv, e_hit); cnt = np.bincount(inv)
    sums_s = np.bincount(inv, np.nan_to_num(e_sd)) if e_sd is not None else None
    bs_r, bs_h, bs_s = [], [], []
    for _ in range(R):
        k = rng.integers(0, len(uc), len(uc))
        c = cnt[k].sum()
        bs_r.append(sums_r[k].sum() / c); bs_h.append(sums_h[k].sum() / c)
        if sums_s is not None: bs_s.append(sums_s[k].sum() / c)
    q = lambda a: [float(np.percentile(a, 2.5)), float(np.percentile(a, 97.5))]
    out['ci_excess_ret'] = q(bs_r); out['ci_excess_hit'] = q(bs_h)
    if bs_s: out['ci_excess_sd'] = q(bs_s)
    bs = np.array(bs_r)
    out['p_boot'] = float(min(1.0, 2 * min((bs <= 0).mean(), (bs >= 0).mean())))
    if placebo is not None:
        out['p_placebo'] = placebo(e_ret.mean())
    p = out.get('p_placebo', out['p_boot'])
    out['p_family_bonf'] = float(min(1, p * (family or 1)))
    out['p_ledger_bonf'] = float(min(1, p * LEDGER_N))
    if cost is not None:
        out['net_ev_per_event'] = float(raw.mean() - cost)
        out['net_excess_vs_b0_per_event'] = float(e_ret.mean() - cost)
    lo, hi = out['ci_excess_ret']
    if out['n'] < 30:
        out['word'] = 'n < 30'
    elif lo > 0:
        out['word'] = 'holds vs B0'
    elif e_ret.mean() > 0 and (orig is None or e_ret.mean() >= 0.5 * orig):
        out['word'] = 'weakened vs B0'
    else:
        out['word'] = 'not distinguishable from drift'
    out['orig_effect'] = orig
    return out


def circ_placebo(all_dates, all_vals_fn, cell_idx, rng):
    """Circular shift of the cell's own date positions over the eligible series; returns two-sided p of the mean."""
    n = len(all_dates); vals = []
    for _ in range(R):
        off = rng.integers(1, n)
        vals.append(np.nanmean(all_vals_fn((cell_idx + off) % n)))
    vals = np.array(vals)
    def p(obs):
        c = vals - np.nanmean(vals)
        return float(((np.abs(c) >= abs(obs - np.nanmean(vals))).sum() + 1) / (len(c) + 1))
    return p


# ---------------------------------------------------------------- cells
def s1_fomc(rng):
    ev = pd.read_csv(DATA / 'analysis/fomc_event_study/stage1_events.csv', parse_dates=['date'])
    ev = ev[ev.join_ok & (ev.date <= END - pd.Timedelta(days=8))]
    base = pd.read_csv(DATA / 'analysis/fomc_event_study/baseline_r5.csv', parse_dates=['date'])
    at = expanding_known(base.date, base.r5.to_numpy(), pd.Timedelta(days=8), 100)
    rows = [dict(date=t, dir=1, r=r, **dict(zip(['b0_mean', 'b0_p', 'b0_sd'], at(t)))) for t, r in zip(ev.date, ev.r5)]
    d = pd.DataFrame(rows)
    # placebo: circular shift of event positions over the baseline windows, excess vs the same B0 machinery
    bd = base.sort_values('date').reset_index(drop=True)
    b0 = np.array([at(t)[0] for t in bd.date])
    pos = np.searchsorted(bd.date.to_numpy(), d.date.to_numpy())
    pl = circ_placebo(bd.date, lambda i: (bd.r5.to_numpy() - b0)[i], np.clip(pos, 0, len(bd) - 1), rng)
    out = [summarise('S1 post-FOMC USD drift (all)', d, rng=rng, cost=0.00016, placebo=pl, orig=0.00263 + 0.00032,
                     family=15, cls='H-D', units='log return of the 7-leg long-USD basket over 5 sessions')]
    for lab, m in [('2016-21 (harness in-sample)', d.date.dt.year <= 2021), ('2022+ (harness OOS, already seen)', d.date.dt.year >= 2022)]:
        out.append(summarise(f'S1 post-FOMC {lab}', d[m], rng=rng, cost=0.00016, family=15, cls='H-D', units='as above'))
    out.append({'cell': 'S1 post-FOMC forward (F)', 'n': 0, 'class': 'F',
                'word': 'no forward events: registered 2026-08-20, next decision after the lockbox date'})
    return out


def s2_positioning(rng):
    spec = importlib.util.spec_from_file_location('pir', DATA / 'scripts/positioning-into-release/run.py')
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
    p, _ = m.build_panel()
    p = p.dropna(subset=['pct', 'vdec'])
    p = p[p.date <= END]
    event = p.kind.notna() & ~p.rate_day
    ev = p[event].sort_values('date').copy()
    rows = []
    for pair, g in ev.groupby('pair'):
        at = expanding_known(g.date, g.mv.to_numpy(), pd.Timedelta(days=1), 50)
        b = np.array([at(t) for t in g.date])
        g = g.assign(b0_mean=b[:, 0], b0_p=b[:, 1], b0_sd=b[:, 2])
        rows.append(g)
    ev = pd.concat(rows)
    cell = ev[ev.crowd != 0].copy()
    cell['dir'] = -cell.crowd
    cell['week'] = cell.date.dt.to_period('W').astype(str)
    out = [summarise('S2 positioning into release (vs B0 drift)', cell, ret='mv', b0s='none', cluster='week', rng=rng,
                     orig=0.064, family=2, cls='H-R', units='ATR (close-to-close on the release day)')]
    # reproduce its own matched-control figure with the banked code
    res = m.run_arm(p, event & (p.crowd != 0), event & (p.crowd == 0), ['pair', 'kind', 'vdec'], np.random.default_rng(20261014), 'crowd')
    out[0]['reproduced_matched_control_effect'] = res['D']['all']['effect']
    out[0]['reproduced_matched_control_ci'] = res['D']['all']['ci']
    out.append({'cell': 'S2 positioning forward (F)', 'n': 0, 'class': 'F', 'word': 'no forward events: calendar coverage ends 2025-04-07'})
    return out


def s3_cot(rng):
    d = pd.read_csv(DATA / 'analysis/output/cot-crowding-programme/phase23_rows.csv.gz', parse_dates=['entry_date'])
    d = d[d.entry_date <= END - pd.Timedelta(days=28)].dropna(subset=['r4', 'dir'])
    d = d[d.dir != 0]
    d['raw'] = d.r4 * d.dir                         # un-signed standardised 4-week move (r4 is signed by dir)
    rows = []
    allm = pd.read_csv(DATA / 'analysis/output/cot-crowding-programme/phase23_rows.csv.gz', parse_dates=['entry_date'],
                       usecols=['sym', 'entry_date', 'r4', 'dir']).dropna()
    allm = allm[(allm.dir != 0) & (allm.entry_date <= END - pd.Timedelta(days=28))]
    allm['raw'] = allm.r4 * allm.dir
    allm = allm.drop_duplicates(['sym', 'entry_date'])
    b0 = {}
    for sym, g in allm.groupby('sym'):
        b0[sym] = expanding_known(g.entry_date, g.raw.to_numpy(), pd.Timedelta(days=28), 52)
    cell = d[d.state == 'D'].copy()
    b = np.array([b0[s](t) for s, t in zip(cell.sym, cell.entry_date)])
    cell = cell.assign(b0_mean=b[:, 0], b0_p=b[:, 1], b0_sd=1.0, date=cell.entry_date, r=cell.raw)
    out = []
    for lab, s, cls, orig in [('holdout markets', 'holdout', 'H-R', 0.269), ('discovery markets', 'discovery', 'H-D', 0.066)]:
        c = cell[cell.set == s].copy(); c['cl'] = c.entry_date.dt.strftime('%Y-%m-%d')
        out.append(summarise(f'S3 COT state D, {lab}', c, cluster='cl', rng=rng, orig=orig, family=20, cls=cls,
                             units='standardised 4-week move (r4 = log move / (2 sigma_w))'))
    out.append({'cell': 'S3 COT state D forward (F)', 'n': 0, 'class': 'F', 'word': 'no forward events: registered 2026-10-24'})
    return out


def ndx_cell(name, file, flag, lag, h, orig, family, rng):
    P = pd.read_parquet(DATA / file)
    P = P[P.index <= END]
    lp = np.log(P.NDX.astype(float))
    r = lp.shift(-(h + 1)) - lp.shift(-1)              # entry next close, h sessions
    df = pd.DataFrame({'r': r, 'flag': P[flag].astype(bool), 'split': P.split}).dropna(subset=['r'])
    at = expanding_known(df.index, df.r.to_numpy(), pd.Timedelta(days=int((h + 1) * 7 / 5) + 3), 504)
    b = np.array([at(t) for t in df.index])
    df = df.assign(b0_mean=b[:, 0], b0_p=b[:, 1], b0_sd=b[:, 2], date=df.index, dir=1, month=df.index.strftime('%Y-%m'))
    ok = df.b0_mean.notna().to_numpy()
    allr = (df.r - df.b0_mean).to_numpy()
    idx = np.flatnonzero(df.flag.to_numpy() & ok)
    elig = np.flatnonzero(ok)
    vals = allr[elig]; pos = np.searchsorted(elig, idx)
    pl = circ_placebo(elig, lambda i: vals[i], pos, rng)
    cost = nq_cost()
    cell = df[df.flag]
    out = [summarise(f'{name} (all)', cell, cluster='month', rng=rng, cost=cost, placebo=pl, orig=orig, family=family, cls='H-R',
                     units=f'NDX log return, next close +{h} sessions')]
    for sp in ('discover', 'validate', 'test'):
        c = cell[cell.split == sp]
        if len(c):
            out.append(summarise(f'{name} split {sp}', c, cluster='month', rng=rng, cost=cost, family=family, cls='H-R', units='as above'))
    out.append({'cell': f'{name} forward (F)', 'n': 0, 'class': 'F', 'word': 'no forward events before the lockbox date (registered 2026-10-23); vix-signals-forward record: 0 events at 2026-10-26'})
    return out


def s6_carry(rng):
    m = pd.read_csv(DATA / 'analysis/output/rate_xsmom/monthly_returns.csv').rename(columns={'Unnamed: 0': 'month'})
    m['date'] = pd.PeriodIndex(m.month, freq='M').to_timestamp('M')
    m = m[m.date <= END].dropna(subset=['carry'])
    m = m.assign(dir=1, r=m.carry, b0_mean=0.0, b0_p=0.5, b0_sd=m.carry.expanding().std().shift(1))
    out = []
    for lab, mk, cls in [('1979-2014 (construction check)', m.date.dt.year <= 2014, 'H-D'), ('2015-2026-08 (seen)', m.date.dt.year >= 2015, 'H-D')]:
        out.append(summarise(f'S6 carry {lab}', m[mk], rng=rng, family=3, cls=cls, units='monthly long-short book return (no net drift by construction; B0 = 0, hit vs 50%)'))
    return out


def s7_overnight(rng):
    pt = json.loads((DATA / 'analysis/output/overnight-hold-toolkit/page_trades.json').read_text())
    out = []
    for inst, cost in (('nq', nq_cost()), ('gold', gold_cost())):
        tr = pd.read_csv(DATA / f'analysis/output/overnight-hold/honest_trades_{inst}.csv', parse_dates=['date'])
        tr = tr[tr.date <= END]
        dly = pt['instruments'][inst]['daily']
        dd = pd.DataFrame({'t': pd.to_datetime(dly['t'], unit='s' if isinstance(dly['t'][0], (int, float)) else None), 'c': dly['c']})
        dd = dd.sort_values('t'); dd['r'] = np.log(dd.c).diff()
        dd = dd.dropna()
        at = expanding_known(dd.t, dd.r.to_numpy() * 18.5 / 24, pd.Timedelta(days=1), 250)
        b = np.array([at(t) for t in tr.date])
        d = pd.DataFrame({'date': tr.date, 'dir': 1, 'r': np.log1p(tr.grossPct / 100), 'b0_mean': b[:, 0], 'b0_p': b[:, 1], 'b0_sd': b[:, 2],
                          'month': tr.date.dt.strftime('%Y-%m')})
        o = summarise(f'S7 overnight hold {inst} (gross vs drift)', d, cluster='month', rng=rng, cost=cost, orig=None, family=2, cls='H-R',
                      units='log return 20:00 -> 14:30 UK; B0 = daily drift x 18.5/24')
        o['net_cfd_mean_banked'] = float(tr.net.mean() / 100)
        out.append(o)
    out.append({'cell': 'S7 overnight forward (F)', 'n': 0, 'class': 'F', 'word': 'post-cutoff trades are after 2026-08-21 (lockbox): not read'})
    return out


def main():
    rng = np.random.default_rng(SEED)
    cells = []
    for fn in (s1_fomc, s2_positioning, s3_cot):
        cells += fn(rng); print(cells[-2] if len(cells) > 1 else cells[-1], flush=True)
    cells += ndx_cell('S4 VIX-beta change', 'analysis/output/vix-nasdaq-beta/panel.parquet', 'B_change_lo', 1, 5, None, 16, rng)
    cells += ndx_cell('S5 VVIX/VXN derivative', 'analysis/output/vix-calculus/panel_daily.parquet', 'dRimp_hi', 1, 20, None, 46, rng)
    cells += s6_carry(rng)
    cells += s7_overnight(rng)
    cells.append({'cell': 'S8 reversal hour', 'n': None, 'class': None,
                  'word': 'not scored: no prereg or per-event output; a conditional reversal rate, not a signed drift'})
    (OUT / 'scoreboard.json').write_text(json.dumps({'seed': SEED, 'ledger_n': LEDGER_N, 'cells': cells}, indent=1, default=float))
    for c in cells:
        print({k: (round(v, 5) if isinstance(v, float) else v) for k, v in c.items() if k in
               ('cell', 'n', 'class', 'raw_mean', 'b0_mean_in_direction', 'excess_ret', 'ci_excess_ret', 'excess_hit', 'p_placebo', 'p_boot', 'p_family_bonf', 'p_ledger_bonf', 'net_ev_per_event', 'word')})


if __name__ == '__main__':
    main()
