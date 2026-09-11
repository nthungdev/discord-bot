import { describe, expect, it } from "vitest";
import {
  createMockMessage,
  createMockUser,
} from "../../../../tests/fixtures/discord";
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

  it("should return classify_ambient for ambiguous candidate when smartReply.mode is ambient_intent", async () => {
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

    expect(result.decision).toBe("classify_ambient");
    expect(result.tier).toBe("tier2_classifier");
    expect(result.reason).toBe("ambient_candidate");
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
