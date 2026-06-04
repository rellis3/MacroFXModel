"""
Historical Correlation Builder — MacroFXModel

Fetches multi-year H4 bars from OANDA (paginated), computes:
  • Rolling pair-to-pair Pearson correlations of log returns
  • Rolling factor betas (DXY, Rates, VIX proxy) via OLS
  • EMA-based regime labels (BULL / BEAR / RANGE)
  • Regime-conditional statistics per pair per factor

Output: bot/data/corr_history.json
        bot/data/corr_history_raw.json  (if --save-raw)

Usage:
  python scripts/build_corr_history.py
  python scripts/build_corr_history.py --years 5
  python scripts/build_corr_history.py --years 3 --window 60 --step 6
  python scripts/build_corr_history.py --dry-run          # shows stats, skips save
"""

import argparse
import datetime
import json
import math
import os
import sys
import urllib.request
from collections import defaultdict


# ── Env / config ─────────────────────────────────────────────────────────────

def _load_dotenv():
    for candidate in (
        os.path.join(os.path.dirname(__file__), '.env'),
        os.path.join(os.path.dirname(__file__), '..', '.env'),
    ):
        if not os.path.isfile(candidate):
            continue
        with open(candidate, encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('#') or '=' not in line:
                    continue
                k, _, v = line.partition('=')
                k, v = k.strip(), v.strip().strip('"').strip("'")
                if k and k not in os.environ:
                    os.environ[k] = v
        break

_load_dotenv()

OUTPUT_FILE = os.path.join(os.path.dirname(__file__), '..', 'bot', 'data', 'corr_history.json')
OUTPUT_RAW  = os.path.join(os.path.dirname(__file__), '..', 'bot', 'data', 'corr_history_raw.json')

PAIRS = ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'NZDUSD', 'USDCAD', 'USDCHF', 'GBPJPY', 'EURGBP', 'XAUUSD']

FACTOR_PROXIES = {
    'dxy':   ('EURUSD', -1.2),
    'rates': ('USDJPY',  1.0),
    'vix':   ('USDCHF', -1.0),
}

_OANDA_OVERRIDES = {
    'XAUUSD': 'XAU_USD', 'XAGUSD': 'XAG_USD',
    'NAS100': 'NAS100_USD', 'SPX500': 'SPX500_USD',
}

CHUNK_SIZE = 4000   # OANDA max is 5000; keep headroom


# ── OANDA helpers ─────────────────────────────────────────────────────────────

def _oanda_sym(symbol: str) -> str | None:
    s = symbol.upper()
    if s in _OANDA_OVERRIDES:
        return _OANDA_OVERRIDES[s]
    if len(s) == 6 and s.isalpha():
        return f'{s[:3]}_{s[3:]}'
    return None


def _fetch_chunk(oanda_sym: str, from_dt: datetime.datetime, to_dt: datetime.datetime,
                 api_key: str, practice: bool) -> list[dict]:
    host = 'api-fxpractice.oanda.com' if practice else 'api-fxtrade.oanda.com'
    from_str = from_dt.strftime('%Y-%m-%dT%H:%M:%SZ')
    to_str   = to_dt.strftime('%Y-%m-%dT%H:%M:%SZ')
    url = (f'https://{host}/v3/instruments/{oanda_sym}/candles'
           f'?granularity=H4&price=M&from={from_str}&to={to_str}')
    req = urllib.request.Request(url, headers={'Authorization': f'Bearer {api_key}'})
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.loads(resp.read())
    return [c for c in data.get('candles', []) if c.get('complete', True)]


def fetch_h4_bars(symbol: str, years: float, api_key: str, practice: bool = False
                  ) -> tuple[list[float], list[datetime.datetime]]:
    """
    Fetch H4 OHLCV bars for `years` years back from now.
    Returns (closes, timestamps) aligned lists.
    Handles OANDA's 5000-bar limit by chunking into CHUNK_SIZE windows.
    """
    osym = _oanda_sym(symbol)
    if not osym:
        print(f'  [SKIP] {symbol}: no OANDA symbol mapping')
        return [], []

    now   = datetime.datetime.utcnow()
    start = now - datetime.timedelta(days=years * 365.25)

    closes, timestamps = [], []
    chunk_start = start

    print(f'  {symbol} ({osym}): fetching {years}y from {start.strftime("%Y-%m-%d")}', end='', flush=True)

    while chunk_start < now:
        chunk_end = min(chunk_start + datetime.timedelta(hours=CHUNK_SIZE * 4), now)
        try:
            candles = _fetch_chunk(osym, chunk_start, chunk_end, api_key, practice)
        except Exception as e:
            print(f'\n    [WARN] chunk {chunk_start.date()}→{chunk_end.date()}: {e}')
            chunk_start = chunk_end
            continue

        for c in candles:
            ts_str = c['time'][:19].replace('T', ' ')
            try:
                ts = datetime.datetime.strptime(ts_str, '%Y-%m-%d %H:%M:%S')
            except ValueError:
                continue
            closes.append(float(c['mid']['c']))
            timestamps.append(ts)

        print('.', end='', flush=True)
        chunk_start = chunk_end

    print(f' {len(closes)} bars')
    return closes, timestamps


# ── Maths ─────────────────────────────────────────────────────────────────────

def log_returns(prices: list[float]) -> list[float]:
    return [math.log(max(prices[i], 1e-10) / max(prices[i - 1], 1e-10))
            for i in range(1, len(prices))]


def pearson_corr(xs: list[float], ys: list[float]) -> float | None:
    n = len(xs)
    if n < 5:
        return None
    mx = sum(xs) / n
    my = sum(ys) / n
    num, da, db = 0.0, 0.0, 0.0
    for x, y in zip(xs, ys):
        a, b = x - mx, y - my
        num += a * b
        da  += a * a
        db  += b * b
    denom = math.sqrt(da * db)
    return max(-1.0, min(1.0, num / denom)) if denom > 1e-12 else 0.0


def ols_beta(y: list[float], x: list[float]) -> tuple[float, float]:
    """Returns (beta, r_squared)."""
    n = len(y)
    if n < 3:
        return 0.0, 0.0
    mx = sum(x) / n
    my = sum(y) / n
    cov = sum((xi - mx) * (yi - my) for xi, yi in zip(x, y))
    varx = sum((xi - mx) ** 2 for xi in x)
    if varx < 1e-12:
        return 0.0, 0.0
    beta = cov / varx
    alpha = my - beta * mx
    ss_res = sum((yi - alpha - beta * xi) ** 2 for yi, xi in zip(y, x))
    ss_tot = sum((yi - my) ** 2 for yi in y)
    r2 = max(0.0, min(1.0, 1.0 - ss_res / ss_tot)) if ss_tot > 1e-12 else 0.0
    return round(beta, 5), round(r2, 4)


def ema(values: list[float], period: int) -> list[float]:
    result = list(values)
    k = 2.0 / (period + 1)
    for i in range(1, len(result)):
        result[i] = values[i] * k + result[i - 1] * (1 - k)
    return result


def classify_regime(closes: list[float], i: int) -> str:
    """EMA 20/50 crossover on the last window up to index i (inclusive)."""
    window = closes[max(0, i - 59):i + 1]
    n = len(window)
    if n < 25:
        return 'RANGE'
    fast = ema(window, 20)
    slow = ema(window, min(50, n))
    ref_price = max(abs(window[-1]), 1e-10)
    spread = (fast[-1] - slow[-1]) / ref_price
    slope  = (fast[-1] - fast[-6]) / ref_price if n >= 6 else 0.0
    if spread > 0.0025 and slope > 0.00015:
        return 'BULL'
    if spread < -0.0025 and slope < -0.00015:
        return 'BEAR'
    return 'RANGE'


# ── Main computation ──────────────────────────────────────────────────────────

def build_history(bar_data: dict, pairs: list[str], window: int, step: int) -> list[dict]:
    """
    bar_data: {symbol: (closes_list, timestamps_list)}
    Returns list of snapshot records for the dashboard.
    """
    # Build return series for every pair (indexed by position, synced via timestamp)
    # First align all series to a common timestamp grid using the reference pair (EURUSD)
    ref_pair = next((p for p in ['EURUSD', 'GBPUSD', 'USDJPY'] if p in bar_data), None)
    if ref_pair is None:
        print('[ERROR] No reference pair available for alignment')
        return []

    ref_ts = bar_data[ref_pair][1]
    ts_set = set(ref_ts)

    # Build aligned returns for each pair (NaN where data missing)
    aligned: dict[str, list[float | None]] = {}
    for sym in pairs:
        if sym not in bar_data:
            continue
        closes, timestamps = bar_data[sym]
        # Map timestamp → return
        ret_map: dict[datetime.datetime, float] = {}
        rets = log_returns(closes)
        for i, ts in enumerate(timestamps[1:], start=1):
            if i <= len(rets):
                ret_map[ts] = rets[i - 1]
        # Align to reference grid (skip first ts since no return there)
        aligned[sym] = [ret_map.get(ts) for ts in ref_ts[1:]]

    ref_ts_aligned = ref_ts[1:]   # drop first entry (no return)
    n = len(ref_ts_aligned)

    # Factor return series
    factor_rets: dict[str, list[float | None]] = {}
    for fname, (proxy_sym, sign) in FACTOR_PROXIES.items():
        if proxy_sym in aligned:
            factor_rets[fname] = [v * sign if v is not None else None
                                   for v in aligned[proxy_sym]]

    # Reference closes for regime classification (use ref_pair)
    ref_closes = bar_data[ref_pair][0]

    records = []
    for end_idx in range(window, n + 1, step):
        start_idx = end_idx - window
        ts = ref_ts_aligned[end_idx - 1]

        # Regime at this bar (use ref_pair closes)
        close_idx = min(end_idx, len(ref_closes) - 1)
        regime = classify_regime(ref_closes, close_idx)

        # Correlations between pairs
        corr: dict[str, float | None] = {}
        beta: dict[str, dict] = {}

        valid_pairs = [p for p in pairs if p in aligned]
        for i, pa in enumerate(valid_pairs):
            ya = aligned[pa][start_idx:end_idx]
            ya_clean = [v for v in ya if v is not None]

            # Factor betas via OLS
            beta[pa] = {}
            for fname, frets in factor_rets.items():
                fa = frets[start_idx:end_idx]
                pairs_zip = [(y, f) for y, f in zip(ya, fa) if y is not None and f is not None]
                if len(pairs_zip) >= 10:
                    y_vals = [v[0] for v in pairs_zip]
                    f_vals = [v[1] for v in pairs_zip]
                    b, r2 = ols_beta(y_vals, f_vals)
                    beta[pa][fname] = round(b, 4)
                    beta[pa][f'r2_{fname}'] = r2

            for pb in valid_pairs[i + 1:]:
                yb = aligned[pb][start_idx:end_idx]
                common = [(a, b_) for a, b_ in zip(ya, yb) if a is not None and b_ is not None]
                if len(common) >= 10:
                    corr[f'{pa}_{pb}'] = round(pearsonCorr := pearson_corr(
                        [v[0] for v in common], [v[1] for v in common]
                    ) or 0.0, 4)

        records.append({
            'ts':     int(ts.timestamp() * 1000),
            'ts_str': ts.strftime('%Y-%m-%d %H:%M'),
            'regime': regime,
            'corr':   corr,
            'beta':   beta,
        })

    return records


# ── Regime statistics ─────────────────────────────────────────────────────────

def compute_regime_stats(records: list[dict], pairs: list[str]) -> dict:
    """
    Returns {pair: {regime: {dxy_mean, rates_mean, vix_mean, n}}}
    """
    data: dict = defaultdict(lambda: defaultdict(lambda: defaultdict(list)))
    for rec in records:
        regime = rec['regime']
        for pair, betas in rec.get('beta', {}).items():
            for factor in ('dxy', 'rates', 'vix'):
                if factor in betas:
                    data[pair][regime][factor].append(betas[factor])

    stats: dict = {}
    for pair in data:
        stats[pair] = {}
        for regime, factors in data[pair].items():
            def _ms(vals):
                if not vals: return None, None
                m = sum(vals) / len(vals)
                s = math.sqrt(sum((v - m) ** 2 for v in vals) / len(vals)) if len(vals) > 1 else 0.0
                return round(m, 4), round(s, 4)
            dm, ds = _ms(factors.get('dxy', []))
            rm, rs = _ms(factors.get('rates', []))
            vm, vs = _ms(factors.get('vix', []))
            n = max(len(factors.get(f, [])) for f in ('dxy', 'rates', 'vix'))
            stats[pair][regime] = {
                'dxy_mean': dm, 'dxy_std': ds,
                'rates_mean': rm, 'rates_std': rs,
                'vix_mean': vm, 'vix_std': vs,
                'n': n,
            }
    return stats


# ── Corr matrix summary ───────────────────────────────────────────────────────

def compute_avg_corr_matrix(records: list[dict]) -> dict[str, dict[str, float]]:
    """Average correlation across all time for the full matrix."""
    sums: dict[str, list] = defaultdict(list)
    for rec in records:
        for key, val in rec.get('corr', {}).items():
            sums[key].append(val)
    return {k: round(sum(v) / len(v), 4) for k, v in sums.items() if v}


# ── CLI ───────────────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser(description='Build multi-year correlation history from OANDA H4 bars')
    ap.add_argument('--years',    type=float, default=5.0,  help='Years of history (default: 5)')
    ap.add_argument('--window',   type=int,   default=60,   help='Rolling correlation window in bars (default: 60 = 10 days)')
    ap.add_argument('--step',     type=int,   default=6,    help='Step between snapshots in bars (default: 6 = 1 day)')
    ap.add_argument('--pairs',    nargs='+',  default=PAIRS, help='Pairs to fetch')
    ap.add_argument('--key',      default=os.environ.get('OANDA_KEY', ''), help='OANDA API key')
    ap.add_argument('--practice', action='store_true',
                    default=os.environ.get('OANDA_PRACTICE', '').lower() in ('1', 'true'),
                    help='Use OANDA practice endpoint')
    ap.add_argument('--out',      default=OUTPUT_FILE, help='Output JSON path')
    ap.add_argument('--save-raw', action='store_true', help='Also save raw bar data')
    ap.add_argument('--dry-run',  action='store_true', help='Print stats only, skip file save')
    args = ap.parse_args()

    if not args.key:
        print('[ERROR] OANDA_KEY not set. Pass --key or set OANDA_KEY env var.')
        sys.exit(1)

    print(f'\nCorrelation History Builder')
    print(f'  Years:    {args.years}')
    print(f'  Window:   {args.window} bars ({args.window * 4}h = {args.window * 4 / 24:.1f} days)')
    print(f'  Step:     {args.step} bars ({args.step * 4}h ≈ 1 per {args.step * 4}h)')
    print(f'  Pairs:    {", ".join(args.pairs)}')
    print(f'  Endpoint: {"practice" if args.practice else "live"}')
    print()

    # ── Fetch bars ────────────────────────────────────────────────────────────
    print('Fetching H4 bars from OANDA...')
    all_syms = list({p for p in args.pairs} | {proxy for _, (proxy, _) in FACTOR_PROXIES.items()})
    bar_data = {}
    for sym in all_syms:
        closes, timestamps = fetch_h4_bars(sym, args.years, args.key, args.practice)
        if len(closes) >= args.window + 1:
            bar_data[sym] = (closes, timestamps)
        else:
            print(f'  [SKIP] {sym}: only {len(closes)} bars (need ≥{args.window + 1})')

    if not bar_data:
        print('[ERROR] No bars fetched.')
        sys.exit(1)

    available_pairs = [p for p in args.pairs if p in bar_data]
    print(f'\nAvailable pairs: {", ".join(available_pairs)}')

    # ── Build rolling history ─────────────────────────────────────────────────
    print(f'\nComputing rolling correlations (window={args.window}, step={args.step})...')
    records = build_history(bar_data, available_pairs, args.window, args.step)
    print(f'Generated {len(records)} snapshot records')

    if not records:
        print('[ERROR] No records generated.')
        sys.exit(1)

    # Regime breakdown
    regime_cnts: dict[str, int] = defaultdict(int)
    for r in records:
        regime_cnts[r['regime']] += 1
    first_ts = datetime.datetime.fromtimestamp(records[0]['ts'] / 1000)
    last_ts  = datetime.datetime.fromtimestamp(records[-1]['ts'] / 1000)
    print(f'Date range: {first_ts.date()} → {last_ts.date()} '
          f'({(last_ts - first_ts).days} days)')
    for rg, cnt in sorted(regime_cnts.items()):
        print(f'  {rg}: {cnt} ({cnt/len(records)*100:.0f}%)')

    # ── Regime stats & avg matrix ─────────────────────────────────────────────
    regime_stats = compute_regime_stats(records, available_pairs)
    avg_corr     = compute_avg_corr_matrix(records)

    print(f'\nAverage correlation samples: {len(avg_corr)} pair-pairs')

    # ── Output ────────────────────────────────────────────────────────────────
    output = {
        'generated':    datetime.datetime.utcnow().isoformat() + 'Z',
        'years':        args.years,
        'window_bars':  args.window,
        'step_bars':    args.step,
        'pairs':        available_pairs,
        'records':      records,
        'regime_stats': regime_stats,
        'avg_corr':     avg_corr,
    }

    if args.dry_run:
        print('\n[DRY RUN] Skipping file save.')
        # Print sample of avg corr
        print('\nSample avg correlations:')
        for k, v in list(avg_corr.items())[:10]:
            print(f'  {k}: {v:+.4f}')
        return

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, 'w', encoding='utf-8') as f:
        json.dump(output, f, separators=(',', ':'))

    size_kb = os.path.getsize(args.out) / 1024
    print(f'\nSaved to {args.out} ({size_kb:.0f} KB)')

    if args.save_raw:
        raw_out = {sym: {'closes': closes, 'timestamps': [t.isoformat() for t in ts]}
                   for sym, (closes, ts) in bar_data.items()}
        with open(OUTPUT_RAW, 'w', encoding='utf-8') as f:
            json.dump(raw_out, f, separators=(',', ':'))
        print(f'Raw bars saved to {OUTPUT_RAW}')

    print('\nDone. Run your server and open correlations.html.')
    print(f'  Records: {len(records)}  |  Pairs: {len(available_pairs)}  |  Size: {size_kb:.0f} KB')


if __name__ == '__main__':
    main()
