// js/terminal/globeCore.js: the pure maths behind Jarvis's hologram GLOBE (js/terminal/jarvisViewGlobe.js). No DOM, no three.js: the camera that follows the HUD's globe state
// (st.gl = { lat, lon, zoom, tlat, tlon, tzoom }), which side of the Earth a point is on, how tall a market's beacon stands, and where the land dots go.
// Tested by globeCore.test.mjs. DESCRIPTION ONLY: geometry for a picture, nothing here judges a market.
import { llToVec } from './jarvisCore.js';

export const FOV = 40, FOV_PHONE = 46, TILT_MAX = 0.9, HOP = 0.9;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = p => { const x = clamp(p, 0, 1); return x * x * (3 - 2 * x); };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = a => Math.hypot(a[0], a[1], a[2]);

/** The angle between two places on the globe, in degrees (0..180). */
export function angGap(lat1, lon1, lat2, lon2) { return Math.acos(clamp(dot(llToVec(lat1, lon1), llToVec(lat2, lon2)), -1, 1)) * 180 / Math.PI; }

/** The unit vector pointing north along the surface at (lat, lon). */
export function northAt(lat, lon) { const a = lat * Math.PI / 180, o = lon * Math.PI / 180; return [-Math.sin(a) * Math.sin(o), Math.cos(a), -Math.sin(a) * Math.cos(o)]; }

/** The globe's radius on screen at zoom 1, in px (the old 2D globe's size on a desktop; a little bigger on a phone so it is not a coin). */
export const baseRadius = (W, H, compact = W < 700) => (compact ? Math.min(W * 0.44, H * 0.34) : Math.min(W * 0.5, H) * 0.4);

/**
 * The camera for the globe state. zoom scales the globe's size on screen (as in the old 2D globe); when the camera is far from where it is heading (a region button, a SHOW focus) it pulls back
 * first (a hop) and comes in again; past zoom ~1.3 it tilts towards the horizon so the beacons stand up in 3D. Returns { pos, target, up, D (camera distance from the centre), tilt, zEff, fov }.
 */
export function globeCam(gl, { W = 1280, H = 720, compact = W < 700 } = {}) {
  const lat = clamp(gl?.lat ?? 20, -85, 85), lon = gl?.lon ?? 0, zoom = clamp(gl?.zoom ?? 1, 0.5, 6), fov = compact ? FOV_PHONE : FOV;
  const gap = gl?.tlat == null ? 0 : angGap(lat, lon, gl.tlat, gl.tlon ?? lon);
  const zEff = zoom / (1 + HOP * Math.min(1, gap / 100)), Rpx = baseRadius(W, H, compact) * zEff, k = Rpx * Math.tan(fov * Math.PI / 360) / (H / 2);
  const D = Math.sqrt(1 + 1 / (k * k)), tilt = TILT_MAX * ease((zEff - 1.25) / 1.75), c = llToVec(lat, lon), n = northAt(lat, lon), lift = 0.05 * tilt / TILT_MAX;
  const target = c.map(v => v * (1 + lift)), d = D - 1 - lift, ct = Math.cos(tilt), sn = Math.sin(tilt);
  const pos = target.map((v, i) => v + d * (ct * c[i] - sn * n[i])), up = n.map((v, i) => ct * v + sn * c[i]);
  return { pos, target, up, D, tilt, zEff, fov, gap };
}

/** How squarely a point faces the camera: 1 straight below the camera, 0 on the horizon, below 0 round the back. p = any point (its direction is what counts), cam = camera position. */
export function facing(p, cam) { const r = norm(cam), m = norm(p) || 1; return clamp((dot(p, cam) / m - 1) / Math.max(1e-6, r - 1), -1, 1); }

/** A market beacon from its chain node: height above the surface (the old globe's 0.04 + 0.26 x size, linear, so a bigger move is never a shorter pillar), the move against its noise, a cap flag. */
export function beacon(node, size) {
  const s = clamp(Number.isFinite(size) ? size : (node?.style?.size ?? 0), 0, 1), e = node?.end, tone = node?.style?.tone ?? 'none';
  const ratio = e && e.delta != null && e.floor > 0 ? Math.abs(e.delta) / e.floor : null;
  return { h: 0.04 + 0.26 * s, size: s, tone, live: tone !== 'quiet' && tone !== 'none', ratio, capped: ratio != null && ratio >= 3, dir: e?.dir === 'up' ? 'up' : e?.dir === 'down' ? 'down' : null, text: e?.text ?? null, missing: !e || e.delta == null };
}

/** "+1.2% · 1.4× noise", ">3× noise" when capped, "no data" when the series is missing. */
export function moveLine(b) {
  if (!b || b.missing) return 'no data';
  const r = b.ratio == null ? '' : b.capped ? ' · >3× noise' : ` · ${b.ratio.toFixed(1)}× noise`;
  return `${b.text ?? ''}${r}`.trim();
}

/** The land-dot grid: points on roughly equal-area rows (step in degrees), each [lat, lon]. isLand(lat, lon) decides which survive. */
export function landGrid(isLand, step = 1.1) {
  const out = [];
  for (let lat = -84 + step / 2; lat < 84; lat += step) {
    const n = Math.max(1, Math.round(360 * Math.cos(lat * Math.PI / 180) / step));
    for (let i = 0; i < n; i++) { const lon = -180 + (i + 0.5) * 360 / n; if (isLand(lat, lon)) out.push([lat, lon]); }
  }
  return out;
}

/** A small seeded random generator (so the city lights sit in the same place every time). */
export function seeded(seed = 1) { let s = seed >>> 0 || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

/** Which links show: every holding or broken link, plus any link that touches the selected market. Returns { show, kind, mine }. */
export function edgeShow(e, sel) {
  const kind = e?.verdict === 'broken' ? 'broken' : e?.verdict === 'holding' ? 'holding' : 'quiet', mine = !!sel && (e.from === sel || e.to === sel);
  return { show: kind !== 'quiet' || mine, kind, mine };
}
