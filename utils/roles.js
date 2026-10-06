function getMemberRoleIds(member) {
  if (!member?.roles) {
    return [];
  }

  if (member.roles.cache) {
    return [...member.roles.cache.keys()];
  }

  if (Array.isArray(member.roles)) {
    return member.roles;
  }

  return [];
}

async function fetchRole(guild, roleId) {
  return (
    guild.roles.cache.get(roleId) ??
    (await guild.roles.fetch(roleId).catch(() => null))
  );
}

async function hasRoleOrAbove(interaction, roleId) {
  if (!interaction.inGuild() || !roleId) {
    return false;
  }

  const memberRoleIds = getMemberRoleIds(interaction.member);

  if (memberRoleIds.includes(roleId)) {
    return true;
  }

  const targetRole = await fetchRole(interaction.guild, roleId);

  if (!targetRole) {
    return false;
  }

  return memberRoleIds.some((memberRoleId) => {
    const role = interaction.guild.roles.cache.get(memberRoleId);
    return role && role.position > targetRole.position;
  });
}

function hasRole(member, roleId) {
  return getMemberRoleIds(member).includes(roleId);
}

module.exports = {
  getMemberRoleIds,
  hasRole,
  hasRoleOrAbove,
};
