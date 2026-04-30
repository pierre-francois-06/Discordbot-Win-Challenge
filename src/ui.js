const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    StringSelectMenuBuilder,
    UserSelectMenuBuilder,
} = require("discord.js");
const { formatTaskLabel } = require("./tasks");
const { formatDuration } = require("./time");
const {
    getAllPlayerIds,
    getOpenTasksForTeam,
    getTaskProgress,
    getTeamProgress,
    getTeamTotalMs,
    getWinnerTeam,
    isTaskComplete,
    summarizeTeam,
    getChallengeElapsedMs,
} = require("./state");

function buildSetupPanel() {
    const embed = new EmbedBuilder()
        .setTitle("Win Challenge")
        .setDescription(
            "Starte eine neue Challenge und dokumentiere Fortschritt, Zeiten und Sieger direkt in diesem Kanal.",
        )
        .setColor(0x2f80ed);

    return {
        embeds: [embed],
        components: [
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId("wc:new")
                    .setLabel("Neue Challenge")
                    .setStyle(ButtonStyle.Primary),
            ),
        ],
    };
}

function buildSetupDashboard(session) {
    const ready = isSetupReady(session);
    const embed = new EmbedBuilder()
        .setTitle("Challenge erstellen")
        .setDescription(
            ready
                ? "Alles ist bereit. Starte die Challenge, wenn die Einstellungen passen."
                : "Richte die Challenge hier ein. Buttons öffnen nur dort Popups, wo Eingaben gebraucht werden.",
        )
        .setColor(ready ? 0x27ae60 : 0x2f80ed)
        .addFields(
            {
                name: "Teams",
                value: formatSetupTeams(session),
                inline: false,
            },
            {
                name: "Sichtbarkeit",
                value:
                    session.visibility === "own"
                        ? "Nur eigenes Team sieht Details."
                        : "Alle sehen alle Details.",
                inline: true,
            },
            {
                name: "Zeit",
                value: formatSetupTiming(session),
                inline: true,
            },
            {
                name: "Aufgaben",
                value: formatSetupTasks(session),
                inline: false,
            },
        );

    return {
        embeds: [embed],
        components: [
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`wc:setup:edit:teams:${session.id}`)
                    .setLabel("Teams")
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(`wc:setup:edit:visibility:${session.id}`)
                    .setLabel("Sichtbarkeit")
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId(`wc:setup:edit:timing:${session.id}`)
                    .setLabel("Zeit")
                    .setStyle(ButtonStyle.Secondary),
            ),
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`wc:setup:task:add:${session.id}`)
                    .setLabel("Aufgabe hinzufügen")
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(`wc:setup:task:remove:${session.id}`)
                    .setLabel("Letzte Aufgabe löschen")
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(session.tasks.length === 0),
            ),
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`wc:setup:start:${session.id}`)
                    .setLabel("Challenge starten")
                    .setStyle(ButtonStyle.Success)
                    .setDisabled(!ready),
                new ButtonBuilder()
                    .setCustomId(`wc:setup:cancel:${session.id}`)
                    .setLabel("Abbrechen")
                    .setStyle(ButtonStyle.Danger),
            ),
        ],
        ephemeral: true,
    };
}

function isSetupReady(session) {
    return (
        Number.isInteger(session.teamCount) &&
        session.teamCount >= 1 &&
        session.teamMode &&
        session.teams.length === session.teamCount &&
        session.teams.every((team) => team?.userIds?.length > 0) &&
        session.tasks.length > 0 &&
        session.timing
    );
}

function formatSetupTeams(session) {
    if (!session.teamCount) return "Noch nicht eingerichtet.";
    const mode =
        session.teamMode === "random"
            ? "zufällig verteilt"
            : session.teamMode === "manual"
              ? "manuell ausgewählt"
              : "Modus fehlt";
    const lines = [`${session.teamCount} Team(s), ${mode}`];

    for (let index = 0; index < session.teamCount; index += 1) {
        const team = session.teams[index];
        lines.push(
            `Team ${index + 1}: ${
                team?.userIds?.length
                    ? team.userIds.map((id) => `<@${id}>`).join(", ")
                    : "noch offen"
            }`,
        );
    }

    return truncate(lines.join("\n"), 1024);
}

function formatSetupTiming(session) {
    if (!session.timing) return "Noch nicht eingestellt.";
    if (session.timing.type === "limit") {
        return `Zeitlimit: ${session.timing.minutes} Minuten`;
    }
    return "Zeit wird gezählt.";
}

function formatSetupTasks(session) {
    if (session.tasks.length === 0) return "Noch keine Aufgabe angelegt.";
    return truncate(
        session.tasks
            .map((task, index) => `${index + 1}. ${formatTaskLabel(task)}`)
            .join("\n"),
        1024,
    );
}

function buildTeamCountPrompt() {
    return {
        content: "Setup Schritt 1: Wie viele Teams sollen mitspielen?",
        embeds: [],
        components: [
            new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId("wc:setup:count")
                    .setPlaceholder("Teamanzahl wählen")
                    .addOptions(
                        [1, 2, 3, 4].map((count) => ({
                            label: `${count} Team${count === 1 ? "" : "s"}`,
                            value: String(count),
                        })),
                    ),
            ),
        ],
        ephemeral: true,
    };
}

function buildTeamUserPrompt(sessionId, teamIndex, teamCount) {
    return {
        content: `Setup Schritt 2: Wähle die Discord-User für Team ${teamIndex + 1}/${teamCount}.`,
        embeds: [],
        components: [
            new ActionRowBuilder().addComponents(
                new UserSelectMenuBuilder()
                    .setCustomId(`wc:setup:team:${sessionId}:${teamIndex}`)
                    .setPlaceholder(`User für Team ${teamIndex + 1}`)
                    .setMinValues(1)
                    .setMaxValues(25),
            ),
        ],
        ephemeral: true,
    };
}

function buildVisibilityPrompt(sessionId) {
    return {
        content:
            "Setup Schritt 3: Was dürfen Teams während der Challenge öffentlich sehen?",
        embeds: [],
        components: [
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`wc:setup:visibility:${sessionId}:all`)
                    .setLabel("Alle sehen alles")
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(`wc:setup:visibility:${sessionId}:own`)
                    .setLabel("Nur eigenes Team")
                    .setStyle(ButtonStyle.Secondary),
            ),
        ],
        ephemeral: true,
    };
}

function buildTaskReviewPrompt(sessionId, tasks) {
    const embed = new EmbedBuilder()
        .setTitle("Aufgaben")
        .setColor(0x56ccf2)
        .setDescription(
            tasks.length === 0
                ? "Noch keine Aufgabe angelegt."
                : tasks
                      .map(
                          (task, index) =>
                              `${index + 1}. ${formatTaskLabel(task)}`,
                      )
                      .join("\n"),
        );

    const buttons = [
        new ButtonBuilder()
            .setCustomId(`wc:setup:task:add:${sessionId}`)
            .setLabel("Weitere Aufgabe")
            .setStyle(ButtonStyle.Primary),
    ];

    if (tasks.length > 0) {
        buttons.push(
            new ButtonBuilder()
                .setCustomId(`wc:setup:task:remove:${sessionId}`)
                .setLabel("Letzte Aufgabe löschen")
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId(`wc:setup:task:start:${sessionId}`)
                .setLabel("Challenge starten")
                .setStyle(ButtonStyle.Success),
        );
    }

    return {
        content: "Setup Schritt 4: Füge Aufgaben einzeln hinzu.",
        embeds: [embed],
        components: [new ActionRowBuilder().addComponents(buttons)],
        ephemeral: true,
    };
}

function buildB2bPrompt(sessionId, pendingTask) {
    const embed = new EmbedBuilder()
        .setTitle("BxB für diese Aufgabe?")
        .setDescription(
            `**${pendingTask.title}**\nAnzahl: ${pendingTask.count}\n\nWenn BxB aktiv ist, wird daraus b2b.`,
        )
        .setColor(0x56ccf2);

    return {
        embeds: [embed],
        components: [
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`wc:setup:b2b:${sessionId}:yes`)
                    .setLabel("BxB aktiv")
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(`wc:setup:b2b:${sessionId}:no`)
                    .setLabel("Kein BxB")
                    .setStyle(ButtonStyle.Secondary),
            ),
        ],
        ephemeral: true,
    };
}

function buildTimingPrompt(sessionId) {
    return {
        content: "Setup Schritt 5: Wie soll die Challenge zeitlich laufen?",
        embeds: [],
        components: [
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`wc:setup:timing:${sessionId}:stopwatch`)
                    .setLabel("Zeit zählen")
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(`wc:setup:timing:${sessionId}:limit`)
                    .setLabel("Zeitlimit")
                    .setStyle(ButtonStyle.Secondary),
            ),
        ],
        ephemeral: true,
    };
}

function buildChallengeMessage(state) {
    const embed = new EmbedBuilder()
        .setTitle("Win Challenge läuft")
        .setColor(state.status === "ended" ? 0x828282 : 0x27ae60)
        .setDescription(buildChallengeStatus(state))
        .addFields(buildChallengeFields(state))
        .setTimestamp(new Date(Date.now() - getChallengeElapsedMs(state)));

    return {
        embeds: [embed],
        components: [
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`wc:mine:${state.messageId || "pending"}`)
                    .setLabel("Meine Aufgaben")
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(state.status === "ended"),
                new ButtonBuilder()
                    .setCustomId(`wc:refresh:${state.messageId || "pending"}`)
                    .setLabel("Status aktualisieren")
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(state.status === "ended"),
                new ButtonBuilder()
                    .setCustomId(
                        `wc:${state.pausedAt ? "resume" : "pause"}:${state.messageId || "pending"}`,
                    )
                    .setLabel(
                        state.pausedAt
                            ? "Challenge fortsetzen"
                            : "Challenge pausieren",
                    )
                    .setStyle(
                        state.pausedAt
                            ? ButtonStyle.Success
                            : ButtonStyle.Secondary,
                    )
                    .setDisabled(state.status === "ended"),
                new ButtonBuilder()
                    .setCustomId(`wc:cancel:${state.messageId || "pending"}`)
                    .setLabel("Challenge beenden")
                    .setStyle(ButtonStyle.Danger)
                    .setDisabled(state.status === "ended"),
            ),
        ],
    };
}

function buildChallengeStatus(state) {
    const mode =
        state.timing?.type === "limit"
            ? `Zeitlimit: ${state.timing.minutes} Minuten`
            : "Zeitmodus: Zeit wird gezählt";
    const visibility =
        state.visibility === "own"
            ? "Gegnerdetails: privat"
            : "Gegnerdetails: sichtbar";
    const now = state.pausedAt ? state.pausedAt : Date.now();
    const displayStart = now - getChallengeElapsedMs(state);
    const lines = [
        state.pausedAt
            ? `Zeit: ${formatDuration(getChallengeElapsedMs(state))} (pausiert)`
            : `Start: <t:${Math.floor(displayStart / 1000)}:R>`,
        `${mode} | ${visibility}`,
    ];

    if (state.firstFinishTeamId && state.vote?.status === "open") {
        const firstTeam = state.teams.find(
            (team) => team.id === state.firstFinishTeamId,
        );
        lines.push(
            `${firstTeam?.name || "Ein Team"} ist fertig. Abstimmung läuft bis <t:${Math.floor(state.vote.expiresAt / 1000)}:T>.`,
        );
    }

    return lines.join("\n");
}

function buildChallengeFields(state) {
    if (state.visibility === "own") {
        return state.teams.map((team) => ({
            name: team.name,
            value: `${team.userIds.map((id) => `<@${id}>`).join(", ")}\nFortschritt: ${formatTeamProgress(state, team)}`,
            inline: true,
        }));
    }

    return state.teams.map((team) => {
        const lines = [
            `Spieler: ${team.userIds.map((id) => `<@${id}>`).join(", ")}`,
        ];
        for (const task of state.tasks) {
            const completed = team.completed[task.id];
            const complete = isTaskComplete(team, task);
            lines.push(
                `${complete ? formatCompletionTime(completed) : formatTaskProgress(team, task)} - ${formatTaskLabel(task)}`,
            );
        }
        return {
            name: team.name,
            value: truncate(lines.join("\n"), 1024),
            inline: state.teams.length <= 2,
        };
    });
}

function buildMyTasksMenu(state, teamId, publicMessageId) {
    const openTasks = getOpenTasksForTeam(state, teamId);
    const team = state.teams.find((entry) => entry.id === teamId);
    const resettableTasks = state.tasks.filter(
        (task) =>
            task.streak &&
            getTaskProgress(team, task) > 0 &&
            !isTaskComplete(team, task),
    );

    if (openTasks.length === 0) {
        return {
            content: `${team?.name || "Dein Team"} hat keine offenen Aufgaben mehr.`,
            embeds: [],
            components: [],
            ephemeral: true,
        };
    }

    return {
        content: `${team.name}: Welche Aufgabe möchtest du abhaken?`,
        embeds: [],
        components: [
            new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId(`wc:complete:${publicMessageId}:${teamId}`)
                    .setPlaceholder("Eine erledigte Aufgabe wählen")
                    .setMinValues(1)
                    .setMaxValues(1)
                    .addOptions(
                        openTasks.map((task) => ({
                            label: truncate(
                                `${formatTaskLabel(task)} (${formatTaskProgress(team, task)})`,
                                100,
                            ),
                            value: task.id,
                        })),
                    ),
            ),
            ...buildResetTaskRows(
                resettableTasks,
                team,
                publicMessageId,
                teamId,
            ),
        ],
        ephemeral: true,
    };
}

function buildVoteMessage(state) {
    const players = getAllPlayerIds(state);
    const embed = new EmbedBuilder()
        .setTitle("Challenge beenden?")
        .setDescription(
            `Das erste Team ist fertig. Mehrheit entscheidet. Ohne Mehrheit endet die Challenge automatisch <t:${Math.floor(state.vote.expiresAt / 1000)}:R>.\n\nStimmberechtigt: ${players.map((id) => `<@${id}>`).join(", ")}`,
        )
        .setColor(0xf2c94c);

    return {
        embeds: [embed],
        components: [
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`wc:vote:${state.messageId}:end`)
                    .setLabel("Beenden")
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId(`wc:vote:${state.messageId}:continue`)
                    .setLabel("Weiterspielen")
                    .setStyle(ButtonStyle.Primary),
            ),
        ],
    };
}

function buildSummaryMessage(state) {
    const winner = getWinnerTeam(state);
    const winnerTotal = winner ? getTeamTotalMs(state, winner) : null;
    const sortedTeams = [...state.teams].sort((a, b) => {
        if (a.id === winner?.id) return -1;
        if (b.id === winner?.id) return 1;
        const aTotal = getTeamTotalMs(state, a);
        const bTotal = getTeamTotalMs(state, b);
        if (aTotal === null) return 1;
        if (bTotal === null) return -1;
        return aTotal - bTotal;
    });

    const embed = new EmbedBuilder()
        .setTitle("Siegerehrung")
        .setColor(0xf2994a)
        .setDescription(
            winner
                ? `**Gewinner: ${winner.name}**\n${winner.userIds.map((id) => `<@${id}>`).join(", ")}\nGesamtzeit: **${formatDuration(winnerTotal)}**`
                : "Keine vollständigen Teams.",
        )
        .setTimestamp(new Date(state.endedAt || Date.now()));

    for (const team of sortedTeams) {
        const title =
            team.id === winner?.id ? `Gewinner - ${team.name}` : team.name;
        const lines = [summarizeTeam(state, team, winnerTotal)];
        for (const task of state.tasks) {
            const completed = team.completed[task.id];
            const complete = isTaskComplete(team, task);
            lines.push(
                `${formatTaskLabel(task)}: ${complete ? formatCompletionTime(completed) : formatTaskProgress(team, task)}`,
            );
        }
        embed.addFields({
            name: title,
            value: truncate(lines.join("\n"), 1024),
            inline: team.id !== winner?.id,
        });
    }

    return { embeds: [embed] };
}

function formatCompletionTime(completed) {
    const taskDurationMs = completed.taskDurationMs ?? completed.elapsedMs;
    return `${formatDuration(taskDurationMs)} (gesamt ${formatDuration(completed.elapsedMs)})`;
}

function formatTaskProgress(team, task) {
    return `${getTaskProgress(team, task)}/${task.count}`;
}

function formatTeamProgress(state, team) {
    const progress = getTeamProgress(state, team);
    return `${progress.done}/${progress.total}`;
}

function buildResetTaskRows(tasks, team, publicMessageId, teamId) {
    if (tasks.length === 0) return [];

    return [
        new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId(`wc:reset:${publicMessageId}:${teamId}`)
                .setPlaceholder("BxB-Siege zurÃ¼cksetzen")
                .setMinValues(1)
                .setMaxValues(1)
                .addOptions(
                    tasks.map((task) => ({
                        label: truncate(
                            `${formatTaskLabel(task)} zurÃ¼cksetzen (${formatTaskProgress(team, task)})`,
                            100,
                        ),
                        value: task.id,
                    })),
                ),
        ),
    ];
}

function truncate(value, maxLength) {
    if (value.length <= maxLength) return value;
    return `${value.slice(0, maxLength - 3)}...`;
}

module.exports = {
    buildSetupPanel,
    buildSetupDashboard,
    buildTeamCountPrompt,
    buildTeamUserPrompt,
    buildVisibilityPrompt,
    buildTaskReviewPrompt,
    buildB2bPrompt,
    buildTimingPrompt,
    buildChallengeMessage,
    buildMyTasksMenu,
    buildVoteMessage,
    buildSummaryMessage,
};
