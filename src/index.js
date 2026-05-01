require("dotenv").config();

const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    CheckboxBuilder,
    Client,
    Events,
    GatewayIntentBits,
    LabelBuilder,
    ModalBuilder,
    PermissionFlagsBits,
    StringSelectMenuBuilder,
    TextInputBuilder,
    TextInputStyle,
    UserSelectMenuBuilder,
} = require("discord.js");
const { createTask, formatTaskLabel } = require("./tasks");
const { distributeRandomTeams } = require("./teams");
const { parsePositiveMinutes } = require("./time");
const {
    addCleanupMessage,
    castVote,
    createChallenge,
    endChallenge,
    findTeamForUser,
    getOpenTasksForTeam,
    getTaskProgress,
    markTasksComplete,
    pauseChallenge,
    resetTaskProgress,
    resetTeamProgress,
    resumeChallenge,
    isTaskComplete,
} = require("./state");
const { createStore } = require("./store");
const {
    buildChallengeMessage,
    buildMyTasksMenu,
    buildSetupDashboard,
    buildSetupPanel,
    buildSummaryMessage,
    buildVoteMessage,
} = require("./ui");

const setupSessions = new Map();
const voteTimers = new Map();
const limitTimers = new Map();
const store = createStore();
const TEMPORARY_REPLY_MS = 30 * 1000;

const client = new Client({
    intents: [GatewayIntentBits.Guilds],
});

client.once(Events.ClientReady, async (readyClient) => {
    console.log(`Logged in as ${readyClient.user.tag}.`);
    await restoreActiveChallengeTimers();
});

client.on(Events.InteractionCreate, async (interaction) => {
    try {
        if (interaction.isChatInputCommand()) {
            await handleCommand(interaction);
            return;
        }

        if (interaction.isButton()) {
            await handleButton(interaction);
            return;
        }

        if (interaction.isStringSelectMenu()) {
            await handleStringSelect(interaction);
            return;
        }

        if (interaction.isUserSelectMenu()) {
            await handleUserSelect(interaction);
            return;
        }

        if (interaction.isModalSubmit()) {
            await handleModal(interaction);
        }
    } catch (error) {
        console.error(error);
        await safeReply(interaction, `Fehler: ${error.message}`);
    }
});

async function handleCommand(interaction) {
    if (interaction.commandName === "setup") {
        await interaction.reply(buildSetupPanel());
        return;
    }

    if (interaction.commandName === "startchallenge") {
        await startChallengeSetup(interaction);
        return;
    }

    if (interaction.commandName === "challenge_status") {
        const state = store.getActiveChallengeByChannelId(
            interaction.channelId,
        );
        if (!state) {
            await replyTemporary(interaction, {
                content: "In diesem Kanal läuft gerade keine Challenge.",
                ephemeral: true,
            });
            return;
        }

        const message = await fetchStoredMessage(state);
        const ended = await maybeApplyAutomaticEnds(state, message);
        if (!ended) {
            await message.edit(buildChallengeMessage(state));
            store.saveChallenge(state);
        }
        await acknowledgeQuietly(interaction);
        return;
    }

    if (interaction.commandName === "challenge_cancel") {
        const state = store.getActiveChallengeByChannelId(
            interaction.channelId,
        );
        if (!state) {
            await replyTemporary(interaction, {
                content: "In diesem Kanal läuft gerade keine Challenge.",
                ephemeral: true,
            });
            return;
        }

        requireCreatorOrAdmin(interaction, state);
        const message = await fetchStoredMessage(state);
        await finishChallenge(state, message, Date.now());
        await acknowledgeQuietly(interaction);
    }
}

async function handleButton(interaction) {
    const [namespace, action] = interaction.customId.split(":");
    if (namespace !== "wc") return;

    if (action === "new") {
        await startChallengeSetup(interaction);
        return;
    }

    if (action === "setup") {
        await handleSetupButton(interaction);
        return;
    }

    const [, , arg1, arg2] = interaction.customId.split(":");

    if (action === "mine") {
        const state = store.getChallengeByMessageId(arg1);
        if (!state) {
            await replyTemporary(interaction, {
                content: "Diese Challenge wurde nicht gefunden.",
                ephemeral: true,
            });
            return;
        }

        const message = await fetchStoredMessage(state);
        const ended = await maybeApplyAutomaticEnds(state, message);
        if (ended) {
            await replyTemporary(interaction, {
                content: "Diese Challenge ist bereits beendet.",
                ephemeral: true,
            });
            return;
        }

        const team = findTeamForUser(state, interaction.user.id);
        if (!team) {
            await replyTemporary(interaction, {
                content: "Du bist in dieser Challenge in keinem Team.",
                ephemeral: true,
            });
            return;
        }

        const openTasks = getOpenTasksForTeam(state, team.id);
        if (openTasks.length === 0) {
            await replyTemporary(interaction, {
                content: `${team.name} hat keine offenen Aufgaben mehr.`,
                ephemeral: true,
            });
            return;
        }

        await interaction.showModal(buildMyTasksModal(state, team.id));
        return;
    }

    if (action === "refresh") {
        const state = store.getChallengeByMessageId(arg1);
        if (!state) {
            await replyTemporary(interaction, {
                content: "Diese Challenge wurde nicht gefunden.",
                ephemeral: true,
            });
            return;
        }

        const message = await fetchStoredMessage(state);
        const ended = await maybeApplyAutomaticEnds(state, message);
        if (!ended) {
            await message.edit(buildChallengeMessage(state));
            store.saveChallenge(state);
        }
        await acknowledgeQuietly(interaction);
        return;
    }

    if (action === "pause") {
        const state = store.getChallengeByMessageId(arg1);
        if (!state) {
            await replyTemporary(interaction, {
                content: "Diese Challenge wurde nicht gefunden.",
                ephemeral: true,
            });
            return;
        }

        requireCreatorOrAdmin(interaction, state);
        pauseChallenge(state, Date.now());

        clearLimitTimer(state.messageId);
        clearVoteTimer(state.messageId);

        const message = await fetchStoredMessage(state);
        await message.edit(buildChallengeMessage(state));
        store.saveChallenge(state);

        await acknowledgeQuietly(interaction);
        return;
    }

    if (action === "resume") {
        const state = store.getChallengeByMessageId(arg1);
        if (!state) {
            await replyTemporary(interaction, {
                content: "Diese Challenge wurde nicht gefunden.",
                ephemeral: true,
            });
            return;
        }

        requireCreatorOrAdmin(interaction, state);
        resumeChallenge(state, Date.now());

        const message = await fetchStoredMessage(state);
        await message.edit(buildChallengeMessage(state));
        store.saveChallenge(state);

        scheduleTimeLimit(state, message);

        await acknowledgeQuietly(interaction);
        return;
    }

    if (action === "cancel") {
        const state = store.getChallengeByMessageId(arg1);
        if (!state) {
            await replyTemporary(interaction, {
                content: "Diese Challenge wurde nicht gefunden.",
                ephemeral: true,
            });
            return;
        }

        requireCreatorOrAdmin(interaction, state);
        const message = await fetchStoredMessage(state);
        await finishChallenge(state, message, Date.now());
        await acknowledgeQuietly(interaction);
        return;
    }

    if (action === "vote") {
        await handleVoteButton(interaction, arg1, arg2);
        return;
    }

    if (action === "fail") {
        await handleFirstTryFailure(interaction, arg1);
    }
}

async function startChallengeSetup(interaction) {
    const existing = store.getActiveChallengeByChannelId(interaction.channelId);
    if (existing) {
        await replyTemporary(interaction, {
            content: "In diesem Kanal läuft bereits eine Challenge.",
            ephemeral: true,
        });
        return;
    }

    const sessionId = createSession({
        creatorId: interaction.user.id,
        channelId: interaction.channelId,
        teamCount: null,
        teams: [],
        teamMode: null,
        tasks: [],
        challengeType: null,
        visibility: "all",
        timing: null,
    });
    const session = getSession(sessionId, interaction.user.id);
    await interaction.reply(buildSetupDashboard(session));
}

async function handleSetupButton(interaction) {
    const [, , step, value, sessionId, extra] = interaction.customId.split(":");

    const realSessionId =
        step === "edit" || step === "task"
            ? sessionId
            : value;
    const session = getSession(realSessionId, interaction.user.id);

    if (step === "edit") {
        if (value === "type") {
            await interaction.showModal(buildChallengeTypeModal(realSessionId));
            return;
        }

        if (value === "teams") {
            if (!session.teamCount) {
                await interaction.showModal(buildTeamCountModal(realSessionId));
                return;
            }

            if (!session.teamMode) {
                await interaction.showModal(buildTeamModeModal(realSessionId));
                return;
            }

            if (session.teamMode === "random") {
                await interaction.showModal(
                    buildRandomPlayersModal(realSessionId, session.teamCount),
                );
                return;
            }

            const teamIndex = findNextOpenTeamIndex(session);
            await interaction.showModal(
                buildTeamUsersModal(
                    realSessionId,
                    teamIndex,
                    session.teamCount,
                ),
            );
            return;
        }

        if (value === "visibility") {
            await interaction.showModal(buildVisibilityModal(realSessionId));
            return;
        }

        if (value === "timing") {
            await interaction.showModal(buildTimingModal(realSessionId));
            return;
        }
    }

    if (step === "task") {
        if (value === "add") {
            await interaction.showModal(buildTaskModal(realSessionId));
            return;
        }

        if (value === "remove") {
            session.tasks.pop();
            await updateSetupDashboard(interaction, session);
            return;
        }
    }

    if (step === "start") {
        assertSetupReady(session);
        await interaction.update({
            content: "Challenge wird gestartet...",
            embeds: [],
            components: [],
        });
        await startChallengeFromSession(session, session.timing);
        await deleteReplyQuietly(interaction);
        return;
    }

    if (step === "cancel") {
        setupSessions.delete(realSessionId);
        await interaction.update({
            content: "Challenge-Setup abgebrochen.",
            embeds: [],
            components: [],
        });
    }
}

async function handleStringSelect(interaction) {
    const [namespace, action] = interaction.customId.split(":");
    if (namespace !== "wc") return;

    if (action === "complete" || action === "reset") {
        const [, , messageId, teamId] = interaction.customId.split(":");
        const state = store.getChallengeByMessageId(messageId);
        if (!state) {
            await replyTemporary(interaction, {
                content: "Diese Challenge wurde nicht gefunden.",
                ephemeral: true,
            });
            return;
        }

        const message = await fetchStoredMessage(state);
        const ended = await maybeApplyAutomaticEnds(state, message);
        if (ended) {
            await replyTemporary(interaction, {
                content: "Diese Challenge ist bereits beendet.",
                ephemeral: true,
            });
            return;
        }

        const team = findTeamForUser(state, interaction.user.id);
        if (!team || team.id !== teamId) {
            await replyTemporary(interaction, {
                content:
                    "Du kannst nur Aufgaben für dein eigenes Team abhaken.",
                ephemeral: true,
            });
            return;
        }

        if (action === "reset") {
            resetTaskProgress(state, teamId, interaction.values[0]);
            await message.edit(buildChallengeMessage(state));
            store.saveChallenge(state);
            await updateTemporary(
                interaction,
                withoutEphemeral(buildMyTasksMenu(state, teamId, message.id)),
            );
            return;
        }

        const result = markTasksComplete(
            state,
            teamId,
            interaction.values,
            Date.now(),
        );
        await message.edit(buildChallengeMessage(state));
        store.saveChallenge(state);

        if (result.allFinished) {
            await interaction.deferUpdate();
            await finishChallenge(state, message, Date.now());
            await deleteReplyQuietly(interaction);
            return;
        }

        if (
            state.vote?.status === "open" &&
            result.teamFinished &&
            state.firstFinishTeamId === teamId
        ) {
            await postVotePrompt(state, message);
        }

        await updateTemporary(
            interaction,
            withoutEphemeral(buildMyTasksMenu(state, teamId, message.id)),
        );
    }
}

async function handleUserSelect() {}

async function handleModal(interaction) {
    const [namespace, action, step, sessionId] =
        interaction.customId.split(":");
    if (namespace === "wc" && action === "tasks") {
        await handleTasksModal(interaction, step, sessionId);
        return;
    }

    if (namespace !== "wc" || action !== "setup") return;

    if (
        step === "count" ||
        step === "mode" ||
        step === "randomplayers" ||
        step === "team" ||
        step === "type" ||
        step === "visibility" ||
        step === "task" ||
        step === "timing"
    ) {
        await handleDashboardModal(interaction, step, sessionId);
        return;
    }

    if (step === "count") {
        const teamCount = Number.parseInt(
            interaction.fields.getStringSelectValues("team_count")[0],
            10,
        );
        const newSessionId = createSession({
            creatorId: interaction.user.id,
            channelId: interaction.channelId,
            teamCount,
            teams: [],
            teamMode: null,
            tasks: [],
            challengeType: null,
            visibility: "all",
        });
        await replyTemporary(
            interaction,
            buildNextModalPrompt(newSessionId, "mode", "Teammodus auswählen"),
        );
        return;
    }

    if (step === "mode") {
        const session = getSession(sessionId, interaction.user.id);
        session.teamMode =
            interaction.fields.getStringSelectValues("team_mode")[0];

        if (session.teamMode === "random") {
            await replyTemporary(
                interaction,
                buildNextModalPrompt(
                    sessionId,
                    "randomplayers",
                    "Mitspieler auswählen",
                ),
            );
            return;
        }

        await replyTemporary(
            interaction,
            buildNextModalPrompt(sessionId, "team", "Team 1 auswählen", 0),
        );
        return;
    }

    if (step === "randomplayers") {
        const session = getSession(sessionId, interaction.user.id);
        const users = interaction.fields.getSelectedUsers(
            "random_players",
            true,
        );
        session.teams = distributeRandomTeams(
            [...users.keys()],
            session.teamCount,
        );
        await replyTemporary(
            interaction,
            buildNextModalPrompt(
                sessionId,
                "visibility",
                "Sichtbarkeit auswählen",
            ),
        );
        return;
    }

    if (step === "team") {
        const teamIndex = Number.parseInt(sessionId, 10);
        const realSessionId = interaction.customId.split(":")[4];
        const teamSession = getSession(realSessionId, interaction.user.id);
        const users = interaction.fields.getSelectedUsers("team_users", true);
        teamSession.teams[teamIndex] = { userIds: [...users.keys()] };

        const nextTeamIndex = teamIndex + 1;
        if (nextTeamIndex < teamSession.teamCount) {
            await replyTemporary(
                interaction,
                buildNextModalPrompt(
                    realSessionId,
                    "team",
                    `Team ${nextTeamIndex + 1} auswählen`,
                    nextTeamIndex,
                ),
            );
            return;
        }

        await replyTemporary(
            interaction,
            buildNextModalPrompt(
                realSessionId,
                "visibility",
                "Sichtbarkeit auswählen",
            ),
        );
        return;
    }

    const session = getSession(sessionId, interaction.user.id);

    if (step === "visibility") {
        session.visibility =
            interaction.fields.getStringSelectValues("visibility")[0];
        await replyTemporary(
            interaction,
            buildNextModalPrompt(sessionId, "tasks", "Aufgaben hinzufügen"),
        );
        return;
    }

    if (step === "task") {
        const task = createTask({
            index: session.tasks.length,
            title: interaction.fields.getTextInputValue("title"),
            count: interaction.fields.getTextInputValue("count"),
            b2b: interaction.fields.getCheckbox("b2b"),
        });
        session.tasks.push(task);
        await replyTemporary(
            interaction,
            buildTaskReviewPrompt(sessionId, session.tasks),
        );
        return;
    }

    if (step === "timing") {
        const mode = interaction.fields.getStringSelectValues("timing_mode")[0];
        const timing =
            mode === "limit"
                ? {
                      type: "limit",
                      minutes: parsePositiveMinutes(
                          interaction.fields.getTextInputValue("minutes"),
                      ),
                  }
                : { type: "stopwatch" };
        await replyTemporary(interaction, {
            content: "Challenge wird gestartet...",
            ephemeral: true,
        });
        await startChallengeFromSession(session, timing);
        await deleteReplyQuietly(interaction);
    }
}

async function handleDashboardModal(interaction, step, sessionId) {
    if (step === "team") {
        const teamIndex = Number.parseInt(sessionId, 10);
        const realSessionId = interaction.customId.split(":")[4];
        const session = getSession(realSessionId, interaction.user.id);
        const users = interaction.fields.getSelectedUsers("team_users", true);
        session.teams[teamIndex] = { userIds: [...users.keys()] };
        await updateSetupDashboard(interaction, session);
        return;
    }

    const session = getSession(sessionId, interaction.user.id);

    if (step === "count") {
        session.teamCount = Number.parseInt(
            interaction.fields.getStringSelectValues("team_count")[0],
            10,
        );
        session.teamMode = null;
        session.teams = [];
        await updateSetupDashboard(interaction, session);
        return;
    }

    if (step === "mode") {
        session.teamMode =
            interaction.fields.getStringSelectValues("team_mode")[0];
        session.teams = [];
        await updateSetupDashboard(interaction, session);
        return;
    }

    if (step === "randomplayers") {
        const users = interaction.fields.getSelectedUsers(
            "random_players",
            true,
        );
        session.teams = distributeRandomTeams(
            [...users.keys()],
            session.teamCount,
        );
        await updateSetupDashboard(interaction, session);
        return;
    }

    if (step === "visibility") {
        session.visibility =
            interaction.fields.getStringSelectValues("visibility")[0];
        await updateSetupDashboard(interaction, session);
        return;
    }

    if (step === "type") {
        session.challengeType =
            interaction.fields.getStringSelectValues("challenge_type")[0];
        await updateSetupDashboard(interaction, session);
        return;
    }

    if (step === "task") {
        const task = createTask({
            index: session.tasks.length,
            title: interaction.fields.getTextInputValue("title"),
            count: interaction.fields.getTextInputValue("count"),
            b2b: interaction.fields.getCheckbox("b2b"),
        });
        session.tasks.push(task);
        await updateSetupDashboard(interaction, session);
        return;
    }

    if (step === "timing") {
        const mode = interaction.fields.getStringSelectValues("timing_mode")[0];
        session.timing =
            mode === "limit"
                ? {
                      type: "limit",
                      minutes: parsePositiveMinutes(
                          interaction.fields.getTextInputValue("minutes"),
                      ),
                  }
                : { type: "stopwatch" };
        await updateSetupDashboard(interaction, session);
    }
}

async function handleTasksModal(interaction, messageId, teamId) {
    const state = store.getChallengeByMessageId(messageId);
    if (!state) {
        await replyTemporary(interaction, {
            content: "Diese Challenge wurde nicht gefunden.",
            ephemeral: true,
        });
        return;
    }

    const message = await fetchStoredMessage(state);
    const ended = await maybeApplyAutomaticEnds(state, message);
    if (ended) {
        await replyTemporary(interaction, {
            content: "Diese Challenge ist bereits beendet.",
            ephemeral: true,
        });
        return;
    }

    const team = findTeamForUser(state, interaction.user.id);
    if (!team || team.id !== teamId) {
        await replyTemporary(interaction, {
            content: "Du kannst nur Aufgaben für dein eigenes Team abhaken.",
            ephemeral: true,
        });
        return;
    }

    const [completeTaskId] = getOptionalStringSelectValues(
        interaction,
        "complete_task_id",
    );
    const [resetTaskId] = getOptionalStringSelectValues(
        interaction,
        "reset_task_id",
    );

    if (resetTaskId) {
        resetTaskProgress(state, teamId, resetTaskId);
    }

    if (!completeTaskId) {
        await message.edit(buildChallengeMessage(state));
        store.saveChallenge(state);
        await acknowledgeQuietly(interaction);
        return;
    }

    const result = markTasksComplete(state, teamId, [completeTaskId], Date.now());
    await message.edit(buildChallengeMessage(state));
    store.saveChallenge(state);

    if (result.allFinished) {
        await acknowledgeQuietly(interaction);
        await finishChallenge(state, message, Date.now());
        return;
    }

    if (
        state.vote?.status === "open" &&
        result.teamFinished &&
        state.firstFinishTeamId === teamId
    ) {
        await postVotePrompt(state, message);
    }

    await acknowledgeQuietly(interaction);
}

async function handleFirstTryFailure(interaction, messageId) {
    const state = store.getChallengeByMessageId(messageId);
    if (!state) {
        await replyTemporary(interaction, {
            content: "Diese Challenge wurde nicht gefunden.",
            ephemeral: true,
        });
        return;
    }

    if (state.challengeType !== "first_try") {
        await replyTemporary(interaction, {
            content: "Fehlversuche gibt es nur in First-Try-Challenges.",
            ephemeral: true,
        });
        return;
    }

    const message = await fetchStoredMessage(state);
    const ended = await maybeApplyAutomaticEnds(state, message);
    if (ended) {
        await replyTemporary(interaction, {
            content: "Diese Challenge ist bereits beendet.",
            ephemeral: true,
        });
        return;
    }

    const team = findTeamForUser(state, interaction.user.id);
    if (!team) {
        await replyTemporary(interaction, {
            content: "Du bist in dieser Challenge in keinem Team.",
            ephemeral: true,
        });
        return;
    }

    resetTeamProgress(state, team.id);
    await message.edit(buildChallengeMessage(state));
    store.saveChallenge(state);
    await acknowledgeQuietly(interaction);
}

async function handleVoteButton(interaction, messageId, choice) {
    const state = store.getChallengeByMessageId(messageId);
    if (!state) {
        await replyTemporary(interaction, {
            content: "Diese Challenge wurde nicht gefunden.",
            ephemeral: true,
        });
        return;
    }

    const message = await fetchStoredMessage(state);
    const result = castVote(state, interaction.user.id, choice, Date.now());

    if (result.result === "end" || result.result === "timeout_end") {
        await interaction.deferUpdate();
        await finishChallenge(state, message, Date.now());
        return;
    }

    if (result.result === "continue") {
        state.vote.status = "continued";
        clearVoteTimer(message.id);
        await message.edit(buildChallengeMessage(state));
        store.saveChallenge(state);
        await acknowledgeQuietly(interaction);
        await deleteMessageQuietly(interaction.message);
        return;
    }

    await message.edit(buildChallengeMessage(state));
    store.saveChallenge(state);
    await acknowledgeQuietly(interaction);
}

async function startChallengeFromSession(session, timing) {
    const channel = await client.channels.fetch(session.channelId);
    const state = createChallenge({
        channelId: session.channelId,
        creatorId: session.creatorId,
        teams: session.teams,
        tasks: session.tasks,
        challengeType: session.challengeType,
        timing,
        visibility: session.visibility,
    });

    await createTemporaryVoiceChannels(channel, state);

    const sent = await channel.send(buildChallengeMessage(state));
    state.messageId = sent.id;
    addCleanupMessage(state, sent.id);
    await sent.edit(buildChallengeMessage(state));
    store.saveChallenge(state);
    scheduleTimeLimit(state, sent);
    setupSessions.delete(session.id);
}

async function createTemporaryVoiceChannels(channel, state) {
    if (!channel.guild) return;

    state.tempVoiceChannelIds = [];
    try {
        for (const team of state.teams) {
            const voiceChannel = await channel.guild.channels.create({
                name: `Win Challenge - ${team.name}`,
                type: ChannelType.GuildVoice,
                parent: channel.parentId || undefined,
                reason: `Temporärer Sprachkanal für ${team.name}`,
            });

            team.voiceChannelId = voiceChannel.id;
            state.tempVoiceChannelIds.push(voiceChannel.id);
        }
    } catch (error) {
        await cleanupTemporaryVoiceChannels(channel, state);
        throw error;
    }
}

async function postVotePrompt(state, message) {
    await message.edit(buildChallengeMessage(state));
    const voteMessage = await message.channel.send(buildVoteMessage(state));
    addCleanupMessage(state, voteMessage.id);
    store.saveChallenge(state);
    scheduleVoteTimeout(state, message);
}

function scheduleVoteTimeout(state, message) {
    clearVoteTimer(message.id);
    const delay = Math.max(0, state.vote.expiresAt - Date.now());
    const timer = setTimeout(async () => {
        try {
            const freshState = store.getChallenge(state.id);
            if (!freshState || freshState.vote?.status !== "open") return;
            const freshMessage = await fetchStoredMessage(freshState);
            freshState.vote.status = "ended_by_timeout";
            await finishChallenge(freshState, freshMessage, Date.now());
        } catch (error) {
            console.error(error);
        }
    }, delay);
    voteTimers.set(message.id, timer);
}

function clearVoteTimer(messageId) {
    const timer = voteTimers.get(messageId);
    if (timer) clearTimeout(timer);
    voteTimers.delete(messageId);
}

function scheduleTimeLimit(state, message) {
    clearLimitTimer(message.id);
    if (state.timing?.type !== "limit" || state.status === "ended") return;

    const endsAt = state.startedAt + state.timing.minutes * 60 * 1000;
    const delay = Math.max(0, endsAt - Date.now());
    const timer = setTimeout(async () => {
        try {
            const freshState = store.getChallenge(state.id);
            if (!freshState || freshState.status !== "active") return;
            const freshMessage = await fetchStoredMessage(freshState);
            await finishChallenge(freshState, freshMessage, Date.now());
        } catch (error) {
            console.error(error);
        }
    }, delay);
    limitTimers.set(message.id, timer);
}

function clearLimitTimer(messageId) {
    const timer = limitTimers.get(messageId);
    if (timer) clearTimeout(timer);
    limitTimers.delete(messageId);
}

async function maybeApplyAutomaticEnds(state, message) {
    if (state.status === "ended") return true;

    if (state.timing?.type === "limit") {
        const endsAt = state.startedAt + state.timing.minutes * 60 * 1000;
        if (Date.now() >= endsAt) {
            await finishChallenge(state, message, Date.now());
            return true;
        }
    }

    if (state.vote?.status === "open" && Date.now() >= state.vote.expiresAt) {
        state.vote.status = "ended_by_timeout";
        await finishChallenge(state, message, Date.now());
        return true;
    }

    scheduleTimeLimit(state, message);
    if (state.vote?.status === "open") scheduleVoteTimeout(state, message);
    return false;
}

async function finishChallenge(state, message, now) {
    if (state.status === "ended") return;
    clearVoteTimer(state.messageId);
    clearLimitTimer(state.messageId);
    endChallenge(state, now);

    const channel =
        message?.channel || (await client.channels.fetch(state.channelId));
    await channel.send(buildSummaryMessage(state));
    await cleanupTemporaryVoiceChannels(channel, state);
    await cleanupChallengeMessages(channel, state);
    store.deleteChallenge(state.id);
}

async function cleanupTemporaryVoiceChannels(channel, state) {
    const guild = channel.guild;
    if (!guild) return;

    for (const channelId of state.tempVoiceChannelIds || []) {
        try {
            const voiceChannel = await guild.channels.fetch(channelId);
            await voiceChannel?.delete(
                "Win Challenge beendet, temporärer Sprachkanal wird gelöscht.",
            );
        } catch {
            // Channel may already be deleted or inaccessible.
        }
    }
}

async function cleanupChallengeMessages(channel, state) {
    addCleanupMessage(state, state.messageId);
    for (const messageId of state.cleanupMessageIds || []) {
        try {
            const message = await channel.messages.fetch(messageId);
            await message.delete();
        } catch {
            // Message may already be gone or too old for the bot to access.
        }
    }
}

async function restoreActiveChallengeTimers() {
    for (const state of store.listChallenges()) {
        try {
            if (state.status !== "active") continue;
            const message = await fetchStoredMessage(state);
            await maybeApplyAutomaticEnds(state, message);
        } catch (error) {
            console.error(`Could not restore challenge ${state.id}:`, error);
        }
    }
}

async function fetchStoredMessage(state) {
    const channel = await client.channels.fetch(state.channelId);
    return channel.messages.fetch(state.messageId);
}

function buildTaskModal(sessionId) {
    const modal = new ModalBuilder()
        .setCustomId(`wc:setup:task:${sessionId}`)
        .setTitle("Aufgabe hinzufügen");

    modal.addLabelComponents(
        new LabelBuilder()
            .setLabel("Titel")
            .setTextInputComponent(
                new TextInputBuilder()
                    .setCustomId("title")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setMaxLength(80)
                    .setPlaceholder("z.B. Rocket League"),
            ),
        new LabelBuilder()
            .setLabel("Anzahl")
            .setTextInputComponent(
                new TextInputBuilder()
                    .setCustomId("count")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setMaxLength(3)
                    .setPlaceholder("z.B. 3"),
            ),
        new LabelBuilder()
            .setLabel("BxB")
            .setDescription("Aktiviert bedeutet: Anzahl 5 wird zu b5b.")
            .setCheckboxComponent(
                new CheckboxBuilder().setCustomId("b2b").setDefault(false),
            ),
    );

    return modal;
}

function buildMyTasksModal(state, teamId) {
    const team = state.teams.find((entry) => entry.id === teamId);
    const openTasks = getOpenTasksForTeam(state, teamId);
    const resettableTasks = state.tasks.filter(
        (task) =>
            task.streak &&
            getTaskProgress(team, task) > 0 &&
            !isTaskComplete(team, task),
    );

    const modal = new ModalBuilder()
        .setCustomId(`wc:tasks:${state.messageId}:${teamId}`)
        .setTitle(`${team.name}: Aufgaben`);

    modal.addLabelComponents(
        new LabelBuilder()
            .setLabel("Aufgabe abhaken")
            .setStringSelectMenuComponent(
                new StringSelectMenuBuilder()
                    .setCustomId("complete_task_id")
                    .setPlaceholder("Erledigte Aufgabe wählen")
                    .setRequired(false)
                    .setMinValues(0)
                    .setMaxValues(1)
                    .addOptions(
                        openTasks.map((task) => ({
                            label: truncate(
                                `${formatTaskLabel(task)} (${formatTaskProgressForModal(team, task)})`,
                                100,
                            ),
                            value: task.id,
                        })),
                    ),
            ),
    );

    if (resettableTasks.length > 0) {
        modal.addLabelComponents(
            new LabelBuilder()
                .setLabel("BxB zurücksetzen")
                .setStringSelectMenuComponent(
                    new StringSelectMenuBuilder()
                        .setCustomId("reset_task_id")
                        .setPlaceholder("Optional: BxB-Aufgabe zurücksetzen")
                        .setRequired(false)
                        .setMinValues(0)
                        .setMaxValues(1)
                        .addOptions(
                            resettableTasks.map((task) => ({
                                label: truncate(
                                    `${formatTaskLabel(task)} (${formatTaskProgressForModal(team, task)})`,
                                    100,
                                ),
                                value: task.id,
                            })),
                        ),
                ),
        );
    }

    return modal;
}

function buildTeamCountModal(sessionId) {
    return new ModalBuilder()
        .setCustomId(`wc:setup:count:${sessionId}`)
        .setTitle("Teamanzahl")
        .addLabelComponents(
            new LabelBuilder()
                .setLabel("Wie viele Teams?")
                .setStringSelectMenuComponent(
                    new StringSelectMenuBuilder()
                        .setCustomId("team_count")
                        .setPlaceholder("Teamanzahl wählen")
                        .addOptions(
                            [1, 2, 3, 4].map((count) => ({
                                label: `${count} Team${count === 1 ? "" : "s"}`,
                                value: String(count),
                            })),
                        ),
                ),
        );
}

function buildTeamUsersModal(sessionId, teamIndex, teamCount) {
    return new ModalBuilder()
        .setCustomId(`wc:setup:team:${teamIndex}:${sessionId}`)
        .setTitle(`Team ${teamIndex + 1}/${teamCount}`)
        .addLabelComponents(
            new LabelBuilder()
                .setLabel(`User für Team ${teamIndex + 1}`)
                .setUserSelectMenuComponent(
                    new UserSelectMenuBuilder()
                        .setCustomId("team_users")
                        .setPlaceholder("Discord-User auswählen")
                        .setMinValues(1)
                        .setMaxValues(25),
                ),
        );
}

function buildTeamModeModal(sessionId) {
    return new ModalBuilder()
        .setCustomId(`wc:setup:mode:${sessionId}`)
        .setTitle("Teammodus")
        .addLabelComponents(
            new LabelBuilder()
                .setLabel("Wie sollen Teams erstellt werden?")
                .setStringSelectMenuComponent(
                    new StringSelectMenuBuilder()
                        .setCustomId("team_mode")
                        .setPlaceholder("Teammodus wählen")
                        .addOptions(
                            {
                                label: "Teams manuell auswählen",
                                value: "manual",
                            },
                            {
                                label: "Teams zufällig erstellen",
                                value: "random",
                            },
                        ),
                ),
        );
}

function buildChallengeTypeModal(sessionId) {
    return new ModalBuilder()
        .setCustomId(`wc:setup:type:${sessionId}`)
        .setTitle("Challenge-Art")
        .addLabelComponents(
            new LabelBuilder()
                .setLabel("Welche Challenge-Art?")
                .setStringSelectMenuComponent(
                    new StringSelectMenuBuilder()
                        .setCustomId("challenge_type")
                        .setPlaceholder("Challenge-Art wählen")
                        .addOptions(
                            {
                                label: "Standard Winchallenge",
                                value: "standard",
                            },
                            {
                                label: "First-Try Winchallenge",
                                value: "first_try",
                            },
                        ),
                ),
        );
}

function buildRandomPlayersModal(sessionId, teamCount) {
    return new ModalBuilder()
        .setCustomId(`wc:setup:randomplayers:${sessionId}`)
        .setTitle("Zufällige Teams")
        .addLabelComponents(
            new LabelBuilder()
                .setLabel(`Alle Mitspieler auswählen (${teamCount} Teams)`)
                .setDescription(
                    "Der Bot verteilt alle ausgewählten Spieler möglichst gleich groß auf die Teams.",
                )
                .setUserSelectMenuComponent(
                    new UserSelectMenuBuilder()
                        .setCustomId("random_players")
                        .setPlaceholder("Alle Mitspieler auswählen")
                        .setMinValues(teamCount)
                        .setMaxValues(25),
                ),
        );
}

function buildVisibilityModal(sessionId) {
    return new ModalBuilder()
        .setCustomId(`wc:setup:visibility:${sessionId}`)
        .setTitle("Sichtbarkeit")
        .addLabelComponents(
            new LabelBuilder()
                .setLabel("Was dürfen Teams sehen?")
                .setStringSelectMenuComponent(
                    new StringSelectMenuBuilder()
                        .setCustomId("visibility")
                        .setPlaceholder("Sichtbarkeit wählen")
                        .addOptions(
                            { label: "Alle sehen alles", value: "all" },
                            { label: "Nur eigenes Team", value: "own" },
                        ),
                ),
        );
}

function buildTimingModal(sessionId) {
    const modal = new ModalBuilder()
        .setCustomId(`wc:setup:timing:${sessionId}`)
        .setTitle("Zeitmodus");

    modal.addLabelComponents(
        new LabelBuilder()
            .setLabel("Zeitmodus")
            .setStringSelectMenuComponent(
                new StringSelectMenuBuilder()
                    .setCustomId("timing_mode")
                    .setPlaceholder("Zeitmodus wählen")
                    .addOptions(
                        { label: "Zeit zählen", value: "stopwatch" },
                        { label: "Zeitlimit", value: "limit" },
                    ),
            ),
        new LabelBuilder()
            .setLabel("Zeitlimit in Minuten")
            .setDescription("Nur ausfüllen, wenn du Zeitlimit wählst.")
            .setTextInputComponent(
                new TextInputBuilder()
                    .setCustomId("minutes")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false)
                    .setPlaceholder("z.B. 90"),
            ),
    );

    return modal;
}

function buildNextModalPrompt(sessionId, target, label, extra = null) {
    const customId = ["wc", "setup", "next", target, sessionId, extra]
        .filter((part) => part !== null && part !== undefined)
        .join(":");

    return {
        content:
            "Klicke auf den Button, um mit dem nächsten Popup weiterzumachen.",
        components: [
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(customId)
                    .setLabel(label)
                    .setStyle(ButtonStyle.Primary),
            ),
        ],
        ephemeral: true,
    };
}

function requireCreatorOrAdmin(interaction, state) {
    const isCreator = interaction.user.id === state.creatorId;
    const isAdmin = interaction.memberPermissions?.has(
        PermissionFlagsBits.ManageGuild,
    );
    if (!isCreator && !isAdmin) {
        throw new Error(
            "Nur der Ersteller oder Server-Admins dürfen die Challenge beenden.",
        );
    }
}

function createSession(data) {
    const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    setupSessions.set(id, { id, ...data });
    return id;
}

function getSession(id, userId) {
    const session = setupSessions.get(id);
    if (!session) {
        throw new Error(
            "Setup-Session ist abgelaufen. Bitte starte die Challenge neu.",
        );
    }
    if (session.creatorId !== userId) {
        throw new Error("Nur der Ersteller kann dieses Setup fortsetzen.");
    }
    return session;
}

function findNextOpenTeamIndex(session) {
    const index = session.teams.findIndex((team) => !team?.userIds?.length);
    if (index !== -1) return index;
    return 0;
}

function assertSetupReady(session) {
    if (!Number.isInteger(session.teamCount) || session.teamCount < 1) {
        throw new Error("Bitte richte zuerst die Teams ein.");
    }
    if (!session.teamMode) {
        throw new Error("Bitte wähle zuerst den Teammodus.");
    }
    if (!session.challengeType) {
        throw new Error("Bitte wähle zuerst die Challenge-Art.");
    }
    if (
        session.teams.length !== session.teamCount ||
        session.teams.some((team) => !team?.userIds?.length)
    ) {
        throw new Error("Bitte wähle zuerst alle Team-Mitspieler aus.");
    }
    if (session.tasks.length === 0) {
        throw new Error("Bitte mindestens eine Aufgabe anlegen.");
    }
    if (!session.timing) {
        throw new Error("Bitte stelle zuerst den Zeitmodus ein.");
    }
}

async function updateSetupDashboard(interaction, session) {
    const payload = withoutEphemeral(buildSetupDashboard(session));
    if (typeof interaction.update === "function") {
        await interaction.update(payload);
        return;
    }
    await interaction.reply({ ...payload, ephemeral: true });
}

async function acknowledgeQuietly(interaction) {
    if (typeof interaction.deferUpdate === "function") {
        await interaction.deferUpdate();
        return;
    }

    await interaction.deferReply({ ephemeral: true });
    await deleteReplyQuietly(interaction);
}

function getOptionalStringSelectValues(interaction, customId) {
    try {
        return interaction.fields.getStringSelectValues(customId, false) || [];
    } catch {
        return [];
    }
}

function formatTaskProgressForModal(team, task) {
    return `${getTaskProgress(team, task)}/${task.count}`;
}

function truncate(value, maxLength) {
    if (value.length <= maxLength) return value;
    return `${value.slice(0, maxLength - 3)}...`;
}

async function deleteMessageQuietly(message) {
    try {
        await message.delete();
    } catch {
        // Ignore cleanup failures.
    }
}

async function deleteReplyQuietly(interaction) {
    try {
        if (interaction.deferred || interaction.replied) {
            await interaction.deleteReply();
        }
    } catch {
        // Ephemeral interaction tokens can expire or be unavailable after Discord closes the response.
    }
}

function scheduleReplyDeletion(interaction, delay = TEMPORARY_REPLY_MS) {
    const timer = setTimeout(() => {
        deleteReplyQuietly(interaction).catch(() => {});
    }, delay);
    timer.unref?.();
}

async function replyTemporary(interaction, payload) {
    await interaction.reply(payload);
    scheduleReplyDeletion(interaction);
}

async function updateTemporary(interaction, payload) {
    await interaction.update(payload);
    scheduleReplyDeletion(interaction);
}

async function safeReply(interaction, content) {
    const payload = { content, ephemeral: true };
    if (interaction.deferred || interaction.replied) {
        const message = await interaction
            .followUp({ ...payload, fetchReply: true })
            .catch((error) => {
                console.error(error);
                return null;
            });
        if (message) {
            const timer = setTimeout(() => {
                interaction.webhook.deleteMessage(message.id).catch(() => {});
            }, TEMPORARY_REPLY_MS);
            timer.unref?.();
        }
        return;
    }
    await replyTemporary(interaction, payload).catch(console.error);
}

function withoutEphemeral(payload) {
    const { ephemeral, ...rest } = payload;
    return rest;
}

const token = process.env.DISCORD_TOKEN;
if (!token) {
    throw new Error("DISCORD_TOKEN muss in .env gesetzt sein.");
}

client.login(token);
