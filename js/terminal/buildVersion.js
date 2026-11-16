// js/terminal/buildVersion.js: the small "Running build" line at the top of the Info map tab: which commit this page's server is running and when
// it was built and started (GET /api/version, js/buildInfo.js). Just the facts: no "older than main" judgement.
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** "16 Nov 13:35 UTC" or '' */
export function utcStamp(iso) {
  const d = new Date(iso); if (!iso || Number.isNaN(d.getTime())) return '';
  const p = n => String(n).padStart(2, '0');
  return `${d.getUTCDate()} ${MON[d.getUTCMonth()]} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`;
}
/** The line's HTML, or '' when the answer is not usable (a failed or refused call shows nothing, never a made-up build). */
export function versionHtml(info) {
  if (!info || info.ok !== true || typeof info.shortSha !== 'string') return '';
  const known = info.shortSha !== 'unknown';
  const bits = [known ? `<b class="mono" title="${esc(info.sha)}">${esc(info.shortSha)}</b>` : '<b>commit unknown</b>'];
  if (info.branch) bits.push(esc(info.branch));
  const built = utcStamp(info.builtAt), up = utcStamp(info.startedAt);
  if (built) bits.push(`built ${esc(built)}`);
  if (up) bits.push(`running since ${esc(up)}`);
  return `<span class="lbl">Running build</span> ${bits.join(' · ')}`;
}
/** Draw it into host. fetchJson(url) must resolve to the parsed answer; any failure leaves the host empty. */
export async function mountVersion(host, { fetchJson = u => fetch(u, { cache: 'no-store' }).then(r => r.json()) } = {}) {
  if (!host) return false;
  try { const html = versionHtml(await fetchJson('/api/version')); host.innerHTML = html; return !!html; } catch { return false; }
}
