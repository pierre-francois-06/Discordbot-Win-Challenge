const assert = require('node:assert/strict');
const test = require('node:test');
const { createTask, parseTasks } = require('../src/tasks');

test('parseTasks parses normal task lines', () => {
  const tasks = parseTasks('Rocket League | 3 | b2b\nFortnite | 5 |\nMario Kart | 1 | b10b');

  assert.deepEqual(tasks, [
    { id: 'task_1', name: 'Rocket League', count: 3, streak: 'b2b' },
    { id: 'task_2', name: 'Fortnite', count: 5, streak: null },
    { id: 'task_3', name: 'Mario Kart', count: 1, streak: 'b10b' }
  ]);
});

test('parseTasks rejects invalid counts', () => {
  assert.throws(() => parseTasks('Rocket League | 0 |'), /Anzahl/);
  assert.throws(() => parseTasks('Rocket League | nope |'), /Anzahl/);
});

test('parseTasks rejects invalid streaks', () => {
  assert.throws(() => parseTasks('Rocket League | 3 | back2back'), /Streak/);
  assert.throws(() => parseTasks('Rocket League | 3 | b1b'), /Streak/);
});

test('parseTasks rejects more than 25 tasks', () => {
  const input = Array.from({ length: 26 }, (_, index) => `Game ${index + 1} | 1 |`).join('\n');
  assert.throws(() => parseTasks(input), /Maximal 25/);
});

test('createTask validates guided task input', () => {
  assert.deepEqual(createTask({ index: 0, title: 'Rocket League', count: '3', b2b: true }), {
    id: 'task_1',
    name: 'Rocket League',
    count: 3,
    streak: 'b2b'
  });

  assert.deepEqual(createTask({ index: 1, title: 'Fortnite', count: '5', b2b: false }), {
    id: 'task_2',
    name: 'Fortnite',
    count: 5,
    streak: null
  });
});

test('createTask rejects invalid guided task input', () => {
  assert.throws(() => createTask({ index: 0, title: '', count: '1', b2b: false }), /Titel/);
  assert.throws(() => createTask({ index: 0, title: 'Game', count: '0', b2b: false }), /Anzahl/);
});
