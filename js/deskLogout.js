// js/deskLogout.js: what /logout clears and where it sends you. Pure: no fetch, no env, no req/res. Tested by js/deskLogout.test.mjs.
//
// Zones (server.js AUTH_COOKIE_NAME = 'mfx_session', one cookie per zone: mfx_session_main, _desk, _education):
//   desk     the desk viewer's own sign-out: clears the desk cookie only, back to the desk login.
//   all      the OWNER's sign-out from the Desk Terminal: clears main + desk + education so the next visit shows a login (the owner can then try
//            the desk password). Back to the desk login when it is enabled, otherwise the main login with the terminal as the next page.
//   library  both logins that open the library (education + main), back to the library sign-in (unchanged).
//   education / main (default)  clears that zone only (unchanged).
// No open redirect: the destination is built here from fixed paths; `next` is only honoured for the library's own return link.

export const COOKIE_PREFIX = 'mfx_session';
export const ZONES = ['main', 'desk', 'education'];
export const DESK_LOGIN = '/login?zone=desk&next=%2Fdesk-terminal.html';
export const MAIN_LOGIN_FOR_TERMINAL = '/login?next=%2Fdesk-terminal.html';
const LIBRARY_BACK = /^\/library(\.html)?$/;

export function logoutPlan({ zone, next, deskEnabled } = {}) {
  const z = String(zone ?? '');
  if (z === 'library') return { clear: ['education', 'main'], redirect: '/library.html' };
  if (z === 'all') return { clear: [...ZONES], redirect: deskEnabled ? DESK_LOGIN : MAIN_LOGIN_FOR_TERMINAL };
  if (z === 'desk') return { clear: ['desk'], redirect: DESK_LOGIN };
  const zone2 = z === 'education' ? 'education' : 'main';
  const back = typeof next === 'string' && LIBRARY_BACK.test(next) ? next : null;
  return { clear: [zone2], redirect: back ?? (zone2 === 'education' ? '/theory-lab/' : '/') };
}

/** The Set-Cookie value that clears a zone cookie: the same Path/HttpOnly/SameSite (and Secure) it was set with, expired. */
export function clearCookieHeader(zone, secure) {
  return `${COOKIE_PREFIX}_${zone}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
}

/** Sign-out is a state change: refuse a request a browser says is cross-site, or whose Origin is another host. Missing headers (curl, old clients) pass. */
export function sameSiteOk({ secFetchSite, origin, host } = {}) {
  if (secFetchSite && secFetchSite !== 'same-origin' && secFetchSite !== 'same-site' && secFetchSite !== 'none') return false;
  if (origin && origin !== 'null' && host) { try { if (new URL(origin).host !== host) return false; } catch { return false; } }
  return true;
}
