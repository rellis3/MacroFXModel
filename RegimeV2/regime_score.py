"""
RegimeV2 — Composite Regime Score.

Aggregates seven independent signals into a single 0–100 score.
Every component is individually visible so you can see exactly why
the score is low — not just that it is.

Components and weights:
  HMM confidence        35%  — core regime signal
  BOCPD stability       20%  — inverted change-point probability
  Session quality       15%  — London/NY vs Asian session
  DXY alignment         10%  — USD macro direction vs pair direction
  Cross-pair consensus  10%  — how many pairs agree
  Implied vol (CBOE)     5%  — inverted 52-week percentile
  Credit spread (HYG)    5%  — risk-on/off from high-yield bond market

Score is used for:
  Entry gate  : score < entry_score_min (default 55) → no entry
  Lot sizing  : 50% of target at entry_min, 100% at 100
  Exit X11    : score falls below hold_score_min (default 40) for N bars
  Exit X12    : score drops ≥ drop_thresh pts from entry score in one bar
"""

from dataclasses import dataclass, field
from typing import Optional

# ── Weights — must sum to 1.0 ─────────────────────────────────────────────────

WEIGHTS: dict[str, float] = {
    'hmm':       0.35,
    'bocpd':     0.20,
    'session':   0.15,
    'dxy':       0.10,
    'consensus': 0.10,
    'vol':       0.05,
    'credit':    0.05,
}

# ── DXY directional relationship per pair ─────────────────────────────────────

# True  = pair BULL aligns with DXY rising (USD is the quote currency: USD/JPY etc)
# False = pair BULL aligns with DXY falling (USD is the base: EUR/USD etc)
# None  = no DXY relationship (cross pairs, equity indices)

_DXY_USD_BULL: dict[str, bool | None] = {
    'EUR/USD':    False,
    'GBP/USD':    False,
    'USD/JPY':    True,
    'AUD/USD':    False,
    'NZD/USD':    False,
    'USD/CAD':    True,
    'USD/CHF':    True,
    'GBP/JPY':    None,
    'EUR/GBP':    None,     # cross pair — no direct USD relationship
    'EUR/JPY':    None,
    'EUR/CHF':    None,
    'GBP/CHF':    None,
    'AUD/JPY':    None,
    'CAD/JPY':    None,
    'XAU/USD':    False,    # gold BULL = USD weakness
    'NAS100_USD': None,
    'SPX500_USD': None,
    'DE30_USD':   None,
    'UK100_GBP':  None,
}


# ── Data classes ──────────────────────────────────────────────────────────────

@dataclass
class ScoreComponent:
    name:     str    # internal key
    label:    str    # human-readable (shown in UI and Telegram)
    raw_val:  float  # input value before normalisation (for display)
    raw_unit: str    # unit suffix e.g. '%', '%ile', 'x', '%5d'
    score:    float  # 0–100 normalised component score
    weight:   float  # fractional weight 0–1
    weighted: float  # score × weight (actual contribution to total)


@dataclass
class RegimeScore:
    components:    list[ScoreComponent]
    total:         float   # 0–100 composite score
    entry_allowed: bool    # total >= entry_score_min
    size_pct:      float   # lot size as % of target (50–100)

    # ── Accessors ─────────────────────────────────────────────────────────────

    def component(self, name: str) -> Optional[ScoreComponent]:
        for c in self.components:
            if c.name == name:
                return c
        return None

    def weakest(self, n: int = 2) -> list[ScoreComponent]:
        """Return the N components pulling the score down the most."""
        return sorted(self.components, key=lambda c: c.score)[:n]

    def to_dict(self) -> dict:
        """Serialisable dict for KV status push — JS reads this."""
        return {
            'score':         round(self.total, 1),
            'size_pct':      round(self.size_pct, 1),
            'entry_allowed': self.entry_allowed,
            'components': {
                c.name: {
                    'label':    c.label,
                    'score':    round(c.score, 1),
                    'weighted': round(c.weighted, 1),
                    'raw':      round(c.raw_val, 2),
                    'unit':     c.raw_unit,
                }
                for c in self.components
            },
        }

    def compact_str(self) -> str:
        """One-line component summary for Telegram heartbeat."""
        parts = [f'{c.label} {c.score:.0f}' for c in self.components]
        return '  '.join(parts)


# ── Core computation ──────────────────────────────────────────────────────────

def compute_regime_score(
    pair:            str,
    regime:          str,
    confidence:      float,
    bocpd_prob:      float,
    session_mult:    float,
    consensus:       int,
    consensus_total: int,
    pair_vol_pct:    Optional[float],
    dxy_trend_pct:   float,   # DXY 5-day % change; + = USD strengthening
    credit_5d_ret:   float,   # HYG 5-day % return; + = risk-on
    entry_score_min: float = 55.0,
) -> RegimeScore:
    """
    Compute the composite regime score for one pair at one point in time.

    Parameters
    ----------
    dxy_trend_pct
        DXY (US Dollar Index) 5-day % change.
        > +0.3 = rising (USD strong).  < -0.3 = falling.  Between = flat.
    credit_5d_ret
        HYG 5-day % return. Positive = credit markets stable / risk-on.
        < -2% = credit stress building.
    entry_score_min
        Minimum total score to permit a new entry. Default 55.
    """

    # ── 1. HMM confidence ─────────────────────────────────────────────────────
    # Meaningful trading range: 65–100%. Below 65% ≈ near-random signal.
    hmm_s = max(0.0, min(100.0, (confidence - 65.0) / 35.0 * 100.0))

    # ── 2. BOCPD stability ────────────────────────────────────────────────────
    # 0% change-point probability → 100 (maximally stable).
    # 100% probability → 0 (regime ending).
    bocpd_s = max(0.0, 100.0 - bocpd_prob)

    # ── 3. Session quality ────────────────────────────────────────────────────
    # session_mult range: 0.75 (CALM/Asian) → 1.00 (STRESS/London+NY).
    # Normalise to 0–100.
    sess_s = max(0.0, min(100.0, (session_mult - 0.70) / 0.30 * 100.0))

    # ── 4. DXY alignment ─────────────────────────────────────────────────────
    dxy_rel = _DXY_USD_BULL.get(pair)
    if dxy_rel is None:
        # No DXY relationship — neutral 50
        dxy_s = 50.0
    else:
        is_bull  = regime.upper() == 'BULL'
        is_bear  = regime.upper() == 'BEAR'
        dxy_flat = abs(dxy_trend_pct) < 0.30

        if dxy_flat or (not is_bull and not is_bear):
            dxy_s = 50.0
        else:
            dxy_rising = dxy_trend_pct > 0
            # bull_aligns_with_rise: e.g. USD/JPY BULL = USD up = DXY rising
            bull_aligned = (dxy_rising == dxy_rel)
            trade_aligned = (is_bull and bull_aligned) or (is_bear and not bull_aligned)
            # Gradient: stronger DXY trend = stronger signal. Caps at ±2%.
            strength = min(1.0, abs(dxy_trend_pct) / 2.0)
            dxy_s = (50.0 + 50.0 * strength) if trade_aligned else (50.0 - 50.0 * strength)

    # ── 5. Cross-pair consensus ───────────────────────────────────────────────
    if consensus_total <= 1:
        cons_s = 50.0   # only one pair configured — no consensus possible
    else:
        cons_s = min(100.0, consensus / max(1, consensus_total - 1) * 100.0)

    # ── 6. Implied vol (CBOE FX index) ───────────────────────────────────────
    # 0th %ile → 100 (calm), 85th %ile → 0 (extreme). Linear.
    if pair_vol_pct is None:
        vol_s = 75.0   # assume moderate when data unavailable
    else:
        vol_s = max(0.0, min(100.0, (85.0 - pair_vol_pct) / 85.0 * 100.0))

    # ── 7. Credit spread (HYG) ────────────────────────────────────────────────
    # +2% 5d return → 100 (risk-on). 0% → 50. −2% → 0 (stress). Linear ±2%.
    credit_s = max(0.0, min(100.0, (credit_5d_ret + 2.0) / 4.0 * 100.0))

    # ── Weighted total ────────────────────────────────────────────────────────
    raw: dict[str, tuple[float, str, float, str]] = {
        # name: (score, label, raw_val, unit)
        'hmm':       (hmm_s,    'HMM conf',    confidence,          '%'),
        'bocpd':     (bocpd_s,  'BOCPD stab',  bocpd_prob,          '%'),
        'session':   (sess_s,   'Session',     session_mult,         'x'),
        'dxy':       (dxy_s,    'DXY align',   dxy_trend_pct,       '%5d'),
        'consensus': (cons_s,   'Consensus',   float(consensus),    ''),
        'vol':       (vol_s,    'Impl vol',    pair_vol_pct or 50.0,'%ile'),
        'credit':    (credit_s, 'Credit/HYG',  credit_5d_ret,       '%5d'),
    }

    components: list[ScoreComponent] = []
    total = 0.0
    for name, (s, label, rv, unit) in raw.items():
        w       = WEIGHTS[name]
        contrib = s * w
        total  += contrib
        components.append(ScoreComponent(
            name=name, label=label,
            raw_val=rv, raw_unit=unit,
            score=round(s, 1),
            weight=w,
            weighted=round(contrib, 1),
        ))
    total = round(total, 1)

    # ── Lot size scaling ──────────────────────────────────────────────────────
    # 50% at entry_score_min, 100% at score=100. Linear.
    if total >= entry_score_min:
        span     = max(1.0, 100.0 - entry_score_min)
        size_pct = 50.0 + (total - entry_score_min) / span * 50.0
    else:
        size_pct = 0.0
    size_pct = round(min(100.0, size_pct), 1)

    return RegimeScore(
        components=components,
        total=total,
        entry_allowed=total >= entry_score_min,
        size_pct=size_pct,
    )
