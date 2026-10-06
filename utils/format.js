const { escapeMarkdown } = require('discord.js');

function formatNumber(value) {
  if (!Number.isFinite(value)) {
    return null;
  }

  return new Intl.NumberFormat('en-US').format(value);
}

function formatDate(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

function calculateAccountAge(value) {
  const created = new Date(value);

  if (Number.isNaN(created.getTime())) {
    return null;
  }

  const now = new Date();
  const totalDays = Math.max(
    0,
    Math.floor((now.getTime() - created.getTime()) / 86_400_000),
  );

  let years = now.getUTCFullYear() - created.getUTCFullYear();
  let months = now.getUTCMonth() - created.getUTCMonth();

  if (now.getUTCDate() < created.getUTCDate()) {
    months -= 1;
  }

  if (months < 0) {
    years -= 1;
    months += 12;
  }

  const parts = [];

  if (years > 0) {
    parts.push(`${years} year${years === 1 ? '' : 's'}`);
  }

  if (months > 0) {
    parts.push(`${months} month${months === 1 ? '' : 's'}`);
  }

  if (parts.length === 0) {
    parts.push(`${totalDays} day${totalDays === 1 ? '' : 's'}`);
  }

  return `${parts.join(', ')} (${formatNumber(totalDays)} days)`;
}

function cleanEmbedText(value, maxLength = 1024) {
  if (typeof value !== 'string') {
    return null;
  }

  const cleaned = escapeMarkdown(value.trim()).replaceAll('@', '@\u200b');

  if (!cleaned) {
    return null;
  }

  if (cleaned.length <= maxLength) {
    return cleaned;
  }

  return `${cleaned.slice(0, maxLength - 1)}…`;
}

function joinLines(lines) {
  return lines.filter(Boolean).join('\n');
}

module.exports = {
  calculateAccountAge,
  cleanEmbedText,
  formatDate,
  formatNumber,
  joinLines,
};
