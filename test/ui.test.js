const assert = require('node:assert/strict');
const test = require('node:test');
const { createChallenge } = require('../src/state');
const { buildChallengeMessage } = require('../src/ui');

function sampleState(visibility) {
  const state = createChallenge({
    channelId: 'channel',
    creatorId: 'creator',
    now: 1000,
    visibility,
    timing: { type: 'stopwatch' },
    teams: [
      { userIds: ['u1'] },
      { userIds: ['u2'] }
    ],
    tasks: [
      { id: 'task_1', name: 'Game A', count: 1, streak: null }
    ]
  });
  state.messageId = 'message';
  return state;
}

test('public challenge message hides opponent task details in own visibility mode', () => {
  const payload = buildChallengeMessage(sampleState('own'));
  const serialized = JSON.stringify(payload);

  assert.match(serialized, /Fortschritt/);
  assert.doesNotMatch(serialized, /Game A/);
});

test('public challenge message shows task details in all visibility mode', () => {
  const payload = buildChallengeMessage(sampleState('all'));
  const serialized = JSON.stringify(payload);

  assert.match(serialized, /Game A/);
  assert.doesNotMatch(serialized, /WC_STATE/);
});
