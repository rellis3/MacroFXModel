"""rules-book-backtest (EXPLORATORY; in-sample by construction).

The three direction rules the Evidence Book validates on our instruments, run as one costed, volatility-sized book:

  S1 post-FOMC USD   `post-fomc-usd-drift`  long a 7-pair USD basket 14:30 ET on each scheduled FOMC day, out at
                     14:00 ET five weekdays later. Per-trade net returns (spread + slip both ends) are taken as
                     computed by analysis/fomc_event_study/post_fomc_hold_harness.py (post_fomc_hold_trades.csv).
  S2 VIX beta        `vix-beta-change`      the C.OG dR/dt flag (B_change bottom decile, rolling 252-day
                     percentile) at close t -> long NQ at close t+1, out 5 sessions later.
  S3 VVIX/VXN        `vix-second-derivative` 5-session change of log(VVIX/VXN) in its top decile at close t ->
                     long NQ at close t+1, out 20 sessions later.

The flags come from the banked studies' own panels (analysis/output/vix-nasdaq-beta/panel.parquet,
analysis/output/vix-calculus/panel_daily.parquet), so the rules are exactly the ones that were validated.
One position per sleeve: a flag while the sleeve is already in a trade is ignored.

Sizing: every trade risks the same 1% of capital per expected 1-sigma move over its hold:
  weight = 1% / (sigma_daily * sqrt(hold)), sigma_daily = EWMA (centre of mass 20) of daily log returns, known at entry.
Costs: S1 as in the harness. NQ: 1 index point round trip, plus carry on the notional: futures-style
(3-month T-bill minus a 0.8% dividend yield, per day held) and, as a sensitivity, CFD-style (T-bill + 2.5%).
S1 financing on the 7 legs isn't modelled (the harness reports it as a breakeven).

Placebo: each sleeve re-run 1,000 times with the same number of trades and the same hold at random entry dates
(S1 from the FOMC study's 5-day non-FOMC baseline windows, baseline_r5.csv). The book's Sharpe is compared against the
book built from those random trades.

IN-SAMPLE WARNING: each rule was selected on this same history, so this backtest overstates what they'd do forward.
It shows how the rules combine, how often they trade, what costs and sizing do, and how far above random they sit.
"""
import json
import math
import os

import numpy as np
import pandas as pd

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'analysis', 'output', 'rules-book-backtest')
SEED = 20261026
END = '2026-08-21'
START_BOOK = '2016-01-01'
RISK = 0.01
N_PLACEBO = 1000


def load():
    p = pd.read_parquet(os.path.join(ROOT, 'analysis/output/vix-nasdaq-beta/panel.parquet'))
    q = pd.read_parquet(os.path.join(ROOT, 'analysis/output/vix-calculus/panel_daily.parquet'))
    ndx = p['NDX'].astype(float)
    ndx.index = pd.to_datetime(ndx.index)
    ndx = ndx[ndx.index <= END]
    flags = pd.DataFrame({'S2': p['B_change_lo'], 'S3': q['dRimp_hi']}).reindex(ndx.index)
    split = p['split'].reindex(ndx.index)
    fomc = pd.read_csv(os.path.join(ROOT, 'analysis/fomc_event_study/post_fomc_hold_trades.csv'), parse_dates=['date'])
    base = pd.read_csv(os.path.join(ROOT, 'analysis/fomc_event_study/baseline_r5.csv'), parse_dates=['date'])
    fx = pd.read_csv(os.path.join(ROOT, 'education/residual_pca_currency_test/data/daily_closes.csv'),
                     parse_dates=['date']).set_index('date')
    r = np.log(fx).diff()
    usd = pd.concat([-r[c] if c.endswith('usd') else r[c] for c in r.columns], axis=1).mean(axis=1)
    tb = pd.read_csv(os.path.join(ROOT, 'analysis/output/yield-predictive-ladder/raw/DGS3MO.csv'),
                     parse_dates=['observation_date'], na_values='.').set_index('observation_date')['DGS3MO']
    tb = (tb / 100).reindex(ndx.index, method='ffill')
    return ndx, flags, split, fomc, base, usd, tb


def ewma_sigma(ret):
    return np.sqrt((ret ** 2).ewm(com=20, min_periods=20).mean())


def nq_trades(ndx, flag, hold, sig, tb, carry_extra):
    """Non-overlapping NQ trades from a 0/1 flag series. Returns a trade list with daily P&L paths."""
    idx = ndx.index
    trades = []
    i = 0
    f = flag.fillna(0).values
    while i < len(idx) - hold - 1:
        if f[i] == 1:
            e, x = i + 1, i + 1 + hold
            px = ndx.values[e:x + 1]
            daily = np.diff(np.log(px))
            carry = (tb.values[e:x] - 0.008 + carry_extra) / 252
            gross = float(daily.sum())
            cost = 1.0 / px[0] + float(np.nansum(carry))
            w = RISK / (sig.values[i] * math.sqrt(hold))
            pnl = w * (daily - np.nan_to_num(carry))
            pnl[0] -= w * (1.0 / px[0])
            trades.append(dict(signal=idx[i], entry=idx[e], exit=idx[x], gross=gross, net=gross - cost, w=float(w),
                               path=pd.Series(pnl, index=idx[e + 1:x + 1])))
            i = x  # flat after exit
        else:
            i += 1
    return trades


def fomc_trades(fomc, usd_sig, usd):
    """The harness gives only the trade's endpoints (14:30 ET D -> 14:00 ET D+5). For a realistic daily path, use the
    USD basket's daily close-to-close moves over D+1..D+5, shifted so they sum to the trade's actual net return."""
    trades = []
    for r in fomc.itertuples():
        s = usd_sig.asof(r.date - pd.Timedelta(days=1))
        w = RISK / (s * math.sqrt(5))
        days = pd.bdate_range(r.date + pd.Timedelta(days=1), periods=5)
        u = usd.reindex(days).fillna(0.0).values
        path = pd.Series(w * (u + (r.net - u.sum()) / 5), index=days)
        trades.append(dict(signal=r.date, entry=r.date, exit=days[-1], gross=r.gross, net=r.net, w=float(w), path=path))
    return trades


def book_series(trades, index):
    s = pd.Series(0.0, index=index)
    for t in trades:
        p = t['path'].reindex(index).fillna(0.0)
        s = s.add(p, fill_value=0.0)
    return s


def stats(daily, label=''):
    d = daily.dropna()
    if d.abs().sum() == 0:
        return {}
    ann = d.mean() * 252
    vol = d.std(ddof=1) * math.sqrt(252)
    eq = d.cumsum()
    dd = float((eq - eq.cummax()).min())
    return dict(ann_return=float(ann), ann_vol=float(vol), sharpe=float(ann / vol), max_dd=dd,
                years=float(len(d) / 252), t=float(ann / vol * math.sqrt(len(d) / 252)))


def trade_stats(trades):
    if not trades:
        return dict(n=0)
    net = np.array([t['net'] for t in trades])
    rr = np.array([t['net'] * t['w'] / RISK for t in trades])  # in units of the 1% risk budget ("R")
    return dict(n=len(trades), hit=float((net > 0).mean()), mean_net_bp=float(net.mean() * 1e4),
                median_net_bp=float(np.median(net) * 1e4), mean_R=float(rr.mean()),
                se_R=float(rr.std(ddof=1) / math.sqrt(len(rr))) if len(rr) > 1 else None)


def random_nq(ndx, n, hold, sig, tb, carry_extra, rng, lo, hi):
    pos = np.where((ndx.index >= lo) & (ndx.index <= hi))[0]
    pos = pos[(pos > 20) & (pos < len(ndx) - hold - 2)]
    picks = rng.choice(pos, size=n, replace=False)
    flag = pd.Series(0, index=ndx.index)
    flag.iloc[picks] = 1
    return nq_trades(ndx, flag, hold, sig, tb, carry_extra)


def main():
    os.makedirs(OUT, exist_ok=True)
    rng = np.random.default_rng(SEED)
    ndx, flags, split, fomc, base, usd, tb = load()
    sig_nq = ewma_sigma(np.log(ndx).diff())
    usd_sig = np.sqrt((usd ** 2).ewm(com=20, min_periods=10).mean()).dropna()  # FX history starts 2016-01-04; the first FOMC is 01-27
    res = dict(study='rules-book-backtest', status='EXPLORATORY, in-sample by construction', seed=SEED, end=END,
               risk_per_trade=RISK)
    out = {}
    for carry_name, extra in [('futures_carry', 0.0), ('cfd_carry', 0.025 + 0.008)]:
        S1 = fomc_trades(fomc, usd_sig, usd)
        S2 = nq_trades(ndx, flags['S2'], 5, sig_nq, tb, extra)
        S3 = nq_trades(ndx, flags['S3'], 20, sig_nq, tb, extra)
        idx = pd.bdate_range('2010-01-01', END)
        sleeves = {'S1_post_fomc_usd': S1, 'S2_vix_beta_nq': S2, 'S3_vvix_vxn_nq': S3}
        daily = {k: book_series(v, idx) for k, v in sleeves.items()}
        book = sum(daily.values())
        o = dict(sleeves={}, book={})
        for k, v in sleeves.items():
            v16 = [t for t in v if t['entry'] >= pd.Timestamp(START_BOOK)]
            o['sleeves'][k] = dict(all=trade_stats(v), since_2016=trade_stats(v16),
                                   daily_since_2016=stats(daily[k][START_BOOK:]),
                                   exposure_since_2016=float((daily[k][START_BOOK:] != 0).mean()))
        o['book']['since_2016'] = stats(book[START_BOOK:])
        o['book']['by_year'] = {str(y): float(g.sum()) for y, g in book[START_BOOK:].groupby(book[START_BOOK:].index.year)}
        o['book']['corr'] = pd.DataFrame({k: v[START_BOOK:] for k, v in daily.items()}).corr().round(3).to_dict()
        # the least in-sample stretch for the VIX rules: their 'test' split
        test_days = split[split == 'test'].index
        if len(test_days):
            lo = test_days.min()
            o['book']['vix_test_split_from'] = str(lo.date())
            o['book']['since_test_split'] = stats(book[lo:])
            o['sleeves']['S2_vix_beta_nq']['test_split'] = trade_stats([t for t in S2 if t['entry'] >= lo])
            o['sleeves']['S3_vvix_vxn_nq']['test_split'] = trade_stats([t for t in S3 if t['entry'] >= lo])
        out[carry_name] = o
        if carry_name == 'futures_carry':
            # placebo: random-entry books with the same trade counts and holds
            n2 = len([t for t in S2 if t['entry'] >= pd.Timestamp(START_BOOK)])
            n3 = len([t for t in S3 if t['entry'] >= pd.Timestamp(START_BOOK)])
            bsel = base[base.date >= START_BOOK].reset_index(drop=True)
            cost = float(fomc.cost.mean())
            sh = {'book': [], 'S1': [], 'S2': [], 'S3': []}
            for _ in range(N_PLACEBO):
                pb = bsel.iloc[rng.choice(len(bsel), size=len(fomc), replace=False)]
                fake = pd.DataFrame({'date': pb.date.values, 'gross': pb.r5.values, 'net': pb.r5.values - cost})
                r1 = book_series(fomc_trades(fake, usd_sig, usd), idx)[START_BOOK:]
                r2 = book_series(random_nq(ndx, n2, 5, sig_nq, tb, 0.0, rng, START_BOOK, END), idx)[START_BOOK:]
                r3 = book_series(random_nq(ndx, n3, 20, sig_nq, tb, 0.0, rng, START_BOOK, END), idx)[START_BOOK:]
                for k, s in [('S1', r1), ('S2', r2), ('S3', r3), ('book', r1 + r2 + r3)]:
                    st = stats(s); sh[k].append(st.get('sharpe', np.nan))
            real = {'book': o['book']['since_2016']['sharpe'],
                    'S1': o['sleeves']['S1_post_fomc_usd']['daily_since_2016']['sharpe'],
                    'S2': o['sleeves']['S2_vix_beta_nq']['daily_since_2016']['sharpe'],
                    'S3': o['sleeves']['S3_vvix_vxn_nq']['daily_since_2016']['sharpe']}
            res['placebo'] = {k: dict(real=real[k], random_mean=float(np.nanmean(v)), random_p95=float(np.nanpercentile(v, 95)),
                                      pct=float(np.nanmean(np.array(v) < real[k]))) for k, v in sh.items()}
            pd.DataFrame([{k: t[k] for k in ('signal', 'entry', 'exit', 'gross', 'net', 'w')} | {'sleeve': s}
                          for s, v in sleeves.items() for t in v]).to_csv(os.path.join(OUT, 'trades.csv'), index=False)
            book[START_BOOK:].cumsum().to_csv(os.path.join(OUT, 'equity_futures_carry.csv'), header=['equity'])
    res.update(out)
    json.dump(res, open(os.path.join(OUT, 'results.json'), 'w'), indent=1, default=float)
    print(json.dumps(res, indent=1, default=float)[:6000])


if __name__ == '__main__':
    main()
