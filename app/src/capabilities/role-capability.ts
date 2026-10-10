import type {
  Client,
  GuildMember,
  Interaction,
  MessageReaction,
  PartialMessageReaction,
  PartialUser,
  User,
} from "discord.js";
import type { Config } from "../config";
import type { BotGuildConfig } from "../config/types";
import {
  getRoleService,
  ROLE_BUTTON_PREFIX,
  ROLE_SELECT_PREFIX,
  type RoleService,
} from "../services/roles";
import type { IBotCapability } from "./types";

/**
 * Role Capability (Self-Service Role Assignment & Onboarding)
 * Handles button, dropdown, and emoji reaction interactions for role assignment, and onboarding greetings for new members.
 */
export class RoleCapability implements IBotCapability {
  readonly id = "roles";
  readonly name = "Self-Service Role Assignment";
  private roleService: RoleService;

  constructor(roleService?: RoleService) {
    this.roleService = roleService ?? getRoleService();
  }

  init(_client: Client, _config: Config): void {
    console.info("[RoleCapability] Initialized.");
  }

  async handleInteraction(
    interaction: Interaction,
    _guildConfig?: BotGuildConfig,
  ): Promise<void> {
    if (interaction.isButton()) {
      if (interaction.customId.startsWith(ROLE_BUTTON_PREFIX)) {
        const payload = interaction.customId.slice(ROLE_BUTTON_PREFIX.length);
        const colonIdx = payload.indexOf(":");
        if (colonIdx === -1) return;
        const panelId = payload.slice(0, colonIdx);
        const roleId = payload.slice(colonIdx + 1);
        await this.roleService.handleButtonInteraction(
          interaction,
          panelId,
          roleId,
        );
      }
      return;
    }

    if (interaction.isStringSelectMenu()) {
      if (interaction.customId.startsWith(ROLE_SELECT_PREFIX)) {
        const panelId = interaction.customId.slice(ROLE_SELECT_PREFIX.length);
        await this.roleService.handleSelectInteraction(interaction, panelId);
      }
    }
  }

  async handleGuildMemberAdd(member: GuildMember): Promise<void> {
    await this.roleService.handleGuildMemberAdd(member);
  }

  async handleReactionAdd(
    reaction: MessageReaction | PartialMessageReaction,
    user: User | PartialUser,
  ): Promise<void> {
    await this.roleService.handleReactionAdd(reaction, user);
  }

  async handleReactionRemove(
    reaction: MessageReaction | PartialMessageReaction,
    user: User | PartialUser,
  ): Promise<void> {
    await this.roleService.handleReactionRemove(reaction, user);
  }

  destroy(): void {
    // No-op
  }
}
