const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const { getUserProfile } = require('../services/economy');
const { formatCoins } = require('../utils/economyFormat');

async function runBalance({ guildId, user, targetUser, reply }) {
  const selectedUser = targetUser ?? user;
  const profile = getUserProfile(guildId, selectedUser);

  const embed = new EmbedBuilder()
    .setColor(0x2b2d31)
    .setAuthor({ name: 'ZUNO • BALANCE' })
    .setDescription(
      `**${selectedUser.tag}** has **${formatCoins(profile.balance)}** coins.`,
    );

  await reply({ embeds: [embed] });
}

module.exports = {
  aliases: ['balance', 'bal'],

  data: new SlashCommandBuilder()
    .setName('balance')
    .setDescription('Check your coin balance.')
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('Optional user to check.'),
    ),

  async execute(interaction) {
    await runBalance({
      guildId: interaction.guildId,
      user: interaction.user,
      targetUser: interaction.options.getUser('user'),
      reply: (payload) => interaction.reply(payload),
    });
  },

  async prefixExecute(message) {
    await runBalance({
      guildId: message.guildId,
      user: message.author,
      targetUser: message.mentions.users.first(),
      reply: (payload) => message.reply(payload),
    });
  },
};
