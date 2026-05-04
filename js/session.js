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

export function sessionBadgeHTML(session) {
  if (!session) return '';
  const confPct   = Math.round(session.confidence * 100);
  const confColor = session.confidence >= 1.0  ? 'var(--green)'
                  : session.confidence >= 0.80  ? 'var(--amber)'
                  : 'var(--red)';
  const confLabel = session.confidence >= 1.0  ? 'High confidence'
                  : session.confidence >= 0.80  ? 'Moderate confidence'
                  : 'Low confidence — reduce size';

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
  </div>
</div>`;
}
