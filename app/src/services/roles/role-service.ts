import type {
  ButtonInteraction,
  Guild,
  GuildMember,
  Role,
  StringSelectMenuInteraction,
} from "discord.js";
import { generateWittyWelcomeGreeting } from "./panel-builder";
import { getRoleStore } from "./store";
import type { IRoleStore, RolePanel } from "./types";
import {
  type ValidationResult,
  validateRoleManageable,
  validateRoleRevocable,
} from "./validation";

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
 */
function computeDropdownDiff(
  panel: RolePanel,
  member: GuildMember,
  rawValues: readonly string[],
): { rolesToAdd: string[]; rolesToRemove: string[] } {
  const panelRoleIds = panel.roles.map((r) => r.roleId);
  let selected = rawValues.filter((id) => panelRoleIds.includes(id));

  if (panel.mode === "single" && selected.length > 1) {
    selected = [selected[0]];
  }

  const currentMemberPanelRoleIds = panelRoleIds.filter((id) =>
    member.roles.cache.has(id),
  );

  const rolesToAdd = selected.filter(
    (id) => !currentMemberPanelRoleIds.includes(id),
  );
  const rolesToRemove = currentMemberPanelRoleIds.filter(
    (id) => !selected.includes(id),
  );

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

export class RoleService {
  private store: IRoleStore;

  constructor(store?: IRoleStore) {
    this.store = store ?? getRoleStore();
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
      const response = await applyButtonRoleMutation(member, panel, role);
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

    const { rolesToAdd, rolesToRemove } = computeDropdownDiff(
      panel,
      member,
      interaction.values,
    );

    if (rolesToAdd.length === 0 && rolesToRemove.length === 0) {
      await interaction.editReply({
        content: "ℹ️ No changes made to your roles.",
      });
      return;
    }

    const validation = validateDropdownRoles(guild, rolesToAdd, rolesToRemove);
    if (!validation.valid) {
      await interaction.editReply({
        content: `⚠️ Unable to update roles: ${validation.error ?? "Hierarchy restriction."}`,
      });
      return;
    }

    try {
      const response = await applyDropdownRoleMutations(
        guild,
        member,
        rolesToAdd,
        rolesToRemove,
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

    try {
      await channel.send({
        content: greeting,
        allowedMentions: { users: [member.id], parse: [] },
      });
    } catch (error) {
      console.error(
        `[RoleService] Failed to send onboarding welcome to channel ${config.channelId}:`,
        error,
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
