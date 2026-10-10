const { Chess } = require('chess.js');
const {
  ApplicationIntegrationType,
  AttachmentBuilder,
  EmbedBuilder,
  InteractionContextType,
  MessageFlags,
  SlashCommandBuilder,
} = require('discord.js');
const { createImage } = require('../services/chessImage');
const { clearGame, getGame, setGame } = require('../services/chessGames');

const SQUARE_PATTERN = /^[a-h][1-8]$/;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('chess')
    .setDescription('Play a turn-based chess game with a generated board.')
    .setIntegrationTypes(
      ApplicationIntegrationType.GuildInstall,
      ApplicationIntegrationType.UserInstall,
    )
    .setContexts(
      InteractionContextType.Guild,
      InteractionContextType.BotDM,
      InteractionContextType.PrivateChannel,
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('start')
        .setDescription('Start a chess game in this channel or DM.')
        .addUserOption((option) =>
          option
            .setName('opponent')
            .setDescription('The user playing the other side. Leave empty for solo mode.')
            .setRequired(false),
        )
        .addStringOption((option) =>
          option
            .setName('color')
            .setDescription('Your color when challenging another user.')
            .setRequired(false)
            .addChoices(
              { name: 'White', value: 'white' },
              { name: 'Black', value: 'black' },
              { name: 'Random', value: 'random' },
            ),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('move')
        .setDescription('Play a move in the active chess game.')
        .addStringOption((option) =>
          option
            .setName('from')
            .setDescription('Starting square, like e2.')
            .setRequired(true)
            .setMinLength(2)
            .setMaxLength(2),
        )
        .addStringOption((option) =>
          option
            .setName('to')
            .setDescription('Target square, like e4.')
            .setRequired(true)
            .setMinLength(2)
            .setMaxLength(2),
        )
        .addStringOption((option) =>
          option
            .setName('promotion')
            .setDescription('Promotion piece when a pawn reaches the last rank.')
            .setRequired(false)
            .addChoices(
              { name: 'Queen', value: 'q' },
              { name: 'Rook', value: 'r' },
              { name: 'Bishop', value: 'b' },
              { name: 'Knight', value: 'n' },
            ),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('board')
        .setDescription('Show the current chess board.')
        .addStringOption((option) =>
          option
            .setName('orientation')
            .setDescription('Which side to view the board from.')
            .setRequired(false)
            .addChoices(
              { name: 'White', value: 'white' },
              { name: 'Black', value: 'black' },
            ),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('resign')
        .setDescription('Resign and end the active chess game.'),
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'start') {
      await handleStart(interaction);
      return;
    }

    if (subcommand === 'move') {
      await handleMove(interaction);
      return;
    }

    if (subcommand === 'board') {
      await handleBoard(interaction);
      return;
    }

    if (subcommand === 'resign') {
      await handleResign(interaction);
    }
  },
};

async function handleStart(interaction) {
  if (!interaction.channelId) {
    await replyError(interaction, '❌ I need a channel or DM to store this chess game.');
    return;
  }

  const existingGame = getGame(interaction.channelId);

  if (existingGame) {
    await replyError(interaction, '❌ There is already an active chess game here. Use `/chess board`, `/chess move`, or `/chess resign`.');
    return;
  }

  const opponent = interaction.options.getUser('opponent');

  if (opponent?.bot) {
    await replyError(interaction, '❌ I can\'t start chess games against bots yet.');
    return;
  }

  if (opponent?.id === interaction.user.id) {
    await replyError(interaction, '❌ Choose another player, or leave opponent empty for solo mode.');
    return;
  }

  const requestedColor = interaction.options.getString('color') ?? 'white';
  const userColor = opponent ? chooseUserColor(requestedColor) : 'white';
  const whiteId = opponent && userColor === 'black' ? opponent.id : interaction.user.id;
  const blackId = opponent && userColor === 'white' ? opponent.id : interaction.user.id;
  const chess = new Chess();

  const game = setGame(interaction.channelId, {
    guildId: interaction.guildId ?? null,
    mode: opponent ? 'versus' : 'solo',
    createdBy: interaction.user.id,
    createdAt: new Date().toISOString(),
    whiteId,
    blackId,
    fen: chess.fen(),
    moves: [],
    lastMoveSan: null,
    lastMoveSquares: [],
  });

  await replyWithBoard(interaction, game, {
    title: opponent ? 'Game Started' : 'Solo Board Started',
  });
}

async function handleMove(interaction) {
  const game = getGame(interaction.channelId);

  if (!game) {
    await replyError(interaction, '❌ No chess game is active here. Start one with `/chess start`.');
    return;
  }

  const from = interaction.options.getString('from', true).toLowerCase();
  const to = interaction.options.getString('to', true).toLowerCase();
  const promotion = interaction.options.getString('promotion') ?? undefined;

  if (!SQUARE_PATTERN.test(from) || !SQUARE_PATTERN.test(to)) {
    await replyError(interaction, '❌ Use normal chess squares like `e2` and `e4`.');
    return;
  }

  const chess = loadChess(game);
  const expectedPlayer = getExpectedPlayer(game, chess.turn());

  if (!canMoveForTurn(game, interaction.user.id, expectedPlayer)) {
    await replyError(interaction, `❌ It is ${sideName(chess.turn())}'s turn${expectedPlayer ? `: <@${expectedPlayer}>` : ''}.`);
    return;
  }

  let move;

  try {
    move = chess.move({ from, to, promotion });
  } catch {
    await replyError(interaction, '❌ That is not a legal chess move.');
    return;
  }

  if (!move) {
    await replyError(interaction, '❌ That is not a legal chess move.');
    return;
  }

  const moves = [
    ...(game.moves ?? []),
    {
      from,
      to,
      promotion: promotion ?? null,
      san: move.san,
      by: interaction.user.id,
      at: new Date().toISOString(),
    },
  ];
  const updatedGame = {
    ...game,
    fen: chess.fen(),
    moves,
    lastMoveSan: move.san,
    lastMoveSquares: [from, to],
  };

  const savedGame = setGame(interaction.channelId, updatedGame);
  const response = buildChessResponse(savedGame, {
    title: `Move Played: ${move.san}`,
    orientation: getDefaultOrientation(savedGame, interaction.user.id),
  });

  if (chess.isGameOver()) {
    clearGame(interaction.channelId);
    response.embeds[0].setFooter({ text: 'Game ended. Start another with /chess start.' });
  }

  await interaction.reply(response);
}

async function handleBoard(interaction) {
  const game = getGame(interaction.channelId);

  if (!game) {
    await replyError(interaction, '❌ No chess game is active here. Start one with `/chess start`.');
    return;
  }

  await replyWithBoard(interaction, game, {
    orientation: interaction.options.getString('orientation') ?? getDefaultOrientation(game, interaction.user.id),
    title: 'Current Board',
  });
}

async function handleResign(interaction) {
  const game = getGame(interaction.channelId);

  if (!game) {
    await replyError(interaction, '❌ No chess game is active here.');
    return;
  }

  if (!isPlayer(game, interaction.user.id)) {
    await replyError(interaction, '❌ Only a player in this chess game can resign.');
    return;
  }

  const chess = loadChess(game);
  const resigningSide = getPlayerSide(game, interaction.user.id) ?? chess.turn();
  const winner = resigningSide === 'w' ? 'Black' : 'White';

  clearGame(interaction.channelId);

  const embed = new EmbedBuilder()
    .setColor(0x2b2d31)
    .setAuthor({ name: 'ZUNO • CHESS' })
    .setTitle('Game Resigned')
    .setDescription(`${sideName(resigningSide)} resigned. ${winner} wins.`)
    .addFields(
      { name: 'White', value: playerMention(game.whiteId), inline: true },
      { name: 'Black', value: playerMention(game.blackId), inline: true },
    )
    .setFooter({ text: 'Game ended. Start another with /chess start.' });

  await interaction.reply({ embeds: [embed] });
}

function buildChessResponse(game, options = {}) {
  const chess = loadChess(game);
  const orientation = options.orientation === 'black' ? 'black' : 'white';
  const image = createImage({
    fen: chess.fen(),
    highlights: game.lastMoveSquares ?? [],
    orientation,
  });
  const attachment = new AttachmentBuilder(image, {
    name: 'chess-board.png',
  });
  const embed = new EmbedBuilder()
    .setColor(0x2b2d31)
    .setAuthor({ name: 'ZUNO • CHESS' })
    .setTitle(options.title ?? 'Chess Board')
    .setDescription('Move with `/chess move from:e2 to:e4`.')
    .addFields(
      { name: 'White', value: playerMention(game.whiteId), inline: true },
      { name: 'Black', value: playerMention(game.blackId), inline: true },
      { name: 'Turn', value: getGameStatus(chess), inline: true },
    )
    .setImage('attachment://chess-board.png')
    .setFooter({ text: `Viewing as ${orientation}.` });

  if (game.lastMoveSan) {
    embed.addFields({ name: 'Last Move', value: game.lastMoveSan, inline: true });
  }

  return {
    embeds: [embed],
    files: [attachment],
  };
}

async function replyWithBoard(interaction, game, options = {}) {
  await interaction.reply(buildChessResponse(game, options));
}

async function replyError(interaction, content) {
  await interaction.reply({
    content,
    flags: MessageFlags.Ephemeral,
  });
}

function loadChess(game) {
  const chess = new Chess();
  const moves = Array.isArray(game.moves) ? game.moves : [];

  try {
    for (const move of moves) {
      chess.move({
        from: move.from,
        to: move.to,
        promotion: move.promotion ?? undefined,
      });
    }

    return chess;
  } catch {
    return new Chess(game.fen);
  }
}

function chooseUserColor(color) {
  if (color === 'random') {
    return Math.random() < 0.5 ? 'white' : 'black';
  }

  return color === 'black' ? 'black' : 'white';
}

function getExpectedPlayer(game, turn) {
  return turn === 'w' ? game.whiteId : game.blackId;
}

function canMoveForTurn(game, userId, expectedPlayer) {
  if (game.mode === 'solo') {
    return game.createdBy === userId;
  }

  return expectedPlayer === userId;
}

function isPlayer(game, userId) {
  return game.whiteId === userId || game.blackId === userId || game.createdBy === userId;
}

function getPlayerSide(game, userId) {
  if (game.whiteId === userId && game.blackId !== userId) {
    return 'w';
  }

  if (game.blackId === userId && game.whiteId !== userId) {
    return 'b';
  }

  return null;
}

function getDefaultOrientation(game, userId) {
  return game.blackId === userId && game.whiteId !== userId ? 'black' : 'white';
}

function getGameStatus(chess) {
  if (chess.isCheckmate()) {
    return `${sideName(oppositeTurn(chess.turn()))} wins by checkmate.`;
  }

  if (chess.isStalemate()) {
    return 'Draw by stalemate.';
  }

  if (chess.isThreefoldRepetition()) {
    return 'Draw by threefold repetition.';
  }

  if (chess.isInsufficientMaterial()) {
    return 'Draw by insufficient material.';
  }

  if (chess.isDraw()) {
    return 'Draw.';
  }

  if (chess.inCheck()) {
    return `${sideName(chess.turn())} to move, in check.`;
  }

  return `${sideName(chess.turn())} to move.`;
}

function sideName(turn) {
  return turn === 'w' ? 'White' : 'Black';
}

function oppositeTurn(turn) {
  return turn === 'w' ? 'b' : 'w';
}

function playerMention(userId) {
  return userId ? `<@${userId}>` : 'Open';
}
