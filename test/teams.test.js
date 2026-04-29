const assert = require('node:assert/strict');
const test = require('node:test');
const { distributeRandomTeams } = require('../src/teams');

test('distributeRandomTeams assigns every player exactly once', () => {
  const teams = distributeRandomTeams(['u1', 'u2', 'u3', 'u4', 'u5'], 2, () => 0);
  const assigned = teams.flatMap((team) => team.userIds).sort();

  assert.deepEqual(assigned, ['u1', 'u2', 'u3', 'u4', 'u5']);
});

test('distributeRandomTeams keeps teams as balanced as possible', () => {
  const teams = distributeRandomTeams(['u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7', 'u8', 'u9', 'u10'], 3, () => 0);
  const sizes = teams.map((team) => team.userIds.length).sort((a, b) => b - a);

  assert.deepEqual(sizes, [4, 3, 3]);
});

test('distributeRandomTeams rejects fewer players than teams', () => {
  assert.throws(() => distributeRandomTeams(['u1'], 2), /mindestens/);
});
