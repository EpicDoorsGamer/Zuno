const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  SlashCommandBuilder,
} = require('discord.js');
const { cleanEmbedText } = require('../utils/format');

function formatNumberText(value) {
  const raw = String(value ?? '').trim();
  const normalized = raw.replaceAll(',', '').replaceAll('_', '');
  const number = Number(normalized);

  if (!raw || !Number.isFinite(number)) {
    return cleanEmbedText(raw, 120) ?? '0';
  }

  return new Intl.NumberFormat('en-US').format(number);
}

function formatChance(value) {
  const raw = String(value ?? '').trim();
  const normalized = raw.replaceAll(',', '').replaceAll('_', '');
  const number = Number(normalized);

  if (Number.isFinite(number)) {
    return `1 in ${new Intl.NumberFormat('en-US').format(number)}`;
  }

  return cleanEmbedText(raw, 120) ?? '1 in 0';
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('fakeoreping')
    .setDescription("Create a fake Miner's World ore ping embed.")
    .addStringOption((option) =>
      option
        .setName('username')
        .setDescription('Username to show in the ping.')
        .setRequired(true)
        .setMaxLength(64),
    )
    .addStringOption((option) =>
      option
        .setName('ore')
        .setDescription('Ore name, for example Apocrypha.')
        .setRequired(true)
        .setMaxLength(100),
    )
    .addStringOption((option) =>
      option
        .setName('chance')
        .setDescription('Chance value, for example 72705392 or 1 in 72,705,392.')
        .setRequired(true)
        .setMaxLength(120),
    )
    .addStringOption((option) =>
      option
        .setName('layer')
        .setDescription('Layer name, for example Venus Stone.')
        .setRequired(true)
        .setMaxLength(100),
    )
    .addStringOption((option) =>
      option
        .setName('owned')
        .setDescription('Owned count.')
        .setRequired(true)
        .setMaxLength(40),
    )
    .addStringOption((option) =>
      option
        .setName('total_mined')
        .setDescription('Total mined count.')
        .setRequired(true)
        .setMaxLength(40),
    ),

  async execute(interaction) {
    const username =
      cleanEmbedText(
        interaction.options.getString('username', true),
        64,
      ) ?? 'unknown';
    const ore =
      cleanEmbedText(interaction.options.getString('ore', true), 100) ??
      'Apocrypha';
    const chance = formatChance(interaction.options.getString('chance', true));
    const layer =
      cleanEmbedText(
        interaction.options.getString('layer', true),
        100,
      ) ?? 'Unknown';
    const owned = formatNumberText(interaction.options.getString('owned', true));
    const totalMined = formatNumberText(
      interaction.options.getString('total_mined', true),
    );

    const embed = new EmbedBuilder()
      .setColor(0x9ad7ff)
      .setTitle("Miner's World • Ore ping")
      .setDescription(
        [
          `# ${ore}`,
          '',
          `**@\u200b${username} · Celestial**`,
          '*Marked as duped.*',
          '',
          '---',
          `**Chance** · ${chance}`,
          `**Layer** · ${layer}`,
          `**Owned** · ${owned}`,
          `**Total mined** · ${totalMined}`,
        ].join('\n'),
      )
      .setFooter({ text: 'JS-Utility • Ore ping' });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('fakeoreping:website')
        .setLabel('Website')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
    );

    await interaction.reply({
      embeds: [embed],
      components: [row],
    });
  },
};
