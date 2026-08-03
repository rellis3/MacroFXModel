/**
 * Cone Calibration Core — the shared "does this envelope contain what it
 * claims" tally used by every cone in the forecast-path family (analogCone,
 * coneBlend). `forecastPathCore.js`'s own `calibrationTally` predates this
 * extraction and carries an inline copy of the same logic — left as-is
 * rather than refactored under this task's blast radius (production page,
 * see CLAUDE.md "don't refactor in place" caution); noted as a known-drift
 * candidate in LEGO_MODULES.md.
 *
 * gradeCone: one graded window -> { in50[], in75[], dirHit }.
 * tallyGrades: many graded windows -> per-step coverage rate + direction hit
 * rate — the same shape forecastPathCore.calibrationTally reports, so
 * calibration cards from different cones read side by side.
 * Pure — no network, no DOM.
 */
export function gradeCone(bars, cone, i, H) {
  const w = { in50: new Array(H), in75: new Array(H), dirHit: null };
  for (let h = 1; h <= H; h++) {
    const c = bars[i - 1 + h].close, s = cone.steps[h - 1];
    w.in50[h - 1] = c >= s.p50Dn && c <= s.p50Up;
    w.in75[h - 1] = c >= s.p75Dn && c <= s.p75Up;
  }
  const move = bars[i - 1 + H].close - cone.anchor;
  const mu = cone.steps[H - 1].center - cone.anchor;
  if (mu !== 0 && move !== 0) w.dirHit = Math.sign(move) === Math.sign(mu);
  return w;
}

export function tallyGrades(ws, H) {
  const perStep = [];
  for (let k = 0; k < H; k++) {
    let a = 0, b = 0;
    for (const w of ws) { if (w.in50[k]) a++; if (w.in75[k]) b++; }
    perStep.push({ h: k + 1, c50: ws.length ? a / ws.length : null, c75: ws.length ? b / ws.length : null });
  }
  const dir = ws.filter(w => w.dirHit !== null);
  return { n: ws.length, perStep,
           direction: { n: dir.length, hitRate: dir.length ? dir.filter(w => w.dirHit).length / dir.length : null } };
}
