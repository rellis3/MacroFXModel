import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMaster, masterRecord, masterOn, shouldSend, isTelegramUrl, isWorkerTgRoute, TG_ALL_KEY } from './telegramGuard.js';

test('parseMaster: missing, junk or anything but on:false reads as on', () => {
  for (const raw of [null, undefined, '', 'nope', '{}', '[]', 42, { on: true }, '{"on":true}', { on: 'false' }]) assert.equal(parseMaster(raw).on, true, String(raw));
  assert.equal(parseMaster('{"on":false,"at":"2026-11-05T10:00:00.000Z"}').on, false);
  assert.equal(parseMaster({ on: false }).on, false);
  assert.equal(parseMaster('{"on":false,"at":"2026-11-05T10:00:00.000Z"}').at, '2026-11-05T10:00:00.000Z');
});

test('masterRecord round-trips through parseMaster', () => {
  const r = masterRecord(false, Date.UTC(2026, 10, 5, 9));
  assert.deepEqual(parseMaster(JSON.stringify(r)), { on: false, at: '2026-11-05T09:00:00.000Z' });
  assert.equal(parseMaster(JSON.stringify(masterRecord(true))).on, true);
  assert.equal(masterOn(undefined), true); assert.equal(masterOn({ on: false }), false);
});

test('shouldSend: master off mutes every sender and unnamed sends', () => {
  const master = { on: false };
  for (const sender of [undefined, 'levelProximity', 'newsBreaking']) assert.equal(shouldSend({ master, tgMaster: {}, sender }), false);
});

test('shouldSend: master on leaves the per-sender switches working (missing = on, only false mutes)', () => {
  const master = { on: true }, tgMaster = { newsBreaking: false, tradeWatch: true };
  assert.equal(shouldSend({ master, tgMaster, sender: 'newsBreaking' }), false);
  assert.equal(shouldSend({ master, tgMaster, sender: 'tradeWatch' }), true);
  assert.equal(shouldSend({ master, tgMaster, sender: 'neverHeardOf' }), true);
  assert.equal(shouldSend({ master, tgMaster, sender: undefined }), true);
  assert.equal(shouldSend({ tgMaster: undefined, sender: 'x' }), true, 'no master record = on');
  assert.equal(shouldSend(), true);
});

test('isTelegramUrl / isWorkerTgRoute', () => {
  assert.ok(isTelegramUrl('https://api.telegram.org/bot123:abc/sendMessage'));
  assert.ok(isTelegramUrl(new URL('https://api.telegram.org/bot1/sendPhoto')));
  assert.ok(isTelegramUrl({ url: 'https://api.telegram.org/bot1/sendDocument' }));
  assert.ok(!isTelegramUrl('https://example.com/?u=https://api.telegram.org/'));
  assert.ok(!isTelegramUrl(undefined));
  assert.ok(isWorkerTgRoute('post', '/api/telegram'));
  assert.ok(isWorkerTgRoute('POST', '/api/regime-v7/tg-test/'));
  assert.ok(!isWorkerTgRoute('GET', '/api/telegram'));
  assert.ok(!isWorkerTgRoute('POST', '/api/telegram/config'));
  assert.equal(TG_ALL_KEY, 'tg_master_all');
});
