const { formatDuration } = require("./time");

function createChallenge({
    channelId,
    creatorId,
    teams,
    tasks,
    timing,
    challengeType = "standard",
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
        pausedAt: null,
        totalPausedMs: 0,
        challengeType,
        timing,
        visibility,
        cleanupMessageIds: [],
        tempVoiceChannelIds: [],
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
    return state.tasks.filter((task) => !isTaskComplete(team, task));
}

function isTeamComplete(state, team) {
    return state.tasks.every((task) => isTaskComplete(team, task));
}

function markTasksComplete(state, teamId, taskIds, now = Date.now()) {
    const team = state.teams.find((entry) => entry.id === teamId);
    if (!team) {
        throw new Error("Team wurde nicht gefunden.");
    }

    const elapsedMs = getChallengeElapsedMs(state, now);
    const previousElapsedMs = getLastTeamElapsedMs(team);
    const taskDurationMs = elapsedMs - previousElapsedMs;
    const validTaskIds = new Set(state.tasks.map((task) => task.id));
    const changed = [];

    for (const taskId of taskIds) {
        if (!validTaskIds.has(taskId)) continue;
        const task = state.tasks.find((entry) => entry.id === taskId);
        if (!task || isTaskComplete(team, task)) continue;

        const current = getTaskProgress(team, task);
        const nextProgress = Math.min(current + 1, task.count);

        team.completed[taskId] = {
            ...(team.completed[taskId] || {}),
            progress: nextProgress,
            required: task.count,
            updatedAt: now,
        };

        if (nextProgress >= task.count) {
            team.completed[taskId] = {
                ...team.completed[taskId],
                elapsedMs,
                taskDurationMs,
                completedAt: now,
            };
        }
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

function resetTaskProgress(state, teamId, taskId) {
    const team = state.teams.find((entry) => entry.id === teamId);
    if (!team) {
        throw new Error("Team wurde nicht gefunden.");
    }

    const task = state.tasks.find((entry) => entry.id === taskId);
    if (!task) {
        throw new Error("Aufgabe wurde nicht gefunden.");
    }

    if (!task.streak) {
        throw new Error("Nur BxB-Aufgaben kÃ¶nnen zurückgesetzt werden.");
    }

    if (isTaskComplete(team, task)) {
        throw new Error(
            "Fertige BxB-Aufgaben kÃ¶nnen nicht zurückgesetzt werden.",
        );
    }

    delete team.completed[taskId];
    return { state, task };
}

function resetTeamProgress(state, teamId) {
    const team = state.teams.find((entry) => entry.id === teamId);
    if (!team) {
        throw new Error("Team wurde nicht gefunden.");
    }

    team.completed = {};
    team.finishedAt = null;
    if (state.firstFinishTeamId === teamId) {
        state.firstFinishTeamId = null;
        state.vote = null;
    }
    return { state, team };
}

function getLastTeamElapsedMs(team) {
    const completed = Object.values(team.completed || {});
    if (completed.length === 0) return 0;
    return Math.max(...completed.map((entry) => entry.elapsedMs || 0));
}

function getTaskProgress(team, task) {
    const completed = team.completed?.[task.id];
    if (!completed) return 0;
    if (Number.isInteger(completed.progress)) return completed.progress;
    return completed.elapsedMs || completed.completedAt ? task.count : 0;
}

function isTaskComplete(team, task) {
    return getTaskProgress(team, task) >= task.count;
}

function getTeamProgress(state, team) {
    return state.tasks.reduce(
        (progress, task) => {
            progress.done += getTaskProgress(team, task);
            progress.total += task.count;
            return progress;
        },
        { done: 0, total: 0 },
    );
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
    const completed = Object.values(team.completed).filter((entry) =>
        Number.isFinite(entry.elapsedMs),
    );
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

function getChallengeElapsedMs(state, now = Date.now()) {
    const pauseUntil = state.pausedAt ? state.pausedAt : now;
    return pauseUntil - state.startedAt - (state.totalPausedMs || 0);
}

function pauseChallenge(state, now = Date.now()) {
    if (state.status !== "active") return state;
    if (state.pausedAt) return state;

    state.pausedAt = now;
    return state;
}

function resumeChallenge(state, now = Date.now()) {
    if (state.status !== "active") return state;
    if (!state.pausedAt) return state;

    state.totalPausedMs = (state.totalPausedMs || 0) + (now - state.pausedAt);
    state.pausedAt = null;
    return state;
}

module.exports = {
    createChallenge,
    getAllPlayerIds,
    findTeamForUser,
    getOpenTasksForTeam,
    getTaskProgress,
    getTeamProgress,
    isTeamComplete,
    isTaskComplete,
    markTasksComplete,
    resetTaskProgress,
    resetTeamProgress,
    addCleanupMessage,
    castVote,
    countVotes,
    endChallenge,
    getTeamTotalMs,
    getWinnerTeam,
    summarizeTeam,
    getChallengeElapsedMs,
    pauseChallenge,
    resumeChallenge,
};
