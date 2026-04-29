const { formatDuration } = require("./time");

function createChallenge({
    channelId,
    creatorId,
    teams,
    tasks,
    timing,
    visibility = "all",
    now = Date.now(),
}) {
    const challengeId = now.toString(36);

    return {
        version: 1,
        id: challengeId,
        channelId,
        messageId: null,
        creatorId,
        status: "active",
        startedAt: now,
        endedAt: null,
        timing,
        visibility,
        cleanupMessageIds: [],
        teams: teams.map((team, index) => ({
            id: `team_${index + 1}`,
            name: `Team ${index + 1}`,
            userIds: team.userIds,
            completed: {},
            finishedAt: null,
        })),
        tasks,
        firstFinishTeamId: null,
        vote: null,
    };
}

function getAllPlayerIds(state) {
    return [...new Set(state.teams.flatMap((team) => team.userIds))];
}

function findTeamForUser(state, userId) {
    return state.teams.find((team) => team.userIds.includes(userId)) || null;
}

function getOpenTasksForTeam(state, teamId) {
    const team = state.teams.find((entry) => entry.id === teamId);
    if (!team) return [];
    return state.tasks.filter((task) => !team.completed[task.id]);
}

function isTeamComplete(state, team) {
    return state.tasks.every((task) => Boolean(team.completed[task.id]));
}

function markTasksComplete(state, teamId, taskIds, now = Date.now()) {
    const team = state.teams.find((entry) => entry.id === teamId);
    if (!team) {
        throw new Error("Team wurde nicht gefunden.");
    }

    const elapsedMs = now - state.startedAt;
    const previousElapsedMs = getLastTeamElapsedMs(team);
    const taskDurationMs = elapsedMs - previousElapsedMs;
    const validTaskIds = new Set(state.tasks.map((task) => task.id));
    const changed = [];

    for (const taskId of taskIds) {
        if (!validTaskIds.has(taskId)) continue;
        if (team.completed[taskId]) continue;

        team.completed[taskId] = {
            elapsedMs,
            taskDurationMs,
            completedAt: now,
        };
        changed.push(taskId);
    }

    if (!team.finishedAt && isTeamComplete(state, team)) {
        team.finishedAt = now;
        if (!state.firstFinishTeamId) {
            state.firstFinishTeamId = team.id;
            state.vote = {
                status: "open",
                startedAt: now,
                expiresAt: now + 30 * 1000,
                votes: {},
            };
        }
    }

    return {
        state,
        changed,
        teamFinished: Boolean(team.finishedAt),
        allFinished: state.teams.every((entry) => isTeamComplete(state, entry)),
    };
}

function getLastTeamElapsedMs(team) {
    const completed = Object.values(team.completed || {});
    if (completed.length === 0) return 0;
    return Math.max(...completed.map((entry) => entry.elapsedMs || 0));
}

function addCleanupMessage(state, messageId) {
    if (!messageId) return state;
    if (!Array.isArray(state.cleanupMessageIds)) {
        state.cleanupMessageIds = [];
    }
    if (!state.cleanupMessageIds.includes(messageId)) {
        state.cleanupMessageIds.push(messageId);
    }
    return state;
}

function castVote(state, userId, choice, now = Date.now()) {
    if (!state.vote || state.vote.status !== "open") {
        throw new Error("Es gibt gerade keine offene Abstimmung.");
    }

    if (!getAllPlayerIds(state).includes(userId)) {
        throw new Error("Nur Challenge-Mitspieler dürfen abstimmen.");
    }

    if (now >= state.vote.expiresAt) {
        state.vote.status = "ended_by_timeout";
        return {
            result: "timeout_end",
            endVotes: countVotes(state).end,
            continueVotes: countVotes(state).continue,
        };
    }

    state.vote.votes[userId] = choice;
    const counts = countVotes(state);
    const majority = Math.floor(getAllPlayerIds(state).length / 2) + 1;

    if (counts.end >= majority) {
        state.vote.status = "ended_by_vote";
        return {
            result: "end",
            endVotes: counts.end,
            continueVotes: counts.continue,
        };
    }

    if (counts.continue >= majority) {
        state.vote.status = "continued";
        return {
            result: "continue",
            endVotes: counts.end,
            continueVotes: counts.continue,
        };
    }

    return {
        result: "pending",
        endVotes: counts.end,
        continueVotes: counts.continue,
    };
}

function countVotes(state) {
    const votes = Object.values(state.vote?.votes || {});
    return {
        end: votes.filter((vote) => vote === "end").length,
        continue: votes.filter((vote) => vote === "continue").length,
    };
}

function endChallenge(state, now = Date.now()) {
    state.status = "ended";
    state.endedAt = now;
    return state;
}

function getTeamTotalMs(state, team) {
    if (team.finishedAt) return team.finishedAt - state.startedAt;
    const completed = Object.values(team.completed);
    if (completed.length === 0) return null;
    return Math.max(...completed.map((entry) => entry.elapsedMs));
}

function getWinnerTeam(state) {
    const finishedTeams = state.teams
        .filter((team) => team.finishedAt)
        .sort((a, b) => getTeamTotalMs(state, a) - getTeamTotalMs(state, b));

    if (finishedTeams.length > 0) return finishedTeams[0];
    if (state.firstFinishTeamId)
        return (
            state.teams.find((team) => team.id === state.firstFinishTeamId) ||
            null
        );
    return null;
}

function summarizeTeam(state, team, winnerTotalMs = null) {
    const totalMs = getTeamTotalMs(state, team);
    const status = team.finishedAt ? formatDuration(totalMs) : "DNF";
    const delta =
        winnerTotalMs !== null && totalMs !== null && team.finishedAt
            ? ` (+${formatDuration(totalMs - winnerTotalMs)})`
            : "";

    return `${team.name}: ${status}${delta}`;
}

module.exports = {
    createChallenge,
    getAllPlayerIds,
    findTeamForUser,
    getOpenTasksForTeam,
    isTeamComplete,
    markTasksComplete,
    addCleanupMessage,
    castVote,
    countVotes,
    endChallenge,
    getTeamTotalMs,
    getWinnerTeam,
    summarizeTeam,
};
