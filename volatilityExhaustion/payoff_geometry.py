"""
payoff_geometry.py — Phase 2: the reward-vs-risk ceiling of fading a fresh extreme.

Everything before this measured HOW OFTEN / HOW FAR price turns. This measures the
only thing that decides tradeability: if you actually tried to fade the turn, how far
does it revert in your favour (MFE) vs how far it first runs against you / overshoots
(MAE) — the tail that killed every prior version.

Causal, one hypothetical trade per day, no lookahead:
  * entry = the FIRST bar where a fresh running extreme reaches >= T*sigma from the
    open (T defaults to 0.65sigma, the empirical fade zone from forecast_vs_fade).
    Fade back toward the open (sell an up-extreme, buy a down-extreme).
  * forward to session close, in sigma-units:
      MFE = max favourable excursion (toward open)   -> the reward you could capture
      MAE = max adverse excursion (further from open) -> the risk you must survive
  * expectancy grid over (target G, stop S) via first-passage (which barrier hits
    first), after an approximate round-trip cost, IS/OOS. Best OOS cell reported.

Pre-registered: if median MFE does not clearly exceed median MAE, and no (G,S) cell
clears cost out-of-sample, the fade has no tradeable ceiling — stop honestly.
Cost is approximate (sigma-units); a positive result gets a precise-cost refit, a
negative one needs none.
"""
import os, sys, json
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from vol_exhaustion_lib import load_m1, build_london_daily, causal_sigma
from measure import INSTRUMENTS, HERE, CH, _london_date_str

T_ENTRY = 0.65          # fresh-extreme distance from open that triggers the fade (sigma)
COST_SIG = 0.02         # approx round-trip cost in sigma-units (~1.2 pips at ~60 pip/sigma)
G_GRID = [0.25, 0.5, 0.75, 1.0]
S_GRID = [0.25, 0.5, 0.75, 1.0, 1.5]
plt.rcParams.update({'figure.dpi': 110, 'font.size': 10, 'axes.grid': True, 'grid.alpha': .25})


def _day_trade(c, hi, lo, O, s, T):
    """Return (mfe_sig, mae_sig, up_extreme, entry_idx, path_slice) for the day's fade, or None."""
    n = c.size
    run_hi, run_lo = c[0], c[0]
    for j in range(1, n - 2):
        if c[j] > run_hi: run_hi = c[j]
        if c[j] < run_lo: run_lo = c[j]
        up_ext = (run_hi - O) >= (O - run_lo)
        dist = (run_hi - O if up_ext else O - run_lo) / O / s
        if dist >= T:
            entry = c[j]
            fh = hi[j + 1:]; fl = lo[j + 1:]
            if fh.size == 0:
                return None
            if up_ext:                                    # fade = sell; favourable = down
                mfe = (entry - fl.min()) / O / s
                mae = (fh.max() - entry) / O / s
            else:                                          # fade = buy; favourable = up
                mfe = (fh.max() - entry) / O / s
                mae = (entry - fl.min()) / O / s
            return mfe, mae, up_ext, j, (entry, fh, fl)
    return None


def _first_passage(entry, fh, fl, up_ext, O, s, G, S):
    """+G on target-first, -S on stop-first, else mark-to-close (favourable = positive)."""
    tgt = entry - G * s * O if up_ext else entry + G * s * O
    stp = entry + S * s * O if up_ext else entry - S * s * O
    if up_ext:
        t_hits = fl <= tgt; s_hits = fh >= stp
    else:
        t_hits = fh >= tgt; s_hits = fl <= stp
    ti = np.argmax(t_hits) if t_hits.any() else 1 << 30
    si = np.argmax(s_hits) if s_hits.any() else 1 << 30
    if ti == (1 << 30) and si == (1 << 30):
        last = fl[-1] if up_ext else fh[-1]               # mark to close (approx via last bar)
        return (entry - last) / O / s if up_ext else (last - entry) / O / s
    if ti <= si:
        return G
    return -S


def run(pair, T=T_ENTRY):
    rel, _ = INSTRUMENTS[pair]
    m1 = load_m1(os.path.join(HERE, '..', rel))
    daily = build_london_daily(m1)
    sig = causal_sigma(daily)
    nd = daily['open'].size
    split = nd // 2
    mfe, mae, seg, trades = [], [], [], []
    for i in range(nd):
        s = sig[i]
        if not (s > 0):
            continue
        a, b = daily['start'][i], daily['end'][i]
        if b - a < 60:
            continue
        O = daily['open'][i]
        if not (O > 0):
            continue
        c = m1['close'][a:b]; hi = m1['high'][a:b]; lo = m1['low'][a:b]
        r = _day_trade(c, hi, lo, O, s, T)
        if r is None:
            continue
        m_f, m_a, up_ext, j, path = r
        sv = 0 if i < split else 1
        mfe.append(m_f); mae.append(m_a); seg.append(sv)
        trades.append((path, up_ext, O, s, sv))
    mfe, mae, seg = np.array(mfe), np.array(mae), np.array(seg)

    # expectancy grid (first-passage, after cost), IS/OOS
    def grid(seg_val):
        best = None
        rows = np.zeros((len(G_GRID), len(S_GRID)))
        for gi, G in enumerate(G_GRID):
            for si, S in enumerate(S_GRID):
                pnl = [_first_passage(*path, up_ext, O, s, G, S) - COST_SIG
                       for (path, up_ext, O, s, sv) in trades if sv == seg_val]
                exp = float(np.mean(pnl)) if pnl else float('nan')
                rows[gi, si] = exp
                if best is None or exp > best['exp']:
                    best = dict(G=G, S=S, exp=exp, n=len(pnl))
        return rows, best

    is_grid, is_best = grid(0)
    oos_grid, oos_best = grid(1)
    out = dict(
        pair=pair, T=T, n=int(mfe.size), split_date=_london_date_str(daily['day_idx'][split]),
        mfe_med=float(np.median(mfe)), mae_med=float(np.median(mae)),
        reward_risk=float(np.median(mfe) / np.median(mae)) if np.median(mae) > 0 else None,
        # does the IS-best cell still pay OOS? (the honest, no-peeking read)
        is_best=is_best,
        oos_at_is_best=float(oos_grid[G_GRID.index(is_best['G']), S_GRID.index(is_best['S'])]),
        oos_best=oos_best, cost_sig=COST_SIG,
    )
    _charts(pair, mfe, mae, oos_grid, out)
    return out


def _charts(pair, mfe, mae, oos_grid, out):
    fig, ax = plt.subplots(1, 2, figsize=(13, 5))
    ax[0].hist(mfe[mfe < 3], bins=50, alpha=.6, color='#2ca02c', label=f'MFE (reward) med={out["mfe_med"]:.2f}σ')
    ax[0].hist(mae[mae < 3], bins=50, alpha=.6, color='#d62728', label=f'MAE (risk) med={out["mae_med"]:.2f}σ')
    ax[0].set_xlabel('excursion after fade entry (σ)'); ax[0].set_ylabel('days')
    ax[0].set_title(f'{pair}  —  reward (MFE) vs risk (MAE) from a fresh {out["T"]}σ fade')
    ax[0].legend()
    im = ax[1].imshow(oos_grid, origin='lower', aspect='auto', cmap='RdYlGn',
                      vmin=-0.15, vmax=0.15)
    ax[1].set_xticks(range(len(S_GRID))); ax[1].set_xticklabels([f'{s:.2f}' for s in S_GRID])
    ax[1].set_yticks(range(len(G_GRID))); ax[1].set_yticklabels([f'{g:.2f}' for g in G_GRID])
    ax[1].set_xlabel('stop S (σ)'); ax[1].set_ylabel('target G (σ)')
    ax[1].set_title(f'{pair}  —  OOS expectancy per trade (σ, after cost)')
    for gi in range(len(G_GRID)):
        for si in range(len(S_GRID)):
            ax[1].text(si, gi, f'{oos_grid[gi,si]:+.2f}', ha='center', va='center', fontsize=7)
    fig.colorbar(im, ax=ax[1], label='OOS expectancy (σ)')
    fig.tight_layout(); p = os.path.join(CH, f'{pair}_10_payoff_geometry.png')
    fig.savefig(p); plt.close(fig)


if __name__ == '__main__':
    pairs = sys.argv[1:] or ['EURUSD', 'GBPUSD', 'AUDUSD', 'NZDUSD', 'USDCAD', 'USDCHF', 'NQ']
    res = {}
    print(f'{"pair":7} {"n":>5} {"MFEmed":>7} {"MAEmed":>7} {"R/R":>5}  '
          f'{"IS-best(G/S)":>12} {"exp@OOS":>8}  {"OOS-best":>9}')
    for p in pairs:
        r = run(p); res[p] = r
        ib = r['is_best']
        print(f'{p:7} {r["n"]:>5} {r["mfe_med"]:>7.2f} {r["mae_med"]:>7.2f} '
              f'{(r["reward_risk"] or 0):>5.2f}  {ib["G"]:.2f}/{ib["S"]:.2f}     '
              f'{r["oos_at_is_best"]:>+7.3f}  {r["oos_best"]["exp"]:>+8.3f}')
    with open(os.path.join(HERE, 'payoff_geometry_summary.json'), 'w') as f:
        json.dump(res, f, indent=2)
    print('\npayoff_geometry_summary.json written.  (exp in σ-units per trade, after ~cost)')
