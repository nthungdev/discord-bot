import type { GuildConfig } from "../models/guild-config";

export interface IGuildConfigRepository {
  getConfig(guildId: string): Promise<GuildConfig>;
  invalidate(guildId?: string): void;
  updateValorantConfig?(
    guildId: string,
    valorantEnabled: boolean,
    valorantFeatures?: import("../../config/types").ValorantFeaturesConfig,
  ): Promise<void>;
  upsertGuildEmojis?(
    guildId: string,
    emojis: Record<string, string[]>,
  ): Promise<void>;
}
