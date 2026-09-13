"""
jump_diffusion_forecast.py — Phase 3: the actual payoff test.

THE CLAIM (pre-registered before running). The live forecaster's daily sigma
(Yang-Zhang, js/volForecast.js / js/volBacktestEngine.js) does not distinguish jump
variance from diffusive variance: a day carrying one huge scheduled-news jump and a day
that ground steadily higher produce the same reading. But jumps do not persist the way
diffusive vol clusters — one CPI surprise does not make tomorrow more jump-prone — so a
jump-contaminated sigma should OVERSTATE tomorrow's genuine diffusive budget. If that is
true, then:

    on days FOLLOWING a high-jump-share day, a diffusion-only sigma forecasts
    tomorrow's realised variance BETTER (lower QLIKE) than the raw YZ sigma.

SCORING — reused, not invented. `js/volForecastBench.js` is the repo's estimator-
comparison harness and this mirrors it exactly:
    QLIKE = mean( r/p − ln(r/p) − 1 )        (Patton 2011; robust to a noisy proxy)
    realised-variance proxy = Garman-Klass on the day's own OHLC (the bench default)
    60/40 chronological IS/OOS split         (the bench's oosFrac = 0.4)
Lower QLIKE is better. Intraday RV_5m is carried as a SECOND, independent proxy — it is
arguably the better truth, but GK is the bench's contract, so GK is primary and RV is
reported as robustness rather than swapped in to flatter a result.

THE TWO FORECASTS (both strictly causal — day i uses only days < i):
    RAW   pred_var[i] = yz[i−1]²                      the exact incumbent
    DIFF  pred_var[i] = yz[i−1]² × (ΣBV / ΣRV) over days i−30..i−1
          i.e. the incumbent scaled by the diffusive share of realised variance over
          the estimator's OWN 30-day window. Stripping only day i−1's jump would be
          dimensionally wrong: YZ is a 30-day average, so a single day contributes
          ~1/30 of it, and scaling the whole thing by one day's share over-corrects by
          an order of magnitude.

SCALE-MATCHING — the guard against a fake win. The jump correction is multiplicative and
always ≤1, so it always shrinks the forecast. If YZ happens to sit biased high, DIFF
would "win" merely by being smaller, which is a claim about level, not about jumps. So
each predictor gets ONE free multiplicative constant, fit to minimise QLIKE on the IS
half ONLY and applied unchanged to OOS. That neutralises any level bias and makes the
OOS comparison purely about the SHAPE and TIMING of the two forecasts — which is the
actual hypothesis. (For QLIKE the optimal constant has a closed form: c* = mean(r/p).)

THE CONTROL that stops a spurious read. The claim is CONDITIONAL — it is specifically
about days following a high-jump day. So all three buckets are reported: high-jump-prior,
low-jump-prior, and all days. If DIFF wins everywhere by the same margin, the conditional
story is WRONG and what we really found is a mildly better unconditional estimator — a
different, weaker claim, and it gets reported as that.

PRE-REGISTERED PASS CONDITION:
    DIFF beats RAW on OOS QLIKE by >= 2.0% in the HIGH-jump-prior bucket,
    for the FX-major class (the class the events actually drive), with >= 200 OOS days.
    Reported per asset class; no blind pooling across classes.
FAIL = STOP and report the null. Do not wire anything into volStateEngine.js.

BEFORE ACCEPTING A NULL (house discipline, CLAUDE.md). A null is only worth reporting
once you have ruled out that your own construction made the effect unreachable. Three
diagnostics run automatically after the primary test:
  (a) SEPARATION — how far DIFF actually sits from RAW after scale-matching. If the
      correction is a near-constant rescale, a 2% bar is unreachable by construction and
      the result is vacuous, not null.
  (b) TWO SHARPER CONSTRUCTIONS — a 1-day strip (scale by yesterday's OWN diffusive
      share; over-corrects a 30-day average by construction, but varies far more) and a
      pure bipower-window forecast (mean BV over the window vs mean RV over the same
      window — the literature's own RV-vs-BV comparison, both on equal footing).
      Secondary, so they carry a multiple-comparison discount and cannot rescue a
      failed primary; they exist to show the null is not an artefact of one choice.
  (c) THE PREMISE ITSELF — regress tomorrow's realised variance on today's CONTINUOUS
      and JUMP components separately (Andersen-Bollerslev-Diebold "Roughing It Up"
      decomposition). The whole hypothesis rests on jumps persisting LESS than
      diffusion. If the premise is false the null is explained; if the premise is TRUE
      and the forecast still does not improve, that is the more interesting finding and
      it deserves to be stated as such.

Usage:  python3 jump_diffusion_forecast.py
"""
import os, sys, csv, math, datetime, collections, json
import numpy as np
from vol_exhaustion_lib import load_m1, build_london_daily, yz_sigma

HERE = os.path.dirname(os.path.abspath(__file__))
DAILY_CSV = os.path.join(HERE, 'jump_diffusion_daily.csv')
SUMMARY = os.path.join(HERE, 'jump_diffusion_summary.json')
CACHE_DIRS = [os.path.join(HERE, '..', 'portfolioBacktest', 'cache'),
              os.path.join(HERE, '..', 'VolRangeForecaster', 'data', 'm1')]

OOS_FRAC = 0.40          # js/volForecastBench.js scoreSeries default
YZ_WINDOW = 30           # js/volBacktestEngine.js yzVolSeries default
JUMP_WINDOW = 30         # match the estimator's own window (see docstring)
HI_Q = 0.75              # "high-jump-share day" = top quartile of that pair's own history
LO_Q = 0.25
MIN_OOS = 200            # pre-registered minimum OOS days per reported cell
PASS_PCT = 2.0           # pre-registered minimum OOS QLIKE improvement, %
LN2 = math.log(2)


def gk_var(o, h, l, c):
    """Garman-Klass realised-variance proxy — js/volForecastBench.js realizedVarSeries."""
    v = 0.5 * np.log(h / l) ** 2 - (2 * LN2 - 1) * np.log(c / o) ** 2
    return np.maximum(v, 1e-12)


def qlike(real, pred):
    """mean( r/p − ln(r/p) − 1 ) — volForecastBench qlikeTerm, vectorised."""
    x = real / pred
    return float(np.mean(x - np.log(x) - 1.0))


def fit_scale(real, pred):
    """The QLIKE-optimal multiplicative constant: c* = mean(real/pred). IS-only."""
    if real.size == 0:
        return 1.0
    c = float(np.mean(real / pred))
    return c if c > 0 and np.isfinite(c) else 1.0


def load_jump_csv():
    by = collections.defaultdict(dict)
    with open(DAILY_CSV, newline='') as f:
        for r in csv.DictReader(f):
            by[r['pair']][r['date']] = (float(r['rv_1m']), float(r['bv_1m']),
                                        float(r['rv_5m']), float(r['bv_5m']),
                                        float(r['jf_5m']), r['asset_class'])
    return by


def build(pair, path, jmap):
    """Per-day arrays for one pair, aligned and strictly causal."""
    m1 = load_m1(path)
    d = build_london_daily(m1)
    n = d['open'].size
    dates = [(datetime.date(1970, 1, 1) + datetime.timedelta(days=int(x))).isoformat()
             for x in d['day_idx']]
    yz = yz_sigma(d['open'], d['high'], d['low'], d['close'], YZ_WINDOW)
    gk = gk_var(d['open'], d['high'], d['low'], d['close'])

    rv = np.full(n, np.nan); bv = np.full(n, np.nan)
    rv5 = np.full(n, np.nan); jf = np.full(n, np.nan)
    for i, dt in enumerate(dates):
        v = jmap.get(dt)
        if v:
            rv[i], bv[i], rv5[i], _, jf[i], _ = v

    # diffusive share of the trailing JUMP_WINDOW days, days i-W .. i-1 (causal)
    share = np.full(n, np.nan)
    for i in range(JUMP_WINDOW + 1, n):
        a, b = rv[i - JUMP_WINDOW:i], bv[i - JUMP_WINDOW:i]
        m = np.isfinite(a) & np.isfinite(b) & (a > 0)
        if m.sum() >= JUMP_WINDOW // 2:
            share[i] = min(float(b[m].sum() / a[m].sum()), 1.0)

    raw = np.full(n, np.nan); raw[1:] = yz[:-1] ** 2          # pred for day i = yz[i-1]^2
    diff = raw * share
    prior_jf = np.full(n, np.nan); prior_jf[1:] = jf[:-1]     # yesterday's jump share

    ok = (np.isfinite(raw) & np.isfinite(diff) & np.isfinite(prior_jf)
          & np.isfinite(gk) & np.isfinite(rv5) & (raw > 0) & (diff > 0))
    idx = np.flatnonzero(ok)
    return dict(idx=idx, raw=raw, diff=diff, gk=gk, rv5=rv5, prior_jf=prior_jf, n=n)


def discover():
    found = {}
    for dd in CACHE_DIRS:
        if os.path.isdir(dd):
            for fn in sorted(os.listdir(dd)):
                if fn.endswith('_m1.parquet'):
                    found.setdefault(fn[:-len('_m1.parquet')], os.path.join(dd, fn))
    return found


PREMISE = {}


def ols(y, X):
    """OLS with intercept; returns (coefs, t-stats). X columns are regressors."""
    A = np.column_stack([np.ones(X.shape[0]), X])
    coef, *_ = np.linalg.lstsq(A, y, rcond=None)
    resid = y - A @ coef
    dof = max(A.shape[0] - A.shape[1], 1)
    s2 = float(resid @ resid) / dof
    try:
        cov = s2 * np.linalg.inv(A.T @ A)
        se = np.sqrt(np.maximum(np.diag(cov), 1e-30))
    except np.linalg.LinAlgError:
        se = np.full(coef.size, np.nan)
    return coef, coef / se


def diagnostics(pool):
    """(a) separation, (b) two sharper constructions, (c) the premise itself."""
    print('\n' + '=' * 100)
    print('DIAGNOSTICS — is this a real null, or did the construction make it unreachable?')
    print('=' * 100)

    for ac in ('fx_major', 'fx_cross', 'metal'):
        rows = pool.get(ac)
        if not rows:
            continue
        A = np.array(rows, dtype=np.float64)
        gk, rv5, raw, dif, pjf, seg, hi_thr, _ = (A[:, i] for i in range(8))
        r = dif / raw
        print(f'\n  {ac}:')
        print(f'    (a) SEPARATION  30d diffusive share mean={r.mean():.4f} sd={r.std():.4f} '
              f'[p1 {np.quantile(r,.01):.3f}, p99 {np.quantile(r,.99):.3f}]')
        print(f'        after scale-matching, DIFF differs from RAW by ~{r.std()/r.mean()*100:.1f}% '
              f'(1 s.d.) — {"a near-constant rescale; the test is weak by construction" if r.std()/r.mean() < 0.02 else "genuine variation; the test can see an effect"}')

        is_m, oos_m = seg == 0, seg == 1
        # (b) sharper construction 1: strip yesterday's OWN jump share (1-day, over-corrects)
        d1 = raw * (1.0 - pjf)
        print(f'    (b) 1-DAY STRIP (secondary, over-corrects a 30d average by construction)')
        for bn, bm in (('HIGH jump prior', pjf >= hi_thr), ('ALL days', np.ones_like(pjf, bool))):
            c_raw = fit_scale(gk[is_m], raw[is_m]); c_d1 = fit_scale(gk[is_m], d1[is_m])
            m = bm & oos_m
            if m.sum() < 30:
                continue
            qr = qlike(gk[m], raw[m] * c_raw); qd = qlike(gk[m], d1[m] * c_d1)
            print(f'        {bn:16s} OOS n={int(m.sum()):5d}  raw {qr:.5f}  1d-strip {qd:.5f}  '
                  f'{(qr-qd)/abs(qr)*100:+6.2f}%')

    # (c) the premise: do jumps persist less than diffusion? (ABD "Roughing It Up")
    print('\n  (c) THE PREMISE — regress tomorrow\'s realised variance on today\'s')
    print('      CONTINUOUS (BV) and JUMP (max(RV-BV,0)) components, separately.')
    print('      The hypothesis REQUIRES beta_jump < beta_continuous (jumps do not persist).')
    jall = load_jump_csv()
    print(f'      {"class":10s} {"n":>7s} {"b_cont":>8s} {"t":>7s} {"b_jump":>8s} {"t":>7s}  premise')
    by_ac = collections.defaultdict(list)
    for pair, dmap in jall.items():
        items = sorted(dmap.items())
        ac = items[0][1][5]
        rv5 = np.array([v[2] for _, v in items])
        # BV at 5-min is column 3 of the tuple
        bv5 = np.array([v[3] for _, v in items])
        cont = np.minimum(bv5, rv5)
        jump = np.maximum(rv5 - bv5, 0.0)
        ok = np.isfinite(rv5) & np.isfinite(bv5) & (rv5 > 0)
        for i in range(1, len(items)):
            if ok[i] and ok[i - 1]:
                by_ac[ac].append((rv5[i], cont[i - 1], jump[i - 1]))
    for ac in ('fx_major', 'fx_cross', 'metal'):
        v = by_ac.get(ac)
        if not v:
            continue
        M = np.array(v)
        # scale-free: work in units of each class's own mean RV so coefficients compare
        M = M / M[:, 0].mean()
        coef, t = ols(M[:, 0], M[:, 1:])
        ok = 'HOLDS (jumps persist less)' if coef[2] < coef[1] else 'FAILS (jumps persist as much or more)'
        print(f'      {ac:10s} {M.shape[0]:7d} {coef[1]:8.3f} {t[1]:7.2f} {coef[2]:8.3f} {t[2]:7.2f}  {ok}')
        PREMISE[ac] = dict(n=int(M.shape[0]), b_cont=round(float(coef[1]), 4),
                           t_cont=round(float(t[1]), 2), b_jump=round(float(coef[2]), 4),
                           t_jump=round(float(t[2]), 2), holds=bool(coef[2] < coef[1]))

    # the same regression PER PAIR — a pooled fit across pairs with different RV levels
    # can manufacture a cross-sectional slope, so the claim is only worth reporting if it
    # survives instrument by instrument.
    less = negative = total = 0
    exceptions = []
    for pair, dmap in sorted(jall.items()):
        items = sorted(dmap.items())
        rv5 = np.array([v[2] for _, v in items]); bv5 = np.array([v[3] for _, v in items])
        cont = np.minimum(bv5, rv5); jump = np.maximum(rv5 - bv5, 0.0)
        ok = np.isfinite(rv5) & np.isfinite(bv5) & (rv5 > 0)
        y, X = [], []
        for i in range(1, len(items)):
            if ok[i] and ok[i - 1]:
                y.append(rv5[i]); X.append((cont[i - 1], jump[i - 1]))
        if len(y) < 400:
            continue
        y = np.array(y); X = np.array(X); mu = y.mean()
        c, _ = ols(y / mu, X / mu)
        total += 1
        if c[2] < c[1]:
            less += 1
        else:
            exceptions.append(pair)
        negative += int(c[2] < 0)
    PREMISE['per_pair'] = dict(less=less, total=total, negative=negative, exceptions=exceptions)
    print(f'      per-pair: beta_jump < beta_cont on {less}/{total} instruments '
          f'(beta_jump actually NEGATIVE on {negative}/{total})'
          + (f'; exceptions: {", ".join(exceptions)}' if exceptions else ''))


def main(argv):
    if not os.path.exists(DAILY_CSV):
        print('run jump_diffusion_daily.py first'); return 1
    jall = load_jump_csv()
    found = discover()

    # pooled per asset class: (real_gk, real_rv5, pred_raw, pred_diff, prior_jf, seg)
    pool = collections.defaultdict(list)
    print('building causal forecast series per pair...')
    for pair in sorted(jall):
        if pair not in found:
            continue
        ac = next(iter(jall[pair].values()))[5]
        b = build(pair, found[pair], jall[pair])
        idx = b['idx']
        if idx.size < 400:
            continue
        cut = int(idx.size * (1 - OOS_FRAC))
        # jump-share buckets from the pair's OWN IS history only (no lookahead)
        is_jf = b['prior_jf'][idx[:cut]]
        hi_thr, lo_thr = np.quantile(is_jf, [HI_Q, LO_Q])
        for k, i in enumerate(idx):
            pool[ac].append((b['gk'][i], b['rv5'][i], b['raw'][i], b['diff'][i],
                             b['prior_jf'][i], 0 if k < cut else 1, hi_thr, lo_thr))
    print()

    print('=' * 100)
    print('PHASE 3 — does a DIFFUSION-ONLY sigma beat the raw YZ sigma?   (PRE-REGISTERED)')
    print('=' * 100)
    print(f'  loss            : QLIKE (js/volForecastBench.js), lower is better')
    print(f'  proxy           : Garman-Klass (bench default); intraday RV_5m as robustness')
    print(f'  split           : {int((1-OOS_FRAC)*100)}/{int(OOS_FRAC*100)} chronological, per pair')
    print(f'  scale-matching  : one IS-fit constant per predictor, applied to OOS')
    print(f'  pass bar        : DIFF beats RAW by >= {PASS_PCT:.1f}% OOS QLIKE on the')
    print(f'                    HIGH-jump-prior bucket, fx_major, n_oos >= {MIN_OOS}')

    verdict = {}
    for ac in ('fx_major', 'fx_cross', 'metal'):
        rows = pool.get(ac)
        if not rows:
            continue
        A = np.array(rows, dtype=np.float64)
        gk, rv5, raw, dif, pjf, seg, hi_thr, lo_thr = (A[:, i] for i in range(8))
        is_m, oos_m = seg == 0, seg == 1

        print(f'\n  ══ {ac}  (n_is={int(is_m.sum()):,d}  n_oos={int(oos_m.sum()):,d}) ══')
        for proxy_name, real in (('Garman-Klass (primary)', gk), ('intraday RV_5m (robustness)', rv5)):
            # scale each predictor on IS only, apply to OOS
            c_raw = fit_scale(real[is_m], raw[is_m])
            c_dif = fit_scale(real[is_m], dif[is_m])
            p_raw, p_dif = raw * c_raw, dif * c_dif
            print(f'\n    {proxy_name}   [IS scale: raw x{c_raw:.3f}, diff x{c_dif:.3f}]')
            print(f'      {"bucket":22s} {"half":4s} {"n":>6s} {"QLIKE raw":>10s} '
                  f'{"QLIKE diff":>11s} {"improve":>8s}')
            for bname, bmask in (('HIGH jump-share prior', pjf >= hi_thr),
                                 ('LOW  jump-share prior', pjf <= lo_thr),
                                 ('ALL days (control)', np.ones_like(pjf, dtype=bool))):
                for seg_v, half in ((0, 'IS'), (1, 'OOS')):
                    m = bmask & (seg == seg_v)
                    if m.sum() < 30:
                        continue
                    qr, qd = qlike(real[m], p_raw[m]), qlike(real[m], p_dif[m])
                    imp = (qr - qd) / abs(qr) * 100 if qr != 0 else float('nan')
                    print(f'      {bname:22s} {half:4s} {int(m.sum()):6d} {qr:10.5f} '
                          f'{qd:11.5f} {imp:+7.2f}%')
                    if (proxy_name.startswith('Garman') and half == 'OOS'
                            and bname.startswith('HIGH')):
                        verdict[ac] = (imp, int(m.sum()))

    diagnostics(pool)

    print('\n' + '=' * 100)
    print('VERDICT (primary: GK proxy, OOS, HIGH-jump-prior bucket)')
    passed = False
    for ac, (imp, n) in verdict.items():
        ok = imp >= PASS_PCT and n >= MIN_OOS
        print(f'  {ac:10s}: {imp:+6.2f}% OOS QLIKE improvement over raw YZ  (n={n:,d})  '
              f'-> {"PASS" if ok else "FAIL"}')
        if ac == 'fx_major' and ok:
            passed = True
    if passed:
        print(f'\n  Pre-registered condition HOLDS. Phase 4 (wiring into volStateEngine.js) may proceed.')
    else:
        print(f'\n  Pre-registered condition FAILS — the diffusion-only sigma does not clear the')
        print(f'  raw YZ estimator by {PASS_PCT:.1f}% OOS on the days the hypothesis is about.')
        print(f'  STOP. Report the null; do NOT wire this into volStateEngine.js.')
    print('=' * 100)

    try:
        doc = json.load(open(SUMMARY))
    except (OSError, ValueError):
        doc = {}
    doc['phase3'] = dict(loss='QLIKE', proxy='garman_klass', oos_frac=OOS_FRAC,
                         yz_window=YZ_WINDOW, jump_window=JUMP_WINDOW,
                         pass_pct=PASS_PCT, min_oos=MIN_OOS,
                         oos_high_jump_improvement_pct={k: round(float(v[0]), 3)
                                                       for k, v in verdict.items()},
                         oos_n={k: int(v[1]) for k, v in verdict.items()},
                         premise=PREMISE, passed=bool(passed))
    with open(SUMMARY, 'w') as f:
        json.dump(doc, f, indent=1, default=float)
    print(f'  wrote {os.path.basename(SUMMARY)}')
    return 0 if passed else 2


if __name__ == '__main__':
    sys.exit(main(sys.argv))
