const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
} = require('discord.js');
const {
  addCoins,
  getBalance,
  incrementStat,
  spendCoins,
} = require('../services/economy');
const { formatCoins, parseBet } = require('../utils/economyFormat');

const MAX_BET = 50_000;
const activeGames = new Map();

function createDeck() {
  const suits = ['S', 'H', 'D', 'C'];
  const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const deck = [];

  for (const suit of suits) {
    for (const rank of ranks) {
      deck.push({ rank, suit });
    }
  }

  for (let index = deck.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [deck[index], deck[swapIndex]] = [deck[swapIndex], deck[index]];
  }

  return deck;
}

function draw(deck) {
  return deck.pop();
}

function cardValue(card) {
  if (card.rank === 'A') {
    return 11;
  }

  if (['J', 'Q', 'K'].includes(card.rank)) {
    return 10;
  }

  return Number(card.rank);
}

function handValue(hand) {
  let total = hand.reduce((sum, card) => sum + cardValue(card), 0);
  let aces = hand.filter((card) => card.rank === 'A').length;

  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }

  return total;
}

function renderCard(card) {
  return `${card.rank}${card.suit}`;
}

function renderHand(hand, hideFirst = false) {
  if (hideFirst) {
    return `Hidden, ${hand.slice(1).map(renderCard).join(', ')}`;
  }

  return hand.map(renderCard).join(', ');
}

function gameKey(guildId, userId) {
  return `${guildId}:${userId}`;
}

function buildButtons(game, disabled = false) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`bj:hit:${game.user.id}`)
        .setLabel('Hit')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(disabled),
      new ButtonBuilder()
        .setCustomId(`bj:stand:${game.user.id}`)
        .setLabel('Stand')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled),
    ),
  ];
}

function buildGameEmbed(game, outcome = null) {
  const revealDealer = Boolean(outcome);
  const playerTotal = handValue(game.playerHand);
  const dealerTotal = handValue(game.dealerHand);
  const lines = [
    `Bet: **${formatCoins(game.bet)}** coins`,
    '',
    `Your hand: **${renderHand(game.playerHand)}** (${playerTotal})`,
    revealDealer
      ? `Dealer hand: **${renderHand(game.dealerHand)}** (${dealerTotal})`
      : `Dealer hand: **${renderHand(game.dealerHand, true)}**`,
  ];

  if (outcome) {
    lines.push('', outcome);
  }

  return new EmbedBuilder()
    .setColor(outcome?.startsWith('You won') ? 0x57f287 : 0x2b2d31)
    .setAuthor({ name: 'ZUNO • BLACKJACK' })
    .setDescription(lines.join('\n'));
}

function settleGame(game, result) {
  let payout = 0;
  let message;

  if (result === 'blackjack') {
    payout = Math.floor(game.bet * 2.5);
    message = `You won with blackjack and received **${formatCoins(payout)}** coins.`;
    incrementStat(game.guildId, game.user, 'blackjackWins');
  } else if (result === 'win') {
    payout = game.bet * 2;
    message = `You won and received **${formatCoins(payout)}** coins.`;
    incrementStat(game.guildId, game.user, 'blackjackWins');
  } else if (result === 'push') {
    payout = game.bet;
    message = `Push. Your **${formatCoins(game.bet)}** coin bet was returned.`;
    incrementStat(game.guildId, game.user, 'blackjackPushes');
  } else {
    message = `You lost **${formatCoins(game.bet)}** coins.`;
    incrementStat(game.guildId, game.user, 'blackjackLosses');
  }

  if (payout > 0) {
    addCoins(game.guildId, game.user, payout);
  }

  activeGames.delete(gameKey(game.guildId, game.user.id));
  return message;
}

function dealerPlay(game) {
  while (handValue(game.dealerHand) < 17) {
    game.dealerHand.push(draw(game.deck));
  }
}

function compareHands(game) {
  const playerTotal = handValue(game.playerHand);
  const dealerTotal = handValue(game.dealerHand);

  if (playerTotal > 21) {
    return 'loss';
  }

  if (dealerTotal > 21 || playerTotal > dealerTotal) {
    return 'win';
  }

  if (playerTotal === dealerTotal) {
    return 'push';
  }

  return 'loss';
}

async function runBlackjack({ guildId, user, bet, reply }) {
  const key = gameKey(guildId, user.id);

  if (activeGames.has(key)) {
    await reply('You already have an active blackjack game. Finish that hand first.');
    return;
  }

  const wager = Math.min(parseBet(bet, 100), MAX_BET);
  const balance = getBalance(guildId, user);

  if (balance < wager) {
    await reply(`You need **${formatCoins(wager)}** coins to play. Balance: **${formatCoins(balance)}**.`);
    return;
  }

  spendCoins(guildId, user, wager);

  const deck = createDeck();
  const game = {
    guildId,
    user,
    bet: wager,
    deck,
    playerHand: [draw(deck), draw(deck)],
    dealerHand: [draw(deck), draw(deck)],
  };
  activeGames.set(key, game);

  const playerTotal = handValue(game.playerHand);
  const dealerTotal = handValue(game.dealerHand);

  if (playerTotal === 21) {
    const result = dealerTotal === 21 ? 'push' : 'blackjack';
    const outcome = settleGame(game, result);
    await reply({
      embeds: [buildGameEmbed(game, outcome)],
      components: buildButtons(game, true),
    });
    return;
  }

  await reply({
    embeds: [buildGameEmbed(game)],
    components: buildButtons(game, false),
  });
}

module.exports = {
  aliases: ['bj'],

  data: new SlashCommandBuilder()
    .setName('bj')
    .setDescription('Play a hand of blackjack.')
    .addIntegerOption((option) =>
      option
        .setName('bet')
        .setDescription('Coins to bet. Default is 100.')
        .setMinValue(1)
        .setMaxValue(MAX_BET),
    ),

  async execute(interaction) {
    await runBlackjack({
      guildId: interaction.guildId,
      user: interaction.user,
      bet: interaction.options.getInteger('bet') ?? 100,
      reply: (payload) => interaction.reply(payload),
    });
  },

  async prefixExecute(message, args) {
    await runBlackjack({
      guildId: message.guildId,
      user: message.author,
      bet: args[0] ?? 100,
      reply: (payload) => message.reply(payload),
    });
  },

  async handleButton(interaction) {
    if (!interaction.customId.startsWith('bj:')) {
      return false;
    }

    const [, action, ownerId] = interaction.customId.split(':');

    if (!['hit', 'stand'].includes(action)) {
      return false;
    }

    if (interaction.user.id !== ownerId) {
      await interaction.reply({
        content: 'This is not your blackjack hand.',
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    const key = gameKey(interaction.guildId, ownerId);
    const game = activeGames.get(key);

    if (!game) {
      await interaction.reply({
        content: 'This blackjack game is no longer active.',
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    if (action === 'hit') {
      game.playerHand.push(draw(game.deck));

      if (handValue(game.playerHand) > 21) {
        const outcome = settleGame(game, 'loss');
        await interaction.update({
          embeds: [buildGameEmbed(game, outcome)],
          components: buildButtons(game, true),
        });
        return true;
      }

      await interaction.update({
        embeds: [buildGameEmbed(game)],
        components: buildButtons(game, false),
      });
      return true;
    }

    dealerPlay(game);
    const result = compareHands(game);
    const outcome = settleGame(game, result);

    await interaction.update({
      embeds: [buildGameEmbed(game, outcome)],
      components: buildButtons(game, true),
    });

    return true;
  },
};
