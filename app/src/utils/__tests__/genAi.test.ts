import { describe, it, expect, vi } from "vitest";
import { getGenAi, generateChatMessageWithGenAi } from "./genAi";
import type { GenAi } from "../genAi/types";

describe("genAi utils", () => {
  it("should create GenAi instance with getGenAi", () => {
    const genAi = getGenAi({ apiKey: "test-key" });
    expect(genAi).toBeDefined();
    expect(typeof genAi.generate).toBe("function");
  });

  describe("generateChatMessageWithGenAi", () => {
    const mockGenAi: GenAi = {
      init: vi.fn().mockResolvedValue(undefined),
      generate: vi.fn().mockResolvedValue({
        content: "Hello @alice! Nice to meet you.",
        data: null,
      }),
    };

    it("should reject disallowed file types", async () => {
      const result = await generateChatMessageWithGenAi(
        mockGenAi,
        {
          text: "hello",
          files: [{ uri: "http://example.com/file.exe", mimeType: "application/x-msdownload" }],
        },
        [],
      );

      expect(result.content).toBe("I can't process this file type :(");
    });

    it("should generate message and replace mentions", async () => {
      const result = await generateChatMessageWithGenAi(
        mockGenAi,
        { text: "hello" },
        [{ id: "user-111", username: "alice", nickname: "Alice" }],
      );

      expect(result.content).toBe("Hello <@user-111>! Nice to meet you.");
    });
  });
});
