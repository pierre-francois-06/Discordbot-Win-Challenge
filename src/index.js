require('dotenv').config();

const {
  ActionRowBuilder,
  Client,
  Events,
  GatewayIntentBits,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');
const { createTask } = require('./tasks');
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
  buildB2bPrompt,
  buildChallengeMessage,
  buildMyTasksMenu,
  buildSetupPanel,
  buildSummaryMessage,
  buildTaskReviewPrompt,
  buildTeamCountPrompt,
  buildTeamUserPrompt,
  buildTimingPrompt,
  buildVisibilityPrompt,
  buildVoteMessage
} = require('./ui');

const setupSessions = new Map();
const voteTimers = new Map();
const limitTimers = new Map();
const store = createStore();

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

  if (interaction.commandName === 'challenge_status') {
    const state = store.getActiveChallengeByChannelId(interaction.channelId);
    if (!state) {
      await interaction.reply({ content: 'In diesem Kanal laeuft gerade keine Challenge.', ephemeral: true });
      return;
    }

    const message = await fetchStoredMessage(state);
    const ended = await maybeApplyAutomaticEnds(state, message);
    if (!ended) {
      await message.edit(buildChallengeMessage(state));
      store.saveChallenge(state);
    }
    await interaction.reply({ content: `Status aktualisiert: ${message.url}`, ephemeral: true });
    return;
  }

  if (interaction.commandName === 'challenge_cancel') {
    const state = store.getActiveChallengeByChannelId(interaction.channelId);
    if (!state) {
      await interaction.reply({ content: 'In diesem Kanal laeuft gerade keine Challenge.', ephemeral: true });
      return;
    }

    requireCreatorOrAdmin(interaction, state);
    const message = await fetchStoredMessage(state);
    await finishChallenge(state, message, Date.now());
    await interaction.reply({ content: 'Challenge beendet.', ephemeral: true });
  }
}

async function handleButton(interaction) {
  const [namespace, action, arg1, arg2, arg3] = interaction.customId.split(':');
  if (namespace !== 'wc') return;

  if (action === 'new') {
    const existing = store.getActiveChallengeByChannelId(interaction.channelId);
    if (existing) {
      await interaction.reply({ content: 'In diesem Kanal laeuft bereits eine Challenge.', ephemeral: true });
      return;
    }
    await interaction.reply(buildTeamCountPrompt());
    return;
  }

  if (action === 'setup') {
    await handleSetupButton(interaction, arg1, arg2, arg3);
    return;
  }

  if (action === 'mine') {
    const state = store.getChallengeByMessageId(arg1);
    if (!state) {
      await interaction.reply({ content: 'Diese Challenge wurde nicht gefunden.', ephemeral: true });
      return;
    }

    const message = await fetchStoredMessage(state);
    const ended = await maybeApplyAutomaticEnds(state, message);
    if (ended) {
      await interaction.reply({ content: 'Diese Challenge ist bereits beendet.', ephemeral: true });
      return;
    }

    const team = findTeamForUser(state, interaction.user.id);
    if (!team) {
      await interaction.reply({ content: 'Du bist in dieser Challenge in keinem Team.', ephemeral: true });
      return;
    }

    await interaction.reply(buildMyTasksMenu(state, team.id, state.messageId));
    return;
  }

  if (action === 'refresh') {
    const state = store.getChallengeByMessageId(arg1);
    if (!state) {
      await interaction.reply({ content: 'Diese Challenge wurde nicht gefunden.', ephemeral: true });
      return;
    }

    const message = await fetchStoredMessage(state);
    const ended = await maybeApplyAutomaticEnds(state, message);
    if (!ended) {
      await message.edit(buildChallengeMessage(state));
      store.saveChallenge(state);
    }
    await interaction.reply({ content: 'Status aktualisiert.', ephemeral: true });
    return;
  }

  if (action === 'cancel') {
    const state = store.getChallengeByMessageId(arg1);
    if (!state) {
      await interaction.reply({ content: 'Diese Challenge wurde nicht gefunden.', ephemeral: true });
      return;
    }

    requireCreatorOrAdmin(interaction, state);
    const message = await fetchStoredMessage(state);
    await finishChallenge(state, message, Date.now());
    await interaction.reply({ content: 'Challenge beendet.', ephemeral: true });
    return;
  }

  if (action === 'vote') {
    await handleVoteButton(interaction, arg1, arg2);
  }
}

async function handleSetupButton(interaction, step, arg2, arg3) {
  const sessionId = step === 'task' ? arg3 : arg2;
  const value = step === 'task' ? arg2 : arg3;
  const session = getSession(sessionId, interaction.user.id);

  if (step === 'visibility') {
    session.visibility = value === 'own' ? 'own' : 'all';
    await interaction.update(withoutEphemeral(buildTaskReviewPrompt(sessionId, session.tasks)));
    return;
  }

  if (step === 'task') {
    if (value === 'add') {
      await interaction.showModal(buildTaskModal(sessionId));
      return;
    }

    if (value === 'remove') {
      session.tasks.pop();
      await interaction.update(withoutEphemeral(buildTaskReviewPrompt(sessionId, session.tasks)));
      return;
    }

    if (value === 'start') {
      if (session.tasks.length === 0) {
        throw new Error('Bitte mindestens eine Aufgabe anlegen.');
      }
      await interaction.update(withoutEphemeral(buildTimingPrompt(sessionId)));
      return;
    }
  }

  if (step === 'b2b') {
    const pendingTask = session.pendingTask;
    if (!pendingTask) {
      throw new Error('Keine offene Aufgabe gefunden.');
    }

    session.tasks.push(createTask({
      index: session.tasks.length,
      title: pendingTask.title,
      count: pendingTask.count,
      b2b: value === 'yes'
    }));
    session.pendingTask = null;
    await interaction.update(withoutEphemeral(buildTaskReviewPrompt(sessionId, session.tasks)));
    return;
  }

  if (step === 'timing') {
    if (value === 'stopwatch') {
      await interaction.deferUpdate();
      await startChallengeFromSession(session, { type: 'stopwatch' });
      return;
    }

    if (value === 'limit') {
      await interaction.showModal(buildLimitModal(sessionId));
    }
  }
}

async function handleStringSelect(interaction) {
  const [namespace, action] = interaction.customId.split(':');
  if (namespace !== 'wc') return;

  if (action === 'setup' && interaction.customId === 'wc:setup:count') {
    const teamCount = Number.parseInt(interaction.values[0], 10);
    const sessionId = createSession({
      creatorId: interaction.user.id,
      channelId: interaction.channelId,
      teamCount,
      teams: [],
      tasks: [],
      visibility: 'all',
      pendingTask: null
    });

    await interaction.update(withoutEphemeral(buildTeamUserPrompt(sessionId, 0, teamCount)));
    return;
  }

  if (action === 'complete') {
    const [, , messageId, teamId] = interaction.customId.split(':');
    const state = store.getChallengeByMessageId(messageId);
    if (!state) {
      await interaction.reply({ content: 'Diese Challenge wurde nicht gefunden.', ephemeral: true });
      return;
    }

    const message = await fetchStoredMessage(state);
    const ended = await maybeApplyAutomaticEnds(state, message);
    if (ended) {
      await interaction.reply({ content: 'Diese Challenge ist bereits beendet.', ephemeral: true });
      return;
    }

    const team = findTeamForUser(state, interaction.user.id);
    if (!team || team.id !== teamId) {
      await interaction.reply({ content: 'Du kannst nur Aufgaben fuer dein eigenes Team abhaken.', ephemeral: true });
      return;
    }

    const result = markTasksComplete(state, teamId, interaction.values, Date.now());
    await message.edit(buildChallengeMessage(state));
    store.saveChallenge(state);

    if (result.allFinished) {
      await finishChallenge(state, message, Date.now());
      await interaction.update({ content: 'Alle Teams sind fertig. Challenge beendet.', embeds: [], components: [] });
      return;
    }

    if (state.vote?.status === 'open' && result.teamFinished && state.firstFinishTeamId === teamId) {
      await postVotePrompt(state, message);
    }

    await interaction.update(withoutEphemeral(buildMyTasksMenu(state, teamId, message.id)));
  }
}

async function handleUserSelect(interaction) {
  const [namespace, action, step, sessionId, teamIndexRaw] = interaction.customId.split(':');
  if (namespace !== 'wc' || action !== 'setup' || step !== 'team') return;

  const session = getSession(sessionId, interaction.user.id);
  const teamIndex = Number.parseInt(teamIndexRaw, 10);
  session.teams[teamIndex] = { userIds: interaction.values };

  const nextTeamIndex = teamIndex + 1;
  if (nextTeamIndex < session.teamCount) {
    await interaction.update(withoutEphemeral(buildTeamUserPrompt(sessionId, nextTeamIndex, session.teamCount)));
    return;
  }

  await interaction.update(withoutEphemeral(buildVisibilityPrompt(sessionId)));
}

async function handleModal(interaction) {
  const [namespace, action, step, sessionId] = interaction.customId.split(':');
  if (namespace !== 'wc' || action !== 'setup') return;

  const session = getSession(sessionId, interaction.user.id);

  if (step === 'task') {
    session.pendingTask = {
      title: interaction.fields.getTextInputValue('title'),
      count: interaction.fields.getTextInputValue('count')
    };
    createTask({
      index: session.tasks.length,
      title: session.pendingTask.title,
      count: session.pendingTask.count,
      b2b: false
    });
    await interaction.reply(buildB2bPrompt(sessionId, session.pendingTask));
    return;
  }

  if (step === 'limit') {
    const minutes = parsePositiveMinutes(interaction.fields.getTextInputValue('minutes'));
    await interaction.reply({ content: 'Challenge wird gestartet...', ephemeral: true });
    await startChallengeFromSession(session, { type: 'limit', minutes });
  }
}

async function handleVoteButton(interaction, messageId, choice) {
  const state = store.getChallengeByMessageId(messageId);
  if (!state) {
    await interaction.reply({ content: 'Diese Challenge wurde nicht gefunden.', ephemeral: true });
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
  await interaction.reply({ content: `Stimme gezaehlt. Aktuell: ${result.endVotes} Beenden / ${result.continueVotes} Weiterspielen`, ephemeral: true });
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
    .setTitle('Aufgabe hinzufuegen');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('title')
        .setLabel('Titel')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(80)
        .setPlaceholder('z.B. Rocket League')
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('count')
        .setLabel('Anzahl')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(3)
        .setPlaceholder('z.B. 3')
    )
  );

  return modal;
}

function buildLimitModal(sessionId) {
  const modal = new ModalBuilder()
    .setCustomId(`wc:setup:limit:${sessionId}`)
    .setTitle('Zeitlimit');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('minutes')
        .setLabel('Zeitlimit in Minuten')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('z.B. 90')
    )
  );

  return modal;
}

function requireCreatorOrAdmin(interaction, state) {
  const isCreator = interaction.user.id === state.creatorId;
  const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild);
  if (!isCreator && !isAdmin) {
    throw new Error('Nur der Ersteller oder Server-Admins duerfen die Challenge beenden.');
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

async function safeReply(interaction, content) {
  const payload = { content, ephemeral: true };
  if (interaction.deferred || interaction.replied) {
    await interaction.followUp(payload).catch(console.error);
    return;
  }
  await interaction.reply(payload).catch(console.error);
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
