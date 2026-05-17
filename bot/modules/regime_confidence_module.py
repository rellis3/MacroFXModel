from .base import BaseModule, ModuleResult


class RegimeConfidenceModule(BaseModule):
    """
    Regime Confidence Engine — continuous position-size scalar.

    Synthesises HMM state probabilities, GARCH clustering, ARMA transition risk,
    and Hurst exponent into a single size_mult (0.25–1.0).

    This module never hard-blocks a trade. Its sole job is to express how
    confident we are that the current regime is *stable* — and to reduce size
    proportionally when the regime is ambiguous or transitioning.

    Key insight: high vol means the *regime* may be changing, not just that
    price is moving faster. When GARCH vol is expanding relative to ATR the
    probability of a regime break is elevated → size down defensively.

    Multiplier scale:
      1.00 — HIGH_CONFIDENCE: HMM certain, GARCH stable, no transition signals
      0.70 — MODERATE: some ambiguity but no strong transition flag
      0.50 — LOW_CONFIDENCE: HMM near 50/50, or vol cluster expanding
      0.25 — DEFENSIVE: strong transition signals from multiple sources
    """

    name = 'regime_confidence'

    def evaluate(self, state: dict, pair: str, config: dict, ctx: dict = None) -> ModuleResult:
        snap     = (state.get('regime_snapshot') or {})
        pair_data = (snap.get('pairs') or {}).get(pair) or {}

        # ── Pull pre-computed data from KV snapshot ───────────────────────────
        hmm      = pair_data.get('hmm')   or {}
        vol      = pair_data.get('vol')   or {}
        arma     = pair_data.get('arma')  or {}
        hurst    = pair_data.get('hurst')  # float or None
        arima_kv = pair_data.get('arima') or {}

        garch = vol.get('garch') or {}

        # ── 1. HMM state certainty ────────────────────────────────────────────
        range_prob    = float(hmm.get('rangeProb', 0.5))
        hmm_certainty = abs(range_prob - 0.5) * 2  # 0 = coin-flip, 1 = certain

        # ── 2. GARCH cluster stability ────────────────────────────────────────
        cluster = (garch.get('cluster') or vol.get('volBias') or 'STABLE').upper()
        garch_stability = 0.55 if cluster == 'EXPANDING' else 0.85 if cluster == 'CONTRACTING' else 1.0

        # ── 3. Vol impulse — rapid acceleration signals potential regime break ─
        impulse_pct      = abs(float(vol.get('volImpulsePct', 0)))
        impulse_discount = 0.75 if impulse_pct > 30 else 0.90 if impulse_pct > 15 else 1.0

        # ── 4. ARMA/vol-transition low-vol persistence danger ────────────────
        # KV snapshot may store either the explicit flag or riskScore/transitionRisk
        low_vol_flag = bool(
            arma.get('lowVolPersistenceFlag')
            or arma.get('riskScore', 0) > 60
            or arma.get('transitionRisk') == 'HIGH'
        )
        arma_factor  = 0.75 if low_vol_flag else 1.0

        # ── 5. HMM sigma ratio (state separation clarity) ────────────────────
        sigma_ratio         = float(hmm.get('sigmaRatio', 2.0))
        separation_clarity  = 0.60 if sigma_ratio < 1.1 else 0.80 if sigma_ratio < 1.3 else 1.0

        # ── 6. Hurst exponent alignment ───────────────────────────────────────
        hurst_bonus = 0.0
        if hurst is not None:
            regime = hmm.get('regime', 'RANGE')
            if regime == 'RANGE':
                hurst_bonus = 0.08 if hurst < 0.45 else -0.08 if hurst > 0.55 else 0.0
            else:
                hurst_bonus = 0.08 if hurst > 0.55 else -0.08 if hurst < 0.45 else 0.0

        # ── 6. ARIMA price residual stability ─────────────────────────────────
        # Written to KV by browser alerts.js every 5 min per pair.
        # Default 0.85 when not yet available (conservative, doesn't punish cold start).
        arima_stability = float(arima_kv.get('residualStability', 0.85))

        # ── Combined regime confidence ────────────────────────────────────────
        raw_confidence    = (hmm_certainty * garch_stability * impulse_discount
                             * arma_factor * separation_clarity * arima_stability)
        regime_confidence = max(0.05, min(1.0, raw_confidence + hurst_bonus))

        # ── Transition risk (max of individual signals) ───────────────────────
        transition_risk = max(
            1 - hmm_certainty,
            0.65 if cluster == 'EXPANDING'    else 0.30 if cluster == 'CONTRACTING' else 0,
            0.55 if low_vol_flag              else 0,
            0.55 if sigma_ratio < 1.2         else 0,
            0.50 if impulse_pct > 30          else 0,
            0.60 if arima_stability < 0.50    else 0.35 if arima_stability < 0.70 else 0,
        )

        # ── Sizing multiplier (continuous, 0.25–1.0) ─────────────────────────
        confidence_adj  = 0.35 + 0.65 * regime_confidence
        transition_disc = transition_risk * 0.45
        size_mult       = round(max(0.25, confidence_adj * (1 - transition_disc)), 2)

        defensive = transition_risk > 0.55 or regime_confidence < 0.30

        if regime_confidence > 0.72:
            label, confidence_str = 'HIGH_CONFIDENCE', 'HIGH'
        elif regime_confidence > 0.45:
            label, confidence_str = 'MODERATE', 'MEDIUM'
        elif not defensive:
            label, confidence_str = 'LOW_CONFIDENCE', 'LOW'
        else:
            label, confidence_str = 'DEFENSIVE', 'LOW'

        reason = (
            f'confidence={regime_confidence:.2f} transition={transition_risk:.2f} '
            f'→ size_mult={size_mult:.2f} [{label}]'
            + (' ⚠ DEFENSIVE' if defensive else '')
        )

        # Inherit direction from upstream context — this module only affects sizing
        inherited = 'NEUTRAL'
        if ctx:
            for module_name in ('macro_regime', 'vol_gate', 'gold_macro'):
                upstream = ctx.get(module_name)
                if upstream and upstream.signal in ('LONG', 'SHORT'):
                    inherited = upstream.signal
                    break

        return ModuleResult(
            passed=True,
            signal=inherited,
            score=regime_confidence,
            confidence=confidence_str,
            reason=reason,
            metadata={
                'regime_confidence': regime_confidence,
                'transition_risk':   transition_risk,
                'size_mult':         size_mult,
                'defensive_mode':    defensive,
                'label':             label,
                'hmm_certainty':     round(hmm_certainty, 2),
                'garch_stability':   garch_stability,
                'sigma_ratio':       sigma_ratio,
                'low_vol_flag':      low_vol_flag,
                'arima_stability':   round(arima_stability, 2),
            },
        )
