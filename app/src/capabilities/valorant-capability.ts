import type { Client, Interaction } from "discord.js";
import type { Config } from "../config";
import type { BotGuildConfig } from "../config/types";
import {
  getValorantService,
  type ValorantService,
} from "../services/valorant/valorant-service";
import type { IBotCapability } from "./types";

/**
 * Valorant Capability
 * Coordinates player analytics, aim duel comparison, live scouting, and AI coaching.
 */
export class ValorantCapability implements IBotCapability {
  readonly id = "valorant";
  readonly name = "Valorant Esports & Player Intelligence";

  private service: ValorantService | null = null;

  init(_client: Client, _config: Config): void {
    this.service = getValorantService();
    console.info("[ValorantCapability] Initialized.");
  }

  getService(): ValorantService | null {
    return this.service;
  }

  destroy(): void {
    this.service = null;
    console.info("[ValorantCapability] Teardown complete.");
  }

  /**
   * Dispatches any custom button/menu interactions related to Valorant cards.
   */
  async handleInteraction(
    _interaction: Interaction,
    _guildConfig?: BotGuildConfig,
  ): Promise<void> {
    // Reserved for future interactive card components (e.g. pagination / refresh)
  }
}
