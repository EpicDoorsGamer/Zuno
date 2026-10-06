const TTLCache = require('../utils/cache');

const BASE_URLS = {
  accountInformation: 'https://accountinformation.roblox.com',
  friends: 'https://friends.roblox.com',
  groups: 'https://groups.roblox.com',
  thumbnails: 'https://thumbnails.roblox.com',
  users: 'https://users.roblox.com',
};

const cacheTtlSeconds = Number.parseInt(process.env.CACHE_TTL_SECONDS, 10);
const whoisCache = new TTLCache(
  Number.isFinite(cacheTtlSeconds) && cacheTtlSeconds > 0
    ? cacheTtlSeconds * 1000
    : 300_000,
);
const autocompleteCache = new TTLCache(60_000);
let autocompletePausedUntil = 0;

class RobloxApiError extends Error {
  constructor(message, status, details = null) {
    super(message);
    this.name = 'RobloxApiError';
    this.status = status;
    this.details = details;
  }
}

class RobloxNotFoundError extends Error {
  constructor(message = 'Roblox user not found.') {
    super(message);
    this.name = 'RobloxNotFoundError';
  }
}

class RobloxRateLimitError extends RobloxApiError {
  constructor(retryAfter = null, details = null) {
    super('Roblox API rate limit reached.', 429, details);
    this.name = 'RobloxRateLimitError';
    this.retryAfter = retryAfter;
  }
}

function normalizeUsername(username) {
  return username.trim();
}

function getJsonValue(value, fallback = null) {
  return value === undefined ? fallback : value;
}

async function requestJson(url, options = {}) {
  const headers = {
    accept: 'application/json',
    'user-agent': 'Zuno Discord Bot (Roblox Whois)',
    ...options.headers,
  };

  if (options.body && !headers['content-type']) {
    headers['content-type'] = 'application/json';
  }

  const response = await fetch(url, {
    ...options,
    headers,
    signal: AbortSignal.timeout(10_000),
  });

  const text = await response.text();
  let data = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (response.status === 429) {
    throw new RobloxRateLimitError(
      response.headers.get('retry-after'),
      data,
    );
  }

  if (response.status === 404) {
    throw new RobloxNotFoundError();
  }

  if (!response.ok) {
    throw new RobloxApiError(
      `Roblox API request failed with status ${response.status}.`,
      response.status,
      data,
    );
  }

  return data;
}

async function optionalRequest(task) {
  try {
    return await task();
  } catch {
    return null;
  }
}

async function findUserByUsername(username) {
  const normalized = normalizeUsername(username);

  if (!normalized) {
    throw new RobloxNotFoundError();
  }

  const data = await requestJson(`${BASE_URLS.users}/v1/usernames/users`, {
    method: 'POST',
    body: JSON.stringify({
      usernames: [normalized],
      excludeBannedUsers: false,
    }),
  });

  const match = data?.data?.find(
    (user) => user.name?.toLowerCase() === normalized.toLowerCase(),
  );

  if (!match) {
    throw new RobloxNotFoundError();
  }

  return match;
}

async function getUserProfile(userId) {
  return requestJson(`${BASE_URLS.users}/v1/users/${userId}`);
}

async function getCount(url) {
  const data = await requestJson(url);
  const count = Number(data?.count);

  return Number.isFinite(count) ? count : null;
}

async function getSocialCounts(userId) {
  const [friends, followers, following] = await Promise.all([
    optionalRequest(() =>
      getCount(`${BASE_URLS.friends}/v1/users/${userId}/friends/count`),
    ),
    optionalRequest(() =>
      getCount(`${BASE_URLS.friends}/v1/users/${userId}/followers/count`),
    ),
    optionalRequest(() =>
      getCount(`${BASE_URLS.friends}/v1/users/${userId}/followings/count`),
    ),
  ]);

  return {
    friends,
    followers,
    following,
  };
}

async function getRobloxBadgeCount(userId) {
  const data = await requestJson(
    `${BASE_URLS.accountInformation}/v1/users/${userId}/roblox-badges`,
  );

  const count = Number(data?.Count ?? data?.count);

  if (Number.isFinite(count)) {
    return count;
  }

  if (Array.isArray(data)) {
    return data.length;
  }

  if (Array.isArray(data?.value)) {
    return data.value.length;
  }

  return null;
}

async function getAvatarHeadshot(userId) {
  const params = new URLSearchParams({
    userIds: String(userId),
    size: '150x150',
    format: 'Png',
    isCircular: 'false',
  });
  const data = await requestJson(
    `${BASE_URLS.thumbnails}/v1/users/avatar-headshot?${params}`,
  );
  const thumbnail = data?.data?.find((item) => item.targetId === userId);

  return thumbnail?.state === 'Completed' ? thumbnail.imageUrl : null;
}

function parseGroupId(groupId) {
  const parsed = Number.parseInt(groupId, 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

async function getClanMembership(userId, groupId) {
  const parsedGroupId = parseGroupId(groupId);

  if (!parsedGroupId) {
    return {
      configured: false,
      status: 'Not Configured',
    };
  }

  const data = await requestJson(
    `${BASE_URLS.groups}/v2/users/${userId}/groups/roles`,
  );
  const membership = data?.data?.find(
    (item) => Number(item?.group?.id) === parsedGroupId,
  );

  if (!membership) {
    return {
      configured: true,
      member: false,
      status: 'Not a Member',
    };
  }

  return {
    configured: true,
    member: true,
    status: 'Member',
    group: membership.group,
    roleName: getJsonValue(membership.role?.name),
    rank: getJsonValue(membership.role?.rank),
  };
}

async function getRobloxWhois(username, groupId = process.env.ROBLOX_GROUP_ID) {
  const normalized = normalizeUsername(username);
  const cacheKey = `${normalized.toLowerCase()}::${parseGroupId(groupId) ?? 'no-group'}`;
  const cached = whoisCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const lookup = await findUserByUsername(normalized);
  const profile = await getUserProfile(lookup.id);

  const [socialCounts, badgeCount, avatarUrl, clan] = await Promise.all([
    optionalRequest(() => getSocialCounts(profile.id)),
    optionalRequest(() => getRobloxBadgeCount(profile.id)),
    optionalRequest(() => getAvatarHeadshot(profile.id)),
    optionalRequest(() => getClanMembership(profile.id, groupId)),
  ]);

  const result = {
    profile: {
      id: profile.id,
      username: profile.name,
      displayName: profile.displayName,
      description: profile.description,
      created: profile.created,
      isBanned: profile.isBanned,
      hasVerifiedBadge: profile.hasVerifiedBadge,
    },
    avatarUrl,
    socialCounts: socialCounts ?? {},
    badgeCount,
    clan,
    profileUrl: `https://www.roblox.com/users/${profile.id}/profile`,
  };

  whoisCache.set(cacheKey, result);
  return result;
}

async function searchUsernames(keyword) {
  const normalized = keyword.trim();

  if (normalized.length < 3) {
    return [];
  }

  if (Date.now() < autocompletePausedUntil) {
    return [];
  }

  const cacheKey = normalized.toLowerCase();
  const cached = autocompleteCache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const params = new URLSearchParams({
    keyword: normalized,
    limit: '10',
  });

  let data = null;

  try {
    data = await requestJson(`${BASE_URLS.users}/v1/users/search?${params}`);
  } catch (error) {
    const retryAfterSeconds = Number.parseInt(error.retryAfter, 10);
    autocompletePausedUntil =
      Date.now() +
      (error instanceof RobloxRateLimitError && Number.isFinite(retryAfterSeconds)
        ? Math.max(retryAfterSeconds * 1000, 15_000)
        : 15_000);
    autocompleteCache.set(cacheKey, [], 15_000);
    return [];
  }

  const choices = Array.isArray(data?.data)
    ? data.data
        .filter((user) => user?.name)
        .slice(0, 10)
        .map((user) => ({
          name:
            user.displayName && user.displayName !== user.name
              ? `${user.displayName} (@${user.name})`
              : `@${user.name}`,
          value: user.name,
        }))
    : [];

  autocompleteCache.set(cacheKey, choices, choices.length ? 60_000 : 15_000);
  return choices;
}

module.exports = {
  RobloxApiError,
  RobloxNotFoundError,
  RobloxRateLimitError,
  getRobloxWhois,
  searchUsernames,
};
