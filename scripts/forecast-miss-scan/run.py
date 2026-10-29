"""forecast-miss-scan — forge/FORECAST_MISS_SCAN_PREREG.md.

e = ln(r_hl / shipped p50) (SI else S), date-level mean per class (fx, idx). 17 pre-open candidates (+ spx20 reference).
Discovery 2020-08-20 -> 2023-08-20: top-minus-bottom tercile (binary: flagged minus other), date-block bootstrap,
BH q 0.10 over 34 cells. Confirmation 2023-08-21 -> 2026-08-20 on survivors: same sign, 95% CI excludes 0, outside placebo.

Data root: the main checkout (features/ and the vf3 table are gitignored). Override with DATA_ROOT.
Run: python scripts/forecast-miss-scan/run.py
"""
import json, math, os
import numpy as np
import pandas as pd

SEED = 20261027
B_DISC, B_CONF, BLOCK = 1000, 2000, 21
SPLIT = pd.Timestamp('2023-08-21')
HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.join(HERE, '..', '..')
DATA = os.environ.get('DATA_ROOT', r'C:\Users\relli\OneDrive\Documents\Programming\Trading\v2 trading model\MacroFXModel')
OUT = os.path.join(REPO, 'analysis', 'output', 'forecast-miss-scan')
os.makedirs(OUT, exist_ok=True)
PAIRS = {'eurusd': -1, 'gbpusd': -1, 'audusd': -1, 'nzdusd': -1, 'usdcad': 1, 'usdchf': 1, 'usdjpy': 1}


def feat(fid):
    df = pd.read_parquet(os.path.join(DATA, 'features', f'{fid}.parquet'))
    df['date'] = pd.to_datetime(df['date'])
    df['asof'] = pd.to_datetime(df['asof'], utc=True).dt.tz_localize(None)
    df = df.sort_values(['date', 'asof']).drop_duplicates('date', keep='first').dropna(subset=['value'])
    return df.sort_values('asof').reset_index(drop=True)


class PIT:
    """value(s) known by each session date 00:00 UTC; k observations back."""
    def __init__(self, fid):
        d = feat(fid); self.a = d['asof'].values; self.v = d['value'].values.astype(float)
    def at(self, sessions, k=0):
        out = np.full(len(sessions), np.nan)
        for i, s in enumerate(sessions):
            j = np.searchsorted(self.a, np.datetime64(s), side='right') - 1 - k
            if j >= 0: out[i] = self.v[j]
        return out


def errors():
    d = pd.read_parquet(os.path.join(DATA, 'analysis/output/vf3_stage_b/part1_lines.parquet'),
                        columns=['inst', 'date', 'oos', 'r_hl', 'klass', 'S_hl_p50', 'SI_hl_p50'])
    d = d[d.oos == 1].copy(); d['date'] = pd.to_datetime(d['date'])
    d['e'] = np.log(d.r_hl / d.SI_hl_p50.fillna(d.S_hl_p50)); d = d[np.isfinite(d.e)]
    d['cls'] = d.klass.map({'fx_majors': 'fx', 'fx_crosses': 'fx', 'indices': 'idx', 'gold': 'gold'})
    S = pd.DatetimeIndex(sorted(d.date.unique()))
    return S, {c: d[d.cls == c].groupby('date').e.mean().reindex(S) for c in ['fx', 'idx']}


def signals(S, E):
    spx, nq = PIT('px_d1_spx500'), PIT('px_d1_nas100')
    ret = lambda p, k: -(np.log(p.at(S)) - np.log(p.at(S, k))) * 100
    vix, vix3m, move = PIT('vix'), PIT('vix3m'), PIT('move_index')
    px = {n: PIT(f'px_d1_{n}') for n in PAIRS}
    usd20 = sum(PAIRS[n] * (np.log(px[n].at(S)) - np.log(px[n].at(S, 20))) for n in PAIRS) / len(PAIRS) * 100
    y2, y10 = PIT('y2_usd'), PIT('y10_usd')
    baa, aaa = PIT('credit_baa10y'), PIT('credit_aaa10y')
    beur, bjpy = PIT('xccy_basis_eur_live'), PIT('xccy_basis_jpy_live')
    rrp = PIT('rrp_on')
    months = pd.Series(S.to_period('M'), index=S)
    pos_in_month = months.groupby(months).cumcount().values; n_in_month = months.map(months.value_counts()).values
    sig = {
        'spx5': ret(spx, 5), 'spx60': ret(spx, 60), 'nq20': ret(nq, 20),
        'vix_level': vix.at(S), 'vix_chg5': vix.at(S) - vix.at(S, 5), 'vix_term': vix.at(S) / vix3m.at(S),
        'move_level': move.at(S), 'usd20': usd20, 'usdjpy20': np.abs((np.log(px['usdjpy'].at(S)) - np.log(px['usdjpy'].at(S, 20))) * 100),
        'us2y_chg20': np.abs((y2.at(S) - y2.at(S, 20)) * 100), 'us10y_chg20': np.abs((y10.at(S) - y10.at(S, 20)) * 100),
        'credit_chg20': (baa.at(S) - aaa.at(S)) - (baa.at(S, 20) - aaa.at(S, 20)),
        'basis_eur_chg20': -(beur.at(S) - beur.at(S, 20)), 'basis_jpy_chg20': -(bjpy.at(S) - bjpy.at(S, 20)),
        'rrp_level': np.log1p(np.clip(rrp.at(S), 0, None)),
        'month_end': ((pos_in_month <= 1) | (pos_in_month >= n_in_month - 2)).astype(float),
        'spx20': ret(spx, 20),
    }
    sig = {k: pd.Series(v, index=S) for k, v in sig.items()}
    return sig


BINARY = {'month_end'}


def labels(s, binary):
    if binary:
        return np.where(s.values == 1, 1, np.where(s.values == 0, -1, 0))
    lo, hi = s.quantile([1 / 3, 2 / 3])
    lab = np.where(s.values >= hi, 1, np.where(s.values <= lo, -1, 0)); lab[s.isna().values] = 0
    return lab


def stat(ev, lab):
    a, b = ev[lab == 1], ev[lab == -1]
    a, b = a[np.isfinite(a)], b[np.isfinite(b)]
    return a.mean() - b.mean() if len(a) > 5 and len(b) > 5 else np.nan


def boot(ev, lab, rng, B):
    n = len(ev); nb = math.ceil(n / BLOCK); out = np.empty(B)
    for k in range(B):
        st = rng.integers(0, n - BLOCK + 1, nb); idx = np.concatenate([np.arange(a, a + BLOCK) for a in st])[:n]
        out[k] = stat(ev[idx], lab[idx])
    return np.nanpercentile(out, [2.5, 97.5])


def p_from_ci(est, lo, hi):
    se = (hi - lo) / 3.92
    return math.erfc(abs(est) / se / math.sqrt(2)) if se > 0 and np.isfinite(est) else 1.0


def bh(ps, q=0.10):
    order = sorted(range(len(ps)), key=lambda i: ps[i]); m = len(ps); k = 0
    for r, i in enumerate(order, 1):
        if ps[i] <= q * r / m: k = r
    return set(order[:k])


def main():
    rng = np.random.default_rng(SEED)
    S, E = errors()
    sig = signals(S, E)
    for c in ['fx', 'idx']:
        sig[f'recent_miss_{c}'] = E[c].rolling(5, min_periods=3).mean().shift(1)
    pct = lambda x: 100 * (math.exp(x) - 1) if np.isfinite(x) else None
    disc, conf = S < SPLIT, S >= SPLIT
    cells = []
    for c in ['fx', 'idx']:
        for name in [k for k in sig if not k.startswith('recent_miss')] + [f'recent_miss_{c}']:
            cand = 'recent_miss' if name.startswith('recent_miss') else name
            s = sig[name]; ev = E[c].values
            ld = labels(s[disc], cand in BINARY); evd = ev[disc]
            est = stat(evd, ld); lo, hi = boot(evd, ld, rng, B_DISC)
            cells.append(dict(cls=c, cand=cand, ref=(cand == 'spx20'), disc_pct=pct(est), disc_ci_pct=[pct(lo), pct(hi)], disc_log=est,
                              p=p_from_ci(est, lo, hi), coverage=float(s[disc].notna().mean())))
    fam = [i for i, x in enumerate(cells) if not x['ref']]
    surv = bh([cells[i]['p'] for i in fam])
    survivors = {fam[j] for j in surv}
    for i, x in enumerate(cells):
        x['bh_survivor'] = i in survivors
        if i in survivors or x['ref']:
            name = x['cand'] if x['cand'] != 'recent_miss' else f'recent_miss_{x["cls"]}'
            s = sig[name]; ev = E[x['cls']].values
            lc = labels(s[conf], x['cand'] in BINARY); evc = ev[conf]
            est = stat(evc, lc); lo, hi = boot(evc, lc, rng, B_CONF)
            pl = np.array([stat(evc, np.roll(lc, k)) for k in range(63, len(lc) - 63, 5)]); plo, phi = np.nanpercentile(pl, [2.5, 97.5])
            same = np.sign(est) == np.sign(x['disc_log'])
            ci0 = (lo > 0) if est > 0 else (hi < 0)
            outpl = est > phi if est > 0 else est < plo
            j = pd.concat({'a': s, 'b': sig['spx20']}, axis=1).dropna()
            mid = labels(sig['spx20'][conf], False) == 0
            est_mid = stat(evc[mid], lc[mid])
            x.update(conf_pct=pct(est), conf_ci_pct=[pct(lo), pct(hi)], conf_placebo95_pct=[pct(plo), pct(phi)],
                     confirmed=bool(same and ci0 and outpl and not x['ref']), corr_with_spx20=float(j.a.corr(j.b)),
                     conf_within_spx20_mid_pct=pct(est_mid))
    res = dict(id='forecast-miss-scan', seed=SEED, family_size=len(fam), bh_q=0.10, n_sessions=len(S),
               discovery=[str(S[disc][0].date()), str(S[disc][-1].date())], confirmation=[str(S[conf][0].date()), str(S[conf][-1].date())],
               survivors=sum(x['bh_survivor'] for x in cells), confirmed=sum(x.get('confirmed', False) for x in cells), cells=cells)
    json.dump(res, open(os.path.join(OUT, 'results.json'), 'w'), indent=2, default=float)
    print({k: res[k] for k in ['family_size', 'n_sessions', 'discovery', 'confirmation', 'survivors', 'confirmed']})
    for x in sorted(cells, key=lambda x: x['p']):
        r = lambda v: None if v is None else round(v, 1)
        print(f"{x['cls']:3} {x['cand']:16} disc {r(x['disc_pct']):>6}% [{r(x['disc_ci_pct'][0])}, {r(x['disc_ci_pct'][1])}] p={x['p']:.4f} {'BH' if x['bh_survivor'] else '  '} {'REF' if x['ref'] else ''}"
              + (f" | conf {r(x['conf_pct'])}% [{r(x['conf_ci_pct'][0])}, {r(x['conf_ci_pct'][1])}] pl[{r(x['conf_placebo95_pct'][0])},{r(x['conf_placebo95_pct'][1])}] corr_spx20 {x['corr_with_spx20']:.2f} mid {r(x['conf_within_spx20_mid_pct'])} {'CONFIRMED' if x['confirmed'] else ''}" if 'conf_pct' in x else ''))


if __name__ == '__main__':
    main()
