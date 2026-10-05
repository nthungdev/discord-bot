import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GuildLocaleStore } from "../store";

describe("GuildLocaleStore", () => {
  const testDir = path.resolve(__dirname, ".tmp-store-test");
  const testFile = path.resolve(testDir, "test-locales.json");
  let store: GuildLocaleStore;

  beforeEach(async () => {
    await fs.mkdir(testDir, { recursive: true });
    store = new GuildLocaleStore(testFile);
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it("should return auto by default when no override exists", () => {
    expect(store.getLocale("guild-1")).toBe("auto");
    expect(store.isOverridden("guild-1")).toBe(false);
  });

  it("should set and retrieve a locale override", async () => {
    await store.setLocale("guild-1", "vi");
    expect(store.getLocale("guild-1")).toBe("vi");
    expect(store.isOverridden("guild-1")).toBe(true);

    await store.setLocale("guild-2", "en-US");
    expect(store.getLocale("guild-2")).toBe("en-US");
  });

  it("should reset to auto when setLocale is called with auto", async () => {
    await store.setLocale("guild-1", "vi");
    expect(store.getLocale("guild-1")).toBe("vi");

    await store.setLocale("guild-1", "auto");
    expect(store.getLocale("guild-1")).toBe("auto");
    expect(store.isOverridden("guild-1")).toBe(false);
  });

  it("should persist across instances", async () => {
    await store.setLocale("guild-persist", "vi");

    const newStore = new GuildLocaleStore(testFile);
    // Trigger ensureLoaded via set or clear or direct read
    await newStore.setLocale("guild-persist-2", "en-US");
    expect(newStore.getLocale("guild-persist")).toBe("vi");
    expect(newStore.getLocale("guild-persist-2")).toBe("en-US");
  });

  it("should fall back to guildConfig override if persistent store has no entry", () => {
    const guildConfig = {
      localeOverride: "vi" as const,
    } as unknown as import("../../../config/types").BotGuildConfig;
    expect(store.getLocale("guild-unseen", guildConfig)).toBe("vi");
  });
});
