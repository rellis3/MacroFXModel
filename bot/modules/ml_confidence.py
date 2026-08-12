"""
ml_confidence.py — meta-labelling confidence layer for the trading bot.

Loads the XGBoost + LightGBM classifiers trained by
bot/scripts/train_gold_model.py (on closed-trade outcomes) and uses their
averaged win-probability to scale position size — the same role
regime_confidence_module.py plays, but learned from historical outcomes
instead of hand-tuned from HMM/GARCH/ARMA.

This module is advisory-only by design (Chapter 17 meta-labelling pattern):
it NEVER blocks a trade (passed is always True) and never sizes UP beyond
the configured risk — it only scales size DOWN when the model's predicted
win probability is below 0.5. Direction is inherited from upstream modules,
same convention as regime_confidence and vol_gate.

Feature parity with training:
  train_gold_model.py builds its feature matrix from a gold-lab CSV export
  (js/gold-lab-worker.js). The live gold model (js/gold-model.js → KV key
  gold_model) publishes the same underlying signals — momentum,
  acceleration, z-scores, regime, size_mult, hurst_proxy, is_transitioning
  — so this module reads live KV rather than recomputing anything.
  Two things are worth verifying against your actual training CSV before
  trusting live predictions:
    - hy/hy_change: the live KV only exposes hyBps/hyChangeBps (basis
      points); this module divides by 100 to match what looked like
      raw-percent units in the CSV export, but that conversion is
      inferred, not confirmed against a real gold-lab export.
    - regime_confidence: the training column's source wasn't traced to a
      single definition. This module uses the bot's own
      regime_confidence module score (HMM/GARCH/ARMA-based) as the closest
      available live proxy — check it lines up with what train_gold_model.py
      actually saw in the CSV.
  Missing/unparseable numeric fields default to 0.0 (mirrors training's
  own fillna behaviour for missing numerics).

Fails open: any missing dependency, missing model file, or feature-building
error returns a neutral ModuleResult (score=0.5, size_mult=1.0) rather than
raising — an untrained or broken model must never stop the bot from trading.
"""

import json
import logging
import os

from .base import BaseModule, ModuleResult

log = logging.getLogger(__name__)

_MODELS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'models')

# gold_kv (KV key: gold_model) field → training column name.
_NUMERIC_FEATURE_MAP = {
    'goldScore':      'gold_score',
    'tips':           'tips',
    'tipsMom':        'tips_mom',
    'tipsAccel':      'tips_accel',
    'bei':            'bei',
    'beiMom':         'bei_mom',
    'beiAccel':       'bei_accel',
    'dxy':            'dxy',
    'dxyMom':         'dxy_mom',
    'dxyAccel':       'dxy_accel',
    'vix':            'vix',
    'vixAccel':       'vix_accel',
    'us2yMom':        'us2y_mom',
    'sizeMult':       'size_mult',
    'tipsZScore':     'tips_zscore',
    'beiZScore':      'bei_zscore',
    'dxyZScore':      'dxy_zscore',
}
# hyBps / hyChangeBps are published in basis points; the CSV export column
# names (hy, hy_change) look like raw-percent units — see module docstring.
_BPS_FEATURE_MAP = {
    'hyBps':        'hy',
    'hyChangeBps':  'hy_change',
}

_CATEGORICAL_FEATURE_MAP = {
    'signal':          'signal',
    'strength':        'strength',
    'regime':          'regime',
    'confidence':      'confidence',
    'tipsInflection':  'tips_inflection',
    'beiInflection':   'bei_inflection',
}

# size_mult curve: prob>=0.5 → no adjustment (never sizes UP on ML alone).
# prob<0.5 scales linearly down to a floor of 0.4 at prob=0.
_SIZE_MULT_FLOOR = 0.4


def _load_models(models_dir: str):
    """Best-effort load; returns (xgb_booster, lgb_booster, feature_names) or (None, None, None)."""
    xgb_path  = os.path.join(models_dir, 'xgb_model.json')
    lgb_path  = os.path.join(models_dir, 'lgb_model.txt')
    feat_path = os.path.join(models_dir, 'feature_names.json')

    if not (os.path.exists(xgb_path) and os.path.exists(lgb_path) and os.path.exists(feat_path)):
        return None, None, None

    try:
        import lightgbm as lgb
        import xgboost as xgb

        booster_xgb = xgb.Booster()
        booster_xgb.load_model(xgb_path)

        booster_lgb = lgb.Booster(model_file=lgb_path)

        with open(feat_path) as f:
            feature_names = json.load(f)

        return booster_xgb, booster_lgb, feature_names
    except Exception as exc:
        log.warning(f'ml_confidence: failed to load models from {models_dir}: {exc}')
        return None, None, None


class MLConfidenceModule(BaseModule):
    """
    Meta-labelling confidence scalar from the trained gold XGBoost/LightGBM
    classifiers (bot/scripts/train_gold_model.py). Gold-only for now — the
    training pipeline only exists for XAU/USD. size_mult only; never blocks.
    """

    name = 'ml_confidence'

    def __init__(self, models_dir: str = _MODELS_DIR):
        self._models_dir = models_dir
        self._xgb, self._lgb, self._feature_names = _load_models(models_dir)

    def _neutral(self, reason: str, signal: str = 'NEUTRAL') -> ModuleResult:
        return ModuleResult(
            passed=True, signal=signal, score=0.5, confidence='MEDIUM',
            reason=reason, metadata={'size_mult': 1.0, 'model_loaded': self._xgb is not None},
        )

    def _inherited_direction(self, ctx: dict) -> str:
        if not ctx:
            return 'NEUTRAL'
        for module_name in ('gold_macro', 'macro_regime', 'vol_gate'):
            upstream = ctx.get(module_name)
            if upstream and upstream.signal in ('LONG', 'SHORT'):
                return upstream.signal
        return 'NEUTRAL'

    def _build_feature_row(self, gold_kv: dict, ctx: dict, hurst_proxy) -> dict:
        row = {}
        for kv_key, col in _NUMERIC_FEATURE_MAP.items():
            val = gold_kv.get(kv_key)
            row[col] = float(val) if val is not None else 0.0

        for kv_key, col in _BPS_FEATURE_MAP.items():
            val = gold_kv.get(kv_key)
            row[col] = float(val) / 100.0 if val is not None else 0.0

        row['is_transitioning'] = 1.0 if gold_kv.get('isTransitioning') else 0.0
        row['hurst_proxy'] = float(hurst_proxy) if hurst_proxy is not None else 0.0

        rc_result = ctx.get('regime_confidence') if ctx else None
        row['regime_confidence'] = float(rc_result.score) if rc_result else 0.0

        cats = {}
        for kv_key, col in _CATEGORICAL_FEATURE_MAP.items():
            cats[col] = str(gold_kv.get(kv_key, 'UNKNOWN'))

        return row, cats

    def _vectorize(self, row: dict, cats: dict):
        import numpy as np

        vec = []
        for name in self._feature_names:
            if name in row:
                vec.append(row[name])
            else:
                # One-hot dummy column, e.g. "signal_BULLISH" — matches
                # pandas get_dummies(prefix=col) naming used at train time.
                matched = False
                for col, value in cats.items():
                    prefix = f'{col}_'
                    if name.startswith(prefix) and name[len(prefix):] == value:
                        vec.append(1.0)
                        matched = True
                        break
                if not matched:
                    vec.append(0.0)
        return np.array(vec, dtype=np.float32).reshape(1, -1)

    def evaluate(self, state: dict, pair: str, config: dict, ctx: dict = None) -> ModuleResult:
        if pair != 'XAU/USD':
            return self._neutral('Not XAU/USD — ML confidence model is gold-only')

        if self._xgb is None or self._lgb is None:
            return self._neutral(
                f'No trained model in {self._models_dir} — run bot/scripts/train_gold_model.py first'
            )

        snap    = state.get('regime_snapshot') or {}
        gold_kv = snap.get('gold_model')
        if not gold_kv:
            return self._neutral('Gold model not in KV — ML confidence skipped')

        direction = self._inherited_direction(ctx)

        try:
            row, cats = self._build_feature_row(gold_kv, ctx or {}, gold_kv.get('hurstProxy'))
            X = self._vectorize(row, cats)

            import xgboost as xgb
            prob_xgb = float(self._xgb.predict(xgb.DMatrix(X, feature_names=self._feature_names))[0])
            prob_lgb = float(self._lgb.predict(X)[0])
            prob     = (prob_xgb + prob_lgb) / 2.0
        except Exception as exc:
            log.warning(f'ml_confidence: prediction failed, defaulting to neutral: {exc}', exc_info=True)
            return self._neutral(f'ML prediction failed ({exc}) — neutral multiplier', signal=direction)

        if prob >= 0.5:
            size_mult = 1.0
        else:
            size_mult = _SIZE_MULT_FLOOR + (1.0 - _SIZE_MULT_FLOOR) * (prob / 0.5)
        size_mult = round(max(_SIZE_MULT_FLOOR, min(1.0, size_mult)), 2)

        confidence = 'HIGH' if prob >= 0.65 else 'MEDIUM' if prob >= 0.45 else 'LOW'

        return ModuleResult(
            passed=True,
            signal=direction,
            score=round(prob, 3),
            confidence=confidence,
            reason=f'ML win-probability={prob:.2f} (xgb={prob_xgb:.2f}, lgb={prob_lgb:.2f}) '
                   f'→ size_mult={size_mult:.2f}',
            metadata={
                'ml_prob':      round(prob, 4),
                'xgb_prob':     round(prob_xgb, 4),
                'lgb_prob':     round(prob_lgb, 4),
                'size_mult':    size_mult,
                'model_loaded': True,
            },
        )
