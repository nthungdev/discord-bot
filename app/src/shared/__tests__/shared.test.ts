import { describe, expect, it } from "vitest";
import {
  canManageDiscordGuild,
  decryptSecret,
  encryptSecret,
  hasCapability,
  hasGuildAccess,
  maskToken,
  resolveUserRole,
} from "../index";
import type { UserSession } from "../types/auth";

describe("Vault Utilities", () => {
  it("should encrypt and decrypt a bot token correctly", () => {
    const plainToken = "MTEwMjkzODQ3NTYxNzI4Mzk0MA.GxYz.AbCdEf123456";
    const encrypted = encryptSecret(plainToken);

    expect(encrypted).not.toBe(plainToken);
    expect(encrypted.split(":")).toHaveLength(3);

    const decrypted = decryptSecret(encrypted);
    expect(decrypted).toBe(plainToken);
  });

  it("should mask tokens properly", () => {
    expect(maskToken("MTEwMjkzODQ3NTYxNzI4Mzk0MA")).toBe("MTEw...********");
    expect(maskToken("short")).toBe("********");
    expect(maskToken("")).toBe("");
  });
});

describe("Permission Utilities", () => {
  it("should check guild administrator and manage guild bits", () => {
    // 0x8 = Administrator
    expect(canManageDiscordGuild("8")).toBe(true);
    // 0x20 = Manage Guild
    expect(canManageDiscordGuild("32")).toBe(true);
    // 0x8 | 0x20 = 40
    expect(canManageDiscordGuild("40")).toBe(true);
    // 0 = No permissions
    expect(canManageDiscordGuild("0")).toBe(false);
    expect(canManageDiscordGuild("")).toBe(false);
  });

  it("should resolve roles properly", () => {
    const adminIds = ["111111", "222222"];
    expect(resolveUserRole("111111", adminIds, [])).toBe("SUPER_ADMIN");

    const guildAdminGuilds = [
      {
        id: "g1",
        name: "Dev",
        owner: false,
        permissions: "32",
        canManage: true,
      },
    ];
    expect(resolveUserRole("333333", adminIds, guildAdminGuilds)).toBe(
      "GUILD_ADMIN",
    );

    const viewerGuilds = [
      {
        id: "g1",
        name: "Dev",
        owner: false,
        permissions: "0",
        canManage: false,
      },
    ];
    expect(resolveUserRole("444444", adminIds, viewerGuilds)).toBe("VIEWER");
  });

  it("should check capabilities and guild access", () => {
    const superAdminSession: UserSession = {
      user: { id: "1", username: "admin", discriminator: "0" },
      role: "SUPER_ADMIN",
      guilds: [],
      expiresAt: Date.now() + 100000,
    };

    expect(hasCapability(superAdminSession, "bot:lifecycle")).toBe(true);
    expect(hasCapability(superAdminSession, "config:write")).toBe(true);
    expect(hasGuildAccess(superAdminSession, "any-guild-id")).toBe(true);

    const viewerSession: UserSession = {
      user: { id: "2", username: "viewer", discriminator: "0" },
      role: "VIEWER",
      guilds: [],
      expiresAt: Date.now() + 100000,
    };

    expect(hasCapability(viewerSession, "bot:lifecycle")).toBe(false);
    expect(hasCapability(viewerSession, "bot:read")).toBe(true);
    expect(hasGuildAccess(viewerSession, "any-guild-id")).toBe(false);
  });
});
