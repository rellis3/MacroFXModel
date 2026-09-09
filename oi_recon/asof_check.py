"""Is this capture serving the session it CLAIMS to be?

Every other check in the sweep asks whether a table is well-formed: right columns,
right product, non-zero OI, a full ladder rather than a window. None of them asks
which SETTLEMENT the numbers belong to, and that is the one question that matters,
because a capture of last Friday's book is complete, well-formed and wrong.

Found live 2026-09-09. The 05:05Z run reported `44/44 tables captured, 11/11
ingested, VERDICT OK` while every OI matrix was still serving the 04/09 settlement
- two business days stale, on all eleven products. It had been unnoticed since the
Monday because Sat/Sun and the Labor Day holiday made a repeated book look
perfectly legitimate. The bots traded those levels; the dashboard said "SAVED 3h
ago"; nothing anywhere said 04/09.

## Where the answer comes from

QuikStrike hands us the date twice, in two independent views, and we already
capture both:

  * the OI CHANGE MATRIX heading names it outright -
        EUR/USD (EUU|6E) Open Interest Change Matrix (08/09/2026 vs 04/09/2026)
    (parsed at capture time by pull_quikstrike and written to the sweep's
    `asof.json`, because the heading is gone by the time anyone reads the TSV);
  * the SETTLES view implies it - every row carries an expiry date and its DTE, so
    `expiry - DTE` is the session the tool priced that row against.

## Why compare them against each other, and not against the clock

The obvious check - "is the book older than N days" - needs a trading calendar, and
would have cried wolf on this exact fortnight: a Monday run legitimately repeats
Friday, and the Labor Day Monday made Tuesday's run legitimately repeat Friday too.
Encoding CME's holiday schedule here is a maintenance liability and would go stale
silently, which is the failure mode this module exists to catch.

Comparing the two views needs no calendar at all. Both are read in the SAME session,
seconds apart, from the same vendor. A holiday moves both together, so it cannot
produce a disagreement; only one view falling behind the other can. Validated
against every capture from 2026-09-02 to 2026-09-09:

    run         settles     matrix      bdays behind   verdict
    2026-09-02  2026-09-01  2026-08-31            1    ok
    2026-09-03  2026-09-02  2026-09-01            1    ok
    2026-09-04  2026-09-03  2026-09-03            0    ok
    2026-09-05  2026-09-04  2026-09-04            0    ok   <- Saturday
    2026-09-07  2026-09-04  2026-09-04            0    ok   <- Monday, no weekend settle
    2026-09-08  2026-09-04  2026-09-04            0    ok   <- Labor Day, still Friday's
    2026-09-09  2026-09-08  2026-09-04            2    ALERT

One alert, on the one bad night, through a weekend and a public holiday, with no
holiday table. The tolerance is ONE business day because the matrices genuinely do
publish behind the settles view sometimes (the 09-02 and 09-03 rows above are
healthy); two is the point at which a whole session has gone missing.

  python asof_check.py --sweep out/2026-09-09/quikstrike
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from collections import Counter
from datetime import date, timedelta
from pathlib import Path

HERE = Path(__file__).resolve().parent

# The tool's own heading, e.g. "... Open Interest Change Matrix (08/09/2026 vs
# 04/09/2026)". dd/mm/yyyy - confirmed by rows no month could produce ("31/08/2026").
ASOF_RE = re.compile(r'Open Interest Change Matrix\s*\((\d{2})/(\d{2})/(\d{4})')

# A settles data row: SYMBOL, DTE, EXPIRATION DATE, ... The header block spans
# several ragged lines, so match on the SHAPE of a data row rather than a row index.
_SETTLE_ROW = re.compile(r'^\d+$')


def asof_from_label(label: str) -> date | None:
    """The settlement date the OI Change Matrix says it is showing."""
    m = ASOF_RE.search(label or '')
    if not m:
        return None
    try:
        return date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
    except ValueError:
        return None


def settles_asof(path: Path, sample: int = 12) -> date | None:
    """The session the SETTLES view priced against, as `expiry - DTE`.

    Read from up to `sample` rows and take the most common answer rather than
    trusting the first: a single row with a mis-parsed DTE would otherwise move the
    whole verdict, and this decides whether a night's data gets published.
    """
    try:
        text = path.read_text(encoding='utf-8', errors='replace')
    except OSError:
        return None
    votes: Counter[date] = Counter()
    for line in text.splitlines():
        cells = line.split('\t')
        if len(cells) < 4:
            continue
        dte, exp = cells[1].strip(), cells[2].strip()
        if not _SETTLE_ROW.fullmatch(dte) or not re.fullmatch(r'\d{2}/\d{2}/\d{4}', exp):
            continue
        dd, mm, yy = (int(x) for x in exp.split('/'))
        try:
            votes[date(yy, mm, dd) - timedelta(days=int(dte))] += 1
        except ValueError:
            continue
        if sum(votes.values()) >= sample:
            break
    return votes.most_common(1)[0][0] if votes else None


def business_days_between(earlier: date, later: date) -> int:
    """Weekdays strictly after `earlier`, up to and including `later`. Never negative.

    Weekdays, not calendar days, so a Friday->Monday gap reads as the ONE session it
    is. Holidays are deliberately not modelled - see the module docstring: a holiday
    moves both views together, so it never reaches this function as a disagreement.
    """
    if later <= earlier:
        return 0
    n, d = 0, earlier
    while d < later:
        d += timedelta(days=1)
        if d.weekday() < 5:
            n += 1
    return n


def load_asof_map(sweep_dir: Path) -> dict:
    """The matrix as-of dates the sweep recorded, {product: 'YYYY-MM-DD'}."""
    try:
        raw = json.loads((sweep_dir / 'asof.json').read_text(encoding='utf-8'))
    except (OSError, json.JSONDecodeError):
        return {}
    return raw.get('asOf') or {}


def _safe_name(sym: str) -> str:
    """Byte-for-byte recon.safe_name, duplicated rather than imported so this stage
    stays runnable without the Playwright stack recon drags in - it has to work on a
    machine where the capture just failed."""
    return re.sub(r'[^A-Za-z0-9._-]+', '_', sym).strip('_')[:120] or 'unnamed'


def check(sweep_dir: Path, max_lag: int = 1) -> dict:
    """-> {rows: [...], stale: [...], judged: n}. Pure apart from reading the sweep."""
    asof = load_asof_map(sweep_dir)
    rows, stale = [], []
    for sym in sorted(asof):
        matrix = _iso(asof[sym])
        settles = settles_asof(sweep_dir / f'{_safe_name(sym)}_rawIVTerm.tsv')
        # Either side missing = NOT JUDGED, never "fine". A settles capture that
        # failed is already reported by the capture stage; silently passing this
        # check on the strength of a missing file is how a guard becomes decorative.
        lag = (business_days_between(matrix, settles)
               if (matrix and settles) else None)
        row = {'product': sym, 'matrix': matrix, 'settles': settles, 'lag': lag,
               'stale': lag is not None and lag > max_lag}
        rows.append(row)
        if row['stale']:
            stale.append(row)
    return {'rows': rows, 'stale': stale,
            'judged': sum(1 for r in rows if r['lag'] is not None)}


def _iso(s) -> date | None:
    try:
        y, m, d = (int(x) for x in str(s).split('-'))
        return date(y, m, d)
    except (ValueError, AttributeError):
        return None


def main() -> None:
    ap = argparse.ArgumentParser(description='Does this capture serve the session it claims?')
    ap.add_argument('--sweep', required=True, help="the capture dir (.../quikstrike)")
    ap.add_argument('--max-lag', type=int, default=1,
                    help='business days the OI matrix may trail the settles view (default 1)')
    a = ap.parse_args()

    d = Path(a.sweep)
    if not d.is_dir():
        print(f'[asof] {d} does not exist - skipping')
        sys.exit(0)

    r = check(d, a.max_lag)
    if not r['rows']:
        # No asof.json: an older capture, or a sweep that ran without the chg view.
        # Not a failure - but say so, so "no news" is never mistaken for "checked".
        print('[asof] no as-of dates recorded for this sweep (no asof.json) - NOT CHECKED')
        sys.exit(0)

    book = Counter(str(x['matrix']) for x in r['rows'] if x['matrix']).most_common(1)
    print(f"[asof] book {book[0][0] if book else '?'} · "
          f"{r['judged']}/{len(r['rows'])} judged · {len(r['stale'])} stale")
    for x in r['rows']:
        flag = ''
        if x['lag'] is None:
            flag = '  NOT JUDGED (missing settles or matrix date)'
        elif x['stale']:
            flag = f"  <-- STALE: {x['lag']} business day(s) behind"
        print(f"    {x['product']:<12} matrix {str(x['matrix']):<12} "
              f"settles {str(x['settles']):<12}{flag}")

    if r['stale']:
        print(f"\n  {len(r['stale'])} product(s) are serving an OLD settlement. The tables are "
              f"complete and well-formed; they are just not today's book.")
        print('  CME serves no OI history, so re-run the capture once the matrices have '
              'published rather than waiting for tomorrow.')
        sys.exit(1)
    sys.exit(0)


if __name__ == '__main__':
    main()
