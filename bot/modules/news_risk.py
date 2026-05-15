from .base import BaseModule, ModuleResult


class NewsRiskModule(BaseModule):
    """
    Stub module — always returns LOW risk so the action-handling infrastructure
    is wired and ready. Fill in economic calendar / social media logic here later.

    When HIGH risk: return action='move_sl_to_breakeven'
    When EXTREME risk: return action='close_all'
    """

    name = 'news_risk'

    def evaluate(self, state: dict, pair: str, config: dict, ctx: dict = None) -> ModuleResult:
        return ModuleResult(
            passed=True, signal='NEUTRAL', score=0.5, confidence='LOW',
            reason='News risk: stub — LOW (no calendar integration yet)',
            action=None,
        )
