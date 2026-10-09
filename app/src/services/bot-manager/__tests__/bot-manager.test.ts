import fs from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { DiscordBotEngine } from "../../../capabilities/bot-engine";
import { deployGuildCommands } from "../../../discord/deployCommands";
import { getGuildLocaleStore } from "../../locale/store";
import { BotManager } from "../index";
import { LocalFileBotRegistryStore } from "../local-store";

vi.mock("../../../discord/deployCommands", () => ({
  deployGuildCommands: vi.fn().mockResolvedValue([]),
}));

describe("LocalFileBotRegistryStore", () => {
  const testDir = path.resolve(__dirname, "test-data");
  const testFile = path.join(testDir, "bots.json");
  let store: LocalFileBotRegistryStore;

  beforeAll(async () => {
    await fs.mkdir(testDir, { recursive: true });
    store = new LocalFileBotRegistryStore(testFile);
  });

  afterAll(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  it("should save and retrieve registered bot records", async () => {
    const bot = {
      id: "test-bot-1",
      name: "Test Bot",
      botType: "chatBot" as const,
      clientId: "123456",
      encryptedToken: "enc:token",
      autoStart: false,
      assignedGuildIds: ["g1", "g2"],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await store.save(bot);
    const retrieved = await store.get("test-bot-1");
    expect(retrieved).not.toBeNull();
    expect(retrieved?.id).toBe("test-bot-1");
    expect(retrieved?.name).toBe("Test Bot");

    const all = await store.getAll();
    expect(all.length).toBe(1);

    await store.delete("test-bot-1");
    const deleted = await store.get("test-bot-1");
    expect(deleted).toBeNull();
  });
});

describe("BotManager Unified Engine Architecture", () => {
  it("should initialize with a DiscordBotEngine and report runtime metrics", async () => {
    const engine = new DiscordBotEngine();
    const manager = new BotManager(engine);

    const bots = await manager.getAllBots();
    expect(bots).toHaveLength(1);
    expect(bots[0].id).toBe("bot");
    expect(bots[0].status).toBe("STOPPED");
  });

  it("should generate OAuth2 bot invite URL with configured client ID", () => {
    process.env.DISCORD_CLIENT_ID = "123456789012345678";
    const manager = new BotManager();
    const inviteUrl = manager.getBotInviteUrl();

    expect(inviteUrl).toContain("https://discord.com/oauth2/authorize");
    expect(inviteUrl).toContain("client_id=123456789012345678");
    expect(inviteUrl).toContain("scope=bot%20applications.commands");
  });

  it("should retrieve bot metrics by id", async () => {
    const manager = new BotManager();
    const bot = await manager.getBot("bot");

    expect(bot).not.toBeNull();
    expect(bot?.id).toBe("bot");
    expect(bot?.botType).toBe("chatBot");
  });

  it("should auto-deploy commands to guilds configured in AUTO_DEPLOY_COMMAND_GUILDS", async () => {
    const savedToken = process.env.DISCORD_TOKEN;
    const savedClientId = process.env.DISCORD_CLIENT_ID;
    const savedGuilds = process.env.AUTO_DEPLOY_COMMAND_GUILDS;

    process.env.DISCORD_TOKEN = "mock-token";
    process.env.DISCORD_CLIENT_ID = "mock-client-id";
    process.env.AUTO_DEPLOY_COMMAND_GUILDS = "guild-1, guild-2";

    const manager = new BotManager();
    const deploySpy = vi
      .spyOn(manager, "deployGuildCommands")
      .mockResolvedValue(undefined);

    await manager.autoDeployConfiguredGuildCommands();

    expect(deploySpy).toHaveBeenCalledTimes(2);
    expect(deploySpy).toHaveBeenCalledWith("guild-1");
    expect(deploySpy).toHaveBeenCalledWith("guild-2");

    process.env.DISCORD_TOKEN = savedToken;
    process.env.DISCORD_CLIENT_ID = savedClientId;
    process.env.AUTO_DEPLOY_COMMAND_GUILDS = savedGuilds;
  });

  it("should not auto-deploy commands when AUTO_DEPLOY_COMMAND_GUILDS is unset", async () => {
    const savedGuilds = process.env.AUTO_DEPLOY_COMMAND_GUILDS;
    delete process.env.AUTO_DEPLOY_COMMAND_GUILDS;

    const manager = new BotManager();
    const deploySpy = vi
      .spyOn(manager, "deployGuildCommands")
      .mockResolvedValue(undefined);

    await manager.autoDeployConfiguredGuildCommands();

    expect(deploySpy).not.toHaveBeenCalled();

    process.env.AUTO_DEPLOY_COMMAND_GUILDS = savedGuilds;
  });

  it("should resolve guild locale override when deploying commands", async () => {
    const savedToken = process.env.DISCORD_TOKEN;
    const savedClientId = process.env.DISCORD_CLIENT_ID;

    process.env.DISCORD_TOKEN = "mock-token";
    process.env.DISCORD_CLIENT_ID = "mock-client-id";

    const manager = new BotManager();
    const mockStore = getGuildLocaleStore();
    vi.spyOn(mockStore, "getLocale").mockReturnValue("vi");

    await manager.deployGuildCommands("guild-vn");

    expect(deployGuildCommands).toHaveBeenCalledWith(
      "mock-token",
      "mock-client-id",
      "guild-vn",
      "vi",
    );

    process.env.DISCORD_TOKEN = savedToken;
    process.env.DISCORD_CLIENT_ID = savedClientId;
  });
});
