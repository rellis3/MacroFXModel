// js/terminal/ciStatus.js: the "main CI" line at the top of the Info map tab (owner only): is main's Tests workflow green, when it last finished, and
// which test is failing and why, read from GET /api/ci-status (js/ciStatusCore.js, public GitHub Actions API, cached 10 minutes on the server).
// A desk login gets a 403 from the route and sees nothing here.
import { ciLine } from '../ciStatusCore.js';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The line's HTML, or '' when there is no usable answer (a refused or failed call shows nothing, never a made-up state). */
export function ciHtml(s) {
  const text = ciLine(s);
  if (!text) return '';
  const cls = s.state === 'green' ? 'up' : s.state === 'running' ? '' : s.state === 'red-owner-gate' ? 'gold' : 'dn';
  const dots = Array.isArray(s.last10) ? `<span class="mono" title="the last ${s.last10.length} finished runs, newest first" style="margin-left:6px;letter-spacing:1px">${s.last10.map(ok => (ok ? '●' : '○')).join('')}</span>` : '';
  return `<span class="lbl">CI</span> <span class="${cls}">${esc(text)}</span>${dots}`;
}

/** Draw it into host. fetchJson(url) must resolve to the parsed answer; any failure leaves the host empty. */
export async function mountCiStatus(host, { fetchJson = u => fetch(u, { cache: 'no-store' }).then(r => r.json()) } = {}) {
  if (!host) return false;
  try { const html = ciHtml(await fetchJson('/api/ci-status')); host.innerHTML = html; return !!html; } catch { return false; }
}
