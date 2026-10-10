const fs = require('node:fs');
const path = require('node:path');

const gamesPath = path.join(__dirname, '..', 'data', 'chess-games.json');

function ensureStore() {
  fs.mkdirSync(path.dirname(gamesPath), { recursive: true });

  if (!fs.existsSync(gamesPath)) {
    fs.writeFileSync(gamesPath, '{}\n', 'utf8');
  }
}

function readStore() {
  ensureStore();

  try {
    const raw = fs.readFileSync(gamesPath, 'utf8').trim();
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
  const tempPath = `${gamesPath}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
  fs.renameSync(tempPath, gamesPath);
}

function getGameKey(channelId) {
  return channelId ?? 'unknown';
}

function getGame(channelId) {
  return store[getGameKey(channelId)] ?? null;
}

function setGame(channelId, game) {
  const key = getGameKey(channelId);
  const savedGame = {
    ...game,
    channelId,
    updatedAt: new Date().toISOString(),
  };

  store[key] = savedGame;
  saveStore();

  return savedGame;
}

function clearGame(channelId) {
  const key = getGameKey(channelId);
  const game = store[key] ?? null;

  if (game) {
    delete store[key];
    saveStore();
  }

  return game;
}

module.exports = {
  clearGame,
  getGame,
  setGame,
};
