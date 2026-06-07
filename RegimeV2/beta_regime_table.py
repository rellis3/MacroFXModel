"""
Beta Regime Table Builder — Part 3 of the beta-focused stochastic control system.

Offline script. Run periodically (weekly or after any HMM retrain) to build a
lookup table of regime-conditional beta statistics.

How it works:
  1. Reads beta_history.jsonl (written by bot/main.py every 120s)
  2. Groups beta observations by regime label
  3. Computes mean / std / percentiles per (symbol, factor, regime)
  4. Writes the result to KV as 'beta_regime_table'
  5. Optionally updates 'beta_targets' in KV with the per-regime means

The history file lives at bot/data/beta_history.jsonl — one JSON object per line:
  {"ts": <epoch_ms>, "regime": "BULL", "estimates": {"EURUSD": {"beta_dxy": {...}}}}

Usage:
  python RegimeV2/beta_regime_table.py
  python RegimeV2/beta_regime_table.py --update-targets   # also write beta_targets to KV
  python RegimeV2/beta_regime_table.py --min-samples 50   # minimum per-regime sample count
  python RegimeV2/beta_regime_table.py --backfill         # bootstrap history from Oanda bars
  python RegimeV2/beta_regime_table.py --backfill --update-targets --dry-run
"""

import argparse
import json
import os
import statistics
import sys
import time
import urllib.request
from collections import defaultdict

# Load .env from the same directory as this script (or parent) so OANDA_KEY etc.
# are available without the user needing to export them manually.
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
                k = k.strip()
                v = v.strip().strip('"').strip("'")
                if k and k not in os.environ:
                    os.environ[k] = v
        break

_load_dotenv()

HISTORY_FILE = os.path.join(os.path.dirname(__file__), '..', 'bot', 'data', 'beta_history.jsonl')
DASHBOARD_URL = os.environ.get('DASHBOARD_URL', 'https://macrofxmodel-production.up.railway.app')

FACTORS  = ('beta_dxy', 'beta_rates', 'beta_vix')
REGIMES  = ('BULL', 'BEAR', 'RANGE', 'CHOP')
MIN_SAMPLES_DEFAULT = 30

# Default pairs to backfill (covers common MacroFX pairs + factor proxies)
DEFAULT_BACKFILL_PAIRS = [
    'EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD',
    'USDCHF', 'GBPJPY', 'EURCAD', 'NZDUSD',
]

# Factor proxy definitions (mirrors beta_estimator.py)
FACTOR_PROXIES = {
    'beta_dxy':   ('EURUSD', -1.2),
    'beta_rates': ('USDJPY',  1.0),
    'beta_vix':   ('USDCHF', -1.0),
}
FACTOR_SYMBOLS = {v[0] for v in FACTOR_PROXIES.values()}

# Oanda instrument overrides
_OANDA_OVERRIDES = {
    'XAUUSD': 'XAU_USD', 'XAGUSD': 'XAG_USD', 'NAS100': 'NAS100_USD',
    'SPX500': 'SPX500_USD', 'US30': 'US30_USD', 'UK100': 'UK100_GBP',
}


# ── History I/O ───────────────────────────────────────────────────────────────

def load_history(path: str) -> list[dict]:
    records = []
    if not os.path.exists(path):
        print(f'[WARN] History file not found: {path}')
        return records
    with open(path, 'r', encoding='utf-8') as f:
        for i, line in enumerate(f):
            line = line.strip()
            if not line:
                continue
            try:
                records.append(json.loads(line))
            except json.JSONDecodeError as e:
                print(f'[WARN] Line {i+1} malformed: {e}')
    print(f'Loaded {len(records)} history records from {path}')
    return records


def save_history(records: list[dict], path: str) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'a', encoding='utf-8') as f:
        for rec in records:
            f.write(json.dumps(rec) + '\n')
    print(f'Appended {len(records)} backfill records to {path}')


# ── Table building ────────────────────────────────────────────────────────────

def build_table(records: list[dict], min_samples: int) -> dict:
    """
    Returns regime-conditional beta statistics.

    Structure:
      {symbol: {factor: {regime: {mean, std, p25, p75, n}}}}
    """
    data: dict = defaultdict(lambda: defaultdict(lambda: defaultdict(list)))

    for rec in records:
        regime = rec.get('regime', 'RANGE').upper()
        if regime not in REGIMES:
            regime = 'RANGE'
        estimates = rec.get('estimates', {})
        for sym, sym_data in estimates.items():
            for factor in FACTORS:
                f_data = sym_data.get(factor, {})
                mean_val = f_data.get('mean')
                if mean_val is not None:
                    data[sym][factor][regime].append(float(mean_val))

    table: dict = {}
    for sym, factors in data.items():
        table[sym] = {}
        for factor, regimes in factors.items():
            table[sym][factor] = {}
            for regime, values in regimes.items():
                n = len(values)
                if n < min_samples:
                    print(f'  [{sym}][{factor}][{regime}] only {n} samples — skipping (need {min_samples})')
                    continue
                vals_sorted = sorted(values)
                p25_idx = int(len(vals_sorted) * 0.25)
                p75_idx = int(len(vals_sorted) * 0.75)
                table[sym][factor][regime] = {
                    'mean': round(statistics.mean(values), 4),
                    'std':  round(statistics.stdev(values) if n > 1 else 0.0, 4),
                    'p25':  round(vals_sorted[p25_idx], 4),
                    'p75':  round(vals_sorted[p75_idx], 4),
                    'n':    n,
                }

    return table


def derive_targets(table: dict) -> dict:
    """
    Extract regime-conditional target beta from the table means.
    Uses EURUSD as the primary reference pair, falling back to any available pair.
    """
    targets: dict = {r: {} for r in REGIMES}
    primary = 'EURUSD'

    for factor in FACTORS:
        ref_sym = primary if primary in table and factor in table.get(primary, {}) else None
        if ref_sym is None:
            for sym in table:
                if factor in table[sym]:
                    ref_sym = sym
                    break
        if ref_sym is None:
            continue
        for regime in REGIMES:
            regime_data = table[ref_sym][factor].get(regime)
            if regime_data:
                targets[regime][factor] = regime_data['mean']

    return targets


# ── Oanda backfill ────────────────────────────────────────────────────────────

def _oanda_symbol(sym: str) -> str | None:
    sym = sym.upper()
    if sym in _OANDA_OVERRIDES:
        return _OANDA_OVERRIDES[sym]
    if len(sym) == 6 and sym.isalpha():
        return f'{sym[:3]}_{sym[3:]}'
    return None


def _fetch_oanda_h4(symbol: str, count: int, api_key: str, practice: bool = False) -> list[float] | None:
    """Fetch H4 close prices from Oanda REST API. Returns list of floats or None."""
    oanda_sym = _oanda_symbol(symbol)
    if not oanda_sym:
        return None
    host = 'api-fxpractice.oanda.com' if practice else 'api-fxtrade.oanda.com'
    url = f'https://{host}/v3/instruments/{oanda_sym}/candles?count={count}&granularity=H4&price=M'
    try:
        req = urllib.request.Request(url, headers={'Authorization': f'Bearer {api_key}'})
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read())
        return [float(c['mid']['c']) for c in data.get('candles', []) if c.get('complete', True)]
    except Exception as e:
        print(f'  [WARN] Oanda fetch failed for {symbol}: {e}')
        return None


def _ema(values: list[float], period: int) -> list[float]:
    result = list(values)
    k = 2.0 / (period + 1)
    for i in range(1, len(result)):
        result[i] = values[i] * k + result[i - 1] * (1 - k)
    return result


def _classify_regime(closes: list[float]) -> str:
    """
    Simple EMA-based regime proxy. Uses 20/50-period EMA crossover on the
    provided close price series (EUR/USD H4).

    Not as accurate as the HMM but gives a reasonable label for historical bars
    when live HMM output isn't available.

    Returns: BULL | BEAR | RANGE
    """
    n = len(closes)
    if n < 25:
        return 'RANGE'

    period_fast = 20
    period_slow = min(50, n)

    ema_fast = _ema(closes, period_fast)
    ema_slow = _ema(closes, period_slow)

    # Slope of fast EMA over last 5 bars (normalised)
    ref = max(abs(ema_fast[-6]), 1e-10)
    slope = (ema_fast[-1] - ema_fast[-6]) / ref

    # Spread between fast and slow EMA (normalised)
    ref2 = max(abs(ema_slow[-1]), 1e-10)
    spread = (ema_fast[-1] - ema_slow[-1]) / ref2

    if spread > 0.0025 and slope > 0.00015:
        return 'BULL'
    if spread < -0.0025 and slope < -0.00015:
        return 'BEAR'
    return 'RANGE'


def _log_returns(closes: list[float]) -> list[float]:
    import math
    return [math.log(max(closes[i], 1e-10) / max(closes[i - 1], 1e-10))
            for i in range(1, len(closes))]


def _ols_beta(y: list[float], x: list[float]) -> tuple[float, float]:
    """OLS: y = alpha + beta*x. Returns (beta, r_squared)."""
    n = len(y)
    if n < 2:
        return 0.0, 0.0
    mx = sum(x) / n
    my = sum(y) / n
    cov = sum((x[i] - mx) * (y[i] - my) for i in range(n))
    var = sum((x[i] - mx) ** 2 for i in range(n))
    if var < 1e-12:
        return 0.0, 0.0
    beta = cov / var
    alpha = my - beta * mx
    ss_res = sum((y[i] - alpha - beta * x[i]) ** 2 for i in range(n))
    ss_tot = sum((y[i] - my) ** 2 for i in range(n))
    r_sq = max(0.0, min(1.0, 1.0 - ss_res / ss_tot)) if ss_tot > 1e-12 else 0.0
    return round(beta, 6), round(r_sq, 4)


def run_backfill(
    pairs: list[str],
    api_key: str,
    practice: bool,
    bar_count: int,
    ols_window: int = 60,
    min_window: int = 20,
) -> list[dict]:
    """
    Fetch Oanda H4 bars, run rolling OLS beta estimation across those bars,
    classify regime per window using EMA proxy, and return synthetic history
    records ready to be appended to beta_history.jsonl.

    Each returned record has the same shape as records written by bot/main.py:
      {"ts": <epoch_ms>, "regime": "BULL", "estimates": {...}, "source": "backfill"}
    """
    all_syms = list(set(pairs) | FACTOR_SYMBOLS)
    print(f'\nFetching {bar_count} H4 bars from Oanda for {len(all_syms)} symbols...')

    closes_by_sym: dict[str, list[float]] = {}
    for sym in all_syms:
        closes = _fetch_oanda_h4(sym, bar_count, api_key, practice)
        if closes and len(closes) >= min_window + 1:
            closes_by_sym[sym] = closes
            print(f'  {sym}: {len(closes)} bars')
        else:
            print(f'  {sym}: insufficient data — skipping')

    if not closes_by_sym:
        print('[ERROR] No bars fetched — check OANDA_KEY and connectivity')
        return []

    # Build factor return series
    factor_rets: dict[str, list[float]] = {}
    for factor, (proxy_sym, sign) in FACTOR_PROXIES.items():
        if proxy_sym in closes_by_sym:
            rets = _log_returns(closes_by_sym[proxy_sym])
            factor_rets[factor] = [r * sign for r in rets]

    if not factor_rets:
        print('[ERROR] No factor proxy bars available')
        return []

    # Use EUR/USD for regime classification (falls back to first available)
    regime_ref_closes = closes_by_sym.get('EURUSD') or next(iter(closes_by_sym.values()))

    # Determine how many windows we can compute
    min_bars = min(len(v) for v in closes_by_sym.values())
    n_rets = min_bars - 1  # number of return observations

    records: list[dict] = []
    now_ms = int(time.time() * 1000)
    bar_ms = 4 * 3600 * 1000  # 4 hours in ms

    print(f'\nComputing rolling beta estimates ({n_rets} windows)...')

    for end_idx in range(min_window, n_rets + 1):
        start_idx = max(0, end_idx - ols_window)
        n_obs = end_idx - start_idx

        # Regime label for this window (use EUR/USD closes up to this bar)
        regime = _classify_regime(regime_ref_closes[:end_idx + 1])

        estimates: dict = {}
        for sym in pairs:
            if sym not in closes_by_sym:
                continue
            sym_closes = closes_by_sym[sym]
            if len(sym_closes) <= end_idx:
                continue

            pair_rets = _log_returns(sym_closes)
            pr_window = pair_rets[start_idx:end_idx]

            sym_factors: dict = {}
            r_sqs: list[float] = []

            for factor, fr_all in factor_rets.items():
                if len(fr_all) < end_idx:
                    continue
                fr_window = fr_all[start_idx:end_idx]
                n = min(len(pr_window), len(fr_window))
                if n < min_window:
                    continue
                beta, r_sq = _ols_beta(pr_window[-n:], fr_window[-n:])
                r_sqs.append(r_sq)
                sym_factors[factor] = {'mean': beta, 'ols': beta}

            if sym_factors:
                estimates[sym] = {
                    **sym_factors,
                    'r_squared': round(sum(r_sqs) / len(r_sqs), 4) if r_sqs else 0.0,
                    'window':    n_obs,
                }

        if estimates:
            # Timestamp: work backwards from now — most recent window = now
            bars_ago = n_rets - end_idx
            ts = now_ms - bars_ago * bar_ms
            records.append({
                'ts':        ts,
                'regime':    regime,
                'estimates': estimates,
                'source':    'backfill',
            })

    regime_counts = defaultdict(int)
    for r in records:
        regime_counts[r['regime']] += 1
    print(f'Generated {len(records)} synthetic history records:')
    for regime, count in sorted(regime_counts.items()):
        print(f'  {regime}: {count} records')

    return records


# ── KV I/O ────────────────────────────────────────────────────────────────────

def push_to_kv(key: str, data: dict, base_url: str, timeout: int = 10) -> bool:
    try:
        payload = json.dumps({
            'key':       key,
            'data':      data,
            'timestamp': int(time.time() * 1000),
        }).encode()
        req = urllib.request.Request(
            f'{base_url.rstrip("/")}/api/kv/set',
            data=payload,
            headers={'Content-Type': 'application/json'},
            method='POST',
        )
        with urllib.request.urlopen(req, timeout=timeout):
            pass
        print(f'  Pushed {key} to KV ({len(payload)} bytes)')
        return True
    except Exception as e:
        print(f'  [ERROR] KV push failed ({key}): {e}')
        return False


# ── Reporting ─────────────────────────────────────────────────────────────────

def print_table_summary(table: dict) -> None:
    print('\n=== Beta Regime Table ===')
    for sym in sorted(table.keys()):
        for factor in FACTORS:
            if factor not in table.get(sym, {}):
                continue
            parts = []
            for regime in REGIMES:
                r = table[sym][factor].get(regime)
                if r:
                    parts.append(f'{regime}:{r["mean"]:+.3f}±{r["std"]:.3f}(n={r["n"]})')
            if parts:
                print(f'  {sym:8s} {factor:12s}  {" | ".join(parts)}')


# ── CLI ───────────────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser(description='Build beta regime table from history log')
    ap.add_argument('--update-targets', action='store_true',
                    help='Also write derived beta_targets to KV')
    ap.add_argument('--min-samples', type=int, default=MIN_SAMPLES_DEFAULT,
                    help=f'Minimum samples per regime bucket (default {MIN_SAMPLES_DEFAULT})')
    ap.add_argument('--history', default=HISTORY_FILE,
                    help='Path to beta_history.jsonl file')
    ap.add_argument('--url', default=DASHBOARD_URL,
                    help='Dashboard base URL')
    ap.add_argument('--dry-run', action='store_true',
                    help='Print table without pushing to KV')

    # Backfill options
    ap.add_argument('--backfill', action='store_true',
                    help='Bootstrap history from Oanda H4 bars before building the table')
    ap.add_argument('--pairs', nargs='+', default=DEFAULT_BACKFILL_PAIRS,
                    help='Pairs to include in backfill (no slashes, e.g. EURUSD GBPUSD)')
    ap.add_argument('--bar-count', type=int, default=80,
                    help='Number of H4 bars to fetch per pair (default 80 ≈ 13 days)')
    ap.add_argument('--oanda-key', default=os.environ.get('OANDA_KEY', ''),
                    help='Oanda API key (default: $OANDA_KEY env var)')
    ap.add_argument('--oanda-practice', action='store_true',
                    default=os.environ.get('OANDA_PRACTICE', '').lower() in ('1', 'true', 'yes'),
                    help='Use Oanda practice/demo endpoint')
    ap.add_argument('--save-backfill', action='store_true',
                    help='Write backfill records to history file (default: use in-memory only)')

    args = ap.parse_args()

    # ── Backfill ──────────────────────────────────────────────────────────────
    backfill_records: list[dict] = []
    if args.backfill:
        if not args.oanda_key:
            print('[ERROR] --backfill requires OANDA_KEY env var or --oanda-key argument')
            sys.exit(1)
        print(f'Running Oanda backfill for pairs: {args.pairs}')
        print(f'Endpoint: {"practice" if args.oanda_practice else "live"}')
        backfill_records = run_backfill(
            pairs=args.pairs,
            api_key=args.oanda_key,
            practice=args.oanda_practice,
            bar_count=args.bar_count,
        )
        if not backfill_records:
            print('Backfill produced no records — check Oanda connectivity')
            sys.exit(1)
        if args.save_backfill and not args.dry_run:
            save_history(backfill_records, args.history)

    # ── Load existing history ─────────────────────────────────────────────────
    live_records = load_history(args.history)

    # Backfill records come first (oldest), live records are appended after
    all_records = backfill_records + live_records

    if not all_records:
        print('\nNo records available.')
        if args.backfill:
            print('Backfill ran but produced no valid windows — try --bar-count 120.')
        else:
            print('Run the bot for a while to accumulate data, or use --backfill.')
        sys.exit(1)

    print(f'\nTotal records for table build: {len(all_records)} '
          f'({len(backfill_records)} backfill + {len(live_records)} live)')

    # Lower the min-samples default when backfilling since data is synthetic
    effective_min = args.min_samples
    if args.backfill and args.min_samples == MIN_SAMPLES_DEFAULT:
        effective_min = 15
        print(f'[INFO] Using min-samples={effective_min} for backfill run (lower than default {MIN_SAMPLES_DEFAULT})')

    # ── Build table ───────────────────────────────────────────────────────────
    table = build_table(all_records, effective_min)
    print_table_summary(table)

    if not table:
        print('\nTable is empty — not enough samples per regime. '
              'Try --min-samples 10 or --bar-count 160 for more history.')
        sys.exit(1)

    if args.dry_run:
        print('\n[DRY RUN] Not pushing to KV.')
        if args.update_targets:
            targets = derive_targets(table)
            print('\nDerived targets (would push):')
            for regime, factors in targets.items():
                print(f'  {regime}: {factors}')
        return

    # ── Push to KV ────────────────────────────────────────────────────────────
    print('\nPushing to KV...')
    push_to_kv('beta_regime_table', table, args.url)

    if args.update_targets:
        targets = derive_targets(table)
        print('\nDerived targets:')
        for regime, factors in targets.items():
            print(f'  {regime}: {factors}')
        push_to_kv('beta_targets', targets, args.url)

    print('Done.')


if __name__ == '__main__':
    main()
