import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { LocalFileMemoryStore } from "./local-store";
import type { ConversationDocument } from "../../types";

describe("LocalFileMemoryStore", () => {
  let tempDir: string;
  let tempFilePath: string;
  let store: LocalFileMemoryStore;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "local-store-test-"));
    tempFilePath = path.join(tempDir, "conversations.json");
    store = new LocalFileMemoryStore(tempFilePath);
  });

  afterEach(() => {
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch {
      // ignore cleanup errors
    }
  });

  it("should return null for non-existent conversation", async () => {
    const doc = await store.get("bot1", "channel1");
    expect(doc).toBeNull();
  });

  it("should store and retrieve conversation document", async () => {
    const sampleDoc: ConversationDocument = {
      botId: "bot1",
      channelId: "channel1",
      messages: [{ author: "user", content: "Hello", timestamp: Date.now() }],
      updatedAt: 123456789,
    };

    await store.set("bot1", "channel1", sampleDoc);
    const retrieved = await store.get("bot1", "channel1");

    expect(retrieved).toEqual(sampleDoc);
  });

  it("should delete a conversation document", async () => {
    const sampleDoc: ConversationDocument = {
      botId: "bot1",
      channelId: "channel1",
      messages: [{ author: "user", content: "Hello", timestamp: Date.now() }],
      updatedAt: 123456789,
    };

    await store.set("bot1", "channel1", sampleDoc);
    await store.delete("bot1", "channel1");
    const retrieved = await store.get("bot1", "channel1");

    expect(retrieved).toBeNull();
  });

  it("should clear all conversation documents", async () => {
    await store.set("bot1", "channel1", {
      botId: "bot1",
      channelId: "channel1",
      messages: [],
      updatedAt: 1,
    });
    await store.set("bot2", "channel2", {
      botId: "bot2",
      channelId: "channel2",
      messages: [],
      updatedAt: 2,
    });

    await store.clearAll();

    expect(await store.get("bot1", "channel1")).toBeNull();
    expect(await store.get("bot2", "channel2")).toBeNull();
  });
});
