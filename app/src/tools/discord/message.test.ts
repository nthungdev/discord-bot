import { describe, it, expect, vi } from "vitest";
import {
  discordGetRecentMessagesTool,
  discordGetPinnedMessagesTool,
  discordReactToMessageTool,
} from "./message";
import { ToolExecutionContext } from "../types";

describe("Discord Message Tools", () => {
  const msg1 = {
    id: "msg-1",
    author: {
      id: "u-1",
      username: "alice",
      displayName: "Alice",
      bot: false,
    },
    cleanContent: "Hello world!",
    content: "Hello world!",
    createdAt: new Date("2024-01-01T10:00:00Z"),
    attachments: new Map(),
    react: vi.fn().mockResolvedValue(undefined),
  };

  const msg2 = {
    id: "msg-2",
    author: {
      id: "u-2",
      username: "bob",
      displayName: "Bob",
      bot: false,
    },
    cleanContent: "Check this out",
    content: "Check this out",
    createdAt: new Date("2024-01-01T10:05:00Z"),
    attachments: new Map([["att-1", {}]]),
    react: vi.fn().mockResolvedValue(undefined),
  };

  const mockChannel = {
    id: "chan-1",
    name: "general",
    messages: {
      fetch: vi.fn().mockImplementation((opts?: { limit?: number }) => {
        if (typeof opts === "string") {
          if (opts === "msg-1") return Promise.resolve(msg1);
          if (opts === "msg-2") return Promise.resolve(msg2);
          return Promise.reject(new Error("Unknown Message"));
        }
        return Promise.resolve(new Map([["msg-1", msg1], ["msg-2", msg2]]));
      }),
      fetchPinned: vi.fn().mockResolvedValue(new Map([["msg-1", msg1]])),
    },
  };

  const context: ToolExecutionContext = {
    botId: "bot-1",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    channel: mockChannel as any,
    messageId: "msg-1",
  };

  describe("discord_get_recent_messages", () => {
    it("should fetch recent messages from channel", async () => {
      const result = await discordGetRecentMessagesTool.execute({}, context);
      expect(result.count).toBe(2);
      expect(result.messages[0]).toMatchObject({
        id: "msg-1",
        content: "Hello world!",
        author: { username: "alice", isBot: false },
      });
    });

    it("should filter messages by author", async () => {
      const result = await discordGetRecentMessagesTool.execute(
        { authorUsernameOrId: "bob" },
        context,
      );
      expect(result.count).toBe(1);
      expect(result.messages[0].id).toBe("msg-2");
    });
  });

  describe("discord_get_pinned_messages", () => {
    it("should fetch pinned messages", async () => {
      const result = await discordGetPinnedMessagesTool.execute({}, context);
      expect(result.count).toBe(1);
      expect(result.pinnedMessages[0].id).toBe("msg-1");
    });
  });

  describe("discord_react_to_message", () => {
    it("should react to context message when messageId is omitted", async () => {
      const result = await discordReactToMessageTool.execute(
        { emoji: "🔥" },
        context,
      );
      expect(result.success).toBe(true);
      expect(result.emoji).toBe("🔥");
      expect(result.messageId).toBe("msg-1");
      expect(msg1.react).toHaveBeenCalledWith("🔥");
    });

    it("should throw error if emoji is empty", async () => {
      await expect(
        discordReactToMessageTool.execute({ emoji: "" }, context),
      ).rejects.toThrow("Emoji must be provided.");
    });
  });
});
