const {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} = require('discord.js');
const {
  addOpenTicket,
  clearTicketConfig,
  findTicketByChannel,
  getNextTicketNumber,
  getOpenTicketForUser,
  getTicketConfig,
  removeOpenTicketByChannel,
  setTicketConfig,
  updateOpenTicketByChannel,
} = require('../services/tickets');
const { hasRole, hasRoleOrAbove } = require('../utils/roles');

const HEAD_ADMIN_ROLE_ID =
  process.env.HEAD_ADMIN_ROLE_ID || '1492957184261230642';
const OPEN_TICKET_CUSTOM_ID = 'ticket:open';
const CLAIM_TICKET_CUSTOM_ID = 'ticket:claim';
const CLOSE_TICKET_CUSTOM_ID = 'ticket:close';
const DEFAULT_PANEL_TITLE = 'Zuno Support';
const DEFAULT_PANEL_DESCRIPTION =
  'Need help? Open a ticket and the team will assist you.';
const DEFAULT_PANEL_BUTTON_LABEL = 'Open Ticket';

function buildTicketPanel(config) {
  const embed = new EmbedBuilder()
    .setColor(0x2b2d31)
    .setAuthor({ name: 'ZUNO • TICKETS' })
    .setTitle(config.title || DEFAULT_PANEL_TITLE)
    .setDescription(config.description || DEFAULT_PANEL_DESCRIPTION)
    .setFooter({ text: 'Zuno support' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(OPEN_TICKET_CUSTOM_ID)
      .setLabel(config.buttonLabel || DEFAULT_PANEL_BUTTON_LABEL)
      .setStyle(ButtonStyle.Secondary),
  );

  return {
    embeds: [embed],
    components: [row],
  };
}

function buildTicketWelcome(ticketOwner, ticket = {}) {
  const claimedBy = ticket.claimedBy ? `<@${ticket.claimedBy}>` : 'Not claimed';
  const embed = new EmbedBuilder()
    .setColor(0x2b2d31)
    .setAuthor({ name: 'ZUNO • TICKET' })
    .setTitle('Support Ticket')
    .setDescription(
      `${ticketOwner}, explain what you need help with and the team will respond here.`,
    )
    .addFields({
      name: 'CLAIM',
      value: claimedBy,
    })
    .setFooter({ text: 'Close this ticket when it is resolved.' })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(CLAIM_TICKET_CUSTOM_ID)
      .setLabel(ticket.claimedBy ? 'Claimed' : 'Claim Ticket')
      .setStyle(ticket.claimedBy ? ButtonStyle.Success : ButtonStyle.Primary)
      .setDisabled(Boolean(ticket.claimedBy)),
    new ButtonBuilder()
      .setCustomId(CLOSE_TICKET_CUSTOM_ID)
      .setLabel('Close Ticket')
      .setStyle(ButtonStyle.Danger),
  );

  return {
    embeds: [embed],
    components: [row],
  };
}

function formatDiscordTimestamp(value, style = 'f') {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return 'Unknown';
  }

  return `<t:${Math.floor(date.getTime() / 1000)}:${style}>`;
}

function formatDuration(startValue, endValue = new Date()) {
  const start = new Date(startValue);
  const end = new Date(endValue);

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return 'Unknown';
  }

  const totalSeconds = Math.max(
    0,
    Math.floor((end.getTime() - start.getTime()) / 1000),
  );
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);

  const parts = [];

  if (days) {
    parts.push(`${days}d`);
  }

  if (hours) {
    parts.push(`${hours}h`);
  }

  if (minutes || parts.length === 0) {
    parts.push(`${minutes}m`);
  }

  return parts.join(' ');
}

async function fetchTranscriptMessages(channel) {
  const messages = [];
  let before;

  while (true) {
    const batch = await channel.messages
      .fetch({
        limit: 100,
        before,
      })
      .catch(() => null);

    if (!batch?.size) {
      break;
    }

    messages.push(...batch.values());
    before = batch.last().id;

    if (batch.size < 100) {
      break;
    }
  }

  return messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
}

function formatTranscriptLine(message) {
  const author = message.author?.tag ?? 'Unknown User';
  const authorId = message.author?.id ?? 'unknown-id';
  const timestamp = message.createdAt.toISOString();
  const content = message.content?.trim() || '[No text content]';
  const attachments = [...message.attachments.values()].map(
    (attachment) => `Attachment: ${attachment.url}`,
  );
  const stickers = [...message.stickers.values()].map(
    (sticker) => `Sticker: ${sticker.name}`,
  );
  const embeds =
    message.embeds.length > 0 ? [`Embeds: ${message.embeds.length}`] : [];
  const extras = [...attachments, ...stickers, ...embeds];

  return [
    `[${timestamp}] ${author} (${authorId})`,
    content,
    ...extras,
  ].join('\n');
}

function buildTranscriptText({ channel, config, ticket, closedBy, closedAt, messages }) {
  const header = [
    'Zuno Ticket Transcript',
    `Ticket: #${ticket.ticketNumber}`,
    `Channel: #${channel.name} (${channel.id})`,
    `Panel: ${config?.title || DEFAULT_PANEL_TITLE}`,
    `Owner ID: ${ticket.userId}`,
    `Claimed By ID: ${ticket.claimedBy || 'Unclaimed'}`,
    `Closed By: ${closedBy.tag} (${closedBy.id})`,
    `Created At: ${ticket.createdAt || 'Unknown'}`,
    `Closed At: ${closedAt.toISOString()}`,
    `Message Count: ${messages.length}`,
    ''.padEnd(48, '-'),
  ];

  const lines = messages.map(formatTranscriptLine);
  return `${header.join('\n')}\n\n${lines.join('\n\n')}\n`;
}

function getTranscriptParticipants(messages) {
  const participants = new Map();

  for (const message of messages) {
    if (message.author?.id) {
      participants.set(message.author.id, message.author.tag);
    }
  }

  return participants;
}

function formatParticipantSummary(participants) {
  if (participants.size === 0) {
    return 'No message authors found';
  }

  const lines = [...participants.entries()]
    .slice(0, 10)
    .map(([userId, tag], index) => `${index + 1}. <@${userId}> - ${tag}`);

  if (participants.size > 10) {
    lines.push(`+ ${participants.size - 10} more`);
  }

  return lines.join('\n');
}

function buildTicketLogEmbed({
  channel,
  config,
  ticket,
  closedBy,
  closedAt,
  messageCount,
  participants,
}) {
  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setAuthor({ name: 'ZUNO • TICKET TRANSCRIPT' })
    .setTitle(`Ticket #${ticket.ticketNumber} Closed`)
    .setDescription('A ticket was closed and its transcript is attached below.')
    .addFields(
      {
        name: 'TICKET',
        value: [
          `Owner: <@${ticket.userId}>`,
          `Channel: #${channel.name}`,
          `Panel: **${config?.title || DEFAULT_PANEL_TITLE}**`,
        ].join('\n'),
        inline: true,
      },
      {
        name: 'STAFF',
        value: [
          `Closed By: <@${closedBy.id}>`,
          `Claimed By: ${
            ticket.claimedBy ? `<@${ticket.claimedBy}>` : 'Unclaimed'
          }`,
        ].join('\n'),
        inline: true,
      },
      {
        name: 'TIMING',
        value: [
          `Opened: ${formatDiscordTimestamp(ticket.createdAt)}`,
          `Closed: ${formatDiscordTimestamp(closedAt)}`,
          `Duration: **${formatDuration(ticket.createdAt, closedAt)}**`,
        ].join('\n'),
        inline: false,
      },
      {
        name: 'TRANSCRIPT',
        value: [
          `Messages: **${messageCount}**`,
          `Users: **${participants.size}**`,
          'File: attached `.txt` transcript',
        ].join('\n'),
        inline: true,
      },
      {
        name: 'USERS IN TRANSCRIPT',
        value: formatParticipantSummary(participants),
        inline: false,
      },
    )
    .setFooter({ text: 'Zuno ticket logs' })
    .setTimestamp(closedAt);
}

function buildConfigSummary(config) {
  return [
    `Panel Title: **${config.title || DEFAULT_PANEL_TITLE}**`,
    `Button Label: **${config.buttonLabel || DEFAULT_PANEL_BUTTON_LABEL}**`,
    `Panel Channel: <#${config.panelChannelId}>`,
    `Category: <#${config.categoryId}>`,
    config.supportRoleId ? `Support Role: <@&${config.supportRoleId}>` : null,
    config.logChannelId ? `Log Channel: <#${config.logChannelId}>` : null,
    config.panelMessageId ? `Panel Message ID: \`${config.panelMessageId}\`` : null,
  ]
    .filter(Boolean)
    .join('\n');
}

async function sendTicketPanel(guild, channelId, config) {
  const channel = await guild.channels.fetch(channelId).catch(() => null);

  if (!channel?.send || channel.type !== ChannelType.GuildText) {
    throw new Error('Invalid ticket panel channel.');
  }

  return channel.send(buildTicketPanel(config));
}

async function editSavedTicketPanel(guild, config) {
  if (!config.panelChannelId || !config.panelMessageId) {
    return false;
  }

  const channel = await guild.channels
    .fetch(config.panelChannelId)
    .catch(() => null);

  if (!channel?.messages?.fetch) {
    return false;
  }

  const message = await channel.messages
    .fetch(config.panelMessageId)
    .catch(() => null);

  if (!message?.editable) {
    return false;
  }

  await message.edit(buildTicketPanel(config));
  return true;
}

function ticketChannelName(username, ticketNumber) {
  const safeUsername =
    username
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 24) || 'user';

  return `ticket-${String(ticketNumber).padStart(4, '0')}-${safeUsername}`.slice(
    0,
    100,
  );
}

async function canStaffHandleTicket(interaction, config) {
  return Boolean(
    (config?.supportRoleId && hasRole(interaction.member, config.supportRoleId)) ||
      (await hasRoleOrAbove(interaction, HEAD_ADMIN_ROLE_ID)),
  );
}

async function requireHeadAdmin(interaction) {
  if (await hasRoleOrAbove(interaction, HEAD_ADMIN_ROLE_ID)) {
    return true;
  }

  await interaction.reply({
    content:
      '❌ Only Head Administrator or higher can configure the ticket system.',
    flags: MessageFlags.Ephemeral,
  });

  return false;
}

async function setupTickets(interaction) {
  if (!(await requireHeadAdmin(interaction))) {
    return;
  }

  const panelChannel = interaction.options.getChannel('panel_channel', true);
  const category = interaction.options.getChannel('category', true);
  const supportRole = interaction.options.getRole('support_role');
  const logChannel = interaction.options.getChannel('log_channel');
  const title =
    interaction.options.getString('title')?.trim() || DEFAULT_PANEL_TITLE;
  const description =
    interaction.options.getString('description')?.trim() ||
    DEFAULT_PANEL_DESCRIPTION;
  const buttonLabel =
    interaction.options.getString('button_label')?.trim() ||
    DEFAULT_PANEL_BUTTON_LABEL;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  if (panelChannel.type !== ChannelType.GuildText) {
    await interaction.editReply('❌ The panel channel must be a text channel.');
    return;
  }

  if (category.type !== ChannelType.GuildCategory) {
    await interaction.editReply('❌ The category must be a channel category.');
    return;
  }

  if (logChannel && logChannel.type !== ChannelType.GuildText) {
    await interaction.editReply('❌ The log channel must be a text channel.');
    return;
  }

  const config = {
    panelChannelId: panelChannel.id,
    categoryId: category.id,
    supportRoleId: supportRole?.id ?? null,
    logChannelId: logChannel?.id ?? null,
    title,
    description,
    buttonLabel,
    configuredBy: interaction.user.id,
  };

  const panelMessage = await sendTicketPanel(
    interaction.guild,
    panelChannel.id,
    config,
  );
  const savedConfig = setTicketConfig(interaction.guildId, {
    ...config,
    panelMessageId: panelMessage.id,
  });

  await interaction.editReply({
    content: `✅ Ticket system configured.\n${buildConfigSummary(savedConfig)}`,
  });
}

async function editTickets(interaction) {
  if (!(await requireHeadAdmin(interaction))) {
    return;
  }

  const currentConfig = getTicketConfig(interaction.guildId);

  if (!currentConfig) {
    await interaction.reply({
      content: '❌ The ticket system is not configured yet. Use `/ticket setup` first.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const panelChannel = interaction.options.getChannel('panel_channel');
  const category = interaction.options.getChannel('category');
  const supportRole = interaction.options.getRole('support_role');
  const logChannel = interaction.options.getChannel('log_channel');
  const title = interaction.options.getString('title')?.trim();
  const description = interaction.options.getString('description')?.trim();
  const buttonLabel = interaction.options.getString('button_label')?.trim();
  const clearSupportRole =
    interaction.options.getBoolean('clear_support_role') ?? false;
  const clearLogChannel =
    interaction.options.getBoolean('clear_log_channel') ?? false;
  const sendNewPanel =
    interaction.options.getBoolean('send_new_panel') ?? false;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  if (panelChannel && panelChannel.type !== ChannelType.GuildText) {
    await interaction.editReply('❌ The panel channel must be a text channel.');
    return;
  }

  if (category && category.type !== ChannelType.GuildCategory) {
    await interaction.editReply('❌ The category must be a channel category.');
    return;
  }

  if (logChannel && logChannel.type !== ChannelType.GuildText) {
    await interaction.editReply('❌ The log channel must be a text channel.');
    return;
  }

  const movedPanel =
    panelChannel && panelChannel.id !== currentConfig.panelChannelId;
  const nextConfig = {
    ...currentConfig,
    panelChannelId: panelChannel?.id ?? currentConfig.panelChannelId,
    categoryId: category?.id ?? currentConfig.categoryId,
    supportRoleId: clearSupportRole
      ? null
      : supportRole?.id ?? currentConfig.supportRoleId ?? null,
    logChannelId: clearLogChannel
      ? null
      : logChannel?.id ?? currentConfig.logChannelId ?? null,
    title: title || currentConfig.title || DEFAULT_PANEL_TITLE,
    description:
      description || currentConfig.description || DEFAULT_PANEL_DESCRIPTION,
    buttonLabel:
      buttonLabel || currentConfig.buttonLabel || DEFAULT_PANEL_BUTTON_LABEL,
    configuredBy: currentConfig.configuredBy,
    updatedBy: interaction.user.id,
  };

  let savedConfig = nextConfig;
  let panelAction = 'Updated the existing ticket panel.';

  if (movedPanel || sendNewPanel) {
    const panelMessage = await sendTicketPanel(
      interaction.guild,
      nextConfig.panelChannelId,
      nextConfig,
    );

    savedConfig = {
      ...nextConfig,
      panelMessageId: panelMessage.id,
    };
    panelAction = `Sent a new ticket panel in <#${nextConfig.panelChannelId}>.`;
  } else {
    const edited = await editSavedTicketPanel(interaction.guild, nextConfig);

    if (!edited) {
      const panelMessage = await sendTicketPanel(
        interaction.guild,
        nextConfig.panelChannelId,
        nextConfig,
      );

      savedConfig = {
        ...nextConfig,
        panelMessageId: panelMessage.id,
      };
      panelAction =
        'The old panel message could not be edited, so I sent a new one.';
    }
  }

  savedConfig = setTicketConfig(interaction.guildId, savedConfig);

  await interaction.editReply({
    content: `✅ Ticket settings updated. ${panelAction}\n${buildConfigSummary(savedConfig)}`,
  });
}

async function refreshTicketPanel(interaction) {
  if (!(await requireHeadAdmin(interaction))) {
    return;
  }

  const config = getTicketConfig(interaction.guildId);

  if (!config) {
    await interaction.reply({
      content: '❌ The ticket system is not configured yet.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const edited = await editSavedTicketPanel(interaction.guild, config);

  if (!edited) {
    await interaction.editReply({
      content:
        '❌ I could not find or edit the saved ticket panel. Use `/ticket resend` to post a new one.',
    });
    return;
  }

  await interaction.editReply('✅ Ticket panel refreshed.');
}

async function resendTicketPanel(interaction) {
  if (!(await requireHeadAdmin(interaction))) {
    return;
  }

  const currentConfig = getTicketConfig(interaction.guildId);

  if (!currentConfig) {
    await interaction.reply({
      content: '❌ The ticket system is not configured yet. Use `/ticket setup` first.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const panelChannel = interaction.options.getChannel('panel_channel');
  const targetChannelId = panelChannel?.id ?? currentConfig.panelChannelId;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  if (panelChannel && panelChannel.type !== ChannelType.GuildText) {
    await interaction.editReply('❌ The panel channel must be a text channel.');
    return;
  }

  const nextConfig = {
    ...currentConfig,
    panelChannelId: targetChannelId,
    updatedBy: interaction.user.id,
  };
  const panelMessage = await sendTicketPanel(
    interaction.guild,
    targetChannelId,
    nextConfig,
  );
  const savedConfig = setTicketConfig(interaction.guildId, {
    ...nextConfig,
    panelMessageId: panelMessage.id,
  });

  await interaction.editReply({
    content: `✅ Ticket panel sent in <#${targetChannelId}>.\n${buildConfigSummary(savedConfig)}`,
  });
}

async function showConfig(interaction) {
  if (!(await requireHeadAdmin(interaction))) {
    return;
  }

  const config = getTicketConfig(interaction.guildId);

  if (!config) {
    await interaction.reply({
      content: 'No ticket system is configured for this server yet.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.reply({
    content: buildConfigSummary(config),
    flags: MessageFlags.Ephemeral,
  });
}

async function disableTickets(interaction) {
  if (!(await requireHeadAdmin(interaction))) {
    return;
  }

  clearTicketConfig(interaction.guildId);

  await interaction.reply({
    content: '✅ Ticket system disabled. Existing ticket channels were not deleted.',
    flags: MessageFlags.Ephemeral,
  });
}

async function openTicket(interaction) {
  if (!interaction.inGuild()) {
    await interaction.reply({
      content: '❌ Tickets can only be opened inside a server.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const config = getTicketConfig(interaction.guildId);

  if (!config) {
    await interaction.reply({
      content: '❌ The ticket system is not configured yet.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const existingTicket = getOpenTicketForUser(
    interaction.guildId,
    interaction.user.id,
  );

  if (existingTicket) {
    const existingChannel = await interaction.guild.channels
      .fetch(existingTicket.channelId)
      .catch(() => null);

    if (existingChannel) {
      await interaction.reply({
        content: `You already have an open ticket: ${existingChannel}`,
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const ticketNumber = getNextTicketNumber(interaction.guildId);
  const permissionOverwrites = [
    {
      id: interaction.guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: interaction.user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
      ],
    },
    {
      id: interaction.client.user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
      ],
    },
  ];

  if (config.supportRoleId) {
    permissionOverwrites.push({
      id: config.supportRoleId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
      ],
    });
  }

  const channel = await interaction.guild.channels.create({
    name: ticketChannelName(interaction.user.username, ticketNumber),
    type: ChannelType.GuildText,
    parent: config.categoryId,
    topic: `Ticket ${ticketNumber} for ${interaction.user.tag} (${interaction.user.id})`,
    permissionOverwrites,
    reason: `Ticket opened by ${interaction.user.tag}`,
  });

  const welcomeMessage = await channel.send({
    content: config.supportRoleId
      ? `<@${interaction.user.id}> <@&${config.supportRoleId}>`
      : `<@${interaction.user.id}>`,
    ...buildTicketWelcome(`<@${interaction.user.id}>`),
  });

  addOpenTicket(interaction.guildId, interaction.user.id, {
    channelId: channel.id,
    ticketNumber,
    messageId: welcomeMessage.id,
    claimedBy: null,
    claimedAt: null,
  });

  await interaction.editReply(`✅ Ticket opened: ${channel}`);
}

async function logTicketClose(interaction, config, ticket) {
  if (!config?.logChannelId) {
    return;
  }

  const logChannel = await interaction.guild.channels
    .fetch(config.logChannelId)
    .catch(() => null);

  if (!logChannel?.send) {
    return;
  }

  const closedAt = new Date();
  const messages = await fetchTranscriptMessages(interaction.channel);
  const participants = getTranscriptParticipants(messages);
  const transcriptText = buildTranscriptText({
    channel: interaction.channel,
    config,
    ticket,
    closedBy: interaction.user,
    closedAt,
    messages,
  });
  const transcriptFile = new AttachmentBuilder(
    Buffer.from(transcriptText, 'utf8'),
    {
      name: `ticket-${String(ticket.ticketNumber).padStart(4, '0')}-transcript.txt`,
    },
  );
  const embed = buildTicketLogEmbed({
    channel: interaction.channel,
    config,
    ticket,
    closedBy: interaction.user,
    closedAt,
    messageCount: messages.length,
    participants,
  });

  await logChannel
    .send({
      embeds: [embed],
      files: [transcriptFile],
    })
    .catch(() => null);
}

async function closeTicket(interaction) {
  if (!interaction.inGuild()) {
    await interaction.reply({
      content: '❌ Tickets can only be closed inside a server.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const config = getTicketConfig(interaction.guildId);
  const ticket = findTicketByChannel(interaction.guildId, interaction.channelId);

  if (!ticket) {
    await interaction.reply({
      content: '❌ This channel is not an active ticket.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const canClose =
    interaction.user.id === ticket.userId ||
    (await canStaffHandleTicket(interaction, config));

  if (!canClose) {
    await interaction.reply({
      content: '❌ You do not have permission to close this ticket.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.reply({
    content: 'Closing this ticket...',
    flags: MessageFlags.Ephemeral,
  });

  const removedTicket = removeOpenTicketByChannel(
    interaction.guildId,
    interaction.channelId,
  );

  await logTicketClose(interaction, config, removedTicket ?? ticket);

  setTimeout(() => {
    interaction.channel?.delete('Ticket closed').catch(() => null);
  }, 3000);
}

async function claimTicket(interaction) {
  if (!interaction.inGuild()) {
    await interaction.reply({
      content: '❌ Tickets can only be claimed inside a server.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const config = getTicketConfig(interaction.guildId);
  const ticket = findTicketByChannel(interaction.guildId, interaction.channelId);

  if (!ticket) {
    await interaction.reply({
      content: '❌ This channel is not an active ticket.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (!(await canStaffHandleTicket(interaction, config))) {
    await interaction.reply({
      content: '❌ Only staff can claim tickets.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (ticket.claimedBy) {
    await interaction.reply({
      content: `This ticket is already claimed by <@${ticket.claimedBy}>.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const claimedTicket = updateOpenTicketByChannel(
    interaction.guildId,
    interaction.channelId,
    {
      claimedBy: interaction.user.id,
      claimedAt: new Date().toISOString(),
    },
  );

  await interaction.update(
    buildTicketWelcome(`<@${claimedTicket.userId}>`, claimedTicket),
  );

  await interaction.channel
    ?.setTopic(
      `Ticket ${claimedTicket.ticketNumber} for ${claimedTicket.userId} • Claimed by ${interaction.user.tag} (${interaction.user.id})`,
      'Ticket claimed',
    )
    .catch(() => null);

  await interaction.channel
    ?.send(`✅ Ticket claimed by <@${interaction.user.id}>.`)
    .catch(() => null);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('Configure and use the Zuno ticket system.')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('setup')
        .setDescription('Configure the ticket system and send a ticket panel.')
        .addChannelOption((option) =>
          option
            .setName('panel_channel')
            .setDescription('Where the ticket panel should be posted.')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true),
        )
        .addChannelOption((option) =>
          option
            .setName('category')
            .setDescription('The category where ticket channels are created.')
            .addChannelTypes(ChannelType.GuildCategory)
            .setRequired(true),
        )
        .addRoleOption((option) =>
          option
            .setName('support_role')
            .setDescription('Optional role that can see and answer tickets.'),
        )
        .addChannelOption((option) =>
          option
            .setName('log_channel')
            .setDescription('Optional channel where closed tickets are logged.')
            .addChannelTypes(ChannelType.GuildText),
        )
        .addStringOption((option) =>
          option
            .setName('title')
            .setDescription('Optional panel title.')
            .setMaxLength(100),
        )
        .addStringOption((option) =>
          option
            .setName('description')
            .setDescription('Optional panel description.')
            .setMaxLength(1000),
        )
        .addStringOption((option) =>
          option
            .setName('button_label')
            .setDescription('Optional text for the panel button.')
            .setMaxLength(80),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('edit')
        .setDescription('Modify ticket panel and destination settings.')
        .addChannelOption((option) =>
          option
            .setName('panel_channel')
            .setDescription('Move or choose where the ticket panel is posted.')
            .addChannelTypes(ChannelType.GuildText),
        )
        .addChannelOption((option) =>
          option
            .setName('category')
            .setDescription('Change where ticket channels are created.')
            .addChannelTypes(ChannelType.GuildCategory),
        )
        .addRoleOption((option) =>
          option
            .setName('support_role')
            .setDescription('Change the role that can see and answer tickets.'),
        )
        .addChannelOption((option) =>
          option
            .setName('log_channel')
            .setDescription('Change where ticket close logs are sent.')
            .addChannelTypes(ChannelType.GuildText),
        )
        .addStringOption((option) =>
          option
            .setName('title')
            .setDescription('Change the panel title.')
            .setMaxLength(100),
        )
        .addStringOption((option) =>
          option
            .setName('description')
            .setDescription('Change the panel description.')
            .setMaxLength(1000),
        )
        .addStringOption((option) =>
          option
            .setName('button_label')
            .setDescription('Change the panel button text.')
            .setMaxLength(80),
        )
        .addBooleanOption((option) =>
          option
            .setName('clear_support_role')
            .setDescription('Remove the configured support role.'),
        )
        .addBooleanOption((option) =>
          option
            .setName('clear_log_channel')
            .setDescription('Remove the configured log channel.'),
        )
        .addBooleanOption((option) =>
          option
            .setName('send_new_panel')
            .setDescription('Send a new panel instead of editing the saved one.'),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('resend')
        .setDescription('Send a fresh ticket panel and save it as active.')
        .addChannelOption((option) =>
          option
            .setName('panel_channel')
            .setDescription('Optional channel to send the panel in.')
            .addChannelTypes(ChannelType.GuildText),
        ),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('refresh')
        .setDescription('Refresh the currently saved ticket panel message.'),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('config')
        .setDescription('Show the current ticket configuration.'),
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('disable')
        .setDescription('Disable the ticket system for this server.'),
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'setup') {
      await setupTickets(interaction);
      return;
    }

    if (subcommand === 'edit') {
      await editTickets(interaction);
      return;
    }

    if (subcommand === 'resend') {
      await resendTicketPanel(interaction);
      return;
    }

    if (subcommand === 'refresh') {
      await refreshTicketPanel(interaction);
      return;
    }

    if (subcommand === 'config') {
      await showConfig(interaction);
      return;
    }

    if (subcommand === 'disable') {
      await disableTickets(interaction);
      return;
    }

    await interaction.reply({
      content: '❌ Unknown ticket command.',
      flags: MessageFlags.Ephemeral,
    });
  },

  async handleButton(interaction) {
    if (interaction.customId === OPEN_TICKET_CUSTOM_ID) {
      await openTicket(interaction);
      return true;
    }

    if (interaction.customId === CLAIM_TICKET_CUSTOM_ID) {
      await claimTicket(interaction);
      return true;
    }

    if (interaction.customId === CLOSE_TICKET_CUSTOM_ID) {
      await closeTicket(interaction);
      return true;
    }

    return false;
  },
};
