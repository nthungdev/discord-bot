import { describe, it, expect, vi } from "vitest";
import PoliceBot from "./index";

vi.mock("discord.js", async () => {
  const actual = await vi.importActual<typeof import("discord.js")>("discord.js");
  class MockClient {
    user = { id: "police-123", tag: "PoliceBot#0001" };
    channels = { cache: new Map() };
    guilds = { cache: new Map() };
    listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
    on(event: string, handler: (...args: unknown[]) => void) {
      this.listeners[event] = this.listeners[event] || [];
      this.listeners[event].push(handler);
      return this;
    }
    once(event: string, handler: (...args: unknown[]) => void) {
      this.listeners[event] = this.listeners[event] || [];
      this.listeners[event].push(handler);
      return this;
    }
    login = vi.fn().mockResolvedValue("token");
  }
  return {
    ...actual,
    Client: MockClient,
  };
});

describe("PoliceBot", () => {
  const botConfig = {
    id: "policeBot",
    token: "test-token",
    botConfig: {
      guilds: {
        "guild-123": {
          replyChannelIds: ["channel-123"],
          ignoredChannelIds: [],
          respondToMentions: true,
        },
      },
    },
  };

  it("should instantiate PoliceBot with given config", () => {
    const policeBot = new PoliceBot(botConfig);
    expect(policeBot.id).toBe("policeBot");
  });
});
