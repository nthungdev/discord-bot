import type {
  ChatInputCommandInteraction,
  Guild,
  TextChannel,
} from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setRoleStore } from "../../../../services/roles";
import type { IRoleStore } from "../../../../services/roles/types";
import { data, execute } from "../onboarding";

describe("/role-onboarding Slash Command", () => {
  let mockStore: IRoleStore;

  beforeEach(() => {
    mockStore = {
      getPanel: vi.fn(),
      getPanelsByGuild: vi.fn(),
      savePanel: vi.fn(),
      deletePanel: vi.fn(),
      getOnboardingConfig: vi.fn(),
      saveOnboardingConfig: vi.fn(),
      clear: vi.fn(),
    };
    setRoleStore(mockStore);
  });

  it("should have correct command registration data", () => {
    expect(data.name).toBe("role-onboarding");
    expect(data.description).toBeDefined();
    expect(data.options.length).toBe(3); // set, status, disable
  });

  it("should configure onboarding with set subcommand and locale option", async () => {
    const mockChannel = {
      id: "chan-welcome",
      isTextBased: () => true,
    } as unknown as TextChannel;

    const mockInteraction = {
      guild: { id: "guild-1" } as Guild,
      options: {
        getSubcommand: () => "set",
        getChannel: () => mockChannel,
        getBoolean: () => true,
        getString: (name: string) => (name === "locale" ? "en-US" : null),
      },
      reply: vi.fn().mockResolvedValue(undefined),
    } as unknown as ChatInputCommandInteraction;

    await execute(mockInteraction);

    expect(mockStore.saveOnboardingConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        guildId: "guild-1",
        enabled: true,
        channelId: "chan-welcome",
        localeOverride: "en-US",
      }),
    );
    expect(mockInteraction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("English (en-US)"),
      }),
    );
  });

  it("should show status with status subcommand", async () => {
    vi.mocked(mockStore.getOnboardingConfig).mockResolvedValue({
      guildId: "guild-1",
      enabled: true,
      channelId: "chan-welcome",
      welcomeMessage: "Welcome {user} to {server}!",
      updatedAt: 0,
    });

    const mockInteraction = {
      guild: { id: "guild-1" } as Guild,
      options: {
        getSubcommand: () => "status",
      },
      reply: vi.fn().mockResolvedValue(undefined),
    } as unknown as ChatInputCommandInteraction;

    await execute(mockInteraction);

    expect(mockInteraction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        embeds: expect.any(Array),
      }),
    );
  });

  it("should disable onboarding with disable subcommand", async () => {
    vi.mocked(mockStore.getOnboardingConfig).mockResolvedValue({
      guildId: "guild-1",
      enabled: true,
      channelId: "chan-welcome",
      updatedAt: 0,
    });

    const mockInteraction = {
      guild: { id: "guild-1" } as Guild,
      options: {
        getSubcommand: () => "disable",
      },
      reply: vi.fn().mockResolvedValue(undefined),
    } as unknown as ChatInputCommandInteraction;

    await execute(mockInteraction);

    expect(mockStore.saveOnboardingConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: false,
      }),
    );
    expect(mockInteraction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("disabled"),
      }),
    );
  });
});
