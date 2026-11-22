// js/terminal/jarvisGlobeHoloCore.js: the pure maths behind the WORLD MAP hologram globe (jarvisGlobeHolo.js). No DOM, no three.js, no fetch.
//   globeFrame()   where the globe sits on screen (centre X, Y and radius Rg in px), sized to the free space between the HUD's top bar and its bottom scrub bar
//   orthoBox()     the orthographic camera box that makes the WebGL globe land on exactly that X, Y, Rg (so 2D labels, hit targets and module layers line up)
//   globeEuler()   the globe's turn for a centre (lat, lon), the same turn as jarvisCore.globeProject
//   pillarH()      pillar height (globe radii) for a node's size, smooth and linear, the same as the 2D globe
//   labelPick()    which markets carry a name: the loudest few on a phone, every live one on a desktop, always the selected one
// DESCRIPTION ONLY: this places marks; it never decides anything about markets.

const fin = v => typeof v === 'number' && Number.isFinite(v);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/**
 * The globe's place on screen. w, h = canvas size; top = the y below the HUD's top bar (and region buttons); bottom = the px kept clear at the bottom (scrub bar);
 * panel = a side panel is open (the globe moves left on a desktop); zoom = st.gl.zoom. On a phone the globe fills ~88% of the width, centred in the free band.
 */
export function globeFrame({ w = 1280, h = 720, top = 110, bottom = 80, compact = false, panel = false, zoom = 1 } = {}) {
  const W = fin(w) && w > 0 ? w : 1280, H = fin(h) && h > 0 ? h : 720, z = fin(zoom) && zoom > 0 ? zoom : 1;
  const t = clamp(fin(top) ? top : 110, 0, H * 0.6), b = clamp(fin(bottom) ? bottom : 80, 0, H * 0.4), band = Math.max(60, H - t - b);
  const R0 = compact ? Math.min(W * 0.44, band * 0.47) : Math.min(W * 0.3, band * 0.47);
  return { X: W / 2 - (panel && !compact ? W * 0.1 : 0), Y: t + band / 2, Rg: Math.max(20, R0) * z, R0: Math.max(20, R0) };
}

/** The orthographic box (left, right, top, bottom, in globe radii) for a camera on +z looking at the origin, so the origin lands at pixel (X, Y) and one radius is Rg px. */
export function orthoBox(W, H, X, Y, Rg) {
  const r = fin(Rg) && Rg > 0 ? Rg : 1;
  return { left: -X / r, right: (W - X) / r, top: Y / r, bottom: -(H - Y) / r };
}

/** The globe group's rotation (Euler order 'XYZ', radians) that turns (lat, lon) to face a camera on +z: the same turn as globeProject (rotate -lon about y, then lat about x). */
export function globeEuler(lat, lon) {
  const D = Math.PI / 180;
  return { x: (fin(lat) ? lat : 0) * D, y: -(fin(lon) ? lon : 0) * D, z: 0, order: 'XYZ' };
}

/** Apply that rotation to a vector (what three.js does with Euler 'XYZ' = Rx * Ry * Rz). Used by the test to prove the GL globe matches the 2D projection. */
export function rotateXYZ(v, e) {
  const [x, y, z] = v, cy = Math.cos(e.y), sy = Math.sin(e.y), cx = Math.cos(e.x), sx = Math.sin(e.x);
  const x1 = x * cy + z * sy, z1 = -x * sy + z * cy;            // about y
  return [x1, y * cx - z1 * sx, y * sx + z1 * cx];              // then about x
}

/** Pillar height above the surface, in globe radii, for a node size 0..1 (smooth, linear; 0.04 minimum so a quiet market still shows a stub). */
export const pillarH = size => 0.04 + 0.26 * clamp(fin(size) ? size : 0, 0, 1);

/**
 * Which markers carry a label. items = [{ key, size, live, front }] (front = facing the viewer). Phone: the `phoneN` loudest live markets; desktop: every live one, plus
 * every market when zoomed in past 1.7. The selected key always. Returned in priority order (selected first, then size), for the collision-avoiding placer.
 */
export function labelPick(items, { compact = false, zoom = 1, sel = null, phoneN = 4 } = {}) {
  const ok = (items ?? []).filter(o => o && o.front !== false && o.key != null);
  const loud = ok.filter(o => o.live).sort((a, b) => (b.size ?? 0) - (a.size ?? 0));
  const pick = compact ? loud.slice(0, phoneN) : zoom > 1.7 ? [...ok].sort((a, b) => (b.size ?? 0) - (a.size ?? 0)) : loud;
  const out = pick.map(o => o.key);
  if (sel != null && ok.some(o => o.key === sel) && !out.includes(sel)) out.unshift(sel);
  else if (sel != null && out.includes(sel)) { out.splice(out.indexOf(sel), 1); out.unshift(sel); }
  return out;
}
