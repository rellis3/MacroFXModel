"""
measure.py — Phase 0 lens for the Volatility-Exhaustion study.

ONE falsifiable question, measured directly (no trade logic, no borrowed theory):

    When price is X units of expected daily volatility away from the London open,
    what happens next — does it REVERT toward the open, or CONTINUE further?
    And does the answer sharpen with distance / time-of-day / arrival-speed / news?

Method — a symmetric two-barrier race (descriptive, not a strategy):
  * anchor = London-midnight open O; scale = causal Yang-Zhang sigma (matches the
    live forecaster, proven by compare_sigma.py).
  * at a sampled minute, signed distance  d = (price - O)/O / sigma   [sigma-units].
  * place two barriers at the current price, +/- THETA*sigma in PRICE:
        reversal  barrier = toward the open
        continuation barrier = away from the open
  * whichever is hit first within H minutes (same session) labels the state.
  * For a driftless random walk the null is P(reversal) = 0.5 at every distance
    (optional-stopping). So the pre-registered read is simple:
        P(reversal) RISES with distance      -> real, volatility-scaled exhaustion
        P(reversal) flat ~0.5 everywhere     -> null; exhaustion is folklore here
    A result only counts if it holds on BOTH halves of the sample (IS and OOS).

Outputs: charts/*.png + summary.json. Pure measurement; verdicts printed plainly.
"""
import os, sys, json
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from vol_exhaustion_lib import load_m1, build_london_daily, causal_sigma, london_parts

HERE = os.path.dirname(os.path.abspath(__file__))
CH = os.path.join(HERE, 'charts')
os.makedirs(CH, exist_ok=True)

# ── knobs (pre-registered, not tuned to a result) ─────────────────────────────
THETA = 0.25          # barrier half-width, sigma-units
H = 60                # forward horizon, minutes
STEP = 15             # sample a state every STEP minutes within a day
SPEED_WIN = 30        # minutes over which "arrival speed" is measured
MIN_BARS = 60         # a day needs at least this many M1 bars to be measured
DIST_EDGES = np.array([0, .25, .5, .75, 1., 1.25, 1.5, 2., 2.5, 3., 5.])

plt.rcParams.update({'figure.dpi': 110, 'font.size': 10, 'axes.grid': True,
                     'grid.alpha': .25, 'axes.axisbelow': True})


# ── news: per-London-date flag = any Major event for the instrument's ccys ─────
def news_days(ccys):
    import csv
    flagged = set()
    path = os.path.join(HERE, '..', 'calendar_events.csv')
    with open(path, newline='', encoding='latin-1') as f:
        for row in csv.DictReader(f):
            if row.get('impact') == 'Major' and row.get('ccy') in ccys:
                flagged.add(row.get('date'))       # 'YYYY-MM-DD'
    return flagged


def _london_date_str(day_idx):
    # day_idx = days since epoch -> ISO date
    import datetime as d
    return (d.date(1970, 1, 1) + d.timedelta(days=int(day_idx))).isoformat()


# ── the measurement ───────────────────────────────────────────────────────────
def measure(path, pair, ccys):
    print(f'\n=== {pair} : loading {os.path.basename(path)} ===')
    m1 = load_m1(path)
    daily = build_london_daily(m1)
    sig = causal_sigma(daily)                     # sigma_pred[i] = yz[i-1]
    _, mod_all = london_parts(m1['utc_min'])      # london minute-of-day per M1 bar
    nd = daily['open'].size
    print(f'  {m1["open"].size:,} M1 bars -> {nd} London days, '
          f'{_london_date_str(daily["day_idx"][0])} .. {_london_date_str(daily["day_idx"][-1])}')
    news = news_days(ccys)

    # split IS / OOS at the middle day (time-ordered)
    split = nd // 2

    # accumulators for states
    S = dict(dist=[], rev=[], hour=[], speed=[], is_news=[], seg=[])
    ext_max = []                                  # per-day max |d| reached (extension distribution)
    # keep a few example days for markups
    examples = []

    for i in range(nd):
        s = sig[i]
        if not (s > 0):
            continue
        a, b = daily['start'][i], daily['end'][i]
        if b - a < MIN_BARS:
            continue
        O = daily['open'][i]
        if not (O > 0):
            continue
        c = m1['close'][a:b]; hi = m1['high'][a:b]; lo = m1['low'][a:b]
        mod = mod_all[a:b]                         # london minute-of-day
        n = c.size
        d = (c - O) / O / s                        # signed distance path, sigma-units
        ext_max.append(float(np.max(np.abs(d))))
        seg = 0 if i < split else 1
        dstr = _london_date_str(daily['day_idx'][i])
        is_news = 1 if dstr in news else 0
        thr_px = THETA * s * O                     # barrier half-width in price

        for j in range(SPEED_WIN, n - 2, STEP):
            dj = d[j]
            if abs(dj) < 1e-9:
                continue
            up = dj > 0
            rev_px = c[j] - (thr_px if up else -thr_px)   # toward open
            con_px = c[j] + (thr_px if up else -thr_px)   # away from open
            e = min(n, j + 1 + H)
            fh = hi[j + 1:e]; fl = lo[j + 1:e]
            if fh.size == 0:
                continue
            if up:
                rev_hits = fl <= rev_px; con_hits = fh >= con_px
            else:
                rev_hits = fh >= rev_px; con_hits = fl <= con_px
            r_any, c_any = rev_hits.any(), con_hits.any()
            if not r_any and not c_any:
                continue                                  # timeout -> no decision
            r_idx = np.argmax(rev_hits) if r_any else 1 << 30
            c_idx = np.argmax(con_hits) if c_any else 1 << 30
            if r_idx == c_idx:
                continue                                  # same-bar ambiguity -> drop
            label = 1 if r_idx < c_idx else 0             # 1 = reverted first
            speed = dj - d[j - SPEED_WIN]                 # signed change over the window
            S['dist'].append(abs(dj)); S['rev'].append(label)
            S['hour'].append(int(mod[j] // 60)); S['speed'].append(abs(speed))
            S['is_news'].append(is_news); S['seg'].append(seg)

        if len(examples) < 6 and 0.9 < ext_max[-1] < 3.0 and n > 300:
            examples.append(dict(date=dstr, O=float(O), sig=float(s),
                                 c=c.copy(), hi=hi.copy(), lo=lo.copy(), mod=mod.copy()))

    for k in S:
        S[k] = np.array(S[k])
    print(f'  measured states: {S["rev"].size:,}  (mean reversal rate '
          f'{S["rev"].mean():.3f})')
    return dict(pair=pair, S=S, ext_max=np.array(ext_max), examples=examples,
                split_date=_london_date_str(daily['day_idx'][split]))


# ── binned reversal rate with Wilson-ish SE ───────────────────────────────────
def binned(dist, rev, edges=DIST_EDGES):
    idx = np.digitize(dist, edges) - 1
    xs, ys, es, ns = [], [], [], []
    for k in range(len(edges) - 1):
        m = idx == k
        nk = int(m.sum())
        if nk < 40:
            continue
        p = rev[m].mean()
        xs.append((edges[k] + edges[k + 1]) / 2)
        ys.append(p); es.append(np.sqrt(p * (1 - p) / nk)); ns.append(nk)
    return np.array(xs), np.array(ys), np.array(es), np.array(ns)


def chart_distance(res):
    S = res['S']
    fig, ax = plt.subplots(figsize=(8.4, 5.2))
    for seg, lab, col in [(0, f'in-sample (<= {res["split_date"]})', '#1f77b4'),
                          (1, f'out-of-sample (> {res["split_date"]})', '#d62728')]:
        m = S['seg'] == seg
        x, y, e, n = binned(S['dist'][m], S['rev'][m])
        ax.errorbar(x, y, yerr=e, marker='o', capsize=3, color=col, label=lab)
    ax.axhline(.5, ls='--', color='#555', lw=1, label='null (driftless) = 0.50')
    ax.set_xlabel('distance from London open  (units of expected daily $\\sigma$)')
    ax.set_ylabel(f'P(revert toward open before continuing)  |  ±{THETA}$\\sigma$, {H}min')
    ax.set_title(f'{res["pair"]}  —  does reversal probability rise with volatility-scaled distance?')
    ax.set_ylim(.35, .8); ax.legend(loc='upper left', fontsize=8.5)
    fig.tight_layout(); p = os.path.join(CH, f'{res["pair"]}_1_hazard_vs_distance.png')
    fig.savefig(p); plt.close(fig); return p


def chart_heatmap(res):
    S = res['S']
    dedges = np.array([0, .5, 1., 1.5, 2., 3.])
    hedges = np.arange(0, 25, 2)
    di = np.digitize(S['dist'], dedges) - 1
    hi = np.digitize(S['hour'], hedges) - 1
    G = np.full((len(dedges) - 1, len(hedges) - 1), np.nan)
    N = np.zeros_like(G)
    for a in range(G.shape[0]):
        for b in range(G.shape[1]):
            m = (di == a) & (hi == b)
            if m.sum() >= 40:
                G[a, b] = S['rev'][m].mean(); N[a, b] = m.sum()
    fig, ax = plt.subplots(figsize=(9, 4.8))
    im = ax.imshow(G, aspect='auto', origin='lower', cmap='RdYlGn',
                   vmin=.4, vmax=.7)
    ax.set_xticks(range(len(hedges) - 1))
    ax.set_xticklabels([f'{hedges[b]:02d}' for b in range(len(hedges) - 1)])
    ax.set_yticks(range(len(dedges) - 1))
    ax.set_yticklabels([f'{dedges[a]:.1f}-{dedges[a+1]:.1f}' for a in range(len(dedges) - 1)])
    ax.set_xlabel('London hour of day'); ax.set_ylabel('distance from open ($\\sigma$)')
    ax.set_title(f'{res["pair"]}  —  reversal probability  by  distance × time-of-day')
    for a in range(G.shape[0]):
        for b in range(G.shape[1]):
            if not np.isnan(G[a, b]):
                ax.text(b, a, f'{G[a,b]:.2f}', ha='center', va='center', fontsize=7)
    fig.colorbar(im, ax=ax, label='P(revert)')
    fig.tight_layout(); p = os.path.join(CH, f'{res["pair"]}_2_hazard_heatmap.png')
    fig.savefig(p); plt.close(fig); return p


def chart_split(res, key, labels, title, fname):
    S = res['S']
    fig, ax = plt.subplots(figsize=(8.4, 5.2))
    for val, lab, col in labels:
        m = S[key] == val
        if m.sum() < 100:
            continue
        x, y, e, n = binned(S['dist'][m], S['rev'][m])
        ax.errorbar(x, y, yerr=e, marker='o', capsize=3, label=f'{lab} (n={int(m.sum()):,})', color=col)
    ax.axhline(.5, ls='--', color='#555', lw=1)
    ax.set_xlabel('distance from open ($\\sigma$)'); ax.set_ylabel('P(revert)')
    ax.set_title(f'{res["pair"]}  —  {title}'); ax.set_ylim(.35, .8); ax.legend(fontsize=8.5)
    fig.tight_layout(); p = os.path.join(CH, f'{res["pair"]}_{fname}.png')
    fig.savefig(p); plt.close(fig); return p


def chart_extension(res):
    e = res['ext_max']
    fig, ax = plt.subplots(figsize=(8.4, 4.8))
    ax.hist(e, bins=60, range=(0, 6), color='#4c72b0', alpha=.85)
    med = np.median(e); p75 = np.percentile(e, 75)
    ax.axvline(med, color='#d62728', lw=2, label=f'median = {med:.2f}$\\sigma$')
    ax.axvline(p75, color='#e08214', lw=2, ls='--', label=f'75th = {p75:.2f}$\\sigma$')
    ax.axvline(1.572, color='#555', lw=1.5, ls=':', label='Feller HL median = 1.572$\\sigma$')
    ax.set_xlabel('daily maximum distance from open ($\\sigma$)')
    ax.set_ylabel('days'); ax.set_title(f'{res["pair"]}  —  how far price actually travels per day (extension)')
    ax.legend(); fig.tight_layout()
    p = os.path.join(CH, f'{res["pair"]}_5_extension_distribution.png')
    fig.savefig(p); plt.close(fig); return p


def _zigzag(c, thr):
    """minimal pivots: a swing that reversed by >= thr (price units). returns idx list."""
    piv = []
    last_i = 0; last_p = c[0]; direction = 0
    hi_i, hi_p, lo_i, lo_p = 0, c[0], 0, c[0]
    for i in range(1, c.size):
        if c[i] > hi_p: hi_p, hi_i = c[i], i
        if c[i] < lo_p: lo_p, lo_i = c[i], i
        if direction >= 0 and hi_p - c[i] >= thr:
            piv.append(hi_i); direction = -1; lo_p, lo_i = c[i], i
        elif direction <= 0 and c[i] - lo_p >= thr:
            piv.append(lo_i); direction = 1; hi_p, hi_i = c[i], i
    return piv


def chart_markups(res):
    ex = res['examples']
    if not ex:
        return None
    fig, axes = plt.subplots(2, 3, figsize=(15, 8))
    for ax, d in zip(axes.flat, ex):
        c = d['c']; O = d['O']; sg = d['sig']
        x = np.arange(c.size)
        ax.plot(x, c, color='#333', lw=.8)
        ax.axhline(O, color='#000', lw=1)
        for k, ls in [(0.5, ':'), (1.0, '--'), (1.5, '-.'), (2.0, '-')]:
            up = O * (1 + k * sg); dn = O * (1 - k * sg)
            ax.axhline(up, color='#d62728', lw=.7, ls=ls, alpha=.7)
            ax.axhline(dn, color='#2ca02c', lw=.7, ls=ls, alpha=.7)
        piv = _zigzag(c, 0.4 * sg * O)
        if piv:
            ax.scatter(piv, c[piv], color='#e08214', s=28, zorder=5)
        ax.set_title(f'{d["date"]}  (1$\\sigma$={sg*100:.2f}%)', fontsize=9)
        ax.set_xlabel('minute of session'); ax.set_ylabel('price')
    fig.suptitle(f'{res["pair"]}  —  real sessions: open (black), ±0.5/1/1.5/2$\\sigma$ bands, '
                 f'reversals (orange)', fontsize=11)
    fig.tight_layout(); p = os.path.join(CH, f'{res["pair"]}_6_day_markups.png')
    fig.savefig(p); plt.close(fig); return p


INSTRUMENTS = {
    'EURUSD': ('portfolioBacktest/cache/eurusd_m1.parquet', {'USD', 'EUR'}),
    'NQ':     ('portfolioBacktest/cache/nq_m1.parquet', {'USD'}),
}


def run(pairs):
    summary = {}
    for pair in pairs:
        rel, ccys = INSTRUMENTS[pair]
        res = measure(os.path.join(HERE, '..', rel), pair, ccys)
        S = res['S']
        chart_distance(res); chart_heatmap(res); chart_extension(res); chart_markups(res)
        # speed & news splits
        sp_med = np.median(S['speed'])
        S['speed_hi'] = (S['speed'] > sp_med).astype(int)
        p3 = chart_split(res, 'speed_hi',
                         [(1, 'fast arrival', '#8c2d04'), (0, 'slow arrival', '#2171b5')],
                         'reversal vs distance — fast vs slow arrival', '3_hazard_by_speed')
        p4 = chart_split(res, 'is_news',
                         [(1, 'Major-news day', '#8c2d04'), (0, 'quiet day', '#2171b5')],
                         'reversal vs distance — news vs quiet', '4_hazard_by_news')
        # headline stats: reversal rate in far buckets, IS vs OOS
        def far_rate(seg):
            m = (S['seg'] == seg) & (S['dist'] >= 1.5)
            return float(S['rev'][m].mean()) if m.sum() >= 40 else None, int(((S['seg']==seg)&(S['dist']>=1.5)).sum())
        is_far, is_n = far_rate(0); oos_far, oos_n = far_rate(1)
        summary[pair] = dict(
            states=int(S['rev'].size), overall_rev=float(S['rev'].mean()),
            split_date=res['split_date'],
            rev_far_ge1p5_IS=is_far, n_far_IS=is_n,
            rev_far_ge1p5_OOS=oos_far, n_far_OOS=oos_n,
            ext_median=float(np.median(res['ext_max'])), ext_p75=float(np.percentile(res['ext_max'], 75)),
        )
        print(f'  [{pair}] far(>=1.5s) reversal  IS={is_far} (n={is_n})  OOS={oos_far} (n={oos_n})')
    with open(os.path.join(HERE, 'summary.json'), 'w') as f:
        json.dump(summary, f, indent=2)
    print('\nsummary.json written.')
    return summary


if __name__ == '__main__':
    pairs = sys.argv[1:] or ['EURUSD']
    run(pairs)
