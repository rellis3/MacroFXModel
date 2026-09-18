"""Per-currency daily loss circuit breaker — bot-local risk state, deliberately
NOT server-side (unlike the vote/pricing math). It needs the bot's OWN
real-time realized P&L stream, which only exists here (see the plan's Step 4
discussion, LEGO_MODULES.md's 2026-08-28 currency-loss-gate entry) — the same
category as oi_bot's RiskGuard (drawdown/cooldown/lockout are already bot-side
for the identical reason).

OOS-validated in JS BEFORE being ported here (js/levelAtlasVoteReview.js's
applyCurrencyLossGate, scripts/oos_validate_currency_loss_gate.mjs — a 1%
daily-loss/currency cap improved EVERY OOS metric on a 70/30 held-out split:
Sharpe +0.23, annVol -8.7pp, maxDD +4.69pp, CVaR95 +2.08pp). This class is a
LIVE, causal reimplementation of the same tally logic, not a re-derivation —
`CCY_LEGS` is ported verbatim from levelAtlasVoteReview.js's own map.

The backtest version resets its tally per `trade.date` (verified to be the
plain UTC-calendar date the touch fell on — see the implementation plan's
"gate reset clock" note); this live version resets at UTC midnight, which is
the SAME thing, not an approximation of it.
"""
from __future__ import annotations

# Verbatim port of js/levelAtlasVoteReview.js's CCY_LEGS.
CCY_LEGS = {
    "EURUSD": ["EUR", "USD"], "GBPUSD": ["GBP", "USD"], "USDJPY": ["USD", "JPY"], "AUDUSD": ["AUD", "USD"],
    "NZDUSD": ["NZD", "USD"], "USDCAD": ["USD", "CAD"], "USDCHF": ["USD", "CHF"],
    "EURJPY": ["EUR", "JPY"], "EURGBP": ["EUR", "GBP"], "EURAUD": ["EUR", "AUD"], "EURCAD": ["EUR", "CAD"], "EURCHF": ["EUR", "CHF"],
    "GBPJPY": ["GBP", "JPY"], "GBPAUD": ["GBP", "AUD"], "GBPCHF": ["GBP", "CHF"],
    "AUDJPY": ["AUD", "JPY"], "AUDCAD": ["AUD", "CAD"], "CADJPY": ["CAD", "JPY"], "CHFJPY": ["CHF", "JPY"], "NZDJPY": ["NZD", "JPY"],
}


def currency_legs(pair: str) -> list[str]:
    """FX pair -> [base, quote] currency legs. Non-FX instruments (gold,
    indices) map to their own symbol so the gate treats them uniformly
    without pretending they share currency exposure with an actual pair —
    same fallback js/levelAtlasVoteReview.js's currencyLegs uses."""
    return CCY_LEGS.get(pair.upper(), [pair.upper()])


def _utc_date(epoch_secs: float) -> str:
    from datetime import datetime, timezone
    return datetime.fromtimestamp(epoch_secs, tz=timezone.utc).strftime("%Y-%m-%d")


class CurrencyLossGate:
    """Same-day realized-loss tally per currency leg, reset at UTC midnight.

    Strictly causal and REACTIVE (unlike the backtest's touch-ordered replay,
    this is genuinely live: a close only updates the tally the instant it
    actually happens, via the broker's own closed-trade stream) — there is no
    equivalent of the backtest's "resolveTime <= this trade's own open time"
    lookahead guard to worry about here, since positions close in real order
    by construction.
    """

    def __init__(self, max_daily_loss_pct: float = 1.0):
        self.max_daily_loss_pct = float(max_daily_loss_pct)
        self._date: str | None = None
        self._tally: dict[str, float] = {}
        self._seen_ids: set = set()   # closed-trade ids already folded into the tally (idempotent replay)

    def _roll_if_new_day(self, now: float) -> None:
        d = _utc_date(now)
        if d != self._date:
            self._date = d
            self._tally.clear()
            self._seen_ids.clear()

    def record_close(self, pair: str, pnl_pct: float, now: float, trade_id=None) -> None:
        """Fold one closed trade's realized pnl% into today's per-currency
        tally. `trade_id` (a ticket/position_id) makes this idempotent — the
        executor may call this every status cycle with the broker's FULL
        closed-trades list, not just newly-closed ones, so a trade must only
        ever count once."""
        self._roll_if_new_day(now)
        if trade_id is not None:
            if trade_id in self._seen_ids:
                return
            self._seen_ids.add(trade_id)
        for ccy in currency_legs(pair):
            self._tally[ccy] = self._tally.get(ccy, 0.0) + float(pnl_pct)

    def blocked(self, pair: str, now: float) -> str | None:
        """None if `pair` is free to trade; else a human-readable reason.
        Blocks if ANY of the pair's own currency legs already has a realized
        loss beyond the threshold TODAY — an unrelated leg's losses never
        block a pair that doesn't share it."""
        self._roll_if_new_day(now)
        for ccy in currency_legs(pair):
            loss = self._tally.get(ccy, 0.0)
            if loss <= -self.max_daily_loss_pct:
                return f"currency loss gate: {ccy} realized {loss:.2f}% today (cap {self.max_daily_loss_pct:g}%)"
        return None

    def snapshot(self) -> dict:
        """For the status push — today's date + per-currency running tally,
        so the dashboard can show WHY a pair is currently gated."""
        return {"date": self._date, "tally": dict(self._tally)}
