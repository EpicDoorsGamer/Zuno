const {
  ActivityType,
  MessageFlags,
  SlashCommandBuilder,
} = require('discord.js');
const {
  applyStatus,
  clearStatus,
  saveStatus,
} = require('../services/botStatus');
const { isBotOwner } = require('../utils/owners');

const ACTIVITY_CHOICES = [
  { name: 'Playing', value: String(ActivityType.Playing) },
  { name: 'Watching', value: String(ActivityType.Watching) },
  { name: 'Listening', value: String(ActivityType.Listening) },
  { name: 'Competing', value: String(ActivityType.Competing) },
];

const PRESENCE_CHOICES = [
  { name: 'Online', value: 'online' },
  { name: 'Idle', value: 'idle' },
  { name: 'Do Not Disturb', value: 'dnd' },
  { name: 'Invisible', value: 'invisible' },
];

async function requireOwner(interaction) {
  if (isBotOwner(interaction.user.id)) {
    return true;
  }

  await interaction.reply({
    content: '❌ Only the bot owner can use this command.',
    flags: MessageFlags.Ephemeral,
  });
  return false;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('status')
    .setDescription('Change Zuno’s bot status.')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('set')
        .setDescription('Set the bot presence text.')
        .addStringOption((option) =>
          option
            .setName('text')
            .setDescription('The status text to show.')
            .setRequired(true)
            .setMaxLength(128),
        )
        .addStringOption((option) =>
          option
            .setName('type')
            .setDescription('The activity type.')
            .addChoices(...ACTIVITY_CHOICES),
        )
        .addStringOption((option) =>
          option
            .setName('presence')
            .setDescription('The online presence.')
            .addChoices(...PRESENCE_CHOICES),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('clear')
        .setDescription('Clear the saved bot status.'),
    ),

  async execute(interaction) {
    if (!(await requireOwner(interaction))) {
      return;
    }

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'clear') {
      clearStatus();
      applyStatus(interaction.client);

      await interaction.reply({
        content: '✅ Cleared Zuno’s status.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const text = interaction.options.getString('text', true).trim();

    if (!text) {
      await interaction.reply({
        content: '❌ Status text cannot be empty.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const activityType = Number.parseInt(
      interaction.options.getString('type') ?? String(ActivityType.Playing),
      10,
    );
    const presence = interaction.options.getString('presence') ?? 'online';
    const status = {
      text,
      activityType,
      presence,
      updatedBy: interaction.user.id,
      updatedAt: new Date().toISOString(),
    };

    saveStatus(status);
    applyStatus(interaction.client, status);

    await interaction.reply({
      content: `✅ Updated Zuno’s status to **${text}**.`,
      flags: MessageFlags.Ephemeral,
    });
  },
};
