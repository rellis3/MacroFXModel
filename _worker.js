// ============================================================
// _worker.js  -  Cloudflare Pages Worker
// Regime + Confluence Dashboard API proxy
// All routes return JSON. NEVER returns HTML.
// ============================================================

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

function err(msg, status = 500) {
  return json({ error: msg }, status);
}

// KV key whitelist -- only these prefixes/exact keys may be read or written
// via /api/kv/get and /api/kv/set. The 'caps' key is excluded here because
// it has its own dedicated /api/config/caps route with stricter validation.
function isAllowedKVKey(key) {
  const EXACT = new Set(['fred', 'oi_store', 'journal_store', 'cot_data', 'surprise_index', 'events_today']);
  const PREFIXES = ['ohlc_', 'ohlc5m_', 'ohlc30m_', 'quote_', 'ai_', 'compass_', 'fredhistory_', 'events_'];
  if (EXACT.has(key)) return true;
  return PREFIXES.some(p => key.startsWith(p));
}

// ── Equity symbols sourced from OANDA (not TwelveData) ───────────────────────
// TwelveData free/grow plan doesn't include equity indices. These symbols are
// fetched entirely from OANDA (daily D candles for ohlc; M1 for quote).
const OANDA_EQUITY_SYMBOLS = new Set(['NAS100_USD']);

// ── CFTC COT parsers ─────────────────────────────────────────────────────────
// parseCFTCFile    → TFF (Financial Futures) — FX pairs + NQ equity index
// parseCFTCDisaggFile → Disaggregated — physical commodities incl. Gold
function parseCFTCFile(text) {
  // Strip HTML tags (the .htm files embed plain text in HTML scaffolding)
  const plain = text.replace(/<[^>]+>/g, '').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>');
  const lines = plain.split(/\r?\n/);

  // TFF column order (14 cols): DealerL, DealerS, DealerSp, AML, AMS, AMSp, LevL, LevS, LevSp, OthL, OthS, OthSp, NRL, NRS
  // flip=true: futures quote the foreign currency, so net sign is inverted for the USD-base dashboard pair
  const FX_MAP = [
    { name: 'EURO FX',            pair: 'EUR/USD',    flip: false },
    { name: 'BRITISH POUND',      pair: 'GBP/USD',    flip: false },
    { name: 'JAPANESE YEN',       pair: 'USD/JPY',    flip: true  },
    { name: 'AUSTRALIAN DOLLAR',  pair: 'AUD/USD',    flip: false },
    { name: 'NEW ZEALAND DOLLAR', pair: 'NZD/USD',    flip: false },
    { name: 'SWISS FRANC',        pair: 'USD/CHF',    flip: true  },
    { name: 'CANADIAN DOLLAR',    pair: 'USD/CAD',    flip: true  },
    { name: 'NASDAQ MINI',        pair: 'NAS100_USD', flip: false },
  ];

  const parseNums = line =>
    line.replace(/,/g, '').trim().split(/\s+/).map(Number).filter(n => !isNaN(n) && isFinite(n));

  const result = {};

  for (let i = 0; i < lines.length; i++) {
    const match = FX_MAP.find(m => lines[i].includes(m.name));
    if (!match) continue;

    let openInterest = null;
    for (let j = i; j < Math.min(i + 6, lines.length); j++) {
      const m = lines[j].match(/Open Interest is\s+([\d,]+)/i);
      if (m) { openInterest = parseInt(m[1].replace(/,/g, '')); break; }
    }

    let positions = null, changes = null, traders = null, changeDate = null;

    for (let j = i + 1; j < Math.min(i + 35, lines.length); j++) {
      const l = lines[j].trim();
      if (!l) continue;

      const tryNums = (start) => {
        for (let k = start + 1; k < start + 4; k++) {
          const nums = parseNums(lines[k] || '');
          if (nums.length >= 12) return nums;
        }
        return null;
      };

      if (l === 'Positions') {
        positions = tryNums(j);
      } else if (l.startsWith('Changes from:')) {
        const dm = l.match(/Changes from:\s+(.+?)(?:\s{3,}|$)/);
        if (dm) changeDate = dm[1].trim();
        changes = tryNums(j);
      } else if (l.startsWith('Number of Traders')) {
        traders = tryNums(j);
        break;
      }
    }

    if (!positions || positions.length < 14) continue;

    const p = positions;
    const c = changes || new Array(14).fill(0);
    const t = traders || [];

    let [dealerL, dealerS] = [p[0], p[1]];
    let [amL,     amS    ] = [p[3], p[4]];
    let [levL,    levS   ] = [p[6], p[7]];

    let dealerNetChg = (c[0]||0) - (c[1]||0);
    let amNetChg     = (c[3]||0) - (c[4]||0);
    let levNetChg    = (c[6]||0) - (c[7]||0);

    let numLevL = t[6] || 0, numLevS = t[7] || 0;

    if (match.flip) {
      [dealerL, dealerS] = [dealerS, dealerL];
      [amL,     amS    ] = [amS,     amL    ];
      [levL,    levS   ] = [levS,    levL   ];
      dealerNetChg *= -1; amNetChg *= -1; levNetChg *= -1;
      [numLevL, numLevS] = [numLevS, numLevL];
    }

    const levNet    = levL - levS;
    const amNet     = amL  - amS;
    const dealerNet = dealerL - dealerS;
    const levPct    = openInterest ? Math.round(levNet / openInterest * 1000) / 10 : null;
    const grossRatio    = levS > 0 ? Math.round(levL / levS * 100) / 100 : null;
    const avgLevContracts = numLevL > 0 ? Math.round(levL / numLevL) : null;
    const crowdingPct   = openInterest ? Math.round(Math.abs(levNet) / openInterest * 100) : null;

    result[match.pair] = {
      openInterest, changeDate,
      levLong: levL, levShort: levS, levNet, levNetChg, levPct,
      numLevLong: numLevL, numLevShort: numLevS, avgLevContracts,
      amLong: amL,     amShort: amS,     amNet,     amNetChg,
      dealerLong: dealerL, dealerShort: dealerS, dealerNet, dealerNetChg,
      grossRatio, crowdingPct,
    };
  }

  return result;
}

// Parses the CFTC Disaggregated Futures report (physical commodities — Gold, Silver, Oil…).
// Column order: ProducerL, ProducerS, ProducerSp, SwapL, SwapS, SwapSp, MML, MMS, MMSp, OthL, OthS, OthSp, NRL, NRS
// Output uses the same field names as parseCFTCFile so renderCOTCard works unchanged.
// _report:'disagg' tag lets the UI swap category labels (Managed Money / Swap / Producer).
function parseCFTCDisaggFile(text) {
  const plain = text.replace(/<[^>]+>/g, '').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>');
  const lines = plain.split(/\r?\n/);

  const DISAGG_MAP = [
    { name: 'GOLD', pair: 'XAU/USD', flip: false },
  ];

  const parseNums = line =>
    line.replace(/,/g, '').trim().split(/\s+/).map(Number).filter(n => !isNaN(n) && isFinite(n));

  const result = {};

  for (let i = 0; i < lines.length; i++) {
    const match = DISAGG_MAP.find(m => lines[i].includes(m.name));
    if (!match) continue;

    let openInterest = null;
    for (let j = i; j < Math.min(i + 6, lines.length); j++) {
      const m = lines[j].match(/Open Interest is\s+([\d,]+)/i);
      if (m) { openInterest = parseInt(m[1].replace(/,/g, '')); break; }
    }

    let positions = null, changes = null, traders = null, changeDate = null;

    for (let j = i + 1; j < Math.min(i + 35, lines.length); j++) {
      const l = lines[j].trim();
      if (!l) continue;

      const tryNums = (start) => {
        for (let k = start + 1; k < start + 4; k++) {
          const nums = parseNums(lines[k] || '');
          if (nums.length >= 12) return nums;
        }
        return null;
      };

      if (l === 'Positions') {
        positions = tryNums(j);
      } else if (l.startsWith('Changes from:')) {
        const dm = l.match(/Changes from:\s+(.+?)(?:\s{3,}|$)/);
        if (dm) changeDate = dm[1].trim();
        changes = tryNums(j);
      } else if (l.startsWith('Number of Traders')) {
        traders = tryNums(j);
        break;
      }
    }

    if (!positions || positions.length < 12) continue;

    const p = positions;
    const c = changes || new Array(14).fill(0);
    const t = traders || [];

    // Disaggregated cols: Producer[0,1], Swap[3,4], ManagedMoney[6,7], Other[9,10]
    const producerL = p[0], producerS = p[1];
    const swapL = p[3], swapS = p[4];
    const mmL = p[6], mmS = p[7];

    const mmNetChg      = (c[6]||0) - (c[7]||0);
    const swapNetChg    = (c[3]||0) - (c[4]||0);
    const producerNetChg = (c[0]||0) - (c[1]||0);
    const numMML = t[6] || 0, numMMS = t[7] || 0;

    const levNet    = mmL - mmS;
    const amNet     = swapL - swapS;
    const dealerNet = producerL - producerS;
    const levPct    = openInterest ? Math.round(levNet / openInterest * 1000) / 10 : null;
    const grossRatio = mmS > 0 ? Math.round(mmL / mmS * 100) / 100 : null;
    const avgLevContracts = numMML > 0 ? Math.round(mmL / numMML) : null;
    const crowdingPct = openInterest ? Math.round(Math.abs(levNet) / openInterest * 100) : null;

    result[match.pair] = {
      openInterest, changeDate,
      levLong: mmL, levShort: mmS, levNet, levNetChg: mmNetChg, levPct,
      numLevLong: numMML, numLevShort: numMMS, avgLevContracts,
      amLong: swapL,     amShort: swapS,     amNet,     amNetChg: swapNetChg,
      dealerLong: producerL, dealerShort: producerS, dealerNet, dealerNetChg: producerNetChg,
      grossRatio, crowdingPct,
      _report: 'disagg',
    };
  }

  return result;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // OPTIONS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    try {
      // -- /api/config -----------------------------------------
      if (path === '/api/config') {
        return json({
          hasFred:     !!env.FRED_KEY,
          hasTwelve:   !!env.TWELVE_KEY,
          hasAnt:      !!env.ANT_KEY,
          hasKV:       !!env.FX_SCORES,
          hasFinnhub:  !!env.FINNHUB_KEY,
        });
      }

      // -- /api/quote ------------------------------------------
      // Returns { price: number }
      if (path === '/api/quote') {
        if (!env.TWELVE_KEY) return err('TWELVE_KEY not configured', 503);

        const symbol = url.searchParams.get('symbol');
        if (!symbol) return err('symbol param required', 400);

        // Equity symbols (NAS100_USD etc.) — use OANDA M1 for latest price
        if (OANDA_EQUITY_SYMBOLS.has(symbol)) {
          if (!env.OANDA_KEY) return err('OANDA_KEY not configured', 503);
          const oandaBase = env.OANDA_ENV === 'practice'
            ? 'https://api-fxpractice.oanda.com'
            : 'https://api-fxtrade.oanda.com';
          const oRes = await fetch(
            `${oandaBase}/v3/instruments/${encodeURIComponent(symbol)}/candles?granularity=M1&count=2&price=M`,
            { headers: { 'Authorization': `Bearer ${env.OANDA_KEY}` } }
          );
          if (!oRes.ok) return err(`OANDA quote failed (${oRes.status})`, 502);
          const oData = await oRes.json();
          const last = oData.candles?.slice(-1)[0];
          if (!last?.mid?.c) return err('No OANDA candle data for quote', 502);
          return json({ price: parseFloat(last.mid.c) });
        }

        const tdUrl = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(symbol)}&apikey=${env.TWELVE_KEY}`;
        const res = await fetch(tdUrl);
        const data = await res.json();

        if (data.status === 'error' || !data.close) {
          // Twelve Data returns { status: 'error', message: '...' } on bad symbol/key
          return err(data.message || 'Quote fetch failed', 502);
        }

        return json({ price: parseFloat(data.close) });
      }

      // -- /api/ohlc --------------------------------------------
      // Daily bars  -  100 days for pivots, ATR, momentum
      if (path === '/api/ohlc') {
        if (!env.TWELVE_KEY) return err('TWELVE_KEY not configured', 503);

        const symbol = url.searchParams.get('symbol');
        if (!symbol) return err('symbol param required', 400);

        // Equity symbols — use OANDA daily candles instead of TwelveData
        if (OANDA_EQUITY_SYMBOLS.has(symbol)) {
          if (!env.OANDA_KEY) return err('OANDA_KEY not configured', 503);
          const oandaBase = env.OANDA_ENV === 'practice'
            ? 'https://api-fxpractice.oanda.com'
            : 'https://api-fxtrade.oanda.com';
          const oRes = await fetch(
            `${oandaBase}/v3/instruments/${encodeURIComponent(symbol)}/candles?granularity=D&count=120&price=M`,
            { headers: { 'Authorization': `Bearer ${env.OANDA_KEY}` } }
          );
          if (!oRes.ok) return err(`OANDA daily candles failed (${oRes.status})`, 502);
          const oData = await oRes.json();
          if (!oData.candles?.length) return err('No OANDA daily candle data', 502);
          // Convert to TwelveData-compatible format, newest first
          const values = oData.candles
            .filter(c => c.complete && c.mid)
            .map(c => ({
              datetime: c.time.substring(0, 10),  // "2024-01-15T..." → "2024-01-15"
              open:  c.mid.o,
              high:  c.mid.h,
              low:   c.mid.l,
              close: c.mid.c,
            }))
            .reverse();
          return json({ values, meta: { symbol, source: 'oanda', interval: '1day' } });
        }

        const tdUrl = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=1day&outputsize=100&timezone=Europe/London&apikey=${env.TWELVE_KEY}`;
        const res = await fetch(tdUrl);
        const data = await res.json();

        if (data.status === 'error') return err(data.message || 'OHLC fetch failed', 502);
        return json(data);
      }

      // -- /api/ohlc5m -----------------------------------------
      // 5-min bars  -  Asia session range detection
      if (path === '/api/ohlc5m') {
        if (!env.TWELVE_KEY) return err('TWELVE_KEY not configured', 503);

        const symbol = url.searchParams.get('symbol');
        if (!symbol) return err('symbol param required', 400);

        const tdUrl = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=5min&outputsize=1500&timezone=Europe/London&apikey=${env.TWELVE_KEY}`;
        const res = await fetch(tdUrl);
        const data = await res.json();

        if (data.status === 'error') return err(data.message || 'OHLC 5m fetch failed', 502);
        return json(data);
      }

      // -- /api/ohlc30m ----------------------------------------
      // 30-min bars  -  Monday range detection
      if (path === '/api/ohlc30m') {
        if (!env.TWELVE_KEY) return err('TWELVE_KEY not configured', 503);

        const symbol = url.searchParams.get('symbol');
        if (!symbol) return err('symbol param required', 400);

        const tdUrl = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=30min&outputsize=700&timezone=Europe/London&apikey=${env.TWELVE_KEY}`;
        const res = await fetch(tdUrl);
        const data = await res.json();

        if (data.status === 'error') return err(data.message || 'OHLC 30m fetch failed', 502);
        return json(data);
      }

      // -- /api/oanda_ohlc5m  &  /api/oanda_ohlc30m -----------
      // Oanda mid-price bars for Asia session + Monday range detection.
      // Replaces TwelveData 5m/30m — more accurate FX prices from a primary market maker.
      // Env vars: OANDA_KEY (required), OANDA_ENV ('practice' | 'live', default 'live')
      if (path === '/api/oanda_ohlc5m' || path === '/api/oanda_ohlc30m') {
        if (!env.OANDA_KEY) return err('OANDA_KEY not configured — add it in Cloudflare Pages → Settings → Environment Variables', 503);

        const symbol = url.searchParams.get('symbol');
        if (!symbol) return err('symbol param required', 400);

        const instrument  = symbol.replace('/', '_');  // EUR/USD → EUR_USD
        const granularity = path === '/api/oanda_ohlc5m' ? 'M5' : 'M30';
        const count       = path === '/api/oanda_ohlc5m' ? 1500 : 700;
        const oandaBase   = env.OANDA_ENV === 'practice'
          ? 'https://api-fxpractice.oanda.com'
          : 'https://api-fxtrade.oanda.com';

        const oandaUrl = `${oandaBase}/v3/instruments/${encodeURIComponent(instrument)}/candles?granularity=${granularity}&count=${count}&price=M`;
        const res = await fetch(oandaUrl, {
          headers: { 'Authorization': `Bearer ${env.OANDA_KEY}` },
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => 'Oanda error');
          return err(`Oanda ${granularity} fetch failed (${res.status}): ${errText.slice(0, 300)}`, 502);
        }

        const data = await res.json();
        if (!data.candles) return err('Oanda returned no candles', 502);

        // Normalize to TwelveData-compatible format: { values: [{ datetime, open, high, low, close }] }
        // Convert UTC timestamps → London local time so barLondonHour() works correctly during BST.
        // Filter to complete candles only (excludes the still-open current bar).
        // Reverse so newest bar is first (TwelveData convention).
        const values = data.candles
          .filter(c => c.complete && c.mid)
          .map(c => ({
            datetime: new Date(c.time).toLocaleString('sv-SE', { timeZone: 'Europe/London' }).substring(0, 19),
            open:  c.mid.o,
            high:  c.mid.h,
            low:   c.mid.l,
            close: c.mid.c,
          }))
          .reverse();

        return json({ values, meta: { symbol, source: 'oanda', granularity } });
      }

      // -- /api/fred --------------------------------------------
      // Returns { vix: { value, prev }, us10y: { value, prev }, ... }
      // Each series transformed from raw FRED observations array into
      // { value: latestValue, prev: previousValue }  -  shape the dashboard expects.
      if (path === '/api/fred') {
        if (!env.FRED_KEY) return err('FRED_KEY not configured', 503);

        const SERIES = {
          vix:      'VIXCLS',
          us2y:     'GS2',
          us5y:     'GS5',
          us10y:    'GS10',
          dxy:      'DTWEXBGS',
          hy:       'BAMLH0A0HYM2',
          nfci:     'NFCI',
          tips:     'DFII10',
          tips5:    'DFII5',
          bei:      'T10YIE',
          aud_usd:  'DEXUSAL',
          usd_jpy:  'DEXJPUS',
          de10y:    'IRLTLT01DEM156N',
          gb10y:    'IRLTLT01GBM156N',
          jp10y:    'IRLTLT01JPM156N',
          au10y:    'IRLTLT01AUM156N',
          ca10y:    'IRLTLT01CAM156N',
          ch10y:    'IRLTLT01CHM156N',
          de_short: 'IRSTCI01DEM156N',
          gb_short: 'IR3TIB01GBM156N',
          jp_short: 'IRSTCI01JPM156N',
          au_short: 'IR3TIB01AUM156N',
          ca_short: 'IRSTCI01CAM156N',
          ch_short: 'IRSTCI01CHM156N',
        };

        const fetches = Object.entries(SERIES).map(async ([key, id]) => {
          const u = `https://api.stlouisfed.org/fred/series/observations?series_id=${id}&api_key=${env.FRED_KEY}&file_type=json&sort_order=desc&limit=5`;
          try {
            const r = await fetch(u);
            const d = await r.json();
            // Filter out FRED null marker "."
            const valid = (d.observations || [])
              .filter(o => o.value && o.value !== '.')
              .map(o => parseFloat(o.value));
            // Return { value: latest, prev: previous }  -  exactly what dashboard accesses
            return [key, {
              value: valid[0] ?? null,
              prev:  valid[1] ?? null,
            }];
          } catch (e) {
            return [key, { value: null, prev: null }];
          }
        });

        const results = await Promise.all(fetches);
        const out = Object.fromEntries(results);
        return json(out);
      }

      // -- /api/config/caps GET ---------------------------------
      // Returns current proximity cap config from KV.
      // Falls back to hardcoded defaults if not yet saved.
      if (path === '/api/config/caps' && request.method === 'GET') {
        const DEFAULTS = {
          // FX caps (5-digit pairs like EUR/USD, GBP/USD)
          fx: {
            oiAtrFrac:    0.12,   // ATR fraction for OI wall proximity
            oiPipCap:     10,     // Hard pip cap for OI walls
            pivAtrFrac:   0.10,   // ATR fraction for pivots
            pivPipCap:    8,      // Hard pip cap for pivots
            rngAtrFrac:   0.08,   // ATR fraction for range boundaries
            rngPipCap:    6,      // Hard pip cap for range boundaries
            gexAtrFrac:   0.15,   // ATR fraction for gamma flip
            gexPipCap:    12,     // Hard pip cap for gamma flip
            enhPivAtrFrac:0.10,   // ATR fraction for enhanceConfluences pivotZone
            enhPivPipCap: 8,      // Hard pip cap for enhanceConfluences pivotZone
          },
          // Gold caps (XAU/USD  -  wider pip values)
          gold: {
            oiAtrFrac:    0.12,
            oiPipCap:     8,    // dollar cap ($8), not pips -- gold uses price-point caps
            pivAtrFrac:   0.10,
            pivPipCap:    6,    // $6 -- pivot $4 from entry registers within cap
            rngAtrFrac:   0.08,
            rngPipCap:    5,    // $5
            gexAtrFrac:   0.15,
            gexPipCap:    10,   // $10
            enhPivAtrFrac:0.10,
            enhPivPipCap: 6,    // $6
          },
          // NAS100 caps (NAS100_USD  -  points, not pips)
          nas100: {
            oiAtrFrac:    0.12,
            oiPipCap:     200,  // 200 points cap
            pivAtrFrac:   0.10,
            pivPipCap:    150,
            rngAtrFrac:   0.08,
            rngPipCap:    100,
            gexAtrFrac:   0.15,
            gexPipCap:    250,
            enhPivAtrFrac:0.10,
            enhPivPipCap: 150,
          },
          updatedAt: null,
        };

        try {
          if (!env.FX_SCORES) return json(DEFAULTS);
          const stored = await env.FX_SCORES.get('caps');
          if (!stored) return json(DEFAULTS);
          const parsed = JSON.parse(stored);
          // Merge with defaults so new fields added in future are always present
          return json({
            fx:     { ...DEFAULTS.fx,     ...(parsed.fx     || {}) },
            gold:   { ...DEFAULTS.gold,   ...(parsed.gold   || {}) },
            nas100: { ...DEFAULTS.nas100, ...(parsed.nas100 || {}) },
            updatedAt: parsed.updatedAt || null,
          });
        } catch(e) {
          return json(DEFAULTS);
        }
      }

      // -- /api/config/caps PUT ---------------------------------
      // Saves proximity cap config to KV. Persists forever.
      if (path === '/api/config/caps' && request.method === 'PUT') {
        if (!env.FX_SCORES) return err('FX_SCORES KV namespace not bound. Add it in Cloudflare Pages -> Settings -> Functions -> KV namespace bindings, variable name: FX_SCORES', 503);
        try {
          const body = await request.json();
          if (!body.fx || !body.gold || !body.nas100) return err('Missing fx, gold or nas100 config', 400);

          // Validate all values are positive numbers
          const allVals = [...Object.values(body.fx), ...Object.values(body.gold), ...Object.values(body.nas100)];
          if (allVals.some(v => typeof v !== 'number' || v <= 0)) {
            return err('All cap values must be positive numbers', 400);
          }

          const payload = {
            fx:        body.fx,
            gold:      body.gold,
            nas100:    body.nas100,
            updatedAt: new Date().toISOString(),
          };

          await env.FX_SCORES.put('caps', JSON.stringify(payload));
          return json({ ok: true, saved: payload });
        } catch(e) {
          return err('Failed to save caps: ' + e.message);
        }
      }

      // -- /api/kv/get ------------------------------------------
      // Universal KV cache reader. Returns { data, timestamp } or { miss: true }.
      // Used by the dashboard and journal to share state across devices.
      // Query: ?key=fred  or  ?key=ohlc_EURUSD  etc.
      //
      // Safe KV key whitelist: only allow known prefixes so this endpoint
      // cannot be used to read arbitrary KV entries (e.g. the caps config).
      if (path === '/api/kv/get') {
        if (!env.FX_SCORES) return json({ miss: true, reason: 'KV not bound' });
        const key = url.searchParams.get('key');
        if (!key) return err('key param required', 400);
        if (!isAllowedKVKey(key)) return err('key not permitted', 403);
        try {
          const raw = await env.FX_SCORES.get(key);
          if (!raw) return json({ miss: true });
          return json(JSON.parse(raw));
        } catch(e) {
          return json({ miss: true, reason: e.message });
        }
      }

      // -- /api/kv/set ------------------------------------------
      // Universal KV cache writer. Body: { key, data, timestamp }.
      // Dashboard writes here after every fresh API fetch, so all devices
      // share the same cached data without each hitting upstream APIs.
      if (path === '/api/kv/set' && request.method === 'POST') {
        if (!env.FX_SCORES) return json({ ok: false, reason: 'KV not bound' });
        try {
          const body = await request.json();
          const { key, data, timestamp } = body;
          if (!key) return err('key required', 400);
          if (!isAllowedKVKey(key)) return err('key not permitted', 403);
          // Permanent keys (oi_store, journal_store) have no TTL expiry --
          // they persist until explicitly overwritten.
          // Market-data keys get a 48h KV TTL as a hard safety net, even
          // though the dashboard applies its own soft TTLs at read time.
          const isPermanent = key === 'oi_store' || key === 'journal_store';
          const kvOpts = isPermanent ? {} : { expirationTtl: 172800 }; // 48h
          await env.FX_SCORES.put(key, JSON.stringify({ data, timestamp }), kvOpts);
          return json({ ok: true });
        } catch(e) {
          return json({ ok: false, reason: e.message });
        }
      }

      // -- /api/fredhistory -------------------------------------
      // Returns 90 days of yield data for spread chart.
      // Query: ?keys=us2y,us10y,de10y,de_short (comma-separated FRED keys)
      if (path === '/api/fredhistory') {
        if (!env.FRED_KEY) return err('FRED_KEY not configured', 503);

        const ALL_SERIES = {
          us2y:     'GS2',
          us10y:    'GS10',
          dxy:      'DTWEXBGS',
          de10y:    'IRLTLT01DEM156N',
          gb10y:    'IRLTLT01GBM156N',
          jp10y:    'IRLTLT01JPM156N',
          au10y:    'IRLTLT01AUM156N',
          ca10y:    'IRLTLT01CAM156N',
          ch10y:    'IRLTLT01CHM156N',
          de_short: 'IRSTCI01DEM156N',
          gb_short: 'IR3TIB01GBM156N',
          jp_short: 'IRSTCI01JPM156N',
          au_short: 'IR3TIB01AUM156N',
          ca_short: 'IRSTCI01CAM156N',
          ch_short: 'IRSTCI01CHM156N',
        };

        const keysParam = url.searchParams.get('keys') || 'us2y,us10y,de10y,de_short';
        const requestedKeys = keysParam.split(',').filter(k => ALL_SERIES[k]);

        const fetches = requestedKeys.map(async key => {
          const seriesId = ALL_SERIES[key];
          const u = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${env.FRED_KEY}&file_type=json&sort_order=desc&limit=90`;
          try {
            const r = await fetch(u);
            const d = await r.json();
            const points = (d.observations || [])
              .filter(o => o.value && o.value !== '.')
              .map(o => ({ date: o.date, value: parseFloat(o.value) }))
              .reverse();
            return [key, points];
          } catch(e) {
            return [key, []];
          }
        });

        const results = await Promise.all(fetches);
        return json(Object.fromEntries(results));
      }

      // -- /api/events ------------------------------------------
      // Finnhub economic calendar for next 3 days.
      // Returns flat array of event objects: { time, country, event, impact, estimate, actual, prev }
      if (path === '/api/events') {
        if (!env.FINNHUB_KEY) return json({ ok: false, reason: 'FINNHUB_KEY not configured', events: [] });
        try {
          const today  = new Date();
          const from   = today.toISOString().split('T')[0];
          const to     = new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
          const url    = `https://finnhub.io/api/v1/calendar/economic?from=${from}&to=${to}&token=${env.FINNHUB_KEY}`;
          const res    = await fetch(url, { headers: { 'User-Agent': 'MacroFXDashboard/1.0' } });
          if (!res.ok) return json({ ok: false, reason: `Finnhub ${res.status}`, events: [] });
          const data   = await res.json();
          const events = (data.economicCalendar || []).map(e => ({
            time:    e.time,
            country: e.country,
            event:   e.event,
            impact:  e.impact,
            unit:    e.unit || null,
            estimate:e.estimate,
            actual:  e.actual,
            prev:    e.prev,
          }));
          return json(events);
        } catch(e) {
          return json({ ok: false, reason: e.message, events: [] });
        }
      }

      // -- /api/surprise ----------------------------------------
      // Finnhub economic calendar for past 30 days — only events with actual + estimate.
      // Used to compute the Macro Surprise Index per currency.
      if (path === '/api/surprise') {
        if (!env.FINNHUB_KEY) return json([]);
        try {
          const to   = new Date();
          const from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
          const url  = `https://finnhub.io/api/v1/calendar/economic?from=${from.toISOString().split('T')[0]}&to=${to.toISOString().split('T')[0]}&token=${env.FINNHUB_KEY}`;
          const res  = await fetch(url, { headers: { 'User-Agent': 'MacroFXDashboard/1.0' } });
          if (!res.ok) return json([]);
          const data = await res.json();
          const obs  = (data.economicCalendar || [])
            .filter(e => e.actual != null && e.actual !== '' && e.estimate != null && e.estimate !== '')
            .map(e => ({
              time:     e.time,
              country:  e.country,
              event:    e.event,
              impact:   e.impact,
              actual:   e.actual,
              estimate: e.estimate,
              prev:     e.prev,
            }));
          return json(obs);
        } catch(e) {
          return json([]);
        }
      }

      // -- /api/analysis ----------------------------------------
      // Receives a full dashboard snapshot and returns a Claude-generated
      // trading intelligence brief as structured JSON.
      // Requires ANT_KEY env var (Anthropic API key).
      if (path === '/api/analysis' && request.method === 'POST') {
        if (!env.ANT_KEY) return err('ANT_KEY not configured  -  add it in Cloudflare Pages -> Settings -> Environment Variables (both Production and Preview scopes)', 503);
        try {
          const body = await request.json();
          const { pair, snapshot: s } = body;
          if (!pair || !s) return err('Missing pair or snapshot', 400);

          const prompt = `You are a professional FX/futures desk analyst. Analyse the following real-time dashboard snapshot for ${pair} and produce a structured trading intelligence brief. Be direct, specific, and actionable. Think like a prop trader who needs to make a decision in the next 30 minutes.

=== DASHBOARD SNAPSHOT: ${pair} ===

MACRO SCORE & TIER BREAKDOWN
Score: ${s.macroScore ?? 'N/A'} / 16  (${s.macroBias ?? 'N/A'})
Coherence: ${s.agreeCount ?? '?'}/7 tiers agree   Coherence bonus: ${s.coherenceBonus ?? 0}
Tier breakdown:
${s.tiers ? s.tiers.map(t => `  ${t.name}: ${t.score >= 0 ? '+' : ''}${t.score}  -  ${t.reading} (${t.val})`).join('\n') : '  Not available'}

VOLATILITY REGIME
Vol regime: ${s.volRegime ?? 'N/A'}  |  ATR percentile: ${s.atrPct ?? 'N/A'}th  |  ATR: ${s.atr ?? 'N/A'}
Recommended position size: ${s.positionSize ?? 'N/A'}%

PRICE & RANGE DATA
Current price: ${s.price ?? 'N/A'}
Asia range: ${s.asiaHigh ?? 'N/A'} - ${s.asiaLow ?? 'N/A'}  (${s.asiaRangePips ?? 'N/A'} pips)  *  ${s.priceVsAsia ?? 'N/A'}
Asia yesterday: ${s.asiaYestHigh ?? 'N/A'} - ${s.asiaYestLow ?? 'N/A'}
Monday range: ${s.mondayHigh ?? 'N/A'} - ${s.mondayLow ?? 'N/A'}  (${s.mondayRangePips ?? 'N/A'} pips)  *  ${s.priceVsMonday ?? 'N/A'}

DAILY PIVOTS
R3: ${s.r3 ?? 'N/A'}  |  R2: ${s.r2 ?? 'N/A'}  |  R1: ${s.r1 ?? 'N/A'}  |  PP: ${s.pp ?? 'N/A'}
S1: ${s.s1 ?? 'N/A'}  |  S2: ${s.s2 ?? 'N/A'}  |  S3: ${s.s3 ?? 'N/A'}

FIB CONFLUENCES DETECTED (${s.confluenceCount ?? 0} total shown)
${s.confluences && s.confluences.length > 0
  ? s.confluences.map(c => `  ${c.stars}* @ ${c.price}  [${c.sources}]  ${c.tight ? 'TIGHT' : 'NORMAL'}${(c.density||1) >= 2 ? ` CLUSTER×${c.density}` : ''}  dist: ${c.distPips}p  dir: ${c.direction ?? 'AT LEVEL'}  ${c.aligned ? 'v bias-aligned' : ''}  ${c.pivotMatch ? ` near ${c.pivotMatch}` : ''}`).join('\n')
  : '  None detected in current display mode'}

CME OI / OPTIONS POSITIONING
${s.oi ? `Max Pain: ${s.oi.maxPain}  |  Call Wall: ${s.oi.callWall} (${s.oi.callWallOI} OI)  |  Put Wall: ${s.oi.putWall} (${s.oi.putWallOI} OI)
P/C Ratio: ${s.oi.pcRatio}  ->  ${s.oi.pcBias}
Total Call OI: ${s.oi.totalCallOI}  |  Total Put OI: ${s.oi.totalPutOI}
OI Flow  -  calls: ${s.oi.totalCallChg ?? 'N/A'}  puts: ${s.oi.totalPutChg ?? 'N/A'}
Aggregate GEX: ${s.oi.gex ?? 'N/A'}  |  DEX: ${s.oi.dex ?? 'N/A'}  ->  ${s.oi.gexRead ?? 'N/A'}
Gamma flip level: ${s.oi.gammaFlip ?? 'N/A'}
Top strikes (strike | callOI/putOI | type):
${s.oi.topLevels ? s.oi.topLevels.slice(0,6).map(l => `  ${l.strike}  C:${l.callOI} / P:${l.putOI}  ${l.strike > s.price ? 'RESISTANCE' : 'SUPPORT'}`).join('\n') : '  N/A'}`
  : '  No OI data loaded for this pair  -  paste via  OI button'}

YIELD CURVE & MACRO SNAPSHOT
US 2s10s spread: ${s.us2s10s ?? 'N/A'} bp  ->  ${s.curveShape ?? 'N/A'}
VIX: ${s.vix ?? 'N/A'}  (prev: ${s.vixPrev ?? 'N/A'})  ${s.vix && s.vixPrev ? (s.vix > s.vixPrev ? '^ rising fear' : 'v falling fear') : ''}
HY credit spread: ${s.hy ?? 'N/A'} bp  (prev: ${s.hyPrev ?? 'N/A'} bp)
DXY: ${s.dxy ?? 'N/A'}  (prev: ${s.dxyPrev ?? 'N/A'})
AUD/JPY carry: ${s.audjpy ?? 'N/A'}  (prev: ${s.audjpyPrev ?? 'N/A'})
NFCI: ${s.nfci ?? 'N/A'}
10Y TIPS real yield: ${s.tips ?? 'N/A'}%  |  Breakeven inflation: ${s.bei ?? 'N/A'}%
Cross-asset risk sentiment: ${s.riskSentiment ?? 'N/A'}

Foreign curves: ${s.foreignCurves ?? 'N/A'}

GARCH VOLATILITY FORECAST
${s.garch ? `GARCH(1,1) daily range forecast: ${s.garch.forecast}  |  68% CI: ${s.garch.ci68}  |  95% CI: ${s.garch.ci95}
Vol clustering: ${s.garch.cluster}  -  ${s.garch.clusterMsg}
Annualised sigma: ${s.garch.sigmaAnn}  |  Used today: ${s.garch.usedToday}  |  ${s.garch.remaining}` : '  GARCH not available (insufficient bar history)'}

REGIME TRANSITION RISK
${s.regimeTransition ? `Risk level: ${s.regimeTransition.risk} (score ${s.regimeTransition.score}/100)
${s.regimeTransition.consecutiveDays} consecutive days in ${s.regimeTransition.regime} vol${s.regimeTransition.compressing ? '  -  ATR compressing (pre-shock risk building)' : s.regimeTransition.expanding ? '  -  ATR expanding' : ''}
${s.regimeTransition.summary}
${s.regimeTransition.detail}` : '  Not available'}

ARMA(1,1) SPREAD FORECAST (10Y rate differential, 5-day)
${s.armaForecast ? `Direction: ${s.armaForecast.direction}  |  Confidence: ${s.armaForecast.confidence}  |  Model skill: ${s.armaForecast.skill}
1-day spread change: ${s.armaForecast.f1d ?? 'N/A'}  |  5-day spread change: ${s.armaForecast.f5d ?? 'N/A'}
Pair implication: ${s.armaForecast.pairBias}
AR(?): ${s.armaForecast.phi}  MA(?): ${s.armaForecast.theta}` : '  ARMA not available (compass data not loaded)'}

SPREAD SIGNAL ENGINE
${s.spreadSignal ? `Bias: ${s.spreadSignal.bias}  |  Type: ${s.spreadSignal.type}  |  Score: ${s.spreadSignal.score}
Fair value gap: ${s.spreadSignal.fvPips ?? 'N/A'} pips ${s.spreadSignal.fvBull ? '(undervalued  -  buy bias)' : '(overvalued  -  sell bias)'}
${s.spreadSignal.lagDetected ? '! LAG DETECTED  -  spread moved ahead of price, catch-up move likely' : ''}` : '  Signal engine not available'}

COT POSITIONING (CFTC Traders in Financial Futures — Leveraged Funds / Managed Money)
${s.cot ? `Report date: ${s.cot.reportDate ?? 'N/A'}  |  Open Interest: ${s.cot.openInterest ?? 'N/A'}
Leveraged funds net: ${s.cot.levNet ?? 'N/A'} (${s.cot.levNetChg != null ? (s.cot.levNetChg >= 0 ? '+' : '') + s.cot.levNetChg : 'N/A'} wk)  |  Net % of OI: ${s.cot.levPct != null ? s.cot.levPct.toFixed(1) + '%' : 'N/A'}
Spec traders: ${s.cot.numLevLong ?? 'N/A'} long · ${s.cot.numLevShort ?? 'N/A'} short  |  Avg size: ${s.cot.avgContracts ?? 'N/A'} contracts
Asset Mgr net: ${s.cot.amNet ?? 'N/A'} (${s.cot.amNetChg != null ? (s.cot.amNetChg >= 0 ? '+' : '') + s.cot.amNetChg : 'N/A'} wk)  |  Dealer net: ${s.cot.dealerNet ?? 'N/A'}
Gross L/S ratio: ${s.cot.grossRatio ?? 'N/A'}  |  Crowding: ${s.cot.crowdingPct != null ? s.cot.crowdingPct.toFixed(1) + '% of OI' : 'N/A'}${s.cot.crowdingPct >= 20 ? ' — EXTREME (unwind risk elevated)' : s.cot.crowdingPct >= 10 ? ' — ELEVATED' : ''}` : '  COT data not available (set CFTC URL via COT toolbar button)'}

HIGH CONFLUENCE ENTRIES (from multi-layer scanner)
${s.topEntries && s.topEntries.length > 0
  ? s.topEntries.map(e => `  ${e.stars}* ${e.direction.toUpperCase()} @ ${e.price}  Tags: ${e.tags}  SL: ${e.sl} (${e.slPips}p)  TP: ${e.tp} (${e.tpNote}${e.tpCapped ? ' - vol capped' : ''}, ${e.tpPips}p)  R:R 1:${e.rr}  Size: ${e.size}%`).join('\n')
  : '  No high-confluence entries detected'}

SESSION INTELLIGENCE
Current session: ${s.session?.name ?? 'N/A'}  |  London time: ${s.session?.londonTime ?? 'N/A'}  |  Confidence multiplier: ${s.session?.confidence ?? 'N/A'}x
Context: ${s.session?.desc ?? 'N/A'}

VOLATILITY IMPULSE (5-bar momentum)
${s.volImpulse ? `Bias: ${s.volImpulse.bias.toUpperCase()}  |  Last 5 bars avg TR vs prior 5: ${s.volImpulse.pct >= 0 ? '+' : ''}${s.volImpulse.pct.toFixed(1)}%
${s.volImpulse.bias === 'expanding' ? '→ Vol accelerating — widen stops, beware stop-hunts' : s.volImpulse.bias === 'contracting' ? '→ Vol contracting — tighter stops possible, range trades favoured' : '→ Vol stable — no regime shift signal'}` : '  Not available (< 10 daily bars)'}

USD STRENGTH COMPOSITE (cross-pair normalised)
${s.usdStrength
  ? `${s.usdStrength.label}  |  Score: ${s.usdStrength.score}  |  Pairs: ${s.usdStrength.pairsUsed}/4
Per-pair z-scores: ${s.usdStrength.perPair || 'N/A'}
${s.usdStrength.fredConflict ? '⚠ FRED DXY disagrees with price-based composite — treat composite as primary signal' : 'FRED DXY consistent with composite'}
${s.crossConflict ? `CROSS-PAIR CONFLICT: ${s.crossConflict.type.toUpperCase()} (${s.crossConflict.severity}) — ${s.crossConflict.message}  |  Size adj: ×${s.crossConflict.sizeMult}` : 'No cross-pair conflict with current signal'}`
  : '  Insufficient pair data for composite (need 2+ USD pairs loaded)'}

DOLLAR REGIME (DXY)
${s.dollarRegime ? `${s.dollarRegime.label}  |  DXY: ${s.dollarRegime.dxy ?? 'N/A'}  |  Change: ${s.dollarRegime.change != null ? (s.dollarRegime.change >= 0 ? '+' : '') + s.dollarRegime.change + '%' : 'N/A'}  |  Strength: ${s.dollarRegime.strength}` : '  DXY data not available'}

ECONOMIC EVENT RISK
${s.eventRisk && !s.eventRisk.unavailable
  ? `Risk level: ${s.eventRisk.level.toUpperCase()}  |  Size multiplier: ${s.eventRisk.sizeMult}x
${s.eventRisk.inNext4h && s.eventRisk.inNext4h.length > 0
    ? 'Events next 4h: ' + s.eventRisk.inNext4h.map(e => `${e.country} ${e.impact?.toUpperCase()||'?'} "${e.event||'—'}" ${e.time ? new Date(e.time).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/London'}) : ''}`).join(' | ')
    : 'No events in next 4 hours'}
${Object.keys(s.eventRisk.currencyRisk||{}).length > 0
    ? 'Currency risk: ' + Object.entries(s.eventRisk.currencyRisk).map(([c,r]) => `${c}: ${r.high}H/${r.medium}M`).join(', ')
    : ''}`
  : '  Economic calendar unavailable (FINNHUB_KEY not configured)'}

MACRO SURPRISE INDEX (30-day actual vs forecast)
${s.surpriseIndex && Object.keys(s.surpriseIndex).length > 0
  ? Object.entries(s.surpriseIndex).sort((a,b) => Math.abs(b[1])-Math.abs(a[1])).map(([c,v]) => `${c}: ${v >= 0 ? '+' : ''}${v.toFixed(2)}`).join('  |  ') +
    (s.pairSurprise != null ? `\nPair net surprise: ${s.pairSurprise >= 0 ? '+' : ''}${s.pairSurprise.toFixed(2)} (positive = bullish base ccy)` : '')
  : '  Surprise index unavailable (Finnhub not configured or no data with estimates)'}

=== END SNAPSHOT ===

Respond with a single valid JSON object. No markdown. No text outside the JSON. Keep all string values SHORT (1-2 sentences max) EXCEPT tldr. Max 3 items per array.
convictionScore MUST be an integer from 0 to 10 only (0=no conviction, 5=moderate, 10=maximum). Do not use any other scale.
tldr: plain text ~100 words, copy-paste ready brief. Use this exact format (newlines with \\n):
"[PAIR] [BIAS] [SCORE]/10 | [REGIME]\\n[1-2 sentence market read]\\nWatch: [up to 3 key levels with price and type]\\nDo: [specific action]. Avoid: [what to avoid]. Risk: [main risk or event]"

{"overallBias":"LONG|SHORT|NEUTRAL","conviction":"HIGH|MEDIUM|LOW","convictionScore":5,"headline":"","regime":{"label":"TRENDING|RANGING|BREAKOUT RISK|MEAN-REVERSION|CHOPPY","detail":""},"macroRead":"","yieldCurveRead":"","oiRead":"","garchRead":"","armaRead":"","spreadSignalRead":"","cotRead":"","sessionRead":"","dollarRegimeRead":"","eventRiskRead":"","surpriseRead":"","keyLevels":[{"price":"","type":"CALL WALL|PUT WALL|MAX PAIN|GAMMA FLIP|FIB CONFLUENCE|PIVOT|RANGE HIGH|RANGE LOW","significance":""}],"tradingFramework":"","goodToDoNow":["",""],"avoidNow":["",""],"breakoutTrigger":"","reversionTrigger":"","cleanBreakPotential":"LOW|MEDIUM|HIGH","cleanBreakRationale":"","sentimentPositioning":"","reflexivity":"","riskWarnings":["",""],"tldr":""}`;

          const antRes = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': env.ANT_KEY,
              'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
              model: 'claude-sonnet-4-5',
              max_tokens: 4000,
              system: 'You are a professional FX/futures desk analyst. You ALWAYS respond with valid complete JSON only  -  no markdown, no backticks, no text before or after the JSON object. Keep each string value to 1-2 sentences max. Arrays max 3 items. JSON must be fully closed.',
              messages: [{ role: 'user', content: prompt }]
            })
          });

          if (!antRes.ok) {
            const errTxt = await antRes.text();
            return err(`Anthropic API error ${antRes.status}: ${errTxt.slice(0, 200)}`);
          }

          const antData = await antRes.json();

          // Detect truncation before trying to parse
          if (antData.stop_reason === 'max_tokens') {
            return err('Response truncated (hit token limit)  -  please try again');
          }

          const rawText = antData.content?.[0]?.text ?? '';
          // Strip any accidental markdown fences
          const clean = rawText.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();

          let parsed;
          try {
            parsed = JSON.parse(clean);
          } catch(e) {
            return err(`JSON parse failed (stop=${antData.stop_reason}, tokens=${antData.usage?.output_tokens}): ${clean.slice(0, 400)}`);
          }

          return json({ ok: true, analysis: parsed, generatedAt: new Date().toISOString() });

        } catch(e) {
          return err('Analysis route error: ' + e.message);
        }
      }

      // -- /api/cot/urls GET ------------------------------------
      // Returns stored CFTC report URLs for each asset class.
      // Migrates legacy single cot_url key transparently.
      if (path === '/api/cot/urls' && request.method === 'GET') {
        if (!env.FX_SCORES) return json({ urls: { fx: null, gold: null, equity: null } });
        const raw = await env.FX_SCORES.get('cot_urls').catch(() => null);
        if (raw) return json({ urls: JSON.parse(raw) });
        // Migrate old single-URL key
        const oldRaw = await env.FX_SCORES.get('cot_url').catch(() => null);
        const oldUrl = oldRaw ? JSON.parse(oldRaw) : null;
        return json({ urls: { fx: oldUrl, gold: null, equity: null } });
      }

      // -- /api/cot/urls PUT ------------------------------------
      // Saves CFTC report URLs. Body: { fx, gold, equity } — any can be null.
      if (path === '/api/cot/urls' && request.method === 'PUT') {
        if (!env.FX_SCORES) return err('KV not bound — add FX_SCORES namespace in Cloudflare Pages settings', 503);
        const body = await request.json().catch(() => ({}));
        const urls = { fx: body.fx || null, gold: body.gold || null, equity: body.equity || null };
        for (const [key, u] of Object.entries(urls)) {
          if (u && !u.includes('cftc.gov')) return err(`Invalid ${key} URL — must contain cftc.gov`, 400);
        }
        await env.FX_SCORES.put('cot_urls', JSON.stringify(urls));
        return json({ ok: true });
      }

      // -- /api/cot ---------------------------------------------
      // Fetches and parses CFTC COT reports for all configured URL types.
      // FX + equity → TFF parser; gold → Disaggregated parser.
      // Results are merged into a single object keyed by pair symbol.
      if (path === '/api/cot') {
        if (!env.FX_SCORES) return json({ ok: false, reason: 'KV not bound' });

        // Load stored URLs, falling back to legacy key
        let urls = { fx: null, gold: null, equity: null };
        const storedRaw = await env.FX_SCORES.get('cot_urls').catch(() => null);
        if (storedRaw) {
          urls = JSON.parse(storedRaw);
        } else {
          const oldRaw = await env.FX_SCORES.get('cot_url').catch(() => null);
          if (oldRaw) urls.fx = JSON.parse(oldRaw);
        }

        if (!urls.fx && !urls.gold && !urls.equity) {
          return json({ ok: false, reason: 'No COT URLs configured — set them via the COT toolbar button' });
        }

        const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; MacroRangeDashboard)' };
        const merged = {};
        const errors = [];

        // FX (TFF report — also covers NAS100 if equity URL not separate)
        if (urls.fx) {
          try {
            const res = await fetch(urls.fx, { headers: UA });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            Object.assign(merged, parseCFTCFile(await res.text()));
          } catch(e) { errors.push(`FX: ${e.message}`); }
        }

        // Equity (TFF report — only fetch separately if URL differs from fx)
        if (urls.equity && urls.equity !== urls.fx) {
          try {
            const res = await fetch(urls.equity, { headers: UA });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const eqData = parseCFTCFile(await res.text());
            // Merge only equity symbols to avoid overwriting FX data
            if (eqData['NAS100_USD']) merged['NAS100_USD'] = eqData['NAS100_USD'];
          } catch(e) { errors.push(`Equity: ${e.message}`); }
        }

        // Gold (Disaggregated report)
        if (urls.gold) {
          try {
            const res = await fetch(urls.gold, { headers: UA });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            Object.assign(merged, parseCFTCDisaggFile(await res.text()));
          } catch(e) { errors.push(`Gold: ${e.message}`); }
        }

        const pairsFound = Object.keys(merged).length;
        if (pairsFound === 0) {
          return err(`Parsed 0 pairs.${errors.length ? ' Errors: ' + errors.join('; ') : ' Check URLs are correct CFTC report types.'}`, 422);
        }

        const reportDate = merged['EUR/USD']?.changeDate || merged['XAU/USD']?.changeDate || merged['NAS100_USD']?.changeDate || null;
        return json({ ok: true, data: merged, pairsFound, reportDate, errors: errors.length ? errors : undefined });
      }

      // -- Serve index.html for all other routes ----------------
      // Cloudflare Pages handles static asset serving automatically,
      // but if the worker intercepts non-API routes, pass through.
      return env.ASSETS ? env.ASSETS.fetch(request) : new Response('Not found', { status: 404 });

    } catch (e) {
      console.error('Worker error:', e);
      return err(`Worker error: ${e.message}`, 500);
    }
  },
};
