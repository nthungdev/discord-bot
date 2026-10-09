import { describe, expect, it } from "vitest";
import type { DiscordUser } from "../../types";
import { parseCommands, replaceWithUserMentions } from ".././helpers";

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

    it("should match member nickname when distinct from username", () => {
      const members: DiscordUser[] = [
        { id: "333", username: "hungnguyen.dev", nickname: "Hung" },
      ];
      const message = "Chào @Hung nhé!";
      const result = replaceWithUserMentions(message, members);
      expect(result).toBe("Chào <@333> nhé!");
    });

    it("should match member nickname with spaces", () => {
      const members: DiscordUser[] = [
        { id: "444", username: "john_d", nickname: "John Doe" },
      ];
      const message = "Hello @John Doe how are you?";
      const result = replaceWithUserMentions(message, members);
      expect(result).toBe("Hello <@444> how are you?");
    });

    it("should leave unmatched mentions unmodified", () => {
      const message = "Hello @charlie!";
      const result = replaceWithUserMentions(message, serverMembers);
      expect(result).toBe("Hello @charlie!");
    });

    it("should unwrap backticks enclosing username mentions (`@username` -> <@userId>)", () => {
      const message = "Hello `@alice` and `@bob.dev`!";
      const result = replaceWithUserMentions(message, serverMembers);
      expect(result).toBe("Hello <@111> and <@222>!");
    });

    it("should unwrap backticks enclosing Discord user snowflake mentions (`<@userId>` -> <@userId>)", () => {
      const message = "Hello `<@111>` and `<@!222>`!";
      const result = replaceWithUserMentions(message, serverMembers);
      expect(result).toBe("Hello <@111> and <@!222>!");
    });

    it("should resolve bracketed username pseudo-mentions (<@username> -> <@userId>)", () => {
      const message = "Hello <@alice> and <@bob.dev>!";
      const result = replaceWithUserMentions(message, serverMembers);
      expect(result).toBe("Hello <@111> and <@222>!");
    });

    it("should unwrap backticks around bracketed username pseudo-mentions (`<@username>` -> <@userId>)", () => {
      const message = "Hello `<@alice>` and `<@bob.dev>`!";
      const result = replaceWithUserMentions(message, serverMembers);
      expect(result).toBe("Hello <@111> and <@222>!");
    });

    it("should unwrap backticks around member nicknames with spaces", () => {
      const members: DiscordUser[] = [
        { id: "444", username: "john_d", nickname: "John Doe" },
      ];
      const message = "Hello `@John Doe` and `<@John Doe>`!";
      const result = replaceWithUserMentions(message, members);
      expect(result).toBe("Hello <@444> and <@444>!");
    });

    it("should correctly unwrap backticks from the OMA-85 production reproduction payload", () => {
      const members: DiscordUser[] = [
        {
          id: "1062776956623519846",
          username: "mariner__",
          nickname: "Mariner",
        },
        {
          id: "1352332790238154884",
          username: "babypikapika",
          nickname: "BabyPikapika",
        },
      ];
      const message =
        'Nào nào bro `<@1062776956623519846>`, tính "thịt" kiểu gì đây? Rán hay xào bro `<@1352332790238154884>` nào? 🦖 Mới bị gõ bonk một cái đã vội gọi tớ vào đòi trảm người ta rồi, kém thế sir!';
      const result = replaceWithUserMentions(message, members);
      expect(result).toBe(
        'Nào nào bro <@1062776956623519846>, tính "thịt" kiểu gì đây? Rán hay xào bro <@1352332790238154884> nào? 🦖 Mới bị gõ bonk một cái đã vội gọi tớ vào đòi trảm người ta rồi, kém thế sir!',
      );
    });

    it("should unwrap snowflake mentions even if serverMembers is empty or undefined", () => {
      const message = "Hello `<@1062776956623519846>`!";
      expect(replaceWithUserMentions(message)).toBe(
        "Hello <@1062776956623519846>!",
      );
      expect(replaceWithUserMentions(message, [])).toBe(
        "Hello <@1062776956623519846>!",
      );
    });

    it("should preserve non-mention code blocks", () => {
      const message = 'Run `pnpm test` and check `const user = "<@111>";`';
      const result = replaceWithUserMentions(message, serverMembers);
      expect(result).toBe('Run `pnpm test` and check `const user = "<@111>";`');
    });

    it("should preserve multiline fenced code blocks containing mentions", () => {
      const message = "```\n<@1062776956623519846>\n```";
      const result = replaceWithUserMentions(message);
      expect(result).toBe("```\n<@1062776956623519846>\n```");
    });

    it("should resolve handles for members with numeric usernames or nicknames", () => {
      const members: DiscordUser[] = [
        { id: "999", username: "123", nickname: "123" },
      ];
      // @123 should resolve to member 999, while <@123> remains raw mention syntax
      const message = "Hello @123, `@123` and existing <@123>!";
      const result = replaceWithUserMentions(message, members);
      expect(result).toBe("Hello <@999>, <@999> and existing <@123>!");
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
    }, 15000);
  });
});
