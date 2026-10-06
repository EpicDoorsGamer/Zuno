const fs = require('node:fs');
const path = require('node:path');

const SUPPORTED_CLANS = ['WLAN'];
const dataDir = path.join(__dirname, '..', 'data');
const clansPath = path.join(dataDir, 'clans.json');

let assignments = null;

function ensureStore() {
  fs.mkdirSync(dataDir, { recursive: true });

  if (!fs.existsSync(clansPath)) {
    fs.writeFileSync(clansPath, '{}\n', 'utf8');
  }
}

function loadAssignments() {
  if (assignments) {
    return assignments;
  }

  ensureStore();

  try {
    assignments = JSON.parse(fs.readFileSync(clansPath, 'utf8'));
  } catch {
    assignments = {};
  }

  if (!assignments || typeof assignments !== 'object' || Array.isArray(assignments)) {
    assignments = {};
  }

  return assignments;
}

function saveAssignments() {
  ensureStore();
  const tempPath = `${clansPath}.tmp`;

  fs.writeFileSync(tempPath, `${JSON.stringify(assignments, null, 2)}\n`, 'utf8');
  fs.renameSync(tempPath, clansPath);
}

function normalizeClan(clan) {
  const normalized = String(clan ?? '').trim().toUpperCase();

  if (!SUPPORTED_CLANS.includes(normalized)) {
    throw new Error(`Unsupported clan: ${clan}`);
  }

  return normalized;
}

function assignClan(profile, clan, assignedBy) {
  const normalizedClan = normalizeClan(clan);
  const store = loadAssignments();
  const key = String(profile.id);

  store[key] = {
    clan: normalizedClan,
    robloxUserId: profile.id,
    robloxUsername: profile.username,
    robloxDisplayName: profile.displayName,
    assignedBy,
    assignedAt: new Date().toISOString(),
  };

  saveAssignments();
  return store[key];
}

function getClanAssignment(userId) {
  const store = loadAssignments();
  return store[String(userId)] ?? null;
}

module.exports = {
  SUPPORTED_CLANS,
  assignClan,
  getClanAssignment,
};
