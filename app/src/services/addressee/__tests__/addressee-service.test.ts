import { describe, expect, it, vi } from "vitest";
import {
  createMockMessage,
  createMockUser,
} from "../../../../tests/fixtures/discord";
import * as genAiUtils from "../../../utils/genAi";
import { AddresseeService } from "../index";

describe("AddresseeService", () => {
  const service = new AddresseeService();
  const botUserId = "bot-123";

  it("should return respond decision for explicit mention", async () => {
    const msg = createMockMessage({
      mentions: {
        users: {
          has: (id: string) => id === botUserId,
          toJSON: () => [{ id: botUserId }],
        },
      },
    });

    const result = await service.resolveAddressee({
      message: msg,
      botUserId,
    });

    expect(result.decision).toBe("respond");
    expect(result.reason).toBe("explicit_mention");
  });

  it("should return ignore decision for bot author", async () => {
    const msg = createMockMessage({
      author: createMockUser({ bot: true }),
    });

    const result = await service.resolveAddressee({
      message: msg,
      botUserId,
    });

    expect(result.decision).toBe("ignore");
    expect(result.reason).toBe("bot_author");
  });

  it("should return respond decision when Tier 2 classifier identifies ambient intent", async () => {
    const mockGenAi = {
      init: vi.fn().mockResolvedValue(undefined),
      generate: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          isAddressedToBot: true,
          confidence: 0.95,
          targetAudience: "bot",
          reason: "User is asking a programming question",
        }),
      }),
    };

    vi.spyOn(genAiUtils, "getGenAi").mockReturnValue(
      mockGenAi as unknown as ReturnType<typeof genAiUtils.getGenAi>,
    );

    const msg = createMockMessage({
      content: "Does anyone know how to deploy Docker?",
    });

    const result = await service.resolveAddressee({
      message: msg,
      botUserId,
      guildConfig: {
        replyChannelIds: [],
        ignoredChannelIds: [],
        respondToMentions: false,
        smartReply: {
          mode: "ambient_intent",
        },
      },
    });

    expect(result.decision).toBe("respond");
    expect(result.tier).toBe("tier2_classifier");
    expect(result.confidence).toBe(0.95);
  });

  it("should return ignore for ambiguous message when mode is not ambient_intent", async () => {
    const msg = createMockMessage({
      content: "Does anyone know how to deploy Docker?",
    });

    const result = await service.resolveAddressee({
      message: msg,
      botUserId,
      guildConfig: {
        replyChannelIds: [],
        ignoredChannelIds: [],
        respondToMentions: false,
        smartReply: {
          mode: "mentions_and_vocative",
        },
      },
    });

    expect(result.decision).toBe("ignore");
    expect(result.reason).toBe("addressed_to_other");
  });
});
