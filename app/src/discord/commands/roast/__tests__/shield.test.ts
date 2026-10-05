import { describe, expect, it, vi } from "vitest";
import * as cooldownModule from "../../../../services/roast/cooldown";
import * as optOutModule from "../../../../services/roast/opt-out";
import { data, execute, ShieldSubcommand } from "../shield";

describe("/roast-shield command", () => {
  it("should have subcommands for opt-out, opt-in, and status", () => {
    const json = data.toJSON();
    expect(json.name).toBe("roast-shield");
    expect(json.options?.length).toBe(3);

    const subcommands = json.options?.map((o) => o.name);
    expect(subcommands).toContain(ShieldSubcommand.OptOut);
    expect(subcommands).toContain(ShieldSubcommand.OptIn);
    expect(subcommands).toContain(ShieldSubcommand.Status);
  });

  it("should handle opt-out subcommand", async () => {
    const mockOptOut = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(optOutModule, "getRoastOptOutStore").mockReturnValue({
      optOut: mockOptOut,
      optIn: vi.fn(),
      isOptedOut: vi.fn(),
      clear: vi.fn(),
    });

    const replyMock = vi.fn();
    const mockInteraction = {
      guildId: "guild-1",
      user: { id: "user-1" },
      options: {
        getSubcommand: () => ShieldSubcommand.OptOut,
      },
      reply: replyMock,
    };

    await execute(mockInteraction as unknown as Parameters<typeof execute>[0]);
    expect(mockOptOut).toHaveBeenCalledWith("guild-1", "user-1");
    expect(replyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("Bạn đã từ chối tham gia bị chan"),
        ephemeral: true,
      }),
    );
  });

  it("should handle opt-in subcommand", async () => {
    const mockOptIn = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(optOutModule, "getRoastOptOutStore").mockReturnValue({
      optOut: vi.fn(),
      optIn: mockOptIn,
      isOptedOut: vi.fn(),
      clear: vi.fn(),
    });

    const replyMock = vi.fn();
    const mockInteraction = {
      guildId: "guild-1",
      user: { id: "user-1" },
      options: {
        getSubcommand: () => ShieldSubcommand.OptIn,
      },
      reply: replyMock,
    };

    await execute(mockInteraction as unknown as Parameters<typeof execute>[0]);
    expect(mockOptIn).toHaveBeenCalledWith("guild-1", "user-1");
    expect(replyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining(
          "Bạn đã bật lại khả năng tham gia bị chan",
        ),
        ephemeral: true,
      }),
    );
  });

  it("should handle status subcommand", async () => {
    vi.spyOn(optOutModule, "getRoastOptOutStore").mockReturnValue({
      optOut: vi.fn(),
      optIn: vi.fn(),
      isOptedOut: vi.fn().mockResolvedValue(false),
      clear: vi.fn(),
    });

    vi.spyOn(cooldownModule, "getRoastCooldownManager").mockReturnValue({
      checkTargetShield: vi
        .fn()
        .mockReturnValue({ isShielded: true, remainingSeconds: 150 }),
      checkCallerCooldown: vi.fn(),
      recordRoast: vi.fn(),
      clearAll: vi.fn(),
    } as unknown as cooldownModule.RoastCooldownManager);

    const replyMock = vi.fn();
    const mockInteraction = {
      guildId: "guild-1",
      user: { id: "user-1" },
      options: {
        getSubcommand: () => ShieldSubcommand.Status,
      },
      reply: replyMock,
    };

    await execute(mockInteraction as unknown as Parameters<typeof execute>[0]);
    expect(replyMock).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("Đang tham gia"),
        ephemeral: true,
      }),
    );
  });
});
