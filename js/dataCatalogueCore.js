// js/dataCatalogueCore.js — the pure half of the 🗄 Data Map: scan the repo for where each
// feed is used, and merge the registry with live freshness into what the map shows.
//
// The registry itself (what each feed IS) lives in js/dataCatalogue.js. This file is the
// mechanism, kept separate so it is unit-testable on synthetic text without the network
// or the real registry (js/dataCatalogue.test.mjs).
//
// WHY SCAN RATHER THAN LIST. The Site Map and API Map are hand-kept HTML, and the API
// map's "consumers" column is already wrong in places because nobody re-greps it when a
// page changes. "Which pages read this feed" is a fact the repo already states -- the
// page contains the endpoint string -- so it is read from the repo, not remembered.
//
// Pure: text in, plain objects out. No fs, no fetch, no DOM.

/**
 * The last-update time written inside a stored value, or null.
 *
 * The KV stores were written by a dozen jobs over a year, so there is no one stamp field.
 * This looks where they actually put it: a top-level stamp, the same one level down in
 * `meta` / `data`, or -- for a history array -- the last row's date. It never guesses
 * from content (a date somewhere deep in a payload is a data point, not a write time),
 * so a shape it does not know reads as "not tracked" rather than as a wrong age.
 */
const STAMP_KEYS = ['updatedAt', 'generatedAt', 'generated', 'savedAt', 'fetchedAt', 'builtAt', 'ranAt', 'lastUpdated', 'lastRun', 'computedAt', 'createdAt', 'asOf', 'at', 'ts', 't', 'date'];
export function stampOf(v, depth = 0) {
  if (v == null || depth > 1) return null;
  const ok = x => {
    if (typeof x === 'number' && x > 1e12 && x < 4e12) return new Date(x).toISOString();
    if (typeof x === 'string' && /^\d{4}-\d{2}-\d{2}/.test(x) && Number.isFinite(Date.parse(x))) return x;
    return null;
  };
  if (Array.isArray(v)) {
    const last = v.at(-1);
    return last && typeof last === 'object' ? (ok(last.date) ?? ok(last.d) ?? ok(last.t) ?? ok(last.ts) ?? ok(last.at)) : null;
  }
  if (typeof v !== 'object') return null;
  for (const k of STAMP_KEYS) { const s = ok(v[k]); if (s) return s; }
  for (const k of ['meta', 'data', 'history', 'rows', 'points']) { const s = stampOf(v[k], depth + 1); if (s) return s; }
  return null;
}

/** dataHealth.js state -> the word the map shows. */
const FROM_HEALTH = { fresh: 'current', lagging: 'behind', stale: 'stale', dead: 'dead', snapshot: 'file' };
const RANK = { dead: 0, stale: 1, behind: 2, loading: 3, file: 4, current: 5, untracked: 6 };
export const NEEDS_EYES = new Set(['dead', 'stale', 'behind']);

const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * A regex that finds an endpoint in page source. `/api/rates` must not match
 * `/api/rates-history`, and `/api/cot/:ccy` should match `/api/cot/EUR` or a template
 * `/api/cot/${c}` -- so a route param becomes "one more path segment, anything".
 */
export function endpointPattern(route) {
  const r = String(route).split('?')[0];
  const parts = r.split('/').map(seg => seg.startsWith(':') ? '[^\\s\'"`?]+' : escRe(seg));
  return new RegExp(parts.join('/') + '(?![\\w-])');
}

/** The page's <title>, or null. Only the first one: later <title>s are inside SVG. */
export function pageTitle(html) {
  const m = String(html ?? '').match(/<title>([^<]{1,120})<\/title>/i);
  // "Backtest Engine — MacroFXModel": the site suffix is on every page and tells you nothing
  return m ? m[1].replace(/&amp;/g, '&').replace(/\s+/g, ' ').replace(/\s*[—–|-]\s*MacroFX(Model)?\s*$/i, '').trim() || null : null;
}

/**
 * For every endpoint, the files whose source mentions it.
 * @param {{path:string,text:string}[]} files
 * @param {string[]} endpoints
 * @returns {Record<string,string[]>} endpoint -> sorted file paths
 */
export function scanUsage(files, endpoints) {
  const out = {};
  for (const ep of new Set(endpoints ?? [])) {
    const re = endpointPattern(ep);
    out[ep] = (files ?? []).filter(f => re.test(f.text)).map(f => f.path).sort();
  }
  return out;
}

/**
 * Hosts the server fetches that no catalogue entry claims. This is the check that keeps
 * the map honest: add a new feed to server.js without describing it and it shows up as
 * a warning on the map (and fails js/dataCatalogue.test.mjs).
 */
export function uncataloguedHosts(serverText, feeds, ignore = []) {
  const claimed = new Set([...(ignore ?? []), ...(feeds ?? []).flatMap(f => f.hosts ?? [])]);
  const seen = new Set();
  for (const m of String(serverText ?? '').matchAll(/https?:\/\/([a-z0-9.-]+\.[a-z]{2,})/gi)) seen.add(m[1].toLowerCase());
  return [...seen].filter(h => ![...claimed].some(c => h === c || h.endsWith('.' + c))).sort();
}

/**
 * Worst of a feed's health rows, in the map's vocabulary.
 *
 * A dataHealth `unknown` splits in two, because it meant two different things and the
 * reader could not tell them apart: an in-memory cache that has not refilled since the
 * restart (it has a refresh interval -- it is LOADING, and will fix itself) versus a
 * source nothing records a time for (NOT TRACKED -- a gap in the tooling, not the feed).
 */
export function statusOf(rows) {
  if (!rows?.length) return null;
  const mapped = rows.map(r => {
    const status = r.state === 'unknown' ? (r.waiting ? 'loading' : 'untracked') : (FROM_HEALTH[r.state] ?? 'untracked');
    return { ...r, status };
  }).sort((a, b) => RANK[a.status] - RANK[b.status]);
  return mapped[0];
}

/**
 * Merge registry + live health + repo scan into the map's payload.
 *
 * @param {object}   o
 * @param {object[]} o.feeds        registry entries (js/dataCatalogue.js FEEDS)
 * @param {object[]} o.categories   registry categories
 * @param {object[]} [o.healthRows] rows from dataHealth.health(...).rows, each with `id`
 * @param {Record<string,string[]>} [o.usage] scanUsage output
 * @param {Record<string,string>}   [o.titles] file -> page title
 * @param {string[]} [o.uncatalogued]
 * @param {object[]} [o.series]   js/dataCatalogue.js CATALOGUE; a feed's `series` keys match a row's `readBy`
 */
export function buildCatalogue({ feeds = [], categories = [], healthRows = [], usage = {}, titles = {}, uncatalogued = [], series = [] } = {}) {
  const byId = new Map(healthRows.map(r => [r.id, r]));
  // 'cvol:CME_*' takes every row with that prefix: the CVOL legs are discovered at run time
  const rowsFor = id => id.endsWith('*') ? healthRows.filter(r => String(r.id).startsWith(id.slice(0, -1))) : [byId.get(id)].filter(Boolean);
  const out = feeds.map(f => {
    const rows = [...(f.health ?? []), ...(f.kvStamp ? [`kv:${f.kvStamp.key}`] : [])].flatMap(rowsFor);
    const h = statusOf(rows);
    let status, why, lastUpdated = null;
    if (h) {
      status = h.status;
      lastUpdated = typeof h.last === 'number' ? new Date(h.last).toISOString() : (h.last ?? null);
      why = h.status === 'loading'
        ? `Not loaded yet since the server restarted${h.bootMin != null ? ` ${h.bootMin} min ago` : ''}. This is an in-memory cache${h.refreshEveryH ? ` on a ${h.refreshEveryH}h cycle` : ''}: it fills itself shortly after boot, or the first time a page asks for it. Waiting, not broken.`
        : h.status === 'untracked' ? (f.kvStamp
          ? `Its store (KV ${f.kvStamp.key}) is empty, unreachable, or carries no write time the server recognises. That is a gap in the monitoring, not proof the feed is broken.`
          : 'The server records no last-update time for this yet. That is a gap in the monitoring, not evidence the feed is broken.')
        : (h.why ? h.why.charAt(0).toUpperCase() + h.why.slice(1) : null);
      if (rows.length > 1) why = `${why} (worst of ${rows.length} legs: ${h.label ?? h.id})`;
    } else if ((f.health ?? []).length || f.kvStamp) {
      // a check IS wired; it just found nothing to time
      status = f.kind === 'file' ? 'file' : 'untracked';
      why = f.kvStamp
        ? `Its store (KV ${f.kvStamp.key}) is empty, unreachable, or carries no write time the server recognises. Not proof the feed is broken — check the page that shows it.`
        : 'The freshness check is wired but found nothing to time yet (the store is empty or has not been written since the restart).';
    } else if (f.kind === 'file') {
      status = 'file';
      why = 'A file committed to the repo or written by an offline job. It changes when someone regenerates it, not on a schedule the server can check.';
    } else {
      status = 'untracked';
      why = 'No freshness check is wired for this feed yet. It is listed so you know it exists and what depends on it.';
    }
    const files = [...new Set((f.endpoints ?? []).flatMap(ep => usage[ep] ?? []).concat(f.files ?? []))];
    const pages = files.filter(p => /\.html$/.test(p) && !p.includes('/')).sort()
      .map(p => ({ file: p, title: titles[p] ?? null }));
    const modules = files.filter(p => !(/\.html$/.test(p) && !p.includes('/'))).sort();
    return {
      id: f.id, name: f.name, provider: f.provider, category: f.category, purpose: f.purpose,
      details: f.details ?? null, source: f.source ?? null, refresh: f.refresh ?? null, store: f.store ?? null,
      endpoints: f.endpoints ?? [], consumers: [f.consumers, modules.length ? modules.join(', ') : null].filter(Boolean).join(' · ') || null,
      pages, status, why, lastUpdated,
      series: (f.series ?? []).length
        ? series.filter(r => (r.readBy ?? []).some(k => f.series.includes(k)))
            .map(r => ({ id: r.id, label: r.label ?? null, why: r.why ?? null, trap: r.trap ?? null, tested: (r.evidence ?? []).length > 0 }))
        : [],
    };
  });
  const byStatus = out.reduce((o, f) => ({ ...o, [f.status]: (o[f.status] ?? 0) + 1 }), {});
  const attention = out.filter(f => NEEDS_EYES.has(f.status)).sort((a, b) => RANK[a.status] - RANK[b.status]);
  return {
    categories, feeds: out, uncatalogued,
    summary: {
      n: out.length, byStatus, needsEyes: attention.length,
      worst: attention[0]?.status ?? (byStatus.loading ? 'loading' : 'current'),
      text: attention.length ? `${attention.length} of ${out.length} feeds need attention` : `${out.length} feeds, none need attention`,
    },
  };
}
