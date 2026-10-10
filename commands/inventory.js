const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const { getUserProfile } = require('../services/economy');

function formatInventory(inventory) {
  const entries = Object.entries(inventory ?? {}).filter(([, count]) => count > 0);

  if (entries.length === 0) {
    return 'Inventory is empty.';
  }

  return entries
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([item, count]) => `**${item}** x${count}`)
    .join('\n');
}

async function runInventory({ guildId, user, targetUser, reply }) {
  const selectedUser = targetUser ?? user;
  const profile = getUserProfile(guildId, selectedUser);

  const embed = new EmbedBuilder()
    .setColor(0x2b2d31)
    .setAuthor({ name: 'ZUNO • INVENTORY' })
    .setTitle(selectedUser.tag)
    .setDescription(formatInventory(profile.inventory));

  await reply({ embeds: [embed] });
}

module.exports = {
  aliases: ['inventory', 'iv'],

  data: new SlashCommandBuilder()
    .setName('inventory')
    .setDescription('View your inventory.')
    .addUserOption((option) =>
      option
        .setName('user')
        .setDescription('Optional user to check.'),
    ),

  async execute(interaction) {
    await runInventory({
      guildId: interaction.guildId,
      user: interaction.user,
      targetUser: interaction.options.getUser('user'),
      reply: (payload) => interaction.reply(payload),
    });
  },

  async prefixExecute(message) {
    await runInventory({
      guildId: message.guildId,
      user: message.author,
      targetUser: message.mentions.users.first(),
      reply: (payload) => message.reply(payload),
    });
  },
};
