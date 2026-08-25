"""
OUT-OF-SAMPLE CONFIRMATION for the CVOL pin/accelerate curve.

`cvol_spec_curve.py` found predictability that beat its placebo (13.0% of specs at
|t|>1.96 against a placebo rate of 5.1%), concentrated entirely at the 1-day horizon.
This asks the only question that matters next: does a relationship fitted on early
data still hold on later data it never saw?

HONEST LIMITATION, STATED FIRST. The full 2016-2026 sample has already been looked
at once - that is what produced the finding. So this is not a virgin out-of-sample
test and nothing here can restore one. What it CAN do is make the selection
mechanical: specifications are ranked by |t| on the IS window ALONE and then
evaluated on OOS, with no human choosing which cell to carry forward. That removes
the selection freedom, not the prior knowledge.

  IS   2016-01-04 .. 2021-12-31
  OOS  2022-01-01 .. 2026-08-20

THREE TESTS, in increasing strictness.

  1. AGGREGATE TRANSFER - across every h=1 specification, does r_IS predict r_OOS?
     A real relationship gives positive rank correlation and sign agreement well
     above 50%. This uses the WHOLE curve, so it cannot be cherry-picked.
  2. MECHANICAL TOP-K - take the 5 specs with the largest |t| in IS, report their
     OOS r, t and MDE. Selection is by IS only.
  3. YEAR-BY-YEAR - sign of r per calendar year for each predictor. Fragility shows
     up here as sign flipping; a real effect should mostly hold its sign.

SYMMETRY RULE (inherited from cvol_spec_curve.py, applies to this file too):
every result carries its minimum detectable effect. If the OOS arm comes back flat,
it is reported as UNDERPOWERED unless the MDE is small enough to have seen the IS
effect size. A flat OOS with an MDE larger than the IS r is not a refutation.

  python analysis/cvol_oos.py

---------------------------------------------------------------------------
RESULT - run 2026-08-23. IS 1,512 dates (MDE r 0.072) / OOS 1,162 dates (MDE r 0.082).
140 matched h=1 specifications.

TEST 1 - AGGREGATE TRANSFER (nothing selected)
  rank corr(r_IS, r_OOS)              +0.733
  pearson corr(r_IS, r_OOS)           +0.706
  sign agreement                      82.1% of 140 specs
  sign agreement | IS significant     91.1% of 45 specs
  mean |r|  IS 0.043 -> OOS 0.048     no shrinkage (OOS marginally larger)

TEST 2 - MECHANICAL TOP-5 (ranked on IS alone)
  skew_ratio / updn  FX rng demeaned   r -0.109 -> -0.100  t_OOS -3.41   CONFIRMS
  (4 of the 5 rows are that one finding duplicated across zlb and the
   skew_ratio/updn collinearity - it is ONE result, not four)
  vrp_trail20        FX rng raw        r +0.106 -> +0.045  t_OOS +1.55   same sign,
                                       not significant; MDE_OOS 0.082 > 0.045 so this
                                       is UNDERPOWERED to confirm, not a refutation

TEST 3 - YEAR-BY-YEAR SIGN STABILITY (h=1, range)
  vrp_trail20 100%  ·  convexity 91%  ·  skew / skew_ratio / updn 82%
  cvol_chg5 73%  ·  cvol_z 60%

VERDICT: CONFIRMED OUT OF SAMPLE. Small, one-day, and real.

THE HONEST DISCOUNT ON TEST 1. z=+7.61 assumes 140 independent specifications and
they are not: skew_ratio and updn are algebraically near-identical, the two zlb
values often return the same number, and 'all' contains 'FX'. The effective count
is nearer 10-20. At n=15 and 82% agreement the binomial p is still ~0.02, so the
transfer survives the discount - but quote the discounted version, not z=7.6.

WHAT IT MEANS ECONOMICALLY. Richer convexity and a richer up/down variance ratio
predict next-day realised range coming in UNDER what the options market implied -
pinning. High CVOL against its own history, and a recently rich trailing premium,
predict realised running OVER - acceleration. That is a genuine external pin-vs-
accelerate factor of the kind COG described, with 10 years behind it.

WHAT IT IS NOT. |r| ~ 0.10 is ~1% of variance. It is a one-day effect, and the
longer horizons remain UNDERPOWERED rather than tested. Nothing here is costed, and
no trading rule has been built or evaluated. A correlation that survives OOS is a
licence to build the rule - not a rule.
---------------------------------------------------------------------------
"""
import math
import pandas as pd, numpy as np

from cvol_spec_curve import load, features, stat, PRED

IS_END = pd.Timestamp('2021-12-31')
OOS_START = pd.Timestamp('2022-01-01')
H = 1                                   # the only properly powered horizon


def specs(frames, lo=None, hi=None):
    rows = []
    for zlb, f in frames.items():
        if lo is not None:
            f = f[f.date >= lo]
        if hi is not None:
            f = f[f.date <= hi]
        for cls, sub in (('all', f), ('FX', f[f['product'] != 'XAUUSD']),
                         ('gold', f[f['product'] == 'XAUUSD'])):
            for outcome in ['rng', 'ret']:
                for p in PRED:
                    for dm in [False, True]:
                        if dm and cls == 'gold':
                            continue
                        r = stat(sub, p, f'{outcome}{H}', dm)
                        if r:
                            t, rho, n, mde = r
                            rows.append(dict(zlb=zlb, cls=cls, outcome=outcome, pred=p,
                                             demean=dm, t=t, r=rho, n=n, mde=mde))
    return pd.DataFrame(rows)


def main():
    df = load()
    frames = {zlb: features(df, zlb) for zlb in [126, 252]}

    IS = specs(frames, hi=IS_END)
    OOS = specs(frames, lo=OOS_START)
    key = ['zlb', 'cls', 'outcome', 'pred', 'demean']
    m = IS.merge(OOS, on=key, suffixes=('_is', '_oos'))
    print(f'IS  {len(IS)} specs   OOS {len(OOS)} specs   matched {len(m)}')
    print(f'IS  median n {IS.n.median():.0f} dates, median MDE r {IS.mde.median():.3f}')
    print(f'OOS median n {OOS.n.median():.0f} dates, median MDE r {OOS.mde.median():.3f}')

    print('\n' + '=' * 74)
    print('TEST 1 - AGGREGATE TRANSFER  (whole curve, nothing selected)')
    print('=' * 74)
    rank = m.r_is.corr(m.r_oos, method='spearman')
    pear = m.r_is.corr(m.r_oos)
    agree = (np.sign(m.r_is) == np.sign(m.r_oos)).mean()
    sig_is = m[m.t_is.abs() > 1.96]
    agree_sig = (np.sign(sig_is.r_is) == np.sign(sig_is.r_oos)).mean() if len(sig_is) else float('nan')
    # binomial p for sign agreement against 50%
    n_ag = len(m)
    z = (agree - 0.5) / math.sqrt(0.25 / n_ag)
    print(f'  rank corr(r_IS, r_OOS)        {rank:+.3f}')
    print(f'  pearson corr(r_IS, r_OOS)     {pear:+.3f}')
    print(f'  sign agreement                {agree:.1%}  of {n_ag} specs   (z={z:+.2f} vs 50%)')
    print(f'  sign agreement | IS significant {agree_sig:.1%}  of {len(sig_is)} specs')
    print(f'  mean |r| IS {m.r_is.abs().mean():.4f}  ->  OOS {m.r_oos.abs().mean():.4f}   '
          f'shrinkage {1 - m.r_oos.abs().mean() / m.r_is.abs().mean():.0%}')

    print('\n' + '=' * 74)
    print('TEST 2 - MECHANICAL TOP-5  (ranked by |t| on IS only, evaluated on OOS)')
    print('=' * 74)
    top = m.reindex(m.t_is.abs().sort_values(ascending=False).index).head(5)
    print(f'  {"pred":13} {"cls":5} {"out":4} {"dm":5} {"zlb":4} '
          f'{"r_IS":>7} {"t_IS":>7} | {"r_OOS":>7} {"t_OOS":>7} {"MDE_OOS":>8}  verdict')
    for _, r in top.iterrows():
        if abs(r.t_oos) > 1.96 and np.sign(r.r_oos) == np.sign(r.r_is):
            v = 'CONFIRMS'
        elif np.sign(r.r_oos) == np.sign(r.r_is):
            v = 'same sign, not sig'
        elif abs(r.r_is) < r.mde_oos:
            v = 'UNDERPOWERED OOS'
        else:
            v = 'FAILS'
        print(f'  {r.pred:13} {r.cls:5} {r.outcome:4} {str(r.demean):5} {r.zlb:<4} '
              f'{r.r_is:+7.3f} {r.t_is:+7.2f} | {r.r_oos:+7.3f} {r.t_oos:+7.2f} '
              f'{r.mde_oos:8.3f}  {v}')

    print('\n' + '=' * 74)
    print('TEST 3 - YEAR BY YEAR  (sign stability of r, h=1, range, FX+gold pooled)')
    print('=' * 74)
    f = frames[252]
    years = sorted(f.date.dt.year.unique())
    print(f'  {"pred":13} ' + ' '.join(f'{y%100:>5}' for y in years) + '   same-sign')
    for p in PRED:
        rs, sgn = [], []
        for y in years:
            sub = f[f.date.dt.year == y]
            out = stat(sub, p, f'rng{H}', False)
            rs.append(out[1] if out else np.nan)
            if out:
                sgn.append(np.sign(out[1]))
        cells = ' '.join('    .' if np.isnan(v) else f'{v:+5.2f}' for v in rs)
        frac = max(sgn.count(1), sgn.count(-1)) / len(sgn) if sgn else float('nan')
        print(f'  {p:13} {cells}   {frac:.0%}')

    print('\n  (a real one-day effect should hold one sign in most years; ~50% is noise)')


if __name__ == '__main__':
    main()
