const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
} = require('discord.js');
const { getClanAssignment } = require('../services/clans');
const {
  RobloxApiError,
  RobloxNotFoundError,
  RobloxRateLimitError,
  getRobloxWhois,
  searchUsernames,
} = require('../services/roblox');
const {
  calculateAccountAge,
  cleanEmbedText,
  formatDate,
  formatNumber,
  joinLines,
} = require('../utils/format');

function buildWhoisEmbed(result) {
  const {
    profile,
    avatarUrl,
    socialCounts,
    badgeCount,
    clan,
    assignedClan,
    profileUrl,
  } = result;
  const safeDisplayName = cleanEmbedText(profile.displayName, 80);
  const safeUsername = cleanEmbedText(profile.username, 80);
  const createdDate = formatDate(profile.created);
  const accountAge = calculateAccountAge(profile.created);
  const description = cleanEmbedText(profile.description, 900);

  const identityLines = [
    `Display Name: **${safeDisplayName ?? 'Unknown'}**`,
    `Username: **@${safeUsername ?? profile.username}**`,
    `User ID: \`${profile.id}\``,
    createdDate ? `Created: **${createdDate}**` : null,
    accountAge ? `Account Age: **${accountAge}**` : null,
    profile.hasVerifiedBadge ? 'Verified: **Yes**' : null,
    profile.isBanned ? 'Account Status: **Banned or Deleted**' : null,
  ];

  const statsLines = [
    Number.isFinite(socialCounts.friends)
      ? `Friends: **${formatNumber(socialCounts.friends)}**`
      : null,
    Number.isFinite(socialCounts.followers)
      ? `Followers: **${formatNumber(socialCounts.followers)}**`
      : null,
    Number.isFinite(socialCounts.following)
      ? `Following: **${formatNumber(socialCounts.following)}**`
      : null,
    Number.isFinite(badgeCount)
      ? `Roblox Badges: **${formatNumber(badgeCount)}**`
      : null,
  ];

  const clanLines = [];

  if (assignedClan?.clan) {
    clanLines.push(`Assigned Clan: **${cleanEmbedText(assignedClan.clan, 80)}**`);
  }

  if (clan?.configured) {
    clanLines.push(`Status: **${clan.status}**`);

    if (clan.member) {
      if (clan.group?.name) {
        clanLines.push(`Group: **${cleanEmbedText(clan.group.name, 120)}**`);
      }

      if (clan.roleName) {
        clanLines.push(`Rank Name: **${cleanEmbedText(clan.roleName, 120)}**`);
      }

      if (Number.isFinite(clan.rank)) {
        clanLines.push(`Rank Number: **${clan.rank}**`);
      }
    }
  }

  const embed = new EmbedBuilder()
    .setColor(0x2b2d31)
    .setAuthor({
      name: 'ZUNO • ROBLOX WHOIS',
      iconURL: avatarUrl ?? undefined,
    })
    .setTitle(`${profile.displayName} (@${profile.username})`)
    .setURL(profileUrl)
    .addFields({
      name: 'IDENTITY',
      value: joinLines(identityLines),
    })
    .setFooter({ text: 'Zuno Roblox lookup' })
    .setTimestamp();

  if (avatarUrl) {
    embed.setThumbnail(avatarUrl);
  }

  if (statsLines.some(Boolean)) {
    embed.addFields({
      name: 'ROBLOX STATISTICS',
      value: joinLines(statsLines),
    });
  }

  if (description) {
    embed.addFields({
      name: 'PROFILE DESCRIPTION',
      value: description,
    });
  }

  if (clanLines.length) {
    embed.addFields({
      name: 'CLAN',
      value: joinLines(clanLines),
    });
  }

  return embed;
}

function buildProfileButton(profileUrl) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel('View Roblox Profile')
      .setStyle(ButtonStyle.Link)
      .setURL(profileUrl),
  );
}

function errorMessageFor(error) {
  if (error instanceof RobloxNotFoundError) {
    return "❌ I couldn't find that Roblox user.";
  }

  if (error instanceof RobloxRateLimitError) {
    return "❌ Roblox is rate limiting lookups right now. Please try again in a bit.";
  }

  if (error instanceof RobloxApiError) {
    return "❌ Roblox's API did not respond correctly. Please try again soon.";
  }

  return '❌ Something went wrong while looking up that Roblox user.';
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('whois')
    .setDescription('Look up a Roblox account.')
    .addStringOption((option) =>
      option
        .setName('username')
        .setDescription('The Roblox username to search for.')
        .setRequired(true)
        .setAutocomplete(true)
        .setMinLength(1)
        .setMaxLength(32),
    ),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused();

    try {
      const choices = await searchUsernames(focused);
      await interaction.respond(choices.slice(0, 10));
    } catch {
      await interaction.respond([]);
    }
  },

  async execute(interaction) {
    const username = interaction.options.getString('username', true).trim();

    if (!username) {
      await interaction.reply({
        content: "❌ I couldn't find that Roblox user.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const result = await getRobloxWhois(username);
      const assignedClan = getClanAssignment(result.profile.id);
      const embed = buildWhoisEmbed({ ...result, assignedClan });
      const row = buildProfileButton(result.profileUrl);

      if (!interaction.channel?.send) {
        await interaction.editReply({
          content: "❌ I couldn't post that lookup in this channel.",
        });
        return;
      }

      await interaction.channel.send({
        embeds: [embed],
        components: [row],
      });
      await interaction.deleteReply().catch(() => null);
    } catch (error) {
      await interaction.editReply({
        content: errorMessageFor(error),
      });
    }
  },
};
