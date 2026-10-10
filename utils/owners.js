const OWNER_IDS = new Set(['1109158652927033465', '1211338035136954391']);

function isBotOwner(userId) {
  return OWNER_IDS.has(userId);
}

module.exports = {
  OWNER_IDS,
  isBotOwner,
};
