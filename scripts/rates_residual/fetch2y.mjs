import fs from 'fs';
import { parseBubaCsv, parseBoeCsv } from '../../js/intlYields.js';
const UA = { 'User-Agent': 'Mozilla/5.0' };
const t = async u => { const r = await fetch(u, { headers: UA }); return r.text(); };
const out = 'analysis/output/policy_direction/';
const de = parseBubaCsv(await t('https://api.statistiken.bundesbank.de/rest/download/BBSIS/D.I.ZAR.ZI.EUR.S1311.B.A604.R02XX.R.A.A._Z._Z.A?format=csv&lang=en'));
console.log('DE2Y', de.length, de[0], de.at(-1));
fs.writeFileSync(out + 'DE2Y.csv', 'date,value\n' + de.map(o => `${o.date},${o.value}`).join('\n'));
for (const code of ['IUDSNZC', 'IUDMNZC']) {
  const gb = parseBoeCsv(await t(`https://www.bankofengland.co.uk/boeapps/database/_iadb-fromshowcolumns.asp?csv.x=yes&Datefrom=01/Jan/2010&Dateto=now&SeriesCodes=${code}&CSVF=TN&UsingCodes=Y&VPD=Y&VFD=N`));
  console.log(code, gb.length, gb[0], gb.at(-1));
}
