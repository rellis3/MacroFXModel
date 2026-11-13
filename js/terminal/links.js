// js/terminal/links.js: the ONE way a Desk Terminal card links to a page outside the desk zone.
//
// Owner decision (2026-11-13): the desk login (a viewer) must not see links back to the main site (bank-credit.html, the sentiment pages,
// Research, Desk Office...): they would bounce to the owner's login. The owner sees them as normal. Role comes from access.js
// (globalThis.deskAccessState, set before the first render); if it is not set yet the caller is treated as a viewer (fail closed).
//
//   ownerLink(href, label, { cls, id, style, target, attrs, suffix, hide })
//       owner  -> <a href=... data-owner-link>label+suffix</a>
//       viewer -> <span class="nolink">label</span> (no arrow, no underline), or '' when hide:true
//       `label` is HTML the caller has already escaped.
//   ownerOnly(html)  -> html for the owner, '' for a viewer (a whole sentence that only makes sense with the link)
//
// A link to a page in js/terminal/*.js or desk-terminal.html that does not go through one of these fails js/terminal/links.test.mjs.
// access.js also turns any other string-built anchor to a non-desk page into plain text for a viewer, as a safety net.

export const isOwner = () => globalThis.deskAccessState?.role === 'owner';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** True when href stays inside the desk page or is an external source: those never need the owner. */
export function isDeskLocal(href) {
  const h = String(href ?? '').trim();
  return /^(#|https?:|mailto:|\/api\/|desk-terminal(\.html)?(#|\?|$)|\/desk-terminal)/i.test(h);
}

export function ownerLink(href, label, o = {}) {
  if (isDeskLocal(href) || isOwner()) {
    const target = o.target ? ` target="${esc(o.target)}"${o.target === '_blank' ? ' rel="noopener"' : ''}` : '';
    return `<a${o.id ? ` id="${esc(o.id)}"` : ''}${o.cls ? ` class="${esc(o.cls)}"` : ''}${o.style ? ` style="${esc(o.style)}"` : ''} href="${esc(href)}"${target}${isDeskLocal(href) ? '' : ' data-owner-link'}${o.attrs ? ' ' + o.attrs : ''}>${label}${o.suffix ?? ''}</a>`;
  }
  if (o.hide) return '';
  return `<span${o.id ? ` id="${esc(o.id)}"` : ''} class="nolink${o.cls ? ' ' + esc(o.cls) : ''}"${o.style ? ` style="${esc(o.style)}"` : ''}>${label}</span>`;
}

export const ownerOnly = html => (isOwner() ? html : '');

// classic scripts (desk-terminal.html's inline script) reach the helpers through globalThis
globalThis.ownerLink = ownerLink;
globalThis.ownerOnly = ownerOnly;
