import { S } from './state.js';
import { getPipSize, pipsBetween } from './utils.js';
import { getAnchorPrice, directionFromPrice } from './ranges.js';
import { getCaps } from './caps.js';
import { calcPositionSize } from './vol.js';
import { oiLoadStore } from './oi.js';

export function filterConfluences(confluences) {
  if (S.currentMode === 'strongest') return confluences.filter(c => c.isTight);
  return confluences;
}

export function enhanceConfluences(confluences, currentPrice, bias, pivots, volRegime, macroScore) {
  const symbol = S.currentPair.symbol;
  const pipSize = getPipSize(symbol);
  const atr = volRegime.atr;

  const anchorPrice = getAnchorPrice(symbol);

  const sortedByPrice = [...confluences].sort((a, b) => a.price - b.price);

  // Phase 3: OI proximity caps — same formula as entry scanner
  const _oiCaps    = getCaps(symbol);
  const _oiIsGold  = pipSize >= 0.1 && symbol.includes('XAU');
  const _oiPipMult = _oiIsGold ? 1.0 : pipSize;
  const oiCapDist  = Math.min(atr * _oiCaps.oiAtrFrac,  _oiCaps.oiPipCap  * _oiPipMult);
  const gexCapDist = Math.min(atr * _oiCaps.gexAtrFrac, _oiCaps.gexPipCap * _oiPipMult);
  const rngCapDist = Math.min(atr * _oiCaps.rngAtrFrac, _oiCaps.rngPipCap * _oiPipMult);
  const _oiData       = oiLoadStore()[symbol] || null;
  const _dailyOpenPx  = S.sessionData?.dailyOpenPrice ?? null;

  return confluences.map(c => {
    const direction = directionFromPrice(c.price, anchorPrice, symbol);
    const distance = pipsBetween(currentPrice, c.price, symbol);

    const aligned = direction != null && (
      (direction === 'short' && bias === 'SHORT') ||
      (direction === 'long'  && bias === 'LONG')
    );

    const _enhCaps   = getCaps(symbol);
    const _isGoldEnh = pipSize >= 0.1 && symbol.includes('XAU');
    const pivotCapPrice = _isGoldEnh
      ? Math.min(atr * _enhCaps.enhPivAtrFrac, _enhCaps.enhPivPipCap * 1.0)
      : Math.min(atr * _enhCaps.enhPivAtrFrac, _enhCaps.enhPivPipCap * pipSize);

    let pivotMatch = null;
    let _pivBestDist = Infinity;
    Object.entries(pivots).forEach(([key, val]) => {
      if (!val || isNaN(val)) return;
      const dist = Math.abs(c.price - val);
      if (dist <= pivotCapPrice && dist < _pivBestDist) {
        pivotMatch = key.toUpperCase();
        _pivBestDist = dist;
      }
    });

    // Phase 3: OI level within proximity boosts star rating
    let oiMatch = null;
    if (_oiData) {
      if (Math.abs(c.price - _oiData.callWall) <= oiCapDist) oiMatch = 'Call Wall';
      else if (Math.abs(c.price - _oiData.putWall) <= oiCapDist) oiMatch = 'Put Wall';
      else if (Math.abs(c.price - _oiData.maxPain) <= oiCapDist) oiMatch = 'Max Pain';
      if (!oiMatch && _oiData.gexProfile && _oiData.gexProfile.length > 1) {
        for (let i = 1; i < _oiData.gexProfile.length; i++) {
          if (Math.sign(_oiData.gexProfile[i].netGex) !== Math.sign(_oiData.gexProfile[i-1].netGex)) {
            if (Math.abs(c.price - _oiData.gexProfile[i].strike) <= gexCapDist) {
              oiMatch = 'Gamma Flip'; break;
            }
          }
        }
      }
    }

    const nearDailyOpen = _dailyOpenPx != null && Math.abs(c.price - _dailyOpenPx) <= rngCapDist;

    let stars = 1;
    if (c.isTight)             stars++;
    if (aligned)               stars++;
    if (pivotMatch)            stars++;
    if (oiMatch)               stars++;  // Phase 3: OI wall / gamma flip confluence
    if (nearDailyOpen)         stars++;  // Fib near daily open (23:00 candle)
    if ((c.density || 1) >= 2) stars++;  // density bonus: 2+ fib pairs collapsed here

    const baseSize = calcPositionSize(macroScore, volRegime);
    const sizeAdj = aligned ? 1 : 0.5;
    const finalSize = Math.round(baseSize * sizeAdj);

    const stopDist = volRegime.stopDist || atr * 1.0;

    const remaining = volRegime.remainingRange || atr;
    const tpCap     = remaining * 0.85;

    let tp = null, tpDist = null, tpSource = 'ATR', tpCapped = false;

    if (direction === 'long') {
      const nextConf = sortedByPrice.find(other =>
        other.price > c.price + stopDist * 0.5 && other !== c
      );
      if (nextConf) {
        const confDist = nextConf.price - c.price;
        if (confDist <= tpCap) {
          tp = nextConf.price;
          tpDist = confDist;
          tpSource = 'Next confluence';
        }
      }
    } else if (direction === 'short') {
      const nextConf = [...sortedByPrice].reverse().find(other =>
        other.price < c.price - stopDist * 0.5 && other !== c
      );
      if (nextConf) {
        const confDist = c.price - nextConf.price;
        if (confDist <= tpCap) {
          tp = nextConf.price;
          tpDist = confDist;
          tpSource = 'Next confluence';
        }
      }
    }

    if (tp == null && direction != null) {
      const tpRaw = stopDist * (volRegime.tpMult || 1.5);
      tpDist  = Math.min(tpRaw, tpCap);
      tpCapped = tpDist < tpRaw;
      tpSource = tpCapped ? 'Vol cap' : 'ATR';
      tp = direction === 'long' ? c.price + tpDist : c.price - tpDist;
    }

    const rrRaw  = stopDist > 0 && tpDist != null ? (tpDist / stopDist) : 0;
    const poorRR = rrRaw < 1.0;

    return {
      ...c,
      direction,
      distance,
      aligned,
      pivotMatch,
      oiMatch,
      nearDailyOpen,
      stars,
      size: finalSize,
      sl: direction === 'long'  ? c.price - stopDist :
          direction === 'short' ? c.price + stopDist : null,
      tp,
      tpSource,
      stopPips:  stopDist / pipSize,
      tpPips:    tpDist != null ? tpDist / pipSize : 0,
      tpCapped,
      poorRR,
      rrRaw:     rrRaw.toFixed(1),
    };
  });
}
