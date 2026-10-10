const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const {
  addCoins,
  checkCooldown,
  incrementStat,
  setCooldown,
} = require('../services/economy');
const { formatCoins, formatDuration } = require('../utils/economyFormat');

const DAILY_COOLDOWN_MS = 24 * 60 * 60 * 1000;

function dailyReward() {
  return Math.floor(500 + Math.random() * 401);
}

async function runDaily({ guildId, user, reply }) {
  const cooldown = checkCooldown(guildId, user, 'daily', DAILY_COOLDOWN_MS);

  if (!cooldown.ready) {
    await reply(`You already claimed daily. Try again in **${formatDuration(cooldown.remainingMs)}**.`);
    return;
  }

  const reward = dailyReward();
  const balance = addCoins(guildId, user, reward);
  setCooldown(guildId, user, 'daily');
  incrementStat(guildId, user, 'dailyCount');

  const embed = new EmbedBuilder()
    .setColor(0x2b2d31)
    .setAuthor({ name: 'ZUNO • DAILY' })
    .setDescription(
      `You claimed **${formatCoins(reward)}** coins.\nBalance: **${formatCoins(balance)}** coins.`,
    );

  await reply({ embeds: [embed] });
}

module.exports = {
  aliases: ['daily'],

  data: new SlashCommandBuilder()
    .setName('daily')
    .setDescription('Claim your daily coins.'),

  async execute(interaction) {
    await runDaily({
      guildId: interaction.guildId,
      user: interaction.user,
      reply: (payload) => interaction.reply(payload),
    });
  },

  async prefixExecute(message) {
    await runDaily({
      guildId: message.guildId,
      user: message.author,
      reply: (payload) => message.reply(payload),
    });
  },
};
