"""COG-COMBINED-READS (descriptive, no pass/fail): at each hour, how many of the line's reads point the same way, and what did Nasdaq do over the next 4 hours?
Reads: (1) structure-event alignment (cog_event_align), (2) match / confirm / entry (cog_match_confirm), (3) 12-hour window analog (cog_analog).
The three scripts' own code is reused (everything above their scoring section), so the reads are exactly the ones already reported.
    python scripts/rate_diff_nq/cog_combined_reads.py     -> analysis/output/cog_video_0918/COMBINED_READS.md
"""
from pathlib import Path
import numpy as np, pandas as pd
ROOT = Path(__file__).resolve().parents[2]; OUT = ROOT / 'analysis' / 'output' / 'cog_video_0918' / 'COMBINED_READS.md'
SD = ROOT / 'scripts' / 'rate_diff_nq'
rng = np.random.default_rng(67)

def load(name, cut):
    src = (SD / name).read_text(encoding='utf-8').split(cut)[0]
    ns = {'__file__': str(SD / name), '__name__': 'reuse'}; exec(compile(src, name, 'exec'), ns); return ns

ea = load('cog_event_align.py', 'R = calls_for(Lser.values)')
mc = load('cog_match_confirm.py', 'X0 = make_x(Lraw)')
an = load('cog_analog.py', 'ZN = zwin(Nv, ends_all)')
G = an['G']; n = len(G)                                  # the longest of the three grids; all start 2024-04-15 so positions agree
# ---- read 1: structure-event alignment. Active at hour t when a call's projected time T falls in the next 8 bars (2 h).
R = ea['calls_for'](ea['Lser'].values)
ev = np.zeros(n)
for _, r in R.iterrows():
    c, T = int(r.c), int(r['T'])
    for t in range(max(c, T - 8), T):
        if G[t].minute == 0: ev[t] = r['dir']
# ---- read 2: match / confirm / entry, the 4 h call at each whole-hour decision
df = mc['run'](mc['make_x'](mc['Lraw']))
mcr = np.zeros(n)
for _, r in df[df.h == '4h'].iterrows(): mcr[int(r.t)] = r['dir']
# ---- read 3: 12-hour analog (line shape only), the 4 h prediction at the 2-hourly decisions
an['ZN'] = an['zwin'](an['Nv'], an['ends_all'])
dec, pred, real = an['run'](an['Lv'], 'A')
anr = np.zeros(n); j4 = an['HN'].index('4h')
for d, p in zip(dec, pred[:, j4]):
    if np.isfinite(p) and p != 0: anr[int(an['ends_all'][d])] = np.sign(p)
Pc = an['Nv'] * 100                                                     # Nasdaq log price in percent
whole = (G.minute == 0) & (G.weekday < 5)
valid = whole & ~an['VIDEO'] & (np.arange(n) + 16 <= an['N_LAST'])
idx = np.where(valid)[0]
out4 = np.full(n, np.nan); out4[idx] = Pc[idx + 16] - Pc[idx]
out1 = np.full(n, np.nan); out1[idx] = Pc[idx + 4] - Pc[idx]
reads = np.vstack([ev, mcr, anr]).T                                    # n x 3, values -1, 0, +1
D = pd.DataFrame(reads[idx], index=G[idx], columns=['events', 'match', 'analog']); D['m4'] = out4[idx]; D['m1'] = out1[idx]
D = D[np.isfinite(D.m4)]
act = (D[['events', 'match', 'analog']] != 0)
D['n_active'] = act.sum(1); D['dir_sum'] = D[['events', 'match', 'analog']].sum(1)
D['aligned'] = (D.n_active >= 2) & (D.dir_sum.abs() == D.n_active)
D['mixed'] = (D.n_active >= 2) & ~D.aligned
D['dir'] = np.sign(D.dir_sum)
D['date'] = [t.date() for t in D.index]; D['expl'] = D.index < pd.Timestamp('2025-11-01', tz='UTC')

def summ(sub, col='m4', B=2000):
    sub = sub[np.isfinite(sub[col])]                                  # hours whose outcome bar has no Nasdaq price
    sig = (sub['dir'] * sub[col]).values; d = sub.date.values
    if len(sig) < 8: return None
    u, inv = np.unique(d, return_inverse=True); s = np.bincount(inv, sig); c = np.bincount(inv).astype(float); o = np.empty(B)
    for b in range(B):
        k = rng.integers(0, len(u), len(u)); o[b] = s[k].sum() / c[k].sum()
    return dict(n=len(sig), days=len(u), mean=sig.mean(), lo=np.percentile(o, 2.5), hi=np.percentile(o, 97.5), right=float((sig > 0).mean()))
def line(lab, sub, col='m4'):
    r = summ(sub, col)
    return f'| {lab} | {r["n"]} | {r["days"]} | {r["mean"]:+.3f} ({r["lo"]:+.3f} to {r["hi"]:+.3f}) | {r["right"] * 100:.0f}% |' if r else f'| {lab} | {len(sub)} | - | too few | - |'
hdr = ['| group | hours | days | mean move in the read\'s direction, % (95% range) | share of hours in that direction |', '|---|---|---|---|---|']
md = ['# Combined reads (descriptive)', '',
      'Three reads of the SOFR-Euribor line, taken exactly as already reported: structure-event alignment, match / confirm / entry, 12-hour window analog. At each whole weekday hour: which reads are active, which way, and what Nasdaq did over the next 4 hours (1 hour in the second table). Moves are signed so that a positive number means price went the way the reads pointed. Ranges are 95% day-block bootstrap ranges. No pass/fail: this is to see whether agreement carries more than any single read.', '',
      f'Hours covered: {len(D):,} ({int(D.expl.sum()):,} to Oct 2025, {int((~D.expl).sum()):,} after). Hours with at least one read active: {int((D.n_active >= 1).sum()):,}; two or more: {int((D.n_active >= 2).sum()):,}; all three: {int((D.n_active == 3).sum()):,}.', '']
base = D.m4.mean(); up = (D.m4 > 0).mean()
md += [f'Reference: over all these hours Nasdaq moved {base:+.3f}% on average over the next 4 hours and was up {up * 100:.0f}% of the time, so a read that just says "up" would look right {up * 100:.0f}% of the time.', '']
for title, col in (('Next 4 hours', 'm4'), ('Next 1 hour', 'm1')):
    md += [f'## {title}', ''] + hdr
    for nm in ('events', 'match', 'analog'):
        s = D[(D[nm] != 0) & (D.n_active == 1)].copy(); s['dir'] = s[nm]; md.append(line(f'{nm} alone', s, col))
        s2 = D[D[nm] != 0].copy(); s2['dir'] = s2[nm]; md.append(line(f'{nm} (any hours it is active)', s2, col))
    md.append(line('two or more active, all pointing the same way', D[D.aligned], col))
    md.append(line('  of which exactly two', D[D.aligned & (D.n_active == 2)], col))
    md.append(line('  of which all three', D[D.aligned & (D.n_active == 3)], col))
    md.append(f'| two or more active, pointing different ways | {int(D.mixed.sum())} | - | not directional | - |')
    md.append('')
md += ['## Same, split by period (4 hours)', ''] + hdr
for lab, sub in (('aligned, to Oct 2025', D[D.aligned & D.expl]), ('aligned, after Oct 2025', D[D.aligned & ~D.expl]),
                 ('any read alone, to Oct 2025', D[(D.n_active == 1) & D.expl].assign(dir=lambda x: np.sign(x[['events', 'match', 'analog']].sum(1)))),
                 ('any read alone, after Oct 2025', D[(D.n_active == 1) & ~D.expl].assign(dir=lambda x: np.sign(x[['events', 'match', 'analog']].sum(1))))):
    md.append(line(lab, sub))
md += ['', '## Are the reads copies of each other?', '']
for a, b in (('events', 'match'), ('events', 'analog'), ('match', 'analog')):
    both = D[(D[a] != 0) & (D[b] != 0)]
    md.append(f'- {a} and {b}: both active in {len(both)} hours; same direction in {(both[a] == both[b]).mean() * 100:.0f}% of them' if len(both) else f'- {a} and {b}: never active together')
md += ['', 'Reading guide: a group whose range sits above zero in both periods and grows with agreement would be the combination you described. A group whose range straddles zero is "cannot tell yet at this sample", and the hours column says how much more history it would need.', '']
OUT.write_text('\n'.join(md) + '\n', encoding='utf-8')
print('\n'.join(md))
