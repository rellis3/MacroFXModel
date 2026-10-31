import { DESK_EVIDENCE } from '/home/user/MacroFXModel/js/deskEvidence.js';
import fs from 'fs';
const ids = fs.readFileSync(process.argv[2],'utf8').trim().split('\n').map(l=>l.split('\t')[0]);
for (const id of ids){ const e=DESK_EVIDENCE.find(x=>x.id===id); console.log('=== '+id+' | '+e.doc+'\nRESULT: '+e.result+'\nUSE: '+e.use+'\n'); }
