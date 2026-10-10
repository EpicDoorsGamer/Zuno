const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const {
  addCoins,
  checkCooldown,
  incrementStat,
  setCooldown,
} = require('../services/economy');
const { formatCoins, formatDuration } = require('../utils/economyFormat');

const WORK_COOLDOWN_MS = 30 * 60 * 1000;
const JOBS = [
  'organized a suspiciously large spreadsheet',
  'delivered premium air to a VIP',
  'debugged a microwave',
  'counted server pixels',
  'polished the command menu',
  'sold a very convincing empty box',
  'translated caffeine into productivity',
];

function workReward() {
  return Math.floor(120 + Math.random() * 301);
}

async function runWork({ guildId, user, reply }) {
  const cooldown = checkCooldown(guildId, user, 'work', WORK_COOLDOWN_MS);

  if (!cooldown.ready) {
    await reply(`You need a break. Work again in **${formatDuration(cooldown.remainingMs)}**.`);
    return;
  }

  const reward = workReward();
  const job = JOBS[Math.floor(Math.random() * JOBS.length)];
  const balance = addCoins(guildId, user, reward);
  setCooldown(guildId, user, 'work');
  incrementStat(guildId, user, 'workCount');

  const embed = new EmbedBuilder()
    .setColor(0x2b2d31)
    .setAuthor({ name: 'ZUNO • WORK' })
    .setDescription(
      `You ${job} and earned **${formatCoins(reward)}** coins.\nBalance: **${formatCoins(balance)}** coins.`,
    );

  await reply({ embeds: [embed] });
}

module.exports = {
  aliases: ['work'],

  data: new SlashCommandBuilder()
    .setName('work')
    .setDescription('Work for coins.'),

  async execute(interaction) {
    await runWork({
      guildId: interaction.guildId,
      user: interaction.user,
      reply: (payload) => interaction.reply(payload),
    });
  },

  async prefixExecute(message) {
    await runWork({
      guildId: message.guildId,
      user: message.author,
      reply: (payload) => message.reply(payload),
    });
  },
};
