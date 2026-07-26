"""
median_tag_decision.py — the DECISION table at the median line.

The owner's real question: the forecast lines are good, but trading every line blindly
isn't — at the MEDIAN line, do I FADE (toward open) or FOLLOW (to the 75th)? And does
the range-budget consumed getting there add confidence to that call?

Measured directly, causal, IS/OOS, per pair. Anchor = London open O, scale = causal
Yang-Zhang σ (the forecaster's exact math). Forecast lines (fx constants, matching the
live tool / forecast_vs_fade):
    median H-L excursion  C_MED = 1.289 σ      (the line price tags)
    75th   H-L excursion  C_75  = 1.674 σ      (the continuation target)

Event: first bar where the one-sided excursion from open reaches C_MED·σ (up or down).
That's the median tag. From the NEXT bar, a two-barrier race to session close:
    FOLLOW wins  → price reaches the 75th line (same side)  [+ (C_75−C_MED)=0.385σ]
    FADE  wins   → price returns to the OPEN               [+ C_MED = 1.289σ back]
whichever first. (Same-bar both → ambiguous, dropped.)

So P(follow) = the FOLLOW trade's win rate (target 75th, stop open) and P(fade) =
the FADE trade's win rate (target open, stop 75th). The barriers are ASYMMETRIC by
construction — the 75th is only 0.385σ away, the open is 1.289σ away — so a raw win
rate is misleading; we report EXPECTANCY in σ for each trade, which nets the distance:
    E[fade]   = P(fade)·1.289  − P(follow)·0.385
    E[follow] = P(follow)·0.385 − P(fade)·1.289
Positive = that side has positive raw (pre-cost) edge at the median. An approximate
round-trip cost (σ-units) is subtracted so it isn't free-fill fantasy.

Budget consumed at the tag = realized H-L so far ÷ 75th-line range (C_75·σ). Low =
tagged the median cleanly (little total range used, "lots of budget remaining" — the
owner's continuation hypothesis). Bucketed into terciles; if budget adds confidence,
P(follow) should RISE as budget consumed FALLS, consistently IS & OOS.

Reuses vol_exhaustion_lib (σ/day/anchor). No new vol math, no lookahead.
"""
import os, sys, datetime
import numpy as np
from vol_exhaustion_lib import load_m1, build_london_daily, causal_sigma

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, '..', 'portfolioBacktest', 'cache')
INSTR = {'EURUSD': 'eurusd_m1.parquet', 'GBPUSD': 'gbpusd_m1.parquet', 'AUDUSD': 'audusd_m1.parquet',
         'NZDUSD': 'nzdusd_m1.parquet', 'USDCAD': 'usdcad_m1.parquet', 'USDCHF': 'usdchf_m1.parquet'}
FX = list(INSTR)

C_MED = 1.28904        # fx median H-L line, σ-units (BM_P50·hl_50_corr)
C_75  = 1.674          # fx 75th   H-L line, σ-units (BM_P75·hl_75_corr)
GAIN_FOLLOW = C_75 - C_MED     # 0.385σ reward if follow hits
GAIN_FADE   = C_MED            # 1.289σ reward if fade hits (back to open)
COST_SIGMA  = 0.03             # ≈ round-trip spread in σ-units (majors, rough); subtracted from expectancy
MIN_BARS = 60


def _dstr(di): return (datetime.date(1970, 1, 1) + datetime.timedelta(days=int(di))).isoformat()


def collect(pair):
    m1 = load_m1(os.path.join(CACHE, INSTR[pair]))
    daily = build_london_daily(m1)
    sig = causal_sigma(daily)
    nd = daily['open'].size
    split = nd // 2
    budget, follow, seg, side = [], [], [], []
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
        hi = m1['high'][a:b]; lo = m1['low'][a:b]
        n = hi.size
        up_line, dn_line = O * (1 + C_MED * s), O * (1 - C_MED * s)
        up_75,  dn_75    = O * (1 + C_75 * s),  O * (1 - C_75 * s)
        run_hi, run_lo = hi[0], lo[0]
        tag = -1; is_up = None
        for j in range(n):
            if hi[j] > run_hi: run_hi = hi[j]
            if lo[j] < run_lo: run_lo = lo[j]
            up_hit = hi[j] >= up_line
            dn_hit = lo[j] <= dn_line
            if up_hit or dn_hit:
                tag = j
                # if both on the same bar, take the larger excursion side
                is_up = (run_hi - O) >= (O - run_lo) if (up_hit and dn_hit) else up_hit
                break
        if tag < 0 or tag >= n - 2:
            continue
        # budget consumed at the tag = realized H-L so far ÷ 75th-line range
        bud = (run_hi - run_lo) / (C_75 * s * O)
        # race from next bar to session close
        cont_px = up_75 if is_up else dn_75
        fade_px = O
        res = None
        for k in range(tag + 1, n):
            if is_up:
                cont = hi[k] >= cont_px
                fade = lo[k] <= fade_px
            else:
                cont = lo[k] <= cont_px
                fade = hi[k] >= fade_px
            if cont and fade:
                res = None; break        # ambiguous same bar → drop
            if cont: res = 1; break
            if fade: res = 0; break
        if res is None:
            continue
        budget.append(bud); follow.append(res); seg.append(0 if i < split else 1); side.append('up' if is_up else 'dn')
    return (np.array(budget), np.array(follow), np.array(seg, dtype=int),
            _dstr(daily['day_idx'][split]))


def _stats(follow):
    n = follow.size
    if n == 0:
        return None
    pf = follow.mean()                       # P(follow wins → reaches 75th)
    pd = 1 - pf                               # P(fade wins → back to open)
    e_fade   = pd * GAIN_FADE   - pf * GAIN_FOLLOW - COST_SIGMA
    e_follow = pf * GAIN_FOLLOW - pd * GAIN_FADE   - COST_SIGMA
    return dict(n=n, p_follow=pf, p_fade=pd, e_fade=e_fade, e_follow=e_follow)


def analyse(pair):
    budget, follow, seg, split_date = collect(pair)
    if follow.size < 200:
        return dict(pair=pair, insufficient=True, n=int(follow.size))
    out = dict(pair=pair, split_date=split_date, n=int(follow.size))
    # base rates IS/OOS
    out['base'] = {lab: _stats(follow[seg == sv]) for lab, sv in [('IS', 0), ('OOS', 1)]}
    # by budget tercile (within pair), OOS + IS
    out['byBudget'] = {}
    for lab, sv in [('IS', 0), ('OOS', 1)]:
        bs, fs = budget[seg == sv], follow[seg == sv]
        if bs.size < 90:
            out['byBudget'][lab] = None; continue
        q1, q2 = np.quantile(bs, [1/3, 2/3])
        cells = {}
        for bk, mask in [('lo·clean', bs <= q1), ('mid', (bs > q1) & (bs < q2)), ('hi·choppy', bs >= q2)]:
            cells[bk] = _stats(fs[mask])
        out['byBudget'][lab] = dict(q1=float(q1), q2=float(q2), cells=cells)
    return out


def _fmt(st):
    return f"n={st['n']:5d}  P(follow)={st['p_follow']*100:4.1f}%  E[fade]={st['e_fade']:+.3f}σ  E[follow]={st['e_follow']:+.3f}σ"


def main():
    pairs = sys.argv[1:] or FX
    print(f"\n{'='*82}\nDECISION AT THE MEDIAN LINE — fade (→open) vs follow (→75th)\n"
          f"median={C_MED}σ  75th={C_75}σ  · follow reward {GAIN_FOLLOW:.3f}σ / fade reward {GAIN_FADE:.3f}σ "
          f"· cost {COST_SIGMA}σ\n{'='*82}")
    pooled_b, pooled_f, pooled_s = [], [], []
    results = []
    for pair in pairs:
        r = analyse(pair)
        results.append(r)
        if r.get('insufficient'):
            print(f"\n{pair}: insufficient (n={r['n']})"); continue
        print(f"\n=== {pair}  (n={r['n']}, IS≤{r['split_date']}) ===")
        for lab in ('IS', 'OOS'):
            print(f"  base {lab}: {_fmt(r['base'][lab])}")
        for lab in ('IS', 'OOS'):
            bb = r['byBudget'][lab]
            if not bb: continue
            print(f"  by budget consumed at tag [{lab}]  (lo≤{bb['q1']:.2f} / hi≥{bb['q2']:.2f} of 75th range):")
            for bk in ('lo·clean', 'mid', 'hi·choppy'):
                st = bb['cells'][bk]
                if st: print(f"      {bk:10}: {_fmt(st)}")
        # accumulate pooled
        budget, follow, seg, _ = collect(pair)
        pooled_b.append(budget); pooled_f.append(follow); pooled_s.append(seg)

    # pooled FX
    if pooled_f:
        pb, pf, ps = np.concatenate(pooled_b), np.concatenate(pooled_f), np.concatenate(pooled_s)
        print(f"\n{'='*82}\nPOOLED FX (n={pf.size})\n{'='*82}")
        for lab, sv in [('IS', 0), ('OOS', 1)]:
            print(f"  base {lab}: {_fmt(_stats(pf[ps == sv]))}")
        for lab, sv in [('IS', 0), ('OOS', 1)]:
            bs, fs = pb[ps == sv], pf[ps == sv]
            q1, q2 = np.quantile(bs, [1/3, 2/3])
            print(f"  by budget [{lab}] (lo≤{q1:.2f}/hi≥{q2:.2f}):")
            for bk, mask in [('lo·clean', bs <= q1), ('mid', (bs > q1) & (bs < q2)), ('hi·choppy', bs >= q2)]:
                print(f"      {bk:10}: {_fmt(_stats(fs[mask]))}")
        # verdict on the owner's hypothesis (low budget → more follow), OOS, cross-pair
        print(f"\n  Owner's hypothesis — does LOW budget (clean tag) → MORE follow, OOS?")
        agree = 0; tested = 0
        for r in results:
            if r.get('insufficient') or not r['byBudget'].get('OOS'): continue
            c = r['byBudget']['OOS']['cells']
            if c['lo·clean'] and c['hi·choppy']:
                tested += 1
                d = c['lo·clean']['p_follow'] - c['hi·choppy']['p_follow']
                if d > 0.03: agree += 1
                print(f"    {r['pair']}: P(follow) lo-clean {c['lo·clean']['p_follow']*100:.1f}% vs hi-choppy "
                      f"{c['hi·choppy']['p_follow']*100:.1f}%  (Δ {d*100:+.1f}pp)")
        print(f"    → {agree}/{tested} pairs show low-budget→more-follow (Δ>3pp) OOS")


if __name__ == '__main__':
    main()
