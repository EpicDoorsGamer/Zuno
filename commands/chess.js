const { Chess } = require('chess.js');
const {
  ActionRowBuilder,
  ApplicationIntegrationType,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  InteractionContextType,
  MessageFlags,
  ModalBuilder,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');
const { createImage } = require('../services/chessImage');
const { clearGame, getGame, setGame } = require('../services/chessGames');

const SQUARE_PATTERN = /^[a-h][1-8]$/;
const MOVE_MODAL_ID = 'chess:move-modal';

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

  async handleButton(interaction) {
    if (!interaction.customId.startsWith('chess:')) {
      return false;
    }

    const [, action, value] = interaction.customId.split(':');

    if (action === 'move') {
      await handleMoveButton(interaction);
      return true;
    }

    if (action === 'refresh') {
      await handleRefreshButton(interaction);
      return true;
    }

    if (action === 'flip') {
      await handleFlipButton(interaction, value);
      return true;
    }

    if (action === 'resign') {
      await handleResignButton(interaction);
      return true;
    }

    return false;
  },

  async handleModal(interaction) {
    if (interaction.customId !== MOVE_MODAL_ID) {
      return false;
    }

    const from = interaction.fields.getTextInputValue('from');
    const to = interaction.fields.getTextInputValue('to');
    const promotion = normalizePromotion(interaction.fields.getTextInputValue('promotion'));

    if (promotion === null) {
      await replyError(interaction, '❌ Promotion must be `queen`, `rook`, `bishop`, or `knight`.');
      return true;
    }

    await submitMove(interaction, {
      from,
      promotion,
      to,
      updateMessage: true,
    });

    return true;
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
  await submitMove(interaction, {
    from: interaction.options.getString('from', true),
    promotion: interaction.options.getString('promotion') ?? undefined,
    to: interaction.options.getString('to', true),
    updateMessage: false,
  });
}

async function submitMove(interaction, { from, to, promotion, updateMessage }) {
  const game = getGame(interaction.channelId);

  if (!game) {
    await replyError(interaction, '❌ No chess game is active here. Start one with `/chess start`.');
    return;
  }

  const fromSquare = normalizeSquare(from);
  const toSquare = normalizeSquare(to);

  if (!SQUARE_PATTERN.test(fromSquare) || !SQUARE_PATTERN.test(toSquare)) {
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
    move = chess.move({ from: fromSquare, to: toSquare, promotion });
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
      from: fromSquare,
      to: toSquare,
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
    lastMoveSquares: [fromSquare, toSquare],
  };

  const savedGame = setGame(interaction.channelId, updatedGame);
  const response = buildChessResponse(savedGame, {
    title: `Move Played: ${move.san}`,
    orientation: getDefaultOrientation(savedGame, interaction.user.id),
  });

  if (chess.isGameOver()) {
    clearGame(interaction.channelId);
    response.embeds[0].setFooter({ text: 'Game ended. Start another with /chess start.' });
    response.components = buildChessControls({
      disabled: true,
      orientation: getDefaultOrientation(savedGame, interaction.user.id),
    });
  }

  await sendChessResponse(interaction, response, updateMessage);
}

async function handleMoveButton(interaction) {
  const game = getGame(interaction.channelId);

  if (!game) {
    await replyError(interaction, '❌ No chess game is active here. Start one with `/chess start`.');
    return;
  }

  const chess = loadChess(game);
  const expectedPlayer = getExpectedPlayer(game, chess.turn());

  if (!canMoveForTurn(game, interaction.user.id, expectedPlayer)) {
    await replyError(interaction, `❌ It is ${sideName(chess.turn())}'s turn${expectedPlayer ? `: <@${expectedPlayer}>` : ''}.`);
    return;
  }

  await interaction.showModal(buildMoveModal());
}

async function handleRefreshButton(interaction) {
  const game = getGame(interaction.channelId);

  if (!game) {
    await replyError(interaction, '❌ This chess game is no longer active.');
    return;
  }

  const response = buildChessResponse(game, {
    orientation: getDefaultOrientation(game, interaction.user.id),
    title: 'Current Board',
  });

  await sendChessResponse(interaction, response, true);
}

async function handleFlipButton(interaction, orientation) {
  const game = getGame(interaction.channelId);

  if (!game) {
    await replyError(interaction, '❌ This chess game is no longer active.');
    return;
  }

  const response = buildChessResponse(game, {
    orientation,
    title: 'Current Board',
  });

  await sendChessResponse(interaction, response, true);
}

async function handleResignButton(interaction) {
  const game = getGame(interaction.channelId);

  if (!game) {
    await replyError(interaction, '❌ This chess game is no longer active.');
    return;
  }

  if (!isPlayer(game, interaction.user.id)) {
    await replyError(interaction, '❌ Only a player in this chess game can resign.');
    return;
  }

  const response = buildResignResponse(game, interaction.user.id);
  clearGame(interaction.channelId);

  await interaction.update({
    ...response,
    attachments: [],
  });
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

  const response = buildResignResponse(game, interaction.user.id);
  clearGame(interaction.channelId);

  await interaction.reply(response);
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
    .setDescription('Use **Make Move** below, or `/chess move from:e2 to:e4`.')
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
    components: buildChessControls({
      disabled: options.controlsDisabled ?? chess.isGameOver(),
      orientation,
    }),
    embeds: [embed],
    files: [attachment],
  };
}

async function replyWithBoard(interaction, game, options = {}) {
  await interaction.reply(buildChessResponse(game, options));
}

function buildResignResponse(game, userId) {
  const chess = loadChess(game);
  const resigningSide = getPlayerSide(game, userId) ?? chess.turn();
  const winner = resigningSide === 'w' ? 'Black' : 'White';
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

  return {
    components: buildChessControls({ disabled: true }),
    embeds: [embed],
  };
}

function buildChessControls({ disabled = false, orientation = 'white' } = {}) {
  const flipTo = orientation === 'black' ? 'white' : 'black';

  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('chess:move')
        .setLabel('Make Move')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(disabled),
      new ButtonBuilder()
        .setCustomId('chess:refresh')
        .setLabel('Refresh')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled),
      new ButtonBuilder()
        .setCustomId(`chess:flip:${flipTo}`)
        .setLabel('Flip Board')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled),
      new ButtonBuilder()
        .setCustomId('chess:resign')
        .setLabel('Resign')
        .setStyle(ButtonStyle.Danger)
        .setDisabled(disabled),
    ),
  ];
}

function buildMoveModal() {
  return new ModalBuilder()
    .setCustomId(MOVE_MODAL_ID)
    .setTitle('Make a Chess Move')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('from')
          .setLabel('From')
          .setPlaceholder('e2')
          .setMinLength(2)
          .setMaxLength(2)
          .setRequired(true)
          .setStyle(TextInputStyle.Short),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('to')
          .setLabel('To')
          .setPlaceholder('e4')
          .setMinLength(2)
          .setMaxLength(2)
          .setRequired(true)
          .setStyle(TextInputStyle.Short),
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('promotion')
          .setLabel('Promotion')
          .setPlaceholder('Optional: queen, rook, bishop, or knight')
          .setMaxLength(6)
          .setRequired(false)
          .setStyle(TextInputStyle.Short),
      ),
    );
}

async function sendChessResponse(interaction, response, updateMessage) {
  if (updateMessage && typeof interaction.update === 'function') {
    await interaction.update({
      ...response,
      attachments: [],
    });
    return;
  }

  await interaction.reply(response);
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

function normalizeSquare(square) {
  return String(square ?? '').trim().toLowerCase();
}

function normalizePromotion(value) {
  const normalized = String(value ?? '').trim().toLowerCase();

  if (!normalized) {
    return undefined;
  }

  const pieces = {
    b: 'b',
    bishop: 'b',
    knight: 'n',
    n: 'n',
    q: 'q',
    queen: 'q',
    r: 'r',
    rook: 'r',
  };

  return pieces[normalized] ?? null;
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
