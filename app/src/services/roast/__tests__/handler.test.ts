import type { ChatInputCommandInteraction } from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Config } from "../../../config";
import type { BotGuildConfig } from "../../../config/types";
import { guildConfigRepository } from "../../../infrastructure/repositories";
import { executeRoast } from "../handler";
import * as roastIndex from "../index";

describe("Roast Handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should read BotGuildConfig from Config.getBotGuildConfig without querying guildConfigRepository.getConfig", async () => {
    const guildConfig: BotGuildConfig = {
      replyChannelIds: [],
      ignoredChannelIds: [],
      respondToMentions: true,
      roast: {
        enabled: false,
        defaultLocale: "en-US",
      },
    };

    const getBotGuildConfigSpy = vi
      .spyOn(Config.getInstance(), "getBotGuildConfig")
      .mockReturnValue(guildConfig);
    const repoGetConfigSpy = vi.spyOn(guildConfigRepository, "getConfig");

    const validateSpy = vi.fn().mockResolvedValue({
      allowed: false,
      reasonKey: "disabled",
    });
    const formatNoticeSpy = vi.fn().mockReturnValue("Roast is disabled");

    vi.spyOn(roastIndex, "getRoastService").mockReturnValue({
      validateRoastRequest: validateSpy,
      formatPreflightNotice: formatNoticeSpy,
    } as unknown as ReturnType<typeof roastIndex.getRoastService>);

    const mockInteraction = {
      commandName: "roast",
      guildId: "guild-roast-1",
      channelId: "ch-1",
      user: { id: "caller-1", tag: "caller#0001", displayName: "Caller" },
      client: { user: { id: "bot-1" } },
      isUserContextMenuCommand: () => false,
      options: {
        getUser: vi
          .fn()
          .mockReturnValue({ id: "target-1", username: "Target" }),
        getString: vi.fn().mockReturnValue(null),
        getBoolean: vi.fn().mockReturnValue(false),
      },
      reply: vi.fn().mockResolvedValue(undefined),
    } as unknown as ChatInputCommandInteraction;

    await executeRoast(mockInteraction);

    expect(getBotGuildConfigSpy).toHaveBeenCalledWith(
      "chatBot",
      "guild-roast-1",
    );
    expect(repoGetConfigSpy).not.toHaveBeenCalled();
    expect(validateSpy).toHaveBeenCalledWith(
      "guild-roast-1",
      "ch-1",
      "caller-1",
      "target-1",
      "bot-1",
      guildConfig,
    );
    expect(mockInteraction.reply).toHaveBeenCalledWith({
      content: "Roast is disabled",
      ephemeral: true,
    });
  });
});
