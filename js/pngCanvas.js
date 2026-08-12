/**
 * PNG Canvas — a Tier-1 raster primitive. Draw lines/bands/text into an RGB
 * framebuffer and encode a real PNG, with ZERO dependencies and no browser.
 *
 * Why this exists: the platform had no way to turn a computed series into an
 * IMAGE on the server. The only rasteriser in reach was `playwright` (declared
 * in package.json but imported nowhere, and with no browser-install step in
 * `start.sh` — so there is no working headless Chromium on Railway). Adding one
 * costs ~400MB of build and extra RAM in a container already supervising three
 * Python bots. This module does the job in Node's built-in `zlib` instead:
 * ~10ms for a 1200×440 chart, testable offline in the sandbox where OANDA 403s.
 *
 * Contract (pure, no globals, no DOM):
 *   const cv = createCanvas(1200, 440, '#0b0e14');
 *   cv.polyline(pts, { color:'#5bc0f8', width:2 });   // pts = [{x,y},…] px
 *   cv.fillBetween(ptsA, ptsB, '#1e3a5f cc');         // shared, monotonic x
 *   cv.text(8, 8, 'EURUSD M15', { color:'#e6edf7', scale:2 });
 *   const buf = cv.toPNG();                           // Buffer, colour type 2
 *
 * Coordinates are floating-point pixels with the origin at the TOP-LEFT; y grows
 * downward (screen convention, matching every chart lib we use). Every draw op
 * is anti-aliased by coverage — a pixel's contribution is its overlap with the
 * shape, so a 1.5px line at a fractional y looks smooth rather than stair-stepped.
 *
 * Colours are '#rgb' / '#rrggbb' / '#rrggbbaa' strings (or a parsed {r,g,b,a}).
 * Alpha composites onto what is already in the buffer, so draw back-to-front.
 *
 * Text is a built-in 5×7 bitmap font covering ASCII 0x20–0x5A plus '·' and '×'.
 * Lowercase is folded to uppercase (there are no lowercase glyphs); unsupported
 * characters advance without drawing, so a stray glyph can never throw. Labels
 * therefore render ALL CAPS by design — deliberate for a technical chart, and
 * the reason this file needs no font file or font parser.
 *
 * Unit-tested headless in js/vumanchuChart.test.mjs (geometry, blending, and a
 * byte-level decode of the emitted PNG back to pixels).
 */
import zlib from 'node:zlib';

// ── Colour ───────────────────────────────────────────────────────────────────
// '#rgb' | '#rrggbb' | '#rrggbbaa' → { r, g, b, a } with a in 0..1.
export function parseColor(c) {
  if (c && typeof c === 'object') return c;
  let s = String(c).trim().replace(/^#/, '');
  if (s.length === 3) s = s.split('').map(ch => ch + ch).join('');
  if (s.length === 6) s += 'ff';
  if (s.length !== 8 || /[^0-9a-fA-F]/.test(s)) throw new Error(`pngCanvas: bad colour "${c}"`);
  return {
    r: parseInt(s.slice(0, 2), 16),
    g: parseInt(s.slice(2, 4), 16),
    b: parseInt(s.slice(4, 6), 16),
    a: parseInt(s.slice(6, 8), 16) / 255,
  };
}

// ── 5×7 bitmap font ──────────────────────────────────────────────────────────
// Column-major: 5 bytes per glyph, one per column, bit 0 = TOP row, bit 6 = bottom.
// Contiguous from 0x20 (space) to 0x5A ('Z') — the classic 5×7 LCD table.
export const GLYPH_W = 5, GLYPH_H = 7;
const FONT_FIRST = 0x20;
const FONT = [
  [0x00,0x00,0x00,0x00,0x00], // space
  [0x00,0x00,0x5F,0x00,0x00], // !
  [0x00,0x07,0x00,0x07,0x00], // "
  [0x14,0x7F,0x14,0x7F,0x14], // #
  [0x24,0x2A,0x7F,0x2A,0x12], // $
  [0x23,0x13,0x08,0x64,0x62], // %
  [0x36,0x49,0x55,0x22,0x50], // &
  [0x00,0x05,0x03,0x00,0x00], // '
  [0x00,0x1C,0x22,0x41,0x00], // (
  [0x00,0x41,0x22,0x1C,0x00], // )
  [0x14,0x08,0x3E,0x08,0x14], // *
  [0x08,0x08,0x3E,0x08,0x08], // +
  [0x00,0x50,0x30,0x00,0x00], // ,
  [0x08,0x08,0x08,0x08,0x08], // -
  [0x00,0x60,0x60,0x00,0x00], // .
  [0x20,0x10,0x08,0x04,0x02], // /
  [0x3E,0x51,0x49,0x45,0x3E], // 0
  [0x00,0x42,0x7F,0x40,0x00], // 1
  [0x42,0x61,0x51,0x49,0x46], // 2
  [0x21,0x41,0x45,0x4B,0x31], // 3
  [0x18,0x14,0x12,0x7F,0x10], // 4
  [0x27,0x45,0x45,0x45,0x39], // 5
  [0x3C,0x4A,0x49,0x49,0x30], // 6
  [0x01,0x71,0x09,0x05,0x03], // 7
  [0x36,0x49,0x49,0x49,0x36], // 8
  [0x06,0x49,0x49,0x29,0x1E], // 9
  [0x00,0x36,0x36,0x00,0x00], // :
  [0x00,0x56,0x36,0x00,0x00], // ;
  [0x08,0x14,0x22,0x41,0x00], // <
  [0x14,0x14,0x14,0x14,0x14], // =
  [0x00,0x41,0x22,0x14,0x08], // >
  [0x02,0x01,0x51,0x09,0x06], // ?
  [0x32,0x49,0x79,0x41,0x3E], // @
  [0x7E,0x11,0x11,0x11,0x7E], // A
  [0x7F,0x49,0x49,0x49,0x36], // B
  [0x3E,0x41,0x41,0x41,0x22], // C
  [0x7F,0x41,0x41,0x22,0x1C], // D
  [0x7F,0x49,0x49,0x49,0x41], // E
  [0x7F,0x09,0x09,0x09,0x01], // F
  [0x3E,0x41,0x49,0x49,0x7A], // G
  [0x7F,0x08,0x08,0x08,0x7F], // H
  [0x00,0x41,0x7F,0x41,0x00], // I
  [0x20,0x40,0x41,0x3F,0x01], // J
  [0x7F,0x08,0x14,0x22,0x41], // K
  [0x7F,0x40,0x40,0x40,0x40], // L
  [0x7F,0x02,0x0C,0x02,0x7F], // M
  [0x7F,0x04,0x08,0x10,0x7F], // N
  [0x3E,0x41,0x41,0x41,0x3E], // O
  [0x7F,0x09,0x09,0x09,0x06], // P
  [0x3E,0x41,0x51,0x21,0x5E], // Q
  [0x7F,0x09,0x19,0x29,0x46], // R
  [0x46,0x49,0x49,0x49,0x31], // S
  [0x01,0x01,0x7F,0x01,0x01], // T
  [0x3F,0x40,0x40,0x40,0x3F], // U
  [0x1F,0x20,0x40,0x20,0x1F], // V
  [0x7F,0x20,0x18,0x20,0x7F], // W
  [0x63,0x14,0x08,0x14,0x63], // X
  [0x03,0x04,0x78,0x04,0x03], // Y
  [0x61,0x51,0x49,0x45,0x43], // Z
];
// Non-ASCII extras we actually use in chart labels.
const FONT_EXTRA = {
  '·': [0x00,0x08,0x08,0x00,0x00],
  '×': [0x22,0x14,0x08,0x14,0x22],
};

function glyphFor(ch) {
  const ex = FONT_EXTRA[ch];
  if (ex) return ex;
  const up = ch.toUpperCase();
  const idx = up.charCodeAt(0) - FONT_FIRST;
  return idx >= 0 && idx < FONT.length ? FONT[idx] : null;
}

// Advance width in px of `str` at `scale` (integer px per font pixel).
export function measureText(str, scale = 1, letterSpacing = 1) {
  const n = String(str).length;
  if (!n) return 0;
  return n * GLYPH_W * scale + (n - 1) * letterSpacing * scale;
}

// ── PNG encoding (colour type 2 = 8-bit RGB, no interlace) ───────────────────
let _crcTable = null;
function crc32(buf) {
  if (!_crcTable) {
    _crcTable = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      _crcTable[n] = c;
    }
  }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = _crcTable[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

// Raw RGB pixel buffer (w*h*3) → PNG Buffer. Exported so any future raster
// producer can encode without going through createCanvas.
export function encodePNG(rgb, width, height) {
  if (rgb.length !== width * height * 3) throw new Error('pngCanvas: rgb length ≠ w*h*3');
  // Scanlines each prefixed with filter byte 0 (None) — deflate's LZ77 already
  // collapses the large flat regions a chart has, so a smarter filter buys little.
  const raw = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    const o = y * (1 + width * 3);
    raw[o] = 0;
    Buffer.from(rgb.buffer, rgb.byteOffset + y * width * 3, width * 3).copy(raw, o + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;     // bit depth
  ihdr[9] = 2;     // colour type 2 = truecolour RGB
  ihdr[10] = 0;    // deflate
  ihdr[11] = 0;    // adaptive filtering
  ihdr[12] = 0;    // no interlace
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Canvas ───────────────────────────────────────────────────────────────────
export function createCanvas(width, height, bg = '#000000') {
  width = Math.max(1, Math.round(width));
  height = Math.max(1, Math.round(height));
  const px = new Uint8Array(width * height * 3);

  // Composite `col` onto pixel (x,y) with coverage 0..1.
  function blend(x, y, col, cov) {
    if (!(cov > 0)) return;
    x |= 0; y |= 0;
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const a = col.a * (cov > 1 ? 1 : cov);
    if (!(a > 0)) return;
    const i = (y * width + x) * 3;
    px[i]     = px[i]     + (col.r - px[i])     * a + 0.5;
    px[i + 1] = px[i + 1] + (col.g - px[i + 1]) * a + 0.5;
    px[i + 2] = px[i + 2] + (col.b - px[i + 2]) * a + 0.5;
  }

  function clear(color) {
    const c = parseColor(color);
    for (let i = 0; i < px.length; i += 3) { px[i] = c.r; px[i + 1] = c.g; px[i + 2] = c.b; }
    return api;
  }

  // Axis-aligned filled rect with sub-pixel edge coverage.
  function rect(x, y, w, h, color) {
    const c = parseColor(color);
    const x0 = x, x1 = x + w, y0 = y, y1 = y + h;
    for (let iy = Math.floor(Math.min(y0, y1)); iy <= Math.ceil(Math.max(y0, y1)); iy++) {
      const cy = Math.min(Math.max(y0, y1), iy + 1) - Math.max(Math.min(y0, y1), iy);
      if (!(cy > 0)) continue;
      for (let ix = Math.floor(Math.min(x0, x1)); ix <= Math.ceil(Math.max(x0, x1)); ix++) {
        const cx = Math.min(Math.max(x0, x1), ix + 1) - Math.max(Math.min(x0, x1), ix);
        if (cx > 0) blend(ix, iy, c, cx * cy);
      }
    }
    return api;
  }

  // One anti-aliased thick segment: coverage = how far inside the stroke the
  // pixel centre sits (distance to the segment vs half-width).
  function segment(x0, y0, x1, y1, c, w) {
    const hw = Math.max(0.35, w / 2);
    const dx = x1 - x0, dy = y1 - y0, L2 = dx * dx + dy * dy;
    const lo = hw + 1;
    const iy0 = Math.floor(Math.min(y0, y1) - lo), iy1 = Math.ceil(Math.max(y0, y1) + lo);
    const ix0 = Math.floor(Math.min(x0, x1) - lo), ix1 = Math.ceil(Math.max(x0, x1) + lo);
    for (let iy = iy0; iy <= iy1; iy++) {
      if (iy < 0 || iy >= height) continue;
      for (let ix = ix0; ix <= ix1; ix++) {
        if (ix < 0 || ix >= width) continue;
        const cx = ix + 0.5, cy = iy + 0.5;
        let t = L2 > 0 ? ((cx - x0) * dx + (cy - y0) * dy) / L2 : 0;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const ex = cx - (x0 + t * dx), ey = cy - (y0 + t * dy);
        blend(ix, iy, c, hw + 0.5 - Math.hypot(ex, ey));
      }
    }
  }

  // `dash` = [onPx, offPx]; omitted → solid.
  function line(x0, y0, x1, y1, { color = '#ffffff', width: w = 1, dash = null } = {}) {
    const c = parseColor(color);
    if (!dash || !dash[0]) { segment(x0, y0, x1, y1, c, w); return api; }
    const [on, off] = dash;
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (!(len > 0)) return api;
    const ux = (x1 - x0) / len, uy = (y1 - y0) / len;
    for (let s = 0; s < len; s += on + off) {
      const e = Math.min(s + on, len);
      segment(x0 + ux * s, y0 + uy * s, x0 + ux * e, y0 + uy * e, c, w);
    }
    return api;
  }

  function polyline(pts, opts = {}) {
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      if (a == null || b == null) continue;                 // gaps for NaN-hole series
      line(a.x, a.y, b.x, b.y, opts);
    }
    return api;
  }

  // Vertical fill between two series that share the same monotonically
  // increasing x's (ptsA[i].x === ptsB[i].x). Walked column-by-column so it
  // stays gap-free even when bars are packed closer than 1px apart.
  function fillBetween(ptsA, ptsB, color) {
    const c = parseColor(color);
    const n = Math.min(ptsA.length, ptsB.length);
    if (n < 2) return api;
    const xStart = Math.floor(ptsA[0].x), xEnd = Math.ceil(ptsA[n - 1].x);
    let seg = 0;
    for (let ix = xStart; ix <= xEnd; ix++) {
      if (ix < 0 || ix >= width) continue;
      const cx = ix + 0.5;
      while (seg < n - 2 && ptsA[seg + 1].x < cx) seg++;
      const a0 = ptsA[seg], a1 = ptsA[seg + 1], b0 = ptsB[seg], b1 = ptsB[seg + 1];
      if (!a0 || !a1 || !b0 || !b1) continue;
      const span = a1.x - a0.x;
      let t = span > 0 ? (cx - a0.x) / span : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ya = a0.y + (a1.y - a0.y) * t, yb = b0.y + (b1.y - b0.y) * t;
      const top = Math.min(ya, yb), bot = Math.max(ya, yb);
      for (let iy = Math.floor(top); iy <= Math.ceil(bot); iy++) {
        const cov = Math.min(bot, iy + 1) - Math.max(top, iy);
        if (cov > 0) blend(ix, iy, c, cov);
      }
    }
    return api;
  }

  function disc(cx, cy, r, color) {
    const c = parseColor(color);
    for (let iy = Math.floor(cy - r - 1); iy <= Math.ceil(cy + r + 1); iy++) {
      for (let ix = Math.floor(cx - r - 1); ix <= Math.ceil(cx + r + 1); ix++) {
        blend(ix, iy, c, r + 0.5 - Math.hypot(ix + 0.5 - cx, iy + 0.5 - cy));
      }
    }
    return api;
  }

  // Top-left anchored bitmap text. Returns the canvas (use measureText for width).
  function text(x, y, str, { color = '#ffffff', scale = 1, letterSpacing = 1 } = {}) {
    const c = parseColor(color);
    const s = Math.max(1, Math.round(scale));
    let cx = Math.round(x);
    for (const ch of String(str)) {
      const g = glyphFor(ch);
      if (g) {
        for (let col = 0; col < GLYPH_W; col++) {
          for (let row = 0; row < GLYPH_H; row++) {
            if (!(g[col] & (1 << row))) continue;
            const px0 = cx + col * s, py0 = Math.round(y) + row * s;
            for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) blend(px0 + dx, py0 + dy, c, 1);
          }
        }
      }
      cx += (GLYPH_W + letterSpacing) * s;
    }
    return api;
  }

  const api = {
    width, height, pixels: px,
    clear, rect, line, polyline, fillBetween, disc, text,
    // Read a pixel back as [r,g,b] — for unit tests and diffing.
    pixelAt(x, y) { const i = ((y | 0) * width + (x | 0)) * 3; return [px[i], px[i + 1], px[i + 2]]; },
    toPNG() { return encodePNG(px, width, height); },
  };
  return clear(bg);
}
