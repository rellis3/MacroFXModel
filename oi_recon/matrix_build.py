"""Build the OI heatmap matrix TSV from CME settlement JSON — no DOM scraping.

WHY THIS EXISTS. The QuikStrike heatmap is an ASP.NET widget whose column layout
depends on a `Report:` dropdown; a wrong setting yields a table that parses to
zero OI without erroring (verified 2026-07-29). The CmeWS settlements JSON, by
contrast, is a stable per-strike record: {strike, type, settle, volume,
openInterest}. So we take the JSON and SYNTHESISE the exact tab-separated text
the existing parser already eats.

That direction matters. Nothing here re-implements max pain, walls, GEX or the
expiry choice — this module's only job is to emit text that `parseOIMatrix`
(js/oi.js) consumes, so all the strategy math stays in the one place it already
lives and stays covered by js/oiPasteContract.test.mjs.

THE FORMAT, read off `_matrixRows` in js/oi.js (do not guess at it):
    line 0   <futures price>                     <- col0 numeric => "price row"
    line 1   Strike <TAB> "9 DTE" <TAB> ...      <- one "N DTE" token per expiry
    line 2   Strike <TAB> EUUQ6 <TAB> ...        <- one code per expiry, count MUST
                                                    equal nExp or codes are dropped
    line 3   <TAB> C <TAB> P <TAB> C <TAB> P ... <- the C/P header row: what
                                                    _matrixHeaderIdx searches for
    line 4+  <strike> <TAB> call <TAB> put ...   <- (call,put) pair per expiry
Rules that bite if ignored:
  * the code row's first cell must be a LABEL, not a number/empty — a code sharing
    a row with a price is classified as an UNDERLYING and thrown away;
  * codes are used only when there is exactly one per expiry column, otherwise
    js/oi.js deliberately reports none (a missing label beats a wrong one);
  * nExp is derived from the C/P row, so it must have 2x the expiry count.
"""
from __future__ import annotations

from datetime import date, datetime

# Sentinel written when an expiry's date is unknown. See `dte_for`.
DTE_UNKNOWN = None


def _num(v) -> float:
    """CME numbers arrive as display strings: '6,881', '-', '.00035', 'CAB'."""
    s = str(v or '').strip().replace(',', '')
    if not s or s in ('-', 'CAB'):
        return 0.0
    try:
        return float(s)
    except ValueError:
        return 0.0


def strikes_from_settlements(payload: dict, field: str = 'openInterest') -> dict:
    """One settlements payload -> {strike: (call, put)} for `field`.

    `field` is 'openInterest' or 'volume' — the same payload carries both, so the
    OI matrix and the volume matrix cost one request between them.

    Drops the 'Total' summary row: left in, it becomes a 0.0 strike carrying the
    whole book's OI and would sit at the bottom of every ladder.
    """
    out: dict = {}
    for row in (payload or {}).get('settlements', []):
        raw = str(row.get('strike', '')).strip()
        if not raw or raw.lower() == 'total':
            continue
        try:
            k = float(raw.replace(',', ''))
        except ValueError:
            continue
        if k <= 0:
            continue
        oi = _num(row.get(field))
        c, p = out.get(k, (0.0, 0.0))
        if str(row.get('type', '')).lower().startswith('c'):
            out[k] = (oi, p)
        else:
            out[k] = (c, oi)
    return out


def dte_for(code: str, code_dates: dict, as_of: date):
    """Calendar days to expiry for an expiry CODE.

    DTE is NOT in the settlements payload, so it comes from a code->expiry-date
    map (seeded from a captured Settlements term table, where the mapping is
    published). Unknown code => None, and the caller omits it rather than
    inventing one: js/oi.js scores the primary expiry on near-money OI and
    matches the smile by CODE, so a missing DTE degrades gracefully whereas a
    fabricated one silently reweights the choice.
    """
    d = (code_dates or {}).get(code)
    if not d:
        return DTE_UNKNOWN
    if isinstance(d, str):
        for fmt in ('%d/%m/%Y', '%Y-%m-%d', '%m/%d/%Y'):
            try:
                d = datetime.strptime(d, fmt).date()
                break
            except ValueError:
                continue
        if isinstance(d, str):
            return DTE_UNKNOWN
    return (d - as_of).days


def parse_term_tsv(tsv: str) -> dict:
    """Harvest {code: 'dd/mm/yyyy'} from a captured Settlements term table.

    Col 0 = SYMBOL, col 2 = EXPIRATION DATE — the same discriminator
    `parseSettlementTermStructure` uses (a dd/mm/yyyy date in col 2 marks a data
    row), so this agrees with the JS by construction.
    """
    out = {}
    for line in (tsv or '').replace('\r', '').split('\n'):
        c = line.split('\t')
        if len(c) < 3:
            continue
        code, dt = c[0].strip(), c[2].strip()
        if code and len(dt.split('/')) == 3 and dt.split('/')[0].isdigit():
            out[code] = dt
    return out


def build_matrix_tsv(expiries: list, futures: float | None = None,
                     code_dates: dict | None = None, as_of: date | None = None) -> str:
    """expiries = [{'code': 'EUUQ6', 'strikes': {k: (call, put)}}, ...] -> TSV.

    Expiry ORDER is preserved as given; the caller sorts (by DTE, near first) so
    the emitted columns read like the real heatmap.
    """
    as_of = as_of or date.today()
    expiries = [e for e in expiries if e.get('strikes')]
    if not expiries:
        return ''
    # TWO expiries minimum, and it is not a style preference. js/oi.js finds the
    # matrix header by scanning for a row of >=4 cells that are all 'C' or 'P'
    # (_matrixHeaderIdx); one expiry emits only 'C','P', the header is never
    # found, and parseOIMatrix returns null. Discovered by round-tripping a
    # single-expiry file — it produced a clean-looking TSV that parsed to nothing.
    if len(expiries) < 2:
        raise ValueError(
            f'need >=2 expiries to emit a parseable matrix (got {len(expiries)}); '
            "js/oi.js's header scan requires >=4 C/P cells")
    n = len(expiries)
    codes = [e['code'] for e in expiries]
    dtes = [dte_for(c, code_dates or {}, as_of) for c in codes]

    all_strikes = sorted({k for e in expiries for k in e['strikes']})
    lines = []
    # Price row. Col0 numeric => js/oi.js reads it as the futures anchor and will
    # not mistake anything on this row for an expiry code.
    lines.append(f'{futures:g}' if futures else '0')
    # DTE row — emitted only if EVERY expiry resolved, because js/oi.js maps DTE
    # tokens onto columns positionally: a partial list would misalign the rest.
    if all(d is not None for d in dtes):
        lines.append('Strike\t' + '\t'.join(f'{d} DTE' for d in dtes))
    # Code row. First cell is a label, so these are read as expiry codes.
    lines.append('Strike\t' + '\t'.join(codes))
    # C/P header: 2 cells per expiry. _matrixHeaderIdx needs >=4 and all C or P.
    lines.append('\t' + '\t'.join(['C', 'P'] * n))
    for k in all_strikes:
        cells = [_fmt_strike(k)]
        for e in expiries:
            c, p = e['strikes'].get(k, (0.0, 0.0))
            cells += [f'{c:g}', f'{p:g}']
        lines.append('\t'.join(cells))
    return '\n'.join(lines) + '\n'


def _fmt_strike(k: float) -> str:
    """Keep FX strikes at full precision without trailing-zero noise on indices."""
    s = f'{k:.5f}'.rstrip('0').rstrip('.')
    return s or '0'
