// js/terminal/helixLogo.js: the H.E.L.I.X. mark (Holistic Economic Links & Intermarket Xplorer), a turning double helix drawn on a small 2D canvas (start-up screen and the broadcast's title card).
// Two glowing strands (the accent and gold), the rungs between them, and beads on each strand that brighten as they swing to the front: the
// "linked strands" of the macro chain. Colours come from the theme tokens (--jva, --gold) read off the host element, so it follows every theme.
// Reduced motion: one still frame. Returns stop(); it also stops by itself when the canvas leaves the page.

/** Points of the two strands at phase t: for each of n steps along the axis, the across-axis offset and depth (-1 back .. 1 front) of strand A; strand B is opposite. */
export function helixPoints(n, t, turns = 2.2) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const u = n === 1 ? 0 : i / (n - 1), a = u * turns * Math.PI * 2 + t;
    out.push({ u, y: Math.sin(a), z: Math.cos(a) });
  }
  return out;
}

export function helixLogo(canvas, { calm = false, turns = 2.2, speed = 0.9 } = {}) {
  const win = canvas.ownerDocument.defaultView, ctx = canvas.getContext('2d'); if (!ctx) return () => {};
  const css = getComputedStyle(canvas), tok = (n, d) => css.getPropertyValue(n).trim() || d;
  const cA = tok('--jva', 'deepskyblue'), cB = tok('--gold', 'goldenrod');
  let raf = 0, stopped = false; const t0 = win.performance.now();
  const frame = now => {
    if (stopped || !canvas.isConnected) return;
    const dpr = win.devicePixelRatio || 1, W = canvas.clientWidth, H = canvas.clientHeight;
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    const t = calm ? 0.6 : ((now - t0) / 1000) * speed, P = helixPoints(64, t, turns), pad = 10, amp = H * 0.34, mid = H / 2, X = u => pad + u * (W - 2 * pad);
    const fadeEnd = u => Math.min(1, u * 6, (1 - u) * 6);          // the strands taper in at both ends
    ctx.lineCap = 'round';
    for (let i = 0; i < P.length; i += 3) {                         // rungs, dim, brighter where the pair faces you
      const p = P[i], x = X(p.u), a = (0.08 + 0.25 * (1 - Math.abs(p.z))) * fadeEnd(p.u); if (a < 0.02) continue;
      ctx.globalAlpha = a; ctx.strokeStyle = cA; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, mid + p.y * amp); ctx.lineTo(x, mid - p.y * amp); ctx.stroke();
    }
    for (const [sgn, col] of [[1, cA], [-1, cB]]) {                // the two strands: back halves thin and dim, front halves bright with a glow
      for (let i = 1; i < P.length; i++) {
        const p0 = P[i - 1], p1 = P[i], z = sgn * (p0.z + p1.z) / 2, f = fadeEnd(p1.u);
        const d = (z + 1) / 2;                                       // 0 at the back .. 1 at the front: width, brightness and glow follow it
        ctx.globalAlpha = (0.22 + 0.75 * d) * f; ctx.strokeStyle = col; ctx.lineWidth = 1 + 1.7 * d;
        ctx.shadowColor = col; ctx.shadowBlur = d > 0.55 ? 14 * d : 0;
        ctx.beginPath(); ctx.moveTo(X(p0.u), mid + sgn * p0.y * amp); ctx.lineTo(X(p1.u), mid + sgn * p1.y * amp); ctx.stroke();
      }
      ctx.shadowBlur = 0;
      for (let i = 4; i < P.length - 3; i += 6) {                    // beads: the nodes of the chain
        const p = P[i], z = sgn * p.z; if (z < 0.2) continue;
        ctx.globalAlpha = z * fadeEnd(p.u); ctx.fillStyle = col; ctx.shadowColor = col; ctx.shadowBlur = 14;
        ctx.beginPath(); ctx.arc(X(p.u), mid + sgn * p.y * amp, 1.6 + 1.6 * z, 0, Math.PI * 2); ctx.fill();
      }
      ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1;
    if (!calm) raf = win.requestAnimationFrame(frame);
  };
  raf = win.requestAnimationFrame(frame);
  return () => { stopped = true; win.cancelAnimationFrame(raf); };
}
