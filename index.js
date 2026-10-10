require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');
const {
  Client,
  Collection,
  GatewayIntentBits,
  MessageFlags,
} = require('discord.js');
const { applyStatus, loadSavedStatus } = require('./services/botStatus');

const token = process.env.DISCORD_TOKEN;

if (!token) {
  console.error('Missing DISCORD_TOKEN in .env');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.commands = new Collection();
client.prefixCommands = new Collection();

const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs
  .readdirSync(commandsPath)
  .filter((file) => file.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));

  if (!command.data || !command.execute) {
    console.warn(`Skipping ${file}: command is missing data or execute.`);
    continue;
  }

  client.commands.set(command.data.name, command);

  for (const alias of command.aliases ?? []) {
    client.prefixCommands.set(alias.toLowerCase(), command);
  }
}

client.once('ready', (readyClient) => {
  const savedStatus = applyStatus(readyClient, loadSavedStatus());
  console.log(`Zuno is online as ${readyClient.user.tag}`);

  if (savedStatus?.text) {
    console.log(`Loaded saved status: ${savedStatus.text}`);
  }
});

client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isAutocomplete()) {
      const command = client.commands.get(interaction.commandName);

      if (!command) {
        return;
      }

      if (typeof command.autocomplete === 'function') {
        await command.autocomplete(interaction);
      }
      return;
    }

    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);

      if (!command) {
        return;
      }

      await command.execute(interaction);
      return;
    }

    if (interaction.isButton()) {
      for (const command of client.commands.values()) {
        if (
          typeof command.handleButton === 'function' &&
          (await command.handleButton(interaction))
        ) {
          return;
        }
      }
    }
  } catch (error) {
    console.error(error);

    const payload = {
      content: '❌ Something went wrong while running that command.',
      flags: MessageFlags.Ephemeral,
    };

    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(payload).catch(() => null);
    } else {
      await interaction.reply(payload).catch(() => null);
    }
  }
});

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild || !message.content.startsWith('!')) {
    return;
  }

  const parts = message.content.slice(1).trim().split(/\s+/);
  const commandName = parts.shift()?.toLowerCase();

  if (!commandName) {
    return;
  }

  const command = client.prefixCommands.get(commandName);

  if (!command?.prefixExecute) {
    return;
  }

  try {
    await command.prefixExecute(message, parts);
  } catch (error) {
    console.error(error);
    await message.reply('❌ Something went wrong while running that command.');
  }
});

client.login(token);
