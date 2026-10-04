import {
  DEFAULT_CALLER_COOLDOWN_SECONDS,
  DEFAULT_TARGET_SHIELD_SECONDS,
} from "./types";

export class RoastCooldownManager {
  private lastInvokedAtByCaller = new Map<string, number>();
  private lastRoastedAtByTarget = new Map<string, number>();

  private getCallerKey(guildId: string, callerId: string): string {
    return `${guildId}:${callerId}`;
  }

  private getTargetKey(guildId: string, targetId: string): string {
    return `${guildId}:${targetId}`;
  }

  /**
   * Checks whether the caller is on invocation cooldown.
   */
  public checkCallerCooldown(
    guildId: string,
    callerId: string,
    cooldownSeconds: number = DEFAULT_CALLER_COOLDOWN_SECONDS,
  ): { onCooldown: boolean; remainingSeconds: number } {
    if (cooldownSeconds <= 0) {
      return { onCooldown: false, remainingSeconds: 0 };
    }

    const key = this.getCallerKey(guildId, callerId);
    const lastInvoked = this.lastInvokedAtByCaller.get(key);
    if (!lastInvoked) {
      return { onCooldown: false, remainingSeconds: 0 };
    }

    const elapsedMs = Date.now() - lastInvoked;
    const cooldownMs = cooldownSeconds * 1000;
    if (elapsedMs < cooldownMs) {
      const remainingSeconds = Math.ceil((cooldownMs - elapsedMs) / 1000);
      return { onCooldown: true, remainingSeconds };
    }

    return { onCooldown: false, remainingSeconds: 0 };
  }

  /**
   * Checks whether the target is protected by a harassment shield.
   */
  public checkTargetShield(
    guildId: string,
    targetId: string,
    shieldSeconds: number = DEFAULT_TARGET_SHIELD_SECONDS,
  ): { isShielded: boolean; remainingSeconds: number } {
    if (shieldSeconds <= 0) {
      return { isShielded: false, remainingSeconds: 0 };
    }

    const key = this.getTargetKey(guildId, targetId);
    const lastRoasted = this.lastRoastedAtByTarget.get(key);
    if (!lastRoasted) {
      return { isShielded: false, remainingSeconds: 0 };
    }

    const elapsedMs = Date.now() - lastRoasted;
    const shieldMs = shieldSeconds * 1000;
    if (elapsedMs < shieldMs) {
      const remainingSeconds = Math.ceil((shieldMs - elapsedMs) / 1000);
      return { isShielded: true, remainingSeconds };
    }

    return { isShielded: false, remainingSeconds: 0 };
  }

  /**
   * Records a successful roast, updating both caller cooldown and target shield timestamps.
   */
  public recordRoast(
    guildId: string,
    callerId: string,
    targetId: string,
  ): void {
    const now = Date.now();
    this.lastInvokedAtByCaller.set(this.getCallerKey(guildId, callerId), now);
    this.lastRoastedAtByTarget.set(this.getTargetKey(guildId, targetId), now);
  }

  /**
   * Resets all in-memory cooldowns and shields (e.g. for testing).
   */
  public clearAll(): void {
    this.lastInvokedAtByCaller.clear();
    this.lastRoastedAtByTarget.clear();
  }
}

// Singleton instance
let cooldownManagerInstance: RoastCooldownManager | null = null;

export function getRoastCooldownManager(): RoastCooldownManager {
  if (!cooldownManagerInstance) {
    cooldownManagerInstance = new RoastCooldownManager();
  }
  return cooldownManagerInstance;
}
