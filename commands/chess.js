const {
  ApplicationIntegrationType,
  AttachmentBuilder,
  EmbedBuilder,
  InteractionContextType,
  SlashCommandBuilder,
} = require('discord.js');
const { createImage } = require('../services/chessImage');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('chess')
    .setDescription('Generate a chess board image.')
    .setIntegrationTypes(
      ApplicationIntegrationType.GuildInstall,
      ApplicationIntegrationType.UserInstall,
    )
    .setContexts(
      InteractionContextType.Guild,
      InteractionContextType.BotDM,
      InteractionContextType.PrivateChannel,
    ),

  async execute(interaction) {
    const image = createImage();
    const attachment = new AttachmentBuilder(image, {
      name: 'chess-board.png',
    });
    const embed = new EmbedBuilder()
      .setColor(0x2b2d31)
      .setAuthor({ name: 'ZUNO • CHESS' })
      .setDescription('Generated a clean chess board image.')
      .setImage('attachment://chess-board.png');

    await interaction.reply({
      embeds: [embed],
      files: [attachment],
    });
  },
};
