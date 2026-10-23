// Tests for js/jsonSalvage.js.   node js/jsonSalvage.test.mjs
import { salvageTopLevel } from './jsonSalvage.js';
let failures = 0;
const ok = (n, c, e = '') => { console.log(`  ${c ? '✓' : '✗ FAIL'} ${n}${e ? '  ' + e : ''}`); if (!c) failures++; };

const full = '{"headline":"H","driver":[{"what":"a, b","explain":"x"}],"sizing":"s","markets":[{"key":"NQ","read":"r"}],"letter":{"subject":"S"}}';
ok('a complete object comes back whole and is not marked cut', JSON.stringify(salvageTopLevel(full)) === JSON.stringify({ obj: JSON.parse(full), cut: false }));
const cutInLetter = '{"headline":"H","driver":[{"what":"a","explain":"x"}],"sizing":"s","markets":[{"key":"NQ","read":"r"}],"letter":{"subject":"The Nas';
const a = salvageTopLevel(cutInLetter);
ok('cut inside the last section: every earlier complete section is kept, the half-written one is dropped', a.cut === true && a.obj.headline === 'H' && a.obj.markets.length === 1 && !('letter' in a.obj) && a.obj.sizing === 's');
const cutInMarkets = '{"headline":"H","driver":[{"what":"a"}],"sizing":"s","markets":[{"key":"NQ","read":"r"},{"key":"SPX500","read":"half writ';
const b = salvageTopLevel(cutInMarkets);
ok('cut inside a list: the whole unfinished list is dropped, not a broken half of it', b.cut === true && !('markets' in b.obj) && b.obj.sizing === 's');
ok('commas and brackets inside strings do not fool it', salvageTopLevel('{"headline":"a, b } ] ,","driver":[1,2],"x":"cut off here').obj.headline === 'a, b } ] ,');
ok('escaped quotes inside strings are handled', salvageTopLevel('{"headline":"say \\"hi, there\\"","driver":[1],"z":"tru').obj.headline === 'say "hi, there"');
ok('nothing complete means no rescue, so the caller still reports the truncation', salvageTopLevel('{"headline":"half a sent') === null && salvageTopLevel('no json') === null && salvageTopLevel('') === null && salvageTopLevel(null) === null);
ok('it never invents text: every value in the rescued object appears verbatim in the input', JSON.stringify(a.obj).split('"').filter(x => x.length > 3).every(x => cutInLetter.includes(x)));
console.log(failures ? `\n${failures} FAILED` : '\nall passed');
process.exit(failures ? 1 : 0);
