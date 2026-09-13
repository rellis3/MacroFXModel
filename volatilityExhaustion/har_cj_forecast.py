"""
har_cj_forecast.py — Phase 14: the HAR-RV-CJ test the last two phases pointed at.

WHY THIS EXISTS. Phase 12 tried to use the jump split by SCALING the incumbent
Yang-Zhang sigma by a 30-day diffusive share. That failed OOS, and the diagnosis was
that the lever was too blunt: YZ is a 30-day average, so a correction applied to the
whole window cannot express an effect that lives in the NEXT day. Phase 13 then measured
that effect directly — at a matched volatility level, a jumpier day is followed by a
quieter one (c = -0.99..-1.47, t = -4.2..-31.1, 6/6 cells).

HAR-CJ (Andersen-Bollerslev-Diebold 2007) is the form that CAN express it: instead of
correcting one number, put the continuous and jump components in as SEPARATE regressors
at daily / weekly / monthly horizons, and let the fit decide how much each is worth.

    HAR-RV   RV_{t+1} = b0 + bd*RV_t + bw*RV_{t-4..t} + bm*RV_{t-21..t}
    HAR-CJ   RV_{t+1} = b0 + Cd*C_t + Cw*C_w + Cm*C_m + Jd*J_t + Jw*J_w + Jm*J_m
             where  J = jump variance, C = RV - J  (C + J = RV exactly)

THE COMPARISON THAT MATTERS is HAR-CJ vs HAR-RV computed on the SAME intraday measures
and the same window. They differ in one thing only: whether RV is split. Beating raw YZ
is not enough — HAR alone might do that — so the split has to earn its place against an
HAR that does not have it. Both are reported, plus the shipped incumbent.

TWO WAYS TO SPLIT, because Phase 13 built the second one:
    bipower   J = max(RV - BV, 0)          the continuous descriptive share
    LM        J = variance of the returns Lee-Mykland actually FLAGGED as jumps
The second only counts a jump where a per-return test says there was one, which is the
significance-truncated version ABD recommend; the first counts the whole RV-BV residual.

NO LOOKAHEAD. Coefficients are fit walk-forward on an EXPANDING window by incremental
normal equations — a prediction for day i uses only targets strictly before i — mirroring
`js/volForecastBench.js` `harRvPred` exactly (warmup 60, lags 1/5/22, predictions clamped
at 1e-12 because OLS can go negative). Scoring is that file's own: QLIKE against a
Garman-Klass proxy, 60/40 chronological split, each predictor given one IS-fit scale
constant so the test is about forecast shape and not level bias.

NUMERICAL CARE, inherited from the bench rather than rediscovered. Daily variances are
~1e-4 while the intercept column is 1, which ill-conditions a wide normal-equations
system — `volForecastBench.js` documents its own 5-column IV system blowing up to QLIKE
7.5e5 unscaled, and the CJ system here is 7 columns. So, exactly as that file does:
regressors and target are scaled by 1/median(RV) (OLS is scale-equivariant, so the
prediction is mathematically identical and only the solve is stabilised), and every
prediction is floored at 1% of median RV — below any legitimate forecast, so it cannot
distort a real one, but it stops an unconstrained OLS that wants to predict <= 0 from
producing a meaningless QLIKE. The floor is applied identically to EVERY model,
incumbent included, so it cannot favour one. The first draft of this script omitted both
and returned QLIKE values in the millions; that was arithmetic, not a result.

LEVELS AND LOGS. Daily variance is heavily right-skewed, so a level-form OLS is dominated
by a handful of crisis days. The log form is fit on log RV and exponentiated back (with
the standard smearing correction); zero jump-variance days are floored before the log so
they cannot enter as -32 outliers. Both are reported; neither is chosen after the fact.

PRE-REGISTERED PASS CONDITION (fixed before running):
    HAR-CJ beats HAR-RV on OOS QLIKE by >= 2.0% for fx_major, on the primary
    (level-form, GK-proxy) specification, with >= 500 OOS days.
    Reported per asset class and for both split definitions; no blind pooling.
FAIL = the jump split does not add forecasting value even in the form built to carry it,
and Phase 12's null stands as the final word on the forecast question.

Usage:  python3 har_cj_forecast.py
"""
import os, sys, csv, math, json, collections
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
RV_CSV = os.path.join(HERE, 'jump_diffusion_daily.csv')
LM_CSV = os.path.join(HERE, 'jump_detect_lm.csv')
BARS_CSV = os.path.join(HERE, 'daily_bars.csv')
SUMMARY = os.path.join(HERE, 'har_cj_summary.json')

OOS_FRAC = 0.40
WARMUP = 60
LAG_D, LAG_W, LAG_M = 1, 5, 22
PASS_PCT = 2.0
MIN_OOS = 500
LN2 = math.log(2)
CLASSES = ('fx_major', 'fx_cross', 'metal')


def gk(o, h, l, c):
    return max(0.5 * math.log(h / l) ** 2 - (2 * LN2 - 1) * math.log(c / o) ** 2, 1e-12)


def qlike(real, pred):
    x = real / pred
    return float(np.mean(x - np.log(x) - 1.0))


def fit_scale(real, pred):
    if real.size == 0:
        return 1.0
    c = float(np.mean(real / pred))
    return c if c > 0 and np.isfinite(c) else 1.0


VAR_FLOOR_FRAC = 0.01      # js/volForecastBench.js — never forecast below 1% of median RV


def har_walk(target, regs, warmup=WARMUP):
    """Expanding-window OLS, no lookahead. `regs` is a list of series; each contributes
    its daily/weekly/monthly lagged averages. Prediction for i uses targets < i only.
    Mirrors js/volForecastBench.js harRvPred, generalised past 4 columns."""
    n = target.size
    k = 1 + 3 * len(regs)
    out = np.full(n, np.nan)

    def feat(i):
        if i - LAG_M < 0:
            return None
        x = [1.0]
        for s in regs:
            x.append(s[i - LAG_D])
            x.append(float(np.mean(s[i - LAG_W:i])))
            x.append(float(np.mean(s[i - LAG_M:i])))
        return np.array(x)

    XtX = np.zeros((k, k)); Xty = np.zeros(k); added = 0; nxt = LAG_M
    for i in range(LAG_M, n):
        while nxt < i:                                  # every target strictly before i
            xf = feat(nxt)
            if xf is not None and np.all(np.isfinite(xf)) and np.isfinite(target[nxt]):
                XtX += np.outer(xf, xf); Xty += xf * target[nxt]; added += 1
            nxt += 1
        xf = feat(i)
        if xf is None or not np.all(np.isfinite(xf)) or added < warmup:
            continue
        try:
            beta = np.linalg.solve(XtX + np.eye(k) * 1e-12, Xty)
        except np.linalg.LinAlgError:
            continue
        out[i] = float(xf @ beta)
    return out


def load():
    rv = {}
    for r in csv.DictReader(open(RV_CSV)):
        rv[(r['pair'], r['date'])] = (float(r['rv_5m']), float(r['bv_5m']), r['asset_class'])
    lm = {}
    for r in csv.DictReader(open(LM_CSV)):
        lm[(r['pair'], r['date'])] = float(r['jv_up']) + float(r['jv_dn'])
    bars = collections.defaultdict(dict)
    for r in csv.DictReader(open(BARS_CSV)):
        bars[r['pair']][r['date']] = r
    series = {}
    for pair, bmap in bars.items():
        dates = sorted(bmap)
        rows = []
        for d in dates:
            k = (pair, d)
            if k not in rv:
                continue
            b = bmap[d]
            o, h, l, c = (float(b[x]) for x in ('open', 'high', 'low', 'close'))
            s = float(b['sigma']) if b['sigma'] else float('nan')
            if not (o > 0 and h > 0 and l > 0 and c > 0):
                continue
            rv5, bv5, ac = rv[k]
            if not (rv5 > 0):
                continue
            j_bp = max(rv5 - bv5, 0.0)
            j_lm = min(lm.get(k, 0.0), rv5)
            rows.append((d, gk(o, h, l, c), rv5, j_bp, j_lm, s, ac))
        if len(rows) > 400:
            series[pair] = rows
    return series


def _scale(v):
    """1/median of the positive values — the bench's _rvScale."""
    pos = v[np.isfinite(v) & (v > 0)]
    return (1.0 / float(np.median(pos))) if pos.size else 1e4


def run(series, target_key, log_form):
    """Returns {asset_class: {model: (is_q, oos_q, n_oos)}} for one specification."""
    pool = collections.defaultdict(lambda: collections.defaultdict(lambda: ([], [], [])))
    for pair, rows in sorted(series.items()):
        ac = rows[0][6]
        gkv = np.array([r[1] for r in rows])
        rv5 = np.array([r[2] for r in rows])
        jbp = np.array([r[3] for r in rows])
        jlm = np.array([r[4] for r in rows])
        sig = np.array([r[5] for r in rows])
        real = gkv if target_key == 'gk' else rv5
        tf = (lambda v: np.log(v)) if log_form else (lambda v: v)

        # scale every variance series to ~O(1) so the 7-column solve is conditioned,
        # and floor at 1% of median RV so an OLS that wants to go negative cannot
        # manufacture a QLIKE explosion. Both straight from volForecastBench.js.
        S = _scale(real)
        FLOOR = (1.0 / S) * VAR_FLOOR_FRAC
        sc = lambda v: np.maximum(v, FLOOR) * S
        tgt = np.log(np.maximum(real, FLOOR) * S) if log_form else real * S

        preds = {}
        preds['HAR-RV'] = har_walk(tgt, [tf(sc(rv5))])
        preds['HAR-CJ (bipower)'] = har_walk(tgt, [tf(sc(rv5 - jbp)), tf(sc(jbp))])
        preds['HAR-CJ (Lee-Mykland)'] = har_walk(tgt, [tf(sc(rv5 - jlm)), tf(sc(jlm))])
        # the shipped incumbent: causal YZ sigma^2, aligned to predict day i
        yz = sig ** 2
        preds['YZ (incumbent)'] = np.log(np.maximum(yz, FLOOR) * S) if log_form else yz * S

        if log_form:                                    # back-transform with smearing
            for kk in list(preds):
                p = preds[kk]
                m = np.isfinite(p)
                if m.sum() > 10:
                    resid = tgt[m] - p[m]
                    preds[kk] = np.where(m, np.exp(p) * float(np.mean(np.exp(resid[np.isfinite(resid)]))), np.nan)
        for kk in list(preds):                          # back to variance units + floor
            preds[kk] = np.maximum(preds[kk] / S, FLOOR)

        ok = np.isfinite(real) & (real > 0)
        for p in preds.values():
            ok &= np.isfinite(p) & (p > 0)
        idx = np.flatnonzero(ok)
        if idx.size < 300:
            continue
        cut = int(idx.size * (1 - OOS_FRAC))
        is_i, oos_i = idx[:cut], idx[cut:]
        for name, p in preds.items():
            c = fit_scale(real[is_i], p[is_i])
            a, b, n = pool[ac][name]
            a.append((real[is_i], p[is_i] * c)); b.append((real[oos_i], p[oos_i] * c)); n.append(oos_i.size)
    out = {}
    for ac, models in pool.items():
        out[ac] = {}
        for name, (a, b, n) in models.items():
            ri = np.concatenate([x[0] for x in a]); pi = np.concatenate([x[1] for x in a])
            ro = np.concatenate([x[0] for x in b]); po = np.concatenate([x[1] for x in b])
            out[ac][name] = (qlike(ri, pi), qlike(ro, po), int(sum(n)))
    return out


def main():
    for p in (RV_CSV, LM_CSV, BARS_CSV):
        if not os.path.exists(p):
            print(f'missing {os.path.basename(p)} — run the earlier phases first'); return 1
    series = load()
    print('=' * 98)
    print('PHASE 14 — HAR-RV-CJ: does the jump split add FORECASTING value?  (PRE-REGISTERED)')
    print('=' * 98)
    print(f'  {len(series)} instruments · expanding-window OLS, warmup {WARMUP}, lags {LAG_D}/{LAG_W}/{LAG_M}')
    print(f'  loss QLIKE · {int((1-OOS_FRAC)*100)}/{int(OOS_FRAC*100)} split · each predictor IS-scale-matched')
    print(f'  PASS: HAR-CJ beats HAR-RV by >= {PASS_PCT}% OOS QLIKE on fx_major (level form, GK proxy)')

    results = {}
    for target_key, tname in (('gk', 'Garman-Klass (primary)'), ('rv', 'intraday RV_5m (robustness)')):
        for log_form, fname in ((False, 'level form'), (True, 'log form')):
            key = f'{target_key}|{"log" if log_form else "level"}'
            res = run(series, target_key, log_form)
            results[key] = res
            print(f'\n  ══ target: {tname} · {fname} ══')
            print(f'    {"class":10s} {"model":22s} {"IS QLIKE":>9s} {"OOS QLIKE":>10s} {"vs HAR-RV":>10s} {"n_oos":>7s}')
            for ac in CLASSES:
                if ac not in res:
                    continue
                base = res[ac].get('HAR-RV', (np.nan, np.nan, 0))[1]
                for name in ('YZ (incumbent)', 'HAR-RV', 'HAR-CJ (bipower)', 'HAR-CJ (Lee-Mykland)'):
                    if name not in res[ac]:
                        continue
                    i_q, o_q, n = res[ac][name]
                    imp = (base - o_q) / abs(base) * 100 if np.isfinite(base) and base else float('nan')
                    mark = '' if name == 'HAR-RV' else f'{imp:+9.2f}%'
                    print(f'    {ac:10s} {name:22s} {i_q:9.5f} {o_q:10.5f} {mark:>10s} {n:7d}')

    print('\n' + '=' * 98)
    print('VERDICT (primary: GK proxy, level form, fx_major, OOS)')
    prim = results['gk|level'].get('fx_major', {})
    base = prim.get('HAR-RV', (np.nan, np.nan, 0))
    passed = False
    for name in ('HAR-CJ (bipower)', 'HAR-CJ (Lee-Mykland)'):
        if name not in prim:
            continue
        o_q, n = prim[name][1], prim[name][2]
        imp = (base[1] - o_q) / abs(base[1]) * 100
        ok = imp >= PASS_PCT and n >= MIN_OOS
        print(f'  {name:22s}: {imp:+6.2f}% vs HAR-RV  (n_oos={n:,d})  -> {"PASS" if ok else "FAIL"}')
        passed = passed or ok
    yz = prim.get('YZ (incumbent)')
    if yz and np.isfinite(base[1]):
        print(f'  (context) HAR-RV vs the shipped YZ incumbent: '
              f'{(yz[1]-base[1])/abs(yz[1])*100:+.2f}% OOS QLIKE')
    if passed:
        print('\n  Pre-registered condition HOLDS — splitting RV into continuous and jump')
        print('  components improves the forecast in the form built to carry it.')
    else:
        print('\n  Pre-registered condition FAILS — the jump split does not add forecasting')
        print('  value even as separate HAR regressors. Phase 12\'s null stands as the final')
        print('  word on the forecast question; the vol-decay effect is real but not')
        print('  convertible into a better next-day variance forecast.')
    print('=' * 98)
    with open(SUMMARY, 'w') as f:
        json.dump({k: {a: {m: list(v) for m, v in mm.items()} for a, mm in r.items()}
                   for k, r in results.items()}, f, indent=1, default=float)
    print(f'  wrote {os.path.basename(SUMMARY)}')
    return 0 if passed else 2


if __name__ == '__main__':
    sys.exit(main())
