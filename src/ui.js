const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  UserSelectMenuBuilder
} = require('discord.js');
const { formatTaskLabel } = require('./tasks');
const { formatDuration } = require('./time');
const {
  getAllPlayerIds,
  getOpenTasksForTeam,
  getTeamTotalMs,
  getWinnerTeam,
  summarizeTeam
} = require('./state');

function buildSetupPanel() {
  const embed = new EmbedBuilder()
    .setTitle('Win Challenge')
    .setDescription('Starte eine neue Challenge und dokumentiere Fortschritt, Zeiten und Sieger direkt in diesem Kanal.')
    .setColor(0x2f80ed);

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('wc:new')
          .setLabel('Neue Challenge')
          .setStyle(ButtonStyle.Primary)
      )
    ]
  };
}

function buildTeamCountPrompt() {
  return {
    content: 'Setup Schritt 1: Wie viele Teams sollen mitspielen?',
    embeds: [],
    components: [
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('wc:setup:count')
          .setPlaceholder('Teamanzahl wählen')
          .addOptions([1, 2, 3, 4].map((count) => ({
            label: `${count} Team${count === 1 ? '' : 's'}`,
            value: String(count)
          })))
      )
    ],
    ephemeral: true
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
          .setMaxValues(25)
      )
    ],
    ephemeral: true
  };
}

function buildVisibilityPrompt(sessionId) {
  return {
    content: 'Setup Schritt 3: Was dürfen Teams während der Challenge öffentlich sehen?',
    embeds: [],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`wc:setup:visibility:${sessionId}:all`)
          .setLabel('Alle sehen alles')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`wc:setup:visibility:${sessionId}:own`)
          .setLabel('Nur eigenes Team')
          .setStyle(ButtonStyle.Secondary)
      )
    ],
    ephemeral: true
  };
}

function buildTaskReviewPrompt(sessionId, tasks) {
  const embed = new EmbedBuilder()
    .setTitle('Aufgaben')
    .setColor(0x56ccf2)
    .setDescription(tasks.length === 0
      ? 'Noch keine Aufgabe angelegt.'
      : tasks.map((task, index) => `${index + 1}. ${formatTaskLabel(task)}`).join('\n'));

  const buttons = [
    new ButtonBuilder()
      .setCustomId(`wc:setup:task:add:${sessionId}`)
      .setLabel('Weitere Aufgabe')
      .setStyle(ButtonStyle.Primary)
  ];

  if (tasks.length > 0) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`wc:setup:task:remove:${sessionId}`)
        .setLabel('Letzte Aufgabe löschen')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`wc:setup:task:start:${sessionId}`)
        .setLabel('Challenge starten')
        .setStyle(ButtonStyle.Success)
    );
  }

  return {
    content: 'Setup Schritt 4: Füge Aufgaben einzeln hinzu.',
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(buttons)],
    ephemeral: true
  };
}

function buildB2bPrompt(sessionId, pendingTask) {
  const embed = new EmbedBuilder()
    .setTitle('BxB für diese Aufgabe?')
    .setDescription(`**${pendingTask.title}**\nAnzahl: ${pendingTask.count}\n\nWenn BxB aktiv ist, wird daraus b2b.`)
    .setColor(0x56ccf2);

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`wc:setup:b2b:${sessionId}:yes`)
          .setLabel('BxB aktiv')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`wc:setup:b2b:${sessionId}:no`)
          .setLabel('Kein BxB')
          .setStyle(ButtonStyle.Secondary)
      )
    ],
    ephemeral: true
  };
}

function buildTimingPrompt(sessionId) {
  return {
    content: 'Setup Schritt 5: Wie soll die Challenge zeitlich laufen?',
    embeds: [],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`wc:setup:timing:${sessionId}:stopwatch`)
          .setLabel('Zeit zählen')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`wc:setup:timing:${sessionId}:limit`)
          .setLabel('Zeitlimit')
          .setStyle(ButtonStyle.Secondary)
      )
    ],
    ephemeral: true
  };
}

function buildChallengeMessage(state) {
  const embed = new EmbedBuilder()
    .setTitle('Win Challenge läuft')
    .setColor(state.status === 'ended' ? 0x828282 : 0x27ae60)
    .setDescription(buildChallengeStatus(state))
    .addFields(buildChallengeFields(state))
    .setTimestamp(new Date(state.startedAt));

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`wc:mine:${state.messageId || 'pending'}`)
          .setLabel('Meine Aufgaben')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(state.status === 'ended'),
        new ButtonBuilder()
          .setCustomId(`wc:refresh:${state.messageId || 'pending'}`)
          .setLabel('Status aktualisieren')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(state.status === 'ended'),
        new ButtonBuilder()
          .setCustomId(`wc:cancel:${state.messageId || 'pending'}`)
          .setLabel('Challenge beenden')
          .setStyle(ButtonStyle.Danger)
          .setDisabled(state.status === 'ended')
      )
    ]
  };
}

function buildChallengeStatus(state) {
  const mode = state.timing?.type === 'limit'
    ? `Zeitlimit: ${state.timing.minutes} Minuten`
    : 'Zeitmodus: Zeit wird gezählt';
  const visibility = state.visibility === 'own' ? 'Gegnerdetails: privat' : 'Gegnerdetails: sichtbar';
  const lines = [
    `Start: <t:${Math.floor(state.startedAt / 1000)}:R>`,
    `${mode} | ${visibility}`
  ];

  if (state.firstFinishTeamId && state.vote?.status === 'open') {
    const firstTeam = state.teams.find((team) => team.id === state.firstFinishTeamId);
    lines.push(`${firstTeam?.name || 'Ein Team'} ist fertig. Abstimmung läuft bis <t:${Math.floor(state.vote.expiresAt / 1000)}:T>.`);
  }

  return lines.join('\n');
}

function buildChallengeFields(state) {
  if (state.visibility === 'own') {
    return state.teams.map((team) => ({
      name: team.name,
      value: `${team.userIds.map((id) => `<@${id}>`).join(', ')}\nFortschritt: ${Object.keys(team.completed).length}/${state.tasks.length}`,
      inline: true
    }));
  }

  return state.teams.map((team) => {
    const lines = [`Spieler: ${team.userIds.map((id) => `<@${id}>`).join(', ')}`];
    for (const task of state.tasks) {
      const completed = team.completed[task.id];
      lines.push(`${completed ? formatCompletionTime(completed) : 'offen'} - ${formatTaskLabel(task)}`);
    }
    return {
      name: team.name,
      value: truncate(lines.join('\n'), 1024),
      inline: state.teams.length <= 2
    };
  });
}

function buildMyTasksMenu(state, teamId, publicMessageId) {
  const openTasks = getOpenTasksForTeam(state, teamId);
  const team = state.teams.find((entry) => entry.id === teamId);

  if (openTasks.length === 0) {
    return {
      content: `${team?.name || 'Dein Team'} hat keine offenen Aufgaben mehr.`,
      embeds: [],
      components: [],
      ephemeral: true
    };
  }

  return {
    content: `${team.name}: Welche Aufgabe möchtest du abhaken?`,
    embeds: [],
    components: [
      new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId(`wc:complete:${publicMessageId}:${teamId}`)
          .setPlaceholder('Eine erledigte Aufgabe wählen')
          .setMinValues(1)
          .setMaxValues(1)
          .addOptions(openTasks.map((task) => ({
            label: truncate(formatTaskLabel(task), 100),
            value: task.id
          })))
      )
    ],
    ephemeral: true
  };
}

function buildVoteMessage(state) {
  const players = getAllPlayerIds(state);
  const embed = new EmbedBuilder()
    .setTitle('Challenge beenden?')
    .setDescription(`Das erste Team ist fertig. Mehrheit entscheidet. Ohne Mehrheit endet die Challenge automatisch <t:${Math.floor(state.vote.expiresAt / 1000)}:R>.\n\nStimmberechtigt: ${players.map((id) => `<@${id}>`).join(', ')}`)
    .setColor(0xf2c94c);

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`wc:vote:${state.messageId}:end`)
          .setLabel('Beenden')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`wc:vote:${state.messageId}:continue`)
          .setLabel('Weiterspielen')
          .setStyle(ButtonStyle.Primary)
      )
    ]
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
    .setTitle('Siegerehrung')
    .setColor(0xf2994a)
    .setDescription(winner ? `**Gewinner: ${winner.name}**\n${winner.userIds.map((id) => `<@${id}>`).join(', ')}\nGesamtzeit: **${formatDuration(winnerTotal)}**` : 'Keine vollständigen Teams.')
    .setTimestamp(new Date(state.endedAt || Date.now()));

  for (const team of sortedTeams) {
    const title = team.id === winner?.id ? `Gewinner - ${team.name}` : team.name;
    const lines = [summarizeTeam(state, team, winnerTotal)];
    for (const task of state.tasks) {
      const completed = team.completed[task.id];
      lines.push(`${formatTaskLabel(task)}: ${completed ? formatCompletionTime(completed) : 'DNF'}`);
    }
    embed.addFields({
      name: title,
      value: truncate(lines.join('\n'), 1024),
      inline: team.id !== winner?.id
    });
  }

  return { embeds: [embed] };
}

function formatCompletionTime(completed) {
  const taskDurationMs = completed.taskDurationMs ?? completed.elapsedMs;
  return `${formatDuration(taskDurationMs)} (gesamt ${formatDuration(completed.elapsedMs)})`;
}

function truncate(value, maxLength) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 3)}...`;
}

module.exports = {
  buildSetupPanel,
  buildTeamCountPrompt,
  buildTeamUserPrompt,
  buildVisibilityPrompt,
  buildTaskReviewPrompt,
  buildB2bPrompt,
  buildTimingPrompt,
  buildChallengeMessage,
  buildMyTasksMenu,
  buildVoteMessage,
  buildSummaryMessage
};
