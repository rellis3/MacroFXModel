"""bias-learner power simulation (forge/BIAS_LEARNER_PREREG.md section 5). Seed 20261114.

Reads NO market data at all: the M1 is not in this container, so features AND targets are synthetic. The point is the
noise floor of the exact registered pipeline (pooled L2 logistic, instrument intercepts, group x feature deviations,
C chosen inside the training years by the one-SE rule, expanding walk-forward by calendar year 2018..2026, purge by
label end, Brier skill vs the point-in-time B0) at the registered sample size and cross-instrument correlation.

Synthetic world (stated in the prereg):
  - 13 instruments (9 FX, gold, 3 indices) x every weekday 2016-01-04 .. 2026-08-21.
  - daily return e_it = sqrt(rho_g) f_gt + sqrt(1-rho_g) u_it; FX factor loading rho 0.47 (gold 0.30 on the FX factor),
    indices on their own factor with rho 0.85 (data-rules / SEARCH_BREADTH figures).
  - 13 readings built like the real ones: trends are EMAs of PAST simulated returns (1h/4h ~ last day, D ~ 20d, W ~ 100d),
    asia/close-location partly from the prior day, event flags and surprise common to all dates, carry/COT/sigma regime
    as persistent AR(1) states, IV/RV only for gold and indices.
  - planted signal: r_it = IC * z_it + sqrt(1-IC^2) * e_it, z_it = standardised mean of 4 readings (trD, carry, cot, asia),
    the SAME composite for every instrument (sign-aligned), so pooling gains only what the correlation allows.
  - target at horizon h: 1{sum of r over days t..t+h > 0} (h = 0 is the same-day 07:00->21:00 target).

Usage: python -I scripts/bias-learner/power_sim.py [--draws N] [--jobs 4] [--out analysis/output/bias-learner/power_sim.json]
"""
import argparse, json, os, sys, time
import numpy as np
from concurrent.futures import ProcessPoolExecutor

SEED = 20261114
INST = ['EURUSD', 'GBPUSD', 'USDJPY', 'USDCAD', 'AUDUSD', 'NZDUSD', 'USDCHF', 'EURJPY', 'GBPJPY', 'GOLD', 'NAS100', 'SPX500', 'US30']
GROUP = np.array([0] * 9 + [1] + [2] * 3)  # 0 fx, 1 gold, 2 idx
GNAME = ['fx', 'gold', 'idx']
FEAT = ['tr1h', 'tr4h', 'trD', 'trW', 'asia', 'cloc', 'ev_today', 'ev_tmrw', 'surp', 'carry', 'cot', 'sigreg', 'ivrv']
CGRID = [1e-5, 3e-5, 1e-4, 3e-4, 1e-3, 3e-3, 1e-2, 3e-2, 1e-1]
DESIGN = os.environ.get('BL_DESIGN', 'dev')  # 'dev' = pooled + group deviations; 'pooled' = pooled slopes only
RULE = os.environ.get('BL_RULE', 'min')  # 'min' (registered) or '1se' (sensitivity)
TEST_YEARS = list(range(2018, 2027))


def weekdays():
    d = np.arange(np.datetime64('2016-01-04'), np.datetime64('2026-08-22'))
    d = d[((d.astype('datetime64[D]').view('int64') - 4) % 7) < 5]  # 1970-01-01 was a Thursday -> Monday = offset 4
    return d


def ema(x, n):
    a = 2.0 / (n + 1); out = np.empty_like(x); m = 0.0
    for t in range(x.shape[0]):
        m = a * x[t] + (1 - a) * m if t else x[t]
        out[t] = m
    return out


def ar1(rng, T, k, rho):
    x = np.zeros((T, k)); x[0] = rng.standard_normal(k)
    s = np.sqrt(1 - rho ** 2)
    for t in range(1, T):
        x[t] = rho * x[t - 1] + s * rng.standard_normal(k)
    return x


def simulate(rng, ic):
    D = weekdays(); T = len(D); N = len(INST)
    ffx = rng.standard_normal(T); fidx = rng.standard_normal(T)
    rho = np.where(GROUP == 2, 0.85, np.where(GROUP == 1, 0.30, 0.47))
    fac = np.where(GROUP[None, :] == 2, fidx[:, None], ffx[:, None])
    e = np.sqrt(rho) * fac + np.sqrt(1 - rho) * rng.standard_normal((T, N))
    # readings from PAST e (and their own persistent states); all known before day t
    past = np.vstack([np.zeros((1, N)), e[:-1]])
    F = np.zeros((T, N, len(FEAT)))
    F[:, :, 0] = past + 0.5 * rng.standard_normal((T, N))          # 1h trend ~ last hours
    F[:, :, 1] = ema(past, 3)                                         # 4h
    F[:, :, 2] = ema(past, 20)                                        # daily
    F[:, :, 3] = ema(past, 100)                                       # weekly
    asia_c = np.where(GROUP[None, :] == 2, rng.standard_normal(T)[:, None], rng.standard_normal(T)[:, None])
    F[:, :, 4] = np.sqrt(rho) * asia_c + np.sqrt(1 - rho) * rng.standard_normal((T, N))  # Asia move: before 07:00, own shock, cross-correlated like returns
    F[:, :, 5] = 0.6 * past + 0.8 * rng.standard_normal((T, N))      # prior close location
    ev = (rng.random(T) < 0.08).astype(float)
    F[:, :, 6] = ev[:, None]
    F[:, :, 7] = np.r_[ev[1:], 0.0][:, None]
    sur = np.where(rng.random(T) < 0.10, rng.standard_normal(T), 0.0)
    sur = np.array([sur[max(0, t - 4):t + 1][np.nonzero(sur[max(0, t - 4):t + 1])[0][-1]] if np.any(sur[max(0, t - 4):t + 1]) else 0.0 for t in range(T)])
    usd = np.array([-1, -1, 1, 1, -1, -1, 1, 0, 0, -1, -1, -1, -1])
    F[:, :, 8] = sur[:, None] * usd[None, :]
    car = ar1(rng, T, N, 0.999); car[:, GROUP != 0] = 0.0
    F[:, :, 9] = car
    cot_w = ar1(rng, T // 5 + 2, N, 0.95); F[:, :, 10] = np.repeat(cot_w, 5, axis=0)[:T]
    F[:, :, 11] = ar1(rng, T, N, 0.99)
    iv = ar1(rng, T, N, 0.95); iv[:, GROUP == 0] = 0.0
    F[:, :, 12] = iv
    # planted composite: standardised mean of trD, carry(fx)/sigreg(other), cot, asia
    comp_cols = [F[:, :, 2], np.where(GROUP[None, :] == 0, F[:, :, 9], F[:, :, 11]), F[:, :, 10], F[:, :, 4]]
    z = sum((c - c.mean(0)) / c.std(0) for c in comp_cols)
    z = (z - z.mean(0)) / z.std(0)
    r = ic * z + np.sqrt(1 - ic ** 2) * e
    return D, F, r


def targets(r, h):
    T = r.shape[0]
    cs = np.vstack([np.zeros((1, r.shape[1])), np.cumsum(r, 0)])
    y = np.full(r.shape, np.nan)
    if h < T:
        y[:T - h] = (cs[h + 1:] - cs[:T - h] > 0).astype(float)
    return y


def design(Fz, inst_ix, grp):
    n = Fz.shape[0]
    oh = np.zeros((n, len(INST))); oh[np.arange(n), inst_ix] = 1.0
    if DESIGN == 'pooled':
        return np.concatenate([oh, Fz], axis=1)
    dev = np.concatenate([Fz * (grp == g)[:, None] for g in range(3)], axis=1)
    return np.concatenate([oh, Fz, dev], axis=1)


def fit_predict(Xtr, ytr, Xte, C, otr=None, ote=None, w0=None):
    """L2 logistic, the same objective as sklearn LogisticRegression(C, fit_intercept=False):
    sum log-loss + ||w||^2 / (2C). Newton (IRLS) with a step-halving guard; 65 parameters, so exact and fast.
    otr/ote: a fixed offset (logit of the point-in-time B0), so all shrinkage is TOWARD B0, never toward 50%."""
    k = Xtr.shape[1]; lam = 1.0 / C
    otr = np.zeros(len(ytr)) if otr is None else otr
    ote = np.zeros(Xte.shape[0]) if ote is None else ote
    w = np.zeros(k) if w0 is None else w0.copy()
    def obj(w):
        z = otr + Xtr @ w
        return np.sum(np.logaddexp(0, z) - ytr * z) + 0.5 * lam * w @ w
    f = obj(w)
    for _ in range(50):
        z = otr + Xtr @ w; q = 1 / (1 + np.exp(-z))
        g = Xtr.T @ (q - ytr) + lam * w
        H = (Xtr * (q * (1 - q))[:, None]).T @ Xtr + lam * np.eye(k)
        step = np.linalg.solve(H, g); t = 1.0
        while True:
            wn = w - t * step; fn = obj(wn)
            if fn <= f or t < 1e-6:
                break
            t *= 0.5
        conv = abs(f - fn) < 1e-9 * max(1.0, abs(f))
        w, f = wn, fn
        if conv:
            break
    return 1 / (1 + np.exp(-(ote + Xte @ w))), w


def standardise(Ftr, Fte):
    mu = Ftr.mean(0); sd = Ftr.std(0); sd[sd == 0] = 1.0
    return (Ftr - mu) / sd, (Fte - mu) / sd


def choose_C(F, y, inst_ix, grp, year, month, end_day, start_day_of, train_mask, off):
    """One-SE rule over inner expanding folds = the last up to 3 training years."""
    yrs = sorted(set(year[train_mask]))
    inner = yrs[1:][-3:]
    if not inner:
        return CGRID[3]
    briers = {C: [] for C in CGRID}  # list of per-month mean Brier arrays
    for vy in inner:
        tr = train_mask & (end_day < start_day_of[vy])
        va = train_mask & (year == vy)
        if tr.sum() < 500 or va.sum() < 200:
            continue
        a, b = standardise(F[tr], F[va])
        Xa, Xb = design(a, inst_ix[tr], grp[tr]), design(b, inst_ix[va], grp[va])
        for C in CGRID:
            p, _ = fit_predict(Xa, y[tr], Xb, C, off[tr], off[va])
            se = (p - y[va]) ** 2
            mo = month[va]
            for u in np.unique(mo):
                briers[C].append(se[mo == u].mean())
    if not briers[CGRID[0]]:
        return CGRID[3]
    M = np.array([briers[C] for C in CGRID])  # C x months
    best = int(np.argmin(M.mean(1)))
    diff = M - M[best]
    se = diff.std(1, ddof=1) / np.sqrt(M.shape[1])
    ok = [i for i in range(len(CGRID)) if M[i].mean() <= M[best].mean() + se[i]]
    return CGRID[best] if RULE == 'min' else CGRID[min(ok)]


def walk_forward(D, F, y, h, cols=None):
    T, N, K = F.shape
    if cols is not None:
        F = F[:, :, cols]; K = len(cols)
    day = np.repeat(np.arange(T), N); inst_ix = np.tile(np.arange(N), T)
    yr = D.astype('datetime64[Y]').astype(int) + 1970
    mo = D.astype('datetime64[M]').astype(int)
    year = np.repeat(yr, N); month = np.repeat(mo, N); grp = GROUP[inst_ix]
    Ff = F.reshape(T * N, K); yf = y.reshape(T * N)
    end_day = day + h  # label realised at 21:00 of day t+h -> usable from day t+h+1
    start_day_of = {Y: int(np.argmax(yr == Y)) for Y in sorted(set(yr))}
    valid = np.isfinite(yf)
    # point-in-time B0 per instrument, Beta(10,10) prior, labels with end_day < t
    b0 = np.full(T * N, 0.5)
    for i in range(N):
        yi = y[:, i]; cum = np.concatenate([[0.0], np.nancumsum(np.nan_to_num(yi, nan=0.0))]); cnt = np.concatenate([[0], np.cumsum(np.isfinite(yi))])
        for t in range(T):
            k = max(0, t - h)  # labels of days < t-h are realised
            b0[t * N + i] = (cum[k] + 10) / (cnt[k] + 20)
    off = np.log(b0 / (1 - b0))
    p = np.full(T * N, np.nan); Cs = {}
    for Y in TEST_YEARS:
        te = valid & (year == Y)
        tr = valid & (end_day < start_day_of[Y])
        if te.sum() == 0:
            continue
        C = choose_C(Ff, yf, inst_ix, grp, year, month, end_day, start_day_of, tr, off)
        a, b = standardise(Ff[tr], Ff[te])
        p[te], _ = fit_predict(design(a, inst_ix[tr], grp[tr]), yf[tr], design(b, inst_ix[te], grp[te]), C, off[tr], off[te])
        Cs[Y] = C
    out = {}
    m = np.isfinite(p) & valid
    for g in range(3):
        s = m & (grp == g)
        out[GNAME[g]] = 1 - np.sum((p[s] - yf[s]) ** 2) / np.sum((b0[s] - yf[s]) ** 2)
    out['all'] = 1 - np.sum((p[m] - yf[m]) ** 2) / np.sum((b0[m] - yf[m]) ** 2)
    # hit rate of sign(p-0.5) vs B0 side, all rows
    out['hit_gain_pp'] = 100 * (np.mean((p[m] > 0.5) == (yf[m] > 0.5)) - np.mean((b0[m] > 0.5) == (yf[m] > 0.5)))
    out['C'] = Cs
    return out, (p, b0, yf, m, day, grp)


def block_shuffle_y(rng, y, block=21):
    T = y.shape[0]; nb = int(np.ceil(T / block))
    order = rng.permutation(nb)
    idx = np.concatenate([np.arange(b * block, min(T, (b + 1) * block)) for b in order])
    return y[idx]


def one_draw(args):
    k, ic, horizons, shuffles = args
    rng = np.random.default_rng([SEED, k, int(round(ic * 1e4))])
    D, F, r = simulate(rng, ic)
    res = {'ic': ic, 'k': k}
    for h in horizons:
        y = targets(r, h)
        o, _ = walk_forward(D, F, y, h)
        res[f'h{h}'] = o
        if shuffles:
            res[f'h{h}_shuf'] = [walk_forward(D, F, block_shuffle_y(rng, y), h)[0] for _ in range(shuffles)]
    return res


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--draws', type=int, default=16)
    ap.add_argument('--ics', default='0,0.03,0.05')
    ap.add_argument('--horizons', default='0,1,5')
    ap.add_argument('--shuffles', type=int, default=0, help='day-block shuffles on each IC=0 draw')
    ap.add_argument('--jobs', type=int, default=4)
    ap.add_argument('--out', default='analysis/output/bias-learner/power_sim.json')
    a = ap.parse_args()
    ics = [float(x) for x in a.ics.split(',')]; hs = [int(x) for x in a.horizons.split(',')]
    jobs = [(k, ic, hs, a.shuffles if ic == 0 and k < 4 else 0) for ic in ics for k in range(a.draws)]
    t0 = time.time()
    with ProcessPoolExecutor(a.jobs) as ex:
        R = list(ex.map(one_draw, jobs))
    summ = {}
    for ic in ics:
        for h in hs:
            rows = [x[f'h{h}'] for x in R if x['ic'] == ic]
            for g in GNAME + ['all']:
                v = np.array([row[g] for row in rows])
                summ[f'ic{ic}_h{h}_{g}'] = {'mean': float(v.mean()), 'sd': float(v.std(ddof=1)), 'n': len(v)}
            hg = np.array([row['hit_gain_pp'] for row in rows])
            summ[f'ic{ic}_h{h}_hitgain_pp'] = {'mean': float(hg.mean()), 'sd': float(hg.std(ddof=1))}
            shuf = [s for x in R if x['ic'] == ic and f'h{h}_shuf' in x for s in x[f'h{h}_shuf']]
            if shuf:
                for g in GNAME + ['all']:
                    v = np.array([s[g] for s in shuf])
                    summ[f'ic{ic}_h{h}_{g}_shuffle'] = {'mean': float(v.mean()), 'sd': float(v.std(ddof=1)), 'n': len(v)}
    Cs = {}
    for x in R:
        for h in hs:
            for Y, C in x[f'h{h}']['C'].items():
                Cs.setdefault(f'h{h}', []).append(C)
    summ['C_chosen'] = {h: {str(c): v.count(c) for c in CGRID} for h, v in Cs.items()}
    os.makedirs(os.path.dirname(a.out), exist_ok=True)
    json.dump({'seed': SEED, 'draws': a.draws, 'ics': ics, 'horizons': hs, 'secs': time.time() - t0, 'summary': summ}, open(a.out, 'w'), indent=1)
    for k, v in summ.items():
        print(k, v)
    print('secs', round(time.time() - t0))


if __name__ == '__main__':
    main()
