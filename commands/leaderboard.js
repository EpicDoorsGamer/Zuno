const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const { getLeaderboard } = require('../services/economy');
const { formatCoins } = require('../utils/economyFormat');

async function runLeaderboard({ guildId, reply }) {
  const leaders = getLeaderboard(guildId, 10);
  const description = leaders.length
    ? leaders
        .map(
          (entry, index) =>
            `**${index + 1}.** <@${entry.userId}> - **${formatCoins(entry.balance)}** coins`,
        )
        .join('\n')
    : 'No economy profiles yet.';

  const embed = new EmbedBuilder()
    .setColor(0x2b2d31)
    .setAuthor({ name: 'ZUNO • LEADERBOARD' })
    .setDescription(description);

  await reply({ embeds: [embed] });
}

module.exports = {
  aliases: ['leaderboard', 'lb'],

  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Show the richest users in this server.'),

  async execute(interaction) {
    await runLeaderboard({
      guildId: interaction.guildId,
      reply: (payload) => interaction.reply(payload),
    });
  },

  async prefixExecute(message) {
    await runLeaderboard({
      guildId: message.guildId,
      reply: (payload) => message.reply(payload),
    });
  },
};
