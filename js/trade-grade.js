// trade-grade.js — synthesises signal score + range bias + HMM into a clear trade grade
// Pure utility — no state imports. Works with the minimal KV-saved entry format.
//
// Input entry shape (minimum required):
//   { direction, signalScore, rangeBias: {confirmCount,conflictCount}, tags, totalStars }
// hmmData shape (optional):
//   { regime: 'RANGE'|'TREND', trendDir: 'BULL'|'BEAR'|null, trendProb, rangeProb }
// intraday30m shape (optional):
//   { regime: 'TREND'|'RANGE', dir: 'BULL'|'BEAR'|null, label }

export function gradeEntry(entry, hmmData = null, intraday30m = null) {
  const score      = entry.signalScore ?? 0;
  const rb         = entry.rangeBias;
  const total      = rb ? (rb.confirmCount + rb.conflictCount) : 0;
  const conviction = total > 0 ? (rb.confirmCount - rb.conflictCount) / total : 0;
  const tags       = (entry.tags ?? []).map(t => (typeof t === 'string' ? t : (t.label ?? '')));
  const isDense    = tags.some(t => t.includes('Dense'));
  const isCross    = tags.some(t => t.includes('Cross'));
  const isTight    = tags.some(t => t.includes('Tight'));

  const reasons  = [];
  const warnings = [];
  let   hardStop = false;

  // ── HMM regime ────────────────────────────────────────────────────────────
  if (hmmData?.regime) {
    const isLong    = entry.direction === 'long';
    const withTrend = (isLong && hmmData.trendDir === 'BULL') || (!isLong && hmmData.trendDir === 'BEAR');

    if (hmmData.regime === 'RANGE') {
      reasons.push(`Range regime ${Math.round((hmmData.rangeProb ?? 0) * 100)}%`);
    } else if (hmmData.regime === 'TREND') {
      const pct = Math.round((hmmData.trendProb ?? 0) * 100);
      if (!withTrend) {
        warnings.push(`${hmmData.trendDir} trend opposing (${pct}%)`);
        if ((hmmData.trendProb ?? 0) > 0.82) hardStop = true;
      } else {
        reasons.push(`Trend ${hmmData.trendDir} aligned ${pct}%`);
      }
    }
  }

  // ── 30m intraday swing regime ────────────────────────────────────────────
  if (intraday30m?.regime === 'TREND') {
    const isLong       = entry.direction === 'long';
    const swingAligned = (isLong && intraday30m.dir === 'BULL') || (!isLong && intraday30m.dir === 'BEAR');
    if (!swingAligned) warnings.push(`30m BOS ${intraday30m.dir} opposing`);
    else if (reasons.length < 3) reasons.push(`30m BOS ${intraday30m.dir}`);
  }

  // ── Signal score ──────────────────────────────────────────────────────────
  if      (score >= 70) reasons.push(`Signal ${score}% strong`);
  else if (score >= 50) reasons.push(`Signal ${score}% moderate`);
  else if (score <  38) warnings.push(`Signal ${score}% weak`);

  // ── Range bias conviction ─────────────────────────────────────────────────
  if (rb && total > 0) {
    if      (conviction >  0.30) reasons.push(`RB ${rb.confirmCount}✓ ${rb.conflictCount}✗`);
    else if (conviction < -0.25) {
      warnings.push(`RB conflict ${rb.confirmCount}✓ ${rb.conflictCount}✗`);
      if (conviction < -0.45) hardStop = true;
    }
  }

  // ── Structural quality ────────────────────────────────────────────────────
  if (isCross) reasons.push('Cross-session');
  if (isTight && reasons.length < 3) reasons.push('Tight Fib');

  // ── Dense zone quality ────────────────────────────────────────────────────
  if (isDense) {
    const dangerous = warnings.length > 0 || score < 48;
    if (dangerous)           warnings.push('Dense zone — absorption risk');
    else if (reasons.length < 3) reasons.push('Dense zone — reversal');
  }

  // ── Grade ─────────────────────────────────────────────────────────────────
  let grade, color;
  if (hardStop) {
    grade = 'SKIP'; color = '#ef4444';
  } else if (score >= 72 && conviction >= 0.10 && warnings.length === 0) {
    grade = 'A+';   color = '#22c55e';
  } else if (score >= 60 && warnings.length <= 1) {
    grade = 'A';    color = '#4ade80';
  } else if (score >= 46) {
    grade = 'B';    color = '#f59e0b';
  } else if (score >= 30) {
    grade = 'C';    color = '#94a3b8';
  } else {
    grade = 'D';    color = '#64748b';
  }

  // ── R:R ratio gate ────────────────────────────────────────────────────────
  // A high signal score with poor risk/reward is a losing expectancy trade.
  const rr = parseFloat(entry.rrRatio ?? entry.rr ?? 0) || 0;
  if (rr > 0 && grade !== 'SKIP' && grade !== 'D') {
    if (rr < 1.0) {
      if (grade === 'A+' || grade === 'A') { grade = 'B'; color = '#f59e0b'; }
      warnings.push(`R:R 1:${rr} — below breakeven`);
    } else if (rr < 1.5 && grade === 'A+') {
      grade = 'A'; color = '#4ade80';  // A+ requires at least 1.5R
    }
  }

  const verdict = grade === 'SKIP'                    ? 'SKIP'
                : (grade === 'A+' || grade === 'A')   ? 'TAKE'
                : grade === 'B'                       ? 'WATCH'
                : grade === 'C'                       ? 'CAUTION'
                :                                       'SKIP';  // D = too weak

  return {
    grade,
    color,
    verdict,
    reasons:  reasons.slice(0, 3),
    warnings: warnings.slice(0, 2),
    hardStop,
  };
}
