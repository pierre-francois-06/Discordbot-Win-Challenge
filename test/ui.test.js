const assert = require('node:assert/strict');
const test = require('node:test');
const { createChallenge } = require('../src/state');
const { buildChallengeMessage, buildSetupDashboard } = require('../src/ui');

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

test('setup dashboard shows missing setup state and blocks starting', () => {
  const payload = buildSetupDashboard({
    id: 'session',
    teamCount: null,
    teamMode: null,
    teams: [],
    tasks: [],
    visibility: 'all',
    timing: null
  });
  const serialized = JSON.stringify(payload);

  assert.match(serialized, /Noch nicht eingerichtet/);
  assert.match(serialized, /Noch keine Aufgabe angelegt/);
  assert.match(serialized, /Noch nicht eingestellt/);
  assert.match(serialized, /Challenge starten/);
  assert.match(serialized, /"disabled":true/);
});

test('setup dashboard shows configured tasks and allows starting when complete', () => {
  const payload = buildSetupDashboard({
    id: 'session',
    teamCount: 2,
    teamMode: 'manual',
    teams: [{ userIds: ['u1'] }, { userIds: ['u2'] }],
    tasks: [{ id: 'task_1', name: 'Game A', count: 3, streak: null }],
    visibility: 'own',
    timing: { type: 'limit', minutes: 90 }
  });
  const serialized = JSON.stringify(payload);

  assert.match(serialized, /Game A x3/);
  assert.match(serialized, /Nur eigenes Team/);
  assert.match(serialized, /Zeitlimit: 90 Minuten/);
  assert.doesNotMatch(serialized, /"custom_id":"wc:setup:start:session","label":"Challenge starten","style":3,"disabled":true/);
});
