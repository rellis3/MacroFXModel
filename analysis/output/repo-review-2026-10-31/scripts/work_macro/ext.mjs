import fs from 'fs';
const src=fs.readFileSync('/home/user/MacroFXModel/js/deskEvidence.js','utf8');
const ids=fs.readFileSync('../audit_macro.tsv','utf8').trim().split('\n').map(l=>l.split('\t')[0]);
for(const id of ids){const i=src.indexOf(`id: '${id}'`); if(i<0){console.log('MISSING',id);continue;}
 const j=src.indexOf("\n  },",i); console.log('=== '+id+'\n'+src.slice(i,j).replace(/\n\s+/g,' ')+'\n');}
