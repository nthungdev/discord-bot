import { describe, expect, it, vi } from "vitest";
import { createMockMessage } from "../../../../tests/fixtures/discord";
import * as genAiUtils from "../../../utils/genAi";
import {
  buildClassifierSystemInstruction,
  classifyAmbientIntent,
  parseClassifierOutput,
} from "../classifier";

describe("Tier 2 Ambient Intent Classifier", () => {
  const botUserId = "bot-123";

  it("should build classifier system instruction with botName", () => {
    const instruction = buildClassifierSystemInstruction("Jarvis");
    expect(instruction).toContain("Jarvis");
    expect(instruction).toContain("isAddressedToBot");
  });

  it("should keep plain-name output and omit alias clause without aliases", () => {
    const instruction = buildClassifierSystemInstruction("Jarvis");
    expect(instruction).toContain('AI Discord bot named "Jarvis".\n');
    expect(instruction).not.toContain("also called");
    expect(buildClassifierSystemInstruction("Jarvis", [])).toBe(instruction);
    expect(buildClassifierSystemInstruction()).toContain('named "ChatBot".');
  });

  it("should list aliases as JSON-quoted names", () => {
    const instruction = buildClassifierSystemInstruction("Rồng", [
      "Jarvis",
      "jarvis-bot",
    ]);
    expect(instruction).toContain(
      'AI Discord bot named "Rồng" (also called: "Jarvis", "jarvis-bot").\n',
    );
  });

  it("should escape quotes and newlines in names and aliases", () => {
    const instruction = buildClassifierSystemInstruction('Evil" bot', [
      'x"y',
      "line\nbreak",
    ]);
    expect(instruction).toContain(
      'named "Evil\\" bot" (also called: "x\\"y", "line\\nbreak").\n',
    );
    expect(instruction).not.toContain('named "Evil" bot"');
  });

  describe("classifyAmbientIntent system instruction", () => {
    const captureSystemInstruction = () => {
      const mockGenAi = {
        init: vi.fn().mockResolvedValue(undefined),
        generate: vi.fn().mockResolvedValue({
          content: JSON.stringify({
            isAddressedToBot: false,
            confidence: 0.1,
            targetAudience: "everyone",
            reason: "chatter",
          }),
        }),
      };
      const spy = vi
        .spyOn(genAiUtils, "getGenAi")
        .mockReturnValue(
          mockGenAi as unknown as ReturnType<typeof genAiUtils.getGenAi>,
        );
      return () => spy.mock.calls.at(-1)?.[0]?.systemInstruction;
    };

    const guildConfig = {
      botName: "Jarvis",
      replyChannelIds: [],
      ignoredChannelIds: [],
      respondToMentions: false,
    };

    it("should prefer context.botName over guildConfig.botName and include aliases", async () => {
      const getSystemInstruction = captureSystemInstruction();
      await classifyAmbientIntent({
        message: createMockMessage({ content: "anyone around?" }),
        botUserId,
        botName: "Rồng",
        botAliases: ["Jarvis"],
        guildConfig,
      });
      expect(getSystemInstruction()).toContain(
        'named "Rồng" (also called: "Jarvis").',
      );
    });

    it("should fall back to guildConfig.botName then ChatBot", async () => {
      const getSystemInstruction = captureSystemInstruction();
      await classifyAmbientIntent({
        message: createMockMessage({ content: "anyone around?" }),
        botUserId,
        guildConfig,
      });
      expect(getSystemInstruction()).toContain('named "Jarvis".');

      await classifyAmbientIntent({
        message: createMockMessage({ content: "anyone around?" }),
        botUserId,
      });
      expect(getSystemInstruction()).toContain('named "ChatBot".');
    });
  });

  it("should return respond decision when LLM classifies message as intended for bot with high confidence", async () => {
    const mockGenAi = {
      init: vi.fn().mockResolvedValue(undefined),
      generate: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          isAddressedToBot: true,
          confidence: 0.92,
          targetAudience: "bot",
          reason:
            "User is asking for assistance without other members addressed",
        }),
      }),
    };

    vi.spyOn(genAiUtils, "getGenAi").mockReturnValue(
      mockGenAi as unknown as ReturnType<typeof genAiUtils.getGenAi>,
    );

    const msg = createMockMessage({
      content: "Can someone help me debug this database connection?",
    });

    const result = await classifyAmbientIntent({
      message: msg,
      botUserId,
      guildConfig: {
        botName: "Jarvis",
        replyChannelIds: [],
        ignoredChannelIds: [],
        respondToMentions: false,
        smartReply: {
          ambientConfidenceThreshold: 0.75,
        },
      },
    });

    expect(result.decision).toBe("respond");
    expect(result.tier).toBe("tier2_classifier");
    expect(result.confidence).toBe(0.92);
  });

  it("should return ignore decision when LLM classifies confidence below threshold", async () => {
    const mockGenAi = {
      init: vi.fn().mockResolvedValue(undefined),
      generate: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          isAddressedToBot: true,
          confidence: 0.6,
          targetAudience: "everyone",
          reason: "Rhetorical question",
        }),
      }),
    };

    vi.spyOn(genAiUtils, "getGenAi").mockReturnValue(
      mockGenAi as unknown as ReturnType<typeof genAiUtils.getGenAi>,
    );

    const msg = createMockMessage({
      content: "Why is JavaScript like this?",
    });

    const result = await classifyAmbientIntent({
      message: msg,
      botUserId,
      guildConfig: {
        replyChannelIds: [],
        ignoredChannelIds: [],
        respondToMentions: false,
        smartReply: {
          ambientConfidenceThreshold: 0.75,
        },
      },
    });

    expect(result.decision).toBe("ignore");
    expect(result.tier).toBe("tier2_classifier");
  });

  it("should successfully parse and accept truncated JSON classifier response", async () => {
    const mockGenAi = {
      init: vi.fn().mockResolvedValue(undefined),
      generate: vi.fn().mockResolvedValue({
        content:
          '{"isAddressedToBot": true, "confidence": 0.95, "targetAudience": "bot", "reason": "',
      }),
    };

    vi.spyOn(genAiUtils, "getGenAi").mockReturnValue(
      mockGenAi as unknown as ReturnType<typeof genAiUtils.getGenAi>,
    );

    const msg = createMockMessage({
      content: "Can you help me with this problem?",
    });

    const result = await classifyAmbientIntent({
      message: msg,
      botUserId,
      guildConfig: {
        replyChannelIds: [],
        ignoredChannelIds: [],
        respondToMentions: false,
        smartReply: {
          ambientConfidenceThreshold: 0.75,
        },
      },
    });

    expect(result.decision).toBe("respond");
    expect(result.tier).toBe("tier2_classifier");
    expect(result.confidence).toBe(0.95);
  });

  it("should gracefully handle malformed LLM response by ignoring", async () => {
    const mockGenAi = {
      init: vi.fn().mockResolvedValue(undefined),
      generate: vi.fn().mockResolvedValue({
        content: "Not JSON output at all",
      }),
    };

    vi.spyOn(genAiUtils, "getGenAi").mockReturnValue(
      mockGenAi as unknown as ReturnType<typeof genAiUtils.getGenAi>,
    );

    const msg = createMockMessage({
      content: "Hello everyone",
    });

    const result = await classifyAmbientIntent({
      message: msg,
      botUserId,
    });

    expect(result.decision).toBe("ignore");
    expect(result.tier).toBe("tier2_classifier");
    expect(result.confidence).toBe(0);
  });
});

describe("parseClassifierOutput", () => {
  it("should parse standard valid JSON", () => {
    const raw = JSON.stringify({
      isAddressedToBot: true,
      confidence: 0.9,
      targetAudience: "bot",
      reason: "Direct query",
    });
    const parsed = parseClassifierOutput(raw);
    expect(parsed).toEqual({
      isAddressedToBot: true,
      confidence: 0.9,
      targetAudience: "bot",
      reason: "Direct query",
    });
  });

  it("should parse JSON wrapped in markdown codeblock", () => {
    const raw =
      '```json\n{"isAddressedToBot": false, "confidence": 0.85, "targetAudience": "user", "reason": "Chatting"}\n```';
    const parsed = parseClassifierOutput(raw);
    expect(parsed).toEqual({
      isAddressedToBot: false,
      confidence: 0.85,
      targetAudience: "user",
      reason: "Chatting",
    });
  });

  it("should recover truncated JSON with unclosed reason quote and missing brace", () => {
    const raw =
      '{"isAddressedToBot": true, "confidence": 0.95, "targetAudience": "bot", "reason": "';
    const parsed = parseClassifierOutput(raw);
    expect(parsed).toEqual({
      isAddressedToBot: true,
      confidence: 0.95,
      targetAudience: "bot",
      reason: "",
    });
  });

  it("should recover truncated JSON with partial reason text", () => {
    const raw =
      '{"isAddressedToBot": true, "confidence": 0.88, "targetAudience": "bot", "reason": "User is asking help';
    const parsed = parseClassifierOutput(raw);
    expect(parsed).toEqual({
      isAddressedToBot: true,
      confidence: 0.88,
      targetAudience: "bot",
      reason: "User is asking help",
    });
  });

  it("should return null on completely invalid content", () => {
    expect(parseClassifierOutput("")).toBeNull();
    expect(parseClassifierOutput("not json")).toBeNull();
  });

  it("should pass classifierModel temperature and topP to getGenAi", async () => {
    const getGenAiSpy = vi.spyOn(genAiUtils, "getGenAi").mockReturnValue({
      init: vi.fn().mockResolvedValue(undefined),
      generate: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          isAddressedToBot: false,
          confidence: 0.1,
          targetAudience: "other",
          reason: "chatter",
        }),
      }),
    } as unknown as ReturnType<typeof genAiUtils.getGenAi>);

    await classifyAmbientIntent({
      message: createMockMessage({ content: "hello" }),
      botUserId: "bot-123",
      guildConfig: {
        replyChannelIds: [],
        ignoredChannelIds: [],
        respondToMentions: false,
        smartReply: {
          classifierModel: {
            modelId: "gemini-3.5-flash-lite",
            temperature: 0,
            topP: 0.5,
          },
        },
      },
    });

    expect(getGenAiSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        modelId: "gemini-3.5-flash-lite",
        temperature: 0,
        topP: 0.5,
      }),
    );
  });
});
