import type { GuildConfig } from "../models/guild-config";

export interface IGuildConfigRepository {
  getConfig(guildId: string): Promise<GuildConfig>;
  invalidate(guildId?: string): void;
}
