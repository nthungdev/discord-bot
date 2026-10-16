/**
 * Voice Companion Capability Module.
 * Integrates bidirectional voice conversation into DiscordBotEngine event pipeline.
 */

import type { Client, Interaction, VoiceState } from "discord.js";
import type { Config } from "../config";
import { type BotGuildConfig, isVoiceCompanionEnabled } from "../config/types";
import { getVoiceManager } from "../services/voice/voice-manager";
import type { IBotCapability } from "./types";

export class VoiceCompanionCapability implements IBotCapability {
  public readonly id = "voice-companion";
  public readonly name = "Voice Companion";

  public init(_client: Client, _config: Config): void {
    // Ensure VoiceManager singleton is initialized
    getVoiceManager();
    console.info("[VoiceCompanionCapability] Initialized.");
  }

  public async handleVoiceStateUpdate(
    oldState: VoiceState,
    newState: VoiceState,
    guildConfig?: BotGuildConfig,
  ): Promise<void> {
    if (!isVoiceCompanionEnabled(guildConfig)) {
      return;
    }

    getVoiceManager().handleVoiceStateUpdate(oldState, newState);
  }

  public async handleInteraction(
    interaction: Interaction,
    guildConfig?: BotGuildConfig,
  ): Promise<void> {
    if (!interaction.isChatInputCommand()) {
      return;
    }

    if (interaction.commandName !== "voice") {
      return;
    }

    if (interaction.replied || interaction.deferred) {
      return;
    }

    if (!isVoiceCompanionEnabled(guildConfig)) {
      await interaction.reply({
        content: "Voice Companion capability is disabled in this server.",
        ephemeral: true,
      });
      return;
    }

    // Command execution is delegated to the registered slash command handler
  }

  public destroy(): void {
    getVoiceManager().destroyAll();
    console.info(
      "[VoiceCompanionCapability] Destroyed all active voice sessions.",
    );
  }
}
