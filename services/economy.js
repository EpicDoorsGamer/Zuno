const fs = require('node:fs');
const path = require('node:path');

const economyPath = path.join(__dirname, '..', 'data', 'economy.json');
const STARTING_BALANCE = 500;

function ensureStore() {
  fs.mkdirSync(path.dirname(economyPath), { recursive: true });

  if (!fs.existsSync(economyPath)) {
    fs.writeFileSync(economyPath, '{}\n', 'utf8');
  }
}

function readStore() {
  ensureStore();

  try {
    const raw = fs.readFileSync(economyPath, 'utf8').trim();
    const parsed = raw ? JSON.parse(raw) : {};

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    return parsed;
  } catch {
    return {};
  }
}

let store = readStore();

function saveStore() {
  ensureStore();
  const tempPath = `${economyPath}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
  fs.renameSync(tempPath, economyPath);
}

function guildKey(guildId) {
  return guildId ?? 'global';
}

function getGuildState(guildId) {
  const key = guildKey(guildId);

  if (!store[key]) {
    store[key] = {
      users: {},
    };
  }

  store[key].users ??= {};
  return store[key];
}

function getUserProfile(guildId, user) {
  const guild = getGuildState(guildId);
  const userId = typeof user === 'string' ? user : user.id;
  const tag = typeof user === 'string' ? null : user.tag;

  if (!guild.users[userId]) {
    guild.users[userId] = {
      balance: STARTING_BALANCE,
      inventory: {},
      cooldowns: {},
      stats: {
        blackjackWins: 0,
        blackjackLosses: 0,
        blackjackPushes: 0,
        slotsWins: 0,
        slotsLosses: 0,
        lootboxesOpened: 0,
        workCount: 0,
        dailyCount: 0,
      },
      createdAt: new Date().toISOString(),
    };
  }

  if (tag) {
    guild.users[userId].tag = tag;
  }

  guild.users[userId].inventory ??= {};
  guild.users[userId].cooldowns ??= {};
  guild.users[userId].stats ??= {};

  return guild.users[userId];
}

function getBalance(guildId, user) {
  return getUserProfile(guildId, user).balance;
}

function addCoins(guildId, user, amount) {
  const profile = getUserProfile(guildId, user);
  profile.balance = Math.max(0, Math.floor(profile.balance + amount));
  saveStore();
  return profile.balance;
}

function spendCoins(guildId, user, amount) {
  const profile = getUserProfile(guildId, user);
  const cost = Math.max(0, Math.floor(amount));

  if (profile.balance < cost) {
    return false;
  }

  profile.balance -= cost;
  saveStore();
  return true;
}

function addItem(guildId, user, itemName, amount = 1) {
  const profile = getUserProfile(guildId, user);
  profile.inventory[itemName] = (profile.inventory[itemName] ?? 0) + amount;
  saveStore();
  return profile.inventory[itemName];
}

function incrementStat(guildId, user, statName, amount = 1) {
  const profile = getUserProfile(guildId, user);
  profile.stats[statName] = (profile.stats[statName] ?? 0) + amount;
  saveStore();
  return profile.stats[statName];
}

function checkCooldown(guildId, user, cooldownName, durationMs) {
  const profile = getUserProfile(guildId, user);
  const lastUsed = profile.cooldowns[cooldownName];

  if (!lastUsed) {
    return {
      ready: true,
      remainingMs: 0,
    };
  }

  const elapsed = Date.now() - new Date(lastUsed).getTime();
  const remainingMs = Math.max(0, durationMs - elapsed);

  return {
    ready: remainingMs === 0,
    remainingMs,
  };
}

function setCooldown(guildId, user, cooldownName) {
  const profile = getUserProfile(guildId, user);
  profile.cooldowns[cooldownName] = new Date().toISOString();
  saveStore();
}

function getLeaderboard(guildId, limit = 10) {
  const guild = getGuildState(guildId);

  return Object.entries(guild.users)
    .map(([userId, profile]) => ({
      userId,
      tag: profile.tag,
      balance: profile.balance ?? 0,
    }))
    .sort((a, b) => b.balance - a.balance)
    .slice(0, limit);
}

module.exports = {
  STARTING_BALANCE,
  addCoins,
  addItem,
  checkCooldown,
  getBalance,
  getLeaderboard,
  getUserProfile,
  incrementStat,
  saveStore,
  setCooldown,
  spendCoins,
};
