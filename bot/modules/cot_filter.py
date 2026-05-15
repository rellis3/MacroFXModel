from .base import BaseModule, ModuleResult


class COTFilterModule(BaseModule):
    """
    CFTC Commitment of Traders confirmation.
    Uses leveraged-fund net positioning (levNet) and its week-on-week change
    (levNetChg) to determine whether spec money is aligned with the entry direction.

    Confirms: COT direction matches entry → pass.
    Conflicts: COT direction opposes entry → block.
    Flat / ambiguous → pass with neutral score (no extra edge, no veto).
    """

    name = 'cot_filter'

    def evaluate(self, state: dict, pair: str, config: dict, ctx: dict = None) -> ModuleResult:
        snap = state.get('regime_snapshot') or {}
        pair_data = (snap.get('pairs') or {}).get(pair) or {}
        cot = pair_data.get('cot')

        if not cot:
            return ModuleResult(
                passed=True, signal='NEUTRAL', score=0.5, confidence='LOW',
                reason='No COT data — filter skipped',
            )

        lev_net     = cot.get('levNet', 0) or 0
        lev_net_chg = cot.get('levNetChg', 0) or 0
        gross_ratio = cot.get('grossRatio', 1.0) or 1.0

        # Determine COT directional signal
        if lev_net > 0 and lev_net_chg >= 0:
            cot_signal = 'LONG'
            score = min(0.55 + abs(lev_net_chg) / max(abs(lev_net), 1) * 0.25, 0.90)
        elif lev_net < 0 and lev_net_chg <= 0:
            cot_signal = 'SHORT'
            score = min(0.55 + abs(lev_net_chg) / max(abs(lev_net), 1) * 0.25, 0.90)
        elif lev_net > 0:
            cot_signal = 'LONG'   # net long but reducing — weakening momentum
            score = 0.40
        elif lev_net < 0:
            cot_signal = 'SHORT'  # net short but covering
            score = 0.40
        else:
            cot_signal = 'NEUTRAL'
            score = 0.50

        # Check against entry direction from confluence
        entry_direction = None
        if ctx and 'confluence' in ctx and ctx['confluence']:
            entry_direction = ctx['confluence'].signal  # LONG | SHORT

        reason = f'COT {cot_signal} · levNet:{lev_net:+d} chg:{lev_net_chg:+d} ratio:{gross_ratio:.2f}'

        if entry_direction in ('LONG', 'SHORT') and cot_signal not in ('NEUTRAL',):
            if cot_signal != entry_direction:
                return ModuleResult(
                    passed=False, signal=cot_signal, score=score, confidence='MEDIUM',
                    reason=f'COT CONFLICT — {cot_signal} vs entry {entry_direction} · {reason}',
                )

        return ModuleResult(
            passed=True, signal=cot_signal, score=score, confidence='MEDIUM',
            reason=reason,
            metadata={'lev_net': lev_net, 'lev_net_chg': lev_net_chg, 'gross_ratio': gross_ratio},
        )
