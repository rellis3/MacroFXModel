"""
daytype_classifier.py — does prior-vol / regime tell us, causally and OUT-OF-SAMPLE,
whether TODAY will blow through the forecast or stay contained?

This is the falsification screen behind the "volatility-budget verdict" the owner
wants on the Telegram blasts. The earlier study (README §Results) killed the fade
ENTRY three ways (distance-from-open null; fresh-extreme weak; payoff geometry
symmetric → sub-cost). This asks a DIFFERENT question — not "fade or follow at the
level" but "is today an EXPANSION (blow-through) day or a CONTAINED day", from
information known BEFORE the London session opens. If that classifies with real
OOS skill, the blast can honestly tag continuation-risk vs fade-friendly; if not,
the blast ships factual context only and no verdict.

Why it might work (the honest mechanism, stated up front)
  The shipped forecast scales with a LAGGED Yang-Zhang sigma: sigma_pred[i]=yz[i-1].
  Vol clusters (GARCH is the one replicated effect here). When vol is ACCELERATING,
  the lagged forecast is built on stale, too-low sigma, so realized H-L is more
  likely to exceed the (lagged) 75th line. That is a real, causal, non-circular
  reason second-order vol features could predict exceedance. The risk: this may
  just rediscover "use a faster sigma" — which the repo already tested and shelved
  (CONDITIONAL_FADE_DESIGN §sigma half-life A/B: EWMA barely beats YZ30, sub-cost,
  keep YZ30). So the sigma-ONLY ablation below is not decoration — if the full
  feature set does not beat sigma-alone OOS, there is no NEW information, only a
  restatement of "the forecast's sigma is a touch slow".

Why it might NOT work
  The label is defined RELATIVE to the sigma-scaled forecast, so the part of vol
  clustering that is already in sigma_pred is controlled for by construction. What
  is left for the features to predict is only the RESIDUAL exceedance — which may
  be mostly noise. Default prior for an FX intraday effect is null.

────────────────────────────────────────────────────────────────────────────────
LABEL (primary, pre-registered)
  expand[i] = 1 if realized H-L of day i, in sigma-units, exceeds the forecast's
  75th-percentile H-L line:
        realized_hl_sig[i] = (high_i - low_i) / open_i / sigma_pred[i]
        hl75_sig           = BM_P75 * hl_75_corr[asset]        (fx = 2.049*0.817 = 1.674)
        expand[i] = realized_hl_sig[i] > hl75_sig
  By calibration the base rate is ~25% (the forecaster targets 25% exceedance).
  That ~25% IS the benchmark to beat — a model that just predicts the base rate
  every day is the floor (Brier = p(1-p)); skill must beat it OUT OF SAMPLE.

LABEL (secondary, reported not gated)
  trend[i]  = efficiency ratio ER_i = |close_i-open_i| / (high_i-low_i) >= 0.5
  i.e. did the day go somewhere efficiently (trend) vs churn in place (revert).

FEATURES (all causal — known at/*before* day i's London open; no lookahead)
  sig          sigma_pred[i] (= yz[i-1]) — the vol level the forecast itself uses
  sig_pct      percentile rank of sig within its trailing 252 values (vol regime)
  sig_accel    sig / mean(prior 5 sig)            — is the vol basis rising
  vov          std of log(sig) over trailing 20   — vol-of-vol (regime instability)
  gap          |open_i - close_{i-1}| / open_i / sig  — overnight jump, sigma-units
  prior_exc1   realized_hl_sig[i-1] / hl75_sig    — did YESTERDAY blow through
  prior_exc3   mean of that ratio over i-1..i-3   — recent exceedance regime
  prior_er1    ER of day i-1                       — was yesterday trend or chop
  prior_er3    mean ER over i-1..i-3
  (sig_accel / vov / prior_exc* are the "second-order" features the band does NOT
   already contain; sig / sig_pct are the level features the ablation isolates.)

VALIDATION
  Time-ordered split per instrument: first 60% train, last 40% test (NO shuffle —
  a shuffled CV would leak the future through vol clustering). Standardise on TRAIN
  stats only. Primary model = logistic regression (minimal DOF, hard to overfit).
  Secondary = shallow HistGradientBoosting (flagged higher-DOF flexibility check).
  Pooled model: z-score each feature within instrument on its train rows, pool all
  FX majors, fit on pooled IS, score on pooled OOS (cross-sectional consistency is
  the real evidence per the README — one pair passing is what noise does).

  Benchmarks (name the floor, per CLAUDE.md):
    base   — predict train base-rate every day (Brier = p(1-p))
    sigACL — logistic on sig + sig_pct ONLY (is there anything beyond vol level?)
    full   — logistic on all features
  Metrics OOS: AUC (0.5=no skill), Brier, Brier-skill = 1 - Brier_full/Brier_base.

PRE-REGISTERED VERDICT (so a null cannot be re-narrated)
  PASS  (verdict earns a place on the blast) iff ALL of:
     (a) pooled FX OOS AUC(full) >= 0.55, AND
     (b) pooled FX OOS Brier-skill(full) > 0 (beats the base-rate floor), AND
     (c) full beats sigACL OOS on Brier-skill (NEW info beyond vol level), AND
     (d) OOS Brier-skill(full) > 0 on >= 4 of the 6 FX majors individually.
  Otherwise NULL: prior vol predicts MAGNITUDE (already in sigma) but not the
  residual expansion the forecast hasn't already priced — blast ships context only.

Run:
    python3 daytype_classifier.py            # 6 FX majors + NQ, full report
    python3 daytype_classifier.py EURUSD     # single instrument
Outputs: prints the scoreboard + verdict, writes daytype_classifier_summary.json
"""
import os, sys, json
import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import roc_auc_score, brier_score_loss

from vol_exhaustion_lib import load_m1, build_london_daily, causal_sigma

HERE = os.path.dirname(os.path.abspath(__file__))
# instrument -> M1 parquet (mirrors measure.INSTRUMENTS; kept local so this screen
# has no matplotlib dependency — it prints numbers, it does not draw)
INSTRUMENTS = {
    'EURUSD': ('portfolioBacktest/cache/eurusd_m1.parquet', {'USD', 'EUR'}),
    'GBPUSD': ('portfolioBacktest/cache/gbpusd_m1.parquet', {'USD', 'GBP'}),
    'AUDUSD': ('portfolioBacktest/cache/audusd_m1.parquet', {'USD'}),
    'NZDUSD': ('portfolioBacktest/cache/nzdusd_m1.parquet', {'USD'}),
    'USDCAD': ('portfolioBacktest/cache/usdcad_m1.parquet', {'USD'}),
    'USDCHF': ('portfolioBacktest/cache/usdchf_m1.parquet', {'USD'}),
    'NQ':     ('portfolioBacktest/cache/nq_m1.parquet', {'USD'}),
}

# forecast band constants — MUST match js/volBacktestEngine.js (single source of truth)
BM_P75 = 2.049
HL75_CORR = {'fx': 0.817, 'index': 0.967, 'commodity': 0.914}
ASSET_OF = {'EURUSD': 'fx', 'GBPUSD': 'fx', 'AUDUSD': 'fx', 'NZDUSD': 'fx',
            'USDCAD': 'fx', 'USDCHF': 'fx', 'NQ': 'index'}
FX_MAJORS = ['EURUSD', 'GBPUSD', 'AUDUSD', 'NZDUSD', 'USDCAD', 'USDCHF']

MIN_BARS = 60           # a day needs >= this many M1 bars to be a valid outcome
PCT_WIN = 252           # trailing window for sigma percentile (≈1y)
VOV_WIN = 20            # trailing window for vol-of-vol
TRAIN_FRAC = 0.60       # time-ordered split
FEATS = ['sig', 'sig_pct', 'sig_accel', 'vov', 'gap',
         'prior_exc1', 'prior_exc3', 'prior_er1', 'prior_er3']
FEATS_SIGONLY = ['sig', 'sig_pct']


def build_day_table(path, pair):
    """Return per-day causal features + labels for one instrument (rows with any
    NaN feature/label dropped). All features use data strictly before day i's open."""
    m1 = load_m1(path)
    d = build_london_daily(m1)
    sig = causal_sigma(d)                     # sig[i] = yz[i-1], causal
    o, hi, lo, c = d['open'], d['high'], d['low'], d['close']
    nbars = d['end'] - d['start']
    nd = o.size
    hl75_sig = BM_P75 * HL75_CORR[ASSET_OF[pair]]

    # realized outcomes (day i)
    realized_hl_sig = np.full(nd, np.nan)
    er = np.full(nd, np.nan)
    ok = (sig > 0) & (o > 0) & (nbars >= MIN_BARS)
    realized_hl_sig[ok] = (hi[ok] - lo[ok]) / o[ok] / sig[ok]
    rng = (hi - lo)
    er[ok & (rng > 0)] = np.abs(c - o)[ok & (rng > 0)] / rng[ok & (rng > 0)]

    # ── causal features ──────────────────────────────────────────────────────
    logsig = np.log(np.where(sig > 0, sig, np.nan))
    sig_pct = np.full(nd, np.nan)
    sig_accel = np.full(nd, np.nan)
    vov = np.full(nd, np.nan)
    gap = np.full(nd, np.nan)
    for i in range(nd):
        if not (sig[i] > 0):
            continue
        if i >= PCT_WIN:
            w = sig[i - PCT_WIN:i]                       # strictly before i
            w = w[w > 0]
            if w.size >= 30:
                sig_pct[i] = (w < sig[i]).mean()
        if i >= 5:
            base = sig[i - 5:i]
            base = base[base > 0]
            if base.size:
                sig_accel[i] = sig[i] / base.mean()
        if i >= VOV_WIN:
            w = logsig[i - VOV_WIN:i]
            w = w[np.isfinite(w)]
            if w.size >= 5:
                vov[i] = w.std(ddof=1)
        if i >= 1 and o[i] > 0 and c[i - 1] > 0:
            gap[i] = abs(o[i] - c[i - 1]) / o[i] / sig[i]

    # prior-day exceedance / efficiency (shift realized outcomes back by 1..3)
    exc_ratio = realized_hl_sig / hl75_sig
    prior_exc1 = np.concatenate([[np.nan], exc_ratio[:-1]])
    prior_er1 = np.concatenate([[np.nan], er[:-1]])
    def trail_mean3(x):
        out = np.full(nd, np.nan)
        for i in range(3, nd):
            w = x[i - 3:i]
            if np.isfinite(w).all():
                out[i] = w.mean()
        return out
    prior_exc3 = trail_mean3(exc_ratio)
    prior_er3 = trail_mean3(er)

    cols = dict(sig=sig, sig_pct=sig_pct, sig_accel=sig_accel, vov=vov, gap=gap,
                prior_exc1=prior_exc1, prior_exc3=prior_exc3,
                prior_er1=prior_er1, prior_er3=prior_er3)
    expand = (realized_hl_sig > hl75_sig).astype(float)
    trend = (er >= 0.5).astype(float)

    X = np.column_stack([cols[k] for k in FEATS])
    valid = np.isfinite(X).all(axis=1) & np.isfinite(realized_hl_sig) & np.isfinite(er)
    day_idx = d['day_idx']
    return dict(pair=pair, X=X[valid], cols={k: cols[k][valid] for k in FEATS},
                expand=expand[valid], trend=trend[valid],
                day_idx=day_idx[valid], hl75_sig=hl75_sig,
                base_rate_expand=float(expand[valid].mean()))


def _standardize(train, test):
    mu = train.mean(axis=0)
    sd = train.std(axis=0)
    sd[sd == 0] = 1.0
    return (train - mu) / sd, (test - mu) / sd


def _fit_score(Xtr, ytr, Xte, yte, model='logit'):
    """Return (auc, brier, p_test). Guards degenerate single-class train."""
    if len(np.unique(ytr)) < 2:
        p = np.full(yte.size, ytr.mean())
        return float('nan'), brier_score_loss(yte, p) if len(np.unique(yte)) > 1 else float('nan'), p
    if model == 'logit':
        clf = LogisticRegression(max_iter=1000, C=1.0)
    else:
        clf = HistGradientBoostingClassifier(max_depth=3, max_iter=150,
                                              learning_rate=0.05, l2_regularization=1.0,
                                              min_samples_leaf=60)
    clf.fit(Xtr, ytr)
    p = clf.predict_proba(Xte)[:, 1]
    auc = roc_auc_score(yte, p) if len(np.unique(yte)) > 1 else float('nan')
    return float(auc), float(brier_score_loss(yte, p)), p


def brier_skill(y, p, base):
    b = brier_score_loss(y, p)
    b0 = brier_score_loss(y, np.full(y.size, base))
    return 1.0 - b / b0 if b0 > 0 else float('nan')


def run_instrument(tab, feat_list=FEATS):
    y = tab['expand']
    Xall = np.column_stack([tab['cols'][k] for k in feat_list])
    n = y.size
    ntr = int(n * TRAIN_FRAC)
    Xtr, Xte = _standardize(Xall[:ntr], Xall[ntr:])
    ytr, yte = y[:ntr], y[ntr:]
    base = float(ytr.mean())            # train base rate = the floor
    auc, brier, p = _fit_score(Xtr, ytr, Xte, yte, 'logit')
    skill = brier_skill(yte, p, base)
    return dict(n=n, n_test=int(yte.size), base_rate=base,
                oos_auc=auc, oos_brier=brier, oos_brier_skill=skill,
                test_pos_rate=float(yte.mean()))


def run_sigonly(tab):
    return run_instrument(tab, FEATS_SIGONLY)


def pooled(tabs):
    """Pool FX majors: z-score per instrument on its own train rows, then combine."""
    Xtr_all, ytr_all, Xte_all, yte_all = [], [], [], []
    base_num, base_den = 0.0, 0
    for tab in tabs:
        y = tab['expand']
        Xall = np.column_stack([tab['cols'][k] for k in FEATS])
        n = y.size
        ntr = int(n * TRAIN_FRAC)
        xtr, xte = _standardize(Xall[:ntr], Xall[ntr:])
        Xtr_all.append(xtr); Xte_all.append(xte)
        ytr_all.append(y[:ntr]); yte_all.append(y[ntr:])
        base_num += y[:ntr].sum(); base_den += ntr
    Xtr = np.vstack(Xtr_all); Xte = np.vstack(Xte_all)
    ytr = np.concatenate(ytr_all); yte = np.concatenate(yte_all)
    base = base_num / base_den
    out = {}
    for name, mdl in [('logit_full', 'logit'), ('gbm_full', 'gbm')]:
        auc, brier, p = _fit_score(Xtr, ytr, Xte, yte, mdl)
        out[name] = dict(oos_auc=auc, oos_brier=brier,
                         oos_brier_skill=brier_skill(yte, p, base))
    # sig-only pooled ablation
    idx = [FEATS.index(k) for k in FEATS_SIGONLY]
    auc, brier, p = _fit_score(Xtr[:, idx], ytr, Xte[:, idx], yte, 'logit')
    out['logit_sigonly'] = dict(oos_auc=auc, oos_brier=brier,
                                oos_brier_skill=brier_skill(yte, p, base))
    # coefficients of the pooled full logit (which features carry sign)
    clf = LogisticRegression(max_iter=1000).fit(Xtr, ytr)
    out['coef'] = {k: float(v) for k, v in zip(FEATS, clf.coef_[0])}
    out['base_rate'] = float(base)
    out['n_test'] = int(yte.size)
    return out


def main(pairs):
    tabs = {}
    per = {}
    print('=== per-instrument: predict EXPANSION (realized H-L > forecast 75th) ===')
    print(f'{"pair":8} {"n":>6} {"base%":>6} {"OOSauc":>7} {"skill%":>7} {"sigOnly%":>8}')
    for pair in pairs:
        rel, _ = INSTRUMENTS[pair]
        tab = build_day_table(os.path.join(HERE, '..', rel), pair)
        tabs[pair] = tab
        r = run_instrument(tab)
        rs = run_sigonly(tab)
        per[pair] = dict(full=r, sigonly=rs, base_rate=tab['base_rate_expand'])
        print(f'{pair:8} {r["n"]:6d} {100*r["base_rate"]:6.1f} {r["oos_auc"]:7.3f} '
              f'{100*r["oos_brier_skill"]:7.2f} {100*rs["oos_brier_skill"]:8.2f}')

    fx = [tabs[p] for p in pairs if p in FX_MAJORS]
    pool = pooled(fx) if len(fx) >= 2 else None

    verdict = None
    if pool:
        full = pool['logit_full']; sigo = pool['logit_sigonly']
        fx_names = [p for p in pairs if p in FX_MAJORS]
        n_pair_pos = sum(1 for p in fx_names if per[p]['full']['oos_brier_skill'] > 0)
        cond_a = full['oos_auc'] >= 0.55
        cond_b = full['oos_brier_skill'] > 0
        cond_c = full['oos_brier_skill'] > sigo['oos_brier_skill']
        cond_d = n_pair_pos >= 4
        passed = cond_a and cond_b and cond_c and cond_d
        print('\n=== pooled FX (the honest cross-sectional test) ===')
        print(f'  logit full   : OOS AUC {full["oos_auc"]:.3f}  Brier-skill {100*full["oos_brier_skill"]:+.2f}%')
        print(f'  logit sigOnly: OOS AUC {sigo["oos_auc"]:.3f}  Brier-skill {100*sigo["oos_brier_skill"]:+.2f}%')
        print(f'  gbm   full   : OOS AUC {pool["gbm_full"]["oos_auc"]:.3f}  Brier-skill {100*pool["gbm_full"]["oos_brier_skill"]:+.2f}%')
        print(f'  base rate {100*pool["base_rate"]:.1f}%   pairs with +skill: {n_pair_pos}/{len(fx_names)}')
        print('  top coefficients (pooled full logit):')
        for k, v in sorted(pool['coef'].items(), key=lambda kv: -abs(kv[1])):
            print(f'      {k:12} {v:+.3f}')
        print('\n=== PRE-REGISTERED VERDICT ===')
        print(f'  (a) AUC>=0.55 ............ {cond_a}  ({full["oos_auc"]:.3f})')
        print(f'  (b) beats base floor ..... {cond_b}  ({100*full["oos_brier_skill"]:+.2f}%)')
        print(f'  (c) beats sigma-only ..... {cond_c}  ({100*full["oos_brier_skill"]:+.2f} vs {100*sigo["oos_brier_skill"]:+.2f})')
        print(f'  (d) +skill on >=4/6 FX ... {cond_d}  ({n_pair_pos}/6)')
        print(f'  --> {"PASS: verdict earns a place on the blast" if passed else "NULL: context-only, no directional verdict"}')
        verdict = dict(passed=bool(passed), conditions=dict(a=bool(cond_a), b=bool(cond_b),
                       c=bool(cond_c), d=bool(cond_d)), n_pair_pos=n_pair_pos)

    summary = dict(per_instrument={p: {
                       'base_rate_expand': per[p]['base_rate'],
                       'oos_auc': per[p]['full']['oos_auc'],
                       'oos_brier_skill': per[p]['full']['oos_brier_skill'],
                       'sigonly_brier_skill': per[p]['sigonly']['oos_brier_skill'],
                       'n': per[p]['full']['n']} for p in pairs},
                   pooled_fx=pool, verdict=verdict)
    outp = os.path.join(HERE, 'daytype_classifier_summary.json')
    with open(outp, 'w') as f:
        json.dump(summary, f, indent=2, default=float)
    print(f'\nwrote {os.path.basename(outp)}')
    return summary


def robust(pairs):
    """Skeptic pass — a strong result must survive all of these or it is an artifact.
      placebo  : shuffle labels within train/test -> skill must collapse to ~0.
      drop-gap : is the result one feature? refit without `gap`.
      gap-only : how much is gap alone carrying?
      trend    : does the SAME feature set predict ER-trend CHARACTER, or only range?
      walkfwd  : 3 expanding-window splits (0.4/0.55/0.7 train) -> stable OOS AUC?
    """
    rng = np.random.default_rng(0)
    tabs = {p: build_day_table(os.path.join(HERE, '..', INSTRUMENTS[p][0]), p) for p in pairs}
    fx = [tabs[p] for p in pairs if p in FX_MAJORS]

    def pooled_auc_skill(tabs_list, feats, label='expand', shuffle=False, train_frac=TRAIN_FRAC):
        Xtr_all, ytr_all, Xte_all, yte_all = [], [], [], []
        bn, bd = 0.0, 0
        for tab in tabs_list:
            y = tab[label].copy()
            Xall = np.column_stack([tab['cols'][k] for k in feats])
            n = y.size; ntr = int(n * train_frac)
            if shuffle:
                y = y.copy(); rng.shuffle(y)
            xtr, xte = _standardize(Xall[:ntr], Xall[ntr:])
            Xtr_all.append(xtr); Xte_all.append(xte)
            ytr_all.append(y[:ntr]); yte_all.append(y[ntr:]); bn += y[:ntr].sum(); bd += ntr
        Xtr = np.vstack(Xtr_all); Xte = np.vstack(Xte_all)
        ytr = np.concatenate(ytr_all); yte = np.concatenate(yte_all); base = bn / bd
        auc, brier, p = _fit_score(Xtr, ytr, Xte, yte, 'logit')
        return auc, brier_skill(yte, p, base)

    print('=== ROBUSTNESS (pooled FX) ===')
    a, s = pooled_auc_skill(fx, FEATS)
    print(f'  full             AUC {a:.3f}  skill {100*s:+.2f}%   (reference)')
    a, s = pooled_auc_skill(fx, FEATS, shuffle=True)
    print(f'  PLACEBO (shuffle)AUC {a:.3f}  skill {100*s:+.2f}%   (must be ~0.50 / ~0%)')
    a, s = pooled_auc_skill(fx, [f for f in FEATS if f != 'gap'])
    print(f'  drop-gap         AUC {a:.3f}  skill {100*s:+.2f}%   (survives without gap?)')
    a, s = pooled_auc_skill(fx, ['gap'])
    print(f'  gap-only         AUC {a:.3f}  skill {100*s:+.2f}%   (how much is gap alone)')
    a, s = pooled_auc_skill(fx, FEATS, label='trend')
    print(f'  TREND label      AUC {a:.3f}  skill {100*s:+.2f}%   (does it predict CHARACTER, not just size?)')
    print('  walk-forward (expanding train):')
    for tf in (0.40, 0.55, 0.70):
        a, s = pooled_auc_skill(fx, FEATS, train_frac=tf)
        print(f'      train_frac {tf:.2f}: AUC {a:.3f}  skill {100*s:+.2f}%')

    # ── transparent live rule: is a no-fit 2-condition selector still skilful OOS? ──
    # The live blast should carry a TRANSPARENT rule, not a fitted logistic ported
    # into the hot path. Rule: expansion-lean if prior day blew through its 75th
    # (prior_exc1 > 1) OR sigma is accelerating (sig_accel > 1.10). Score its OOS
    # separation of expand vs contained on the pooled FX test half, no fitting.
    print('  transparent rule  [prior_exc1>1 OR sig_accel>1.10]  (OOS test half, pooled FX):')
    tp = tn = fp = fn = 0
    lean_pos_exp = lean_pos_n = lean_neg_exp = lean_neg_n = 0
    for tab in fx:
        y = tab['expand']; n = y.size; ntr = int(n * TRAIN_FRAC)
        pe = tab['cols']['prior_exc1'][ntr:]
        ac = tab['cols']['sig_accel'][ntr:]
        yy = y[ntr:]
        lean = (pe > 1.0) | (ac > 1.10)          # expansion-lean flag
        lean_pos_exp += yy[lean].sum();  lean_pos_n += lean.sum()
        lean_neg_exp += yy[~lean].sum(); lean_neg_n += (~lean).sum()
    p_lean = lean_pos_exp / max(lean_pos_n, 1)
    p_calm = lean_neg_exp / max(lean_neg_n, 1)
    print(f'      expand-rate | lean=EXPANSION : {p_lean:.3f}  (n={lean_pos_n})')
    print(f'      expand-rate | lean=CONTAINED : {p_calm:.3f}  (n={lean_neg_n})')
    print(f'      separation (lean-minus-calm) : {p_lean - p_calm:+.3f}  '
          f'(> 0 and monotone = the transparent rule earns its place on the blast)')


if __name__ == '__main__':
    args = sys.argv[1:]
    if args and args[0] == 'robust':
        robust(args[1:] if len(args) > 1 else FX_MAJORS)
    else:
        main(args if args else (FX_MAJORS + ['NQ']))
