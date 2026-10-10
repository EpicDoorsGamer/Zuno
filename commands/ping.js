const { SlashCommandBuilder } = require('discord.js');

module.exports = {
  aliases: ['ping'],

  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Check Zuno latency.'),

  async execute(interaction) {
    const latency = Date.now() - interaction.createdTimestamp;
    await interaction.reply(
      `Pong. API latency: **${latency}ms**. WebSocket: **${interaction.client.ws.ping}ms**.`,
    );
  },

  async prefixExecute(message) {
    const latency = Date.now() - message.createdTimestamp;
    await message.reply(
      `Pong. API latency: **${latency}ms**. WebSocket: **${message.client.ws.ping}ms**.`,
    );
  },
};
