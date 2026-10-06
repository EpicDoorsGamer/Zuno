const fs = require('node:fs');
const path = require('node:path');

const dataDir = path.join(__dirname, '..', 'data');
const ticketsPath = path.join(dataDir, 'tickets.json');
const ticketsBackupPath = path.join(dataDir, 'tickets.backup.json');

let ticketStore = null;

function ensureStore() {
  fs.mkdirSync(dataDir, { recursive: true });

  if (!fs.existsSync(ticketsPath)) {
    if (fs.existsSync(ticketsBackupPath)) {
      fs.copyFileSync(ticketsBackupPath, ticketsPath);
      return;
    }

    writeJsonFile(ticketsPath, {});
  }
}

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function writeJsonFile(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function readJsonFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }

    const raw = fs.readFileSync(filePath, 'utf8').trim();

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    return isPlainObject(parsed) ? parsed : null;
  } catch (error) {
    console.warn(`Could not read ${filePath}: ${error.message}`);
    return null;
  }
}

function normalizeGuildState(state) {
  const normalized = isPlainObject(state) ? state : {};

  normalized.config = isPlainObject(normalized.config)
    ? normalized.config
    : null;
  normalized.counter = Number.isInteger(normalized.counter)
    ? normalized.counter
    : 0;
  normalized.openTickets = isPlainObject(normalized.openTickets)
    ? normalized.openTickets
    : {};

  return normalized;
}

function normalizeStore(store) {
  const normalized = {};

  if (!isPlainObject(store)) {
    return normalized;
  }

  for (const [guildId, state] of Object.entries(store)) {
    normalized[guildId] = normalizeGuildState(state);
  }

  return normalized;
}

function hasAnyTicketConfig(store) {
  return Object.values(store).some((state) => isPlainObject(state?.config));
}

function loadTickets({ force = false } = {}) {
  if (ticketStore && !force) {
    return ticketStore;
  }

  ensureStore();

  const primaryStore = readJsonFile(ticketsPath);

  if (primaryStore) {
    ticketStore = normalizeStore(primaryStore);
    return ticketStore;
  }

  const backupStore = readJsonFile(ticketsBackupPath);

  if (backupStore) {
    ticketStore = normalizeStore(backupStore);
    saveTickets();
    console.warn('Restored ticket config from backup store.');
    return ticketStore;
  }

  ticketStore = {};
  return ticketStore;
}

function saveTickets() {
  ensureStore();
  const tempPath = `${ticketsPath}.tmp`;
  const storeToSave = normalizeStore(ticketStore);

  if (
    fs.existsSync(ticketsPath) &&
    hasAnyTicketConfig(readJsonFile(ticketsPath) ?? {})
  ) {
    fs.copyFileSync(ticketsPath, ticketsBackupPath);
  }

  writeJsonFile(tempPath, storeToSave);
  fs.renameSync(tempPath, ticketsPath);

  if (hasAnyTicketConfig(storeToSave)) {
    writeJsonFile(ticketsBackupPath, storeToSave);
  }

  ticketStore = storeToSave;
}

function getGuildState(guildId) {
  const store = loadTickets();

  if (!store[guildId]) {
    store[guildId] = {
      config: null,
      counter: 0,
      openTickets: {},
    };
  }

  store[guildId].openTickets ??= {};
  store[guildId].counter ??= 0;

  return store[guildId];
}

function getTicketConfig(guildId) {
  return getGuildState(guildId).config ?? null;
}

function setTicketConfig(guildId, config) {
  const state = getGuildState(guildId);

  state.config = {
    ...config,
    updatedAt: new Date().toISOString(),
  };

  saveTickets();
  return state.config;
}

function clearTicketConfig(guildId) {
  const state = getGuildState(guildId);
  state.config = null;
  state.openTickets = {};
  saveTickets();
}

function getNextTicketNumber(guildId) {
  const state = getGuildState(guildId);
  state.counter += 1;
  saveTickets();
  return state.counter;
}

function getOpenTicketForUser(guildId, userId) {
  const state = getGuildState(guildId);
  return state.openTickets[userId] ?? null;
}

function addOpenTicket(guildId, userId, ticket) {
  const state = getGuildState(guildId);

  state.openTickets[userId] = {
    ...ticket,
    createdAt: new Date().toISOString(),
  };

  saveTickets();
  return state.openTickets[userId];
}

function updateOpenTicketByChannel(guildId, channelId, updates) {
  const state = getGuildState(guildId);
  const entry = Object.entries(state.openTickets).find(
    ([, ticket]) => ticket.channelId === channelId,
  );

  if (!entry) {
    return null;
  }

  const [userId, ticket] = entry;
  state.openTickets[userId] = {
    ...ticket,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  saveTickets();

  return {
    userId,
    ...state.openTickets[userId],
  };
}

function findTicketByChannel(guildId, channelId) {
  const state = getGuildState(guildId);
  const entry = Object.entries(state.openTickets).find(
    ([, ticket]) => ticket.channelId === channelId,
  );

  if (!entry) {
    return null;
  }

  const [userId, ticket] = entry;
  return {
    userId,
    ...ticket,
  };
}

function removeOpenTicketByChannel(guildId, channelId) {
  const state = getGuildState(guildId);
  const entry = Object.entries(state.openTickets).find(
    ([, ticket]) => ticket.channelId === channelId,
  );

  if (!entry) {
    return null;
  }

  const [userId, ticket] = entry;
  delete state.openTickets[userId];
  saveTickets();

  return {
    userId,
    ...ticket,
  };
}

module.exports = {
  addOpenTicket,
  clearTicketConfig,
  findTicketByChannel,
  getNextTicketNumber,
  getOpenTicketForUser,
  getTicketConfig,
  removeOpenTicketByChannel,
  setTicketConfig,
  updateOpenTicketByChannel,
};
