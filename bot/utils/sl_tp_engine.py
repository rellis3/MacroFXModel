from dataclasses import dataclass, field
from typing import Optional

_PIP_SIZES = {
    'EUR/USD': 0.0001, 'GBP/USD': 0.0001, 'USD/JPY': 0.01,
    'AUD/USD': 0.0001, 'XAU/USD': 1.0,   'EUR/GBP': 0.0001,
    'USD/CAD': 0.0001, 'USD/CHF': 0.0001, 'GBP/JPY': 0.01,
    'NAS100_USD': 1.0,
}

# Approximate pip values per 1 standard lot, in USD
_PIP_VALUES = {
    'EUR/USD': 10.0, 'GBP/USD': 10.0, 'AUD/USD': 10.0, 'EUR/GBP': 10.0,
    'USD/JPY': 9.0,  'USD/CAD': 7.5,  'USD/CHF': 10.5, 'GBP/JPY': 9.0,
    'XAU/USD': 100.0, 'NAS100_USD': 1.0,
}


@dataclass
class SLTPResult:
    sl: float
    tp: float                           # TP2 / final target
    sl_method: str
    tp_method: str
    rr_ratio: float
    sl_capped: bool = False
    tp_capped: bool = False
    tp1: Optional[float] = None         # first partial-close target (tp1r × R)
    tp1_close_pct: Optional[float] = None
    tp2: Optional[float] = None         # alias for tp (kept for compatibility)
    trailoffset_dist: Optional[float] = None  # trailing-stop distance after TP1 hit


class SLTPEngine:
    def __init__(self, config: dict):
        self.sl_tp = config.get('sl_tp') or {}
        ec = config.get('execution') or {}
        # Ladder exit ratios — settable via /tp1r, /tp2r, /trailoffset commands
        self.tp1r        = ec.get('tp1r',        self.sl_tp.get('tp1r',        0.3))
        self.tp2r        = ec.get('tp2r',         self.sl_tp.get('tp2r',         1.0))
        self.trailoffset = ec.get('trailoffset',  self.sl_tp.get('trailoffset',  0.7))

    def pip_size(self, pair: str) -> float:
        return _PIP_SIZES.get(pair, 0.0001)

    def pip_value(self, pair: str) -> float:
        return _PIP_VALUES.get(pair, 10.0)

    def calculate(self, entry: dict, pair: str, pair_data: dict,
                  direction: str, price: float) -> SLTPResult:
        sl_method   = self.sl_tp.get('sl_method', 'structure')
        tp_method   = self.sl_tp.get('tp_method', 'confluence')
        pip         = self.pip_size(pair)
        max_sl_pips = self.sl_tp.get('max_sl_pips', 50)
        max_tp_pips = self.sl_tp.get('max_tp_pips', 100)

        sl, sl_used = self._calc_sl(entry, pair, pair_data, direction, price, pip, sl_method, max_sl_pips)
        tp, tp_used = self._calc_tp(entry, pair, pair_data, direction, price, pip, tp_method, sl)

        # Hard pip caps (non-negotiable)
        sl_capped = tp_capped = False
        if abs(price - sl) / pip > max_sl_pips:
            sl = (price + max_sl_pips * pip) if direction == 'short' else (price - max_sl_pips * pip)
            sl_capped = True

        if abs(tp - price) / pip > max_tp_pips:
            tp = (price - max_tp_pips * pip) if direction == 'short' else (price + max_tp_pips * pip)
            tp_capped = True

        sl_dist = abs(price - sl)
        rr = round(abs(tp - price) / sl_dist, 2) if sl_dist > 0 else 0.0

        # ── Ladder exits (tp1r / tp2r / trailoffset) ──────────────────────────
        tp1 = tp1_close_pct = trailoffset_dist = None
        if sl_dist > 0:
            sign = 1 if direction == 'long' else -1
            tp1  = round(price + sign * sl_dist * self.tp1r, 5)

            # tp2r overrides the dashboard/ATR tp if it would be a tighter target
            tp2_calc = round(price + sign * sl_dist * self.tp2r, 5)
            if abs(tp2_calc - price) > abs(tp - price):
                pass  # dashboard tp already further — keep it
            else:
                tp = tp2_calc

            tp1_close_pct    = self.sl_tp.get('tp1_close_pct', 50)
            trailoffset_dist = round(sl_dist * self.trailoffset, 5)

        # re-compute rr after possible tp2r override
        rr = round(abs(tp - price) / sl_dist, 2) if sl_dist > 0 else 0.0

        return SLTPResult(
            sl=round(sl, 5), tp=round(tp, 5),
            sl_method=sl_used, tp_method=tp_used, rr_ratio=rr,
            sl_capped=sl_capped, tp_capped=tp_capped,
            tp1=tp1, tp1_close_pct=tp1_close_pct,
            tp2=round(tp, 5),  # alias
            trailoffset_dist=trailoffset_dist,
        )

    def _calc_sl(self, entry, pair, pair_data, direction, price, pip, method, max_sl_pips):
        oi = pair_data.get('oi') or {}

        if method == 'structure':
            if direction == 'long':
                pw = oi.get('putWall') or 0
                if pw and pw < price and (price - pw) / pip <= max_sl_pips * 1.2:
                    return pw - pip * 2, 'structure_oi_put_wall'
            else:
                cw = oi.get('callWall') or 0
                if cw and cw > price and (cw - price) / pip <= max_sl_pips * 1.2:
                    return cw + pip * 2, 'structure_oi_call_wall'

            if entry.get('sl'):
                return float(entry['sl']), 'structure_dashboard'

        # ATR fallback
        sl_mult  = self.sl_tp.get('sl_atr_mult', 1.5)
        atr_pips = (pair_data.get('vol') or {}).get('atr_pips') or 15
        dist     = atr_pips * pip * sl_mult
        sl       = (price - dist) if direction == 'long' else (price + dist)
        return sl, 'atr'

    def _calc_tp(self, entry, pair, pair_data, direction, price, pip, method, sl):
        sl_dist = abs(price - sl)

        if method in ('confluence', 'partial'):
            if entry.get('tp'):
                return float(entry['tp']), f'{method}_dashboard'

        # Fixed R:R fallback — tp2r takes precedence over legacy tp1_rr
        tp_rr = self.tp2r if self.tp2r != 1.0 else self.sl_tp.get('tp1_rr', 1.5)
        dist  = sl_dist * tp_rr
        tp    = (price + dist) if direction == 'long' else (price - dist)
        return tp, 'fixed_rr'

    def position_size(self, balance: float, risk_pct: float,
                      sl_dist_price: float, pair: str, size_mult: float = 1.0) -> float:
        pip         = self.pip_size(pair)
        pv          = self.pip_value(pair)
        sl_pips     = sl_dist_price / pip
        risk_amount = balance * (risk_pct / 100)
        if sl_pips <= 0 or pv <= 0:
            return 0.01
        lots = (risk_amount / (sl_pips * pv)) * size_mult
        return max(0.01, round(lots, 2))
