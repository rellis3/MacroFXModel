"""COG-MATCHED-PAIRS audit (forge/COG_MATCHED_PAIRS_ADDENDUM_A.md section 1): reference periods and expiries, coverage and staleness, timestamp alignment,
asynchronous updates, session overlap, raw-versus-display separation, usable samples.
    python scripts/rate_diff_nq/cog_matched_pairs_audit.py  -> analysis/output/cog_video_0918/MATCHED_PAIRS_AUDIT.md (+ matched_pairs_audit_*.csv)
Needs analysis/output/stir_1m_deep/contract_details.json (scratchpad/ibkr_contract_details.py) and the deep 1-minute parquet files."""
import sys, json, re, datetime as dt
from pathlib import Path
HERE = Path(__file__).resolve(); sys.argv = [sys.argv[0]]
src = (HERE.parent / 'cog_turn_events.py').read_text(encoding='utf-8'); pre = src[:src.index('# ---------------------------------------------------------------- run')]
g0 = {'__file__': str(HERE.parent / 'cog_turn_events.py'), '__name__': 'core'}; exec(compile(pre, 'cog_turn_events.py', 'exec'), g0); globals().update(g0)
import calendar
CD = {c['localSymbol']: c for c in json.loads((DEEP / 'contract_details.json').read_text(encoding='utf-8'))}
FILES = {'SR3U6': 'CME_SR3U6', 'SR3Z6': 'CME_SR3Z6', 'SR3H7': 'CME_SR3H7', 'IH7': 'ICEEU_IH7', 'IZ6': 'ICEEU_IZ6', 'ER3Z6': 'ICEEU_ER3Z6', 'ER3H7': 'ICEEU_ER3H7'}
KIND = {'SR3U6': 'SR3', 'SR3Z6': 'SR3', 'SR3H7': 'SR3', 'IH7': 'EURIBOR', 'IZ6': 'EURIBOR', 'ER3Z6': 'ER3', 'ER3H7': 'ER3'}
def third_wed(y, m):
    c = calendar.Calendar().itermonthdates(y, m); weds = [d for d in c if d.month == m and d.weekday() == 2]; return weds[2]
def add_months(y, m, k): m2 = m - 1 + k; return y + m2 // 12, m2 % 12 + 1
def bd_before(d, n):
    while n > 0:
        d -= dt.timedelta(days=1)
        if d.weekday() < 5: n -= 1
    return d
rows = []
for sym, c in CD.items():
    cm = c['contractMonth']; y, m = int(cm[:4]), int(cm[4:6]); start = third_wed(y, m); ye, me = add_months(y, m, 3); end = third_wed(ye, me)
    kind = KIND[sym]; ltd_derived = bd_before(start, 2) if kind == 'EURIBOR' else bd_before(end, 1)
    ltd_ib = re.sub(r'\D', '', c['lastTradeDateOrContractMonth'].split(' ')[0])[:8]; ltd_ib = dt.date(int(ltd_ib[:4]), int(ltd_ib[4:6]), int(ltd_ib[6:8]))
    rows.append(dict(contract=sym, kind=kind, ibkr_name=c['longName'], contract_month=cm, ref_period_start=str(start), ref_period_end=str(end), last_trade_ibkr=str(ltd_ib), last_trade_from_convention=str(ltd_derived), convention_matches_ibkr=ltd_ib == ltd_derived, real_expiration=c.get('realExpirationDate', '')))
CT = pd.DataFrame(rows)
REFP = {r.contract: (dt.date.fromisoformat(r.ref_period_start), dt.date.fromisoformat(r.ref_period_end), dt.date.fromisoformat(r.last_trade_ibkr)) for r in CT.itertuples()}
DATA_END = dt.date(2026, 10, 9)
CANDS = {'P0': ('SR3U6', 'IH7', 'spread'), 'P1': ('SR3H7', 'IH7', 'spread'), 'P2': ('SR3Z6', 'IZ6', 'spread'), 'P3': ('SR3Z6', 'ER3Z6', 'spread'), 'P4': ('SR3H7', 'ER3H7', 'spread'), 'L-US': ('SR3Z6', None, 'us'), 'L-EU-Euribor': (None, 'IZ6', 'eu'), 'L-EU-ESTR': (None, 'ER3Z6', 'eu')}
pr = []
for k, (a, b, mode) in CANDS.items():
    if mode != 'spread': pr.append(dict(candidate=k, legs=a or b, period_overlap_days='', start_gap_days='', end_gap_days='', last_trade_gap_days='', cut_window_at='none (single leg)', in_reference_period_at_data_end='yes' if (REFP[a or b][0] <= DATA_END) else 'no')); continue
    A, B = REFP[a], REFP[b]; ov = (min(A[1], B[1]) - max(A[0], B[0])).days; cut = min(A[2], B[2])
    pr.append(dict(candidate=k, legs=f'{a} - {b}', period_overlap_days=ov, start_gap_days=(B[0] - A[0]).days, end_gap_days=(B[1] - A[1]).days, last_trade_gap_days=(B[2] - A[2]).days, cut_window_at=str(cut) if cut <= DATA_END else 'none (all last-trade dates after data end 2026-10-09)', in_reference_period_at_data_end='; '.join(f"{x}: {max(0, (DATA_END - REFP[x][0]).days) / max(1, (REFP[x][1] - REFP[x][0]).days):.0%}" for x in (a, b))))
PRT = pd.DataFrame(pr)

# ---------------------------------------------------------------- coverage and staleness per contract
cov = []; MIN = {}
for sym, f in FILES.items():
    p = DEEP / f'{f}.parquet'
    if not p.exists(): cov.append(dict(contract=sym, status='not downloaded yet')); continue
    d = ld(p); c = d['close']; MIN[sym] = c; ch = (c.diff() != 0); hr = c.index.hour
    run = ch.cumsum(); longest = int(run.groupby(run).size().max()); cnt = c.groupby(hr).count(); peak = cnt.max()
    cov.append(dict(contract=sym, first=str(c.index[0])[:16], last=str(c.index[-1])[:16], minutes=len(c), days=c.index.normalize().nunique(), unchanged_minute_share=round(1 - ch.mean(), 3), longest_flat_run_min=longest,
                    active_utc_hours=f"{int(cnt[cnt >= 0.5 * peak].index.min()):02d}-{int(cnt[cnt >= 0.5 * peak].index.max()) + 1:02d} (hours with >= half of peak coverage: {len(cnt[cnt >= 0.5 * peak])})"))
COV = pd.DataFrame(cov)
HOURLY = pd.DataFrame({sym: (1 - (c.diff() != 0).groupby(c.index.hour).mean()).round(2) for sym, c in MIN.items()}); HOURLY.index.name = 'UTC hour'; HOURLY = HOURLY.reset_index()

# ---------------------------------------------------------------- pair-level series (registered and strict-causal conventions), staleness, async, samples
def r15_conv(c, strict=False):
    s = c.copy()
    if strict: s.index = s.index + pd.Timedelta(minutes=1)          # stamp = minute END, so bar t holds only minutes that had ended by t
    gp = s.resample('15min', label='right', closed='right'); l, n = gp.last(), gp.count(); l[n < 5] = np.nan; return 100 - l
def pair_line(a, b, strict=False):
    if a is not None and b is not None:
        ua, ub = r15_conv(MIN[a], strict).reindex(G), r15_conv(MIN[b], strict).reindex(G); da, db = dist(ua), dist(ub); gd = np.array([da.get(d, 0) >= 3 and db.get(d, 0) >= 3 for d in dayv])
        return ((ua - ub) * 100).where(gd), ua, ub
    leg = a or b; ul = r15_conv(MIN[leg], strict).reindex(G); dl_ = dist(ul); gd = np.array([dl_.get(d, 0) >= 3 for d in dayv]); return (ul * 100).where(gd), ul, ul
ysr = pd.Series(Y, index=G)
SAM, STA, ASY, TSS, SES = [], [], [], [], []
for k, (a, b, mode) in CANDS.items():
    need = [x for x in (a, b) if x]
    if any(x not in MIN for x in need): SAM.append(dict(candidate=k, status='waiting for data')); continue
    xs, ua, ub = pair_line(a, b); x = xs.to_numpy(); both = np.isfinite(x) & np.isfinite(Y)
    r = dict(candidate=k)
    for hf in ('IS', 'VAL', 'OOS'):
        m_ = both & (half_of == hf) & (~VIDEO); days = pd.Series(dayv[m_]).nunique(); r[f'{hf}_days'] = days; r[f'{hf}_bars'] = int(m_.sum()); r[f'{hf}_min_detectable_corr'] = round(2.8 / np.sqrt(days), 3) if days > 5 else np.nan
    r['first_usable_day'] = str(pd.Series(G[both]).min())[:10] if both.any() else ''; r['underpowered_(IS_days<60)'] = r['IS_days'] < 60; SAM.append(r)
    if mode == 'spread':
        pa, pb = ua.notna(), ub.notna(); fa, fb = (ua.diff() == 0) & pa, (ub.diff() == 0) & pb
        STA.append(dict(candidate=k, bars_both_print=int((pa & pb).sum()), share_either_leg_flat_vs_prev_bar=round(float(((fa | fb) & pa & pb).sum() / max(1, (pa & pb).sum())), 3), share_both_flat=round(float(((fa & fb) & pa & pb).sum() / max(1, (pa & pb).sum())), 3),
                        share_only_US_flat=round(float((fa & ~fb & pa & pb).sum() / max(1, (pa & pb).sum())), 3), share_only_EU_flat=round(float((fb & ~fa & pa & pb).sum() / max(1, (pa & pb).sum())), 3)))
        c1, c2 = MIN[a].diff(), MIN[b].diff(); idx = c1.index.intersection(c2.index); c1, c2 = c1[idx], c2[idx]; act = (c1 != 0) | (c2 != 0); c1, c2 = c1[act], c2[act]
        # cross-correlation of 1-minute changes at lags -5..+5 on the full minute grid (changes aligned by minute stamp)
        full = pd.DataFrame({'a': MIN[a].diff(), 'b': MIN[b].diff()}).dropna(how='all').fillna(0.0); xc = {k_: float(full['a'].corr(full['b'].shift(-k_))) for k_ in range(-5, 6)}
        pk = max(xc, key=lambda z: abs(xc[z])); ASY.append(dict(candidate=k, corr_lag0=round(xc[0], 3), corr_minus1=round(xc[-1], 3), corr_plus1=round(xc[1], 3), corr_minus5=round(xc[-5], 3), corr_plus5=round(xc[5], 3), peak_lag_min=pk, peak_corr=round(xc[pk], 3), note='lag>0: euro leg change follows the US leg change'))
        cnt_a = MIN[a].groupby(MIN[a].index.hour).count(); cnt_b = MIN[b].groupby(MIN[b].index.hour).count(); ok_h = [h for h in range(24) if cnt_a.get(h, 0) >= 0.5 * cnt_a.max() and cnt_b.get(h, 0) >= 0.5 * cnt_b.max()]
        SES.append(dict(candidate=k, overlap_utc_hours=', '.join(f'{h:02d}' for h in ok_h), n_hours=len(ok_h)))
    # timestamp convention sensitivity (window to the end of the CFD cache so Nasdaq can be rebuilt strictly)
    xstr = pair_line(a, b, strict=True)[0].to_numpy(); cut = np.asarray(G <= pd.Timestamp('2026-08-20', tz='UTC')); cfd_s = cfd.copy(); cfd_s.index = cfd_s.index + pd.Timedelta(minutes=1); y_s = np.log(cfd_s.resample('15min', label='right', closed='right').last()).reindex(G).to_numpy()
    both_s = np.isfinite(x) & np.isfinite(xstr) & cut
    dx = pd.Series(x, index=G).diff().to_numpy(); dxs = pd.Series(xstr, index=G).diff().to_numpy(); m2 = np.isfinite(dx) & np.isfinite(dxs) & cut
    h_r = ((pd.Series(x, index=G) - pd.Series(x, index=G).shift(4)).to_numpy(), (ysr - ysr.shift(4)).to_numpy()); h_s = ((pd.Series(xstr, index=G) - pd.Series(xstr, index=G).shift(4)).to_numpy(), (pd.Series(y_s, index=G) - pd.Series(y_s, index=G).shift(4)).to_numpy())
    mm = lambda a_, b_: np.isfinite(a_) & np.isfinite(b_) & cut & (G.minute.to_numpy() == 0)
    link_r = np.corrcoef(h_r[0][mm(*h_r)], h_r[1][mm(*h_r)])[0, 1]; link_s = np.corrcoef(h_s[0][mm(*h_s)], h_s[1][mm(*h_s)])[0, 1]
    ev_r = [c_ for c_, e_, d_ in zigzag(x, theta_base(x), 0.75)[1]]; ev_s = [c_ for c_, e_, d_ in zigzag(xstr, theta_base(xstr), 0.75)[1]]; sr = set(ev_r); match = np.mean([any((c_ + o) in sr for o in (-1, 0, 1)) for c_ in ev_s]) if len(ev_s) else np.nan
    TSS.append(dict(candidate=k, corr_of_15m_changes_registered_vs_strict=round(float(np.corrcoef(dx[m2], dxs[m2])[0, 1]), 4), share_bars_value_differs=round(float(np.mean(np.abs(x[both_s] - xstr[both_s]) > 1e-9)), 3), same_hour_link_registered=round(float(link_r), 4), same_hour_link_strict=round(float(link_s), 4), A0_turns_registered=len(ev_r), A0_turns_strict=len(ev_s), strict_turns_with_registered_turn_within_1_bar=round(float(match), 3)))
SAM, STA, ASY, TSS, SES = (pd.DataFrame(v) for v in (SAM, STA, ASY, TSS, SES))

# ---------------------------------------------------------------- raw versus display
chk = []
if 'SR3U6' in MIN and 'IH7' in MIN:
    xs0 = pair_line('SR3U6', 'IH7')[0]; t = G[np.isfinite(xs0.to_numpy())][1000]
    ra = MIN['SR3U6'].resample('15min', label='right', closed='right').last().get(t); rb = MIN['IH7'].resample('15min', label='right', closed='right').last().get(t)
    chk.append(f'Research line at {t}: {xs0.loc[t]:.4f} bp; recomputed by hand from the raw 1-minute closes ((100 - {ra}) - (100 - {rb})) x 100 = {((100 - ra) - (100 - rb)) * 100:.4f} bp. Equal: {abs(xs0.loc[t] - ((100 - ra) - (100 - rb)) * 100) < 1e-9}.')
toks = re.compile(r'offset|scale|1\.445|leadDays|invert|smooth|\blead\b', re.I); found = []
for f in ('cog_turn_events.py', 'cog_sequence_events.py', 'cog_shape_agnostic.py', 'cog_event_features.py', 'cog_meeting_path.py'):
    for i, ln in enumerate((HERE.parent / f).read_text(encoding='utf-8').split('\n'), 1):
        if toks.search(ln) and not ln.strip().startswith('#') and not ln.strip().startswith('"""'): found.append(f'{f}:{i}: {ln.strip()[:150]}')
audit_tokens = found

# ---------------------------------------------------------------- write
fm = lambda d: d.to_markdown(index=False) if len(d) else '_none yet_'
txt = ['# COG-MATCHED-PAIRS audit (published before the tests run)', '', 'Registered in forge/COG_MATCHED_PAIRS_ADDENDUM_A.md section 1. Reference periods are derived from exchange convention and then checked against IBKR contract details (last trade date); they are not read from IBKR.', '',
       '## 1. Reference periods and expiries', fm(CT), '', f'Convention check: {int(CT.convention_matches_ibkr.sum())} of {len(CT)} contracts have the convention-derived last-trade date equal to IBKR\'s.', '',
       'Reading: SR3 and ER3 (compounded ESTR) share the IMM quarter and the same last-trade convention (business day before the period end), so SR3Z6 vs ER3Z6 and SR3H7 vs ER3H7 compare like with like. Euribor (a forward-looking term fixing) expires two business days before its period STARTS, so its price stops moving before the period it refers to begins, while SR3 keeps moving through its period as fixings arrive.', '',
       '### Pair-level alignment', fm(PRT), '',
       '**C.OG\'s pair (P0)** compares SOFR Sep-Dec 2026 with Euribor Mar-Jun 2027 (a six-month gap between the periods). SR3U6 is **inside its own reference period since 2026-09-16** (about a quarter elapsed at the data end), so its price is partly realised fixings from that date: the last 3.5 weeks of the earlier P0 studies, including the video week, are an in-period regime for the US leg. P1 to P4 are forward-looking over the whole window.', '',
       '## 2. Coverage and staleness per contract', fm(COV), '', '### Share of minutes with an unchanged price, by UTC hour (high = a stale quote that hour)', fm(HOURLY), '', '### Pair bars: both legs print, flat legs (15-minute close equal to the bar before)', fm(STA), '',
       '## 3. Timestamp alignment', '', 'IBKR stamps a 1-minute bar by its START; the registered 15-minute bars are right-labelled and right-closed, so the bar labelled t contains the minute stamped t, which ends at t + 1 minute. The same convention applies to every leg, to the OANDA CFD and to the NQ futures, so relative alignment is preserved, but the information at the decision bar overhangs the label by one minute. Sensitivity (strict-causal rebuild: bar t holds only minutes that ended by t; window to 2026-08-20 so Nasdaq can be rebuilt the same way):', '', fm(TSS), '',
       '### Asynchronous updates between the legs (cross-correlation of 1-minute changes at lags of minutes)', fm(ASY), '', '### Session overlap (UTC hours in which both legs have at least half their peak coverage)', fm(SES), '',
       '## 4. Raw versus display', '', *[f'- {c}' for c in chk], f'- The Pine display parameters (scale 0.1, offset 1.445, invert, smoothing, plot lead) are not inputs of any research script. Lines mentioning those words in the research scripts (all must be unrelated to the line; the futures-splice `off` applies to Nasdaq only):', '', '```', *(audit_tokens or ['none']), '```', '',
       '## 5. Usable samples per candidate (days and 15-minute bars with the series and Nasdaq present, video week excluded)', '', fm(SAM), '', 'Candidates with fewer than 60 in-sample days are descriptive only (COG_MATCHED_PAIRS_ADDENDUM_A.md section 4).']
(OUTD / 'MATCHED_PAIRS_AUDIT.md').write_text('\n'.join(txt), encoding='utf-8')
for n_, d_ in (('contracts', CT), ('pairs', PRT), ('coverage', COV), ('staleness', STA), ('timestamps', TSS), ('async', ASY), ('samples', SAM)): d_.to_csv(OUTD / f'matched_pairs_audit_{n_}.csv', index=False)
print('\n'.join(txt[:60]))
