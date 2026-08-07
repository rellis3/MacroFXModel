import { resolveSmileExpiry, parseIVSettlement, parseOIMatrix } from '../../js/oi.js';
const r = await fetch('https://macrofxmodel-production.up.railway.app/api/kv/get?key=oi_store');
const d = (await r.json()).data;
console.log('sym          walls-from      smile-should-be   smile-box-holds   verdict');
for (const [sym, e] of Object.entries(d)) {
  const m = parseOIMatrix(e.rawOI || '');
  const hint = resolveSmileExpiry(e.rawOI || '', e.rawIVTerm || '', { haveSmile: !!e.rawIV });
  const iv = e.rawIV ? parseIVSettlement(e.rawIV) : null;
  const held = iv?.expiryCode || (iv ? `(no code, ${iv.dte} DTE)` : '(none)');
  const want = hint?.code || `(${hint?.dte ?? '?'} DTE)`;
  const wallsDte = m?.primaryExpiry?.dte ?? '?';
  let verdict = '?';
  if (!iv) verdict = 'NO SMILE PASTED';
  else if (iv.expiryCode && hint?.code) verdict = iv.expiryCode === hint.code ? 'match' : 'MISMATCH';
  else if (Number.isFinite(iv.dte) && Number.isFinite(hint?.matchedDte))
    verdict = Math.abs(iv.dte - hint.matchedDte) <= 2 ? 'match (by dte)' : 'MISMATCH (by dte)';
  console.log(`${sym.padEnd(12)} ${String(wallsDte+' DTE').padEnd(15)} ${String(want).padEnd(17)} ${String(held).padEnd(17)} ${verdict}`);
}
