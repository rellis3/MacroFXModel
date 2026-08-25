"""
COSTED CONTINUE-VS-FADE RULE, SWITCHED BY THE CVOL PIN/ACCELERATE SIGNAL.

This is the original question - "how do I know whether to continue or fade?" - wired
to the one external factor in this repo that has survived a placebo and an
out-of-sample split (see cvol_oos.py: rank corr r_IS vs r_OOS +0.73, sign agreement
82% of 140 specs, no shrinkage).

THE MECHANISM. The signal predicts next-day realised range RELATIVE TO WHAT THE
OPTIONS MARKET IMPLIED. That is precisely a pin-vs-accelerate call, so it is used as
the switch and nothing else:

  score > 0  ACCELERATE expected -> FOLLOW the break of the band
  score < 0  PIN expected        -> FADE the touch of the band

Same band, same trigger, same exit. The ONLY thing the signal changes is the sign of
the position. That is deliberate: if the signal carries nothing, follow and fade are
mirror images and the book nets to roughly minus costs. It cannot flatter itself.

THE SCORE uses only the predictors that survived OOS, sign-aligned so positive means
accelerate, equal-weighted after a cross-sectional z across the 7 instruments each
day (the confirmed specification was cross-sectionally demeaned):

    score = z(vrp_trail20) - z(convexity) - z(updn)

`cvol_z` is deliberately EXCLUDED - 60% year-sign-stability is too close to noise.
`skew_ratio` is excluded as algebraically near-identical to `updn` (they returned
the same t to three decimals); including both would double-weight one factor.

THE RULE, per instrument per day, no lookahead anywhere:
  - implied move M from the PRIOR close's CVOL settle
  - band = today's 00:00 open +/- k*M, both known at day start
  - walk the hourly bars; the FIRST band touch triggers
  - both bands touched inside one hour -> the day is SKIPPED (the fill is ambiguous
    and resolving it in our favour is exactly how a backtest lies)
  - exit at the final hourly close of the day. No stop, no target - the point is to
    measure the signal, not to find a good exit
  - return expressed in units of M, so instruments are comparable and sizing is
    implicitly vol-normalised

COSTS are real spreads in price units, charged round-trip, and run at 1x / 2x / 3x
because a result that only survives at 1x is not a result.

SYMMETRY RULE (inherited): every verdict carries its power. A flat OOS with an MDE
above the IS effect size is reported UNDERPOWERED, not dead. And the placebo - the
same rule with the score shuffled - sets the bar in both directions.

  python analysis/cvol_fade_follow.py
  python analysis/cvol_fade_follow.py --k 0.75 --threshold 0.3

---------------------------------------------------------------------------
RESULT - run 2026-08-23. 15,312 trades, 2,655 days, 2016-2026, 7 instruments.

VERDICT: THE RULE FAILS. Decisively, and it is properly powered to say so.

  cost x2, k=0.5, no gate      Sharpe -2.23   PF 0.85
    IS 2016-21 -1.94  ·  OOS 2022-26 -2.64  ·  every calendar year negative
    by mode: follow -0.78  ·  fade -1.92
  MDE Sharpe for this sample size: 0.86. Observed -2.23. Not underpowered -
  this test could comfortably have seen a Sharpe of +0.9 and instead found -2.2.

  SWEEP - 12 cells, k in {0.25, 0.5, 0.75, 1.0} x threshold in {0, 0.5, 1.0}:
  every cell negative, IS and OOS, both modes. Best -1.74, worst -2.23. There is
  no corner of the parameter space where this works.

  GROSS, ZERO COST - the diagnostic that matters:
    k=0.25  follow +0.0001 (Sharpe  0.00)   fade -0.0327 (-0.85)
    k=0.50  follow +0.0012 (Sharpe  0.03)   fade -0.0367 (-1.04)
  Following a band break and holding to the close is EXACTLY a coin flip before
  costs, as an efficient market implies. Fading it is worse than a coin flip -
  consistent with the overshoot this repo already documented at vol lines
  (~36 pips past, MFE 38 / MAE 37, every tested exit negative).

WHY IT FAILS, AND WHY THAT IS NOT A REFUTATION OF THE SIGNAL.
The signal predicts MAGNITUDE - realised range against implied - and that
prediction was confirmed out of sample (cvol_oos.py). This rule needs it to predict
the PROFITABILITY OF A DIRECTIONAL TRADE, which is a different and much harder
quantity. Knowing tomorrow is quiet does not make a fade pay, because "quiet" still
overshoots the band and grinds. The base trade has zero gross edge; a switch placed
on top of two zero-or-negative trades cannot manufacture one, whatever it knows.

WHAT THIS DOES AND DOES NOT CLOSE.
  CLOSED: this directional expression. Properly powered, negative everywhere.
  OPEN:   the signal itself. It was validated on realised-vs-implied range and
          still stands there. The natural expression of a range forecast is a
          VOLATILITY position (straddle/strangle), which cannot be tested here -
          CVOL is an index level, not a tradable quote with a bid/ask. The other
          untested use is as a conditioner or sizing input on a book that ALREADY
          has directional edge, rather than as a standalone direction switch.
---------------------------------------------------------------------------
"""
import argparse, math
from pathlib import Path
import pandas as pd, numpy as np

from cvol_spec_curve import load, features

ROOT = Path(__file__).resolve().parent.parent
IS_END = pd.Timestamp('2021-12-31')

# round-trip spread in PRICE units (retail-institutional FX, gold in dollars)
SPREAD = {'EURUSD': 0.00006, 'GBPUSD': 0.00009, 'USDJPY': 0.007, 'AUDUSD': 0.00007,
          'USDCAD': 0.00010, 'USDCHF': 0.00010, 'XAUUSD': 0.25}


def build_score(df):
    """Cross-sectional z per day, sign-aligned so POSITIVE = accelerate expected."""
    d = df.copy()
    for c in ['vrp_trail20', 'convexity', 'updn']:
        g = d.groupby('date')[c]
        d[f'z_{c}'] = (d[c] - g.transform('mean')) / g.transform('std')
    d['score'] = d.z_vrp_trail20 - d.z_convexity - d.z_updn
    return d


def load_hourly():
    px = pd.read_parquet(ROOT / 'portfolioBacktest/cache/all_pairs_h1.parquet').reset_index()
    px = px.rename(columns={'pair': 'product'})
    px['dt'] = pd.to_datetime(px['datetime']).dt.tz_localize(None)
    px['date'] = px['dt'].dt.normalize()
    return px[px['product'].isin(SPREAD)][['product', 'date', 'dt', 'open', 'high', 'low', 'close']]


def simulate(daily, hourly, k, threshold, cost_mult):
    """One trade per instrument-day at most. Returns a trade frame."""
    sig = daily[['product', 'date', 'score', 'close', 'cvol']].dropna().copy()
    sig['M'] = sig.close * (sig.cvol / 100.0) / math.sqrt(252)
    # the signal formed at the close of day t governs day t+1
    sig = sig.sort_values(['product', 'date'])
    sig['trade_date'] = sig.groupby('product')['date'].shift(-1)
    sig = sig.dropna(subset=['trade_date', 'M'])
    sig = sig[sig.M > 0]

    plan = sig[['product', 'trade_date', 'score', 'M']].rename(columns={'trade_date': 'date'})
    hp = hourly.merge(plan, on=['product', 'date'], how='inner').sort_values(['product', 'date', 'dt'])
    if hp.empty:
        return pd.DataFrame()

    trades = []
    for (prod, date), g in hp.groupby(['product', 'date'], sort=False):
        g = g.sort_values('dt')
        score, M = g.score.iloc[0], g.M.iloc[0]
        if abs(score) < threshold:
            continue
        o = g.open.iloc[0]
        up, dn = o + k * M, o - k * M
        hit_up = g.high >= up
        hit_dn = g.low <= dn
        i_up = hit_up.idxmax() if hit_up.any() else None
        i_dn = hit_dn.idxmax() if hit_dn.any() else None
        if i_up is None and i_dn is None:
            continue
        if i_up is not None and i_dn is not None:
            if g.loc[i_up, 'dt'] == g.loc[i_dn, 'dt']:
                continue                       # ambiguous fill - skip, never resolve favourably
            side_up = g.loc[i_up, 'dt'] < g.loc[i_dn, 'dt']
        else:
            side_up = i_up is not None
        entry = up if side_up else dn
        # FOLLOW the break when acceleration is expected, FADE it when pinning is
        break_dir = 1 if side_up else -1
        direction = break_dir if score > 0 else -break_dir
        exit_px = g.close.iloc[-1]
        gross = direction * (exit_px - entry)
        net = gross - SPREAD[prod] * cost_mult
        trades.append(dict(product=prod, date=date, score=score, M=M,
                           mode='follow' if score > 0 else 'fade',
                           direction=direction, entry=entry, exit=exit_px,
                           r_gross=gross / M, r_net=net / M))
    return pd.DataFrame(trades)


def perf(tr, label):
    if tr.empty or len(tr) < 20:
        return dict(label=label, n=len(tr), sharpe=np.nan, pf=np.nan, mean_r=np.nan, mde=np.nan)
    daily = tr.groupby('date').r_net.mean()          # equal-weight the book each day
    mu, sd = daily.mean(), daily.std(ddof=1)
    sharpe = mu / sd * math.sqrt(252) if sd > 0 else np.nan
    win = tr[tr.r_net > 0].r_net.sum()
    loss = -tr[tr.r_net < 0].r_net.sum()
    mde = 2.80 * sd / math.sqrt(len(daily)) if sd > 0 else np.nan   # detectable mean daily r
    return dict(label=label, n=len(tr), n_days=len(daily), sharpe=sharpe,
                pf=win / loss if loss > 0 else np.nan, mean_r=mu,
                mde=mde, mde_sharpe=mde / sd * math.sqrt(252) if sd > 0 else np.nan)


def show(rows):
    print(f'  {"window":10} {"trades":>7} {"days":>6} {"mean r":>9} {"Sharpe":>8} '
          f'{"PF":>6}   {"MDE Sharpe":>11}')
    for r in rows:
        if np.isnan(r['sharpe']):
            print(f'  {r["label"]:10} {r["n"]:>7}   too few trades')
            continue
        print(f'  {r["label"]:10} {r["n"]:>7} {r["n_days"]:>6} {r["mean_r"]:>+9.4f} '
              f'{r["sharpe"]:>8.2f} {r["pf"]:>6.2f}   {r["mde_sharpe"]:>11.2f}')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--k', type=float, default=0.5, help='band width in implied moves')
    ap.add_argument('--threshold', type=float, default=0.0, help='|score| gate')
    ap.add_argument('--placebos', type=int, default=8)
    a = ap.parse_args()

    df = load()
    daily = build_score(features(df, 252))
    hourly = load_hourly()
    print(f'daily {len(daily)} instrument-days · hourly {len(hourly)} bars · '
          f'k={a.k} threshold={a.threshold}\n')

    for cm in [1, 2, 3]:
        tr = simulate(daily, hourly, a.k, a.threshold, cm)
        if tr.empty:
            print(f'cost x{cm}: no trades')
            continue
        print('=' * 78)
        print(f'COST x{cm}   ({len(tr)} trades, '
              f'{(tr["mode"] == "follow").mean():.0%} follow / '
              f'{(tr["mode"] == "fade").mean():.0%} fade)')
        print('=' * 78)
        rows = [perf(tr, 'ALL'),
                perf(tr[tr.date <= IS_END], 'IS 16-21'),
                perf(tr[tr.date > IS_END], 'OOS 22-26')]
        show(rows)
        print('  by mode:')
        show([perf(tr[tr['mode'] == m], m) for m in ['follow', 'fade']])
        if cm == 2:
            print('  by year:')
            show([perf(g, str(y)) for y, g in tr.groupby(tr.date.dt.year)])

    # ---- placebo: same rule, score shuffled across instrument-days
    print('\n' + '=' * 78)
    print(f'PLACEBO  ({a.placebos} runs, score shuffled - the switch made meaningless)')
    print('=' * 78)
    real = perf(simulate(daily, hourly, a.k, a.threshold, 2), 'real')
    rng = np.random.default_rng(0)
    sh = []
    for _ in range(a.placebos):
        d2 = daily.copy()
        d2['score'] = rng.permutation(d2['score'].values)
        p = perf(simulate(d2, hourly, a.k, a.threshold, 2), 'placebo')
        if not np.isnan(p['sharpe']):
            sh.append(p['sharpe'])
    sh = np.array(sh)
    print(f'  real Sharpe (cost x2)   {real["sharpe"]:+.2f}')
    print(f'  placebo Sharpe          mean {sh.mean():+.2f}  '
          f'[{sh.min():+.2f}, {sh.max():+.2f}]   real beats {(sh < real["sharpe"]).mean():.0%}')
    print(f'  MDE Sharpe for this n   {real["mde_sharpe"]:.2f}   '
          f'<- what this test could detect at 80% power')


if __name__ == '__main__':
    main()
