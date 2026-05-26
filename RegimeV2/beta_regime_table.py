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
"""

import argparse
import json
import os
import statistics
import sys
import urllib.request
from collections import defaultdict

HISTORY_FILE = os.path.join(os.path.dirname(__file__), '..', 'bot', 'data', 'beta_history.jsonl')
DASHBOARD_URL = os.environ.get('DASHBOARD_URL', 'https://macrofxmodel-production.up.railway.app')

FACTORS  = ('beta_dxy', 'beta_rates', 'beta_vix')
REGIMES  = ('BULL', 'BEAR', 'RANGE', 'CHOP')
MIN_SAMPLES_DEFAULT = 30


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


def build_table(records: list[dict], min_samples: int) -> dict:
    """
    Returns regime-conditional beta statistics.

    Structure:
      {symbol: {factor: {regime: {mean, std, p25, p75, n}}}}
    """
    # Accumulate: data[symbol][factor][regime] = [beta_values]
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
    Uses EURUSD as the primary reference pair for target computation,
    falling back to any available pair if EURUSD has insufficient data.
    """
    targets: dict = {r: {} for r in REGIMES}
    primary = 'EURUSD'

    for factor in FACTORS:
        ref_sym = primary if primary in table and factor in table[primary] else None
        if ref_sym is None:
            # Fallback: use first symbol that has data for this factor
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


def push_to_kv(key: str, data: dict, base_url: str, timeout: int = 10) -> bool:
    try:
        payload = json.dumps({
            'key':       key,
            'data':      data,
            'timestamp': int(__import__('time').time() * 1000),
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


def print_table_summary(table: dict) -> None:
    print('\n=== Beta Regime Table ===')
    for sym in sorted(table.keys()):
        for factor in FACTORS:
            if factor not in table[sym]:
                continue
            parts = []
            for regime in REGIMES:
                r = table[sym][factor].get(regime)
                if r:
                    parts.append(f'{regime}:{r["mean"]:+.3f}±{r["std"]:.3f}(n={r["n"]})')
            if parts:
                print(f'  {sym:8s} {factor:12s}  {" | ".join(parts)}')


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
    args = ap.parse_args()

    records = load_history(args.history)
    if not records:
        print('No history records — run the bot for a while to accumulate data, then retry.')
        sys.exit(1)

    table = build_table(records, args.min_samples)
    print_table_summary(table)

    if args.dry_run:
        print('\n[DRY RUN] Not pushing to KV.')
        return

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
