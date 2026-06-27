"""
Gold Bot — ML Model  (binary classifier on journal trade data)

Trains a logistic regression on closed trades logged in gold_journal.jsonl.
Features come from what the bot records at entry time: zone score, timeframe,
direction, VuManChu component count, and composition flags (nPOC, VWAP anchor,
HTF alignment, POC, HVN).  Label: TP2 hit (1) vs SL hit (0).

Two modes:

  --train    Read journal, fit model, push coefficients to KV as gold_ml_params.
             Requires scikit-learn.

  --predict  Read gold_bot_zones from KV, score each zone using stored coefficients
             (pure-Python logistic — no sklearn needed at predict time), push
             gold_ml_signal to KV with per-zone probabilities and signals.

  --train --predict   Train and immediately predict in one run.

Usage (run from project root):
  python Gold/ml_model.py --train --journal Gold/logs/gold_journal.jsonl
  python Gold/ml_model.py --predict
  python Gold/ml_model.py --train --predict --journal Gold/logs/gold_journal.jsonl

KV keys:
  Read:  gold_bot_zones       active zones (pushed by Gold/main.py every 2 min)
  Write: gold_ml_params       stored model coefficients (trained once, reused)
         gold_ml_signal       current zone predictions (pushed on each --predict run)
"""

from __future__ import annotations
import argparse
import json
import math
import os
import sys
import time
from datetime import datetime, timezone

import requests
from dotenv import load_dotenv

load_dotenv()

DASHBOARD_URL = os.getenv('DASHBOARD_URL', 'https://macrofxmodel-production.up.railway.app')

# Feature names — order must match training order
FEATURE_NAMES = [
    'score',
    'tf_D1', 'tf_H4', 'tf_H1', 'tf_M30', 'tf_M15',
    'direction_long',
    'vu_components',
    'htf_aligned',
    'has_npoc',
    'has_anchor',
    'has_poc',
    'has_hvn',
]

TF_ORDER = ['D1', 'H4', 'H1', 'M30', 'M15']

# Minimum prob for a "BUY" signal — below this the zone is rated LOW
ML_BUY_THRESHOLD = 0.55


# ── Feature extraction ────────────────────────────────────────────────────────

def _comp_str(composition) -> str:
    if isinstance(composition, list):
        return ' '.join(str(c) for c in composition)
    return str(composition)


def _extract_features(entry: dict) -> list[float]:
    """
    Extract the model feature vector from a journal ENTRY_SIGNAL event
    or a gold_bot_zones zone dict.  Returns a list matching FEATURE_NAMES order.
    """
    comp  = _comp_str(entry.get('composition', []))
    score = float(entry.get('score', 0))
    tf    = entry.get('tf', '?')
    dirn  = str(entry.get('direction', '')).lower()

    vu = 0
    if 'vu_components' in entry:
        vu = int(entry['vu_components'])
    elif 'vumanchu' in entry:
        vu = int(entry['vumanchu'].get('components_aligned', 0))

    htf_aligned   = int('HTF' in comp or bool(entry.get('htf_aligned', False)))
    has_npoc      = int('nPOC' in comp)
    has_anchor    = int('VWAP anchor' in comp)
    has_poc       = int('POC' in comp and 'nPOC' not in comp)
    has_hvn       = int('HVN' in comp)
    direction_long = int(dirn in ('long', 'buy', '1'))

    tf_vec = [int(tf == t) for t in TF_ORDER]

    return [score] + tf_vec + [direction_long, vu, htf_aligned, has_npoc, has_anchor, has_poc, has_hvn]


# ── Journal reader + trade extractor ─────────────────────────────────────────

def _read_journal(path: str) -> list[dict]:
    events: list[dict] = []
    with open(path, encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                events.append(json.loads(line))
            except json.JSONDecodeError:
                continue
    return events


def _build_dataset(events: list[dict]) -> tuple[list[list[float]], list[int]]:
    """Return (X, y) for all closed trades in the journal."""
    zone_entries: dict[str, dict] = {}
    X: list[list[float]] = []
    y: list[int] = []

    for ev in events:
        etype = ev.get('event', ev.get('type', ''))

        if etype == 'ENTRY_SIGNAL':
            zid = ev.get('zone_id', '')
            if zid:
                zone_entries[zid] = ev

        elif etype == 'TRADE_CLOSED':
            zid    = ev.get('zone_id', '')
            reason = ev.get('reason') or ev.get('result', '')
            if zid not in zone_entries:
                continue
            if reason == 'TP2_HIT':
                entry = zone_entries.pop(zid)
                feats = _extract_features(entry)
                X.append(feats)
                y.append(1)
            elif reason == 'SL_HIT':
                entry = zone_entries.pop(zid)
                feats = _extract_features(entry)
                X.append(feats)
                y.append(0)
            # EXPIRED / breakeven / other: not a labelled win/loss, drop entry
            else:
                zone_entries.pop(zid, None)

    return X, y


# ── Training (requires scikit-learn) ─────────────────────────────────────────

def _train(X: list[list[float]], y: list[int]) -> dict:
    """
    Fit StandardScaler + LogisticRegression. Returns a params dict that can be
    serialised to JSON and used for pure-Python inference later.
    """
    try:
        from sklearn.linear_model import LogisticRegression
        from sklearn.preprocessing import StandardScaler
        from sklearn.model_selection import cross_val_score
        import numpy as np
    except ImportError:
        print('scikit-learn not installed. Run: pip install scikit-learn numpy')
        sys.exit(1)

    Xn = np.array(X, dtype=float)
    yn = np.array(y, dtype=int)

    scaler = StandardScaler()
    Xs     = scaler.fit_transform(Xn)

    model  = LogisticRegression(C=1.0, class_weight='balanced', max_iter=500, solver='lbfgs')
    model.fit(Xs, yn)

    # Cross-validated AUC
    auc_scores = cross_val_score(model, Xs, yn, cv=min(5, len(y)), scoring='roc_auc')
    auc = float(auc_scores.mean())

    n_pos = int(yn.sum())
    n_neg = int(len(yn) - n_pos)

    print(f'  Samples: {len(y)} ({n_pos} wins / {n_neg} losses)  '
          f'CV AUC: {auc:.3f}  Baseline: {n_pos/len(y):.3f}')

    # Check for class imbalance warning
    if n_pos < 5 or n_neg < 5:
        print('  WARNING: very few samples in one class — model may not generalise')

    return {
        'feature_names': FEATURE_NAMES,
        'coef':          model.coef_[0].tolist(),
        'intercept':     float(model.intercept_[0]),
        'scale_mean':    scaler.mean_.tolist(),
        'scale_std':     scaler.scale_.tolist(),
        'n_samples':     len(y),
        'n_pos':         n_pos,
        'n_neg':         n_neg,
        'cv_auc':        round(auc, 4),
        'trained_at':    datetime.now(timezone.utc).isoformat(),
    }


# ── Pure-Python inference ─────────────────────────────────────────────────────

def _sigmoid(x: float) -> float:
    return 1.0 / (1.0 + math.exp(-x))


def _predict_prob(features: list[float], params: dict) -> float:
    """Logistic regression prediction using stored coefficients — no sklearn needed."""
    coef       = params['coef']
    intercept  = params['intercept']
    scale_mean = params['scale_mean']
    scale_std  = params['scale_std']

    # Standardise
    scaled = [
        (f - mu) / sd if sd > 0 else 0.0
        for f, mu, sd in zip(features, scale_mean, scale_std)
    ]

    # Dot product + intercept
    z = intercept + sum(c * s for c, s in zip(coef, scaled))
    return _sigmoid(z)


def _signal_label(prob: float) -> str:
    if prob >= 0.65:
        return 'HIGH'
    if prob >= ML_BUY_THRESHOLD:
        return 'MEDIUM'
    if prob >= 0.40:
        return 'LOW'
    return 'PASS'


# ── KV helpers ────────────────────────────────────────────────────────────────

def _kv_get(key: str, base_url: str) -> dict | None:
    try:
        r = requests.get(f'{base_url}/api/kv/get?key={key}', timeout=10)
        if r.status_code == 200:
            j = r.json()
            if not j.get('miss') and j.get('data'):
                return j['data']
    except Exception:
        pass
    return None


def _kv_put(key: str, data: dict, base_url: str) -> bool:
    try:
        r = requests.post(
            f'{base_url}/api/kv/set',
            json={'key': key, 'data': data, 'timestamp': int(time.time() * 1000)},
            timeout=10,
        )
        return r.status_code == 200
    except Exception as exc:
        print(f'  [KV] PUT {key} failed: {exc}')
        return False


# ── Predict: score current zones from KV ─────────────────────────────────────

def run_predict(base_url: str, params: dict) -> None:
    zones_kv = _kv_get('gold_bot_zones', base_url)
    if not zones_kv:
        print('  gold_bot_zones not in KV — gold bot may not be running. Exiting.')
        return

    zones = zones_kv.get('zones', [])
    if not zones:
        print('  No active zones in gold_bot_zones.')

    results = []
    for z in zones:
        # VuManChu isn't in the zone map (only at entry time) — default to 2
        z_with_vu = {**z, 'vu_components': z.get('vu_components', 2)}
        feats = _extract_features(z_with_vu)
        prob  = _predict_prob(feats, params)
        sig   = _signal_label(prob)
        results.append({
            'zone_id':   z.get('zone_id'),
            'tf':        z.get('tf'),
            'direction': z.get('direction'),
            'score':     z.get('score'),
            'prob':      round(prob, 3),
            'signal':    sig,
        })
        print(f'  {z.get("zone_id","?"):<30}  prob={prob:.3f}  [{sig}]')

    signal_doc = {
        'predicted_at': datetime.now(timezone.utc).isoformat(),
        'model_auc':    params.get('cv_auc'),
        'model_date':   params.get('trained_at'),
        'buy_threshold': ML_BUY_THRESHOLD,
        'zones':        results,
    }

    ok = _kv_put('gold_ml_signal', signal_doc, base_url)
    print(f'\n  gold_ml_signal → {"OK" if ok else "FAIL"}')


# ── Entry point ───────────────────────────────────────────────────────────────

def _parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description='Gold Bot ML model — train and/or predict')
    p.add_argument('--train',         action='store_true',
                   help='Train model from journal and push coefficients to KV')
    p.add_argument('--predict',       action='store_true',
                   help='Score current zones using stored model params')
    p.add_argument('--journal',       default='gold_journal.jsonl',
                   help='Path to gold_journal.jsonl (used with --train)')
    p.add_argument('--dry-run',       action='store_true',
                   help='Print results but do not write to KV')
    p.add_argument('--dashboard-url', default=DASHBOARD_URL)
    return p.parse_args()


if __name__ == '__main__':
    args = _parse_args()

    if not args.train and not args.predict:
        print('Specify --train and/or --predict.')
        sys.exit(1)

    sep = '─' * 60
    base = args.dashboard_url

    if args.train:
        if not os.path.exists(args.journal):
            print(f'Journal not found: {args.journal}')
            sys.exit(1)

        print(f'\n{sep}')
        print('GOLD ML — TRAINING')
        print(sep)
        print(f'  Journal: {args.journal}')

        events = _read_journal(args.journal)
        X, y   = _build_dataset(events)

        if len(y) < 10:
            print(f'  Only {len(y)} closed trades — need at least 10 to train. Exiting.')
            sys.exit(0)

        params = _train(X, y)

        if args.dry_run:
            print('  Dry run — not writing gold_ml_params to KV.')
        else:
            ok = _kv_put('gold_ml_params', params, base)
            print(f'  gold_ml_params → {"OK" if ok else "FAIL"}')

        print(sep)

    if args.predict:
        print(f'\n{sep}')
        print('GOLD ML — PREDICTING')
        print(sep)

        params = _kv_get('gold_ml_params', base)
        if not params:
            print('  gold_ml_params not in KV. Run --train first.')
            sys.exit(1)

        print(f'  Model: trained {params.get("trained_at","?")}  '
              f'AUC={params.get("cv_auc","?")}  n={params.get("n_samples","?")}')
        print()

        if args.dry_run:
            print('  Dry run — not writing gold_ml_signal to KV.')
        else:
            run_predict(base, params)

        print(sep)
