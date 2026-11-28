"""fred-untested-range — forge/FRED_UNTESTED_RANGE_PREREG.md.

49 FRED units (ALFRED first release, available from realtime_start, usable for session D if realtime_start <= D-2) x
2 transforms (lvl, mov; causal 756-day trailing percentile) x 6 targets (EURUSD USDJPY GOLD NQ SPX500 POOL).
Outcome e5 = mean over next 5 sessions of ln(realised HL / shipped p50). Statistic: top-tercile minus bottom-tercile mean.
Discovery 2020-08-24 -> 2023-08-18 BH q 0.10 on circular-shift placebo p; held-out 2023-08-21 -> 2026-08-20 Holm 0.05.

Run: python scripts/fred-untested-range/run.py [--control]   (--control = positive control only)
"""
import glob, json, sys
import numpy as np
from common import *

GROWTH = {'PCEPILFE', 'PPIFIS', 'DGORDER', 'TOTBKCR'}
LOG = {'USEPUINDXD', 'USEPUINDXM', 'GEPUCURRENT', 'EPUTRADE', 'WLCFLPCL', 'DTWEXEMEGS', 'WTREGEN', 'WRESBAL', 'EVZCLS', 'OVXCLS',
       'DEXUSEU', 'DEXJPUS', 'DEXUSUK', 'DEXCAUS', 'DEXSZUS', 'DEXUSAL', 'DEXUSNZ', 'DEXCHUS', 'DHHNGSP', 'SWPT', 'SOFRVOL',
       'NDFFRIW027SBOG', 'WMTSECL1'}
TARGETS = INSTS + ['POOL']
GRID = pd.bdate_range('2014-01-01', END)


def load_unit(uid):
    if uid == 'IORB_SPLICE':
        a = load_raw('IOER'); b = load_raw('IORB')
        return pd.concat([a[a.date <= '2021-07-28'], b[b.date >= '2021-07-29']]).reset_index(drop=True)
    return load_raw(uid)


def load_raw(sid):
    d = pd.read_csv(os.path.join(VINT, f'{sid}.csv'), dtype={'value': str})
    d = d[~d.value.isin(['.', ''])].copy()
    d['value'] = d.value.astype(float); d['date'] = pd.to_datetime(d.date); d['avail'] = pd.to_datetime(d.realtime_start)
    return d[['date', 'value', 'avail']]


def pit_on_grid(d):
    """value with the latest observation date among rows whose avail <= D - 2 calendar days."""
    d = d.sort_values(['avail', 'date']).reset_index(drop=True)
    dates = d.date.values; vals = d.value.values
    # index of the row holding the running-max date
    arg = np.zeros(len(d), int); best = -1; bi = 0
    for i, t in enumerate(dates.astype('datetime64[ns]').astype(np.int64)):
        if t >= best: best = t; bi = i
        arg[i] = bi
    cut = (GRID - pd.Timedelta(days=2)).values
    j = np.searchsorted(d.avail.values, cut, side='right') - 1
    jj = arg[np.clip(j, 0, None)]
    out = np.where(j >= 0, vals[jj], np.nan)
    # A1 staleness: a dead or paused series is missing, not carried forward (gap by the series' own frequency)
    gap = np.median(np.diff(np.sort(d.date.values)).astype('timedelta64[D]').astype(int))
    maxage = 10 if gap <= 3 else (21 if gap <= 10 else 100)
    age = (GRID.values - dates[jj]).astype('timedelta64[D]').astype(int)
    out[age > maxage] = np.nan
    return out


def transforms(uid, x):
    if uid in GROWTH or uid in LOG:
        x = np.log(x) if np.nanmin(x) > 0 else np.log1p(np.clip(x, 0, None))
    s = pd.Series(x)
    lvl = (s - s.shift(252)).values if uid in GROWTH else s.values
    mov = np.abs((s - s.shift(CHG)).values)
    return {'lvl': trailing_pct(lvl), 'mov': trailing_pct(mov)}


def build_signals(units):
    sig = {}
    for u in units:
        x = pit_on_grid(load_unit(u))
        for t, v in transforms(u, x).items():
            sig[(u, t)] = pd.Series(v, index=GRID)
    return sig


def shift_placebo(ev, pc, step=5, margin=63):
    n = len(ev); ks = range(margin, n - margin, step)
    return np.array([tdiff(ev, np.roll(pc, k)) for k in ks])


def score(ev, pc, rng, B, cal=1.0):
    est = tdiff(ev, pc)
    pl = shift_placebo(ev, pc); pl = pl[np.isfinite(pl)]
    mu, sd = (pl.mean(), pl.std()) if len(pl) > 20 else (np.nan, np.nan)
    z = (est - mu) / sd if np.isfinite(est) and sd > 0 else np.nan
    p = math.erfc(abs(z) / cal / math.sqrt(2)) if np.isfinite(z) else 1.0
    bs = boot(ev, pc, rng, B); lo, hi = np.nanpercentile(bs, [2.5, 97.5]) if np.isfinite(bs).sum() > 50 else (np.nan, np.nan)
    return dict(est=est, z=z, p=p, cal=cal, pl_mu=mu, pl_sd=sd, lo=lo, hi=hi, pl95=[np.nanpercentile(pl, 2.5), np.nanpercentile(pl, 97.5)] if len(pl) else [np.nan, np.nan])


def run_family(sig, E5, rng, tag='main', CAL=None):
    CAL = CAL or {}
    S = E5.index; disc = np.asarray(S < SPLIT); held = np.asarray(S >= SPLIT)
    cells, unscorable = [], []
    for (u, t), s in sig.items():
        pc_all = s.reindex(S).values
        cov_d, cov_h = np.isfinite(pc_all[disc]).mean(), np.isfinite(pc_all[held]).mean()
        bal = min(np.mean(pc_all[m] >= 2 / 3) for m in (disc, held)), min(np.mean(pc_all[m] <= 1 / 3) for m in (disc, held))
        if cov_d < 0.70 or cov_h < 0.70 or min(bal) < 0.15:   # A1 balance rule
            unscorable.append(dict(unit=u, tr=t, cov_disc=float(cov_d), cov_held=float(cov_h), min_top=float(bal[0]), min_bot=float(bal[1]))); continue
        for tg in TARGETS:
            ev = E5[tg].values
            r = score(ev[disc], pc_all[disc], rng, B_DISC, CAL.get((tg, 'disc'), 1.0))
            cells.append(dict(unit=u, tr=t, target=tg, cov_disc=float(cov_d), cov_held=float(cov_h),
                              disc=r, n_top=int(np.sum(np.isfinite(ev[disc]) & (pc_all[disc] >= 2 / 3))),
                              n_bot=int(np.sum(np.isfinite(ev[disc]) & (pc_all[disc] <= 1 / 3)))))
    ps = [c['disc']['p'] for c in cells]
    surv = bh(ps, 0.10)
    for i, c in enumerate(cells): c['bh'] = i in surv
    sidx = sorted(surv)
    for i in sidx:
        c = cells[i]; pc = sig[(c['unit'], c['tr'])].reindex(S).values; ev = E5[c['target']].values
        c['held'] = score(ev[held], pc[held], rng, B_CONF, CAL.get((c['target'], 'held'), 1.0))
    hp = [cells[i]['held']['p'] for i in sidx]
    hk = holm(hp, 0.05) if hp else set()
    for j, i in enumerate(sidx):
        c = cells[i]; h = c['held']; d = c['disc']
        same = np.sign(h['est']) == np.sign(d['est'])
        ci0 = (h['lo'] > 0) if h['est'] > 0 else (h['hi'] < 0)
        c['holm'] = j in hk
        c['confirmed'] = bool(same and c['holm'] and ci0 and abs(h['est']) >= math.log(1.05))
    return cells, unscorable


def full_grade(c, sig, E5, rng, CAL):
    """graded weight: full-sample effect and its own shift-placebo MDE95."""
    S = E5.index; pc = sig[(c['unit'], c['tr'])].reindex(S).values; ev = E5[c['target']].values
    est = tdiff(ev, pc); pl = shift_placebo(ev, pc); pl = pl[np.isfinite(pl)]
    sd = pl.std() if len(pl) > 20 else np.nan
    mde = 2.8 * sd * max(CAL[(c['target'], 'disc')], CAL[(c['target'], 'held')])
    return dict(full_est=est, full_pl_sd=sd, full_mde95=mde)


def noise_pcts(rng, n=300):
    out = []
    for k in range(n):
        phi = [0.95, 0.99, 0.998][k % 3]; z = np.zeros(len(GRID)); eps = rng.standard_normal(len(z))
        for t in range(1, len(z)): z[t] = phi * z[t - 1] + eps[t]
        out.append(pd.Series(trailing_pct(z), index=GRID))
    return out


def calibrate(E5, noise):
    """A2: SD of the placebo z across pure-noise persistent signals, per target and period (the normal p is too liberal)."""
    S = E5.index; cal, raw = {}, {}
    for per, m in [('disc', np.asarray(S < SPLIT)), ('held', np.asarray(S >= SPLIT))]:
        for tg in TARGETS:
            ev = E5[tg].values[m]; zs = []
            for s in noise:
                p = s.reindex(S).values[m]; est = tdiff(ev, p); pl = shift_placebo(ev, p); pl = pl[np.isfinite(pl)]
                if np.isfinite(est) and len(pl) > 20: zs.append((est - pl.mean()) / pl.std())
            zs = np.array(zs); cal[(tg, per)] = float(max(1.0, zs.std())); raw[f'{tg}|{per}'] = dict(sd_z=float(zs.std()), n=len(zs), frac_abs_gt_196=float((np.abs(zs) > 1.96).mean()))
    return cal, raw


def positive_control(E5, rng, noise, CAL):
    """A2: plant +0.10 (log) on POOL when a pure-noise persistent signal (phi 0.99) is in its top tercile, both periods."""
    res = []
    for k in range(3):
        s = noise[3 * k + 1]           # phi 0.99 members
        pc = s.reindex(E5.index).values
        planted = E5.copy(); planted['POOL'] = planted['POOL'] + np.where(pc >= 2 / 3, 0.10, 0.0)
        raw = run_family({('NOISE', 'lvl'): s}, E5, rng, CAL=CAL)[0]
        cells = run_family({('NOISE', 'lvl'): s}, planted, rng, CAL=CAL)[0]
        c = [x for x in cells if x['target'] == 'POOL'][0]; r0 = [x for x in raw if x['target'] == 'POOL'][0]
        res.append(dict(rep=k, disc=c['disc'], held=c.get('held'), bh_single=c['bh'], confirmed=c.get('confirmed', False),
                        recovered_disc=c['disc']['est'] - r0['disc']['est']))
    # size: calibrated p on fresh noise (not used for calibration)
    fresh = noise_pcts(rng, 60); S = E5.index; disc = np.asarray(S < SPLIT); ev = E5['POOL'].values[disc]; ps = []
    for s in fresh:
        p = s.reindex(S).values[disc]; r = score(ev, p, rng, 10, CAL[('POOL', 'disc')]); ps.append(r['p'])
    ps = np.array(ps)
    return dict(plants=res, fresh_noise_frac_p_lt_05=float((ps < 0.05).mean()), fresh_noise_frac_p_lt_01=float((ps < 0.01).mean()))


def main():
    rng = np.random.default_rng(SEED)
    E, E5 = errors(); E5['POOL'] = E5[INSTS].mean(axis=1, skipna=False)
    noise = noise_pcts(rng, 300)
    CAL, calraw = calibrate(E5, noise)
    json.dump(calraw, open(os.path.join(OUT, 'calibration.json'), 'w'), indent=1)
    print('CAL', {k: round(v, 2) for k, v in CAL.items()})
    ctrl = positive_control(E5, rng, noise, CAL)
    json.dump(ctrl, open(os.path.join(OUT, 'positive_control.json'), 'w'), indent=1, default=float)
    print('CONTROL', json.dumps(ctrl, default=lambda v: round(float(v), 4)))
    if '--control' in sys.argv: return
    units = sorted({os.path.basename(f)[:-4] for f in glob.glob(os.path.join(VINT, '*.csv'))} - {'IOER', 'IORB'}) + ['IORB_SPLICE']
    sig = build_signals(units)
    cells, unscorable = run_family(sig, E5, rng, CAL=CAL)
    for c in cells:
        c.update(full_grade(c, sig, E5, rng, CAL))
        c['grade'] = 'VALIDATED' if c.get('confirmed') else ('NULL' if c['full_mde95'] <= math.log(1.10) else 'UNDERPOWERED')
    # descriptives for confirmed cells: VIX overlap, Monday-only
    vix = pd.read_parquet(os.path.join(DATA, 'features', 'vix.parquet'))
    vix['asof'] = pd.to_datetime(vix['asof'], utc=True).dt.tz_localize(None)
    vix = vix.dropna(subset=['value']).sort_values('asof')
    vg = pd.Series(vix['value'].values, index=vix['asof'].values)
    vgrid = vg.groupby(level=0).last().reindex(GRID - pd.Timedelta(days=1), method='ffill').values
    vpct = pd.Series(trailing_pct(vgrid), index=GRID).reindex(E5.index).values
    S = E5.index; held = np.asarray(S >= SPLIT); mon = np.asarray(S.dayofweek == 0)
    for c in cells:
        if not c.get('bh'): continue
        pc = sig[(c['unit'], c['tr'])].reindex(S).values; ev = E5[c['target']].values
        ok = np.isfinite(pc) & np.isfinite(vpct)
        c['corr_vix_pct'] = float(np.corrcoef(pc[ok], vpct[ok])[0, 1])
        mid = held & (vpct > 1 / 3) & (vpct < 2 / 3)
        c['held_within_vix_mid'] = tdiff(ev[mid], pc[mid])
        c['held_monday_only'] = tdiff(np.where(mon[held], ev[held], np.nan), pc[held], nmin=20)
    nsc = len(cells); nb = sum(c['bh'] for c in cells); ncf = sum(c.get('confirmed', False) for c in cells)
    pool = [c for c in cells if c['target'] == 'POOL']
    fam = 'VALIDATED' if ncf else ('NULL' if sum(c['grade'] == 'NULL' for c in pool) >= len(pool) / 2 else 'UNDERPOWERED')
    res = dict(id='fred-untested-range', seed=SEED, n_units=len(units), n_scorable_cells=nsc, unscorable=unscorable,
               bh_q=0.10, holm_alpha=0.05, bh_survivors=nb, confirmed=ncf, family_verdict=fam,
               discovery=[str(S[S < SPLIT][0].date()), str(S[S < SPLIT][-1].date())],
               heldout=[str(S[S >= SPLIT][0].date()), str(S[S >= SPLIT][-1].date())],
               positive_control=ctrl, calibration={f'{a}|{b}': v for (a, b), v in CAL.items()}, cells=cells)
    json.dump(res, open(os.path.join(OUT, 'results.json'), 'w'), indent=1, default=lambda v: None if v is None or (isinstance(v, float) and not np.isfinite(v)) else float(v))
    print({k: res[k] for k in ['n_units', 'n_scorable_cells', 'bh_survivors', 'confirmed', 'family_verdict']})
    print('unscorable:', [(u['unit'], u['tr']) for u in unscorable])
    r = lambda v: None if v is None or not np.isfinite(v) else round(pct(v), 1)
    for c in sorted(cells, key=lambda c: c['disc']['p'])[:40]:
        h = c.get('held')
        print(f"{c['unit']:15} {c['tr']} {c['target']:6} disc {r(c['disc']['est'])}% p={c['disc']['p']:.4f} {'BH' if c['bh'] else '  '}"
              + (f" | held {r(h['est'])}% [{r(h['lo'])},{r(h['hi'])}] p={h['p']:.4f} {'HOLM' if c['holm'] else ''} {'CONFIRMED' if c['confirmed'] else ''}" if h else '')
              + f" | full {r(c['full_est'])}% mde {r(c['full_mde95'])} {c['grade']}")


if __name__ == '__main__':
    main()
