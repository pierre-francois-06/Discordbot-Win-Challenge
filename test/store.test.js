const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createStore } = require('../src/store');

test('JSON store saves, loads and deletes active challenges', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wc-store-'));
  const filePath = path.join(dir, 'challenges.json');
  const store = createStore(filePath);

  const state = {
    id: 'challenge_1',
    channelId: 'channel_1',
    messageId: 'message_1',
    status: 'active'
  };

  store.saveChallenge(state);

  assert.deepEqual(store.getChallenge('challenge_1'), state);
  assert.deepEqual(store.getChallengeByMessageId('message_1'), state);
  assert.deepEqual(store.getActiveChallengeByChannelId('channel_1'), state);

  store.deleteChallenge('challenge_1');

  assert.equal(store.getChallenge('challenge_1'), null);
  assert.deepEqual(store.listChallenges(), []);
});
