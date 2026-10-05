import { beforeEach, describe, expect, it } from "vitest";
import { RoastCooldownManager } from "../cooldown";

describe("RoastCooldownManager", () => {
  let manager: RoastCooldownManager;

  beforeEach(() => {
    manager = new RoastCooldownManager();
  });

  describe("Caller rate limiting", () => {
    it("should allow first call with no cooldown", () => {
      const status = manager.checkCallerCooldown("guild-1", "user-1", 60);
      expect(status.onCooldown).toBe(false);
      expect(status.remainingSeconds).toBe(0);
    });

    it("should place caller on cooldown after recording roast", () => {
      manager.recordRoast("guild-1", "user-1", "target-1");
      const status = manager.checkCallerCooldown("guild-1", "user-1", 60);
      expect(status.onCooldown).toBe(true);
      expect(status.remainingSeconds).toBeGreaterThan(0);
      expect(status.remainingSeconds).toBeLessThanOrEqual(60);
    });

    it("should isolate cooldowns by guild", () => {
      manager.recordRoast("guild-1", "user-1", "target-1");
      const statusGuild2 = manager.checkCallerCooldown("guild-2", "user-1", 60);
      expect(statusGuild2.onCooldown).toBe(false);
    });

    it("should not enforce cooldown if cooldownSeconds is 0", () => {
      manager.recordRoast("guild-1", "user-1", "target-1");
      const status = manager.checkCallerCooldown("guild-1", "user-1", 0);
      expect(status.onCooldown).toBe(false);
    });
  });

  describe("Target harassment shield", () => {
    it("should not shield target initially", () => {
      const status = manager.checkTargetShield("guild-1", "target-1", 300);
      expect(status.isShielded).toBe(false);
      expect(status.remainingSeconds).toBe(0);
    });

    it("should activate shield on target after being roasted", () => {
      manager.recordRoast("guild-1", "caller-1", "target-1");
      const status = manager.checkTargetShield("guild-1", "target-1", 300);
      expect(status.isShielded).toBe(true);
      expect(status.remainingSeconds).toBeGreaterThan(0);
      expect(status.remainingSeconds).toBeLessThanOrEqual(300);
    });

    it("should isolate shield by guild", () => {
      manager.recordRoast("guild-1", "caller-1", "target-1");
      const statusGuild2 = manager.checkTargetShield(
        "guild-2",
        "target-1",
        300,
      );
      expect(statusGuild2.isShielded).toBe(false);
    });

    it("should clear all timers on clearAll", () => {
      manager.recordRoast("guild-1", "caller-1", "target-1");
      manager.clearAll();
      expect(
        manager.checkCallerCooldown("guild-1", "caller-1", 60).onCooldown,
      ).toBe(false);
      expect(
        manager.checkTargetShield("guild-1", "target-1", 300).isShielded,
      ).toBe(false);
    });
  });
});
