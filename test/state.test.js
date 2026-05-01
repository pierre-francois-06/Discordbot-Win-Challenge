const assert = require("node:assert/strict");
const test = require("node:test");
const {
    castVote,
    createChallenge,
    findTeamForUser,
    getOpenTasksForTeam,
    getTaskProgress,
    getTeamTotalMs,
    getWinnerTeam,
    markTasksComplete,
    resetTaskProgress,
    resetTeamProgress,
} = require("../src/state");

function sampleState() {
    return createChallenge({
        channelId: "channel",
        creatorId: "creator",
        now: 1000,
        timing: { type: "stopwatch" },
        teams: [{ userIds: ["u1", "u2"] }, { userIds: ["u3"] }],
        tasks: [
            { id: "task_1", name: "Game A", count: 1, streak: null },
            { id: "task_2", name: "Game B", count: 2, streak: "b2b" },
        ],
    });
}

test("findTeamForUser returns the matching team", () => {
    const state = sampleState();
    assert.equal(findTeamForUser(state, "u2").id, "team_1");
    assert.equal(findTeamForUser(state, "missing"), null);
});

test("markTasksComplete records elapsed time and prevents duplicates", () => {
    const state = sampleState();

    let result = markTasksComplete(state, "team_1", ["task_1"], 61000);
    assert.deepEqual(result.changed, ["task_1"]);
    assert.equal(state.teams[0].completed.task_1.elapsedMs, 60000);
    assert.equal(state.teams[0].completed.task_1.taskDurationMs, 60000);

    result = markTasksComplete(state, "team_1", ["task_1"], 90000);
    assert.deepEqual(result.changed, []);
    assert.equal(state.teams[0].completed.task_1.elapsedMs, 60000);
    assert.equal(state.teams[0].completed.task_1.taskDurationMs, 60000);
});

test("markTasksComplete records task duration since previous team task", () => {
    const state = sampleState();

    markTasksComplete(state, "team_1", ["task_1"], 61000);
    markTasksComplete(state, "team_1", ["task_2"], 121000);
    markTasksComplete(state, "team_1", ["task_2"], 151000);

    assert.equal(state.teams[0].completed.task_2.elapsedMs, 150000);
    assert.equal(state.teams[0].completed.task_2.taskDurationMs, 90000);
});

test("markTasksComplete counts one win per click until task count is reached", () => {
    const state = sampleState();

    let result = markTasksComplete(state, "team_1", ["task_2"], 61000);
    assert.deepEqual(result.changed, ["task_2"]);
    assert.equal(getTaskProgress(state.teams[0], state.tasks[1]), 1);
    assert.equal(state.teams[0].completed.task_2.elapsedMs, undefined);
    assert.deepEqual(getOpenTasksForTeam(state, "team_1"), state.tasks);

    result = markTasksComplete(state, "team_1", ["task_2"], 91000);
    assert.deepEqual(result.changed, ["task_2"]);
    assert.equal(getTaskProgress(state.teams[0], state.tasks[1]), 2);
    assert.equal(state.teams[0].completed.task_2.elapsedMs, 90000);
});

test("resetTaskProgress resets unfinished BxB progress", () => {
    const state = sampleState();

    markTasksComplete(state, "team_1", ["task_2"], 61000);
    assert.equal(getTaskProgress(state.teams[0], state.tasks[1]), 1);

    resetTaskProgress(state, "team_1", "task_2");
    assert.equal(getTaskProgress(state.teams[0], state.tasks[1]), 0);
});

test("first try challenge only offers the next task in order", () => {
    const state = sampleState();
    state.challengeType = "first_try";

    assert.deepEqual(getOpenTasksForTeam(state, "team_1"), [state.tasks[0]]);

    let result = markTasksComplete(state, "team_1", ["task_2"], 61000);
    assert.deepEqual(result.changed, []);
    assert.equal(getTaskProgress(state.teams[0], state.tasks[1]), 0);

    result = markTasksComplete(state, "team_1", ["task_1"], 61000);
    assert.deepEqual(result.changed, ["task_1"]);
    assert.deepEqual(getOpenTasksForTeam(state, "team_1"), [state.tasks[1]]);
});

test("resetTeamProgress restarts a first try team from the beginning", () => {
    const state = sampleState();
    state.challengeType = "first_try";

    markTasksComplete(state, "team_1", ["task_1"], 61000);
    assert.equal(getTaskProgress(state.teams[0], state.tasks[0]), 1);

    resetTeamProgress(state, "team_1");
    assert.equal(getTaskProgress(state.teams[0], state.tasks[0]), 0);
    assert.deepEqual(getOpenTasksForTeam(state, "team_1"), [state.tasks[0]]);
});

test("markTasksComplete detects first finisher and winner", () => {
    const state = sampleState();

    markTasksComplete(state, "team_1", ["task_1", "task_2"], 121000);
    markTasksComplete(state, "team_1", ["task_2"], 121000);

    assert.equal(state.firstFinishTeamId, "team_1");
    assert.equal(state.vote.status, "open");
    assert.equal(getWinnerTeam(state).id, "team_1");
    assert.equal(getTeamTotalMs(state, state.teams[0]), 120000);
    assert.deepEqual(getOpenTasksForTeam(state, "team_1"), []);
});

test("castVote uses majority and rejects spectators", () => {
    const state = sampleState();
    markTasksComplete(state, "team_1", ["task_1", "task_2"], 31000);
    markTasksComplete(state, "team_1", ["task_2"], 31000);

    assert.throws(
        () => castVote(state, "spectator", "end", 32000),
        /Mitspieler/,
    );
    assert.equal(castVote(state, "u1", "end", 32000).result, "pending");
    assert.equal(castVote(state, "u2", "end", 33000).result, "end");
});
