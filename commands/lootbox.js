const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const {
  addCoins,
  addItem,
  getBalance,
  incrementStat,
  spendCoins,
} = require('../services/economy');
const { formatCoins } = require('../utils/economyFormat');

const BOXES = {
  common: {
    name: 'Common Box',
    cost: 250,
    coinMin: 50,
    coinMax: 450,
    items: ['Pocket Button', 'Bent Coin', 'Tiny Trophy', 'Dusty Sticker'],
  },
  uncommon: {
    name: 'Uncommon Box',
    cost: 750,
    coinMin: 200,
    coinMax: 1_100,
    items: ['Polished Charm', 'Lucky Token', 'Blue Voucher', 'Neon Pin'],
  },
  rare: {
    name: 'Rare Box',
    cost: 2_000,
    coinMin: 750,
    coinMax: 3_400,
    items: ['Crystal Badge', 'Gold Ticket', 'Rare Relic', 'Shiny Dice'],
  },
  epic: {
    name: 'Epic Box',
    cost: 5_000,
    coinMin: 2_000,
    coinMax: 8_500,
    items: ['Epic Crown', 'Void Coupon', 'Prismatic Key', 'Royal Card'],
  },
  legendary: {
    name: 'Legendary Box',
    cost: 12_000,
    coinMin: 5_000,
    coinMax: 25_000,
    items: ['Legendary Halo', 'Mythic Coin', 'Golden Compass', 'Starlit Crown'],
  },
};

function normalizeBoxType(value) {
  const normalized = String(value ?? '')
    .toLowerCase()
    .replace(/\bbox\b/g, '')
    .trim();

  return BOXES[normalized] ? normalized : null;
}

function randomBetween(min, max) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

async function runLootbox({ guildId, user, type, reply }) {
  const boxKey = normalizeBoxType(type);

  if (!boxKey) {
    await reply(`Unknown lootbox. Try: **${Object.values(BOXES).map((box) => box.name).join('**, **')}**.`);
    return;
  }

  const box = BOXES[boxKey];
  const balance = getBalance(guildId, user);

  if (balance < box.cost) {
    await reply(`You need **${formatCoins(box.cost)}** coins for a ${box.name}. Balance: **${formatCoins(balance)}**.`);
    return;
  }

  spendCoins(guildId, user, box.cost);

  const rewardCoins = randomBetween(box.coinMin, box.coinMax);
  const item = box.items[Math.floor(Math.random() * box.items.length)];
  addCoins(guildId, user, rewardCoins);
  addItem(guildId, user, item);
  incrementStat(guildId, user, 'lootboxesOpened');

  const newBalance = getBalance(guildId, user);
  const embed = new EmbedBuilder()
    .setColor(0xfee75c)
    .setAuthor({ name: 'ZUNO • LOOTBOX' })
    .setTitle(box.name)
    .setDescription(
      [
        `Cost: **${formatCoins(box.cost)}** coins`,
        `Coins found: **${formatCoins(rewardCoins)}**`,
        `Item found: **${item}**`,
        '',
        `Balance: **${formatCoins(newBalance)}** coins.`,
      ].join('\n'),
    );

  await reply({ embeds: [embed] });
}

module.exports = {
  aliases: ['lootbox'],

  data: new SlashCommandBuilder()
    .setName('lootbox')
    .setDescription('Open a lootbox with coins.')
    .addStringOption((option) =>
      option
        .setName('type')
        .setDescription('The lootbox type to open.')
        .setRequired(true)
        .addChoices(
          ...Object.entries(BOXES).map(([value, box]) => ({
            name: box.name,
            value,
          })),
        ),
    ),

  async execute(interaction) {
    await runLootbox({
      guildId: interaction.guildId,
      user: interaction.user,
      type: interaction.options.getString('type', true),
      reply: (payload) => interaction.reply(payload),
    });
  },

  async prefixExecute(message, args) {
    await runLootbox({
      guildId: message.guildId,
      user: message.author,
      type: args.join(' '),
      reply: (payload) => message.reply(payload),
    });
  },
};
