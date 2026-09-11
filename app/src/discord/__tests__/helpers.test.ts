import { describe, it, expect } from "vitest";
import { replaceWithUserMentions, parseCommands } from "./helpers";
import type { DiscordUser } from "../types";

describe("discord helpers", () => {
  describe("replaceWithUserMentions", () => {
    const serverMembers: DiscordUser[] = [
      { id: "111", username: "alice", nickname: "Alice" },
      { id: "222", username: "bob.dev", nickname: "Bob" },
    ];

    it("should replace username mention with Discord user mention syntax", () => {
      const message = "Hello @alice and @bob.dev!";
      const result = replaceWithUserMentions(message, serverMembers);
      expect(result).toBe("Hello <@111> and <@222>!");
    });

    it("should be case-insensitive when matching usernames", () => {
      const message = "Hello @Alice!";
      const result = replaceWithUserMentions(message, serverMembers);
      expect(result).toBe("Hello <@111>!");
    });

    it("should leave unmatched mentions unmodified", () => {
      const message = "Hello @charlie!";
      const result = replaceWithUserMentions(message, serverMembers);
      expect(result).toBe("Hello @charlie!");
    });
  });

  describe("parseCommands", () => {
    it("should load valid command modules from disk", async () => {
      const commands = await parseCommands();
      expect(Array.isArray(commands)).toBe(true);
      // We know checkin and report are valid commands
      expect(commands.length).toBeGreaterThan(0);
      commands.forEach((command) => {
        expect(command).toHaveProperty("data");
        expect(command).toHaveProperty("execute");
      });
    });
  });
});
