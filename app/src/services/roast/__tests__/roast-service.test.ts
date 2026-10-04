import { beforeEach, describe, expect, it, vi } from "vitest";
import { RoastCooldownManager } from "../cooldown";
import { clampIntensity, RoastService } from "../index";
import type { IRoastOptOutStore } from "../opt-out";
import {
  MAX_COUNTER_ROAST_CHAIN_DEPTH,
  ROAST_BUTTON_PREFIX_BURN,
  ROAST_BUTTON_PREFIX_COUNTER,
  RoastIntensity,
  type RoastRequest,
} from "../types";

// Mock GenAI utils
vi.mock("../../../utils/genAi", () => ({
  getGenAi: vi.fn().mockReturnValue({
    init: vi.fn(),
    generate: vi.fn().mockResolvedValue({
      content: "Commit của bạn như một lời kêu cứu vậy.",
      data: null,
    }),
  }),
  generateChatMessageWithGenAi: vi.fn().mockResolvedValue({
    content: "Commit của bạn như một lời kêu cứu vậy.",
    data: null,
  }),
}));

class MockOptOutStore implements IRoastOptOutStore {
  private optedOut = new Set<string>();

  async isOptedOut(guildId: string, userId: string): Promise<boolean> {
    return this.optedOut.has(`${guildId}:${userId}`);
  }

  async optOut(guildId: string, userId: string): Promise<void> {
    this.optedOut.add(`${guildId}:${userId}`);
  }

  async optIn(guildId: string, userId: string): Promise<void> {
    this.optedOut.delete(`${guildId}:${userId}`);
  }

  async clear(): Promise<void> {
    this.optedOut.clear();
  }
}

describe("RoastService", () => {
  let cooldownManager: RoastCooldownManager;
  let optOutStore: MockOptOutStore;
  let roastService: RoastService;

  beforeEach(() => {
    cooldownManager = new RoastCooldownManager();
    optOutStore = new MockOptOutStore();
    roastService = new RoastService(cooldownManager, optOutStore);
  });

  describe("clampIntensity", () => {
    it("should clamp higher intensity to maxAllowed", () => {
      expect(clampIntensity(RoastIntensity.Savage, "mild")).toBe(
        RoastIntensity.Mild,
      );
      expect(clampIntensity(RoastIntensity.Savage, "medium")).toBe(
        RoastIntensity.Medium,
      );
    });

    it("should keep intensity if already lower than or equal to maxAllowed", () => {
      expect(clampIntensity(RoastIntensity.Mild, "savage")).toBe(
        RoastIntensity.Mild,
      );
      expect(clampIntensity(RoastIntensity.Medium, "medium")).toBe(
        RoastIntensity.Medium,
      );
    });

    it("should return requested intensity if maxAllowed is not specified", () => {
      expect(clampIntensity(RoastIntensity.Savage, undefined)).toBe(
        RoastIntensity.Savage,
      );
    });
  });

  describe("validateRoastRequest", () => {
    it("should reject if roast feature is disabled in guild config", async () => {
      const res = await roastService.validateRoastRequest(
        "guild-1",
        "chan-1",
        "caller-1",
        "target-1",
        "bot-1",
        // @ts-expect-error partial config
        { roast: { enabled: false } },
      );
      expect(res.allowed).toBe(false);
      if (!res.allowed) {
        expect(res.reasonKey).toBe("feature_disabled");
      }
    });

    it("should reject if channel is in ignoredChannelIds", async () => {
      const res = await roastService.validateRoastRequest(
        "guild-1",
        "chan-ignored",
        "caller-1",
        "target-1",
        "bot-1",
        // @ts-expect-error partial config
        { roast: { ignoredChannelIds: ["chan-ignored"] } },
      );
      expect(res.allowed).toBe(false);
      if (!res.allowed) {
        expect(res.reasonKey).toBe("channel_disabled");
      }
    });

    it("should reject if channel is not in allowedChannelIds when specified", async () => {
      const res = await roastService.validateRoastRequest(
        "guild-1",
        "chan-other",
        "caller-1",
        "target-1",
        "bot-1",
        // @ts-expect-error partial config
        { roast: { allowedChannelIds: ["chan-fun-only"] } },
      );
      expect(res.allowed).toBe(false);
      if (!res.allowed) {
        expect(res.reasonKey).toBe("channel_disabled");
      }
    });

    it("should reject if caller is on cooldown", async () => {
      cooldownManager.recordRoast("guild-1", "caller-1", "other-target");
      const res = await roastService.validateRoastRequest(
        "guild-1",
        "chan-1",
        "caller-1",
        "target-1",
        "bot-1",
      );
      expect(res.allowed).toBe(false);
      if (!res.allowed) {
        expect(res.reasonKey).toBe("caller_cooldown");
      }
    });

    it("should reject if target has opted out", async () => {
      await optOutStore.optOut("guild-1", "target-1");
      const res = await roastService.validateRoastRequest(
        "guild-1",
        "chan-1",
        "caller-1",
        "target-1",
        "bot-1",
      );
      expect(res.allowed).toBe(false);
      if (!res.allowed) {
        expect(res.reasonKey).toBe("target_opted_out");
      }
    });

    it("should reject if target is protected by harassment shield", async () => {
      cooldownManager.recordRoast("guild-1", "someone-else", "target-1");
      const res = await roastService.validateRoastRequest(
        "guild-1",
        "chan-1",
        "caller-1",
        "target-1",
        "bot-1",
      );
      expect(res.allowed).toBe(false);
      if (!res.allowed) {
        expect(res.reasonKey).toBe("target_shielded");
      }
    });

    it("should allow self-roast even if target has shield or opted out", async () => {
      await optOutStore.optOut("guild-1", "caller-1");
      cooldownManager.recordRoast("guild-1", "other", "caller-1");
      cooldownManager.clearAll(); // ensure caller is not on cooldown

      const res = await roastService.validateRoastRequest(
        "guild-1",
        "chan-1",
        "caller-1",
        "caller-1",
        "bot-1",
      );
      expect(res.allowed).toBe(true);
    });

    it("should allow bot roast attempt (bot reversal bypasses opt-out)", async () => {
      const res = await roastService.validateRoastRequest(
        "guild-1",
        "chan-1",
        "caller-1",
        "bot-1",
        "bot-1",
      );
      expect(res.allowed).toBe(true);
    });

    it("should approve valid roast request", async () => {
      const res = await roastService.validateRoastRequest(
        "guild-1",
        "chan-1",
        "caller-1",
        "target-1",
        "bot-1",
      );
      expect(res.allowed).toBe(true);
    });
  });

  describe("generateRoast", () => {
    const baseRequest: RoastRequest = {
      guildId: "guild-1",
      channelId: "chan-1",
      locale: "vi",
      caller: { id: "caller-1", username: "alice", displayName: "Alice" },
      target: {
        id: "target-1",
        username: "bob",
        displayName: "Bob",
        roles: [],
      },
      intensity: RoastIntensity.Medium,
    };

    it("should return mock empathetic template for self-roast", async () => {
      const selfReq: RoastRequest = {
        ...baseRequest,
        target: {
          id: "caller-1",
          username: "alice",
          displayName: "Alice",
          roles: [],
        },
      };

      const result = await roastService.generateRoast(selfReq, "bot-1");
      expect(result.targetId).toBe("caller-1");
      expect(result.content).toContain("Định chan <@caller-1> một bài");
    });

    it("should reverse target to caller for bot roast attempt", async () => {
      const botReq: RoastRequest = {
        ...baseRequest,
        target: {
          id: "bot-1",
          username: "Slavegon",
          displayName: "Slavegon",
          roles: [],
        },
      };

      const result = await roastService.generateRoast(botReq, "bot-1");
      expect(result.targetId).toBe("caller-1");
      expect(result.content).toContain("Tính chan bot hả <@caller-1>?");
    });

    it("should generate roast via GenAI for normal roast and record cooldowns", async () => {
      const result = await roastService.generateRoast(baseRequest, "bot-1");
      expect(result.content).toBe("Commit của bạn như một lời kêu cứu vậy.");
      expect(result.targetId).toBe("target-1");
      expect(result.callerId).toBe("caller-1");

      // Verify cooldowns were recorded
      expect(
        cooldownManager.checkCallerCooldown("guild-1", "caller-1", 60)
          .onCooldown,
      ).toBe(true);
      expect(
        cooldownManager.checkTargetShield("guild-1", "target-1", 300)
          .isShielded,
      ).toBe(true);
    });
  });

  describe("buildRoastMessagePayload", () => {
    it("should format message and components with buttons", () => {
      const payload = roastService.buildRoastMessagePayload("roast-123", {
        content: "Duyệt code mất 4 ngày.",
        locale: "vi",
        targetId: "target-1",
        callerId: "caller-1",
        intensity: RoastIntensity.Savage,
        topic: "code review",
        isCounterRoast: false,
        chainDepth: 0,
      });

      expect(payload.content).toContain("🔥 **Slavegon chan <@target-1>**");
      expect(payload.content).toContain('"Duyệt code mất 4 ngày."');
      expect(payload.content).toContain("Chủ đề: code review");
      expect(payload.components.length).toBe(1);

      // Verify 3 buttons: Burn, Laugh, Counter
      const components = payload.components[0].components;
      expect(components.length).toBe(3);
    });

    it("should omit counter-roast button if self-roast", () => {
      const payload = roastService.buildRoastMessagePayload("roast-self", {
        content: "Cuộc đời đã chan bạn rồi.",
        locale: "vi",
        targetId: "caller-1",
        callerId: "caller-1",
        intensity: RoastIntensity.Medium,
        isCounterRoast: false,
        chainDepth: 0,
      });

      const components = payload.components[0].components;
      expect(components.length).toBe(2); // Only burn and laugh
    });

    it("should omit counter-roast button if max chain depth reached", () => {
      const payload = roastService.buildRoastMessagePayload("roast-depth", {
        content: "Đòn phản công thứ 2.",
        locale: "vi",
        targetId: "target-1",
        callerId: "caller-1",
        intensity: RoastIntensity.Medium,
        isCounterRoast: true,
        chainDepth: MAX_COUNTER_ROAST_CHAIN_DEPTH,
      });

      const components = payload.components[0].components;
      expect(components.length).toBe(2); // No counter button
    });
  });

  describe("handleButtonInteraction", () => {
    it("should toggle burn reaction on button click", async () => {
      const roastId = "test-roast";
      roastService.buildRoastMessagePayload(roastId, {
        content: "Test roast",
        locale: "vi",
        targetId: "target-1",
        callerId: "caller-1",
        intensity: RoastIntensity.Medium,
        isCounterRoast: false,
        chainDepth: 0,
      });

      const updateMock = vi.fn();
      const mockInteraction = {
        customId: `${ROAST_BUTTON_PREFIX_BURN}:${roastId}`,
        user: { id: "user-voter" },
        guildId: "guild-1",
        update: updateMock,
      };

      await roastService.handleButtonInteraction(
        mockInteraction as unknown as Parameters<
          typeof roastService.handleButtonInteraction
        >[0],
        "bot-1",
      );
      expect(updateMock).toHaveBeenCalled();

      // Second click toggles off
      await roastService.handleButtonInteraction(
        mockInteraction as unknown as Parameters<
          typeof roastService.handleButtonInteraction
        >[0],
        "bot-1",
      );
      expect(updateMock).toHaveBeenCalledTimes(2);
    });

    it("should reject counter-roast if user is not the target", async () => {
      const roastId = "test-roast-duel";
      roastService.buildRoastMessagePayload(roastId, {
        content: "Test roast",
        locale: "vi",
        targetId: "target-1",
        callerId: "caller-1",
        intensity: RoastIntensity.Medium,
        isCounterRoast: false,
        chainDepth: 0,
      });

      const replyMock = vi.fn();
      const mockInteraction = {
        customId: `${ROAST_BUTTON_PREFIX_COUNTER}:${roastId}`,
        user: { id: "intruder" },
        guildId: "guild-1",
        reply: replyMock,
      };

      // @ts-expect-error partial mock
      await roastService.handleButtonInteraction(mockInteraction, "bot-1");
      expect(replyMock).toHaveBeenCalledWith(
        expect.objectContaining({
          content: expect.stringContaining(
            "Chỉ <@target-1> mới có quyền chan lại!",
          ),
          ephemeral: true,
        }),
      );
    });
  });
});
