const fs = require('node:fs');
const path = require('node:path');

const dataDir = path.join(__dirname, '..', 'data');
const ticketsPath = path.join(dataDir, 'tickets.json');

let ticketStore = null;

function ensureStore() {
  fs.mkdirSync(dataDir, { recursive: true });

  if (!fs.existsSync(ticketsPath)) {
    fs.writeFileSync(ticketsPath, '{}\n', 'utf8');
  }
}

function loadTickets() {
  if (ticketStore) {
    return ticketStore;
  }

  ensureStore();

  try {
    ticketStore = JSON.parse(fs.readFileSync(ticketsPath, 'utf8'));
  } catch {
    ticketStore = {};
  }

  if (!ticketStore || typeof ticketStore !== 'object' || Array.isArray(ticketStore)) {
    ticketStore = {};
  }

  return ticketStore;
}

function saveTickets() {
  ensureStore();
  const tempPath = `${ticketsPath}.tmp`;

  fs.writeFileSync(tempPath, `${JSON.stringify(ticketStore, null, 2)}\n`, 'utf8');
  fs.renameSync(tempPath, ticketsPath);
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
};
