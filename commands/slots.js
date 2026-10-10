const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const {
  addCoins,
  getBalance,
  incrementStat,
  spendCoins,
} = require('../services/economy');
const { formatCoins, parseBet } = require('../utils/economyFormat');

const SYMBOLS = ['Cherry', 'Bell', 'Star', 'Gem', 'Seven'];
const PAYOUTS = {
  Cherry: 3,
  Bell: 4,
  Star: 5,
  Gem: 7,
  Seven: 10,
};
const MAX_BET = 50_000;

function spinSlots() {
  return Array.from({ length: 3 }, () => SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]);
}

function getPayout(spin, bet) {
  const [a, b, c] = spin;

  if (a === b && b === c) {
    return bet * PAYOUTS[a];
  }

  if (a === b || a === c || b === c) {
    return Math.floor(bet * 1.5);
  }

  return 0;
}

async function runSlots({ guildId, user, bet, reply }) {
  const wager = Math.min(parseBet(bet, 100), MAX_BET);
  const balance = getBalance(guildId, user);

  if (balance < wager) {
    await reply(`You need **${formatCoins(wager)}** coins to spin. Balance: **${formatCoins(balance)}**.`);
    return;
  }

  spendCoins(guildId, user, wager);

  const spin = spinSlots();
  const payout = getPayout(spin, wager);
  const won = payout > 0;
  const newBalance = won
    ? addCoins(guildId, user, payout)
    : getBalance(guildId, user);

  incrementStat(guildId, user, won ? 'slotsWins' : 'slotsLosses');

  const embed = new EmbedBuilder()
    .setColor(won ? 0x57f287 : 0xed4245)
    .setAuthor({ name: 'ZUNO • SLOTS' })
    .setDescription(
      [
        `**[ ${spin.join(' | ')} ]**`,
        '',
        won
          ? `You won **${formatCoins(payout)}** coins.`
          : `No match. You lost **${formatCoins(wager)}** coins.`,
        `Balance: **${formatCoins(newBalance)}** coins.`,
      ].join('\n'),
    );

  await reply({ embeds: [embed] });
}

module.exports = {
  aliases: ['slots'],

  data: new SlashCommandBuilder()
    .setName('slots')
    .setDescription('Spin the slot machine.')
    .addIntegerOption((option) =>
      option
        .setName('bet')
        .setDescription('Coins to bet. Default is 100.')
        .setMinValue(1)
        .setMaxValue(MAX_BET),
    ),

  async execute(interaction) {
    await runSlots({
      guildId: interaction.guildId,
      user: interaction.user,
      bet: interaction.options.getInteger('bet') ?? 100,
      reply: (payload) => interaction.reply(payload),
    });
  },

  async prefixExecute(message, args) {
    await runSlots({
      guildId: message.guildId,
      user: message.author,
      bet: args[0] ?? 100,
      reply: (payload) => message.reply(payload),
    });
  },
};
