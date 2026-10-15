"""Controls for P2 of forge/COG_PINNED_HISTORY_CONFIRM_PREREG.md (run AFTER the registered result, labelled exploratory): is the 'line turns while Nasdaq has not yet' excess advance
information, or the same-hour co-movement showing up as a confirmation lag in Nasdaq's own zig-zag?
 C1: baseline matched on Nasdaq's trailing 1 h move in the event's direction (post-stratified in quintiles) -- if the excess is just 'Nasdaq already started turning', it vanishes.
 C2: raw forward Nasdaq PRICE move after every line flip (signed, 1/2/4/8 h) vs hour-matched random bars -- the price-level version, free of the zig-zag's confirmation rule.
Output appended to analysis/output/cog_video_0918/PINNED_HISTORY.md"""
import warnings; warnings.filterwarnings('ignore')
src = open('scripts/rate_diff_nq/cog_pinned_history.py', encoding='utf-8').read().split("# ---------------- lead grid ----------------")[0]
exec(src)                                                     # reuses the data, zigzag, theta_rms, HOLD / AFTER masks, DAY, G, rng ...
HB = {'1h': 4, '2h': 8, '4h': 16, '8h': 32}
def controls(NQ, half, label):
    sL, evL = zigzag(LINE.to_numpy(), theta_rms(LINE), 0.75); sN, evN = zigzag(NQ.to_numpy(), theta_rms(NQ), 0.75); nq = NQ.to_numpy(); n = len(G)
    trail = np.full(n, np.nan); trail[4:] = nq[4:] - nq[:-4]
    out = ['', f'### {label}']
    # ---- C1 ----
    per_cell = {}; days_all = set()
    for d in (1, -1):
        isd = (sN == d); nxt = np.minimum.accumulate(np.where(isd, np.arange(n), n * 10)[::-1])[::-1]
        m = d * trail
        base_idx = np.where(half & np.isfinite(sN) & (sN == -d) & np.isfinite(m))[0]
        edges = np.nanpercentile(m[base_idx], [20, 40, 60, 80]); bk = lambda v: int(np.searchsorted(edges, v))
        for hn, H in HB.items():
            succ = (nxt - np.arange(n)) <= H; ev = {}; bs = {}
            for b in base_idx:
                e = bs.setdefault(DAY.iloc[b], np.zeros((5, 2))); k = bk(m[b]); e[k, 0] += 1; e[k, 1] += succ[b]
            for (tc, te, dr) in evL:
                if dr != d or not half[tc] or not np.isfinite(sN[tc]) or sN[tc] != -d or not np.isfinite(m[tc]): continue
                e = ev.setdefault(DAY.iloc[tc], np.zeros((5, 2))); k = bk(m[tc]); e[k, 0] += 1; e[k, 1] += succ[tc]
            per_cell[(d, hn)] = (ev, bs); days_all |= set(ev) | set(bs)
    days = sorted(days_all)
    def excess(pick):
        diffs = []
        for (ev, bs) in per_cell.values():
            E = np.zeros((5, 2)); B = np.zeros((5, 2))
            for i in pick:
                if days[i] in ev: E += ev[days[i]]
                if days[i] in bs: B += bs[days[i]]
            if E[:, 0].sum() < 1: continue
            rB = np.divide(B[:, 1], B[:, 0], out=np.zeros(5), where=B[:, 0] > 0); expected = (E[:, 0] * rB).sum() / E[:, 0].sum(); diffs.append(E[:, 1].sum() / E[:, 0].sum() - expected)
        return np.mean(diffs) if diffs else np.nan
    est = excess(range(len(days))); bsr = np.array([excess(rng.choice(len(days), len(days))) for _ in range(500)]); bsr = bsr[np.isfinite(bsr)]; se = bsr.std()
    out.append(f'C1 (baseline matched on Nasdaq\'s trailing 1 h move in the event direction, quintiles): pooled excess {est * 100:+.1f} pp, SE {se * 100:.1f}, z {est / se:+.2f} (registered, unmatched: see P2 above).')
    # ---- C2 ----
    rows = []
    for hn, H in HB.items():
        v = np.full(n, np.nan); v[:-H] = nq[H:] - nq[:-H]; valid = half & np.isfinite(v)
        evs = [(tc, dr) for (tc, te, dr) in evL if valid[tc]]
        if len(evs) < 20: continue
        y = np.array([dr * v[tc] for tc, dr in evs]); hrs = HOUR[[tc for tc, _ in evs]]; pools = {h: v[valid & (HOUR == h)] for h in np.unique(hrs)}
        sim = np.array([[dr * rng.choice(pools[h]) for (tc, dr), h in zip(evs, hrs)] for _ in range(300)]).mean(1)
        rows.append((hn, len(evs), y.mean() * 100, (y.mean() - sim.mean()) / (sim.std() + 1e-12)))
    out.append('C2 (mean signed Nasdaq move after any line flip, vs hour-matched random bars): ' + '; '.join(f'{h}: {m:+.3f}% (z {z:+.1f}, n {k})' for h, k, m, z in rows))
    return out
LINES = ['', '## Controls for P2 (exploratory, run after the registered result)'] + controls(NQ_H, HOLD, 'holdout (before 2026-04-13)') + controls(fut, AFTER, 'April-October 2026 (earlier sample)')
open(OUT + 'PINNED_HISTORY.md', 'a', encoding='utf-8').write('\n'.join(LINES)); print('\n'.join(LINES))
