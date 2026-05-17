"""
gold_macro_module.py — Gold Two-Layer Macro Model filter for the trading bot.

Reads the pre-computed gold model from KV (pushed by the browser dashboard after
each FRED refresh). Uses regime classification, signal direction, and confidence
to gate XAU/USD trade entries.

Model architecture (mirroring js/gold-model.js):
  Layer 1 (Level)    — structural opportunity cost context
  Layer 2 (Momentum) — where the repricing alpha lives (rate of change)
  Regime             — adaptive weighting of Layer 1 vs Layer 2
  Confidence         — regime stability (Hurst-like persistence proxy)

Regime descriptions:
  QE_EXPANSION        — real yields falling, BEI momentum primary driver
  AGGRESSIVE_TIGHTENING — real yield momentum dominates (2022 scenario)
  CRISIS              — safe haven demand overrides macro
  FISCAL_DOMINANCE    — BEI rising faster than TIPS, uncertainty premium
  STAGFLATION         — conflicted: inflation + rising real yields
  NEUTRAL             — balanced weighting, no dominant signal
"""

from .base import BaseModule, ModuleResult

# Signals strong enough to trade on
TRADEABLE_SIGNALS  = {'BULLISH', 'BEARISH'}
TRADEABLE_STRENGTH = {'STRONG', 'MODERATE'}

# Regimes where the model has historically clear gold direction
BULLISH_REGIMES = {'QE_EXPANSION', 'FISCAL_DOMINANCE', 'CRISIS'}
BEARISH_REGIMES = {'AGGRESSIVE_TIGHTENING'}
MIXED_REGIMES   = {'STAGFLATION', 'NEUTRAL'}


class GoldMacroModule(BaseModule):
    """
    Reads the gold macro model from KV (key: ai_goldmodel) and evaluates:
      1. Signal direction (BULLISH/BEARISH/NEUTRAL)
      2. Signal strength  (STRONG/MODERATE/WEAK)
      3. Regime classification and its expected gold bias
      4. Regime confidence (HIGH/MEDIUM/LOW) → position sizing

    Pass conditions:
      - Signal in {BULLISH, BEARISH} and aligns with intended trade direction
      - Strength is STRONG or MODERATE
      - Confidence is not LOW (unless config allows)

    Hard BLOCK:
      - Signal direction conflicts with intended trade direction and strength is STRONG

    Size adjustment:
      - Returns sizeMult from the model's confidence assessment
      - GARCH transition risk is embedded in sizeMult from the JS model
    """

    name = 'gold_macro'

    def evaluate(self, state: dict, pair: str, config: dict, ctx: dict = None) -> ModuleResult:
        if pair != 'XAU/USD':
            # This module only applies to gold
            return ModuleResult(
                passed=True, signal='NEUTRAL', score=0.5, confidence='MEDIUM',
                reason='Not XAU/USD — gold macro module skipped',
            )

        gold_cfg = (config.get('modules') or {}).get('gold_macro') or {}
        min_strength  = gold_cfg.get('min_strength', 'MODERATE')   # WEAK / MODERATE / STRONG
        allow_low_conf = gold_cfg.get('allow_low_confidence', False)
        require_regime_align = gold_cfg.get('require_regime_alignment', True)

        # Pull gold model from KV (pre-computed by browser, pushed on every FRED refresh)
        snap      = state.get('regime_snapshot') or {}
        gold_kv   = snap.get('gold_model')  # set by state_reader.fetch_state()
        if not gold_kv:
            return ModuleResult(
                passed=False, signal='NEUTRAL', score=0.0, confidence='LOW',
                reason='Gold model not in KV — open the dashboard on XAU/USD tab to push it',
            )

        signal     = gold_kv.get('signal', 'NEUTRAL')
        strength   = gold_kv.get('strength', 'WEAK')
        regime     = gold_kv.get('regime', 'NEUTRAL')
        regime_lbl = gold_kv.get('regimeLabel', regime)
        confidence = gold_kv.get('confidence', 'MEDIUM')
        size_mult  = float(gold_kv.get('sizeMult', 1.0))
        score      = float(gold_kv.get('goldScore', 0.0))
        is_transitioning = gold_kv.get('isTransitioning', False)
        transition_signals = gold_kv.get('transitionSignals') or []

        # Convert goldScore [-1, +1] to a normalised bot score [0, 1]
        normalised = (score + 1) / 2  # 0 = max bearish, 1 = max bullish

        # ── Strength gate ──────────────────────────────────────────────────────
        strength_rank = {'WEAK': 0, 'MODERATE': 1, 'STRONG': 2}
        min_rank      = strength_rank.get(min_strength, 1)
        actual_rank   = strength_rank.get(strength, 0)

        if actual_rank < min_rank:
            return ModuleResult(
                passed=False, signal=signal, score=normalised, confidence=confidence,
                reason=f'Gold signal strength {strength} < required {min_strength} '
                       f'(regime: {regime_lbl})',
            )

        # ── Confidence gate ────────────────────────────────────────────────────
        if confidence == 'LOW' and not allow_low_conf:
            trans_summary = '; '.join(transition_signals[:2]) if transition_signals else 'regime transitioning'
            return ModuleResult(
                passed=False, signal='NEUTRAL', score=normalised, confidence='LOW',
                reason=f'Regime confidence LOW — {trans_summary}. '
                       f'Set allow_low_confidence=true to override',
            )

        # ── Signal neutrality gate ─────────────────────────────────────────────
        if signal not in TRADEABLE_SIGNALS:
            return ModuleResult(
                passed=False, signal='NEUTRAL', score=0.5, confidence=confidence,
                reason=f'Gold signal NEUTRAL — no directional conviction '
                       f'(regime: {regime_lbl}, score: {score:+.2f})',
            )

        # ── Regime alignment gate ──────────────────────────────────────────────
        if require_regime_align:
            if signal == 'BULLISH' and regime in BEARISH_REGIMES:
                return ModuleResult(
                    passed=False, signal=signal, score=normalised, confidence=confidence,
                    reason=f'BULLISH signal in {regime_lbl} regime — regime bias is BEARISH gold. '
                           f'Real yield momentum likely dominant. Set require_regime_alignment=false to override',
                )
            if signal == 'BEARISH' and regime in BULLISH_REGIMES:
                return ModuleResult(
                    passed=False, signal=signal, score=normalised, confidence=confidence,
                    reason=f'BEARISH signal in {regime_lbl} regime — regime bias is BULLISH gold. '
                           f'Set require_regime_alignment=false to override',
                )

        # ── Direction mapping for composite decision ───────────────────────────
        direction = 'LONG' if signal == 'BULLISH' else 'SHORT'

        # ── Transition risk: downgrade confidence but still pass ───────────────
        effective_confidence = confidence
        if is_transitioning:
            # Downgrade confidence for the composite decision context
            effective_confidence = 'MEDIUM' if confidence == 'HIGH' else 'LOW'

        # Build reason string with key data points
        tips_str  = f'TIPS {gold_kv["tips"]:.2f}%'   if gold_kv.get('tips')   is not None else ''
        tips_mom  = gold_kv.get('tipsMom')
        bei_str   = f'BEI {gold_kv["bei"]:.2f}%'     if gold_kv.get('bei')    is not None else ''
        bei_mom   = gold_kv.get('beiMom')

        mom_parts = []
        if tips_mom is not None:
            mom_parts.append(f'real yield Δ{tips_mom*100:+.1f}bp')
        if bei_mom is not None:
            mom_parts.append(f'BEI Δ{bei_mom*100:+.1f}bp')

        reason_parts = [
            f'Gold {direction} · {signal} {strength}',
            f'regime: {regime_lbl}',
            f'score: {score:+.2f}',
            f'conf: {confidence}',
        ]
        if tips_str:  reason_parts.append(tips_str)
        if bei_str:   reason_parts.append(bei_str)
        if mom_parts: reason_parts.append(' · '.join(mom_parts))
        if is_transitioning:
            reason_parts.append(f'⚠ transitioning (size ×{size_mult})')

        fed_signal = gold_kv.get('fedPricingSignal')
        if fed_signal:
            reason_parts.append(fed_signal)

        return ModuleResult(
            passed=True,
            signal=direction,
            score=normalised,
            confidence=effective_confidence,
            reason=' · '.join(reason_parts),
            metadata={
                'gold_signal':     signal,
                'gold_strength':   strength,
                'gold_score':      score,
                'regime':          regime,
                'regime_label':    regime_lbl,
                'confidence':      confidence,
                'size_mult':       size_mult,
                'is_transitioning': is_transitioning,
                'direction':       direction,
            },
        )
