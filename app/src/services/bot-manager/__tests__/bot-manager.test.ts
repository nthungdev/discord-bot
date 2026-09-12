import fs from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BotManager } from "../index";
import { LocalFileBotRegistryStore } from "../local-store";

describe("LocalFileBotRegistryStore", () => {
  const testDir = path.resolve(__dirname, "test-data");
  const testFile = path.join(testDir, "bots.json");
  let store: LocalFileBotRegistryStore;

  beforeAll(async () => {
    await fs.mkdir(testDir, { recursive: true });
    store = new LocalFileBotRegistryStore(testFile);
  });

  afterAll(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it("should save and retrieve registered bot records", async () => {
    const bot = {
      id: "test-bot-1",
      name: "Test Bot",
      botType: "chatBot" as const,
      clientId: "123456",
      encryptedToken: "enc:token",
      autoStart: false,
      assignedGuildIds: ["g1", "g2"],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await store.save(bot);
    const retrieved = await store.get("test-bot-1");
    expect(retrieved).not.toBeNull();
    expect(retrieved?.id).toBe("test-bot-1");
    expect(retrieved?.name).toBe("Test Bot");

    const all = await store.getAll();
    expect(all.length).toBe(1);

    await store.delete("test-bot-1");
    const deleted = await store.get("test-bot-1");
    expect(deleted).toBeNull();
  });
});

describe("BotManager Registration & Lifecycle", () => {
  const testDir = path.resolve(__dirname, "test-data-mgr");
  const testFile = path.join(testDir, "bots-mgr.json");
  let store: LocalFileBotRegistryStore;
  let manager: BotManager;

  beforeAll(async () => {
    await fs.mkdir(testDir, { recursive: true });
    store = new LocalFileBotRegistryStore(testFile);
    manager = new BotManager(store);
  });

  afterAll(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it("should register a bot and list with masked token", async () => {
    const registered = await manager.registerBot({
      id: "custom-test-bot",
      name: "My Custom Bot",
      botType: "chatBot",
      clientId: "998877",
      token: "super-secret-discord-token",
      autoStart: false,
    });

    expect(registered.id).toBe("custom-test-bot");
    expect(registered.encryptedToken).not.toBe("super-secret-discord-token");

    const botMetric = await manager.getBot("custom-test-bot");
    expect(botMetric).not.toBeNull();
    expect(botMetric?.name).toBe("My Custom Bot");
    expect(botMetric?.tokenMasked).toBe("supe...********");
    expect(botMetric?.status).toBe("STOPPED");
  });

  it("should update bot metadata", async () => {
    await manager.updateBot("custom-test-bot", {
      name: "Renamed Custom Bot",
    });

    const updated = await manager.getBot("custom-test-bot");
    expect(updated?.name).toBe("Renamed Custom Bot");
  });

  it("should unregister bot properly", async () => {
    await manager.unregisterBot("custom-test-bot");
    const found = await manager.getBot("custom-test-bot");
    expect(found).toBeNull();
  });
});
