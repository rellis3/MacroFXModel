"""Continuous futures series built from the STORED per-contract files (plans/DATA_CAPTURE_G10.md section 3, phase 1 step 5).

For every root in scripts/ibkr/contracts.py that has contract files on disk:

    <ROOT>1, <ROOT>2       front and next (rank 1 and 2), UNADJUSTED: the line steps at each roll, as on TradingView.
                           Written as analysis/output/ibkr_continuous/<NAME>.parquet (1-minute, with a `contract` column)
                           and as a chart leg analysis/output/cog_chart/leg_<NAME>.json (same format as the stitched I2).
    <NAME>_adj.parquet     back-adjusted by DIFFERENCE: every earlier segment shifted by the price gap between the two
                           contracts on the last 1-minute bar both printed before the roll, so a return never crosses a roll.
                           For research; the newest segment is unshifted.
    rolls.json             the roll log (series, root, date, from, to, gap, gapAt): research uses it to avoid taking a return across a roll.
    daily_closes.json      the last 1-minute close of each completed UTC day per rank-1 series (legs_r2.py push writes these to
                           archive/series/ibkr/<NAME>.json for the server's archive).
    aliases.json           (in cog_chart/) every old IB_SPEC name of a ROLLED root -> its continuous front and the date its own contract
                           rolled; the server draws the old name as the continuous series from that date (server.js _ccLegFile).

Rolled roots switch on the contract's roll date (contracts.roll_date, 00:00 UTC). Strips are ranked: rank k is the k-th live
contract of the cycle, moving on the front's last trading day. Names already built by build_leg_bars.ROLLING (I2, SR32: they
also fill from the 15-minute TRADES archive) are left to it. Called at the end of build_leg_bars.py; also runnable alone:
    python scripts/ibkr/continuous.py [--m5-days 30] [--m15-days 180]"""
from __future__ import annotations

import datetime as dt
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(ROOT / 'scripts' / 'rates_line'))
import contracts as K      # noqa: E402

OUTROOT = ROOT / 'analysis' / 'output'
CONT = OUTROOT / 'ibkr_continuous'
CHART = OUTROOT / 'cog_chart'
CACHE = OUTROOT / 'stir_1m_deep' / 'contracts_registry.json'      # every contract IBKR listed for a root (refresh_leg_bars writes it): its real last trading day
SKIP = {'I2', 'SR32'}      # built by build_leg_bars.ROLLING (with the 15-minute archive fill)
UTC = 'UTC'


def load_cache(path=CACHE):
    try:
        return json.loads(Path(path).read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return {}


def contract_ltd(key, y, m, cache):
    """IBKR's last trading day when the cache has the contract, otherwise the rule."""
    for stem, row in cache.items():
        if row.get('root') == key and row.get('y') == y and row.get('m') == m and row.get('ltd'):
            return K._ltd_date(row['ltd'])
    return K.last_trade(key, y, m)


def sequence(key, y0, m0, y1, m1, cache=None):
    """Every cycle contract of a root from (y0, m0) to (y1, m1) inclusive, with its last trading day and roll date, in order.
    Strips roll (change rank) on their last trading day; for 3-month strips that is AFTER the contract month, so ordering is by roll date."""
    r = K.ROOTS[key]
    cache = cache or {}
    out, (y, m) = [], (y0, m0)
    while (y, m) <= (y1, m1):
        if not r.cycle or K.CODES[m - 1] in r.cycle:
            ltd = contract_ltd(key, y, m, cache)
            out.append(dict(y=y, m=m, name=K.contract_name(r, y, m), ltd=ltd, roll=K.roll_date(r, y, m, ltd)))
        y, m = K._add_months(y, m, 1)
    return sorted(out, key=lambda z: (z['roll'], z['y'], z['m']))


def schedule(seq, rank=1):
    """[(contract name, start, end)] for the rank-th series: in the window [roll of contract i-1, roll of contract i) the front
    is contract i and rank k is contract i+k-1. start of the first window is None (open)."""
    out = []
    for i in range(len(seq) - rank + 1):
        start = pd.Timestamp(seq[i - 1]['roll'], tz=UTC) if i else None
        end = pd.Timestamp(seq[i]['roll'], tz=UTC)
        out.append((seq[i + rank - 1]['name'], start, end))
    return out


def stitch(frames, sched, gap_days=7):
    """frames: {contract name: 1-minute DataFrame indexed by UTC time with open/high/low/close}. sched: schedule() output; the
    last window is left open-ended (the current contract runs on). Returns (unadjusted, adjusted, rolls, segments):
    unadjusted and adjusted carry a `contract` column; rolls lists each switch with the price gap (next minus previous close on
    the last 1-minute bar both had before the switch, looked for in the `gap_days` before it; None when they never overlapped)."""
    parts, segs = [], []
    for k, (name, start, end) in enumerate(sched):
        f = frames.get(name)
        if f is None or not len(f):
            continue
        last = k == len(sched) - 1
        s = f
        if start is not None:
            s = s[s.index >= start]
        if not last:
            s = s[s.index < end]
        if not len(s):
            continue
        parts.append((name, start, end, s))
        segs.append(dict(contract=name, start=str(s.index.min())[:16], end=str(s.index.max())[:16], rollAt=None if last else str(end)[:10]))
    if not parts:
        return None, None, [], []
    rolls = []
    for (a, _, a_end, sa), (b, b_start, _, _) in zip(parts, parts[1:]):
        fa, fb, at = frames[a], frames[b], b_start
        lo = at - pd.Timedelta(days=gap_days)
        ca = fa.close[(fa.index < at) & (fa.index >= lo)].dropna()
        cb = fb.close[(fb.index < at) & (fb.index >= lo)].dropna()
        common = ca.index.intersection(cb.index)
        if len(common):
            t = common.max()
            rolls.append(dict(date=str(at)[:10], **{'from': a, 'to': b}, gap=round(float(cb[t] - ca[t]), 6), gapAt=str(t)[:16], fromClose=float(ca[t]), toClose=float(cb[t])))
        else:
            rolls.append(dict(date=str(at)[:10], **{'from': a, 'to': b}, gap=None, gapAt=None, note=f'no common 1-minute bar in the {gap_days} days before the roll: adjusted series not shifted here'))
    un = pd.concat([s.assign(contract=n) for n, _, _, s in parts]).sort_index()
    un = un[~un.index.duplicated(keep='last')]
    adj_parts, off = [], 0.0
    gaps = [r['gap'] or 0.0 for r in rolls]
    for k in range(len(parts) - 1, -1, -1):
        n, _, _, s = parts[k]
        x = s.copy()
        for c in ('open', 'high', 'low', 'close'):
            if c in x:
                x[c] = x[c] + off
        adj_parts.append(x.assign(contract=n))
        if k:
            off += gaps[k - 1]
    adj = pd.concat(adj_parts[::-1]).sort_index()
    adj = adj[~adj.index.duplicated(keep='last')]
    return un, adj, rolls, segs


def daily_closes(frame, today):
    """[[YYYY-MM-DD, close]] = the last 1-minute close of each completed UTC weekday (today excluded)."""
    if frame is None or not len(frame):
        return []
    c = frame['close'].dropna()
    d = c.groupby(c.index.normalize()).last()
    d = d[(d.index.dayofweek < 5) & (d.index.date < today)]
    return [[str(t)[:10], round(float(v), 6)] for t, v in d.items()]


def files_by_contract(key, dirs=None):
    """{(y, m): [paths]} for every stored file of the root across build_leg_bars' midpoint folders."""
    import build_leg_bars as B
    out = {}
    for d in (dirs or B.DIRS):
        for f in sorted((OUTROOT / d).glob('*.parquet')):
            p = K.parse_stem(f.stem)
            if p and p[0] == key and p[1]:
                out.setdefault((p[1], p[2]), []).append(f)
    return out


def read_contract(paths):
    x = pd.concat([pd.read_parquet(f) for f in paths])
    x['time'] = pd.to_datetime(x['time'], utc=True)
    return x.drop_duplicates('time', keep='last').set_index('time').sort_index()[['open', 'high', 'low', 'close']]


def successor_files(folder, key, after_name):
    """Stored files of a root's contracts AFTER the named one, nearest first (for readers that chain contract files, e.g. the
    Release Reaction sources): ZN after ZNZ6 -> [CBOT_ZNH7.parquet, CBOT_ZNM7.parquet ...] that exist in `folder`."""
    p = K.parse_name(after_name)
    out = []
    for f in sorted(Path(folder).glob('*.parquet')):
        q = K.parse_stem(f.stem)
        if q and q[0] == key and q[1] and (q[1], q[2]) > (p[1], p[2]):
            out.append(((q[1], q[2]), f))
    return [f for _, f in sorted(out)]


def build_root(key, today, cache, m5_days=30, m15_days=180):
    """Build every rank of one root. Returns {name: dict(un, adj, rolls, segs, live)} for the ranks that have data."""
    r = K.ROOTS[key]
    fs = files_by_contract(key)
    if not fs:
        return {}
    (y0, m0), (y1, m1) = min(fs), max(fs)
    ey, em = K._add_months(today.year, today.month, 12)
    seq = sequence(key, y0, m0, max((y1, m1), (ey, em))[0], max((y1, m1), (ey, em))[1], cache)
    frames = {K.contract_name(r, y, m): read_contract(p) for (y, m), p in fs.items()}
    res = {}
    for rank in (1, 2):
        name = f'{key}{rank}'
        if name in SKIP:
            continue
        sch = schedule(seq, rank)
        now_i = next((i for i, (_, s, e) in enumerate(sch) if (s is None or s <= pd.Timestamp(today, tz=UTC)) and pd.Timestamp(today, tz=UTC) < e), None)
        if now_i is not None:
            sch = sch[:now_i + 1]      # the window holding today is the open-ended last one: later windows are the future
        un, adj, rolls, segs = stitch(frames, sch)
        if un is None:
            continue
        live = sch[-1][0] if sch else None
        res[name] = dict(un=un, adj=adj, rolls=rolls, segs=segs, live=live, live_since=sch[-1][1] if sch else None, rank=rank)
    return res


def chart_leg(name, key, rec, m5_days, m15_days):
    """A cog_chart leg JSON + its legs_meta row (same fields as build_leg_bars' stitched I2)."""
    import build_leg_bars as B
    r = K.ROOTS[key]
    d = rec['un']
    end, start = d.index.max(), d.index.min()
    m15 = B.bars(d, '15min')
    m15 = m15[m15.index >= end - pd.Timedelta(days=m15_days)]
    m5 = B.bars(d[d.index >= end - pd.Timedelta(days=m5_days + 1)], '5min')
    m5 = m5[m5.index >= end - pd.Timedelta(days=m5_days)]
    h1 = B.bars(d, '1h')
    cov = B.coverage(d)
    which = 'front' if rec['rank'] == 1 else '2nd'
    rule = {'strip': 'ranked by expiry, moves on the front contract\'s last trading day', 'fnd2': 'rolls 2 business days before first notice',
            'ltd3': 'rolls 3 business days before the last trading day', 'ltd5': 'rolls 5 business days before the last trading day',
            'asx3': 'rolls 3 days before the 15th', 'thu8': 'rolls on the Thursday 8 days before the 3rd Friday', 'dx5': 'rolls 5 business days before expiry',
            'expiry': 'rolls at expiry'}[r.roll]
    label = f'{r.label} {name} rolling ({which} contract, unadjusted)'
    period = f'always the {which} {r.label} contract; {rule} (scripts/ibkr/contracts.py); unadjusted, so the line steps at each roll'
    live_since = rec['live_since']
    obj = dict(name=name, label=label, group=r.group, side=r.side, kind=r.chart_kind, period=period, source='IBKR 1-minute MIDPOINT per contract, stitched (scripts/ibkr/continuous.py)',
               convention='bar-open time (TradingView)', first=str(start), asOf=str(end), liveFrom=rec['live'],
               liveSince=int(live_since.timestamp()) if live_since is not None else None, segments=rec['segs'], rolls=rec['rolls'], m5=B.pack(m5), m15=B.pack(m15), h1=B.pack(h1))
    first_of = lambda b: str(b.index.min())[:10] if len(b) else None
    meta = dict(name=name, label=label, group=r.group, side=r.side, kind=r.chart_kind, period=period, first=str(start)[:10], asOf=str(end), m5=len(m5), m15=len(m15), h1=len(h1),
                m5First=first_of(m5), m15First=first_of(m15), h1First=first_of(h1), folders=['stitched'], stem=name, stitched=True, segments=rec['segs'], **cov)
    return obj, meta


def aliases(today, cache):
    """Old names of rolled roots -> {to: ROOT1, rollAt: date the named contract rolled} (the server switches on rollAt)."""
    out = {}
    for n, (key, ym) in K.LEGACY.items():
        r = K.ROOTS[key]
        if not r.rolled:
            continue
        y, m = int(ym[:4]), int(ym[4:6])
        out[n] = dict(to=f'{key}1', root=key, rollAt=str(K.roll_date(r, y, m, contract_ltd(key, y, m, cache))))
    return out


def build_all(today=None, m5_days=30, m15_days=180, write_chart=True):
    """Build every root; write the files described in the module docstring. Returns the legs_meta rows of the chart legs written."""
    today = today or dt.datetime.now(dt.timezone.utc).date()
    cache = load_cache()
    CONT.mkdir(parents=True, exist_ok=True)
    meta, all_rolls, closes = [], [], {}
    for key, r in K.ROOTS.items():
        if r.kind == 'index':
            continue
        for name, rec in build_root(key, today, cache, m5_days, m15_days).items():
            for nm, frame in ((name, rec['un']), (f'{name}_adj', rec['adj'])):
                f = frame.reset_index()      # time kept as a UTC timestamp column (formatting millions of strings costs minutes a run)
                tmp = CONT / f'.{nm}.parquet.tmp'
                f.to_parquet(tmp, index=False); tmp.replace(CONT / f'{nm}.parquet')
            all_rolls += [dict(series=name, root=key, **x) for x in rec['rolls']]
            if rec['rank'] == 1 or not r.rolled:
                closes[name] = daily_closes(rec['un'], today)
            if write_chart:
                obj, row = chart_leg(name, key, rec, m5_days, m15_days)
                (CHART / f'leg_{name}.json').write_text(json.dumps(obj, separators=(',', ':')), encoding='utf-8')
                meta.append(row)
            print(f'{name} (continuous): {str(rec["un"].index.min())[:10]} -> {str(rec["un"].index.max())[:16]} | ' +
                  ' | '.join(f"{s['contract']} {s['start'][:10]}..{s['end'][:10]}" for s in rec['segs']) +
                  (' | rolls ' + ', '.join(f"{x['date']} {x['from']}->{x['to']} gap {x['gap']}" for x in rec['rolls']) if rec['rolls'] else ''))
    gen = dt.datetime.now(dt.timezone.utc).isoformat()
    (CONT / 'rolls.json').write_text(json.dumps(dict(generatedAt=gen, rule='scripts/ibkr/contracts.py roll_date; gap = next close - previous close on the last common 1-minute bar before the switch',
                                                     rolls=all_rolls), indent=1), encoding='utf-8')
    (CONT / 'daily_closes.json').write_text(json.dumps(dict(generatedAt=gen, note='last 1-minute MIDPOINT close of each completed UTC weekday, unadjusted continuous series', series=closes),
                                                       separators=(',', ':')), encoding='utf-8')
    if write_chart:
        (CHART / 'aliases.json').write_text(json.dumps(aliases(today, cache), indent=1), encoding='utf-8')
    return meta


# ---------------------------------------------------------------- expiry guard (legs_r2.py push writes it as rates-legs/_health.json)

def newest_bar(paths):
    t = None
    for f in paths:
        try:
            col = pd.read_parquet(f, columns=['time']).time
            x = pd.Timestamp(col.max())      # ISO strings sort as times: no parse of every row
            x = x.tz_localize('UTC') if x.tzinfo is None else x.tz_convert('UTC')
        except Exception:
            continue
        t = x if t is None or x > t else t
    return t


def health_row(key, today, seq, have, now):
    """Pure: one root's health. seq = sequence() covering today; have = {contract name: newest bar Timestamp or None}.
    Flags: 'stale' when the active contract's newest bar is more than one business day old (or missing); 'roll-window-no-next'
    when the active contract is within ROLL_WINDOW_BD business days of its roll and the next contract has no bars."""
    r = K.ROOTS[key]
    i = next((k for k, z in enumerate(seq) if z['roll'] > today), None)
    if i is None:
        return dict(root=key, flags=['no contract after today in the sequence'])
    act, nxt = seq[i], seq[i + 1] if i + 1 < len(seq) else None
    nb = have.get(act['name'])
    nb_next = have.get(nxt['name']) if nxt else None
    to_roll = K.bdays_between(today, act['roll'], r.cal)
    flags = []
    if nb is None:
        flags.append('stale')
    else:
        age_bd = K.bdays_between(nb.date(), now.date(), r.cal)
        if age_bd > 1:
            flags.append('stale')
    in_window = r.rolled and to_roll <= K.ROLL_WINDOW_BD
    if in_window and nb_next is None:
        flags.append('roll-window-no-next')
    return dict(root=key, active=act['name'], rollDate=str(act['roll']), bdToRoll=to_roll, newestBar=nb.isoformat() if nb is not None else None,
                next=nxt['name'] if nxt else None, nextNewestBar=nb_next.isoformat() if nb_next is not None else None, inRollWindow=bool(in_window), flags=flags)


def health(now=None):
    """Every root's health from the files on disk (indices: newest bar only)."""
    import build_leg_bars as B
    now = now or pd.Timestamp.now(tz=UTC)
    today = now.date()
    cache = load_cache()
    rows = []
    for key, r in K.ROOTS.items():
        if r.kind == 'index':
            f = [OUTROOT / d / f'{r.tag}_{key}.parquet' for d in B.DIRS]
            nb = newest_bar([x for x in f if x.exists()])
            age = K.bdays_between(nb.date(), today, r.cal) if nb is not None else None
            rows.append(dict(root=key, active=key, newestBar=nb.isoformat() if nb is not None else None, flags=[] if age is not None and age <= 1 else ['stale']))
            continue
        fs = files_by_contract(key)
        ey, em = K._add_months(today.year, today.month, 15)
        sy, sm = K._add_months(today.year, today.month, -4)
        seq = sequence(key, sy, sm, ey, em, cache)
        have = {K.contract_name(r, y, m): newest_bar(p) for (y, m), p in fs.items()}
        rows.append(health_row(key, today, seq, have, now))
    return dict(generatedAt=now.isoformat(), rollWindowBd=K.ROLL_WINDOW_BD, roots=rows, flagged=[x['root'] for x in rows if x.get('flags')])


if __name__ == '__main__':
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument('--m5-days', type=int, default=30)
    ap.add_argument('--m15-days', type=int, default=180)
    ap.add_argument('--no-chart', action='store_true')
    ap.add_argument('--health', action='store_true', help='print the expiry guard and exit')
    a = ap.parse_args()
    if a.health:
        print(json.dumps(health(), indent=1))
        sys.exit(0)
    rows = build_all(m5_days=a.m5_days, m15_days=a.m15_days, write_chart=not a.no_chart)
    print(len(rows), 'continuous chart legs')
