// node js/jarvis/voiceNormalise.test.mjs: the spoken-text normaliser and the ElevenLabs body (Helix wave 4 items 0.12, 7, 8)
import assert from 'node:assert/strict';
import { speakable, cleanForSpeech, elevenBody, elevenSpeed, elevenDict } from './voiceCore.js';

assert.equal(speakable('EURUSD up 0.4% vs GBP/USD'), 'euro dollar up 0.4 percent versus sterling dollar');
assert.equal(speakable('USDJPY and AUDUSD'), 'dollar yen and Aussie dollar');
assert.equal(speakable('The 2s10s at −12bp'), 'The twos tens at minus 12 basis points');
assert.equal(speakable('1 bp'), '1 basis point');
assert.equal(speakable('$1.2bn in Q3'), '1.2 billion dollars in third quarter');
assert.equal(speakable('1.2M jobs against 950K'), '1.2 million jobs against 950 thousand');
assert.equal(speakable('2.4x usual, a 1.8× day'), '2.4 times usual, a 1.8 times day');
assert.equal(speakable('the 25-delta risk reversal, 10d skew'), 'the 25 delta risk reversal, 10 delta skew');
assert.equal(speakable('CPI m/m and y/y'), 'CPI month on month and year on year');
assert.equal(speakable('from 13:30 at 1.0850'), 'from 13:30 at 1.0850', 'clock times and prices are left to the voice');
assert.equal(speakable('a 5m bar, EUR/EUR'), 'a 5m bar, EUR/EUR', 'a lowercase m (minutes) and a non-pair are left alone');
assert.equal(cleanForSpeech('<b>Helix</b> says EURUSD −0.3%'), 'Heelix says euro dollar minus 0.3 percent');

assert.equal(elevenSpeed(1.1), 1.1); assert.equal(elevenSpeed(1.3), 1.2); assert.equal(elevenSpeed(0.5), 0.7); assert.equal(elevenSpeed('x'), 1);
let b = elevenBody('Hi', 'm');
assert.equal(b.voice_settings.speed, 1); assert.ok(!('previous_text' in b) && !('pronunciation_dictionary_locators' in b));
b = elevenBody('Hi', 'm', { speed: 1.1, prev: 'Before.', next: 'After.', dict: elevenDict({ JARVIS_ELEVEN_DICT: 'abcdefgh1234:zyxwvuts9876' }) });
assert.equal(b.voice_settings.speed, 1.1); assert.equal(b.previous_text, 'Before.'); assert.equal(b.next_text, 'After.');
assert.deepEqual(b.pronunciation_dictionary_locators, [{ pronunciation_dictionary_id: 'abcdefgh1234', version_id: 'zyxwvuts9876' }]);
assert.equal(elevenDict({ JARVIS_ELEVEN_DICT: 'bad' }), null);
console.log('voiceNormalise: all tests passed');
