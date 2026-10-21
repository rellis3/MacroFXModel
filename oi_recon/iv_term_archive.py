"""Daily implied-vol term-structure archive, built from the captures already on disk.

  python iv_term_archive.py            rebuild analysis/output/iv_term/iv_term_daily.csv from every out/<date>/
  python iv_term_archive.py --check    also print the latest day per product and any stale captures

WHAT IT READS. Every `*_rawIVTerm.tsv` under out/<date>/<sweep>/ for the three sweeps:
quikstrike (main: FX, gold, indices), quikstrike_secondary (commodities) and quikstrike_rates
(SOFR / Treasury options, capture-only). That file is QuikStrike's settlements term table:
one row per expiry with the ATM strike, the futures settle, the ATM straddle and CME's settlement
volatility (today and prior). Column layout is the one js/oi.js parseSettlementTermStructure reads:
  0 symbol  1 DTE  2 expiry dd/mm/yyyy  3 ATM strike  4 future  5 future prior  6 chg
  7 straddle  8 straddle prior  9 chg  10 vol  11 vol prior  12 chg  13.. open interest

WHAT IT WRITES. One long CSV, a row per (trade date, product, expiry). The trade date is the
settlement date, expiry - DTE, not the capture folder's date (the nightly runs after midnight UK).
A capture whose whole vol column equals the previous trade date's for the same product is flagged
`stale=1` (a cached session re-serving an old settlement - the OI scraper's known silent failure);
it is kept, not dropped, so a reader decides.

Units are CME's: percent vol for FX / metals / indices / energy; for SOFR (SR3) options QuikStrike
may quote price vol or basis-point vol - check the first rates capture before using the level.
Read-only on out/; writes nothing to KV.
"""
from __future__ import annotations

import argparse
import csv
import re
from datetime import date, datetime, timedelta
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT_DIR = HERE / 'out'
DEST = HERE.parent / 'analysis' / 'output' / 'iv_term' / 'iv_term_daily.csv'
SWEEPS = ('quikstrike', 'quikstrike_secondary', 'quikstrike_rates')
FIELDS = ['trade_date', 'capture_day', 'sweep', 'product', 'code', 'dte', 'expiry', 'atm_strike', 'future',
          'straddle', 'iv', 'iv_prior', 'oi_call', 'oi_put', 'stale']
DATE_RE = re.compile(r'^(\d{2})/(\d{2})/(\d{4})$')


def _num(cells, j):
    try:
        return float(str(cells[j]).replace(',', '').strip())
    except (IndexError, ValueError):
        return None


def parse_term(path: Path) -> list[dict]:
    rows = []
    for line in path.read_text(encoding='utf-8', errors='replace').splitlines():
        c = line.rstrip('\r').split('\t')
        if len(c) < 12:
            continue
        m = DATE_RE.match(str(c[2]).strip())
        dte, iv = _num(c, 1), _num(c, 10)
        if not m or dte is None or iv is None or iv <= 0:
            continue
        expiry = date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
        rows.append({
            'code': c[0].strip(), 'dte': dte, 'expiry': expiry.isoformat(),
            'trade_date': (expiry - timedelta(days=int(round(dte)))).isoformat(),
            'atm_strike': _num(c, 3), 'future': _num(c, 4), 'straddle': _num(c, 7),
            'iv': iv, 'iv_prior': _num(c, 11), 'oi_call': _num(c, 13), 'oi_put': _num(c, 15),
        })
    return rows


def build() -> list[dict]:
    out = []
    for day_dir in sorted(p for p in OUT_DIR.iterdir() if p.is_dir() and re.match(r'^\d{4}-\d{2}-\d{2}$', p.name)):
        for sweep in SWEEPS:
            for f in sorted((day_dir / sweep).glob('*_rawIVTerm.tsv')) if (day_dir / sweep).exists() else []:
                product = f.name.removesuffix('_rawIVTerm.tsv')
                rows = parse_term(f)
                if not rows:
                    continue
                # one trade date per file: the modal one (a stray expiry with odd DTE must not split it)
                td = max(set(r['trade_date'] for r in rows), key=[r['trade_date'] for r in rows].count)
                for r in rows:
                    r.update(trade_date=td, capture_day=day_dir.name, sweep=sweep, product=product, stale=0)
                out.extend(rows)
    # de-duplicate: the same trade date captured twice (a re-run) keeps the later capture
    keep = {}
    for r in out:
        keep[(r['trade_date'], r['product'], r['code'])] = r
    rows = sorted(keep.values(), key=lambda r: (r['product'], r['trade_date'], r['dte']))
    # stale flag: this trade date's vols identical to the previous trade date's for the product
    by_pd = {}
    for r in rows:
        by_pd.setdefault((r['product'], r['trade_date']), []).append(r)
    prev = {}
    for (prod, td) in sorted(by_pd):
        vec = tuple((r['code'], r['iv']) for r in by_pd[(prod, td)])
        if prev.get(prod) == vec:
            for r in by_pd[(prod, td)]:
                r['stale'] = 1
        prev[prod] = vec
    return rows


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument('--check', action='store_true')
    a = ap.parse_args()
    rows = build()
    DEST.parent.mkdir(parents=True, exist_ok=True)
    tmp = DEST.with_suffix('.part')
    with tmp.open('w', newline='', encoding='utf-8') as fh:
        w = csv.DictWriter(fh, fieldnames=FIELDS)
        w.writeheader()
        w.writerows(rows)
    tmp.replace(DEST)
    prods = sorted({r['product'] for r in rows})
    days = sorted({r['trade_date'] for r in rows})
    print(f'iv_term_archive: {len(rows)} rows, {len(prods)} products, trade dates {days[0]} -> {days[-1]} '
          f'({len(days)}), stale rows {sum(r["stale"] for r in rows)} -> {DEST.relative_to(HERE.parent)}')
    if a.check:
        for p in prods:
            pr = [r for r in rows if r['product'] == p]
            last = max(r['trade_date'] for r in pr)
            n = len({r['trade_date'] for r in pr})
            st = len({r['trade_date'] for r in pr if r['stale']})
            front = min((r for r in pr if r['trade_date'] == last), key=lambda r: r['dte'])
            print(f'  {p:14s} days {n:3d}  stale {st:2d}  last {last}  front {front["code"]} '
                  f'{front["dte"]:.0f}d iv {front["iv"]}')


if __name__ == '__main__':
    main()
