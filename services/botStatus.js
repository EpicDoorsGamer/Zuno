const fs = require('node:fs');
const path = require('node:path');

const statusPath = path.join(__dirname, '..', 'data', 'bot-status.json');

function ensureDataDir() {
  fs.mkdirSync(path.dirname(statusPath), { recursive: true });
}

function loadSavedStatus() {
  try {
    if (!fs.existsSync(statusPath)) {
      return null;
    }

    const raw = fs.readFileSync(statusPath, 'utf8').trim();

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);

    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function saveStatus(status) {
  ensureDataDir();
  fs.writeFileSync(statusPath, `${JSON.stringify(status, null, 2)}\n`, 'utf8');
}

function clearStatus() {
  ensureDataDir();
  fs.writeFileSync(statusPath, '{}\n', 'utf8');
}

function applyStatus(client, savedStatus = loadSavedStatus()) {
  if (!savedStatus?.text) {
    client.user.setPresence({
      activities: [],
      status: 'online',
    });
    return null;
  }

  client.user.setPresence({
    activities: [
      {
        name: savedStatus.text,
        type: Number.isInteger(savedStatus.activityType)
          ? savedStatus.activityType
          : 0,
      },
    ],
    status: ['online', 'idle', 'dnd', 'invisible'].includes(
      savedStatus.presence,
    )
      ? savedStatus.presence
      : 'online',
  });

  return savedStatus;
}

module.exports = {
  applyStatus,
  clearStatus,
  loadSavedStatus,
  saveStatus,
};
