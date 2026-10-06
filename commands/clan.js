const {
  MessageFlags,
  SlashCommandBuilder,
} = require('discord.js');
const { assignClan, SUPPORTED_CLANS } = require('../services/clans');
const { getRobloxWhois, searchUsernames } = require('../services/roblox');
const { cleanEmbedText } = require('../utils/format');
const { hasRoleOrAbove } = require('../utils/roles');

const CLAN_MANAGER_ROLE_ID =
  process.env.CLAN_MANAGER_ROLE_ID || '1492957184261230642';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clan')
    .setDescription('Manage Roblox clan info for Zuno lookups.')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('assign')
        .setDescription('Assign WLAN to a Roblox account.')
        .addStringOption((option) =>
          option
            .setName('username')
            .setDescription('The Roblox username to assign WLAN to.')
            .setRequired(true)
            .setAutocomplete(true)
            .setMinLength(1)
            .setMaxLength(32),
        )
        .addStringOption((option) =>
          option
            .setName('clan')
            .setDescription('The clan to assign.')
            .setRequired(true)
            .addChoices(
              ...SUPPORTED_CLANS.map((clan) => ({
                name: clan,
                value: clan,
              })),
            ),
        ),
    ),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused(true);

    if (focused.name !== 'username') {
      await interaction.respond([]);
      return;
    }

    try {
      const choices = await searchUsernames(focused.value);
      await interaction.respond(choices.slice(0, 10));
    } catch {
      await interaction.respond([]);
    }
  },

  async execute(interaction) {
    if (interaction.options.getSubcommand() !== 'assign') {
      await interaction.reply({
        content: '❌ Unknown clan command.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    if (!(await hasRoleOrAbove(interaction, CLAN_MANAGER_ROLE_ID))) {
      await interaction.reply({
        content:
          '❌ You need the configured clan manager role or a higher role to assign clans.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const username = interaction.options.getString('username', true).trim();
    const clan = interaction.options.getString('clan', true);

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const result = await getRobloxWhois(username);
      const assignment = assignClan(result.profile, clan, interaction.user.id);
      const displayName = cleanEmbedText(result.profile.displayName, 80);
      const robloxUsername = cleanEmbedText(result.profile.username, 80);

      await interaction.editReply({
        content: `✅ Assigned **${assignment.clan}** to **${displayName} (@${robloxUsername})**.`,
      });
    } catch {
      await interaction.editReply({
        content: "❌ I couldn't find that Roblox user.",
      });
    }
  },
};
