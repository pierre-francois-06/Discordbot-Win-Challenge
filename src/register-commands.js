require('dotenv').config();
const { REST, Routes, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

const commands = [
  new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Postet das Win-Challenge Control Panel in diesem Kanal.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder()
    .setName('challenge_status')
    .setDescription('Aktualisiert die aktuelle Challenge-Nachricht in diesem Kanal.'),
  new SlashCommandBuilder()
    .setName('challenge_cancel')
    .setDescription('Beendet die aktuelle Challenge in diesem Kanal.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
].map((command) => command.toJSON());

async function main() {
  const token = process.env.DISCORD_TOKEN;
  const clientId = process.env.CLIENT_ID;
  const guildId = process.env.GUILD_ID;

  if (!token || !clientId) {
    throw new Error('DISCORD_TOKEN und CLIENT_ID müssen in .env gesetzt sein.');
  }

  const rest = new REST({ version: '10' }).setToken(token);

  if (guildId) {
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
    console.log(`Registered ${commands.length} guild commands for ${guildId}.`);
    return;
  }

  await rest.put(Routes.applicationCommands(clientId), { body: commands });
  console.log(`Registered ${commands.length} global commands.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
