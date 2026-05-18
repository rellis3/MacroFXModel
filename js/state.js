// Shared mutable state singleton.
// All modules import { S } from './state.js' and mutate S.xxx directly.
// Using an object (not individual exports) so mutations are visible across modules.
export const S = {
  currentPair:     null,   // set to PAIRS[0] by main.js on init
  currentMode:     'all',
  fredData:        null,
  ohlcData:        {},
  ohlc5m:          {},
  ohlc30m:         {},
  asiaRangeData:      {},
  mondayRangeData:    {},
  structuralFibData:  {},
  compassData:     {},
  compassMode:     'both', // '2y' | '10y' | 'both'
  compassShowFX:   false,  // overlay normalized FX rate on compass chart
  _caps:           null,   // proximity caps loaded from KV
  cotData:         null,   // parsed CFTC COT data keyed by pair
  sessionData:     null,   // detectSession() result — current trading session
  dollarRegime:    null,   // computeDollarRegime() result — USD trend + strength
  usdStrength:     null,   // computeUSDStrength() — composite z-score from 4 USD pairs
  eventRisk:       null,   // { level, sizeMult, events, currencyRisk } — Finnhub events
  surpriseIndex:   null,   // { [currency]: score } — macro surprise per currency
  ecbData:         null,   // ECB SDW daily rates { estr, de10y_ecb }
  oandaBook:       {},     // Oanda positionBook sentiment per symbol { longPct, shortPct, sentiment }
  spreadData:      {},     // OANDA live spread per symbol { spreadPips, classification, bid, ask, timestamp }
  myfxSentiment:   {},     // Myfxbook community outlook per symbol (EURUSD key format)
  hasOanda:        false,  // true when OANDA_KEY is configured server-side
  hasMyfxbook:     false,  // true when MYFXBOOK_SESSION is configured server-side
  hmmRegimes:      {},     // { 'EUR/USD': { regime, trendDir, rangeProb, trendProb, computedAt } }
  goldModel:       null,   // computeGoldMacroModel() result — updated after FRED loads and on gold tab
  _goldVolRegime:  null,   // scratch slot: vol regime passed from vol.js into gold T1 calc
  goldHistory:     null,   // {tips,bei,dxy,vix,hy} arrays from fredhistory — enables accel + z-score
};
