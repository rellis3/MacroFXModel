"""
RegimeV2 — Telegram message formatter.

Builds rich regime change alerts, heartbeats, entry/exit notifications,
and lockout alerts from per-pair state dicts.
"""

from datetime import datetime, timezone
from typing import Optional

# ── Emoji maps ─────────────────────────────────────────────────────────────────

_REGIME_EMOJI = {
    'BULL':  '🟢',
    'BEAR':  '🔴',
    'RANGE': '🟡',
    'CHOP':  '⚪',
}

_REGIME_LABEL = {
    'BULL': 'Bull',
    'BEAR': 'Bear',
    'RANGE': 'Range',
    'CHOP': 'Chop',
}


def _emoji(regime: str) -> str:
    return _REGIME_EMOJI.get(regime.upper(), '⚫')


def _label(regime: str) -> str:
    return _REGIME_LABEL.get(regime.upper(), regime.title())


def _fmt_mins(seconds: float) -> str:
    mins = int(seconds / 60)
    if mins < 60:
        return f'{mins}m'
    return f'{mins // 60}h {mins % 60}m'


def _vol_desc(vol_z: float) -> str:
    if vol_z < -1.5:
        return f'{vol_z:.1f}σ — thin market, reduce size'
    if vol_z < -0.5:
        return f'{vol_z:.1f}σ — below-average volume'
    if vol_z < 0.5:
        return f'{vol_z:.1f}σ — normal volume'
    if vol_z < 1.5:
        return f'+{vol_z:.1f}σ — above-average activity'
    return f'+{vol_z:.1f}σ — elevated activity, widen stops'


def _slope_arrow(slope: float) -> str:
    if slope > 1.0:
        return '↑↑'
    if slope > 0.3:
        return '↑'
    if slope < -1.0:
        return '↓↓'
    if slope < -0.3:
        return '↓'
    return '→'


# ── Commentary generator ───────────────────────────────────────────────────────

def _commentary(regime: str, conf: float, slope: float, run_mins: float,
                momentum_mins: float, change_prob: float, vol_z: float,
                consensus: int, consensus_total: int,
                h1_regime: Optional[str] = None,
                exhaustion_score: float = 0.0,
                news_event: Optional[str] = None,
                vix_stress: bool = False,
                session_label: str = 'CALM',
                pair_vol_pct: Optional[float] = None,
                vol_coherence: bool = False) -> list[str]:
    """Returns list of commentary lines + one action line."""

    lines = []
    direction = _label(regime)

    # Trend quality
    if run_mins >= 30 and conf >= 85 and slope >= 0:
        lines.append(f'{direction} trend is clean and well-established.')
    elif run_mins < 5:
        lines.append(f'Still establishing — only {_fmt_mins(run_mins * 60)} old.')
    elif run_mins < 15 and conf < 80:
        lines.append(f'{direction} is young — wait for confirmation before adding.')

    # Momentum continuity
    if momentum_mins > run_mins + 10:
        n_transitions = max(1, int((momentum_mins - run_mins) / 15))
        lines.append(
            f'Momentum unbroken for {_fmt_mins(momentum_mins * 60)} '
            f'(across {n_transitions} transition{"s" if n_transitions > 1 else ""}).'
        )

    # Confidence direction
    if slope > 2.0:
        lines.append('Confidence rising strongly — regime strengthening.')
    elif slope > 0.5:
        lines.append('Confidence rising — regime building.')
    elif slope < -4.0:
        lines.append('⚠️ Confidence falling sharply — regime fragmenting.')
    elif slope < -1.5:
        lines.append('Confidence fading — consider tightening stops.')

    # Change probability warning
    if change_prob > 60:
        lines.append(f'Model warns {direction} likely changing soon ({change_prob:.0f}% change prob).')
    elif change_prob > 40:
        lines.append(f'Model notes elevated change risk ({change_prob:.0f}% change prob).')

    # Volume context
    if vol_z < -1.5:
        lines.append(f'Volume {vol_z:.1f}σ — thin market, treat signals cautiously.')
    elif vol_z > 1.5:
        lines.append(f'Volume +{vol_z:.1f}σ — elevated activity, widen stops.')

    # Volume exhaustion
    if exhaustion_score > 0.75:
        lines.append('⚠️ Volume exhausting — trend may be ending even if regime intact.')
    elif exhaustion_score > 0.55:
        lines.append('Volume trend weakening — monitor for exhaustion.')

    # 1h alignment
    if h1_regime and h1_regime.upper() != regime.upper():
        lines.append(f'1h regime is {_label(h1_regime)} — lower-timeframe move, reduce conviction.')

    # Cross-pair consensus
    if consensus_total > 1:
        if consensus < 2:
            lines.append(f'Only {consensus}/{consensus_total} pairs in same regime — macro confirmation weak.')
        elif consensus >= consensus_total - 1:
            lines.append(f'Strong consensus: {consensus}/{consensus_total} pairs aligned.')

    # Macro flags
    if vix_stress:
        lines.append('⚠️ VIX backwardation — macro stress active, reduce size.')
    if news_event:
        lines.append(f'📅 News: {news_event} — exercise caution.')
    if session_label == 'CALM' and run_mins < 10:
        lines.append('Asian session — lower-conviction window, require stronger confirmation.')

    # Implied vol context (CBOE FX indices)
    if pair_vol_pct is not None and pair_vol_pct >= 85:
        lines.append(f'⚠️ Implied vol {pair_vol_pct:.0f}th %ile — historically elevated, expect wider ranges.')
    elif pair_vol_pct is not None and pair_vol_pct >= 65:
        lines.append(f'Implied vol {pair_vol_pct:.0f}th %ile — above average, widen stops.')
    if vol_coherence:
        lines.append('All FX vol indices elevated simultaneously — systemic risk-off, not pair-specific.')

    # ── Action line ─────────────────────────────────────────────────────────────
    regime_up = regime.upper()
    long_short = 'longs' if regime_up == 'BULL' else 'shorts'

    if change_prob > 60 or slope < -4.0 or exhaustion_score > 0.75:
        action = f'→ Trail stop aggressively. Exit risk elevated.'
    elif slope < -1.5 or vol_z < -1.5:
        action = f'→ Hold {long_short}. Avoid new entries until conditions improve.'
    elif vix_stress or (h1_regime and h1_regime.upper() != regime_up):
        action = f'→ Hold {long_short} only. No new entries — macro/HTF conflict.'
    elif conf >= 80 and slope >= 0 and consensus >= 2:
        action = f'→ Hold {long_short}. Regime strong — full conviction.'
    else:
        action = f'→ Hold {long_short}. Monitor for confirmation.'

    lines.append(action)
    return lines


# ── Message builders ───────────────────────────────────────────────────────────

def regime_change_alert(
    pair: str,
    prev_regime: str,
    new_regime: str,
    confidence: float,
    price: float,
    vol_z: float,
    run_length: int,
    change_prob: float,
    prev_regime_duration_secs: float,
    consensus: int,
    consensus_total: int,
    h1_regime: Optional[str] = None,
    bocpd_prob: float = 0.0,
    macro: Optional[dict] = None,
    utc_offset_hours: int = 0,
) -> str:
    macro = macro or {}
    emoji = _emoji(new_regime)
    pair_disp = pair.replace('/', '')

    now = datetime.now(timezone.utc)
    if utc_offset_hours:
        from datetime import timedelta
        now = now + timedelta(hours=utc_offset_hours)
    time_str = now.strftime('%Y-%m-%d %H:%M') + (
        f' UTC+{utc_offset_hours}' if utc_offset_hours > 0
        else f' UTC{utc_offset_hours}' if utc_offset_hours < 0
        else ' UTC'
    )

    chg_prob_display = f'{100 - confidence:.1f}%'
    if bocpd_prob > 0:
        chg_prob_display = f'{bocpd_prob:.1f}%'

    lines = [
        f'{emoji} <b>{pair_disp} Regime Change</b>',
        f'  {_label(prev_regime)} → {_label(new_regime)}',
        f'  Confidence : {confidence:.1f}%',
        f'  Price      : {_fmt_price(price, pair)}',
        f'  Volume z   : {vol_z:+.2f}σ',
        f'  Chg-pt prob: {chg_prob_display}  (run {run_length} bars)',
    ]

    # 1h alignment
    if h1_regime:
        h1_label = _label(h1_regime)
        h1_change = 100 - confidence  # simple proxy if no 1h conf available
        if h1_regime.upper() == new_regime.upper():
            lines.append(f'  Regime (1h): ✅ confirming {h1_label}')
        else:
            lines.append(f'  Regime (1h): ⚠️ {h1_label} — conflict')
    else:
        lines.append(f'  Regime (1h): — (Phase 2)')

    # Previous regime duration
    if prev_regime_duration_secs > 0:
        lines.append(f'  {_label(prev_regime)} lasted: {_fmt_mins(prev_regime_duration_secs)}')

    # Cross-pair consensus
    if consensus_total > 1:
        lines.append(f'  Pairs {_label(new_regime)}: {consensus}/{consensus_total}')

    # Macro context
    vix_ratio = macro.get('vix_ratio')
    fomc_hours = macro.get('fomc_hours_away')
    if vix_ratio and vix_ratio < 0.95:
        lines.append(f'  ⚠️ VIX stress: ratio {vix_ratio:.2f} (backwardation)')
    if fomc_hours is not None and fomc_hours < 48:
        lines.append(f'  📅 FOMC in {fomc_hours:.0f}h — elevated uncertainty')

    lines.append(f'  Time       : {time_str}')

    return '\n'.join(lines)


def heartbeat_message(
    pair: str,
    regime: str,
    confidence: float,
    slope: float,
    vol_z: float,
    regime_secs: float,
    momentum_secs: float,
    change_prob: float,
    open_pos: Optional[dict] = None,
    h1_regime: Optional[str] = None,
    bocpd_prob: float = 0.0,
    exhaustion_score: float = 0.0,
    consensus: int = 0,
    consensus_total: int = 0,
    macro: Optional[dict] = None,
    session_label: str = 'CALM',
    reg_score: Optional[dict] = None,
) -> str:
    macro = macro or {}
    emoji = _emoji(regime)
    pair_disp = pair.replace('/', '')
    vix_stress = (macro.get('vix_ratio') or 1.0) < 0.95
    news_event = macro.get('next_news_name')

    score_total = reg_score.get('score') if reg_score else None
    score_tag   = f'  score={score_total:.0f}' if score_total is not None else ''

    lines = [
        f'{emoji} <b>{pair_disp} — {_label(regime)}  ({confidence:.1f}%{score_tag})</b>',
        f'  {_label(regime)} active for : {_fmt_mins(regime_secs)}',
    ]

    if momentum_secs > regime_secs + 60:
        lines.append(f'  Momentum        : unbroken {_fmt_mins(momentum_secs)}')

    slope_arr = _slope_arrow(slope)
    lines.append(f'  Conf slope      : {slope:+.1f}%/bar {slope_arr}')

    if bocpd_prob > 0:
        stability = 'stable' if bocpd_prob < 15 else ('⚠️ elevated' if bocpd_prob < 50 else '🔴 high')
        lines.append(f'  Chg-pt prob     : {bocpd_prob:.1f}% — {stability}')
    else:
        chg = 100 - confidence
        lines.append(f'  Chg-pt prob     : {chg:.1f}%')

    if h1_regime:
        h1_icon = '✅' if h1_regime.upper() == regime.upper() else '⚠️'
        lines.append(f'  Regime (1h)     : {h1_icon} {_label(h1_regime)}')

    lines.append(f'  Volume          : {_vol_desc(vol_z)}')

    if exhaustion_score > 0.5:
        lines.append(f'  Vol exhaustion  : {exhaustion_score:.2f} ⚠️')

    if open_pos:
        direction = open_pos.get('direction', '')
        pnl = open_pos.get('pnl_pips', 0)
        dur = open_pos.get('duration_secs', 0)
        sign = '+' if pnl >= 0 else ''
        lines.append(f'  Position        : {direction} {_fmt_mins(dur)}  {sign}{pnl:.1f}p')

    if vix_stress:
        lines.append(f'  ⚠️ VIX          : backwardation — macro stress')

    news_mins = macro.get('next_news_mins')
    if news_event and news_mins is not None and news_mins < 30:
        lines.append(f'  📅 News in {news_mins:.0f}m   : {news_event}')

    pair_vol_pct  = macro.get('pair_vol_pct')
    vol_coherence = macro.get('vol_coherence', False)
    if pair_vol_pct is not None and pair_vol_pct >= 65:
        vol_sym = macro.get('pair_vol_level')
        pct_str = f'{pair_vol_pct:.0f}th %ile'
        level_str = f'  ({vol_sym:.1f})' if vol_sym else ''
        lines.append(f'  Impl vol        : {pct_str}{level_str}')
    if vol_coherence:
        lines.append(f'  Vol coherence   : ⚠️ all FX vols elevated — systemic')

    # Composite score breakdown
    if reg_score and reg_score.get('components'):
        comps = reg_score['components']
        parts = [f"{v['label']} {v['score']:.0f}" for v in comps.values()]
        sep = '  '
        lines.append(f'  Score breakdown : {sep.join(parts)}')

    lines.append('')

    commentary = _commentary(
        regime=regime, conf=confidence, slope=slope,
        run_mins=regime_secs / 60, momentum_mins=momentum_secs / 60,
        change_prob=change_prob, vol_z=vol_z,
        consensus=consensus, consensus_total=consensus_total,
        h1_regime=h1_regime, exhaustion_score=exhaustion_score,
        news_event=news_event if (news_mins or 99) < 30 else None,
        vix_stress=vix_stress, session_label=session_label,
        pair_vol_pct=pair_vol_pct, vol_coherence=vol_coherence,
    )
    lines.extend(commentary)

    return '\n'.join(lines)


def entry_alert(
    pair: str, direction: str, regime: str, confidence: float,
    price: float, sl: float, lots: float, paper_mode: bool,
    consensus: int = 0, consensus_total: int = 0,
    h1_regime: Optional[str] = None,
    vol_z: float = 0.0,
    reg_score: Optional[dict] = None,
) -> str:
    emoji = '🟢' if direction == 'LONG' else '🔴'
    pair_disp = pair.replace('/', '')
    pip = {'XAU/USD': 1.0, 'NAS100_USD': 1.0}.get(pair, 0.0001)
    sl_pips = abs(price - sl) / pip
    paper_tag = ' [PAPER]' if paper_mode else ''
    consensus_str = f'  Consensus : {consensus}/{consensus_total}\n' if consensus_total > 1 else ''
    h1_str = f'  1h regime : {_label(h1_regime)}\n' if h1_regime else ''

    score_str = ''
    if reg_score:
        score_str = (
            f'  Score     : {reg_score.get("score", 0):.0f}/100  '
            f'(size {reg_score.get("size_pct", 100):.0f}%)\n'
        )

    return (
        f'{emoji} <b>[V2] {pair_disp} — {direction}{paper_tag}</b>\n'
        f'  Regime    : {_label(regime)} ({confidence:.1f}%)\n'
        f'  Price     : {_fmt_price(price, pair)}\n'
        f'  SL        : {_fmt_price(sl, pair)}  ({sl_pips:.1f}p)\n'
        f'  Lots      : {lots:.2f}\n'
        f'  Vol z     : {vol_z:+.2f}σ\n'
        f'{score_str}'
        f'{consensus_str}'
        f'{h1_str}'
        f'  <i>Exit: regime shift / confidence collapse / score exit / SL</i>'
    )


def exit_alert(
    pair: str, direction: str, exit_reason: str,
    conf_at_exit: float, regime_at_exit: str,
    pnl_pips: float, duration_secs: float,
    paper_mode: bool,
) -> str:
    pnl_emoji = '✅' if pnl_pips >= 0 else '❌'
    sign = '+' if pnl_pips >= 0 else ''
    paper_tag = ' [PAPER]' if paper_mode else ''
    pair_disp = pair.replace('/', '')
    regime_note = (
        f'  Regime    : still {_label(regime_at_exit)} — pre-emptive exit\n'
        if regime_at_exit.upper() in ('BULL', 'BEAR') else
        f'  Regime    : {_label(regime_at_exit)} — regime flipped\n'
    )

    return (
        f'{pnl_emoji} <b>[V2] {pair_disp} — CLOSED {direction}{paper_tag}</b>\n'
        f'  Exit      : {exit_reason}\n'
        f'  Conf      : {conf_at_exit:.1f}%\n'
        f'{regime_note}'
        f'  P&L       : {sign}{pnl_pips:.1f} pips\n'
        f'  Duration  : {_fmt_mins(duration_secs)}'
    )


def lockout_alert(pair: str, reason: str, lock_mins: float) -> str:
    return (
        f'🔒 <b>[V2] RiskGuard locked</b>\n'
        f'  Pair   : {pair.replace("/", "")}\n'
        f'  Reason : {reason}\n'
        f'  Clears : in {_fmt_mins(lock_mins * 60)}\n'
        f'  <i>Use bot-config Unlock V2 button to clear early</i>'
    )


def macro_alert(event: str, detail: str) -> str:
    return f'📊 <b>[V2] Macro</b>\n  {event}\n  {detail}'


# ── Helpers ────────────────────────────────────────────────────────────────────

def _fmt_price(price: float, pair: str) -> str:
    if pair in ('XAU/USD', 'NAS100_USD'):
        return f'{price:.2f}'
    if 'JPY' in pair:
        return f'{price:.3f}'
    return f'{price:.5f}'
