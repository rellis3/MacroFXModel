"""
RegimeV4 — Composite Regime Score.

Changes vs V2:
  - bocpd_trend parameter: penalises BOCPD score when change-point probability
    is rising fast (early warning that regime is ending).
  - Consensus counts peers in ANY directional regime (BULL or BEAR), not
    same-direction only. Fixes the USD-strength directional-paradox bug.
  - entry_score_min default raised to 65 (from V2's 55) to compensate for
    fewer hard entry gates.
  - vol/credit components retained but default to neutral when data unavailable
    (same as V2, no change).

Components and weights:
  HMM confidence        35%  — core regime signal
  BOCPD stability       20%  — inverted change-point probability (+ trend penalty)
  Session quality       15%  — London/NY vs Asian session
  DXY alignment         10%  — USD macro direction vs pair direction
  Cross-pair consensus  10%  — how many OTHER pairs are in a directional regime
  Implied vol (CBOE)     5%  — inverted 52-week percentile
  Credit spread (HYG)    5%  — risk-on/off from high-yield bond market
"""

from dataclasses import dataclass, field
from typing import Optional

WEIGHTS: dict[str, float] = {
    'hmm':       0.35,
    'bocpd':     0.20,
    'session':   0.15,
    'dxy':       0.10,
    'consensus': 0.10,
    'vol':       0.05,
    'credit':    0.05,
}

# True  = pair BULL aligns with DXY rising (USD is quote: USD/JPY)
# False = pair BULL aligns with DXY falling (USD is base: EUR/USD)
# None  = no DXY relationship (cross pairs, indices)
_DXY_USD_BULL: dict[str, bool | None] = {
    'EUR/USD': False, 'GBP/USD': False, 'USD/JPY': True,
    'AUD/USD': False, 'NZD/USD': False, 'USD/CAD': True,
    'USD/CHF': True,  'GBP/JPY': None,  'EUR/GBP': None,
    'EUR/JPY': None,  'EUR/CHF': None,  'GBP/CHF': None,
    'AUD/JPY': None,  'CAD/JPY': None,  'NZD/JPY': None,
    'AUD/CHF': None,  'AUD/CAD': None,  'AUD/NZD': None,
    'GBP/AUD': None,  'GBP/CAD': None,  'GBP/NZD': None,
    'EUR/AUD': None,  'EUR/CAD': None,  'EUR/NZD': None,
    'CHF/JPY': None,  'XAU/USD': False,
    'NAS100_USD': None, 'SPX500_USD': None, 'DE30_USD': None,
    'UK100_GBP': None,  'US30_USD': None,   'US2000_USD': None,
}


@dataclass
class ScoreComponent:
    name:     str
    label:    str
    raw_val:  float
    raw_unit: str
    score:    float
    weight:   float
    weighted: float


@dataclass
class RegimeScoreV4:
    components:    list[ScoreComponent]
    total:         float
    entry_allowed: bool
    size_pct:      float   # 50–100 based on score; 0 if below entry_score_min

    def component(self, name: str) -> Optional[ScoreComponent]:
        for c in self.components:
            if c.name == name:
                return c
        return None

    def weakest(self, n: int = 2) -> list[ScoreComponent]:
        return sorted(self.components, key=lambda c: c.score)[:n]

    def to_dict(self) -> dict:
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
        return '  '.join(f'{c.label} {c.score:.0f}' for c in self.components)


def compute_regime_score_v4(
    pair:            str,
    regime:          str,
    confidence:      float,
    bocpd_prob:      float,
    bocpd_trend:     float,        # OLS slope of last N BOCPD values — V4 new
    session_mult:    float,
    peer_directional:int,          # other pairs in BULL or BEAR (any direction)
    peer_total:      int,          # total other pairs (excl self)
    pair_vol_pct:    Optional[float],
    dxy_trend_pct:   float = 0.0,  # DXY 5-day % change; + = USD strengthening
    credit_5d_ret:   float = 0.0,  # HYG 5-day % return; + = risk-on
    entry_score_min: float = 65.0,
) -> RegimeScoreV4:
    """
    Compute composite regime score for one pair.

    peer_directional — count of OTHER configured pairs currently in BULL or BEAR
                       (not RANGE). Does not include the pair being scored.
    peer_total       — total number of other configured pairs.
    bocpd_trend      — OLS slope of the last 3–5 BOCPD probability values.
                       Positive = BOCPD rising (regime instability increasing).
                       Used to penalise the BOCPD stability component.
    """

    # 1. HMM confidence — meaningful range 65–100%
    hmm_s = max(0.0, min(100.0, (confidence - 65.0) / 35.0 * 100.0))

    # 2. BOCPD stability (inverted) + rising-trend penalty
    bocpd_s = max(0.0, 100.0 - bocpd_prob)
    if bocpd_trend > 10.0:
        bocpd_s = max(0.0, bocpd_s - bocpd_trend)

    # 3. Session quality — 0.70 (Asian) → 1.00 (London/NY)
    sess_s = max(0.0, min(100.0, (session_mult - 0.70) / 0.30 * 100.0))

    # 4. DXY alignment
    dxy_rel = _DXY_USD_BULL.get(pair)
    if dxy_rel is None or abs(dxy_trend_pct) < 0.30:
        dxy_s = 50.0
    else:
        is_bull     = regime.upper() == 'BULL'
        is_bear     = regime.upper() == 'BEAR'
        dxy_rising  = dxy_trend_pct > 0
        bull_aligned = (dxy_rising == dxy_rel)
        aligned      = (is_bull and bull_aligned) or (is_bear and not bull_aligned)
        strength     = min(1.0, abs(dxy_trend_pct) / 2.0)
        dxy_s        = (50.0 + 50.0 * strength) if aligned else (50.0 - 50.0 * strength)

    # 5. Peer directional consensus — are OTHER pairs trending (any direction)?
    if peer_total <= 0:
        cons_s = 50.0
    else:
        cons_s = min(100.0, peer_directional / peer_total * 100.0)

    # 6. Implied vol — inverted 52-week percentile
    if pair_vol_pct is None:
        vol_s = 75.0
    else:
        vol_s = max(0.0, min(100.0, (85.0 - pair_vol_pct) / 85.0 * 100.0))

    # 7. Credit spread (HYG) — +2% = 100, 0% = 50, -2% = 0
    credit_s = max(0.0, min(100.0, (credit_5d_ret + 2.0) / 4.0 * 100.0))

    raw: dict[str, tuple[float, str, float, str]] = {
        'hmm':       (hmm_s,    'HMM conf',   confidence,            '%'),
        'bocpd':     (bocpd_s,  'BOCPD stab', bocpd_prob,            '%'),
        'session':   (sess_s,   'Session',    session_mult,          'x'),
        'dxy':       (dxy_s,    'DXY align',  dxy_trend_pct,         '%5d'),
        'consensus': (cons_s,   'Peer dir',   float(peer_directional),''),
        'vol':       (vol_s,    'Impl vol',   pair_vol_pct or 50.0,  '%ile'),
        'credit':    (credit_s, 'Credit/HYG', credit_5d_ret,         '%5d'),
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
            score=round(s, 1), weight=w,
            weighted=round(contrib, 1),
        ))
    total = round(total, 1)

    if total >= entry_score_min:
        span     = max(1.0, 100.0 - entry_score_min)
        size_pct = 50.0 + (total - entry_score_min) / span * 50.0
    else:
        size_pct = 0.0
    size_pct = round(min(100.0, size_pct), 1)

    return RegimeScoreV4(
        components=components,
        total=total,
        entry_allowed=total >= entry_score_min,
        size_pct=size_pct,
    )
