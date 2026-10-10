require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');
const { REST, Routes } = require('discord.js');

const token = process.env.DISCORD_TOKEN;
const applicationId = process.env.DISCORD_APPLICATION_ID;
const guildId = process.env.DISCORD_GUILD_ID;

if (!token || !applicationId) {
  console.error('Missing DISCORD_TOKEN or DISCORD_APPLICATION_ID in .env');
  process.exit(1);
}

const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs
  .readdirSync(commandsPath)
  .filter((file) => file.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));

  if (command.data) {
    commands.push(command.data.toJSON());
  }
}

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  try {
    const route = guildId
      ? Routes.applicationGuildCommands(applicationId, guildId)
      : Routes.applicationCommands(applicationId);

    console.log(
      `Deploying ${commands.length} slash command(s) ${
        guildId ? `to guild ${guildId}` : 'globally'
      }...`,
    );

    if (guildId) {
      console.warn(
        'Note: DM/external slash-command support only works for globally deployed commands. Clear DISCORD_GUILD_ID and run npm run deploy to make /chess available in DMs.',
      );
    }

    await rest.put(route, { body: commands });
    console.log('Slash commands deployed.');
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
})();
