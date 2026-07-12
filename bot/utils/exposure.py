"""exposure — net USD-exposure accounting for the portfolio guard.

Pure math for bot/main.py's `max_usd_exposure_pct` entry guard: every position
carries USD exposure with a SIGN decided by whether USD is the base or the
quote of its pair —

    long  EUR/USD  →  short USD   (sign −1 × risk)
    short EUR/USD  →  long  USD   (sign +1 × risk)
    long  USD/JPY  →  long  USD   (sign +1 × risk)
    short USD/JPY  →  short USD   (sign −1 × risk)

so long EURUSD + short USDJPY are ADDITIVE short-USD bets, not offsetting ones.
Exposure is measured in risk-% terms (each position's risk_pct with its
direction sign), which is a guard heuristic, not a notional portfolio model —
it stops the bot from quietly stacking one big USD bet across pairs.

Standalone (no other utils imports) so it is unit-testable without MT5.
"""
from __future__ import annotations


def usd_risk_sign(pair: str, direction: str) -> int:
    """+1 if the position is long USD, −1 if short USD, 0 if USD isn't a leg.
    `pair` in any form ('EUR/USD', 'EURUSD', 'USD_JPY'); `direction` LONG/SHORT
    (BUY/SELL accepted)."""
    p = (pair or '').upper().replace('_', '/')
    if '/' not in p and len(p) == 6:
        p = f'{p[:3]}/{p[3:]}'
    base, _, quote = p.partition('/')
    s = 1 if str(direction).upper() in ('LONG', 'BUY') else -1
    if quote == 'USD':
        return -s          # long the pair = long base, short USD
    if base == 'USD':
        return s           # long the pair = long USD
    return 0               # cross (EUR/GBP…) — no direct USD leg


def net_usd_risk_pct(positions, default_risk_pct: float = 1.0) -> float:
    """Signed net USD risk (% of balance) across open positions.

    `positions` is an iterable of dicts with at least `pair` and `direction`;
    `risk_pct` is used when present, else `default_risk_pct` (positions opened
    before risk_pct was recorded)."""
    net = 0.0
    for pos in positions or []:
        pair = pos.get('pair') or pos.get('symbol')
        direction = pos.get('direction')
        if not pair or not direction:
            continue
        risk = pos.get('risk_pct')
        if risk is None:
            risk = default_risk_pct
        net += usd_risk_sign(pair, direction) * float(risk)
    return net


def usd_exposure_block_reason(pair: str, direction: str, risk_pct: float,
                              open_positions, cap_pct: float,
                              default_risk_pct: float = 1.0) -> str | None:
    """Reason string if adding (pair, direction, risk_pct) would push the
    portfolio's |net USD risk| over `cap_pct`, else None.

    Never blocks a trade that REDUCES |net USD risk| (blocking a hedge that
    brings exposure down would be perverse), and never blocks pairs with no
    USD leg. cap_pct <= 0 disables the guard."""
    if cap_pct is None or cap_pct <= 0:
        return None
    sign = usd_risk_sign(pair, direction)
    if sign == 0:
        return None
    net_before = net_usd_risk_pct(open_positions, default_risk_pct)
    net_after = net_before + sign * float(risk_pct)
    if abs(net_after) > cap_pct + 1e-9 and abs(net_after) > abs(net_before):
        return (f'USD exposure cap: net USD risk {net_before:+.2f}% '
                f'{"+" if sign > 0 else "-"} {abs(float(risk_pct)):.2f}% ({pair} {direction}) '
                f'→ {net_after:+.2f}% exceeds ±{cap_pct:.2f}%')
    return None
