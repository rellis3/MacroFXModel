from datetime import datetime, timezone, timedelta
from .base import BaseModule, ModuleResult
from utils.config_helpers import pair_currencies, COUNTRY_CURRENCY


class NewsRiskModule(BaseModule):
    """
    Reads events_today from state (fetched from dashboard KV).
    Applies a configurable pre-event blackout for HIGH impact events
    affecting currencies in the pair being evaluated.

    HIGH impact within blackout_mins → BLOCK
    HIGH impact within 2× blackout   → NEUTRAL pass, reduced size flag
    Otherwise                        → LOW risk pass
    """

    name = 'news_risk'

    def evaluate(self, state: dict, pair: str, config: dict, ctx: dict = None) -> ModuleResult:
        events_today = state.get('events_today') or []
        nr_cfg       = config.get('news_risk') or {}
        blackout_min = nr_cfg.get('blackout_mins', 30)
        pair_ccys    = pair_currencies(pair)

        if not events_today or not pair_ccys:
            return ModuleResult(
                passed=True, signal='NEUTRAL', score=0.5, confidence='LOW',
                reason='No calendar data — news risk not assessed',
            )

        now_utc = datetime.now(timezone.utc)
        relevant: list[dict] = []

        for ev in events_today:
            impact  = (ev.get('impact') or '').lower()
            country = (ev.get('country') or '').upper()
            ccy     = COUNTRY_CURRENCY.get(country)
            if not ccy or ccy not in pair_ccys:
                continue
            if impact not in ('high',):
                continue
            # Parse event time
            try:
                ev_time = datetime.fromisoformat(
                    (ev.get('time') or '').replace('Z', '+00:00')
                )
            except (ValueError, TypeError):
                continue
            minutes_away = (ev_time - now_utc).total_seconds() / 60
            relevant.append({
                'event':       ev.get('event', '?'),
                'country':     country,
                'ccy':         ccy,
                'minutes_away': minutes_away,
            })

        if not relevant:
            return ModuleResult(
                passed=True, signal='NEUTRAL', score=0.7, confidence='MEDIUM',
                reason=f'No HIGH impact events affecting {pair} — clear',
            )

        # Sort by soonest
        relevant.sort(key=lambda e: abs(e['minutes_away']))
        soonest = relevant[0]
        mins    = soonest['minutes_away']

        if -5 <= mins <= blackout_min:
            # Inside pre-event window (also covers up to 5 min after)
            return ModuleResult(
                passed=False, signal='BLOCK', score=0.0, confidence='HIGH',
                reason=(
                    f'NEWS BLACKOUT — {soonest["event"]} ({soonest["ccy"]}) '
                    f'in {mins:.0f}m — {blackout_min}m pre-event window active'
                ),
            )

        if blackout_min < mins <= blackout_min * 2:
            # Approaching — pass but flag it
            return ModuleResult(
                passed=True, signal='NEUTRAL', score=0.35, confidence='MEDIUM',
                reason=(
                    f'NEWS CAUTION — {soonest["event"]} ({soonest["ccy"]}) '
                    f'in {mins:.0f}m — consider reduced size'
                ),
            )

        return ModuleResult(
            passed=True, signal='NEUTRAL', score=0.7, confidence='MEDIUM',
            reason=f'Next HIGH impact: {soonest["event"]} in {mins:.0f}m — OK',
        )
