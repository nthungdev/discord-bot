import type { Guild } from "discord.js";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_BOT_NAME,
  getGuildBotIdentity,
  resolveBotIdentity,
} from "../bot-identity";

const createIdentityGuild = ({
  nickname,
  displayName,
  username,
  noMember = false,
}: {
  nickname?: string | null;
  displayName?: string;
  username?: string | null;
  noMember?: boolean;
}) =>
  ({
    members: {
      me: noMember
        ? null
        : { nickname: nickname ?? null, displayName: displayName ?? username },
    },
    client: { user: username === undefined ? null : { username } },
  }) as unknown as Guild;

describe("resolveBotIdentity", () => {
  it("should prefer live nickname, then config botName, then username", () => {
    expect(
      resolveBotIdentity({
        liveNickname: "Rồng",
        configBotName: "Jarvis",
        username: "jarvis-bot",
      }),
    ).toEqual({ name: "Rồng", aliases: ["Jarvis", "jarvis-bot"] });

    expect(
      resolveBotIdentity({ configBotName: "Jarvis", username: "jarvis-bot" }),
    ).toEqual({ name: "Jarvis", aliases: ["jarvis-bot"] });

    expect(resolveBotIdentity({ username: "jarvis-bot" })).toEqual({
      name: "jarvis-bot",
      aliases: [],
    });
  });

  it("should put config botName first and demote nickname to alias when lockName is set", () => {
    expect(
      resolveBotIdentity({
        liveNickname: "Rồng",
        configBotName: "Jarvis",
        username: "jarvis-bot",
        lockName: true,
      }),
    ).toEqual({ name: "Jarvis", aliases: ["Rồng", "jarvis-bot"] });
  });

  it("should ignore lockName when config botName is missing or blank", () => {
    const expected = { name: "Rồng", aliases: ["jarvis-bot"] };
    expect(
      resolveBotIdentity({
        liveNickname: "Rồng",
        username: "jarvis-bot",
        lockName: true,
      }),
    ).toEqual(expected);
    expect(
      resolveBotIdentity({
        liveNickname: "Rồng",
        configBotName: "   ",
        username: "jarvis-bot",
        lockName: true,
      }),
    ).toEqual(expected);
  });

  it("should treat lockName false the same as unset", () => {
    expect(
      resolveBotIdentity({
        liveNickname: "Rồng",
        configBotName: "Jarvis",
        lockName: false,
      }),
    ).toEqual({ name: "Rồng", aliases: ["Jarvis"] });
  });

  it("should dedupe names case-insensitively and keep the first spelling", () => {
    expect(
      resolveBotIdentity({
        liveNickname: "JARVIS",
        configBotName: "jarvis",
        username: "Jarvis",
      }),
    ).toEqual({ name: "JARVIS", aliases: [] });

    expect(
      resolveBotIdentity({
        liveNickname: "Rồng",
        configBotName: "RỒNG",
        username: "dragon",
      }),
    ).toEqual({ name: "Rồng", aliases: ["dragon"] });

    expect(
      resolveBotIdentity({
        liveNickname: "jarvis",
        configBotName: "Jarvis",
        lockName: true,
      }),
    ).toEqual({ name: "Jarvis", aliases: [] });
  });

  it("should trim names and drop empty or whitespace-only candidates", () => {
    expect(
      resolveBotIdentity({
        liveNickname: "   ",
        configBotName: "  Jarvis  ",
        username: "",
      }),
    ).toEqual({ name: "Jarvis", aliases: [] });

    expect(
      resolveBotIdentity({
        liveNickname: " Rồng ",
        configBotName: "Rồng",
        username: null,
      }),
    ).toEqual({ name: "Rồng", aliases: [] });
  });

  it("should fall back to DEFAULT_BOT_NAME when every source is empty", () => {
    expect(DEFAULT_BOT_NAME).toBe("ChatBot");
    expect(resolveBotIdentity({})).toEqual({ name: "ChatBot", aliases: [] });
    expect(
      resolveBotIdentity({
        liveNickname: null,
        configBotName: " ",
        username: "\t",
        lockName: true,
      }),
    ).toEqual({ name: "ChatBot", aliases: [] });
  });
});

describe("getGuildBotIdentity", () => {
  it("should read the live nickname and client username from the guild", () => {
    const guild = createIdentityGuild({
      nickname: "Rồng",
      username: "jarvis-bot",
    });

    expect(getGuildBotIdentity(guild, { botName: "Jarvis" })).toEqual({
      name: "Rồng",
      aliases: ["Jarvis", "jarvis-bot"],
    });
  });

  it("should honor lockName from guild config", () => {
    const guild = createIdentityGuild({
      nickname: "Rồng",
      username: "jarvis-bot",
    });

    expect(
      getGuildBotIdentity(guild, { botName: "Jarvis", lockName: true }),
    ).toEqual({ name: "Jarvis", aliases: ["Rồng", "jarvis-bot"] });
  });

  it("should let config botName win when the bot has no guild nickname", () => {
    // displayName falls back to the username in discord.js; it must not outrank botName.
    const guild = createIdentityGuild({
      nickname: null,
      displayName: "jarvis-bot",
      username: "jarvis-bot",
    });

    expect(getGuildBotIdentity(guild, { botName: "Jarvis" })).toEqual({
      name: "Jarvis",
      aliases: ["jarvis-bot"],
    });
  });

  it("should not read displayName as the live nickname", () => {
    const guild = createIdentityGuild({
      nickname: null,
      displayName: "Server Display",
      username: "jarvis-bot",
    });

    expect(getGuildBotIdentity(guild, { botName: "Jarvis" })).toEqual({
      name: "Jarvis",
      aliases: ["jarvis-bot"],
    });
  });

  it("should work without guild config", () => {
    const guild = createIdentityGuild({
      nickname: "jarvis-bot",
      username: "jarvis-bot",
    });

    expect(getGuildBotIdentity(guild)).toEqual({
      name: "jarvis-bot",
      aliases: [],
    });
  });

  it("should tolerate a guild whose member cache has no bot member", () => {
    const guild = createIdentityGuild({
      username: "jarvis-bot",
      noMember: true,
    });

    expect(getGuildBotIdentity(guild, { botName: "Jarvis" })).toEqual({
      name: "Jarvis",
      aliases: ["jarvis-bot"],
    });
  });

  it("should fall back to config botName or default when guild is null or undefined", () => {
    expect(getGuildBotIdentity(null, { botName: "Jarvis" })).toEqual({
      name: "Jarvis",
      aliases: [],
    });
    expect(getGuildBotIdentity(undefined)).toEqual({
      name: "ChatBot",
      aliases: [],
    });
  });
});
