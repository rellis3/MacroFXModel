#!/usr/bin/env python3
"""coherence-conviction runner -- forge/COHERENCE_CONVICTION_PREREG.md (seed 20261115).

    python -X utf8 -I scripts/coherence-conviction/run.py --selftest   # synthetic controls only (prereg 3.6)
    python -X utf8 -I scripts/coherence-conviction/run.py              # selftest, power stage, then the registered run

The lean (4h EMA20 slope at 07:00 London) and its R (07:00 -> 21:00 London, 1 sigma20 stop, bid/ask M1, spread inside)
come from scripts/slow-bias-clock/run.py, imported unchanged (r_entries / M1Inst / trade_R / NY-close builders).
The coherence score is built here from SPX500 / VIX / DGS2 / a 7-leg USD basket, dated by US close t1 < 07:00 London D.

Local files only; R2_* env cleared; nothing after 2026-08-21 read (asserted). One process, <= 2 BLAS threads.
Writes analysis/output/coherence-conviction/{results.json, selftest.json, power_sim.json, entries.parquet,
evidence/<cell>/evidence/...}. RESULTS.md is written by hand from results.json.
"""
from __future__ import annotations

import argparse
import importlib.util
import json
import math
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

for k in list(os.environ):
    if k.startswith('R2_'):
        del os.environ[k]
os.environ.setdefault('OMP_NUM_THREADS', '2')
os.environ.setdefault('MKL_NUM_THREADS', '2')
os.environ.setdefault('OPENBLAS_NUM_THREADS', '2')

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
_spec = importlib.util.spec_from_file_location('sbc', ROOT / 'scripts' / 'slow-bias-clock' / 'run.py')
sbc = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(sbc)
from pack import build_pack  # noqa: E402  (path inserted by sbc)

SLUG = 'coherence-conviction'
PREREG = 'forge/COHERENCE_CONVICTION_PREREG.md'
SEED = 20261115
LOCKBOX = pd.Timestamp('2026-08-21')
THRESH_START = pd.Timestamp('2005-01-03')
B_BOOT, BLOCK = 2000, 21
Z_HOLM1 = 2.64            # 0.05/6 two-sided
Z_MDE = 3.48
OUT = ROOT / 'analysis' / 'output' / SLUG
COMP = ['EQ', 'VOL', 'RATES', 'USD']
CELLS = [  # name, arm, bar, design MDE
    ('dR_coh_inc', 'primary', 0.05, 0.053),
    ('dR_coh_all', 'primary', 0.05, 0.031),
    ('dhit_coh_inc', 'primary', 0.05, 0.036),
    ('dhit_coh_all', 'primary', 0.05, 0.021),
    ('dR_agree_all', 'secondary', 0.05, 0.049),
    ('dR_tape_h4', 'secondary', 0.05, 0.049),
]
CELL = {c[0]: c for c in CELLS}
log, die = sbc.log, sbc.die


# ───────────────────────────── inputs (prereg 3.3) ─────────────────────────────

def load_components():
    spx = sbc.px_daily('spx500')
    legs = {'eurusd': -1, 'gbpusd': -1, 'audusd': -1, 'nzdusd': -1, 'usdjpy': 1, 'usdcad': 1, 'usdchf': 1}
    lr = {}
    for k, s in legs.items():
        p = sbc.px_daily(k)
        lr[k] = s * np.log(p).diff()
    usd = pd.concat(lr, axis=1, join='inner').dropna().mean(axis=1)
    v = pd.read_parquet(ROOT / 'features' / 'vix.parquet')
    vix = pd.Series(pd.to_numeric(v['value'], errors='coerce').to_numpy(), index=pd.to_datetime(v['date']).dt.normalize())
    vix = vix[~vix.index.duplicated(keep='last')].sort_index().dropna()
    vix = vix[(vix.index <= LOCKBOX) & (vix > 0)]
    d = pd.read_csv(ROOT / 'analysis' / 'output' / 'cot-crowding-programme' / 'macro_DGS2.csv', na_values='.')
    dgs2 = pd.Series(pd.to_numeric(d['value'], errors='coerce').to_numpy(), index=pd.to_datetime(d['date'])).dropna().sort_index()
    dgs2 = dgs2[dgs2.index <= LOCKBOX]
    # cross-check vs first prints (prereg: never revised; assert equality on the overlap)
    vt = pd.read_csv(ROOT / 'data' / 'iep_macro' / 'DGS2_vintages.csv', na_values='.')
    vt['value'] = pd.to_numeric(vt['value'], errors='coerce')
    fp = vt.dropna().sort_values(['date', 'realtime_start']).drop_duplicates('date')
    fp = pd.Series(fp['value'].to_numpy(), index=pd.to_datetime(fp['date']))
    j = pd.concat([dgs2, fp], axis=1, join='inner')
    mism = int((j.iloc[:, 0] - j.iloc[:, 1]).abs().gt(1e-9).sum())
    assert len(j) > 2000 and mism == 0, f'DGS2 latest vintage != first print on {mism} of {len(j)} dates'
    for s in (spx, usd, vix, dgs2):
        assert s.index.max() <= LOCKBOX, 'LOCKBOX BREACH (coherence inputs)'
    x = {'EQ': np.log(spx).diff().dropna(), 'VOL': np.log(vix).diff().dropna(), 'RATES': dgs2.diff().dropna(), 'USD': usd}
    return x, {'dgs2_firstprint_overlap': int(len(j)), 'dgs2_mismatch': mism,
               'span': {c: [str(s.index.min().date()), str(s.index.max().date()), int(len(s))] for c, s in x.items()}}


def coherence_frame(x: dict, zwin=60, rates_lag=0, vix_sign_only=False):
    """Everything at date t1 uses observations dated <= t1 only (rolling / expanding windows)."""
    z = {}
    for c in COMP:
        s = x[c].dropna().sort_index()
        if c == 'RATES' and rates_lag:
            s = s.shift(rates_lag).dropna()
        z[c] = s / s.rolling(zwin, min_periods=zwin).std()
    Z = pd.concat(z, axis=1, join='inner').dropna()
    S = pd.DataFrame(index=Z.index)
    for c in COMP:
        S[c] = 1.0 if c == 'EQ' else np.sign(Z[c].rolling(252, min_periods=120).corr(Z['EQ']))
    O = (Z * S).dropna()
    O = O[(S.loc[O.index] != 0).all(axis=1)]
    if vix_sign_only:
        O['VOL'] = np.sign(O['VOL'])
    absum = O.abs().sum(axis=1)
    K = (O.sum(axis=1).abs() / absum).where(absum > 0)
    m = O.mean(axis=1)
    f = pd.concat({**{f'o_{c}': O[c] for c in COMP}, **{f's_{c}': S.loc[O.index, c] for c in COMP}}, axis=1)
    f['K'] = K
    f['m'] = m
    Kt = K[K.index >= THRESH_START]
    f['q1'] = Kt.expanding(min_periods=500).quantile(1 / 3)
    f['q2'] = Kt.expanding(min_periods=500).quantile(2 / 3)
    am = m.abs()[m.index >= THRESH_START]
    f['mq1'] = am.expanding(min_periods=500).quantile(1 / 3)
    f['mq2'] = am.expanding(min_periods=500).quantile(2 / 3)
    lab = pd.Series('NA', index=f.index, dtype=object)
    ok = f['q1'].notna() & f['K'].notna()
    lab[ok & (f['K'] >= f['q2'])] = 'COH'
    lab[ok & (f['K'] <= f['q1'])] = 'INC'
    lab[ok & (f['K'] > f['q1']) & (f['K'] < f['q2'])] = 'MID'
    f['label'] = lab
    sg = np.sign(O)
    f['unanimous'] = (sg.eq(sg.iloc[:, 0], axis=0)).all(axis=1)
    f['split22'] = sg.sum(axis=1).eq(0)
    return f


def inst_beta(close: pd.Series, m: pd.Series):
    r = np.log(close).diff()
    j = pd.concat([r, m], axis=1, join='inner').dropna()
    return np.sign(j.iloc[:, 0].rolling(252, min_periods=120).corr(j.iloc[:, 1]))


def asof(series: pd.Series, when: pd.DatetimeIndex):
    s = series.dropna()
    s = s[~s.index.duplicated(keep='last')].sort_index()
    idx = np.searchsorted(s.index.values, when.values.astype(s.index.values.dtype), 'right') - 1
    out = np.where(idx >= 0, s.to_numpy()[np.clip(idx, 0, None)], np.nan)
    return out


def attach(E: pd.DataFrame, f: pd.DataFrame, betas: dict):
    """E: entries with date D, inst, RL, RS, h4. t1 = previous weekday of D; coherence read at t1 exactly."""
    E = E.copy()
    E['t1'] = (pd.DatetimeIndex(E['date']) - pd.offsets.BDay(1)).normalize()
    g = f.reindex(pd.DatetimeIndex(E['t1']))
    for c in ['K', 'm', 'label', 'unanimous', 'split22', 'mq1', 'mq2'] + [f'o_{c}' for c in COMP]:
        E[c] = g[c].to_numpy()
    E['label'] = E['label'].fillna('NA')
    E['beta'] = np.nan
    for inst, b in betas.items():
        mk = (E['inst'] == inst).to_numpy()
        E.loc[mk, 'beta'] = asof(b, pd.DatetimeIndex(E.loc[mk, 't1']))
    E['tape'] = np.sign(E['m'].fillna(0)) * E['beta'].fillna(0)
    E['R'] = np.where(E['h4'] > 0, E['RL'], E['RS'])
    E['hit'] = (E['R'] > 0).astype(float)
    E['COH'] = (E['label'] == 'COH').astype(float)
    E['INC'] = (E['label'] == 'INC').astype(float)
    E['AGREE'] = ((E['label'] == 'COH') & (E['tape'] == E['h4'])).astype(float)
    E['OPPOSE'] = ((E['label'] == 'COH') & (E['tape'] == -E['h4'])).astype(float)
    E['COH6'] = ((E['label'] == 'COH') & (E['tape'] != 0)).astype(float)
    Rt = np.where(E['tape'] > 0, E['RL'], E['RS'])
    E['x6'] = np.where(E['COH6'] > 0, Rt - E['R'], 0.0)
    Rm = np.where(E['tape'] < 0, E['RL'], E['RS'])
    E['x6m'] = np.where(E['COH6'] > 0, Rm - E['R'], 0.0)
    return E


# ───────────────────────────── scoring (prereg 3.4) ─────────────────────────────

SPEC = {  # cell -> (value col, group1 col, group2 col | 'ALL' | None)
    'dR_coh_inc': ('R', 'COH', 'INC'),
    'dR_coh_all': ('R', 'COH', 'ALL'),
    'dhit_coh_inc': ('hit', 'COH', 'INC'),
    'dhit_coh_all': ('hit', 'COH', 'ALL'),
    'dR_agree_all': ('R', 'AGREE', 'ALL'),
    'dR_tape_h4': ('x6', 'COH6', None),
}


def per_date(P, v, g1, g2):
    val = P[v].to_numpy(float)
    a = P[g1].to_numpy(float)
    if g2 is None:
        b = np.zeros(len(P))
    elif g2 == 'ALL':
        b = np.ones(len(P))
    else:
        b = P[g2].to_numpy(float)
    df = pd.DataFrame({'d': P['date'].to_numpy(), 'a': val * a, 'na': a, 'b': val * b, 'nb': b})
    per = df.groupby('d', sort=True)[['a', 'na', 'b', 'nb']].sum()
    return per.index, per.to_numpy()


def stat_A(A, two):
    s = A.sum(axis=0) if A.ndim == 2 else A
    e = s[..., 0] / s[..., 1]
    if two:
        e = e - s[..., 2] / s[..., 3]
    return e


def score_cell(P, v, g1, g2, rng=None, B=B_BOOT, cnt=None):
    idx, A = per_date(P, v, g1, g2)
    two = g2 is not None
    est = float(stat_A(A, two))
    if cnt is None:
        cnt = sbc.block_counts(len(A), rng, B, BLOCK)
    S_ = cnt[:, :len(A)] @ A
    with np.errstate(invalid='ignore', divide='ignore'):
        bs = S_[:, 0] / S_[:, 1] - ((S_[:, 2] / S_[:, 3]) if two else 0)
    bs = bs[np.isfinite(bs)]
    mid = len(A) // 2
    h = [float(stat_A(A[:mid], two)), float(stat_A(A[mid:], two))]
    return {'est': est, 'lo': float(np.percentile(bs, 2.5)), 'hi': float(np.percentile(bs, 97.5)),
            'se': float(bs.std(ddof=1)), 'n_rows_g1': int(A[:, 1].sum()), 'n_dates': int(len(A)),
            'n_dates_g1': int((A[:, 1] > 0).sum()), 'halves': h, 'half_split': str(pd.Timestamp(idx[mid]).date()),
            'g1_mean': float(A[:, 0].sum() / A[:, 1].sum()),
            'g2_mean': float(A[:, 2].sum() / A[:, 3].sum()) if two else 0.0}


def score_all(P, rng, B=B_BOOT):
    out = {}
    for name, (v, g1, g2) in SPEC.items():
        out[name] = score_cell(P, v, g1, g2, rng, B)
    return out


def cell_word(c, holm_p):
    bar = c['bar']
    mde = max(c['design_mde'], Z_MDE * c['se_used'], c.get('sim_mde') or 0.0)
    c['mde_binding'] = mde
    pc_ok = c.get('pack_plant_1x') is None or c['pack_plant_1x'] >= 0.8
    c['powered'] = bool(mde <= bar and pc_ok)
    sig = c['lo'] > 0 and holm_p < 0.05
    stable = all(h is not None and h > 0 for h in c['halves'])
    plc = c.get('placebo_pct') is None or c['placebo_pct'] >= 97.5
    mirror_ok = c.get('mirror_ok', True)
    c['gate'] = {'ci_lower_gt0': bool(c['lo'] > 0), 'holm_lt_0.05': bool(holm_p < 0.05), 'halves_same_sign': bool(stable),
                 'placebo_97_5': bool(plc), 'mirror_ok': bool(mirror_ok), 'est_ge_bar': bool(c['est'] >= bar)}
    if sig and stable and plc and mirror_ok and c['est'] >= bar:
        return 'VALIDATED'
    if sig:
        return 'CONTEXT'
    if c['powered'] and c['hi'] < bar:
        return 'NULL'
    return 'UNDERPOWERED'


def id_word(cells):
    w = {c['name']: c['word'] for c in cells}
    prim = [w[n] for n, a, _, _ in CELLS if a == 'primary']
    if 'VALIDATED' in prim:
        return 'VALIDATED'
    if 'CONTEXT' in w.values() or 'VALIDATED' in w.values():
        return 'CONTEXT'
    if all(x == 'NULL' for x in w.values()):
        return 'NULL'
    return 'UNDERPOWERED'


# ───────────────────────────── power stage (prereg 3.7) ─────────────────────────────

def permute_labels(P, rng):
    """Permute (label, m, K, unanimous...) as whole dates; tape/agree recomputed from the permuted m."""
    dl = P.drop_duplicates('date').set_index('date')[['label', 'm']]
    perm = dl.iloc[rng.permutation(len(dl))]
    mp = pd.DataFrame({'label': perm['label'].to_numpy(), 'm': perm['m'].to_numpy()}, index=dl.index)
    Q = P.drop(columns=['label', 'm']).join(mp, on='date')
    Q['tape'] = np.sign(Q['m'].fillna(0)) * Q['beta'].fillna(0)
    Q['COH'] = (Q['label'] == 'COH').astype(float)
    Q['INC'] = (Q['label'] == 'INC').astype(float)
    Q['AGREE'] = ((Q['label'] == 'COH') & (Q['tape'] == Q['h4'])).astype(float)
    Q['COH6'] = ((Q['label'] == 'COH') & (Q['tape'] != 0)).astype(float)
    Rt = np.where(Q['tape'] > 0, Q['RL'], Q['RS'])
    Q['x6'] = np.where(Q['COH6'] > 0, Rt - Q['R'], 0.0)
    return Q


def plant(Q, name, delta, rng):
    """Add a known lift of size `delta` to the cell's statistic (in expectation)."""
    Q = Q.copy()
    v, g1, g2 = SPEC[name]
    m1 = Q[g1].to_numpy(float) > 0
    share = m1.mean()
    eff = delta / (1 - share) if g2 == 'ALL' else delta
    if v == 'R':
        Q.loc[m1, 'R'] = Q.loc[m1, 'R'] + eff
    elif v == 'hit':
        miss = m1 & (Q['hit'].to_numpy() == 0)
        p = min(1.0, eff * m1.sum() / max(1, miss.sum()))
        flip = miss & (rng.random(len(Q)) < p)
        Q.loc[flip, 'hit'] = 1.0
    elif v == 'x6':
        dif = m1 & (Q['tape'].to_numpy() != Q['h4'].to_numpy())
        d = dif.sum() / max(1, m1.sum())
        Q.loc[dif, 'x6'] = Q.loc[dif, 'x6'] + delta / max(d, 1e-6)
    return Q


def power_stage(P, rng, n_runs=40, B=300):
    res = {}
    T = P['date'].nunique()
    cnt = sbc.block_counts(T, rng, B, BLOCK)
    for name, arm, bar, dm in CELLS:
        v, g1, g2 = SPEC[name]
        rows = []
        for mult in (0.5, 1.0, 2.0):
            hits, ests = 0, []
            for _ in range(n_runs):
                Q = plant(permute_labels(P, rng), name, bar * mult, rng)
                sc = score_cell(Q, v, g1, g2, cnt=cnt)
                ests.append(sc['est'])
                hits += int(sc['se'] > 0 and sc['est'] / sc['se'] > Z_HOLM1)
            rows.append({'mult': mult, 'detected': hits / n_runs, 'mean_est': float(np.mean(ests))})
        # interpolate the 80% point on (mult, detected)
        mde = float('inf')
        pts = [(0.0, 0.0)] + [(r['mult'], r['detected']) for r in rows]
        for (x0, y0), (x1, y1) in zip(pts[:-1], pts[1:]):
            if y1 >= 0.8 > y0:
                mde = bar * (x0 + (0.8 - y0) * (x1 - x0) / max(y1 - y0, 1e-9))
                break
            if y0 >= 0.8:
                mde = bar * x0
                break
        res[name] = {'grid': rows, 'sim_mde': mde, 'bar': bar}
        log('power', name, rows, 'sim MDE', mde)
    return res


# ───────────────────────────── evidence packs ─────────────────────────────

def pack_cell(P, name, bar, word, seed, n_placebo=300, n_plants=20, B=400):
    v, g1, g2 = SPEC[name]
    if name == 'dR_tape_h4':
        Q = P[P['COH6'] > 0]
        rows = pd.DataFrame({'date': Q['date'], 'inst': Q['inst'], 'signal': Q['tape'], 'side': Q['tape'],
                             'RL': Q['RL'], 'RS': Q['RS'], 'Rh4': Q['R'], 'h4': Q['h4']}).reset_index(drop=True)
        rows['outcome'] = np.where(rows['side'] > 0, rows['RL'], rows['RS']) - rows['Rh4']

        def est(r):
            return float((np.where(r['side'].to_numpy() > 0, r['RL'], r['RS']) - r['Rh4'].to_numpy()).mean())

        def plant_fn(r, effect, g):
            dif = (r['side'].to_numpy() != r['h4'].to_numpy())
            d = max(dif.mean(), 1e-6)
            e = effect / (2 * d)
            return r.assign(RL=r['RL'] + e * r['side'], RS=r['RS'] - e * r['side'])

        def leak_fn(r, g):
            sd = np.sign(r['RL'] - r['RS'])
            return r.assign(side=sd, signal=sd)
        unit = 'R per entry: tape side minus 4h side (COH days)'
        notes = ('Rows = COH-day entries with a tape side. Placebo shuffles the tape side across dates within instrument. '
                 'Plant: the market drifts e R in the tape direction, sized so the difference rises by the planted amount. '
                 'Leak: the side is the sign of the same session move.')
    else:
        code = P[g1].to_numpy(float) - (P[g2].to_numpy(float) if g2 not in (None, 'ALL') else 0.0)
        rows = pd.DataFrame({'date': P['date'], 'inst': P['inst'], 'signal': code, 'side': code,
                             'outcome': P[v].to_numpy(float), 'lean': P['h4']}).reset_index(drop=True)
        vs_all = g2 == 'ALL'

        def est(r):
            s = r['signal'].to_numpy()
            o = r['outcome'].to_numpy()
            a = o[s > 0]
            b = o if vs_all else o[s < 0]
            if len(a) < 5 or len(b) < 5:
                return float('nan')
            return float(a.mean() - b.mean())

        def plant_fn(r, effect, g):
            s = r['signal'].to_numpy() > 0
            eff = effect / (1 - s.mean()) if vs_all else effect
            o = r['outcome'].to_numpy(float).copy()
            if v == 'hit':
                miss = s & (o == 0)
                p = min(1.0, eff * s.sum() / max(1, miss.sum()))
                o[miss & (g.random(len(o)) < p)] = 1.0
            else:
                o[s] += eff
            return r.assign(outcome=o)

        def leak_fn(r, g):
            o = r['outcome'].to_numpy()
            sd = np.where(o > (0.5 if v == 'hit' else 0), 1.0, (0.0 if vs_all else -1.0))
            return r.assign(signal=sd, side=sd)
        unit = {'R': 'R per entry (4h lean)', 'hit': 'hit rate of the 4h lean (R > 0)'}[v]
        grp2 = {'ALL': 'all labelled days', 'INC': 'INC days'}[g2]
        notes = (f'Rows = every labelled entry of the 4h lean; signal = +1 on {g1} rows, -1 on {g2} rows (else 0); '
                 f'estimate = mean outcome on {g1} rows minus mean on {grp2}. Placebo shuffles the label across dates '
                 'within instrument (outcome fixed). Plant: a lift of the planted size on the +1 rows. Leak: label = '
                 'sign of the scored outcome. "side" mirrors the label so the pack shuffles the label only; the lean side '
                 'is in column "lean".')
    pk = build_pack(rows, slug=f'{SLUG}:{name}', out=str(OUT / 'evidence' / name), estimate_fn=est, bar=bar, unit=unit,
                    plant_fn=plant_fn, leak_fn=leak_fn, verdict_word=word, seed=seed, B=B, n_placebo=n_placebo,
                    n_plants=n_plants, signal_is_state=True, notes=notes)
    return pk


# ───────────────────────────── descriptive decomposition (prereg 6) ─────────────────────────────

def decomposition(P, f, x, betas, E_raw, rng):
    dec = []
    B = 500

    def run(name, Q, v, g1, g2):
        sc = score_cell(Q, v, g1, g2, cnt=sbc.block_counts(Q['date'].nunique(), rng, B, BLOCK))
        sc['test'] = name
        sc['p'] = sbc.pz(sc['est'], sc['se'])
        dec.append(sc)
        return sc

    Q = P.copy()
    # each component's own agreement with the lean
    for c in COMP:
        dirc = np.sign(Q[f'o_{c}'].fillna(0)) * Q['beta'].fillna(0)
        Q['A1'] = (dirc == Q['h4']).astype(float)
        Q['A0'] = ((dirc != 0) & (dirc != Q['h4'])).astype(float)
        run(f'component_{c}_agrees_lean_dR', Q, 'R', 'A1', 'A0')
    # pairs agreeing vs disagreeing
    for i, a in enumerate(COMP):
        for b in COMP[i + 1:]:
            sa, sb = np.sign(Q[f'o_{a}'].fillna(0)), np.sign(Q[f'o_{b}'].fillna(0))
            Q['A1'] = ((sa * sb) > 0).astype(float)
            Q['A0'] = ((sa * sb) < 0).astype(float)
            run(f'pair_{a}_{b}_agree_vs_disagree_dR', Q, 'R', 'A1', 'A0')
    # by group
    for grp in ('fx', 'gold', 'idx'):
        G = Q[Q['inst'].map(sbc.GROUP) == grp]
        run(f'group_{grp}_dR_coh_inc', G, 'R', 'COH', 'INC')
        run(f'group_{grp}_dR_coh_all', G, 'R', 'COH', 'ALL')
    # strict unanimity vs 2-2 split
    Q['U1'] = Q['unanimous'].fillna(False).astype(float)
    Q['U0'] = Q['split22'].fillna(False).astype(float)
    run('unanimous_vs_split22_dR', Q, 'R', 'U1', 'U0')
    run('unanimous_vs_split22_dhit', Q, 'hit', 'U1', 'U0')
    # magnitude terciles
    am = Q['m'].abs()
    Q['M1'] = (am >= Q['mq2']).astype(float)
    Q['M0'] = (am <= Q['mq1']).astype(float)
    run('magnitude_top_vs_bottom_dR', Q, 'R', 'M1', 'M0')
    ps = np.array([d['p'] for d in dec])
    keep = sbc.bh(ps, 0.10)
    for d, k in zip(dec, keep):
        d['bh_q10'] = bool(k)

    extra = {}
    # mirror of C5
    extra['C5_mirror_oppose_all'] = run('C5_mirror_oppose_all', Q, 'R', 'OPPOSE', 'ALL')
    dec.pop()
    # quintile ladder of K (causal? descriptive ladder on full-sample quintiles, labelled as such)
    lad = []
    qk = pd.qcut(Q['K'].rank(method='first'), 5, labels=False)   # K = 1 (unanimous) ties >20% of rows; rank breaks ties by row order
    extra['K_eq_1_share_rows'] = float((Q['K'] >= 1 - 1e-12).mean())
    for k in range(5):
        g = Q[qk == k]
        lad.append({'quintile': k + 1, 'n': int(len(g)), 'K_mean': float(g['K'].mean()), 'R': float(g['R'].mean()),
                    'hit': float(g['hit'].mean())})
    extra['K_quintile_ladder_fullsample_cuts'] = lad
    # linear baseline: pooled OLS of R on K, date-block SE
    def ols_stats(Qx, col):
        df = pd.DataFrame({'d': Qx['date'], 'x': Qx[col], 'y': Qx['R']})
        df['xy'] = df.x * df.y
        df['xx'] = df.x * df.x
        df['n'] = 1.0
        A = df.groupby('d')[['x', 'y', 'xy', 'xx', 'n']].sum().to_numpy()

        def slope(s):
            n = s[..., 4]
            return (s[..., 2] - s[..., 0] * s[..., 1] / n) / (s[..., 3] - s[..., 0] ** 2 / n)
        b = float(slope(A.sum(axis=0)))
        c2 = sbc.block_counts(len(A), rng, B, BLOCK)
        bs = slope(c2 @ A)
        return {'slope': b, 'lo': float(np.percentile(bs, 2.5)), 'hi': float(np.percentile(bs, 97.5)), 'se': float(bs.std(ddof=1))}
    extra['ols_R_on_K'] = ols_stats(Q, 'K')
    Q['Kx'] = Q['K'] * np.where(Q['tape'] == Q['h4'], 1.0, np.where(Q['tape'] == -Q['h4'], -1.0, 0.0))
    extra['ols_R_on_K_x_tapeagree'] = ols_stats(Q, 'Kx')
    # size-multiplier book
    w = np.where(Q['label'] == 'COH', 1.5, np.where(Q['label'] == 'INC', 0.5, 1.0))
    extra['size_book'] = {'Rbar_weighted': float((w * Q['R']).sum() / w.sum()), 'Rbar_flat': float(Q['R'].mean()),
                          'diff': float((w * Q['R']).sum() / w.sum() - Q['R'].mean())}
    # directional hit vs the market's own B0
    if 'mv' in Q:
        y = (Q['mv'] > 0).astype(float)
        Q2 = Q.assign(y=y).sort_values(['inst', 'date'])
        Q2['b0'] = Q2.groupby('inst')['y'].transform(lambda s: (s.shift(1).fillna(0).cumsum() + 10) /
                                                      (np.arange(len(s)) + 20))
        exp_hit = np.where(Q2['h4'] > 0, Q2['b0'], 1 - Q2['b0'])
        Q2['dhit'] = ((np.sign(Q2['mv']) == Q2['h4']).astype(float) - exp_hit).where(Q2['mv'] != 0)
        extra['directional_hit_minus_B0'] = {lab: {'n': int(g['dhit'].notna().sum()), 'mean': float(g['dhit'].mean())}
                                             for lab, g in Q2.groupby('label')}
    # sensitivity specs (C1-C4 estimates with B=500 CIs)
    sens = {}
    for spec, kw in (('z20', {'zwin': 20}), ('rates_lag1', {'rates_lag': 1}), ('vix_sign_only', {'vix_sign_only': True})):
        f2 = coherence_frame(x, **kw)
        b2 = {i: inst_beta(c, f2['m']) for i, c in betas['_closes'].items()}
        P2 = attach(E_raw, f2, b2)
        P2 = P2[(P2['h4'] != 0) & (P2['label'] != 'NA')].reset_index(drop=True)
        cnt2 = sbc.block_counts(P2['date'].nunique(), rng, B, BLOCK)
        sens[spec] = {n: {k: v for k, v in score_cell(P2, *SPEC[n], cnt=cnt2).items() if k in ('est', 'lo', 'hi', 'se')}
                      for n in SPEC}
    extra['sensitivity'] = sens
    return dec, extra


# ───────────────────────────── selftest (prereg 3.6) ─────────────────────────────

def synth_panel(rng, lift_R=0.0, nd=2500, ni=13):
    dates = pd.bdate_range('2016-11-21', periods=nd)
    K = rng.random(nd)
    lab = np.where(K >= 2 / 3, 'COH', np.where(K <= 1 / 3, 'INC', 'MID'))
    m = rng.normal(0, 1, nd)
    rows = []
    common = rng.normal(0, 0.25, nd)
    for i in range(ni):
        h4 = rng.choice([-1, 1], nd)
        beta = rng.choice([-1, 1])
        R = np.maximum(-1.0, rng.normal(-0.03, 0.70, nd) + common * h4)
        R = R + lift_R * (lab == 'COH')
        rows.append(pd.DataFrame({'date': dates, 't1': dates - pd.offsets.BDay(1), 'inst': f'I{i}', 'h4': h4,
                                  'RL': np.where(h4 > 0, R, -R), 'RS': np.where(h4 < 0, R, -R), 'label': lab, 'm': m,
                                  'beta': beta, 'K': K}))
    P = pd.concat(rows, ignore_index=True)
    P['tape'] = np.sign(P['m']) * P['beta']
    P['R'] = np.where(P['h4'] > 0, P['RL'], P['RS'])
    P['hit'] = (P['R'] > 0).astype(float)
    P['COH'] = (P['label'] == 'COH').astype(float)
    P['INC'] = (P['label'] == 'INC').astype(float)
    P['AGREE'] = ((P['label'] == 'COH') & (P['tape'] == P['h4'])).astype(float)
    P['COH6'] = (P['label'] == 'COH').astype(float)
    Rt = np.where(P['tape'] > 0, P['RL'], P['RS'])
    P['x6'] = np.where(P['COH6'] > 0, Rt - P['R'], 0.0)
    return P.sort_values(['date', 'inst']).reset_index(drop=True)


def selftest():
    rng = np.random.default_rng(SEED)
    res = {}
    for nm, lift in (('planted', 0.15), ('null', 0.0)):
        P = synth_panel(rng, lift)
        sc = score_all(P, rng, B=500)
        ps = [sbc.pz(sc[n]['est'], sc[n]['se']) for n in SPEC]
        hp = sbc.holm(ps)
        words = {}
        for (n, arm, bar, dm), h in zip(CELLS, hp):
            c = dict(sc[n], name=n, bar=bar, design_mde=dm, se_used=sc[n]['se'])
            words[n] = cell_word(c, h)
        res[nm] = {n: {k: sc[n][k] for k in ('est', 'lo', 'hi')} for n in SPEC}
        res[nm]['words'] = words
    # (c) lookahead canary on the coherence function
    r2 = np.random.default_rng(7)
    idx = pd.bdate_range('2003-01-01', periods=4000)
    base = {c: pd.Series(r2.normal(0, 1, len(idx)), index=idx) for c in COMP}
    base['VOL'] = -0.6 * base['EQ'] + 0.8 * base['VOL']
    base['USD'] = -0.4 * base['EQ'] + 0.9 * base['USD']
    f0 = coherence_frame(base)
    t1 = idx[3000]
    pert = {c: s.where(s.index <= t1, s * 3.7 + r2.normal(0, 5, len(s))) for c, s in base.items()}
    f1 = coherence_frame(pert)
    cols = ['K', 'm', 'q1', 'q2', 'label'] + [f's_{c}' for c in COMP]
    a, b = f0.loc[:t1, cols], f1.loc[:t1, cols]
    la_ok = bool(a.astype(str).equals(b.astype(str)))
    close = pd.Series(np.exp(np.cumsum(r2.normal(0, 0.01, len(idx)))), index=idx)
    be0 = inst_beta(close, f0['m'])
    close2 = close.where(close.index <= t1, close * 1.5)
    be1 = inst_beta(close2, f1['m'])
    la_ok = la_ok and bool(be0.loc[:t1].fillna(9).equals(be1.loc[:t1].fillna(9)))
    # label share sanity on synthetic
    shares = f0['label'].value_counts(normalize=True).to_dict()
    # (d) R function on hand paths (slow-bias-clock's check)
    tr = sbc.trade_R
    r_exit = tr(np.array([-0.02, 0.3, 0.5, 0.8]), np.array([-0.05, 0.1, 0.2, 0.6]), 3)
    r_gap = tr(np.array([-0.02, -0.5, -1.4, 0.0]), np.array([-0.05, -0.9, -1.6, -0.2]), 3)
    r_stop = tr(np.array([-0.02, -0.5, -0.8, 0.0]), np.array([-0.05, -1.2, -1.6, -0.2]), 3)
    pl, nu = res['planted'], res['null']
    ok = {
        'planted_C1_ci_lower_gt0': pl['dR_coh_inc']['lo'] > 0,
        'planted_C3_ci_lower_gt0': pl['dhit_coh_inc']['lo'] > 0,
        'null_C1_ci_includes0': nu['dR_coh_inc']['lo'] <= 0 <= nu['dR_coh_inc']['hi'],
        'null_C3_ci_includes0': nu['dhit_coh_inc']['lo'] <= 0 <= nu['dhit_coh_inc']['hi'],
        'null_no_cell_validated': 'VALIDATED' not in nu['words'].values(),
        'no_lookahead_coherence': la_ok,
        'R_hand_exact': abs(r_exit - 0.8) < 1e-12 and abs(r_gap + 1.4) < 1e-12 and abs(r_stop + 1.0) < 1e-12,
    }
    res['label_shares_synthetic'] = shares
    res['checks'] = ok
    res['passed'] = all(ok.values())
    log('selftest', json.dumps(res, default=str))
    return res


# ───────────────────────────── the real run ─────────────────────────────

def build_entries():
    cache = OUT / 'entries_raw.parquet'
    m1 = {}

    def m1_cache(key):
        if key not in m1:
            log('reading bid/ask M1', key)
            m1[key] = sbc.read_bidask(key)
        return m1[key]

    daily = sbc.load_daily_all(m1_cache)
    closes = {inst: daily[inst] for inst in sbc.INST}
    if cache.exists():
        E = pd.read_parquet(cache)
        return E, closes, json.load(open(OUT / 'entries_counts.json'))
    frames = sbc.build_panel(daily, None)
    out, counts = [], {}
    for inst, grp, src, bakey, carry in sbc.INSTR:
        M = sbc.M1Inst(m1_cache(bakey))
        E, cnt = sbc.r_entries(inst, M, frames[inst])
        # same-session mid move 07:00 -> 21:00 (for the directional-hit description only)
        mv = []
        for d in E['date']:
            dd = pd.Timestamp(d).date()
            e, xx = M.idx(sbc.lon_epoch(dd, 7)), M.idx(sbc.lon_epoch(dd, 21))
            mv.append(M.mo[xx] - M.mo[e])
        E['mv'] = mv
        counts[inst] = cnt
        out.append(E[['date', 'inst', 'RL', 'RS', 'h4', 'close_date', 'mv']])
        m1.pop(bakey, None)
        log('entries', inst, cnt)
    E = pd.concat(out, ignore_index=True)
    E['date'] = pd.to_datetime(E['date']).astype('datetime64[ns]')
    assert E['date'].max() <= LOCKBOX, 'LOCKBOX BREACH (entries)'
    E.to_parquet(cache)
    json.dump(counts, open(OUT / 'entries_counts.json', 'w'), indent=1)
    return E, closes, counts


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--selftest', action='store_true')
    ap.add_argument('--skip-packs', action='store_true')
    a = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    st = selftest()
    json.dump(st, open(OUT / 'selftest.json', 'w'), indent=1, default=str)
    if not st['passed']:
        die('selftest failed: ' + json.dumps(st['checks']))
    if a.selftest:
        return
    rng = np.random.default_rng(SEED)
    x, xinfo = load_components()
    f = coherence_frame(x)
    log('coherence frame', len(f), f['label'].value_counts().to_dict(),
        {c: f[f's_{c}'].value_counts().to_dict() for c in COMP})
    E_raw, closes, counts = build_entries()
    betas = {inst: inst_beta(c, f['m']) for inst, c in closes.items()}
    P_all = attach(E_raw, f, betas)
    P = P_all[(P_all['h4'] != 0) & (P_all['label'] != 'NA')].sort_values(['date', 'inst']).reset_index(drop=True)
    na_rows = int(((P_all['h4'] != 0) & (P_all['label'] == 'NA')).sum())
    log('rows', len(P), 'NA-label rows dropped', na_rows, 'h4==0', int((P_all['h4'] == 0).sum()))
    recon = {'h4_Rbar_all_h4_days': float(P_all.loc[P_all['h4'] != 0, 'R'].mean()),
             'h4_Rbar_labelled': float(P['R'].mean()), 'exit_on_fixed_entries_E0_net': -0.027,
             'slow_bias_clock_h4_common': -0.028}
    res = {'id': SLUG, 'seed': SEED, 'B': B_BOOT, 'block': BLOCK, 'prereg': PREREG,
           'branch': 'claude/signal-bot-bias-analysis-bwr1qv',
           'ranAt': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'), 'inputs': xinfo, 'selftest': st,
           'entry_counts': counts, 'rows_scored': int(len(P)), 'rows_na_label': na_rows,
           'rows_h4_zero': int((P_all['h4'] == 0).sum()), 'dates_scored': int(P['date'].nunique()),
           'span': [str(P['date'].min().date()), str(P['date'].max().date())], 'recon': recon,
           'label_share_dates': P.drop_duplicates('date')['label'].value_counts(normalize=True).to_dict(),
           'orientation_share_positive': {c: float((f.loc[f.index >= '2016-01-01', f's_{c}'] > 0).mean()) for c in COMP},
           'agree_share_of_coh_rows': float(P['AGREE'].sum() / P['COH'].sum()),
           'tape_differs_h4_share_coh': float(((P['tape'] != P['h4']) & (P['COH6'] > 0)).sum() / P['COH6'].sum())}
    log('recon', recon)

    # power stage BEFORE any real estimate (prereg 3.7)
    pw = power_stage(P, np.random.default_rng(SEED + 1))
    json.dump(pw, open(OUT / 'power_sim.json', 'w'), indent=1, default=float)
    res['power_sim'] = pw

    # scored cells
    sc = score_all(P, rng)
    cells = []
    for n, arm, bar, dm in CELLS:
        c = dict(sc[n], name=n, arm=arm, bar=bar, design_mde=dm, sim_mde=pw[n]['sim_mde'])
        cells.append(c)
        log('cell', n, {k: c[k] for k in ('est', 'lo', 'hi', 'se', 'halves', 'g1_mean', 'g2_mean', 'n_dates_g1')})
    # mirrors
    mir5 = score_cell(P, 'R', 'OPPOSE', 'ALL', rng, B=1000)
    mir6 = score_cell(P, 'x6m', 'COH6', None, rng, B=1000)
    for c in cells:
        if c['name'] == 'dR_agree_all':
            c['mirror'] = {k: mir5[k] for k in ('est', 'lo', 'hi')}
            c['mirror_ok'] = not (mir5['lo'] > 0)
        elif c['name'] == 'dR_tape_h4':
            c['mirror'] = {k: mir6[k] for k in ('est', 'lo', 'hi')}
            c['mirror_ok'] = not (mir6['lo'] > 0)
        else:
            c['mirror'] = {'est': -c['est'], 'lo': -c['hi'], 'hi': -c['lo']}
            c['mirror_ok'] = not (c['hi'] < 0)

    packs = {}
    if not a.skip_packs:
        for i, c in enumerate(cells):
            log('pack', c['name'])
            pk = pack_cell(P, c['name'], c['bar'], None, SEED + 100 + i)
            pl = pk['placebo']
            c['placebo_pct'] = pl['real_percentile']
            c['placebo_sd'] = (pl['p97_5'] - pl['p2_5']) / 3.92 if pl['p97_5'] is not None else None
            one = next((p for p in pk['positive_control'] if p['multiple_of_bar'] == 1.0), None)
            c['pack_plant_1x'] = one['detected_share'] if one else None
            packs[c['name']] = {'diagnosis': pk['diagnosis'], 'placebo': pl, 'positive_control': pk['positive_control'],
                                'lookahead_canary': pk.get('lookahead_canary'), 'by_half': pk.get('by_half'),
                                'without_top1pct': pk.get('without_top1pct'), 'by_instrument': pk.get('by_instrument'),
                                'by_year': pk.get('by_year'), 'dir': f'analysis/output/{SLUG}/evidence/{c["name"]}/evidence/'}
    for c in cells:
        c['se_used'] = max(c['se'], c.get('placebo_sd') or 0.0)
        c['p'] = sbc.pz(c['est'], c['se_used'])
    hp = sbc.holm([c['p'] for c in cells])
    for c, h in zip(cells, hp):
        c['holm_p'] = float(h)
        c['word'] = cell_word(c, h)
        log('verdict', c['name'], c['word'], 'est', round(c['est'], 4), 'CI', round(c['lo'], 4), round(c['hi'], 4),
            'MDE', round(c['mde_binding'], 4))
    res['cells'] = cells
    res['packs'] = packs
    res['verdict'] = id_word(cells)

    dec, extra = decomposition(P, f, x, {'_closes': closes}, E_raw, rng)
    res['decomposition'] = dec
    res['decomposition_bh_survivors'] = [d['test'] for d in dec if d.get('bh_q10')]
    res['extra'] = extra
    json.dump(res, open(OUT / 'results.json', 'w'), indent=1, default=str)
    log('VERDICT', res['verdict'], {c['name']: c['word'] for c in cells})


if __name__ == '__main__':
    main()
