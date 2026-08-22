from datetime import datetime, timezone

from .base import BaseModule, ModuleResult

# Report older than this many days → the module stands down (COT is weekly;
# a fresh report is already 3–10 days old when it lands, so >10 days means a
# missed report cycle and the positioning read is no longer current).
STALE_DAYS = 10

# Percentile extremes (DF-01): beyond these, spec positioning is CROWDED and
# is a contrarian caution, not a confirmation.
EXTREME_HI = 90.0
EXTREME_LO = 10.0

# Fallback when the snapshot has no percentile: |z| of spec net vs history
# beyond this counts as an extreme.
EXTREME_Z = 2.0


def _parse_report_date(raw) -> datetime | None:
    """COT report date arrives as 'YYYY-MM-DD' (cot-extremes path), an ISO
    timestamp, or 'Month D, YYYY' (legacy parseCFTCFile changeDate)."""
    if not raw:
        return None
    s = str(raw).strip().split('T')[0]
    for fmt in ('%Y-%m-%d', '%B %d, %Y', '%b %d, %Y'):
        try:
            return datetime.strptime(s.replace(',', ', ').replace('  ', ' '), fmt) \
                .replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return None


class COTFilterModule(BaseModule):
    """
    CFTC positioning filter — DF-01 recipe (Batch 6 rewrite).

    The old module treated the raw sign of leveraged-fund net positioning
    (levNet) plus its weekly change as directional CONFIRMATION. The lesson
    recipe (DF-01) is the opposite framing: positioning only carries signal at
    EXTREMES, where the crowd is one-sided and the trade is crowded —
    net position → normalise by open interest → rolling z-score → percentile
    vs history → treat >90th / <10th percentile as contrarian caution.

    What the KV snapshot (regime_snapshot.pairs[pair].cot, built by the
    dashboard from cot_extremes_v2) actually provides:
      · specSharePct / specShareZ — percentile and z of the spec net as a
        SHARE OF OPEN INTEREST, ranked over the fetched history. This is the
        DF-01 step-2 read and is PREFERRED when present. (Until 2026-08-21
        the dashboard adapter dropped these fields, so this module could only
        ever see the raw ones — the §4.3 defect. They now flow through from
        /api/cot-extremes; the legacy manual-URL pipeline still has no
        history and emits neither, hence the fallback below.)
      · specPct — percentile of the CURRENT spec net vs the full fetched
        history (~3y), ranked on the RAW contract count. Used as fallback
        only: raw ranks conflate "more crowded" with "bigger market", since
        open interest itself drifts over the lookback.
      · specZ — z-score of the raw spec net vs the same history (last-resort
        extreme detector when neither percentile is present).
      · levPct — current net as % of current OI (single point; reported in
        metadata only, no history to rank it against).
      · reportDate / changeDate — CFTC report date, used for the staleness
        gate below.

    Behaviour:
      · report date missing or > STALE_DAYS old  → NEUTRAL pass with warning.
      · no extreme                               → NEUTRAL pass, score 0.5
        (positioning is NOT confirmation — no directional vote either way).
      · extreme AND entry direction rides the crowd (entry LONG into >90th
        pct crowded-long, or SHORT into <10th crowded-short) → module FAILS
        (passed=False) so the entry loses this module from the composite and
        the reason is journalled. Not a hard BLOCK signal — other modules may
        still legitimately kill or carry the entry.
      · extreme AND entry fades the crowd → pass with a modest contrarian
        score bump (0.60) — still no directional vote (signal stays NEUTRAL,
        so it never counts toward min_agree).
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

        lev_net  = cot.get('levNet', 0) or 0
        # OI-NORMALISED FIRST (DF-01 step 2), raw net as fallback. The worker ranks
        # both; whether the share fields reach this snapshot depends on which
        # pipeline populated it (the /api/cot-extremes adapter carries them; the
        # legacy manual-URL path has no history and so emits neither). Falling back
        # keeps the filter working on either shape instead of going dark.
        share_pct = cot.get('specSharePct')
        share_z   = cot.get('specShareZ')
        spec_pct  = share_pct if share_pct is not None else cot.get('specPct')
        spec_z    = share_z   if share_z   is not None else cot.get('specZ')
        oi_basis  = 'OI-normalised' if share_pct is not None or share_z is not None else 'raw net'
        lev_pct  = cot.get('levPct')           # current net % of OI (single point)
        raw_date = cot.get('reportDate') or cot.get('changeDate')

        meta = {'lev_net': lev_net, 'spec_pct': spec_pct, 'spec_z': spec_z,
                'oi_basis': oi_basis,
                'lev_pct_of_oi': lev_pct, 'report_date': str(raw_date or '')}

        # ── Staleness gate ────────────────────────────────────────────────────
        report_dt = _parse_report_date(raw_date)
        if report_dt is None:
            return ModuleResult(
                passed=True, signal='NEUTRAL', score=0.5, confidence='LOW',
                reason=f'COT report date missing/unparseable ({raw_date!r}) — '
                       f'standing down (no staleness guarantee)',
                metadata=meta,
            )
        age_days = (datetime.now(timezone.utc) - report_dt).days
        meta['report_age_days'] = age_days
        if age_days > STALE_DAYS:
            return ModuleResult(
                passed=True, signal='NEUTRAL', score=0.5, confidence='LOW',
                reason=f'⚠ COT report {age_days}d old (> {STALE_DAYS}d) — stale, '
                       f'positioning read ignored',
                metadata=meta,
            )

        # ── Extreme detection (percentile preferred, z-score fallback) ────────
        crowded = None    # 'LONG' = crowd is stretched long, 'SHORT' = stretched short
        basis = ''
        if spec_pct is not None:
            if spec_pct >= EXTREME_HI:
                crowded, basis = 'LONG', f'{spec_pct:.0f}th pct'
            elif spec_pct <= EXTREME_LO:
                crowded, basis = 'SHORT', f'{spec_pct:.0f}th pct'
        elif spec_z is not None:
            # No percentile in this snapshot shape — use the raw-net z-score.
            if spec_z >= EXTREME_Z:
                crowded, basis = 'LONG', f'z={spec_z:+.1f}'
            elif spec_z <= -EXTREME_Z:
                crowded, basis = 'SHORT', f'z={spec_z:+.1f}'
        else:
            return ModuleResult(
                passed=True, signal='NEUTRAL', score=0.5, confidence='LOW',
                reason='COT snapshot has no percentile/z history fields — '
                       'extremes recipe not computable, standing down',
                metadata=meta,
            )

        entry_direction = None
        if ctx and 'confluence' in ctx and ctx['confluence']:
            sig = ctx['confluence'].signal
            if sig in ('LONG', 'SHORT'):
                entry_direction = sig

        if crowded is None:
            return ModuleResult(
                passed=True, signal='NEUTRAL', score=0.5, confidence='MEDIUM',
                reason=f'COT not extreme (pct={spec_pct} z={spec_z}) — '
                       f'positioning is not confirmation, no vote',
                metadata=meta,
            )

        # ── Extreme: contrarian caution, never confirmation ──────────────────
        if entry_direction == crowded:
            return ModuleResult(
                passed=False, signal='NEUTRAL', score=0.25, confidence='MEDIUM',
                reason=f'COT EXTREME — spec crowd stretched {crowded} ({basis}); '
                       f'{entry_direction} entry rides a crowded trade — caution veto',
                metadata=meta,
            )

        return ModuleResult(
            passed=True, signal='NEUTRAL', score=0.60, confidence='MEDIUM',
            reason=f'COT EXTREME {crowded} ({basis}) — entry fades the crowd '
                   f'(contrarian support)',
            metadata=meta,
        )
