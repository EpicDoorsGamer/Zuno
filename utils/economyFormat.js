function formatCoins(amount) {
  return new Intl.NumberFormat('en-US').format(Math.floor(amount));
}

function parseBet(value, fallback = 100) {
  const raw = String(value ?? '').replaceAll(',', '').trim();
  const parsed = Number.parseInt(raw, 10);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(1, parsed);
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts = [];

  if (hours) {
    parts.push(`${hours}h`);
  }

  if (minutes) {
    parts.push(`${minutes}m`);
  }

  if (seconds || parts.length === 0) {
    parts.push(`${seconds}s`);
  }

  return parts.join(' ');
}

module.exports = {
  formatCoins,
  formatDuration,
  parseBet,
};
