import * as m from '/home/user/MacroFXModel/js/deskEvidence.js';
import fs from 'fs';
const ids = fs.readFileSync(process.argv[2],'utf8').trim().split('\n').map(l=>l.split('\t')[0]);
const arr = Object.values(m).find(v=>Array.isArray(v) && v.length>100 && v[0].id);
for (const id of ids){ const e=arr.find(x=>x.id===id); console.log('=== '+id+' | '+e.verdict+' | '+e.doc+'\nRESULT: '+e.result+'\nUSE: '+e.use+'\n'); }
