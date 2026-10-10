import type {
  ButtonInteraction,
  Guild,
  GuildMember,
  Message,
  MessageReaction,
  PartialMessage,
  PartialMessageReaction,
  PartialUser,
  Role,
  StringSelectMenuInteraction,
  User,
} from "discord.js";
import { DISCORD_MAX_MESSAGE_LENGTH } from "./constants";
import { generateWittyWelcomeGreeting } from "./panel-builder";
import { getRoleStore } from "./store";
import type { IRoleStore, RolePanel } from "./types";
import {
  type ValidationResult,
  validateRoleManageable,
  validateRoleRevocable,
} from "./validation";

/**
 * Matches a configured panel emoji string against a Discord reaction emoji.
 * Supports:
 * - Custom emoji string (<:name:id> or <a:name:id>)
 * - Snowflake ID only (123456789012345678)
 * - Unicode emoji (e.g. 🎮, 🎉)
 */
export function isEmojiMatching(
  configuredEmoji: string,
  reactionEmoji: { name: string | null; id: string | null },
): boolean {
  const trimmed = configuredEmoji.trim();
  const customMatch = trimmed.match(/^<a?:([a-zA-Z0-9_]+):(\d+)>$/);
  if (customMatch) {
    const [, , customId] = customMatch;
    return reactionEmoji.id === customId;
  }
  if (/^\d+$/.test(trimmed)) {
    return reactionEmoji.id === trimmed;
  }
  return reactionEmoji.name === trimmed;
}

/**
 * Executes role addition or removal for a button interaction.
 */
async function applyButtonRoleMutation(
  member: GuildMember,
  panel: RolePanel,
  role: Role,
): Promise<string> {
  if (panel.mode === "single") {
    const otherPanelRoles = panel.roles
      .filter((r) => r.roleId !== role.id && member.roles.cache.has(r.roleId))
      .map((r) => r.roleId);

    if (otherPanelRoles.length > 0) {
      await member.roles.remove(otherPanelRoles);
    }

    if (!member.roles.cache.has(role.id)) {
      await member.roles.add(role.id);
    }

    return `✅ Set role to **@${role.name}**.`;
  }

  // Multi-select toggle mode
  if (member.roles.cache.has(role.id)) {
    await member.roles.remove(role.id);
    return `🗑️ Removed the **@${role.name}** role.`;
  }

  await member.roles.add(role.id);
  return `✅ Added the **@${role.name}** role.`;
}

/**
 * Computes roles to add and remove from a dropdown selection.
 * In single mode: replaces previous panel roles with the selected role.
 * In multi mode: toggles the selected roles without wiping unselected ones.
 */
function computeDropdownDiff(
  panel: RolePanel,
  member: GuildMember,
  rawValues: readonly string[],
): { rolesToAdd: string[]; rolesToRemove: string[] } {
  const panelRoleIds = panel.roles.map((r) => r.roleId);
  const selected = rawValues.filter((id) => panelRoleIds.includes(id));

  if (panel.mode === "single") {
    return computeSingleDropdownDiff(panelRoleIds, member, selected);
  }

  return computeMultiDropdownDiff(member, selected);
}

function computeSingleDropdownDiff(
  panelRoleIds: readonly string[],
  member: GuildMember,
  selected: readonly string[],
): { rolesToAdd: string[]; rolesToRemove: string[] } {
  const chosenRoleId = selected[0];
  const currentMemberRoleIds = panelRoleIds.filter((id) =>
    member.roles.cache.has(id),
  );

  const rolesToAdd =
    chosenRoleId && !currentMemberRoleIds.includes(chosenRoleId)
      ? [chosenRoleId]
      : [];
  const rolesToRemove = currentMemberRoleIds.filter(
    (id) => id !== chosenRoleId,
  );

  return { rolesToAdd, rolesToRemove };
}

function computeMultiDropdownDiff(
  member: GuildMember,
  selected: readonly string[],
): { rolesToAdd: string[]; rolesToRemove: string[] } {
  const rolesToAdd: string[] = [];
  const rolesToRemove: string[] = [];

  for (const roleId of selected) {
    if (member.roles.cache.has(roleId)) {
      rolesToRemove.push(roleId);
    } else {
      rolesToAdd.push(roleId);
    }
  }

  return { rolesToAdd, rolesToRemove };
}

/**
 * Validates that all target roles can be managed by the bot.
 */
function validateDropdownRoles(
  guild: Guild,
  rolesToAdd: readonly string[],
  rolesToRemove: readonly string[],
): ValidationResult {
  for (const rId of rolesToAdd) {
    const r = guild.roles.cache.get(rId);
    if (!r) continue;
    const val = validateRoleManageable(guild, r);
    if (!val.valid) {
      return val;
    }
  }
  for (const rId of rolesToRemove) {
    const r = guild.roles.cache.get(rId);
    if (!r) continue;
    const val = validateRoleRevocable(guild, r);
    if (!val.valid) {
      return val;
    }
  }
  return { valid: true };
}

/**
 * Applies dropdown role mutations and formats user feedback.
 */
async function applyDropdownRoleMutations(
  guild: Guild,
  member: GuildMember,
  rolesToAdd: readonly string[],
  rolesToRemove: readonly string[],
): Promise<string> {
  if (rolesToRemove.length > 0) {
    await member.roles.remove([...rolesToRemove]);
  }
  if (rolesToAdd.length > 0) {
    await member.roles.add([...rolesToAdd]);
  }

  const formatNames = (ids: readonly string[]) =>
    ids
      .map((id) => {
        const r = guild.roles.cache.get(id);
        return r ? `**@${r.name}**` : `<@&${id}>`;
      })
      .join(", ");

  const feedbackLines: string[] = ["✅ Updated roles:"];
  if (rolesToAdd.length > 0) {
    feedbackLines.push(`+ Added ${formatNames(rolesToAdd)}`);
  }
  if (rolesToRemove.length > 0) {
    feedbackLines.push(`- Removed ${formatNames(rolesToRemove)}`);
  }

  return feedbackLines.join("\n");
}

/**
 * Safely fetches fresh member state if guild.members.fetch is available,
 * falling back to the existing member reference.
 */
async function resolveFreshMember(
  guild: Guild,
  member: GuildMember,
): Promise<GuildMember> {
  if (typeof guild.members?.fetch !== "function") {
    return member;
  }
  try {
    const fetched = await guild.members.fetch({
      user: member.id,
      force: true,
    });
    return fetched ?? member;
  } catch {
    try {
      const fetched = await guild.members.fetch(member.id);
      return fetched ?? member;
    } catch {
      return member;
    }
  }
}

/**
 * Resolves a reaction and its message, fetching partials if needed.
 */
async function resolveCompleteReaction(
  reaction: MessageReaction | PartialMessageReaction,
): Promise<MessageReaction | null> {
  if (reaction.partial) {
    try {
      await reaction.fetch();
    } catch (err) {
      console.warn("[RoleService] Failed to fetch partial reaction:", err);
      return null;
    }
  }

  if (!reaction?.message) return null;

  if (reaction.message.partial) {
    try {
      await reaction.message.fetch();
    } catch (err) {
      console.warn(
        "[RoleService] Failed to fetch partial reaction message:",
        err,
      );
      return null;
    }
  }

  return reaction as MessageReaction;
}

/**
 * Resolves a role from guild cache or by fetching it from the API.
 */
async function resolveGuildRole(
  guild: Guild,
  roleId: string,
): Promise<Role | null> {
  return (
    guild.roles.cache.get(roleId) ??
    (await guild.roles.fetch(roleId).catch(() => null))
  );
}

/**
 * Mutates member roles in single or multi mode upon reaction addition.
 */
async function mutateMemberRolesOnReactionAdd(
  freshMember: GuildMember,
  panel: RolePanel,
  roleId: string,
): Promise<void> {
  if (panel.mode === "single") {
    const otherPanelRoles = panel.roles
      .filter(
        (r) => r.roleId !== roleId && freshMember.roles.cache.has(r.roleId),
      )
      .map((r) => r.roleId);
    if (otherPanelRoles.length > 0) {
      await freshMember.roles.remove(otherPanelRoles);
    }
  }
  if (!freshMember.roles.cache.has(roleId)) {
    await freshMember.roles.add(roleId);
  }
}

export class RoleService {
  private store: IRoleStore;
  private memberMutationQueues = new Map<string, Promise<void>>();
  private knownPanelMessageIds = new Set<string>();
  private loadedGuilds = new Set<string>();

  constructor(store?: IRoleStore) {
    this.store = store ?? getRoleStore();
  }

  /**
   * Invalidates cached emoji panel message IDs for a specific guild or all guilds.
   */
  public invalidateGuildPanelCache(guildId?: string): void {
    if (guildId) {
      this.loadedGuilds.delete(guildId);
    } else {
      this.loadedGuilds.clear();
      this.knownPanelMessageIds.clear();
    }
  }

  /**
   * Registers a newly published emoji panel message ID in the local cache.
   */
  public registerEmojiPanelMessage(messageId: string): void {
    this.knownPanelMessageIds.add(messageId);
  }

  /**
   * Loads and caches active emoji panel message IDs for a guild if not loaded yet.
   */
  private async loadGuildEmojiPanels(guildId: string): Promise<void> {
    if (this.loadedGuilds.has(guildId)) return;
    const panels = await this.store.getPanelsByGuild(guildId);
    if (!panels || panels.length === 0) return;

    for (const p of panels) {
      if (p.type === "emoji" && p.messageId) {
        this.knownPanelMessageIds.add(p.messageId);
      }
    }
    this.loadedGuilds.add(guildId);
  }

  /**
   * Resolves a panel by message ID with guard against unnecessary database calls.
   */
  public async getPanelForReaction(
    guildId: string,
    messageId: string,
  ): Promise<RolePanel | null> {
    await this.loadGuildEmojiPanels(guildId);

    if (
      this.loadedGuilds.has(guildId) &&
      !this.knownPanelMessageIds.has(messageId)
    ) {
      return null;
    }

    const panel = await this.store.getPanelByMessageId(guildId, messageId);
    if (panel && panel.type === "emoji" && panel.messageId) {
      this.knownPanelMessageIds.add(panel.messageId);
      this.loadedGuilds.add(guildId);
    }
    return panel;
  }

  private async serializeMemberMutation<T>(
    guildId: string,
    panelId: string,
    memberId: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const key = `${guildId}:${panelId}:${memberId}`;
    const previous = this.memberMutationQueues.get(key) || Promise.resolve();

    let result!: T;
    const current = previous
      .catch(() => {})
      .then(async () => {
        result = await operation();
      });

    this.memberMutationQueues.set(key, current);

    try {
      await current;
      return result;
    } finally {
      if (this.memberMutationQueues.get(key) === current) {
        this.memberMutationQueues.delete(key);
      }
    }
  }

  /**
   * Handles user clicking a role button (role_btn:panelId:roleId).
   */
  public async handleButtonInteraction(
    interaction: ButtonInteraction,
    panelId: string,
    roleId: string,
  ): Promise<void> {
    if (!(interaction.deferred || interaction.replied)) {
      await interaction.deferReply({ ephemeral: true });
    }

    const guild = interaction.guild;
    if (!guild) {
      await interaction.editReply({
        content: "⚠️ Role actions can only be used within a server.",
      });
      return;
    }

    const member =
      (interaction.member as GuildMember | null) ??
      (await guild.members.fetch(interaction.user.id).catch(() => null));
    if (!member) {
      await interaction.editReply({
        content: "⚠️ Could not locate your member record in this server.",
      });
      return;
    }

    const panel = await this.store.getPanel(guild.id, panelId);
    if (!panel) {
      await interaction.editReply({
        content: "⚠️ This role panel no longer exists.",
      });
      return;
    }

    const configuredOption = panel.roles.find((r) => r.roleId === roleId);
    if (!configuredOption) {
      await interaction.editReply({
        content: "⚠️ This role is no longer part of this panel.",
      });
      return;
    }

    const role =
      guild.roles.cache.get(roleId) ??
      (await guild.roles.fetch(roleId).catch(() => null));
    if (!role) {
      await interaction.editReply({
        content: "⚠️ This role does not exist in the server.",
      });
      return;
    }

    const isRevocation =
      panel.mode === "multi" && member.roles.cache.has(role.id);
    const validation = isRevocation
      ? validateRoleRevocable(guild, role)
      : validateRoleManageable(guild, role);
    if (!validation.valid) {
      await interaction.editReply({
        content: `⚠️ Unable to update roles: ${validation.error ?? "Role hierarchy restriction."}`,
      });
      return;
    }

    try {
      const response = await this.serializeMemberMutation(
        guild.id,
        panel.id,
        member.id,
        async () => {
          const freshMember = await resolveFreshMember(guild, member);
          return applyButtonRoleMutation(freshMember, panel, role);
        },
      );
      await interaction.editReply({ content: response });
    } catch (error) {
      console.error(
        "[RoleService] Error updating role on button click:",
        error,
      );
      await interaction.editReply({
        content:
          "⚠️ Unable to update roles: An unexpected Discord error occurred. Please verify bot permissions.",
      });
    }
  }

  /**
   * Handles user choosing options from a role select dropdown (role_select:panelId).
   */
  public async handleSelectInteraction(
    interaction: StringSelectMenuInteraction,
    panelId: string,
  ): Promise<void> {
    if (!(interaction.deferred || interaction.replied)) {
      await interaction.deferReply({ ephemeral: true });
    }

    const guild = interaction.guild;
    if (!guild) {
      await interaction.editReply({
        content: "⚠️ Role actions can only be used within a server.",
      });
      return;
    }

    const member =
      (interaction.member as GuildMember | null) ??
      (await guild.members.fetch(interaction.user.id).catch(() => null));
    if (!member) {
      await interaction.editReply({
        content: "⚠️ Could not locate your member record in this server.",
      });
      return;
    }

    const panel = await this.store.getPanel(guild.id, panelId);
    if (!panel) {
      await interaction.editReply({
        content: "⚠️ This role panel no longer exists.",
      });
      return;
    }

    try {
      const response = await this.serializeMemberMutation(
        guild.id,
        panel.id,
        member.id,
        async () => {
          const freshMember = await resolveFreshMember(guild, member);

          const { rolesToAdd, rolesToRemove } = computeDropdownDiff(
            panel,
            freshMember,
            interaction.values,
          );

          if (rolesToAdd.length === 0 && rolesToRemove.length === 0) {
            return "ℹ️ No changes made to your roles.";
          }

          const validation = validateDropdownRoles(
            guild,
            rolesToAdd,
            rolesToRemove,
          );
          if (!validation.valid) {
            return `⚠️ Unable to update roles: ${validation.error ?? "Hierarchy restriction."}`;
          }

          return applyDropdownRoleMutations(
            guild,
            freshMember,
            rolesToAdd,
            rolesToRemove,
          );
        },
      );
      await interaction.editReply({ content: response });
    } catch (error) {
      console.error(
        "[RoleService] Error updating roles on dropdown select:",
        error,
      );
      await interaction.editReply({
        content:
          "⚠️ Unable to update roles: An unexpected Discord error occurred. Please verify bot permissions.",
      });
    }
  }

  /**
   * Direct staff grant of role to target user.
   */
  public async giveRole(
    guild: Guild,
    caller: GuildMember,
    targetMember: GuildMember,
    role: Role,
  ): Promise<{ success: boolean; message: string }> {
    const validation = validateRoleManageable(guild, role, caller);
    if (!validation.valid) {
      return {
        success: false,
        message: `⚠️ Unable to grant role: ${validation.error}`,
      };
    }

    if (targetMember.roles.cache.has(role.id)) {
      return {
        success: false,
        message: `ℹ️ ${targetMember.user.tag} already has the **@${role.name}** role.`,
      };
    }

    try {
      await targetMember.roles.add(role.id);
      return {
        success: true,
        message: `✅ Granted **@${role.name}** to ${targetMember.user.tag}.`,
      };
    } catch (error) {
      console.error("[RoleService] Error giving role:", error);
      return {
        success: false,
        message: "⚠️ Discord API error while assigning role.",
      };
    }
  }

  /**
   * Direct staff revocation of role from target user.
   */
  public async removeRole(
    guild: Guild,
    caller: GuildMember,
    targetMember: GuildMember,
    role: Role,
  ): Promise<{ success: boolean; message: string }> {
    const validation = validateRoleRevocable(guild, role, caller);
    if (!validation.valid) {
      return {
        success: false,
        message: `⚠️ Unable to revoke role: ${validation.error}`,
      };
    }

    if (!targetMember.roles.cache.has(role.id)) {
      return {
        success: false,
        message: `ℹ️ ${targetMember.user.tag} does not have the **@${role.name}** role.`,
      };
    }

    try {
      await targetMember.roles.remove(role.id);
      return {
        success: true,
        message: `🗑️ Revoked **@${role.name}** from ${targetMember.user.tag}.`,
      };
    } catch (error) {
      console.error("[RoleService] Error removing role:", error);
      return {
        success: false,
        message: "⚠️ Discord API error while revoking role.",
      };
    }
  }

  /**
   * Handles new member join event by sending a witty welcome greeting.
   */
  public async handleGuildMemberAdd(member: GuildMember): Promise<void> {
    const config = await this.store.getOnboardingConfig(member.guild.id);
    if (!(config?.enabled && config.channelId)) {
      return;
    }

    const channel = await member.guild.channels
      .fetch(config.channelId)
      .catch(() => null);
    if (!channel?.isTextBased()) {
      console.warn(
        `[RoleService] Welcome channel '${config.channelId}' not found or not text-based for guild ${member.guild.id}`,
      );
      return;
    }

    const greeting = await generateWittyWelcomeGreeting(
      member,
      config.localeOverride,
    );
    const content =
      greeting.length > DISCORD_MAX_MESSAGE_LENGTH
        ? greeting.slice(0, DISCORD_MAX_MESSAGE_LENGTH)
        : greeting;

    try {
      await channel.send({
        content,
        allowedMentions: { users: [member.id], parse: [] },
      });
    } catch (error) {
      console.error(
        `[RoleService] Failed to send onboarding welcome to channel ${config.channelId}:`,
        error,
      );
    }
  }

  /**
   * For single-choice emoji panels, removes the member's reactions from other panel options.
   */
  private async clearOtherReactionsForSingleMode(
    message: Message | PartialMessage,
    panel: RolePanel,
    activeRoleId: string,
    userId: string,
  ): Promise<void> {
    const otherEmojis = panel.roles
      .filter((r) => r.roleId !== activeRoleId && r.emoji)
      .map((r) => r.emoji as string);

    for (const otherEmoji of otherEmojis) {
      const matchingReaction = Array.from(
        message.reactions?.cache?.values() ?? [],
      ).find((r) => isEmojiMatching(otherEmoji, r.emoji));
      if (matchingReaction) {
        await matchingReaction.users.remove(userId).catch((err) => {
          console.warn(
            `[RoleService] Failed to remove stale reaction '${matchingReaction.emoji.name}' for user ${userId}:`,
            err,
          );
        });
      }
    }
  }

  /**
   * Handles user reacting to an emoji on an emoji role panel message.
   */
  public async handleReactionAdd(
    rawReaction: MessageReaction | PartialMessageReaction,
    user: User | PartialUser,
  ): Promise<void> {
    if (user.bot) return;

    const guildId =
      rawReaction.message.guildId ?? rawReaction.message.guild?.id;
    const messageId = rawReaction.message.id;
    if (!(guildId && messageId)) return;

    const panel = await this.getPanelForReaction(guildId, messageId);
    if (!panel || panel.type !== "emoji") return;

    const reaction = await resolveCompleteReaction(rawReaction);
    if (!(reaction?.message.guild && reaction.message.guildId)) return;

    const guild = reaction.message.guild;
    const roleOption = panel.roles.find(
      (r) => r.emoji && isEmojiMatching(r.emoji, reaction.emoji),
    );

    if (!roleOption) {
      await reaction.users.remove(user.id).catch((err) => {
        console.warn(
          `[RoleService] Failed to remove unauthorized reaction '${reaction.emoji.name}' from user ${user.id}:`,
          err,
        );
      });
      return;
    }

    const member = await guild.members.fetch(user.id).catch(() => null);
    if (!member) {
      console.warn(
        `[RoleService] Member ${user.id} not found in guild ${guild.id}`,
      );
      return;
    }

    const role = await resolveGuildRole(guild, roleOption.roleId);
    if (!role) {
      console.warn(
        `[RoleService] Role ${roleOption.roleId} configured on panel '${panel.id}' not found in guild.`,
      );
      return;
    }

    const validation = validateRoleManageable(guild, role);
    if (!validation.valid) {
      console.warn(
        `[RoleService] Cannot assign role '${role.name}' via reaction: ${validation.error}`,
      );
      return;
    }

    try {
      await this.serializeMemberMutation(
        guild.id,
        panel.id,
        member.id,
        async () => {
          const freshMember = await resolveFreshMember(guild, member);
          await mutateMemberRolesOnReactionAdd(freshMember, panel, role.id);

          if (panel.mode === "single") {
            await this.clearOtherReactionsForSingleMode(
              reaction.message,
              panel,
              roleOption.roleId,
              user.id,
            );
          }
        },
      );
    } catch (err) {
      console.error(
        `[RoleService] Error adding role '${role.name}' on reaction add for user ${user.id}:`,
        err,
      );
    }
  }

  /**
   * Handles user removing their emoji reaction from an emoji role panel message.
   */
  public async handleReactionRemove(
    rawReaction: MessageReaction | PartialMessageReaction,
    user: User | PartialUser,
  ): Promise<void> {
    if (user.bot) return;

    const guildId =
      rawReaction.message.guildId ?? rawReaction.message.guild?.id;
    const messageId = rawReaction.message.id;
    if (!(guildId && messageId)) return;

    const panel = await this.getPanelForReaction(guildId, messageId);
    if (!panel || panel.type !== "emoji") return;

    const reaction = await resolveCompleteReaction(rawReaction);
    if (!(reaction?.message.guild && reaction.message.guildId)) return;

    const guild = reaction.message.guild;
    const roleOption = panel.roles.find(
      (r) => r.emoji && isEmojiMatching(r.emoji, reaction.emoji),
    );
    if (!roleOption) return;

    const member = await guild.members.fetch(user.id).catch(() => null);
    if (!member) return;

    const role = await resolveGuildRole(guild, roleOption.roleId);
    if (!role) return;

    const validation = validateRoleRevocable(guild, role);
    if (!validation.valid) {
      console.warn(
        `[RoleService] Cannot revoke role '${role.name}' via reaction: ${validation.error}`,
      );
      return;
    }

    try {
      await this.serializeMemberMutation(
        guild.id,
        panel.id,
        member.id,
        async () => {
          const freshMember = await resolveFreshMember(guild, member);
          if (freshMember.roles.cache.has(role.id)) {
            await freshMember.roles.remove(role.id);
          }
        },
      );
    } catch (err) {
      console.error(
        `[RoleService] Error removing role '${role.name}' on reaction remove for user ${user.id}:`,
        err,
      );
    }
  }
}

let roleServiceInstance: RoleService | null = null;

export function getRoleService(): RoleService {
  if (!roleServiceInstance) {
    roleServiceInstance = new RoleService();
  }
  return roleServiceInstance;
}

export function setRoleService(service: RoleService | null): void {
  roleServiceInstance = service;
}
