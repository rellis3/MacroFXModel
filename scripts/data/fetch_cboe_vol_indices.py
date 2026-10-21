"""Refresh the local Cboe volatility-index cache: analysis/surfaces/cboe/<SYM>.csv.

  python scripts/data/fetch_cboe_vol_indices.py          all symbols below
  python scripts/data/fetch_cboe_vol_indices.py VXN GVZ  just these

Cboe's free daily history files (cdn.cboe.com, no key) are saved RAW, in Cboe's own layout, so the
readers already on this folder keep working: 5-column files are DATE,OPEN,HIGH,LOW,CLOSE (use CLOSE;
the OPEN-column trap is DATA faults history), 2-column files are DATE,<SYM>. Dates are mm/dd/yyyy.

Why these: the free implied-vol history the repo can use for cross-asset vol work (C.OG's
Cross-Asset Volatility lesson, the rates-vol-gap study). FRED mirrors some of them but not all,
and was down on 2026-10-21. MOVE is ICE's, not Cboe's: it comes from Yahoo (^MOVE).
EVZ (euro FX vol) is withdrawn on the CDN (AccessDenied, 2026-10-21); FX implied vol comes
from the CME CVOL export and the nightly QuikStrike term captures instead.
"""
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEST = ROOT / "analysis" / "surfaces" / "cboe"
URL = "https://cdn.cboe.com/api/global/us_indices/daily_prices/{}_History.csv"
SYMBOLS = {
    # equity indices and the VIX term structure
    "VIX": "S&P 500 30d", "VIX1D": "S&P 500 1d", "VIX9D": "S&P 500 9d", "VIX3M": "S&P 500 3m",
    "VIX6M": "S&P 500 6m", "VIX1Y": "S&P 500 1y", "VXN": "Nasdaq-100", "VXD": "Dow", "RVX": "Russell 2000",
    "VVIX": "vol of VIX", "SKEW": "S&P 500 tail skew",
    # rates, commodities, EM, single names
    "VXTLT": "20+y Treasury ETF (TLT) - rates implied vol", "GVZ": "gold ETF", "OVX": "crude ETF",
    "VXSLV": "silver ETF", "VXGDX": "gold miners ETF", "VXEEM": "EM equity ETF", "VXFXI": "China ETF",
    "VXEWZ": "Brazil ETF", "VXAZN": "Amazon", "VXAPL": "Apple",
}


def fetch(sym: str) -> str:
    req = urllib.request.Request(URL.format(sym), headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8", errors="replace")


def main(syms: list[str]) -> int:
    DEST.mkdir(parents=True, exist_ok=True)
    bad = 0
    for s in syms:
        try:
            text = fetch(s).strip()
            lines = text.splitlines()
            if not lines or not lines[0].upper().startswith("DATE,") or len(lines) < 100:
                raise ValueError(f"unexpected payload: {lines[0][:60] if lines else 'empty'}")
            # never shrink a cache: a truncated download must not replace a full history
            old = DEST / f"{s}.csv"
            if old.exists() and len(old.read_text().splitlines()) > len(lines) + 5:
                raise ValueError(f"new file has {len(lines)} rows, cache has more; kept the cache")
            tmp = old.with_suffix(".part")
            tmp.write_text(text + "\n", encoding="utf-8")
            tmp.replace(old)
            print(f"{s:6s} {len(lines) - 1:6d} rows  {lines[1].split(',')[0]} -> {lines[-1].split(',')[0]}  ({SYMBOLS.get(s, '')})")
        except Exception as e:  # noqa: BLE001
            bad += 1
            print(f"{s:6s} FAILED: {e}")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:] or list(SYMBOLS)))
