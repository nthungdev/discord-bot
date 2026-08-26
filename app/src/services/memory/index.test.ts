import { describe, it, expect, beforeEach } from "vitest";
import { ConversationMemoryService, createMemoryStore } from "./index";
import { LocalFileMemoryStore } from "./local-store";
import type { IMemoryStore } from "./types";
import type { ConversationDocument } from "../../types";

class MockMemoryStore implements IMemoryStore {
  data: Map<string, ConversationDocument> = new Map();

  async get(botId: string, channelId: string) {
    return this.data.get(`${botId}_${channelId}`) ?? null;
  }
  async set(botId: string, channelId: string, doc: ConversationDocument) {
    this.data.set(`${botId}_${channelId}`, doc);
  }
  async delete(botId: string, channelId: string) {
    this.data.delete(`${botId}_${channelId}`);
  }
  async clearAll() {
    this.data.clear();
  }
}

describe("ConversationMemoryService", () => {
  let mockStore: MockMemoryStore;
  let memoryService: ConversationMemoryService;

  beforeEach(() => {
    mockStore = new MockMemoryStore();
    memoryService = new ConversationMemoryService(mockStore);
  });

  it("should return empty history when store has no record", async () => {
    const history = await memoryService.getHistory("bot1", "channel1");
    expect(history).toEqual([]);
  });

  it("should add turns, update in-memory cache and persist to underlying store", async () => {
    await memoryService.addTurn(
      "bot1",
      "channel1",
      "User message",
      "Bot message",
      { username: "alice", userId: "u1" },
    );

    const history = await memoryService.getHistory("bot1", "channel1");
    expect(history).toHaveLength(2);
    expect(history[0]?.content).toBe("User message");
    expect(history[1]?.content).toBe("Bot message");
  });

  it("should clear history for a specific bot and channel", async () => {
    await memoryService.addTurn("bot1", "channel1", "hi", "hello");
    await memoryService.clearHistory("bot1", "channel1");

    const history = await memoryService.getHistory("bot1", "channel1");
    expect(history).toEqual([]);
  });

  it("should instantiate LocalFileMemoryStore by default with createMemoryStore", () => {
    const store = createMemoryStore("local");
    expect(store).toBeInstanceOf(LocalFileMemoryStore);
  });
});
