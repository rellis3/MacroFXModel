from dataclasses import dataclass, field
from typing import Optional


@dataclass
class ModuleResult:
    passed: bool
    signal: str          # LONG | SHORT | NEUTRAL | BLOCK
    score: float         # 0.0–1.0 confidence contribution
    confidence: str      # HIGH | MEDIUM | LOW
    reason: str          # one-line human log
    metadata: dict = field(default_factory=dict)
    action: Optional[str] = None  # move_sl_to_breakeven | close_all


class BaseModule:
    name: str = 'base'

    def evaluate(self, state: dict, pair: str, config: dict, ctx: dict = None) -> ModuleResult:
        raise NotImplementedError
