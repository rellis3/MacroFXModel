// Shared mutable state singleton.
// All modules import { S } from './state.js' and mutate S.xxx directly.
// Using an object (not individual exports) so mutations are visible across modules.
export const S = {
  currentPair:     null,   // set to PAIRS[0] by main.js on init
  currentMode:     'strongest',
  fredData:        null,
  ohlcData:        {},
  ohlc5m:          {},
  ohlc30m:         {},
  asiaRangeData:   {},
  mondayRangeData: {},
  compassData:     {},
  compassMode:     'both', // '2y' | '10y' | 'both'
  _caps:           null,   // proximity caps loaded from KV
  cotData:         null,   // parsed CFTC COT data keyed by pair
};
