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
  const EXACT = new Set(['fred', 'fred2', 'oi_store', 'journal_store', 'journal_replay_store', 'journal_running_totals', 'cot_data', 'surprise_index', 'events_today', 'sentiment', 'bot_config', 'bot_status', 'bot_credentials', 'bot_override', 'backtestsystem_status', 'backtestsystem_credentials', 'backtestsystem_live_config', 'backtestsystem_journal', 'regime_bot_config', 'regime_bot_credentials', 'regime_bot_status', 'regime_bot_v2_config', 'regime_bot_v2_credentials', 'regime_bot_v2_status', 'rgv2_force_unlock', 'gold_bot_status', 'gold_bot_config', 'gold_bot_credentials', 'dyn_anchor_config', 'dyn_anchor_credentials', 'dyn_anchor_status', 'dyn_anchor_forecast', 'da_force_unlock']);
  const PREFIXES = ['ohlc_', 'ohlc5m_', 'ohlc30m_', 'quote_', 'ai_', 'compass_', 'fredhistory_', 'events_', 'arima_price_', 'gold_', 'beta_', 'rgv1_', 'rgv2_'];
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

  // Extract the report date from the file header (e.g. "...Options and Futures Combined, May 05, 2026")
  // This is the actual report date — "Changes from:" contains the PRIOR week's date.
  let reportDate = null;
  for (let i = 0; i < Math.min(lines.length, 20); i++) {
    const m = lines[i].match(/,\s*([A-Z][a-z]+ \d{1,2},\s*\d{4})\s*$/);
    if (m) { reportDate = m[1].trim(); break; }
  }

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

    let positions = null, changes = null, traders = null, changeDate = reportDate;

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

// Parses the CFTC Disaggregated Futures report (other_lof.htm — physical commodities incl. Gold).
// Format: colon-delimited rows.  "All  :   526,987:    18,823     41,173  ..."
// Columns after OI: ProducerL, ProducerS, ProducerSp, SwapL, SwapS, SwapSp, MML, MMS, MMSp, OthL, OthS, OthSp, NrL, NrS
// Output uses same field names as parseCFTCFile so renderCOTCard works unchanged.
// _report:'disagg' tag lets the UI swap category labels (Managed Money / Swap / Producer).
function parseCFTCDisaggFile(text) {
  const plain = text.replace(/<[^>]+>/g, '').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>');
  const lines = plain.split(/\r?\n/);

  // Extract the report date from the file header
  let reportDate = null;
  for (let i = 0; i < Math.min(lines.length, 20); i++) {
    const m = lines[i].match(/,\s*([A-Z][a-z]+ \d{1,2},\s*\d{4})\s*$/);
    if (m) { reportDate = m[1].trim(); break; }
  }

  // Parse a colon-delimited data row: "All  :   526,987:    18,823     41,173 ..."
  // Returns the numeric values as an array, ignoring the leading label and OI column.
  const parseColonRow = line => {
    const parts = line.split(':');
    if (parts.length < 3) return null;
    // parts[1] = open interest, parts[2] = position data
    const oi  = parseInt((parts[1] || '').replace(/,/g, '').trim()) || null;
    const nums = (parts[2] || '').replace(/,/g, '').trim().split(/\s+/).map(Number).filter(n => !isNaN(n) && isFinite(n));
    return { oi, nums };
  };

  // Markers: CFTC uses the exchange name line then "Code-NNNNNN" for each commodity
  // Gold = COMMODITY EXCHANGE INC., Code-088691
  const DISAGG_MAP = [
    { name: 'COMMODITY EXCHANGE INC', code: '088691', pair: 'XAU/USD' },
  ];

  const result = {};

  for (let i = 0; i < lines.length; i++) {
    const match = DISAGG_MAP.find(m => lines[i].includes(m.name) || lines[i].includes(m.code));
    if (!match) continue;

    let openInterest = null, positions = null, changes = null, numMML = 0, numMMS = 0;
    let posRowFound = false, chgRowFound = false, trdRowFound = false;

    for (let j = i; j < Math.min(i + 60, lines.length); j++) {
      const l = lines[j];
      const lt = l.trim();
      if (!lt) continue;

      // The "All" positions row — first one after the header dashes
      // Disaggregated format has 12+ cols; legacy "other" format has 8-9 cols
      if (!posRowFound && /^All\s*:/.test(lt)) {
        const parsed = parseColonRow(lt);
        if (parsed && parsed.nums.length >= 8) {
          openInterest = parsed.oi;
          positions    = parsed.nums;
          posRowFound  = true;
        }
        continue;
      }

      // Changes row — the numeric row immediately after "Changes in Commitments from:"
      if (!chgRowFound && lt.includes('Changes in Commitments from:')) {
        // Next non-empty line with numbers is the changes row
        for (let k = j + 1; k < j + 5; k++) {
          const cl = (lines[k] || '').trim();
          if (!cl) continue;
          // Changes row starts with spaces/colon, no "All"/"Old" label
          const nums = cl.replace(/,/g, '').split(/\s+/).map(Number).filter(n => !isNaN(n) && isFinite(n));
          if (nums.length >= 8) { changes = nums; chgRowFound = true; break; }
        }
        continue;
      }

      // Traders row — "All" row under "Number of Traders in Each Category"
      if (!trdRowFound && lt.includes('Number of Traders')) {
        for (let k = j + 1; k < j + 5; k++) {
          const tl = (lines[k] || '').trim();
          if (!tl) continue;
          if (/^All\s*:/.test(tl)) {
            const parsed = parseColonRow(tl);
            if (parsed && parsed.nums.length >= 2) {
              // Disaggregated: ProdL,ProdS,SwapL,SwapS,SwapSp,MML,MMS,...
              // Legacy: NonCommL,NonCommS,Comm,Total — use first two as spec traders
              numMML = parsed.nums.length >= 6 ? (parsed.nums[5] || 0) : (parsed.nums[0] || 0);
              numMMS = parsed.nums.length >= 7 ? (parsed.nums[6] || 0) : (parsed.nums[1] || 0);
              trdRowFound = true;
            }
            break;
          }
        }
        if (trdRowFound) break;
      }
    }

    if (!positions || positions.length < 8) continue;

    const p = positions;
    const c = changes || new Array(14).fill(0);

    let mmL, mmS, swapL, swapS, producerL, producerS;
    let mmNetChg, swapNetChg, producerNetChg, reportType;

    if (p.length >= 12) {
      // Disaggregated cols: ProducerL[0],ProducerS[1],ProducerSp[2],SwapL[3],SwapS[4],SwapSp[5],MML[6],MMS[7],...
      producerL = p[0]; producerS = p[1];
      swapL = p[3]; swapS = p[4];
      mmL = p[6]; mmS = p[7];
      mmNetChg       = (c[6]||0) - (c[7]||0);
      swapNetChg     = (c[3]||0) - (c[4]||0);
      producerNetChg = (c[0]||0) - (c[1]||0);
      reportType = 'disagg';
    } else {
      // Legacy "Other" LOF cols: NonCommL[0],NonCommS[1],NonCommSp[2],CommL[3],CommS[4],TotalL[5],TotalS[6],NonRepL[7],NonRepS[8]
      mmL = p[0]; mmS = p[1];          // Non-Commercial = large specs
      producerL = p[3]; producerS = p[4]; // Commercial = hedgers
      swapL = p[7]||0; swapS = p[8]||0;  // Non-Reportable (small traders)
      mmNetChg       = (c[0]||0) - (c[1]||0);
      producerNetChg = (c[3]||0) - (c[4]||0);
      swapNetChg     = (c[7]||0) - (c[8]||0);
      reportType = 'legacy';
    }

    const levNet    = mmL - mmS;
    const amNet     = swapL - swapS;
    const dealerNet = producerL - producerS;
    const levPct    = openInterest ? Math.round(levNet / openInterest * 1000) / 10 : null;
    const grossRatio = mmS > 0 ? Math.round(mmL / mmS * 100) / 100 : null;
    const avgLevContracts = numMML > 0 ? Math.round(mmL / numMML) : null;
    const crowdingPct = openInterest ? Math.round(Math.abs(levNet) / openInterest * 100) : null;

    result[match.pair] = {
      openInterest, changeDate: reportDate,
      levLong: mmL, levShort: mmS, levNet, levNetChg: mmNetChg, levPct,
      numLevLong: numMML, numLevShort: numMMS, avgLevContracts,
      amLong: swapL,     amShort: swapS,     amNet,     amNetChg: swapNetChg,
      dealerLong: producerL, dealerShort: producerS, dealerNet, dealerNetChg: producerNetChg,
      grossRatio, crowdingPct,
      _report: reportType,
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
          hasAnt:      !!env.ANT_KEY,
          hasKV:       !!env.FX_SCORES,
          hasFinnhub:  !!env.FINNHUB_KEY,
          hasOanda:    !!env.OANDA_KEY,
          hasMyfxbook: !!env.MYFXBOOK_SESSION,
        });
      }

      // -- /api/quote ------------------------------------------
      // Returns { price: number } — all symbols via OANDA M1
      if (path === '/api/quote') {
        if (!env.OANDA_KEY) return err('OANDA_KEY not configured', 503);

        const symbol = url.searchParams.get('symbol');
        if (!symbol) return err('symbol param required', 400);

        const oandaBase = env.OANDA_ENV === 'practice'
          ? 'https://api-fxpractice.oanda.com'
          : 'https://api-fxtrade.oanda.com';
        const oandaSym = symbol.replace('/', '_');
        const oRes = await fetch(
          `${oandaBase}/v3/instruments/${encodeURIComponent(oandaSym)}/candles?granularity=M1&count=2&price=M`,
          { headers: { 'Authorization': `Bearer ${env.OANDA_KEY}` }, signal: AbortSignal.timeout(8_000) }
        );
        if (!oRes.ok) return err(`OANDA quote failed (${oRes.status})`, 502);
        const oData = await oRes.json();
        const last = oData.candles?.slice(-1)[0];
        if (!last?.mid?.c) return err('No OANDA candle data for quote', 502);
        return json({ price: parseFloat(last.mid.c) });
      }

      // -- /api/ohlc --------------------------------------------
      // Daily bars — 120 days for pivots, ATR, momentum — all symbols via OANDA
      if (path === '/api/ohlc') {
        if (!env.OANDA_KEY) return err('OANDA_KEY not configured', 503);

        const symbol = url.searchParams.get('symbol');
        if (!symbol) return err('symbol param required', 400);

        const oandaBase = env.OANDA_ENV === 'practice'
          ? 'https://api-fxpractice.oanda.com'
          : 'https://api-fxtrade.oanda.com';
        const oandaSym = symbol.replace('/', '_');
        const oRes = await fetch(
          `${oandaBase}/v3/instruments/${encodeURIComponent(oandaSym)}/candles?granularity=D&count=120&price=M`,
          { headers: { 'Authorization': `Bearer ${env.OANDA_KEY}` }, signal: AbortSignal.timeout(10_000) }
        );
        if (!oRes.ok) return err(`OANDA daily candles failed (${oRes.status})`, 502);
        const oData = await oRes.json();
        if (!oData.candles?.length) return err('No OANDA daily candle data', 502);
        const values = oData.candles
          .filter(c => c.complete && c.mid)
          .map(c => ({
            datetime: c.time.substring(0, 10),
            open:  c.mid.o,
            high:  c.mid.h,
            low:   c.mid.l,
            close: c.mid.c,
          }))
          .reverse();
        return json({ values, meta: { symbol, source: 'oanda', interval: '1day' } });
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

        // Server-side KV cache — M5: 4 min, M30: 22 min — prevents hammering OANDA on
        // every dashboard load and eliminates timeouts for repeat requests.
        const cacheKey    = `${granularity === 'M5' ? 'ohlc5m' : 'ohlc30m'}_srv_${instrument}`;
        const cacheTtlMs  = granularity === 'M5' ? 4 * 60 * 1000 : 22 * 60 * 1000;
        if (env.FX_SCORES) {
          try {
            const cached = await env.FX_SCORES.get(cacheKey);
            if (cached) {
              const { data: cachedData, ts } = JSON.parse(cached);
              if (Date.now() - ts < cacheTtlMs) return json(cachedData);
            }
          } catch {}
        }

        const oandaUrl = `${oandaBase}/v3/instruments/${encodeURIComponent(instrument)}/candles?granularity=${granularity}&count=${count}&price=M`;
        const res = await fetch(oandaUrl, {
          headers: { 'Authorization': `Bearer ${env.OANDA_KEY}` },
          signal: AbortSignal.timeout(20_000),
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

        const result = { values, meta: { symbol, source: 'oanda', granularity } };

        if (env.FX_SCORES) {
          env.FX_SCORES.put(cacheKey, JSON.stringify({ data: result, ts: Date.now() }), { expirationTtl: 3600 }).catch(() => {});
        }

        return json(result);
      }

      // -- /api/oanda_ohlc1m  ----------------------------------
      // M1 bars for a specific trading date — used by journal day replay.
      // ?symbol=EUR/USD&date=2025-05-09[&days=1]
      // days defaults to 1 (single session). Pass days=7 for "run to SL/TP"
      // mode so subsequent sessions are included (OANDA caps at 5000 bars ≈ 3.5 days).
      // Returns { values: [{ datetime, open, high, low, close }] } oldest-first.
      if (path === '/api/oanda_ohlc1m') {
        if (!env.OANDA_KEY) return err('OANDA_KEY not configured', 503);

        const symbol = url.searchParams.get('symbol');
        const date   = url.searchParams.get('date');   // YYYY-MM-DD London date
        const days   = Math.min(14, Math.max(1, parseInt(url.searchParams.get('days') || '1', 10)));
        if (!symbol) return err('symbol param required', 400);
        if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return err('date param required (YYYY-MM-DD)', 400);

        const instrument = symbol.replace('/', '_');
        const oandaBase  = env.OANDA_ENV === 'practice'
          ? 'https://api-fxpractice.oanda.com'
          : 'https://api-fxtrade.oanda.com';

        // from: date-1T22:00Z covers London 00:00 even in BST
        // to:   date+days T00:00Z — extended when days>1 for run-to-SL/TP mode
        const [yr, mo, dy] = date.split('-').map(Number);
        const fromDate = new Date(Date.UTC(yr, mo - 1, dy - 1, 22, 0, 0));
        const toDate   = new Date(Date.UTC(yr, mo - 1, dy + days, 0, 0, 0));
        const fromRFC  = fromDate.toISOString();
        const toRFC    = toDate.toISOString();

        const oandaUrl = `${oandaBase}/v3/instruments/${encodeURIComponent(instrument)}/candles`
          + `?granularity=M1&from=${encodeURIComponent(fromRFC)}&to=${encodeURIComponent(toRFC)}&price=M`;

        const res = await fetch(oandaUrl, {
          headers: { 'Authorization': `Bearer ${env.OANDA_KEY}` },
        });

        if (!res.ok) {
          const errText = await res.text().catch(() => 'Oanda error');
          return err(`Oanda M1 fetch failed (${res.status}): ${errText.slice(0, 300)}`, 502);
        }

        const data = await res.json();
        if (!data.candles) return err('Oanda returned no candles', 502);

        // Convert UTC → London local datetime, filter complete candles, keep oldest-first for replay.
        const values = data.candles
          .filter(c => c.complete && c.mid)
          .map(c => ({
            datetime: new Date(c.time).toLocaleString('sv-SE', { timeZone: 'Europe/London' }).substring(0, 19),
            open:  c.mid.o,
            high:  c.mid.h,
            low:   c.mid.l,
            close: c.mid.c,
          }));

        return json({ values, meta: { symbol, date, days, source: 'oanda', granularity: 'M1', count: values.length } });
      }

      // -- /api/oanda_stream ------------------------------------
      // SSE live price feed. Browser opens EventSource('/api/oanda_stream?symbol=EUR_USD').
      // Worker proxies Oanda pricing stream as text/event-stream.
      // Requires: OANDA_KEY, OANDA_ACCOUNT_ID, OANDA_ENV
      if (path === '/api/oanda_stream') {
        if (!env.OANDA_KEY)        return err('OANDA_KEY not configured', 503);
        if (!env.OANDA_ACCOUNT_ID) return err('OANDA_ACCOUNT_ID not configured', 503);

        const streamSym = url.searchParams.get('symbol');
        if (!streamSym) return err('symbol param required', 400);

        const streamInstrument = streamSym.replace('/', '_');
        const streamBase = env.OANDA_ENV === 'practice'
          ? 'https://stream-fxpractice.oanda.com'
          : 'https://stream-fxtrade.oanda.com';

        const streamUrl = `${streamBase}/v3/accounts/${env.OANDA_ACCOUNT_ID}/pricing/stream?instruments=${encodeURIComponent(streamInstrument)}`;

        let oandaStream;
        try {
          oandaStream = await fetch(streamUrl, {
            headers: { 'Authorization': `Bearer ${env.OANDA_KEY}`, 'Accept-Datetime-Format': 'RFC3339' },
          });
        } catch(e) {
          return err('Oanda stream connect failed: ' + e.message, 502);
        }

        if (!oandaStream.ok || !oandaStream.body) return err('Oanda stream error (' + oandaStream.status + ')', 502);

        const { readable, writable } = new TransformStream();
        const writer  = writable.getWriter();
        const encoder = new TextEncoder();
        const decoder = new TextDecoder();

        const pump = async () => {
          const reader = oandaStream.body.getReader();
          let buf = '';
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buf += decoder.decode(value, { stream: true });
              const lines = buf.split('\n');
              buf = lines.pop();
              for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) continue;
                try {
                  const tick = JSON.parse(trimmed);
                  if (tick.type === 'PRICE' && tick.bids?.[0] && tick.asks?.[0]) {
                    const bid = parseFloat(tick.bids[0].price);
                    const ask = parseFloat(tick.asks[0].price);
                    const mid = (bid + ask) / 2;
                    const payload = JSON.stringify({ price: mid, bid, ask, time: tick.time });
                    await writer.write(encoder.encode('data: ' + payload + '\n\n'));
                  } else if (tick.type === 'HEARTBEAT') {
                    await writer.write(encoder.encode(': heartbeat\n\n'));
                  }
                } catch(e) {}
              }
            }
          } catch(e) {
          } finally {
            writer.close().catch(() => {});
          }
        };

        pump();

        return new Response(readable, {
          headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }

      // -- /api/oanda_book --------------------------------------
      // Oanda positionBook — retail long/short distribution per symbol.
      // Returns { currentPrice, longPct, shortPct, sentiment } or { miss, reason }.
      // longPct = % of price-level buckets dominated by long positions (proxy for net long sentiment).
      if (path === '/api/oanda_book') {
        if (!env.OANDA_KEY) return json({ miss: true, reason: 'OANDA_KEY not set' });
        const bookSym = url.searchParams.get('symbol');
        if (!bookSym) return err('symbol param required', 400);
        const bookInstrument = bookSym.replace('/', '_');
        const bookBase = env.OANDA_ENV === 'practice'
          ? 'https://api-fxpractice.oanda.com'
          : 'https://api-fxtrade.oanda.com';
        try {
          const bookRes = await fetch(
            `${bookBase}/v3/instruments/${encodeURIComponent(bookInstrument)}/positionBook`,
            { headers: { 'Authorization': `Bearer ${env.OANDA_KEY}` } }
          );
          if (!bookRes.ok) return json({ miss: true, reason: `Oanda ${bookRes.status}` });
          const bookData = await bookRes.json();
          const pb = bookData.positionBook;
          if (!pb?.buckets?.length) return json({ miss: true, reason: 'No buckets' });
          const currentPrice = parseFloat(pb.price);
          let longDom = 0, shortDom = 0;
          for (const b of pb.buckets) {
            const lp = parseFloat(b.longCountPercent)  || 0;
            const sp = parseFloat(b.shortCountPercent) || 0;
            if (lp > sp + 0.1) longDom++;
            else if (sp > lp + 0.1) shortDom++;
          }
          const total = longDom + shortDom || 1;
          const longPct  = Math.round(longDom  / total * 100);
          const shortPct = 100 - longPct;
          return json({
            currentPrice, longPct, shortPct,
            sentiment: longPct > 60 ? 'bullish' : shortPct > 60 ? 'bearish' : 'neutral',
          });
        } catch(e) {
          return json({ miss: true, reason: e.message });
        }
      }

      // -- /api/fred --------------------------------------------
      // Returns { vix: { value, prev }, us10y: { value, prev }, ... }
      // Each series transformed from raw FRED observations array into
      // { value: latestValue, prev: previousValue }  -  shape the dashboard expects.
      //
      // KV caching (6h fresh TTL, stale-on-failure fallback):
      //   Previously this endpoint fired 27+ concurrent FRED requests on every
      //   client cache-miss, causing rate-limit nulls for VIX/GS10/NFCI/TIPS.
      //   Now the batch runs at most once per 6 hours server-wide; stale data
      //   is returned if FRED is rate-limited rather than propagating nulls.
      if (path === '/api/fred') {
        if (!env.FRED_KEY) return err('FRED_KEY not configured', 503);

        // All FRED fetching is done exclusively by server.js refreshFredDashboard()
        // (sequential, 600 ms per series, rate-safe). This endpoint is KV-read-only —
        // it never touches FRED directly, eliminating the concurrent-request race that
        // was rate-limiting the critical series and creating a null-data livelock.
        const FRED_KV_KEY  = 'fred_data_v3';
        const FRED_FRESH_MS = 6 * 60 * 60 * 1000;

        if (env.FX_SCORES) {
          try {
            const raw = await env.FX_SCORES.get(FRED_KV_KEY);
            if (raw) {
              const { d, t } = JSON.parse(raw);
              // Return fresh data immediately; return stale as fallback when server
              // refresh is still in progress (startup window ≤ 20 s).
              if (d && typeof d === 'object') return json(d);
            }
          } catch { /* KV read error */ }
        }

        // KV empty — server refresh not yet complete (first deploy or post-restart).
        // Return empty object; client will retry on next pair switch or page reload.
        return json({});
      }

      // -- /api/ecbsdw ------------------------------------------
      // ECB SDW daily EUR rates. No API key required.
      // Returns { estr: {value, prev}, de10y_ecb: {value, prev} }
      if (path === '/api/ecbsdw') {
        const cacheKey = 'ecbsdw_daily';
        const cached = await env.FX_SCORES?.get(cacheKey);
        if (cached) return json(JSON.parse(cached));

        async function fetchECBSeries(seriesKey) {
          const ecbUrl = `https://data-api.ecb.europa.eu/service/data/${seriesKey}?lastNObservations=5&format=jsondata`;
          const r = await fetch(ecbUrl, { headers: { Accept: 'application/json' } });
          if (!r.ok) return null;
          const d = await r.json();
          const obs = d?.dataSets?.[0]?.series?.['0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0:0']?.observations
                   ?? d?.dataSets?.[0]?.series?.['0:0:0:0:0:0:0:0:0']?.observations
                   ?? null;
          if (!obs) return null;
          const keys = Object.keys(obs).map(Number).sort((a, b) => a - b);
          if (keys.length < 2) return null;
          return { value: obs[keys[keys.length - 1]][0], prev: obs[keys[keys.length - 2]][0] };
        }

        try {
          const estr      = await fetchECBSeries('EST/B.EU000A2X2A25.WT');
          const de10y_ecb = await fetchECBSeries('YC/B.U2.EUR.4F.G_N_A.SV_C_YM.SR_10Y');
          const result = { estr: estr ?? null, de10y_ecb: de10y_ecb ?? null };
          await env.FX_SCORES?.put(cacheKey, JSON.stringify(result), { expirationTtl: 43200 });
          return json(result);
        } catch(e) {
          return json({ estr: null, de10y_ecb: null, error: e.message });
        }
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
          // Permanent keys have no TTL — they persist until explicitly overwritten.
          // Includes all user config, credentials, journals, and trained ML params.
          // Market-data keys get a 48h KV TTL as a hard safety net.
          const PERMANENT_KEYS = new Set([
            'oi_store', 'journal_store', 'journal_replay_store', 'journal_running_totals',
            'tg_config', 'ai_alert_cfg', 'caps',
            'cot_data', 'cot_urls', 'cot_url',
            'bot_config', 'bot_credentials',
            'regime_bot_config', 'regime_bot_credentials',
            'regime_bot_v2_config', 'regime_bot_v2_credentials',
            'backtestsystem_live_config', 'backtestsystem_credentials',
            'gold_bot_config', 'gold_ml_params', 'gold_optimiser_last', 'gold_perf_snapshot',
            'hmm5m_trained_params', 'hmm5m_macro_context',
          ]);
          const isPermanent = PERMANENT_KEYS.has(key);
          const kvOpts = isPermanent ? {} : { expirationTtl: 172800 }; // 48h
          await env.FX_SCORES.put(key, JSON.stringify({ data, timestamp }), kvOpts);
          return json({ ok: true });
        } catch(e) {
          return json({ ok: false, reason: e.message });
        }
      }

      // -- /api/regime-v2/tg-test ------------------------------
      // Sends a sample entry-alert Telegram message using the current V2 config
      // and the first pair from the live status (or from config pairs list).
      if (path === '/api/regime-v2/tg-test' && request.method === 'POST') {
        if (!env.FX_SCORES) return err('KV not bound', 503);
        try {
          const cfgRaw    = await env.FX_SCORES.get('regime_bot_v2_config');
          const statusRaw = await env.FX_SCORES.get('regime_bot_v2_status');
          const tgCfgRaw  = await env.FX_SCORES.get('tg_config');

          const cfg    = cfgRaw    ? JSON.parse(cfgRaw).data    ?? JSON.parse(cfgRaw) : {};
          const status = statusRaw ? JSON.parse(statusRaw).data ?? JSON.parse(statusRaw) : {};
          const shared = tgCfgRaw  ? JSON.parse(tgCfgRaw).data  ?? JSON.parse(tgCfgRaw) : {};

          const token  = (cfg.tg_token  || '').trim() || (shared.token   || '').trim();
          const chatId = (cfg.tg_chat_id || '').trim() || (shared.chatId  || '').trim();
          if (!token || !chatId) return json({ ok: false, reason: 'No Telegram token/chat ID configured — fill in the V2 Telegram fields and save first.' });

          // Pick a pair: first from live status, else first configured pair
          const statusPairs = Object.keys(status.pairs || {});
          const cfgPairs    = cfg.pairs || ['EUR/USD'];
          const pair        = statusPairs[0] || cfgPairs[0] || 'EUR/USD';
          const pairStatus  = (status.pairs || {})[pair] || {};

          // Build a representative entry-alert message (mirrors formatter.py entry_alert)
          const regime     = pairStatus.regime || 'BULL';
          const conf       = pairStatus.confidence ?? 78.5;
          const pairDisp   = pair.replace('/', '');
          const isJpy      = pair.includes('JPY');
          const isGold     = pair === 'XAU/USD' || pair === 'NAS100_USD';
          const priceDp    = isGold ? 2 : (isJpy ? 3 : 5);
          const price      = pairStatus.price ?? 1.08500;
          const pip        = isGold ? 1.0 : (isJpy ? 0.01 : 0.0001);
          const sl         = price - pip * 15;
          const slPips     = Math.abs(price - sl) / pip;
          const paperTag   = status.paper_mode !== false ? ' [PAPER]' : '';
          const regimeLabel = { BULL: 'Bull', BEAR: 'Bear', RANGE: 'Range', CHOP: 'Chop' }[regime.toUpperCase()] || regime;
          const emoji       = { BULL: '🟢', BEAR: '🔴', RANGE: '🟡', CHOP: '⚪' }[regime.toUpperCase()] || '⚫';
          const direction   = regime === 'BULL' ? 'LONG' : 'SHORT';

          const msg = [
            `${emoji} <b>[V2 TEST] ${pairDisp} — ${direction}${paperTag}</b>`,
            `  Regime    : ${regimeLabel} (${conf.toFixed(1)}%)`,
            `  Price     : ${price.toFixed(priceDp)}`,
            `  SL        : ${sl.toFixed(priceDp)}  (${slPips.toFixed(1)}p)`,
            `  Lots      : 0.10`,
            `  Vol z     : +0.30σ`,
            `  <i>This is a test message — no real trade was opened</i>`,
          ].join('\n');

          const tgRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: msg, parse_mode: 'HTML' }),
          });
          const tgBody = await tgRes.json();
          if (!tgRes.ok) return json({ ok: false, reason: tgBody.description || 'Telegram error' });
          return json({ ok: true, pair, message: msg });
        } catch(e) {
          return json({ ok: false, reason: e.message });
        }
      }

      // -- /api/fredhistory -------------------------------------
      // Returns yield/rate history for spread chart and gold-lab reconstruction.
      // Query: ?keys=us2y,us10y,de10y,de_short (comma-separated FRED keys)
      //        ?period=90d|1y|2y|5y  (default: 90d)
      if (path === '/api/fredhistory') {
        if (!env.FRED_KEY) return err('FRED_KEY not configured', 503);

        const ALL_SERIES = {
          us2y:     'GS2',
          us5y:     'GS5',
          us10y:    'GS10',
          dxy:      'DTWEXBGS',
          tips:     'DFII10',   // 10Y TIPS real yield — gold model Layer 1 + 2
          tips5:    'DFII5',    // 5Y TIPS real yield — more reactive to near-term policy
          bei:      'T10YIE',   // 10Y breakeven inflation — gold model breakeven decomp
          vix:      'VIXCLS',   // VIX — safe haven / regime confidence
          hy:       'BAMLH0A0HYM2', // HY credit spreads — safe haven signal
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

        const period   = url.searchParams.get('period') || '90d';
        const limitMap = { '90d': 90, '1y': 365, '2y': 730, '5y': 1825 };
        const limit    = limitMap[period] ?? 90;

        // KV cache: 6h for 90d, 12h for longer periods (data updates once per business day)
        const cacheKey = `fredhistory_${period}_${keysParam}`;
        const cacheTtl = period === '90d' ? 21600 : 43200; // 6h or 12h
        if (env.FX_SCORES) {
          const cached = await env.FX_SCORES.get(cacheKey);
          if (cached) {
            try {
              const parsed = JSON.parse(cached);
              // Validate all requested keys have data — partial caches from rate-limited
              // sessions have some empty arrays; invalidate them so they get rebuilt.
              if (requestedKeys.every(k => Array.isArray(parsed[k]) && parsed[k].length >= 20)) {
                return json(parsed);
              }
              env.FX_SCORES.delete(cacheKey).catch(() => {});
            } catch {}
          }
        }

        // For 90d requests, try pre-populated individual series cache (written by server
        // refreshFredHistory at startup) — avoids hitting FRED on concurrent client loads.
        if (period === '90d' && env.FX_SCORES) {
          const assembled = {};
          let allFound = true;
          for (const key of requestedKeys) {
            const raw = await env.FX_SCORES.get(`fredhistory_series_${key}`);
            if (raw) {
              try { assembled[key] = JSON.parse(raw); } catch { allFound = false; break; }
            } else { allFound = false; break; }
          }
          if (allFound) {
            // Write composite cache so next request is instant
            await env.FX_SCORES.put(cacheKey, JSON.stringify(assembled), { expirationTtl: cacheTtl })
              .catch(() => {});
            return json(assembled);
          }
        }

        const fetches = requestedKeys.map(async key => {
          const seriesId = ALL_SERIES[key];
          const u = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${env.FRED_KEY}&file_type=json&sort_order=desc&limit=${limit}`;
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
        const payload = Object.fromEntries(results);

        // Only cache if FRED returned usable data — avoids caching empty arrays when rate-limited
        const hasData = Object.values(payload).some(arr => Array.isArray(arr) && arr.length > 0);
        if (env.FX_SCORES && hasData) {
          await env.FX_SCORES.put(cacheKey, JSON.stringify(payload), { expirationTtl: cacheTtl });
        }

        return json(payload);
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

EXECUTION QUALITY (OANDA live spread)
Spread right now: ${s.spreadPips ?? 'N/A'} pips  |  Typical: ${s.typicalSpreadPips ?? 'N/A'} pips  |  Classification: ${s.spreadClassification ?? 'N/A'}
${s.spreadClassification === 'EXTREME' ? 'WARNING: spread is extreme - do not enter, market is illiquid or pre-event' : s.spreadClassification === 'WIDE' ? 'NOTE: spread is elevated - entry cost is high, wait for normalisation or widen stop to account for it' : ''}

RETAIL CROWD POSITIONING (Myfxbook community)
Retail long: ${s.retailLongPct ?? 'N/A'}%  |  Short: ${s.retailShortPct ?? 'N/A'}%  |  Crowding: ${s.retailCrowding ?? 'N/A'}
Avg price of retail longs: ${s.avgLongPrice ?? 'N/A'}  |  Avg price of retail shorts: ${s.avgShortPrice ?? 'N/A'}
Contrarian signal vs macro bias: ${s.retailContrarian ? 'YES - retail crowd opposes macro direction (supportive for trade)' : s.retailSentiment === 'BALANCED' ? 'Crowd is balanced - neutral' : 'NO - retail crowd agrees with macro direction (crowding risk)'}

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

You are a professional FX/futures prop desk analyst. Your job is to give a SPECIFIC, CALIBRATED trading brief - not generic observations.

Rules for your response:
1. Every level you mention must be a specific price, not a description. Say "1.0847" not "near resistance".
2. Every vol / spread observation must reference the actual numbers. Say "GARCH forecasts 42 pips today, 28 used, 14 remaining" not "volatility is moderate".
3. Retail crowd data is contrarian. If 70% of retail are long and macro says short, that is a TAILWIND (squeeze fuel), say so explicitly.
4. Spread classification gates entry quality. If spread is WIDE or EXTREME, say "do not enter now, wait for spread < X pips" with the actual X.
5. avgLongPrice and avgShortPrice are real liquidity clusters. If price is approaching avgShortPrice from below, that is a resistance cluster with real stops above it. Say so.
6. The headline must be one sentence a trader can act on. Not "mixed signals suggest caution." Something like "Fade the 1.0847 Fib/retail-cluster confluence short, target 1.0812, stop 1.0858, wait for spread to normalise below 0.6 pips."
7. goodToDoNow must be specific actions, not attitudes. "Wait for price to reach 1.0847 then look for 5m bearish engulf" not "be patient".
8. avoidNow must also be specific. "Do not chase the move if price is already below 1.0830" not "avoid chasing".
9. riskWarnings must reference actual values from the snapshot. "VIX at 24 (prev 19) - rising fear, USD bid likely to persist" not "volatility risk".
10. If retailCrowding is EXTREME and retailContrarian is true, call out the squeeze setup explicitly in the headline or tradingFramework.

Respond with a single valid JSON object. No markdown. No text outside the JSON. All string values 1-2 sentences max. Max 3 items per arrays.
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
              model: 'claude-sonnet-4-6',
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

      // -- /api/telegram/config GET -----------------------------
      // Returns whether Telegram bot credentials are stored.
      // Never returns the token itself — only chatId and configured flag.
      if (path === '/api/telegram/config' && request.method === 'GET') {
        if (!env.FX_SCORES) return json({ configured: false, reason: 'KV not bound' });
        try {
          const raw = await env.FX_SCORES.get('tg_config');
          if (!raw) return json({ configured: false });
          const cfg = JSON.parse(raw);
          return json({ configured: !!(cfg.token && cfg.chatId), chatId: cfg.chatId ?? null });
        } catch(e) {
          return json({ configured: false, reason: e.message });
        }
      }

      // -- /api/telegram/config PUT -----------------------------
      // Saves Telegram bot token + chat ID to KV.
      // Body: { token, chatId }
      if (path === '/api/telegram/config' && request.method === 'PUT') {
        if (!env.FX_SCORES) return err('KV not bound', 503);
        try {
          const body = await request.json();
          if (!body.token || !body.chatId) return err('token and chatId required', 400);
          await env.FX_SCORES.put('tg_config', JSON.stringify({
            token:  body.token.trim(),
            chatId: body.chatId.trim(),
          }));
          return json({ ok: true });
        } catch(e) {
          return err('Failed to save Telegram config: ' + e.message);
        }
      }

      // -- /api/telegram POST -----------------------------------
      // Sends a message via the configured Telegram bot.
      // Body: { message, parseMode? }
      // Reads bot token + chat ID from KV — never exposed to the browser.
      if (path === '/api/telegram' && request.method === 'POST') {
        if (!env.FX_SCORES) return err('KV not bound', 503);
        try {
          const raw = await env.FX_SCORES.get('tg_config');
          if (!raw) return json({ ok: false, error: 'Telegram not configured — add bot token and chat ID via the alert settings modal' });
          const cfg = JSON.parse(raw);
          if (!cfg.token || !cfg.chatId) return json({ ok: false, error: 'Telegram config incomplete' });

          const body = await request.json();
          const message   = body.message ?? '';
          const parseMode = body.parseMode ?? 'HTML';

          if (!message) return err('message required', 400);

          const tgRes = await fetch(`https://api.telegram.org/bot${cfg.token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              chat_id:    cfg.chatId,
              text:       message,
              parse_mode: parseMode,
            }),
          });
          const tgData = await tgRes.json();
          if (!tgData.ok) return json({ ok: false, error: tgData.description ?? 'Telegram API error' });
          return json({ ok: true });
        } catch(e) {
          return err('Telegram send error: ' + e.message);
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

        const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; MacroRangeDashboard)', cache: 'no-store' };
        const merged = {};
        const errors = [];

        // FX (TFF report — also covers NAS100 if equity URL not separate)
        if (urls.fx) {
          try {
            const res = await fetch(urls.fx, { headers: { 'User-Agent': UA['User-Agent'] }, cache: 'no-store' });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            Object.assign(merged, parseCFTCFile(await res.text()));
          } catch(e) { errors.push(`FX: ${e.message}`); }
        }

        // Equity (TFF report — only fetch separately if URL differs from fx)
        if (urls.equity && urls.equity !== urls.fx) {
          try {
            const res = await fetch(urls.equity, { headers: { 'User-Agent': UA['User-Agent'] }, cache: 'no-store' });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const eqData = parseCFTCFile(await res.text());
            // Merge only equity symbols to avoid overwriting FX data
            if (eqData['NAS100_USD']) merged['NAS100_USD'] = eqData['NAS100_USD'];
          } catch(e) { errors.push(`Equity: ${e.message}`); }
        }

        // Gold (Disaggregated report)
        if (urls.gold) {
          try {
            const res = await fetch(urls.gold, { headers: { 'User-Agent': UA['User-Agent'] }, cache: 'no-store' });
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

      // -- /api/spread ------------------------------------------
      // Live bid/ask spread from OANDA pricing endpoint.
      // Query: ?symbol=EUR_USD  (underscore format)
      // Returns { symbol, bid, ask, spread, spreadPips, timestamp }
      // No caching - always fetched live for session quality gating.
      // Requires: OANDA_KEY, OANDA_ACCOUNT_ID, OANDA_ENV env vars.
      if (path === '/api/spread') {
        if (!env.OANDA_KEY)        return json({ error: 'spread_unavailable', reason: 'OANDA_KEY not set' });
        if (!env.OANDA_ACCOUNT_ID) return json({ error: 'spread_unavailable', reason: 'OANDA_ACCOUNT_ID not set' });

        const spreadSym = url.searchParams.get('symbol'); // EUR_USD format
        if (!spreadSym) return err('symbol param required', 400);

        // Pip size per symbol for spread conversion.
        // XAU_USD uses raw dollar value (1.0) so spreadPips = dollar spread.
        const SPREAD_PIP_SIZES = {
          'EUR_USD': 0.0001,
          'GBP_USD': 0.0001,
          'USD_JPY': 0.01,
          'AUD_USD': 0.0001,
          'XAU_USD': 1.0,
          'EUR_GBP': 0.0001,
          'USD_CAD': 0.0001,
          'USD_CHF': 0.0001,
          'GBP_JPY': 0.01,
        };
        const spreadPipSize = SPREAD_PIP_SIZES[spreadSym] || 0.0001;

        const spreadBase = env.OANDA_ENV === 'practice'
          ? 'https://api-fxpractice.oanda.com'
          : 'https://api-fxtrade.oanda.com';

        try {
          const spreadRes = await fetch(
            `${spreadBase}/v3/accounts/${env.OANDA_ACCOUNT_ID}/pricing?instruments=${encodeURIComponent(spreadSym)}`,
            { headers: { 'Authorization': `Bearer ${env.OANDA_KEY}` } }
          );
          if (!spreadRes.ok) return json({ error: 'spread_unavailable', reason: `OANDA ${spreadRes.status}` });
          const spreadData = await spreadRes.json();
          const priceEntry = spreadData.prices?.[0];
          if (!priceEntry) return json({ error: 'spread_unavailable', reason: 'No price data' });

          const bid = parseFloat(priceEntry.bids?.[0]?.price ?? 0);
          const ask = parseFloat(priceEntry.asks?.[0]?.price ?? 0);
          const rawSpread = ask - bid;
          const spreadPips = parseFloat((rawSpread / spreadPipSize).toFixed(2));

          return json({
            symbol:     spreadSym,
            bid,
            ask,
            spread:     rawSpread,
            spreadPips,
            timestamp:  priceEntry.time || new Date().toISOString(),
          });
        } catch(e) {
          return json({ error: 'spread_unavailable', reason: e.message });
        }
      }

      // -- /api/state -------------------------------------------
      // Aggregates bot_config + regime_snapshot from KV for the Python bot.
      // GET returns { bot_config, regime_snapshot: { pushed_at, fred, pairs } }
      if (path === '/api/state' && request.method === 'GET') {
        if (!env.FX_SCORES) return json({ error: 'KV not configured' }, 500);

        const ALL_PAIRS = [
          'EUR/USD','GBP/USD','USD/JPY','AUD/USD','XAU/USD',
          'EUR/GBP','USD/CAD','USD/CHF','GBP/JPY','NAS100_USD',
        ];
        const BOT_CONFIG_DEFAULT = {
          kill_switch: false,
          enabled_pairs: ['EUR/USD','GBP/USD','USD/JPY','AUD/USD','XAU/USD'],
          modules: { macro_regime:true, vol_gate:true, confluence:true, oi_walls:true, cot_filter:false, news_risk:false },
          execution: {
            tier:'balanced', bardir:'auto', wtthreshold:35,
            min_macro_score:5, min_stars:3, min_agree:3, max_trades:2, composite_threshold:0.60, prox_pips:8,
            tp1r:0.3, tp2r:1.0, trailoffset:0.7,
            max_spread_pips:3.0,
            ddlimit:3, monthlydd:5, lockout:3, cooldown:60, sizing:1.0,
          },
          position: { risk_pct:1.0, vol_high_mult:0.5, vol_low_mult:1.2 },
          sl_tp: { sl_method:'structure', tp_method:'confluence', sl_atr_mult:1.5, tp1_close_pct:50, max_sl_pips:50, max_tp_pips:100, max_lot:5.0 },
          safety: { trade_window_start:'06:05', trade_window_end:'21:00' },
          oi_walls: { oi_wall_pips:15 },
        };

        const safeParse = raw => { try { return raw ? JSON.parse(raw) : null; } catch(e) { return null; } };

        const [botConfigRaw, fredRaw, cotRaw, oiRaw, sentRaw, eventsRaw] = await Promise.all([
          env.FX_SCORES.get('bot_config').catch(() => null),
          env.FX_SCORES.get('fred').catch(() => null),
          env.FX_SCORES.get('cot_data').catch(() => null),
          env.FX_SCORES.get('oi_store').catch(() => null),
          env.FX_SCORES.get('sentiment').catch(() => null),
          env.FX_SCORES.get('events_today').catch(() => null),
        ]);

        // KV stores { data: <config>, timestamp } — unwrap before use.
        const botConfigParsed = safeParse(botConfigRaw);
        const botConfig = botConfigParsed?.data ?? botConfigParsed ?? BOT_CONFIG_DEFAULT;
        const fredData   = safeParse(fredRaw);
        const cotData    = safeParse(cotRaw);
        const oiStore    = safeParse(oiRaw);
        const sentData   = safeParse(sentRaw);

        const enabledPairs = botConfig.enabled_pairs ?? ALL_PAIRS;
        const entryFetches = await Promise.all(
          enabledPairs.map(async pair => {
            const raw = await env.FX_SCORES.get(`ai_entries_${pair.replace('/','')}`).catch(() => null);
            return [pair, safeParse(raw)];
          })
        );

        let pushedAt = null;
        const pairSnapshots = {};
        for (const [pair, entryData] of entryFetches) {
          const pairKey = pair.replace('/','');
          const ts = entryData?.timestamp ?? null;
          if (ts && (!pushedAt || ts > pushedAt)) pushedAt = ts;
          // Two storage formats — server (levels.js) writes { data: [...] },
          // browser writes { data: { entries: [...], meta: {} } }. Handle both.
          const rawEntries = Array.isArray(entryData?.data)
            ? entryData.data
            : (entryData?.data?.entries ?? []);
          pairSnapshots[pair] = {
            entries_pushed_at: ts ? new Date(ts).toISOString() : null,
            entries:      rawEntries,
            entries_meta: entryData?.data?.meta ?? {},
            cot:          cotData?.data?.[pair]  ?? null,
            oi:           oiStore?.[pair]         ?? null,
            sentiment:    sentData?.[pairKey]     ?? null,
          };
        }

        return json({
          bot_config: botConfig,
          events_today: safeParse(eventsRaw) ?? [],
          regime_snapshot: {
            pushed_at: pushedAt ? new Date(pushedAt).toISOString() : null,
            fred:  fredData?.data ?? null,
            pairs: pairSnapshots,
          },
        });
      }

      // -- /api/refresh ----------------------------------------
      // Called by the Python bot when KV entry data is stale (no browser open).
      // Touches the timestamp on all ai_entries_* KV keys so the bot's staleness
      // gate passes. Entry price levels (Fib, structure) are valid intraday.
      if (path === '/api/refresh' && request.method === 'POST') {
        if (!env.FX_SCORES) return json({ error: 'KV not configured' }, 500);

        const bcRaw = await env.FX_SCORES.get('bot_config').catch(() => null);
        const bc = bcRaw ? JSON.parse(bcRaw) : null;
        const pairs = bc?.data?.enabled_pairs ?? ['EUR/USD','GBP/USD','USD/JPY','AUD/USD','XAU/USD'];

        const now = Date.now();
        const refreshed = [], missing = [];

        for (const pair of pairs) {
          const key = `ai_entries_${pair.replace('/', '')}`;
          const raw = await env.FX_SCORES.get(key).catch(() => null);
          if (!raw) { missing.push(pair); continue; }
          try {
            const parsed = JSON.parse(raw);
            parsed.timestamp = now;
            await env.FX_SCORES.put(key, JSON.stringify(parsed));
            refreshed.push(pair);
          } catch(e) { missing.push(pair); }
        }

        return json({ ok: true, refreshed, missing, touched_at: new Date(now).toISOString() });
      }

      // -- /api/bot/status -------------------------------------
      // Python bot reports runtime status back to the dashboard (5-min TTL).
      // PUT { loop_at, paper, pairs_evaluated, errors }
      if (path === '/api/bot/status' && request.method === 'PUT') {
        if (!env.FX_SCORES) return json({ error: 'KV not configured' }, 500);
        let body;
        try { body = await request.json(); } catch(e) { return err('Invalid JSON body', 400); }
        await env.FX_SCORES.put('bot_status', JSON.stringify({ data: body, timestamp: Date.now() }), { expirationTtl: 300 });
        return json({ ok: true });
      }

      // -- /api/sentiment ---------------------------------------
      // Myfxbook community outlook - retail long/short positioning.
      // Returns all 5 main pairs in one call. Cached in KV for 30 min.
      // Requires: MYFXBOOK_SESSION env var (refresh monthly via browser login).
      if (path === '/api/sentiment') {
        if (!env.MYFXBOOK_SESSION) return json({ error: 'sentiment_unavailable', reason: 'MYFXBOOK_SESSION not set' });

        const SENTIMENT_TTL_MS = 30 * 60 * 1000; // 30 min

        // Check KV cache first
        if (env.FX_SCORES) {
          try {
            const cached = await env.FX_SCORES.get('sentiment');
            if (cached) {
              const parsed = JSON.parse(cached);
              if (parsed.savedAt && (Date.now() - parsed.savedAt) < SENTIMENT_TTL_MS) {
                return json(parsed);
              }
            }
          } catch(e) {}
        }

        const MYFXB_PAIRS = ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'XAUUSD'];

        try {
          const mfxRes = await fetch(
            `https://www.myfxbook.com/api/get-community-outlook.json?session=${encodeURIComponent(env.MYFXBOOK_SESSION)}`,
            { headers: { 'User-Agent': 'MacroFXDashboard/1.0' } }
          );
          if (!mfxRes.ok) return json({ error: 'sentiment_unavailable', reason: `Myfxbook ${mfxRes.status}` });
          const mfxData = await mfxRes.json();

          if (mfxData.error === true || mfxData.error === 'true') {
            return json({ error: 'sentiment_unavailable', reason: mfxData.message || 'Session error - refresh MYFXBOOK_SESSION' });
          }

          const symbols = mfxData.symbols?.symbol || [];
          const result = {};

          for (const sym of symbols) {
            const name = sym.name;
            if (!MYFXB_PAIRS.includes(name)) continue;

            const longPct  = parseFloat(sym.longPercentage  || sym.longsPercent  || 0) || 0;
            const shortPct = parseFloat(sym.shortPercentage || sym.shortsPercent || 0) || 0;
            const longVol  = parseFloat(sym.longVolume  || 0) || 0;
            const shortVol = parseFloat(sym.shortVolume || 0) || 0;
            const longPos  = parseInt(sym.longPositions  || 0) || 0;
            const shortPos = parseInt(sym.shortPositions || 0) || 0;
            const avgLongPrice  = parseFloat(sym.avgLongPrice  || 0) || null;
            const avgShortPrice = parseFloat(sym.avgShortPrice || 0) || null;

            const domPct   = Math.max(longPct, shortPct);
            const sentiment = longPct >= 65 ? 'LONG_HEAVY' : shortPct >= 65 ? 'SHORT_HEAVY' : 'BALANCED';
            const crowding  = domPct >= 75 ? 'EXTREME' : domPct >= 65 ? 'STRONG' : domPct >= 55 ? 'MODERATE' : 'BALANCED';

            result[name] = {
              longPct, shortPct,
              longVolume: longVol, shortVolume: shortVol,
              longPositions: longPos, shortPositions: shortPos,
              avgLongPrice, avgShortPrice,
              sentiment, crowding,
            };
          }

          const payload = { ...result, savedAt: Date.now() };

          if (env.FX_SCORES) {
            env.FX_SCORES.put('sentiment', JSON.stringify(payload), { expirationTtl: 3600 }).catch(() => {});
          }

          return json(payload);
        } catch(e) {
          return json({ error: 'sentiment_unavailable', reason: e.message });
        }
      }

      // -- /api/regime-candles ---------------------------------
      // Historical OANDA M5 candles for the regime viewer.
      // GET ?pair=EUR/USD&from=2026-05-26&to=2026-06-04
      // Returns [{time(epoch s), open, high, low, close}, ...]  newest-last.
      if (path === '/api/regime-candles') {
        if (!env.OANDA_KEY) return err('OANDA_KEY not configured', 503);
        const pair = url.searchParams.get('pair');
        const from = url.searchParams.get('from');
        const to   = url.searchParams.get('to');
        if (!pair) return err('pair param required', 400);

        const instrument = pair.replace('/', '_');
        const oandaBase  = env.OANDA_ENV === 'practice'
          ? 'https://api-fxpractice.oanda.com'
          : 'https://api-fxtrade.oanda.com';

        // OANDA: count must NOT be specified when both from and to are given.
        let oandaUrl = `${oandaBase}/v3/instruments/${encodeURIComponent(instrument)}/candles?granularity=M5&price=M`;
        if (from && to) {
          oandaUrl += `&from=${encodeURIComponent(new Date(from).toISOString())}`;
          oandaUrl += `&to=${encodeURIComponent(new Date(to + 'T23:59:59Z').toISOString())}`;
        } else {
          oandaUrl += `&count=4800`;
          if (from) oandaUrl += `&from=${encodeURIComponent(new Date(from).toISOString())}`;
          if (to)   oandaUrl += `&to=${encodeURIComponent(new Date(to + 'T23:59:59Z').toISOString())}`;
        }

        const res = await fetch(oandaUrl, {
          headers: { 'Authorization': `Bearer ${env.OANDA_KEY}` },
          signal: AbortSignal.timeout(25_000),
        });
        if (!res.ok) {
          const errText = await res.text().catch(() => 'OANDA error');
          return err(`OANDA candles failed (${res.status}): ${errText.slice(0, 200)}`, 502);
        }
        const data = await res.json();
        if (!data.candles) return err('No candles returned', 502);

        const candles = data.candles
          .filter(c => c.mid)
          .map(c => ({
            time:  Math.floor(new Date(c.time).getTime() / 1000),
            open:  parseFloat(c.mid.o),
            high:  parseFloat(c.mid.h),
            low:   parseFloat(c.mid.l),
            close: parseFloat(c.mid.c),
          }))
          .sort((a, b) => a.time - b.time);

        return json(candles);
      }

      // -- /api/regime-append ----------------------------------
      // Bots POST their per-cycle state here.
      // Body: { bot:"v1"|"v2", ts:epoch_s, states:[{pair,regime,conf,vz,rl,decay,...}], events:[{pair,type,...}] }
      // Stored as rolling arrays in KV: rgv1_{pairsafe} / rgv2_{pairsafe}
      // Each key holds up to MAX_RECORDS state records + MAX_EVENTS events.
      if (path === '/api/regime-append' && request.method === 'POST') {
        if (!env.FX_SCORES) return err('KV not bound', 503);
        let body;
        try { body = await request.json(); } catch(e) { return err('Invalid JSON', 400); }

        const bot    = body.bot === 'v1' ? 'v1' : 'v2';
        const states = Array.isArray(body.states) ? body.states : [];
        const events = Array.isArray(body.events) ? body.events : [];
        const ts     = body.ts || Math.floor(Date.now() / 1000);

        const MAX_RECORDS = 5760;  // 48h at 30s, or 96h at 60s
        const MAX_EVENTS  = 2000;

        const pairSafe = p => p.replace('/', '').replace('_', '').toLowerCase();

        const updated = [];
        for (const state of states) {
          if (!state.pair) continue;
          const kvKey = `rg${bot}_${pairSafe(state.pair)}`;
          let existing = { records: [], events: [] };
          try {
            const raw = await env.FX_SCORES.get(kvKey);
            if (raw) existing = JSON.parse(raw);
          } catch {}

          // Append new record (add ts if missing)
          const rec = { ...state, ts: state.ts || ts };
          delete rec.pair;
          existing.records.push(rec);
          if (existing.records.length > MAX_RECORDS) {
            existing.records = existing.records.slice(-MAX_RECORDS);
          }

          // Append matching events for this pair
          const pairEvents = events.filter(e => e.pair === state.pair).map(e => ({ ...e, ts: e.ts || ts }));
          if (pairEvents.length) {
            existing.events.push(...pairEvents);
            if (existing.events.length > MAX_EVENTS) {
              existing.events = existing.events.slice(-MAX_EVENTS);
            }
          }

          await env.FX_SCORES.put(kvKey, JSON.stringify(existing));
          updated.push(state.pair);
        }
        return json({ ok: true, bot, updated, ts });
      }

      // -- /api/regime-backfill --------------------------------
      // Parse script POSTs bulk historical data for one pair at a time.
      // Body: { bot:"v1"|"v2", pair:"EUR/USD", records:[...], events:[...] }
      // Merges with existing KV data (appends, deduplicates by ts, sorts).
      if (path === '/api/regime-backfill' && request.method === 'POST') {
        if (!env.FX_SCORES) return err('KV not bound', 503);
        let body;
        try { body = await request.json(); } catch(e) { return err('Invalid JSON', 400); }

        const bot    = body.bot === 'v1' ? 'v1' : 'v2';
        const pair   = body.pair;
        const newRec = Array.isArray(body.records) ? body.records : [];
        const newEvt = Array.isArray(body.events)  ? body.events  : [];
        if (!pair) return err('pair required', 400);

        const pairSafe = pair.replace('/', '').replace('_', '').toLowerCase();
        const kvKey    = `rg${bot}_${pairSafe}`;

        let existing = { records: [], events: [] };
        try {
          const raw = await env.FX_SCORES.get(kvKey);
          if (raw) existing = JSON.parse(raw);
        } catch {}

        // Merge + dedupe records by ts
        const recMap = new Map();
        for (const r of [...existing.records, ...newRec]) recMap.set(r.ts, r);
        const records = [...recMap.values()].sort((a, b) => a.ts - b.ts);

        // Merge + dedupe events by ts+type+pair
        const evtMap = new Map();
        for (const e of [...existing.events, ...newEvt]) evtMap.set(`${e.ts}_${e.type}_${e.pair || pair}`, e);
        const events = [...evtMap.values()].sort((a, b) => a.ts - b.ts);

        await env.FX_SCORES.put(kvKey, JSON.stringify({ records, events }));
        return json({ ok: true, bot, pair, records: records.length, events: events.length });
      }

      // -- /api/regime-history ---------------------------------
      // Viewer fetches per-pair regime data.
      // GET ?bot=v1&pair=eurusd&from=epoch_s&to=epoch_s
      // Returns { pair, bot, records:[...], events:[...] }
      if (path === '/api/regime-history') {
        if (!env.FX_SCORES) return err('KV not bound', 503);
        const bot      = url.searchParams.get('bot') === 'v1' ? 'v1' : 'v2';
        const pairSafe = (url.searchParams.get('pair') || 'eurusd').toLowerCase();
        const fromTs   = parseInt(url.searchParams.get('from') || '0');
        const toTs     = parseInt(url.searchParams.get('to')   || '9999999999');

        const kvKey = `rg${bot}_${pairSafe}`;
        let data = { records: [], events: [] };
        try {
          const raw = await env.FX_SCORES.get(kvKey);
          if (raw) data = JSON.parse(raw);
        } catch {}

        const records = data.records.filter(r => r.ts >= fromTs && r.ts <= toTs);
        const events  = data.events.filter(e => e.ts  >= fromTs && e.ts  <= toTs);

        return json({ bot, pair: pairSafe, records, events });
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
