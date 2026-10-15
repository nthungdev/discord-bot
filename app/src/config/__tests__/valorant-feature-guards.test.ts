import { describe, expect, it } from "vitest";
import type { BotGuildConfig } from "../types";
import { isValorantFeatureEnabled } from "../types";

describe("isValorantFeatureEnabled", () => {
  it("should return default values when guildConfig is undefined", () => {
    expect(isValorantFeatureEnabled(undefined, "compare")).toBe(true);
    expect(isValorantFeatureEnabled(undefined, "statsSummary")).toBe(true);
    expect(isValorantFeatureEnabled(undefined, "liveScouting")).toBe(true);
    expect(isValorantFeatureEnabled(undefined, "tiltProtection")).toBe(true);
    expect(isValorantFeatureEnabled(undefined, "autoRecap")).toBe(true);
    expect(isValorantFeatureEnabled(undefined, "rankRoleSync")).toBe(false);
  });

  it("should return false for all features when valorant.enabled is false", () => {
    const config: BotGuildConfig = {
      replyChannelIds: [],
      ignoredChannelIds: [],
      respondToMentions: false,
      valorant: {
        enabled: false,
      },
    };

    expect(isValorantFeatureEnabled(config, "compare")).toBe(false);
    expect(isValorantFeatureEnabled(config, "statsSummary")).toBe(false);
    expect(isValorantFeatureEnabled(config, "liveScouting")).toBe(false);
    expect(isValorantFeatureEnabled(config, "tiltProtection")).toBe(false);
    expect(isValorantFeatureEnabled(config, "autoRecap")).toBe(false);
    expect(isValorantFeatureEnabled(config, "rankRoleSync")).toBe(false);
  });

  it("should respect explicit sub-feature overrides", () => {
    const config: BotGuildConfig = {
      replyChannelIds: [],
      ignoredChannelIds: [],
      respondToMentions: false,
      valorant: {
        enabled: true,
        features: {
          compare: { enabled: false },
          rankRoleSync: { enabled: true },
          statsSummary: { enabled: true },
        },
      },
    };

    expect(isValorantFeatureEnabled(config, "compare")).toBe(false);
    expect(isValorantFeatureEnabled(config, "rankRoleSync")).toBe(true);
    expect(isValorantFeatureEnabled(config, "statsSummary")).toBe(true);
    expect(isValorantFeatureEnabled(config, "liveScouting")).toBe(true);
  });
});
