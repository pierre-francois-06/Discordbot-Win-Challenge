require('dotenv').config();

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
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
  UserSelectMenuBuilder
} = require('discord.js');
const { createTask } = require('./tasks');
const { distributeRandomTeams } = require('./teams');
const { parsePositiveMinutes } = require('./time');
const {
  addCleanupMessage,
  castVote,
  createChallenge,
  endChallenge,
  findTeamForUser,
  markTasksComplete
} = require('./state');
const { createStore } = require('./store');
const {
  buildChallengeMessage,
  buildMyTasksMenu,
  buildSetupPanel,
  buildSummaryMessage,
  buildTaskReviewPrompt,
  buildVoteMessage
} = require('./ui');

const setupSessions = new Map();
const voteTimers = new Map();
const limitTimers = new Map();
const store = createStore();
const TEMPORARY_REPLY_MS = 30 * 1000;

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
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
  if (interaction.commandName === 'setup') {
    await interaction.reply(buildSetupPanel());
    return;
  }

  if (interaction.commandName === 'startchallenge') {
    await startChallengeSetup(interaction);
    return;
  }

  if (interaction.commandName === 'challenge_status') {
    const state = store.getActiveChallengeByChannelId(interaction.channelId);
    if (!state) {
      await replyTemporary(interaction, { content: 'In diesem Kanal läuft gerade keine Challenge.', ephemeral: true });
      return;
    }

    const message = await fetchStoredMessage(state);
    const ended = await maybeApplyAutomaticEnds(state, message);
    if (!ended) {
      await message.edit(buildChallengeMessage(state));
      store.saveChallenge(state);
    }
    await replyTemporary(interaction, { content: `Status aktualisiert: ${message.url}`, ephemeral: true });
    return;
  }

  if (interaction.commandName === 'challenge_cancel') {
    const state = store.getActiveChallengeByChannelId(interaction.channelId);
    if (!state) {
      await replyTemporary(interaction, { content: 'In diesem Kanal läuft gerade keine Challenge.', ephemeral: true });
      return;
    }

    requireCreatorOrAdmin(interaction, state);
    const message = await fetchStoredMessage(state);
    await finishChallenge(state, message, Date.now());
    await replyTemporary(interaction, { content: 'Challenge beendet.', ephemeral: true });
  }
}

async function handleButton(interaction) {
  const [namespace, action] = interaction.customId.split(':');
  if (namespace !== 'wc') return;

  if (action === 'new') {
    await startChallengeSetup(interaction);
    return;
  }

  if (action === 'setup') {
    await handleSetupButton(interaction);
    return;
  }

  const [, , arg1, arg2] = interaction.customId.split(':');

  if (action === 'mine') {
    const state = store.getChallengeByMessageId(arg1);
    if (!state) {
      await replyTemporary(interaction, { content: 'Diese Challenge wurde nicht gefunden.', ephemeral: true });
      return;
    }

    const message = await fetchStoredMessage(state);
    const ended = await maybeApplyAutomaticEnds(state, message);
    if (ended) {
      await replyTemporary(interaction, { content: 'Diese Challenge ist bereits beendet.', ephemeral: true });
      return;
    }

    const team = findTeamForUser(state, interaction.user.id);
    if (!team) {
      await replyTemporary(interaction, { content: 'Du bist in dieser Challenge in keinem Team.', ephemeral: true });
      return;
    }

    await replyTemporary(interaction, buildMyTasksMenu(state, team.id, state.messageId));
    return;
  }

  if (action === 'refresh') {
    const state = store.getChallengeByMessageId(arg1);
    if (!state) {
      await replyTemporary(interaction, { content: 'Diese Challenge wurde nicht gefunden.', ephemeral: true });
      return;
    }

    const message = await fetchStoredMessage(state);
    const ended = await maybeApplyAutomaticEnds(state, message);
    if (!ended) {
      await message.edit(buildChallengeMessage(state));
      store.saveChallenge(state);
    }
    await replyTemporary(interaction, { content: 'Status aktualisiert.', ephemeral: true });
    return;
  }

  if (action === 'cancel') {
    const state = store.getChallengeByMessageId(arg1);
    if (!state) {
      await replyTemporary(interaction, { content: 'Diese Challenge wurde nicht gefunden.', ephemeral: true });
      return;
    }

    requireCreatorOrAdmin(interaction, state);
    const message = await fetchStoredMessage(state);
    await finishChallenge(state, message, Date.now());
    await replyTemporary(interaction, { content: 'Challenge beendet.', ephemeral: true });
    return;
  }

  if (action === 'vote') {
    await handleVoteButton(interaction, arg1, arg2);
  }
}

async function startChallengeSetup(interaction) {
  const existing = store.getActiveChallengeByChannelId(interaction.channelId);
  if (existing) {
    await replyTemporary(interaction, { content: 'In diesem Kanal läuft bereits eine Challenge.', ephemeral: true });
    return;
  }

  await interaction.showModal(buildTeamCountModal());
}

async function handleSetupButton(interaction) {
  const [, , step, value, sessionId, extra] = interaction.customId.split(':');

  if (step === 'next') {
    const session = getSession(sessionId, interaction.user.id);

    if (value === 'team') {
      await interaction.showModal(buildTeamUsersModal(sessionId, Number.parseInt(extra, 10), session.teamCount));
      return;
    }

    if (value === 'mode') {
      await interaction.showModal(buildTeamModeModal(sessionId));
      return;
    }

    if (value === 'randomplayers') {
      await interaction.showModal(buildRandomPlayersModal(sessionId, session.teamCount));
      return;
    }

    if (value === 'visibility') {
      await interaction.showModal(buildVisibilityModal(sessionId));
      return;
    }

    if (value === 'tasks') {
      await updateTemporary(interaction, withoutEphemeral(buildTaskReviewPrompt(sessionId, session.tasks)));
      return;
    }

    if (value === 'timing') {
      await interaction.showModal(buildTimingModal(sessionId));
      return;
    }
  }

  const realSessionId = step === 'task' ? sessionId : value;
  const session = getSession(realSessionId, interaction.user.id);

  if (step === 'task') {
    if (value === 'add') {
      await interaction.showModal(buildTaskModal(realSessionId));
      return;
    }

    if (value === 'remove') {
      session.tasks.pop();
      await updateTemporary(interaction, withoutEphemeral(buildTaskReviewPrompt(realSessionId, session.tasks)));
      return;
    }

    if (value === 'start') {
      if (session.tasks.length === 0) {
        throw new Error('Bitte mindestens eine Aufgabe anlegen.');
      }
      await updateTemporary(interaction, withoutEphemeral(buildNextModalPrompt(realSessionId, 'timing', 'Zeit einstellen')));
      return;
    }
  }

  if (step === 'timing') {
    await interaction.showModal(buildTimingModal(realSessionId));
  }
}

async function handleStringSelect(interaction) {
  const [namespace, action] = interaction.customId.split(':');
  if (namespace !== 'wc') return;

  if (action === 'complete') {
    const [, , messageId, teamId] = interaction.customId.split(':');
    const state = store.getChallengeByMessageId(messageId);
    if (!state) {
      await replyTemporary(interaction, { content: 'Diese Challenge wurde nicht gefunden.', ephemeral: true });
      return;
    }

    const message = await fetchStoredMessage(state);
    const ended = await maybeApplyAutomaticEnds(state, message);
    if (ended) {
      await replyTemporary(interaction, { content: 'Diese Challenge ist bereits beendet.', ephemeral: true });
      return;
    }

    const team = findTeamForUser(state, interaction.user.id);
    if (!team || team.id !== teamId) {
      await replyTemporary(interaction, { content: 'Du kannst nur Aufgaben für dein eigenes Team abhaken.', ephemeral: true });
      return;
    }

    const result = markTasksComplete(state, teamId, interaction.values, Date.now());
    await message.edit(buildChallengeMessage(state));
    store.saveChallenge(state);

    if (result.allFinished) {
      await interaction.deferUpdate();
      await finishChallenge(state, message, Date.now());
      await deleteReplyQuietly(interaction);
      return;
    }

    if (state.vote?.status === 'open' && result.teamFinished && state.firstFinishTeamId === teamId) {
      await postVotePrompt(state, message);
    }

    await updateTemporary(interaction, withoutEphemeral(buildMyTasksMenu(state, teamId, message.id)));
  }
}

async function handleUserSelect() {}

async function handleModal(interaction) {
  const [namespace, action, step, sessionId] = interaction.customId.split(':');
  if (namespace !== 'wc' || action !== 'setup') return;

  if (step === 'count') {
    const teamCount = Number.parseInt(interaction.fields.getStringSelectValues('team_count')[0], 10);
    const newSessionId = createSession({
      creatorId: interaction.user.id,
      channelId: interaction.channelId,
      teamCount,
      teams: [],
      teamMode: null,
      tasks: [],
      visibility: 'all'
    });
    await replyTemporary(interaction, buildNextModalPrompt(newSessionId, 'mode', 'Teammodus auswählen'));
    return;
  }

  if (step === 'mode') {
    const session = getSession(sessionId, interaction.user.id);
    session.teamMode = interaction.fields.getStringSelectValues('team_mode')[0];

    if (session.teamMode === 'random') {
      await replyTemporary(interaction, buildNextModalPrompt(sessionId, 'randomplayers', 'Mitspieler auswählen'));
      return;
    }

    await replyTemporary(interaction, buildNextModalPrompt(sessionId, 'team', 'Team 1 auswählen', 0));
    return;
  }

  if (step === 'randomplayers') {
    const session = getSession(sessionId, interaction.user.id);
    const users = interaction.fields.getSelectedUsers('random_players', true);
    session.teams = distributeRandomTeams([...users.keys()], session.teamCount);
    await replyTemporary(interaction, buildNextModalPrompt(sessionId, 'visibility', 'Sichtbarkeit auswählen'));
    return;
  }

  if (step === 'team') {
    const teamIndex = Number.parseInt(sessionId, 10);
    const realSessionId = interaction.customId.split(':')[4];
    const teamSession = getSession(realSessionId, interaction.user.id);
    const users = interaction.fields.getSelectedUsers('team_users', true);
    teamSession.teams[teamIndex] = { userIds: [...users.keys()] };

    const nextTeamIndex = teamIndex + 1;
    if (nextTeamIndex < teamSession.teamCount) {
      await replyTemporary(interaction, buildNextModalPrompt(realSessionId, 'team', `Team ${nextTeamIndex + 1} auswählen`, nextTeamIndex));
      return;
    }

    await replyTemporary(interaction, buildNextModalPrompt(realSessionId, 'visibility', 'Sichtbarkeit auswählen'));
    return;
  }

  const session = getSession(sessionId, interaction.user.id);

  if (step === 'visibility') {
    session.visibility = interaction.fields.getStringSelectValues('visibility')[0];
    await replyTemporary(interaction, buildNextModalPrompt(sessionId, 'tasks', 'Aufgaben hinzufügen'));
    return;
  }

  if (step === 'task') {
    const task = createTask({
      index: session.tasks.length,
      title: interaction.fields.getTextInputValue('title'),
      count: interaction.fields.getTextInputValue('count'),
      b2b: interaction.fields.getCheckbox('b2b')
    });
    session.tasks.push(task);
    await replyTemporary(interaction, buildTaskReviewPrompt(sessionId, session.tasks));
    return;
  }

  if (step === 'timing') {
    const mode = interaction.fields.getStringSelectValues('timing_mode')[0];
    const timing = mode === 'limit'
      ? { type: 'limit', minutes: parsePositiveMinutes(interaction.fields.getTextInputValue('minutes')) }
      : { type: 'stopwatch' };
    await replyTemporary(interaction, { content: 'Challenge wird gestartet...', ephemeral: true });
    await startChallengeFromSession(session, timing);
    await deleteReplyQuietly(interaction);
  }
}

async function handleVoteButton(interaction, messageId, choice) {
  const state = store.getChallengeByMessageId(messageId);
  if (!state) {
    await replyTemporary(interaction, { content: 'Diese Challenge wurde nicht gefunden.', ephemeral: true });
    return;
  }

  const message = await fetchStoredMessage(state);
  const result = castVote(state, interaction.user.id, choice, Date.now());

  if (result.result === 'end' || result.result === 'timeout_end') {
    await interaction.deferUpdate();
    await finishChallenge(state, message, Date.now());
    return;
  }

  if (result.result === 'continue') {
    state.vote.status = 'continued';
    clearVoteTimer(message.id);
    await message.edit(buildChallengeMessage(state));
    store.saveChallenge(state);
    await interaction.update({ content: `Abstimmung beendet: Es wird weitergespielt. Stimmen: ${result.endVotes} Beenden / ${result.continueVotes} Weiterspielen`, embeds: [], components: [] });
    await deleteMessageQuietly(interaction.message);
    return;
  }

  await message.edit(buildChallengeMessage(state));
  store.saveChallenge(state);
  await replyTemporary(interaction, { content: `Stimme gezählt. Aktuell: ${result.endVotes} Beenden / ${result.continueVotes} Weiterspielen`, ephemeral: true });
}

async function startChallengeFromSession(session, timing) {
  const channel = await client.channels.fetch(session.channelId);
  const state = createChallenge({
    channelId: session.channelId,
    creatorId: session.creatorId,
    teams: session.teams,
    tasks: session.tasks,
    timing,
    visibility: session.visibility
  });

  const sent = await channel.send(buildChallengeMessage(state));
  state.messageId = sent.id;
  addCleanupMessage(state, sent.id);
  await sent.edit(buildChallengeMessage(state));
  store.saveChallenge(state);
  scheduleTimeLimit(state, sent);
  setupSessions.delete(session.id);
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
      if (!freshState || freshState.vote?.status !== 'open') return;
      const freshMessage = await fetchStoredMessage(freshState);
      freshState.vote.status = 'ended_by_timeout';
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
  if (state.timing?.type !== 'limit' || state.status === 'ended') return;

  const endsAt = state.startedAt + state.timing.minutes * 60 * 1000;
  const delay = Math.max(0, endsAt - Date.now());
  const timer = setTimeout(async () => {
    try {
      const freshState = store.getChallenge(state.id);
      if (!freshState || freshState.status !== 'active') return;
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
  if (state.status === 'ended') return true;

  if (state.timing?.type === 'limit') {
    const endsAt = state.startedAt + state.timing.minutes * 60 * 1000;
    if (Date.now() >= endsAt) {
      await finishChallenge(state, message, Date.now());
      return true;
    }
  }

  if (state.vote?.status === 'open' && Date.now() >= state.vote.expiresAt) {
    state.vote.status = 'ended_by_timeout';
    await finishChallenge(state, message, Date.now());
    return true;
  }

  scheduleTimeLimit(state, message);
  if (state.vote?.status === 'open') scheduleVoteTimeout(state, message);
  return false;
}

async function finishChallenge(state, message, now) {
  if (state.status === 'ended') return;
  clearVoteTimer(state.messageId);
  clearLimitTimer(state.messageId);
  endChallenge(state, now);

  const channel = message?.channel || await client.channels.fetch(state.channelId);
  await channel.send(buildSummaryMessage(state));
  await cleanupChallengeMessages(channel, state);
  store.deleteChallenge(state.id);
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
      if (state.status !== 'active') continue;
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
    .setTitle('Aufgabe hinzufügen');

  modal.addLabelComponents(
    new LabelBuilder()
      .setLabel('Titel')
      .setTextInputComponent(
        new TextInputBuilder()
        .setCustomId('title')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(80)
        .setPlaceholder('z.B. Rocket League')
    ),
    new LabelBuilder()
      .setLabel('Anzahl')
      .setTextInputComponent(
        new TextInputBuilder()
        .setCustomId('count')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(3)
        .setPlaceholder('z.B. 3')
      ),
    new LabelBuilder()
      .setLabel('BxB')
      .setDescription('Aktiviert bedeutet: Anzahl 5 wird zu b5b.')
      .setCheckboxComponent(
        new CheckboxBuilder()
          .setCustomId('b2b')
          .setDefault(false)
    )
  );

  return modal;
}

function buildTeamCountModal() {
  return new ModalBuilder()
    .setCustomId('wc:setup:count:new')
    .setTitle('Teamanzahl')
    .addLabelComponents(
      new LabelBuilder()
        .setLabel('Wie viele Teams?')
        .setStringSelectMenuComponent(
          new StringSelectMenuBuilder()
            .setCustomId('team_count')
            .setPlaceholder('Teamanzahl wählen')
            .addOptions([1, 2, 3, 4].map((count) => ({
              label: `${count} Team${count === 1 ? '' : 's'}`,
              value: String(count)
            })))
        )
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
            .setCustomId('team_users')
            .setPlaceholder('Discord-User auswählen')
            .setMinValues(1)
            .setMaxValues(25)
        )
    );
}

function buildTeamModeModal(sessionId) {
  return new ModalBuilder()
    .setCustomId(`wc:setup:mode:${sessionId}`)
    .setTitle('Teammodus')
    .addLabelComponents(
      new LabelBuilder()
        .setLabel('Wie sollen Teams erstellt werden?')
        .setStringSelectMenuComponent(
          new StringSelectMenuBuilder()
            .setCustomId('team_mode')
            .setPlaceholder('Teammodus wählen')
            .addOptions(
              { label: 'Teams manuell auswählen', value: 'manual' },
              { label: 'Teams zufällig erstellen', value: 'random' }
            )
        )
    );
}

function buildRandomPlayersModal(sessionId, teamCount) {
  return new ModalBuilder()
    .setCustomId(`wc:setup:randomplayers:${sessionId}`)
    .setTitle('Zufällige Teams')
    .addLabelComponents(
      new LabelBuilder()
        .setLabel(`Alle Mitspieler auswählen (${teamCount} Teams)`)
        .setDescription('Der Bot verteilt alle ausgewählten Spieler möglichst gleich groß auf die Teams.')
        .setUserSelectMenuComponent(
          new UserSelectMenuBuilder()
            .setCustomId('random_players')
            .setPlaceholder('Alle Mitspieler auswählen')
            .setMinValues(teamCount)
            .setMaxValues(25)
        )
    );
}

function buildVisibilityModal(sessionId) {
  return new ModalBuilder()
    .setCustomId(`wc:setup:visibility:${sessionId}`)
    .setTitle('Sichtbarkeit')
    .addLabelComponents(
      new LabelBuilder()
        .setLabel('Was dürfen Teams sehen?')
        .setStringSelectMenuComponent(
          new StringSelectMenuBuilder()
            .setCustomId('visibility')
            .setPlaceholder('Sichtbarkeit wählen')
            .addOptions(
              { label: 'Alle sehen alles', value: 'all' },
              { label: 'Nur eigenes Team', value: 'own' }
            )
        )
    );
}

function buildTimingModal(sessionId) {
  const modal = new ModalBuilder()
    .setCustomId(`wc:setup:timing:${sessionId}`)
    .setTitle('Zeitmodus');

  modal.addLabelComponents(
    new LabelBuilder()
      .setLabel('Zeitmodus')
      .setStringSelectMenuComponent(
        new StringSelectMenuBuilder()
          .setCustomId('timing_mode')
          .setPlaceholder('Zeitmodus wählen')
          .addOptions(
            { label: 'Zeit zählen', value: 'stopwatch' },
            { label: 'Zeitlimit', value: 'limit' }
          )
      ),
    new LabelBuilder()
      .setLabel('Zeitlimit in Minuten')
      .setDescription('Nur ausfüllen, wenn du Zeitlimit wählst.')
      .setTextInputComponent(
        new TextInputBuilder()
        .setCustomId('minutes')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setPlaceholder('z.B. 90')
    )
  );

  return modal;
}

function buildNextModalPrompt(sessionId, target, label, extra = null) {
  const customId = ['wc', 'setup', 'next', target, sessionId, extra]
    .filter((part) => part !== null && part !== undefined)
    .join(':');

  return {
    content: 'Klicke auf den Button, um mit dem nächsten Popup weiterzumachen.',
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(customId)
          .setLabel(label)
          .setStyle(ButtonStyle.Primary)
      )
    ],
    ephemeral: true
  };
}

function requireCreatorOrAdmin(interaction, state) {
  const isCreator = interaction.user.id === state.creatorId;
  const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
  if (!isCreator && !isAdmin) {
    throw new Error('Nur der Ersteller oder Server-Admins dürfen die Challenge beenden.');
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
    throw new Error('Setup-Session ist abgelaufen. Bitte starte die Challenge neu.');
  }
  if (session.creatorId !== userId) {
    throw new Error('Nur der Ersteller kann dieses Setup fortsetzen.');
  }
  return session;
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
    const message = await interaction.followUp({ ...payload, fetchReply: true }).catch((error) => {
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
  throw new Error('DISCORD_TOKEN muss in .env gesetzt sein.');
}

client.login(token);
