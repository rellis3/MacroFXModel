/**
 * Rescue the finished part of a JSON object a model was cut off in the middle of writing.
 *
 * WHY. A long brief written by a verbose model (Anthropic's Opus-class one) can run past its output limit. The reply then stops mid-sentence, the JSON
 * does not parse, and the whole brief, minutes of work that is paid for by the token, was thrown away with "response truncated, try again". The brief's
 * sections are written in a fixed order and the last ones (the per-market reads, the newsletter letter) are the least critical, so what is usually
 * lost is the tail. This keeps every top-level section that was COMPLETE and drops the one that was being written when the model stopped.
 *
 * It never invents or completes text: it cuts back to the last comma at the top level of the object and closes the brace. If nothing complete is left
 * it returns null and the caller reports the truncation as before.
 *
 * Pure. Tested in js/jsonSalvage.test.mjs.
 */
export function salvageTopLevel(text) {
  const t = String(text ?? ''), start = t.indexOf('{');
  if (start < 0) return null;
  let depth = 0, inStr = false, esc = false, lastComma = -1;
  for (let i = start; i < t.length; i++) {
    const ch = t[i];
    if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true;
    else if (ch === '{' || ch === '[') depth++;
    else if (ch === '}' || ch === ']') { depth--; if (depth === 0) { try { return { obj: JSON.parse(t.slice(start, i + 1)), cut: false }; } catch { return null; } } }
    else if (ch === ',' && depth === 1) lastComma = i;
  }
  if (lastComma < 0) return null;
  try { const obj = JSON.parse(t.slice(start, lastComma) + '}'); return { obj, cut: true }; } catch { return null; }
}
