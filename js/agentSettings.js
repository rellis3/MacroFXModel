/**
 * Agent switches (owner request 2026-11-08): on/off settings for agent features that used to need a Railway environment variable
 * (LIBRARY_CONTEXT=1). They are set on Bot Config > Agents and stored in KV `agent_settings_v1` = { v:1, toggles:{ id:boolean }, at }.
 *
 * Precedence for one switch:  saved setting  >  environment variable (if the switch names one and it is set)  >  default.
 * So a deploy with LIBRARY_CONTEXT=1 and nothing saved behaves as before, and the first time the owner presses the switch the
 * setting wins from then on (a saved "off" beats an env "on", which is the point: no redeploy to turn it off).
 *
 * Pure apart from the injected `kv` (get/put) and clock. No model call, no network.
 *
 *   TOGGLES, KV_KEY, TTL_MS
 *   parseSettings(raw)                 -> { toggles }   (unknown ids and non-booleans dropped; never throws)
 *   envValue(def, env)                 -> true | false | null   (null = the variable is not set)
 *   resolveToggle(id, stored, env)     -> { value, source: 'setting' | 'env' | 'default' }
 *   validateToggleBody(body)           -> { ok, id, value } | { ok:false, error }
 *   createToggleStore({ kv, env, now, ttlMs })
 *       .read(id)    -> Promise<boolean>              (30 s cache; a failed read keeps the last good settings)
 *       .resolve(id) -> Promise<{ value, source }>
 *       .all()       -> Promise<{ [id]: { value, source } }>
 *       .set(id, v)  -> Promise<{ id, value, source, at }>   (read-modify-write, then the cache is replaced at once)
 *       .peek(id)    -> boolean   (whatever is cached now, no I/O; for sync callers)
 *       .invalidate()
 */
export const KV_KEY = 'agent_settings_v1';
export const TTL_MS = 30_000;

/**
 * id, label, text (plain words for the card), default, env (the old environment variable, or null), spends (does turning it on
 * cause paid model calls?), agent (the agent id whose card shows it; js/agentRegistry.js checks it exists).
 */
export const TOGGLES = {
  libraryContext: {
    label: 'Give the researchers the paper library',
    text: 'Adds a LIBRARY section (the best matching held papers, with their notes) to each researcher\'s prompt and to the Head of Research\'s review, and lets them cite those papers. Off: the prompts are exactly what they were before the library existed.',
    default: false, env: 'LIBRARY_CONTEXT', spends: true, agent: 'library-librarian',
  },
  libraryLibrarian: {
    label: 'Let the librarian pick the papers',
    text: 'When the library is given to the researchers, one small DeepSeek call picks the papers from a scanned list (at most 2 calls a round, 400 ever). Off: the free rule-based top 6 is used instead. Does nothing while the library switch above is off.',
    default: true, env: null, spends: true, agent: 'library-librarian',
  },
};
export const TOGGLE_IDS = Object.keys(TOGGLES);

const TRUE = /^(1|true|on|yes)$/i, FALSE = /^(0|false|off|no)$/i;

/** The environment variable's value for a switch: true / false, or null when it is not set (or not a recognisable value). */
export function envValue(def, env = (typeof process !== 'undefined' ? process.env : {})) {
  if (!def?.env) return null;
  const raw = String(env?.[def.env] ?? '').trim();
  if (!raw) return null;
  if (TRUE.test(raw)) return true;
  if (FALSE.test(raw)) return false;
  return false;   // a value that is set but not a "yes" has always meant off for LIBRARY_CONTEXT
}

/** The stored document -> { toggles }: only registered ids with boolean values survive. */
export function parseSettings(raw) {
  let d = raw;
  if (typeof raw === 'string') { try { d = JSON.parse(raw); } catch { d = null; } }
  const toggles = {};
  if (d && d.v === 1 && d.toggles && typeof d.toggles === 'object') {
    for (const id of TOGGLE_IDS) if (typeof d.toggles[id] === 'boolean') toggles[id] = d.toggles[id];
  }
  return { toggles, at: d && typeof d.at === 'string' ? d.at : null };
}

/** One switch: { value, source }. `stored` is parseSettings().toggles (or any { id: boolean } object). */
export function resolveToggle(id, stored = {}, env = (typeof process !== 'undefined' ? process.env : {})) {
  const def = TOGGLES[id];
  if (!def) throw new Error(`not an agent switch: ${id}`);
  if (typeof stored?.[id] === 'boolean') return { value: stored[id], source: 'setting' };
  const e = envValue(def, env);
  if (e !== null) return { value: e, source: 'env' };
  return { value: def.default, source: 'default' };
}

/** POST body check: { id, value } with a registered id and a real boolean (strings are refused, so "false" cannot become true). */
export function validateToggleBody(body) {
  const id = body?.id, value = body?.value;
  if (typeof id !== 'string' || !Object.prototype.hasOwnProperty.call(TOGGLES, id)) return { ok: false, error: `not an agent switch: ${String(id).slice(0, 60)}` };
  if (typeof value !== 'boolean') return { ok: false, error: 'value must be true or false' };
  return { ok: true, id, value };
}

export function createToggleStore({ kv, env = (typeof process !== 'undefined' ? process.env : {}), now = () => Date.now(), ttlMs = TTL_MS } = {}) {
  let cache = { at: -Infinity, toggles: {}, docAt: null };
  let inflight = null;
  const refresh = async () => {
    if (inflight) return inflight;
    inflight = (async () => {
      try {
        const raw = await (kv.getStrict ? kv.getStrict(KV_KEY) : kv.get(KV_KEY));
        const p = parseSettings(raw);
        cache = { at: now(), toggles: p.toggles, docAt: p.at };
      } catch {
        // a failed read keeps the last good settings (or env/default if there never were any) and is retried after the TTL
        cache = { ...cache, at: now() };
      } finally { inflight = null; }
      return cache;
    })();
    return inflight;
  };
  const fresh = async () => (now() - cache.at >= ttlMs ? refresh() : cache);
  const api = {
    async resolve(id) { const c = await fresh(); return resolveToggle(id, c.toggles, env); },
    async read(id) { return (await api.resolve(id)).value; },
    async all() { const c = await fresh(); return Object.fromEntries(TOGGLE_IDS.map(id => [id, resolveToggle(id, c.toggles, env)])); },
    peek(id) { return resolveToggle(id, cache.toggles, env).value; },
    invalidate() { cache = { ...cache, at: -Infinity }; },
    async set(id, value) {
      const v = validateToggleBody({ id, value });
      if (!v.ok) throw Object.assign(new Error(v.error), { status: 400 });
      // read the stored document fresh (strict: a failed read must not write over the other switches), change one id, write
      const raw = await (kv.getStrict ? kv.getStrict(KV_KEY) : kv.get(KV_KEY));
      const cur = parseSettings(raw).toggles;
      const at = new Date(now()).toISOString();
      const next = { ...cur, [id]: value };
      await kv.put(KV_KEY, JSON.stringify({ v: 1, toggles: next, at }));
      cache = { at: now(), toggles: next, docAt: at };
      return { id, value, source: 'setting', at };
    },
  };
  return api;
}
