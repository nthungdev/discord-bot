import {
  type ChatInputCommandInteraction,
  EmbedBuilder,
  type Guild,
  type GuildMember,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type TextChannel,
} from "discord.js";
import {
  buildPanelComponents,
  buildPanelEmbed,
  DISCORD_MAX_EMBED_FIELDS,
  getRoleStore,
  validatePanelRoleCapacity,
  validateRoleManageable,
} from "../../../services/roles";
import type {
  IRoleStore,
  RoleComponentType,
  RoleOption,
  RolePanel,
  RoleSelectionMode,
} from "../../../services/roles/types";
import { DiscordCommand } from "../../constants";

export const data = new SlashCommandBuilder()
  .setName(DiscordCommand.RolePanel)
  .setDescription("Configure and manage self-service role selection panels.")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
  .addSubcommand((sub) =>
    sub
      .setName("create")
      .setDescription("Create a new self-service role panel configuration.")
      .addStringOption((opt) =>
        opt
          .setName("id")
          .setDescription("Unique panel slug (e.g. notifications, colors)")
          .setMaxLength(40)
          .setRequired(true),
      )
      .addStringOption((opt) =>
        opt
          .setName("title")
          .setDescription("Title shown on the panel embed")
          .setRequired(true),
      )
      .addStringOption((opt) =>
        opt
          .setName("type")
          .setDescription("Display style: button or dropdown")
          .setRequired(true)
          .addChoices(
            { name: "Button (Action rows)", value: "button" },
            { name: "Dropdown (Select menu)", value: "dropdown" },
          ),
      )
      .addStringOption((opt) =>
        opt
          .setName("mode")
          .setDescription(
            "Selection logic: multi-select or single-select (radio)",
          )
          .setRequired(false)
          .addChoices(
            { name: "Multi-select (Independent toggles)", value: "multi" },
            { name: "Single-select (Radio mode)", value: "single" },
          ),
      )
      .addStringOption((opt) =>
        opt
          .setName("description")
          .setDescription("Explanatory description shown on the panel embed")
          .setRequired(false),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("add-role")
      .setDescription("Add a role option to a role panel.")
      .addStringOption((opt) =>
        opt.setName("id").setDescription("Target panel ID").setRequired(true),
      )
      .addRoleOption((opt) =>
        opt
          .setName("role")
          .setDescription("Discord role to add")
          .setRequired(true),
      )
      .addStringOption((opt) =>
        opt
          .setName("label")
          .setDescription("Custom display label (defaults to role name)")
          .setRequired(false),
      )
      .addStringOption((opt) =>
        opt
          .setName("emoji")
          .setDescription("Unicode or custom emoji (e.g. 🔔, :bell:)")
          .setRequired(false),
      )
      .addStringOption((opt) =>
        opt
          .setName("description")
          .setDescription("Short description (for dropdown menus)")
          .setRequired(false),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("remove-role")
      .setDescription("Remove a role option from a role panel.")
      .addStringOption((opt) =>
        opt.setName("id").setDescription("Target panel ID").setRequired(true),
      )
      .addRoleOption((opt) =>
        opt
          .setName("role")
          .setDescription("Discord role to remove")
          .setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("post")
      .setDescription("Publish a role panel into a server channel.")
      .addStringOption((opt) =>
        opt
          .setName("id")
          .setDescription("Target panel ID to publish")
          .setRequired(true),
      )
      .addChannelOption((opt) =>
        opt
          .setName("channel")
          .setDescription(
            "Target channel to post in (defaults to current channel)",
          )
          .setRequired(false),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("update")
      .setDescription("Refresh an already posted panel message in-place.")
      .addStringOption((opt) =>
        opt
          .setName("id")
          .setDescription("Target panel ID to refresh")
          .setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("list")
      .setDescription("List all configured role panels for this server."),
  )
  .addSubcommand((sub) =>
    sub
      .setName("delete")
      .setDescription("Delete a role panel configuration.")
      .addStringOption((opt) =>
        opt
          .setName("id")
          .setDescription("Target panel ID to delete")
          .setRequired(true),
      ),
  );

async function handleCreate(
  interaction: ChatInputCommandInteraction,
  guild: Guild,
  store: IRoleStore,
): Promise<void> {
  const id = interaction.options.getString("id", true).trim().toLowerCase();
  const PANEL_ID_REGEX = /^[a-z0-9_-]{1,40}$/;
  if (!PANEL_ID_REGEX.test(id)) {
    await interaction.reply({
      content:
        "⚠️ Panel ID must be 1-40 alphanumeric characters, hyphens, or underscores (no colons or special characters).",
      ephemeral: true,
    });
    return;
  }

  const title = interaction.options.getString("title", true).trim();
  const type = interaction.options.getString("type", true) as RoleComponentType;
  const mode = (interaction.options.getString("mode") ??
    "multi") as RoleSelectionMode;
  const description =
    interaction.options.getString("description") ?? "Select your roles below:";

  const existing = await store.getPanel(guild.id, id);
  if (existing) {
    await interaction.reply({
      content: `⚠️ A role panel with ID '**${id}**' already exists in this server.`,
      ephemeral: true,
    });
    return;
  }

  const panel: RolePanel = {
    id,
    guildId: guild.id,
    title,
    description,
    type,
    mode,
    roles: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  await store.savePanel(panel);

  await interaction.reply({
    content: `✅ Created role panel **${id}** (${type}, ${mode}).\nUse \`/role-panel add-role id:${id} role:@Role\` to add options, then \`/role-panel post id:${id}\` to deploy it.`,
    ephemeral: true,
  });
}

async function handleAddRole(
  interaction: ChatInputCommandInteraction,
  guild: Guild,
  caller: GuildMember,
  store: IRoleStore,
): Promise<void> {
  const id = interaction.options.getString("id", true).trim().toLowerCase();
  const role = interaction.options.getRole("role", true);
  const label = interaction.options.getString("label")?.trim() || role.name;
  const emoji = interaction.options.getString("emoji")?.trim();
  const description = interaction.options.getString("description")?.trim();

  const panel = await store.getPanel(guild.id, id);
  if (!panel) {
    await interaction.reply({
      content: `⚠️ Panel '**${id}**' was not found. Use \`/role-panel list\` to see existing panels.`,
      ephemeral: true,
    });
    return;
  }

  if (panel.roles.some((r) => r.roleId === role.id)) {
    await interaction.reply({
      content: `⚠️ Role <@&${role.id}> is already configured on panel '**${id}**'.`,
      ephemeral: true,
    });
    return;
  }

  const resolvedRole = guild.roles.cache.get(role.id);
  if (!resolvedRole) {
    await interaction.reply({
      content: "⚠️ Could not resolve target role in guild cache.",
      ephemeral: true,
    });
    return;
  }

  const validation = validateRoleManageable(guild, resolvedRole, caller);
  if (!validation.valid) {
    await interaction.reply({
      content: `⚠️ Cannot add role: ${validation.error}`,
      ephemeral: true,
    });
    return;
  }

  const capValidation = validatePanelRoleCapacity(panel, 1);
  if (!capValidation.valid) {
    await interaction.reply({
      content: `⚠️ ${capValidation.error}`,
      ephemeral: true,
    });
    return;
  }

  const roleOption: RoleOption = {
    roleId: role.id,
    label,
    ...(emoji ? { emoji } : {}),
    ...(description ? { description } : {}),
  };
  panel.roles.push(roleOption);
  panel.updatedAt = Date.now();

  await store.savePanel(panel);

  await interaction.reply({
    content: `✅ Added role **@${role.name}** to panel '**${id}**'.\nTotal roles: ${panel.roles.length}. If already posted, use \`/role-panel update id:${id}\` to refresh.`,
    ephemeral: true,
  });
}

async function handleRemoveRole(
  interaction: ChatInputCommandInteraction,
  guild: Guild,
  store: IRoleStore,
): Promise<void> {
  const id = interaction.options.getString("id", true).trim().toLowerCase();
  const role = interaction.options.getRole("role", true);

  const panel = await store.getPanel(guild.id, id);
  if (!panel) {
    await interaction.reply({
      content: `⚠️ Panel '**${id}**' was not found.`,
      ephemeral: true,
    });
    return;
  }

  const index = panel.roles.findIndex((r) => r.roleId === role.id);
  if (index === -1) {
    await interaction.reply({
      content: `⚠️ Role <@&${role.id}> is not configured on panel '**${id}**'.`,
      ephemeral: true,
    });
    return;
  }

  panel.roles.splice(index, 1);
  panel.updatedAt = Date.now();

  await store.savePanel(panel);

  await interaction.reply({
    content: `🗑️ Removed role **@${role.name}** from panel '**${id}**'. Remaining roles: ${panel.roles.length}.`,
    ephemeral: true,
  });
}

async function handlePost(
  interaction: ChatInputCommandInteraction,
  guild: Guild,
  store: IRoleStore,
): Promise<void> {
  const id = interaction.options.getString("id", true).trim().toLowerCase();
  const panel = await store.getPanel(guild.id, id);
  if (!panel) {
    await interaction.reply({
      content: `⚠️ Panel '**${id}**' was not found.`,
      ephemeral: true,
    });
    return;
  }

  if (panel.roles.length === 0) {
    await interaction.reply({
      content: `⚠️ Panel '**${id}**' has no roles configured yet. Add roles with \`/role-panel add-role\` first.`,
      ephemeral: true,
    });
    return;
  }

  const channelOption = interaction.options.getChannel("channel");
  const targetChannel = (channelOption ??
    interaction.channel) as TextChannel | null;

  if (!targetChannel?.isTextBased()) {
    await interaction.reply({
      content: "⚠️ Target channel must be a text-based channel.",
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const embed = buildPanelEmbed(panel);
  const components = buildPanelComponents(panel, guild);

  try {
    const message = await targetChannel.send({
      embeds: [embed],
      components,
    });

    panel.channelId = targetChannel.id;
    panel.messageId = message.id;
    panel.updatedAt = Date.now();
    await store.savePanel(panel);

    await interaction.editReply({
      content: `✅ Successfully published role panel '**${id}**' to <#${targetChannel.id}>!`,
    });
  } catch (error) {
    console.error("[RolePanelCommand] Error posting panel:", error);
    await interaction.editReply({
      content:
        "⚠️ Failed to post role panel. Please verify bot channel permissions.",
    });
  }
}

async function handleUpdate(
  interaction: ChatInputCommandInteraction,
  guild: Guild,
  store: IRoleStore,
): Promise<void> {
  const id = interaction.options.getString("id", true).trim().toLowerCase();
  const panel = await store.getPanel(guild.id, id);
  if (!panel) {
    await interaction.reply({
      content: `⚠️ Panel '**${id}**' was not found.`,
      ephemeral: true,
    });
    return;
  }

  if (!(panel.channelId && panel.messageId)) {
    await interaction.reply({
      content: `⚠️ Panel '**${id}**' has not been posted yet. Use \`/role-panel post id:${id}\` first.`,
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral: true });

  const channel = (await guild.channels
    .fetch(panel.channelId)
    .catch(() => null)) as TextChannel | null;
  if (!channel?.isTextBased()) {
    await interaction.editReply({
      content: `⚠️ The channel (<#${panel.channelId}>) where this panel was posted no longer exists.`,
    });
    return;
  }

  const message = await channel.messages
    .fetch(panel.messageId)
    .catch(() => null);
  if (!message) {
    await interaction.editReply({
      content: `⚠️ The original message in <#${panel.channelId}> was not found. It may have been deleted.`,
    });
    return;
  }

  const embed = buildPanelEmbed(panel);
  const components = buildPanelComponents(panel, guild);

  try {
    await message.edit({
      embeds: [embed],
      components,
    });

    await interaction.editReply({
      content: `✅ Successfully refreshed role panel '**${id}**' in <#${panel.channelId}>!`,
    });
  } catch (error) {
    console.error("[RolePanelCommand] Error updating panel message:", error);
    await interaction.editReply({
      content: "⚠️ Failed to edit panel message. Please verify bot permissions.",
    });
  }
}

async function handleList(
  interaction: ChatInputCommandInteraction,
  guild: Guild,
  store: IRoleStore,
): Promise<void> {
  const panels = await store.getPanelsByGuild(guild.id);
  if (panels.length === 0) {
    await interaction.reply({
      content:
        "ℹ️ No role panels configured in this server. Use `/role-panel create` to create one.",
      ephemeral: true,
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle(`Configured Role Panels (${panels.length})`)
    .setColor(0x5865f2);

  const displayedPanels = panels.slice(0, DISCORD_MAX_EMBED_FIELDS);

  for (const p of displayedPanels) {
    const status =
      p.channelId && p.messageId
        ? `<#${p.channelId}> (Posted)`
        : "Draft (Not posted)";
    embed.addFields({
      name: `🏷️ ${p.title} (\`${p.id}\`)`,
      value: `**Style**: ${p.type} | **Mode**: ${p.mode}\n**Roles**: ${p.roles.length}\n**Status**: ${status}`,
      inline: false,
    });
  }

  if (panels.length > DISCORD_MAX_EMBED_FIELDS) {
    embed.setFooter({
      text: `Showing first ${DISCORD_MAX_EMBED_FIELDS} of ${panels.length} panels.`,
    });
  }

  await interaction.reply({
    embeds: [embed],
    ephemeral: true,
  });
}

async function handleDelete(
  interaction: ChatInputCommandInteraction,
  guild: Guild,
  store: IRoleStore,
): Promise<void> {
  const id = interaction.options.getString("id", true).trim().toLowerCase();
  const panel = await store.getPanel(guild.id, id);
  if (!panel) {
    await interaction.reply({
      content: `⚠️ Panel '**${id}**' was not found.`,
      ephemeral: true,
    });
    return;
  }

  if (panel.channelId && panel.messageId) {
    try {
      const channel = await guild.channels
        .fetch(panel.channelId)
        .catch(() => null);
      if (channel?.isTextBased()) {
        const message = await channel.messages
          .fetch(panel.messageId)
          .catch(() => null);
        if (message) {
          await message.delete().catch(() => null);
        }
      }
    } catch (error) {
      console.warn(
        `[RolePanelCommand] Best-effort cleanup of published message failed for panel '${id}':`,
        error,
      );
    }
  }

  await store.deletePanel(guild.id, id);

  await interaction.reply({
    content: `🗑️ Deleted role panel '**${id}**'.`,
    ephemeral: true,
  });
}

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({
      content: "⚠️ This command can only be used in a server.",
      ephemeral: true,
    });
    return;
  }

  const subcommand = interaction.options.getSubcommand();
  const store = getRoleStore();
  const caller = interaction.member as GuildMember;

  switch (subcommand) {
    case "create":
      return handleCreate(interaction, guild, store);
    case "add-role":
      return handleAddRole(interaction, guild, caller, store);
    case "remove-role":
      return handleRemoveRole(interaction, guild, store);
    case "post":
      return handlePost(interaction, guild, store);
    case "update":
      return handleUpdate(interaction, guild, store);
    case "list":
      return handleList(interaction, guild, store);
    case "delete":
      return handleDelete(interaction, guild, store);
    default:
      await interaction.reply({
        content: `⚠️ Unknown subcommand: ${subcommand}`,
        ephemeral: true,
      });
  }
}
