// js/intlCache.js: one Intl formatter per distinct (locale, options), process-wide. Import it FIRST in server.js.
//
// WHY (2026-11-22): `new Intl.DateTimeFormat(...)`, `new Intl.NumberFormat(...)` and `date.toLocaleString(loc, {timeZone})` each build a native ICU object. Code that did this once per price bar or
// event row (tens of thousands in the first minute after boot) piled up 2-3 GB of native memory that V8 does not count, so the garbage collector never ran for it and the allocator never returned
// it. Railway billed it until restart. Four such sites were fixed by hand (marketHistory, levels, eventDayContext, yieldLegs); about 200 more build formatters inside functions. A formatter never changes
// after it is built, so sharing one per distinct arguments is safe, and this makes every site (and any written later) cost one object per distinct option set.
//
// What it does: (1) the Intl.DateTimeFormat and Intl.NumberFormat constructors return a cached instance when the arguments are plain (strings, arrays of strings, objects of primitives); anything unusual
// (an Intl.Locale object, a Date inside the options) constructs normally. (2) Date#toLocaleString/DateString/TimeString and Number#toLocaleString, when given a locale/options, format through that cache
// using the exact defaults the spec applies (ToDateTimeOptions), and fall back to the original method for anything it does not recognise. Output is identical; js/intlCache.test.mjs compares both ways.
const MAX = 600;                                              // distinct option sets kept per constructor; a runaway key space just stops caching
const O = { DTF: Intl.DateTimeFormat, NF: Intl.NumberFormat, dls: Date.prototype.toLocaleString, dld: Date.prototype.toLocaleDateString, dlt: Date.prototype.toLocaleTimeString, nls: Number.prototype.toLocaleString };
export const intlCacheStats = { hits: 0, misses: 0, bypass: 0, dtf: 0, nf: 0, installed: false };

const prim = v => v == null || ['string', 'number', 'boolean'].includes(typeof v);
const plainLocales = l => l === undefined || typeof l === 'string' || (Array.isArray(l) && l.every(x => typeof x === 'string'));
const plainOpts = o => o === undefined || (o !== null && typeof o === 'object' && Object.getPrototypeOf(o) === Object.prototype && Object.values(o).every(prim));
const keyOf = (l, o) => JSON.stringify([l ?? null, o === undefined ? null : Object.keys(o).sort().map(k => [k, o[k]])]);

function cachedCtor(Orig, bucket) {
  const cache = new Map();
  const get = (args, make) => {
    const [l, o] = args;
    if (args.length > 2 || !plainLocales(l) || !plainOpts(o)) { intlCacheStats.bypass++; return make(); }
    const k = keyOf(l, o), hit = cache.get(k);
    if (hit) { intlCacheStats.hits++; return hit; }
    const made = make(); intlCacheStats.misses++;
    if (cache.size < MAX) { cache.set(k, made); intlCacheStats[bucket] = cache.size; }
    return made;
  };
  const self = new Proxy(Orig, {
    construct: (target, args, newTarget) => get(args, () => Reflect.construct(target, args, newTarget === self ? target : newTarget)),
    apply: (target, thisArg, args) => get(args, () => Reflect.apply(target, thisArg, args)),
  });
  return self;
}

const DATE_KEYS = ['weekday', 'year', 'month', 'day'], TIME_KEYS = ['dayPeriod', 'hour', 'minute', 'second', 'fractionalSecondDigits'];
/** The options the spec hands to DateTimeFormat for toLocaleString (any/all), toLocaleDateString (date/date), toLocaleTimeString (time/time); null = let the original method handle it. */
function dtOptions(opts, required, defaults) {
  const o = { ...opts };
  if (o.dateStyle !== undefined || o.timeStyle !== undefined) { if ((required === 'date' && o.timeStyle !== undefined) || (required === 'time' && o.dateStyle !== undefined)) return null; return o; }
  let need = true;
  if ((required === 'date' || required === 'any') && DATE_KEYS.some(k => o[k] !== undefined)) need = false;
  if ((required === 'time' || required === 'any') && TIME_KEYS.some(k => o[k] !== undefined)) need = false;
  if (need) {
    if (defaults === 'date' || defaults === 'all') { o.year = 'numeric'; o.month = 'numeric'; o.day = 'numeric'; }
    if (defaults === 'time' || defaults === 'all') { o.hour = 'numeric'; o.minute = 'numeric'; o.second = 'numeric'; }
  }
  return o;
}
const viaDtf = (orig, required, defaults) => function (locales, options) {
  if (arguments.length < 2 || options === undefined || !plainLocales(locales) || !plainOpts(options) || Number.isNaN(this.getTime?.())) return orig.apply(this, arguments);
  const o = dtOptions(options, required, defaults);
  if (!o) return orig.apply(this, arguments);
  return new Intl.DateTimeFormat(locales, o).format(this);
};

export function installIntlCache() {
  if (intlCacheStats.installed) return false;
  Intl.DateTimeFormat = cachedCtor(O.DTF, 'dtf'); Intl.NumberFormat = cachedCtor(O.NF, 'nf');
  Date.prototype.toLocaleString = viaDtf(O.dls, 'any', 'all');
  Date.prototype.toLocaleDateString = viaDtf(O.dld, 'date', 'date');
  Date.prototype.toLocaleTimeString = viaDtf(O.dlt, 'time', 'time');
  Number.prototype.toLocaleString = function (locales, options) {
    if (arguments.length < 2 || options === undefined || !plainLocales(locales) || !plainOpts(options)) return O.nls.apply(this, arguments);
    return new Intl.NumberFormat(locales, options).format(Number(this));
  };
  intlCacheStats.installed = true; return true;
}
/** The untouched originals, for tests and for any caller that really wants a fresh formatter. */
export const originalIntl = O;

installIntlCache();
