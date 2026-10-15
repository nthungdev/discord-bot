export interface GuildConfig {
  guildId: string;
  guildName?: string;
  enableAiRoast: boolean;
  enableBouncergon: boolean;
  defaultLocale: "vi" | "en";
  maxRoastsPerDay: number;
  allowedChannelIds: Set<string>;
  scmsVoiceChannelId?: string;
  valorantEnabled?: boolean;
  valorantFeatures?: import("../../config/types").ValorantFeaturesConfig;
}

export const DEFAULT_GUILD_CONFIG: GuildConfig = {
  guildId: "",
  enableAiRoast: true,
  enableBouncergon: false,
  defaultLocale: "vi",
  maxRoastsPerDay: 10,
  allowedChannelIds: new Set<string>(),
  valorantEnabled: true,
};
