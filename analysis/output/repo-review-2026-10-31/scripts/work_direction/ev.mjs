import { DESK_EVIDENCE } from '/home/user/MacroFXModel/js/deskEvidence.js';
const pats = process.argv.slice(2);
for (const e of DESK_EVIDENCE) {
  if (pats.some(p => e.id.includes(p))) console.log(JSON.stringify({id:e.id,v:e.verdict,date:e.date,doc:e.doc,claim:e.claim,result:e.result,use:e.use}),'\n');
}
console.log('total', DESK_EVIDENCE.length);
