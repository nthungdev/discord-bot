import type { Client, Interaction, Message, VoiceState } from "discord.js";
import type { Config } from "../config";
import type { BotGuildConfig } from "../config/types";

/**
 * Common contract for all modular bot capabilities.
 */
export interface IBotCapability {
  /** Unique identifier for the capability (e.g., 'moderation', 'chat') */
  readonly id: string;
  /** Human-readable display name */
  readonly name: string;

  /**
   * Initializes capability with active Discord client and global configuration.
   */
  init(client: Client, config: Config): Promise<void> | void;

  /**
   * Evaluates an incoming message.
   * @param message Discord message
   * @param guildConfig Per-server configuration
   * @returns true if the event was intercepted/handled (halts downstream pipeline propagation), false or void to continue
   */
  handleMessage?(
    message: Message,
    guildConfig?: BotGuildConfig,
  ): Promise<boolean | undefined>;

  /**
   * Handles Discord slash commands and component interactions.
   */
  handleInteraction?(
    interaction: Interaction,
    guildConfig?: BotGuildConfig,
  ): Promise<void>;

  /**
   * Handles Discord voice state updates.
   */
  handleVoiceStateUpdate?(
    oldState: VoiceState,
    newState: VoiceState,
    guildConfig?: BotGuildConfig,
  ): Promise<void>;

  /**
   * Cleanup resources upon shutdown or capability reload.
   */
  destroy?(): Promise<void> | void;
}
