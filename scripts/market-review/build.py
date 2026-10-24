"""Turn raw.json into the weekly data pack: for every market, the numbers the review's questions need.

Usage:  python -I scripts/market-review/build.py [--asof YYYY-MM-DD]
Writes analysis/output/market-review/<asof>/DATA_PACK.md and pack.json.

Per market (see education/market_reviews/PLAYBOOK.md for how to read each block):
  move     level, 1w / 4w / 13w change, where it sits in its 52w range, how unusual the 4w move is
           (percentile of |4w move| over the past 2y: the "ordinary or not" base rate)
  drivers  correlation of daily moves with each textbook driver, last 20 sessions vs the 60 before,
           labelled textbook / inverted / weak, flagged when it flipped; the driver "in charge" = largest |recent corr|
  decomp   OLS of daily moves on the drivers over the last 60 sessions; contribution of each driver to the last
           20 sessions' move (Brent's "EURUSD sits between the rate line and the France line")
  priced   CFTC positioning (leveraged funds / asset managers, or managed money), sign-adjusted to the market as quoted,
           3y percentile and 4w change
  calendar this coming week's major events for the market's currencies
Descriptive only: 20-session correlations are noisy (one week can move them a lot). Not a signal, not a test.
"""
import argparse, datetime as dt, json, os, re, sys
import numpy as np, pandas as pd

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from universe import UNIVERSE, REGIME_PAIRS, COUNTRY_CCY  # noqa: E402

RECENT, PRIOR, DECOMP = 20, 60, 60
YIELDS = {'US2Y', 'US5Y', 'US10Y', 'US30Y', 'DE10Y', 'GB10Y', 'JP10Y', 'CA2Y', 'CA10Y', 'EA2Y', 'DFII10', 'T10YIE',
          'US_EA2', 'US_DE10', 'US_GB10', 'US_JP10', 'US_CA2', 'FR_DE', 'IT_DE', 'HY_OAS', '^VIX', '^MOVE'}
ASIA = {'^N225', '^KS11', '^HSI', '^AXJO', 'JP10Y'}  # close before New York: see the previous US session
MAJOR = re.compile(r'rate decision|interest rate decision|deposit facility|cash rate|overnight rate|policy rate|monetary policy statement|'
                   r'^cpi$|core cpi|cpi y/y|cpi \(|inflation rate|core pce|pce price|gdp(?! now)|nonfarm|unemployment rate|employment change|'
                   r'retail sales|ism|budget|forecast statement|press conference|minutes', re.I)

def ser(pairs):
    s = pd.Series({a: b for a, b in pairs}, dtype=float)
    s.index = pd.to_datetime(s.index); return s.sort_index()

def build_panel(raw):
    S = {k: ser(v) for k, v in raw['yahoo'].items() if v}
    for k, v in raw['series'].items():
        if v: S[k] = ser(v)
    if 'DGS2' in S: S['US2Y'] = S.pop('DGS2')
    if 'BAMLH0A0HYM2' in S: S['HY_OAS'] = S.pop('BAMLH0A0HYM2') * 100
    S['US5Y'], S['US10Y'], S['US30Y'] = S.get('^FVX'), S.get('^TNX'), S.get('^TYX')
    df = pd.DataFrame({k: v for k, v in S.items() if v is not None})
    df = df[df.index.dayofweek < 5].sort_index().ffill(limit=3)
    if 'US2Y' not in df: df['US2Y'] = df['US5Y']  # FRED down: 5y stands in, flagged in notes
    for a, b, k in (('US2Y', 'EA2Y', 'US_EA2'), ('US10Y', 'DE10Y', 'US_DE10'), ('US10Y', 'GB10Y', 'US_GB10'),
                    ('US10Y', 'JP10Y', 'US_JP10'), ('US2Y', 'CA2Y', 'US_CA2')):
        if a in df and b in df: df[k] = df[a] - df[b]
    if 'HYG' in df and 'TLT' in df: df['HYG_TLT'] = df['HYG'] / df['TLT']
    if 'RSP' in df and 'SPY' in df: df['RSP_SPY'] = df['RSP'] / df['SPY']
    # French / Italian spread proxies from local futures: approximate bp change via -dln(P)/duration.
    loc = raw.get('local', {})
    if 'OAT' in loc and 'BUND' in loc:
        D = 8.5
        oat, bund = ser(loc['OAT']['series']), ser(loc['BUND']['series'])
        bp = lambda p: -np.log(p / p.iloc[0]) / D * 1e4
        df['FR_DE'] = (bp(oat) - bp(bund)).reindex(df.index).ffill(limit=3)
        if 'BTP' in loc:
            df['IT_DE'] = (bp(ser(loc['BTP']['series'])) - bp(bund)).reindex(df.index).ffill(limit=3)
    return df

def changes(df):
    ch = pd.DataFrame(index=df.index)
    for c in df.columns:
        s = df[c]
        ch[c] = s.diff() if (c in YIELDS) else np.log(s.where(s > 0)).diff()
    return ch

def fmt_move(c, v):
    if v is None or (isinstance(v, float) and np.isnan(v)): return 'n/a'
    return f'{v*100:+.0f}bp' if c in YIELDS and c not in ('^VIX', '^MOVE') else (f'{v:+.1f}pt' if c in ('^VIX', '^MOVE') else f'{v*100:+.1f}%')

def move_block(df, c):
    s = df[c].dropna()
    if len(s) < 30: return None
    last = s.iloc[-1]
    def chg(n):
        if len(s) <= n: return np.nan
        return (last - s.iloc[-1 - n]) if c in YIELDS else (last / s.iloc[-1 - n] - 1)
    w1, w4, w13 = chg(5), chg(20), chg(65)
    y = s[s.index > s.index[-1] - pd.Timedelta(days=365)]
    pos = (last - y.min()) / (y.max() - y.min()) if y.max() > y.min() else np.nan
    m4 = (s - s.shift(20)) if c in YIELDS else (s / s.shift(20) - 1)
    m4 = m4.dropna()
    pct = float((m4.abs() <= abs(w4)).mean() * 100) if len(m4) > 50 and not np.isnan(w4) else np.nan
    return dict(last=float(last), last_date=str(s.index[-1].date()), w1=w1, w4=w4, w13=w13, range_pos=pos,
                hi52=float(y.max()), lo52=float(y.min()), move4_pct=pct)

def ordn(x):
    if x is None or (isinstance(x, float) and np.isnan(x)): return 'n/a'
    n = int(round(x)); return f'{n}{"th" if 10 <= n % 100 <= 20 else {1: "st", 2: "nd", 3: "rd"}.get(n % 10, "th")}'
def num(v):
    return f'{v:,.0f}' if abs(v) >= 1000 else f'{v:.4g}'
def sc(x): return 'n/a' if x is None or np.isnan(x) else f'{x:+.2f}'
def corr(a, b):
    m = pd.concat([a, b], axis=1).dropna()
    return (float(m.iloc[:, 0].corr(m.iloc[:, 1])), len(m)) if len(m) >= 8 else (np.nan, len(m))

def label(r, sign):
    if np.isnan(r): return 'n/a'
    x = r * sign
    return 'textbook' if x >= 0.3 else ('INVERTED' if x <= -0.3 else 'weak')

def driver_block(ch, mkt, spec):
    y = ch[spec['sym']]
    rows = []
    for key, sign, why in spec['drivers']:
        if key not in ch: rows.append(dict(key=key, why=why, sign=sign, missing=True)); continue
        x = ch[key]
        if spec.get('asia') and key not in ASIA: x = x.shift(1)  # Asian close sees the previous US session
        rec = corr(y.iloc[-RECENT:], x.iloc[-RECENT:]); pri = corr(y.iloc[-RECENT - PRIOR:-RECENT], x.iloc[-RECENT - PRIOR:-RECENT])
        lr, lp = label(rec[0], sign), label(pri[0], sign)
        rows.append(dict(key=key, why=why, sign=sign, recent=rec[0], n=rec[1], prior=pri[0], lab=lr, lab_prior=lp,
                         flipped=(lr != lp and 'n/a' not in (lr, lp) and 'weak' not in (lr, lp))))
    live = [r for r in rows if not r.get('missing') and not np.isnan(r['recent'])]
    charge = max(live, key=lambda r: abs(r['recent'])) if live else None
    if charge and abs(charge['recent']) < 0.3: charge = dict(charge, weak=True)  # nothing is clearly in charge
    return rows, charge

def decomp_block(ch, spec):
    keys = [k for k, _, _ in spec['drivers'] if k in ch]
    X = ch[keys].copy()
    if spec.get('asia'): X = pd.concat([X[k].shift(0 if k in ASIA else 1) for k in keys], axis=1)
    m0 = pd.concat([ch[spec['sym']], X], axis=1).iloc[-DECOMP:]
    good = [k for k in keys if m0[k].notna().sum() >= 20]
    while good:  # shorter-history drivers (e.g. the French spread proxy) shrink the window rather than being dropped
        m = m0[[spec['sym']] + good].dropna()
        if len(m) >= 20: break
        good.remove(min(good, key=lambda k: m0[k].notna().sum()))
    if not good or len(m) < 20: return None
    A = np.column_stack([np.ones(len(m))] + [m[k].values for k in good])
    b, *_ = np.linalg.lstsq(A, m[spec['sym']].values, rcond=None)
    pred = A @ b; yv = m[spec['sym']].values
    r2 = 1 - ((yv - pred) ** 2).sum() / ((yv - yv.mean()) ** 2).sum()
    last = m.iloc[-RECENT:]
    contrib = {k: float(b[i + 1] * last[k].sum()) for i, k in enumerate(good)}
    actual = float(last[spec['sym']].sum())
    return dict(r2=float(r2), n=len(m), contrib=contrib, actual=actual, resid=actual - sum(contrib.values()))

def cot_block(raw, spec):
    if not spec.get('cot'): return None
    ds, name, sign = spec['cot']
    rows = raw.get('cftc', {}).get(ds, {}).get(name)
    if not rows: return dict(missing=True, name=name)
    t = pd.DataFrame(rows); t['d'] = t['report_date_as_yyyy_mm_dd'].str[:10]
    t = t.sort_values('d').drop_duplicates('d', keep='last')
    f = lambda c: pd.to_numeric(t[c], errors='coerce')
    out = dict(name=name, date=t['d'].iloc[-1], groups=[])
    groups = ([('lev funds', 'lev_money_positions'), ('asset mgrs', 'asset_mgr_positions')] if ds == 'tff'
              else [('managed money', 'm_money_positions'), ('producers', 'prod_merc_positions')])
    for lab, p in groups:
        L = f(p + '_long' + ('_all' if p == 'm_money_positions' else '')); Sh = f(p + '_short' + ('_all' if p == 'm_money_positions' else ''))
        net = (L - Sh) * sign
        if net.notna().sum() < 10: continue
        oi = f('open_interest_all')
        last = net.iloc[-1]
        out['groups'].append(dict(group=lab, net=float(last), pct_oi=float(last / oi.iloc[-1] * 100) if oi.iloc[-1] else np.nan,
                                  chg4=float(last - net.iloc[-5]) if len(net) > 4 else np.nan,
                                  pct3y=float((net <= last).mean() * 100), n=int(net.notna().sum())))
    return out

SKIP = re.compile(r'gdpnow|adp employment change weekly|dallas fed|spanish unemployment|mortgage|inventor', re.I)
def calendar_block(raw, spec):
    ccys = set(spec['ccys']); out = []
    for e in raw.get('calendar', []):
        if 'error' in e: continue
        if COUNTRY_CCY.get(e.get('country')) in ccys and MAJOR.search(e.get('event') or '') and not SKIP.search(e.get('event') or ''):
            k = (e['date'], e['country'], e['event'])
            if k not in {(o['date'], o['country'], o['event']) for o in out}: out.append(e)
    return out[:12]

def fed_path(raw):
    zq = raw.get('local', {}).get('ZQ', {})
    code = 'FGHJKMNQUVXZ'
    def key(k): return (int(k[1]), code.index(k[0]))
    return [(k, v['implied'], v['week_ago'], v['last_time'][:10]) for k, v in sorted(zq.items(), key=lambda kv: key(kv[0]))]

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--asof', default=dt.date.today().isoformat()); a = ap.parse_args()
    d = os.path.join(ROOT, 'analysis', 'output', 'market-review', a.asof)
    raw = json.load(open(os.path.join(d, 'raw.json'), encoding='utf-8'))
    df = build_panel(raw); ch = changes(df)
    asof = pd.Timestamp(a.asof)
    notes = list(raw.get('errors', []))
    if 'DGS2' not in raw['series']: notes.append('FRED DGS2 missing: US 2y = US 5y stand-in for this run')
    if 'FR_DE' not in df: notes.append('No local OAT/Bund futures: French spread proxy unavailable')
    for fut in ('CL=F', 'BZ=F', 'NG=F', 'GC=F', 'SI=F', 'HG=F'):
        if fut in ch:
            r = ch[fut].dropna(); sd = r.iloc[-260:].std()
            jumps = [str(i.date()) for i, v in r.iloc[-RECENT:].items() if sd and abs(v) > 4 * sd]
            if jumps: notes.append(f'{fut} has >4σ daily moves on {", ".join(jumps)}: continuous front-month, check for a contract roll')
    stale = [c for c in df.columns if df[c].last_valid_index() is not None and (asof - df[c].last_valid_index()).days > 5]
    if stale: notes.append('Stale (> 5 days old): ' + ', '.join(stale))
    pack = {'asof': a.asof, 'notes': notes, 'markets': {}, 'regime': [], 'fed_path': fed_path(raw)}

    L = [f'# Market Review Data Pack: {a.asof}', '',
         f'Fetched {raw["fetched_utc"]}. Descriptive numbers for the weekly review (read with `education/market_reviews/PLAYBOOK.md`). '
         f'Correlations are of daily moves: last {RECENT} sessions vs the {PRIOR} before. They are noisy; a flip is a question, not a signal.', '']
    if notes: L += ['**Data notes:** ' + ' · '.join(notes), '']

    L += ['## 1. Regime gauges: which story is the market trading?', '',
          '| Pair | Recent | Before | Textbook sign | Status | What it means |', '|---|---|---|---|---|---|']
    for x, y, sign, why in REGIME_PAIRS:
        if x not in ch or y not in ch: continue
        r, _ = corr(ch[x].iloc[-RECENT:], ch[y].iloc[-RECENT:]); p, _ = corr(ch[x].iloc[-RECENT - PRIOR:-RECENT], ch[y].iloc[-RECENT - PRIOR:-RECENT])
        st = label(r, sign); flip = ' (FLIPPED)' if st != label(p, sign) and 'weak' not in (st, label(p, sign)) else ''
        pack['regime'].append(dict(a=x, b=y, recent=r, prior=p, status=st + flip, why=why))
        L.append(f'| {x} vs {y} | {sc(r)} | {sc(p)} | {"+" if sign > 0 else "−"} | {st}{flip} | {why} |')
    vix, move = df.get('^VIX'), df.get('^MOVE')
    if vix is not None and move is not None:
        L += ['', f'Equity vol vs bond vol: VIX {vix.dropna().iloc[-1]:.1f} (1y pct {(vix.dropna().iloc[-260:] <= vix.dropna().iloc[-1]).mean()*100:.0f}) · '
              f'MOVE {move.dropna().iloc[-1]:.0f} (1y pct {(move.dropna().iloc[-260:] <= move.dropna().iloc[-1]).mean()*100:.0f}). '
              'When bond vol leads equity vol, the stress is in rates/credit first.']
    fp = pack['fed_path']
    if fp:
        L += ['', '**Fed funds futures (implied average rate by contract month; vs ~1 week earlier):** ' +
              ' · '.join(f'{k} {v:.3f}% ({v - w:+.3f})' for k, v, w, _ in fp) + f' (as of {fp[0][3]})']

    groups = {}
    for name, spec in UNIVERSE.items(): groups.setdefault(spec['group'], []).append(name)
    sec = 2
    for g, names in groups.items():
        L += ['', f'## {sec}. {g}', '']; sec += 1
        for name in names:
            spec = UNIVERSE[name]; c = spec['sym']
            if c not in df: L += [f'### {name}', '_no data_', '']; continue
            mv = move_block(df, c)
            if not mv: continue
            drv, charge = driver_block(ch, name, spec); dec = decomp_block(ch, spec); cot = cot_block(raw, spec); cal = calendar_block(raw, spec)
            pack['markets'][name] = dict(move=mv, drivers=drv, in_charge=(None if not charge or charge.get('weak') else charge['key']),
                                         decomp=dec, cot=cot, calendar=cal)
            lvl = num(mv["last"]) if c not in YIELDS or c in ('^VIX', '^MOVE') else f'{mv["last"]:.2f}' + ('' if c in ('FR_DE', 'IT_DE') else '%')
            if c in ('FR_DE', 'IT_DE'): lvl = f'{mv["last"]:+.0f}bp vs start of capture'
            usual = (f'{ordn(mv["move4_pct"])} pct of 2y 4w moves' if not np.isnan(mv['move4_pct']) else '')
            L += [f'### {name}  `{c}`  {lvl} ({mv["last_date"]})',
                  f'**Move:** 1w {fmt_move(c, mv["w1"])} · 4w {fmt_move(c, mv["w4"])} ({usual}) · 13w {fmt_move(c, mv["w13"])} · '
                  f'52w range position {mv["range_pos"]*100:.0f}% (lo {num(mv["lo52"])} / hi {num(mv["hi52"])})']
            dl = []
            for r in drv:
                if r.get('missing'): dl.append(f'{r["key"]} (missing)'); continue
                if np.isnan(r['recent']): continue
                dl.append(f'{r["key"]} {r["recent"]:+.2f} [{r["lab"]}{", was " + r["lab_prior"] if r["flipped"] else ""}]')
            if charge and charge.get('weak'):
                tail = ' → **no clear driver** (every |corr| < 0.3: drivers cancel or something off-list is moving it)'
            elif charge:
                tail = f' → **in charge: {charge["key"]}** ({charge["why"]})'
            else: tail = ''
            L.append('**Drivers (recent corr):** ' + ' · '.join(dl) + tail)
            if dec:
                parts = ' · '.join(f'{k} {fmt_move(c, v)}' for k, v in sorted(dec['contrib'].items(), key=lambda kv: -abs(kv[1])))
                L.append(f'**Last {RECENT} sessions decomposed (R² {dec["r2"]:.2f}, n={dec["n"]}):** actual {fmt_move(c, dec["actual"])} = {parts} · unexplained {fmt_move(c, dec["resid"])}')
            if cot and not cot.get('missing'):
                gs = ' · '.join(f'{x["group"]} {x["net"]:+,.0f} ({x["pct_oi"]:+.0f}% OI, 4w {x["chg4"]:+,.0f}, {ordn(x["pct3y"])} pct of 3y)' for x in cot['groups'])
                L.append(f'**Positioning (CFTC {cot["name"]}, {cot["date"]}, + = long {name}):** {gs}')
            if cal:
                L.append('**This week:** ' + ' · '.join(f'{e["date"][5:]} {e["time_et"]} ET {e["country"]}: {e["event"]}'
                                                         + (f' (cons {e["consensus"]}, prev {e["previous"]})' if e.get('consensus') else '') for e in cal[:6]))
            L.append('')
    md = os.path.join(d, 'DATA_PACK.md')
    open(md, 'w', encoding='utf-8').write('\n'.join(L) + '\n')
    json.dump(pack, open(os.path.join(d, 'pack.json'), 'w', encoding='utf-8'), default=lambda o: None if isinstance(o, float) and np.isnan(o) else str(o))
    print('wrote', md, f'({len(pack["markets"])} markets)')
    for n in notes: print('  NOTE', n)

if __name__ == '__main__':
    main()
