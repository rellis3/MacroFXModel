// Trading session detection based on London local time.
// Confidence multiplier is applied by the entry scanner and AI snapshot.

const SESSIONS = {
  asia:      { name: 'Asia',        hours: [0, 6],    color: 'var(--blue)',  confidence: 0.75,
               desc: 'Low liquidity — tight ranges, directional moves less predictable' },
  prelondon: { name: 'Pre-London',  hours: [6, 8],    color: 'var(--amber)', confidence: 0.65,
               desc: 'Transitional — wait for London to set direction before entering' },
  london:    { name: 'London',      hours: [8, 13],   color: 'var(--green)', confidence: 1.0,
               desc: 'Peak liquidity — trend-following reliable, breakouts stick' },
  overlap:   { name: 'NY Overlap',  hours: [13, 17],  color: 'var(--green)', confidence: 1.1,
               desc: 'Maximum volume — strongest trending conditions, large moves common' },
  nyclose:   { name: 'NY Close',    hours: [17, 21],  color: 'var(--amber)', confidence: 0.85,
               desc: 'Position unwinding — reversions and fades more common than breakouts' },
  closed:    { name: 'Off-Hours',   hours: [21, 24],  color: 'var(--text3)', confidence: 0.60,
               desc: 'Very low liquidity — avoid new entries, tight stop exposure only' },
};

export function detectSession() {
  const nowLondon = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/London' }));
  const hour      = nowLondon.getHours();
  const mins      = nowLondon.getMinutes();
  const totalMins = hour * 60 + mins;

  let key;
  if      (totalMins <  360) key = 'asia';
  else if (totalMins <  480) key = 'prelondon';
  else if (totalMins <  780) key = 'london';
  else if (totalMins < 1020) key = 'overlap';
  else if (totalMins < 1260) key = 'nyclose';
  else                       key = 'closed';

  const s       = SESSIONS[key];
  const timeStr = nowLondon.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  return {
    key,
    name:       s.name,
    color:      s.color,
    confidence: s.confidence,
    desc:       s.desc,
    londonTime: timeStr,
  };
}

// Build an array of daily opens from daily OHLC bars (newest-first).
// Each daily bar's open = the 23:00 candle open for that trading day.
// Returns [{ date, price, label }] newest-first, up to `days` entries.
export function computeDailyOpens(ohlcBars, days = 30) {
  if (!ohlcBars || !ohlcBars.length) return [];
  const result = [];
  for (const bar of ohlcBars) {
    if (result.length >= days) break;
    const price = parseFloat(bar.open);
    if (isNaN(price)) continue;
    const date  = bar.datetime.substring(0, 10); // YYYY-MM-DD
    const d     = new Date(date + 'T12:00:00Z');  // noon UTC avoids DST boundary issues
    const label = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
    result.push({ date, price, label });
  }
  return result;
}

// Extract London open (08:00) and NY open (13:00) prices from today's 5m bars.
// bars5m is the .values array from TwelveData, ordered newest-first.
export function computeSessionOpens(bars5m) {
  if (!bars5m || !bars5m.length) return { londonOpenPrice: null, nyOpenPrice: null };

  const todayLondon = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
  let londonOpenPrice = null;
  let nyOpenPrice     = null;

  for (const bar of bars5m) {
    const barDate = bar.datetime.substring(0, 10);
    if (barDate < todayLondon) break; // gone past today (bars are newest-first)
    if (barDate !== todayLondon) continue;
    const hhmm = bar.datetime.substring(11, 16);
    if (!nyOpenPrice     && hhmm >= '13:00' && hhmm < '13:10') nyOpenPrice     = parseFloat(bar.open);
    if (!londonOpenPrice && hhmm >= '08:00' && hhmm < '08:10') londonOpenPrice = parseFloat(bar.open);
    if (londonOpenPrice && nyOpenPrice) break;
  }

  return { londonOpenPrice, nyOpenPrice };
}

export function sessionBadgeHTML(session, currentPrice) {
  if (!session) return '';
  const confPct   = Math.round(session.confidence * 100);
  const confColor = session.confidence >= 1.0  ? 'var(--green)'
                  : session.confidence >= 0.80  ? 'var(--amber)'
                  : 'var(--red)';
  const confLabel = session.confidence >= 1.0  ? 'High confidence'
                  : session.confidence >= 0.80  ? 'Moderate confidence'
                  : 'Low confidence — reduce size';

  let dailyOpenLine = '';
  if (session.dailyOpenPrice != null && currentPrice != null) {
    const above    = currentPrice > session.dailyOpenPrice;
    const doColor  = above ? 'var(--green)' : 'var(--red)';
    const doArrow  = above ? '↑' : '↓';
    const doPips   = Math.abs(currentPrice - session.dailyOpenPrice);
    dailyOpenLine  = `<div style="font-size:10px;margin-top:3px;color:var(--text3)">
      Daily open <span style="font-family:'DM Mono',monospace;color:var(--text2)">${session.dailyOpenPrice}</span>
      <span style="color:${doColor};font-weight:600;margin-left:4px">${doArrow} ${above ? 'above' : 'below'} · ${doColor === 'var(--green)' ? 'bullish' : 'bearish'} daily bias</span>
    </div>`;
  }

  return `
<div style="display:flex;align-items:flex-start;gap:10px;padding:9px 12px;background:var(--s2);border:1px solid var(--border);border-radius:7px;margin-bottom:10px">
  <div style="width:9px;height:9px;border-radius:50%;background:${session.color};flex-shrink:0;margin-top:3px"></div>
  <div style="flex:1;min-width:0">
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      <span style="font-size:11.5px;font-weight:700;color:var(--text1)">${session.name}</span>
      <span style="font-size:10px;color:var(--text3)">London ${session.londonTime}</span>
      <span style="font-size:10px;font-weight:600;color:${confColor};padding:1px 6px;border-radius:6px;background:${confColor}18;border:1px solid ${confColor}44">${confPct}% · ${confLabel}</span>
    </div>
    <div style="font-size:10px;color:var(--text3);margin-top:2px;line-height:1.4">${session.desc}</div>
    ${dailyOpenLine}
  </div>
</div>`;
}
