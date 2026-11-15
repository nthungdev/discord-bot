import { describe, expect, it } from "vitest";
import {
  ALLOWED_CONTENT_TYPES,
  buildBotAliasLine,
  buildChatBotSystemInstruction,
  buildPoliceBotSystemInstruction,
  CHAT_BOT_PERMANENT_GUIDELINES,
  IGNORED_CONTENT,
  type PersonalizationMode,
  POLICE_BOT_PERMANENT_GUIDELINES,
  renderPersonaPlaceholders,
  resolveGuildSystemInstruction,
} from "../helpers";

// Mirrors the pre-alias builder output so the no-alias path can be checked byte-for-byte.
function legacyBuild(
  defaultIntro: string,
  guidelines: string,
  personalization: string | undefined,
  mode: PersonalizationMode = "overwrite_identity",
): string {
  const trimmed = personalization?.trim();
  if (mode === "overwrite_all" && trimmed) {
    return trimmed;
  }
  if (mode === "extend" && trimmed) {
    return `${defaultIntro}\n\n${guidelines}\n\nAdditional Server Directives:\n${trimmed}`;
  }
  return `${trimmed || defaultIntro}\n\n${guidelines}`;
}

describe("genAi helpers", () => {
  it("should define IGNORED_CONTENT string", () => {
    expect(typeof IGNORED_CONTENT).toBe("string");
  });

  it("should define valid ALLOWED_CONTENT_TYPES array", () => {
    expect(ALLOWED_CONTENT_TYPES).toContain("image/jpeg");
    expect(ALLOWED_CONTENT_TYPES).toContain("image/png");
    expect(ALLOWED_CONTENT_TYPES).toContain("image/gif");
  });

  describe("buildChatBotSystemInstruction", () => {
    it("should build default system instruction using botName", () => {
      const instruction = buildChatBotSystemInstruction({ botName: "Jarvis" });
      expect(instruction).toContain(
        "You are Jarvis, an intelligent Discord assistant in this server.",
      );
      expect(instruction).toContain("Guidelines for Group Channels:");
    });

    it("should override identity by default when personalization is provided", () => {
      const instruction = buildChatBotSystemInstruction({
        botName: "Jarvis",
        personalization: "You are a sarcastic robot who loves coffee.",
      });
      expect(instruction).toContain(
        "You are a sarcastic robot who loves coffee.",
      );
      expect(instruction).not.toContain(
        "You are Jarvis, an intelligent Discord assistant in this server.",
      );
      expect(instruction).toContain("Guidelines for Group Channels:");
    });

    it("should extend permanent guidelines when mode is extend", () => {
      const instruction = buildChatBotSystemInstruction({
        botName: "Jarvis",
        personalization: "Never talk about politics.",
        mode: "extend",
      });
      expect(instruction).toContain(
        "You are Jarvis, an intelligent Discord assistant in this server.",
      );
      expect(instruction).toContain("Guidelines for Group Channels:");
      expect(instruction).toContain(
        "Additional Server Directives:\nNever talk about politics.",
      );
    });

    it("should overwrite all guidelines when mode is overwrite_all", () => {
      const instruction = buildChatBotSystemInstruction({
        botName: "Jarvis",
        personalization: "Custom raw prompt only.",
        mode: "overwrite_all",
      });
      expect(instruction).toBe("Custom raw prompt only.");
    });
  });

  describe("buildPoliceBotSystemInstruction", () => {
    it("should build default system instruction using botName", () => {
      const instruction = buildPoliceBotSystemInstruction({
        botName: "Popogon",
      });
      expect(instruction).toContain(
        "You are Popogon, a moderation police bot dedicated to enforcing server rules.",
      );
      expect(instruction).toContain(
        "Guidelines for Moderation & Police Enforcement:",
      );
    });

    it("should override identity by default when personalization is provided", () => {
      const instruction = buildPoliceBotSystemInstruction({
        botName: "Popogon",
        personalization: "Bạn là Popogon, một cảnh sát cực kỳ nghiêm khắc.",
      });
      expect(instruction).toContain(
        "Bạn là Popogon, một cảnh sát cực kỳ nghiêm khắc.",
      );
      expect(instruction).not.toContain(
        "You are Popogon, a moderation police bot dedicated to enforcing server rules.",
      );
      expect(instruction).toContain(
        "Guidelines for Moderation & Police Enforcement:",
      );
    });

    it("should extend permanent guidelines when mode is extend", () => {
      const instruction = buildPoliceBotSystemInstruction({
        botName: "Popogon",
        personalization: "Phạt 500k cho mỗi lần vi phạm.",
        mode: "extend",
      });
      expect(instruction).toContain(
        "You are Popogon, a moderation police bot dedicated to enforcing server rules.",
      );
      expect(instruction).toContain(
        "Guidelines for Moderation & Police Enforcement:",
      );
      expect(instruction).toContain(
        "Additional Server Directives:\nPhạt 500k cho mỗi lần vi phạm.",
      );
    });

    it("should overwrite all guidelines when mode is overwrite_all", () => {
      const instruction = buildPoliceBotSystemInstruction({
        botName: "Popogon",
        personalization: "Toàn bộ hướng dẫn tùy chỉnh.",
        mode: "overwrite_all",
      });
      expect(instruction).toBe("Toàn bộ hướng dẫn tùy chỉnh.");
    });
  });

  describe("renderPersonaPlaceholders", () => {
    it("should substitute botName and aliases placeholders", () => {
      expect(
        renderPersonaPlaceholders("I am {{botName}} aka {{aliases}}.", {
          botName: "Rồng",
          aliases: ["Jarvis", "jarvis-bot"],
        }),
      ).toBe("I am Rồng aka Jarvis, jarvis-bot.");
    });

    it("should allow whitespace inside braces and replace every occurrence", () => {
      expect(
        renderPersonaPlaceholders(
          "{{ botName }} / {{botName}} / {{  aliases  }} / {{aliases}}",
          { botName: "Rồng", aliases: ["A"] },
        ),
      ).toBe("Rồng / Rồng / A / A");
    });

    it("should render aliases as empty string when none are given", () => {
      expect(
        renderPersonaPlaceholders("[{{aliases}}]", { botName: "Rồng" }),
      ).toBe("[]");
    });

    it("should keep $-replacement sequences in names literal", () => {
      expect(
        renderPersonaPlaceholders("Hi {{botName}} ({{aliases}})", {
          botName: "$&$1$$",
          aliases: ["$`", "$'"],
        }),
      ).toBe("Hi $&$1$$ ($`, $')");
    });

    it("should leave unrelated or malformed placeholders untouched", () => {
      const template = "{{BotName}} {botName} {{other}}";
      expect(renderPersonaPlaceholders(template, { botName: "Rồng" })).toBe(
        template,
      );
    });

    it("should be stable across repeated calls with global patterns", () => {
      const values = { botName: "Rồng" };
      expect(renderPersonaPlaceholders("{{botName}}", values)).toBe("Rồng");
      expect(renderPersonaPlaceholders("{{botName}}", values)).toBe("Rồng");
    });
  });

  describe("buildBotAliasLine", () => {
    it("should build alias line or empty string", () => {
      expect(buildBotAliasLine(["Jarvis", "jarvis-bot"])).toBe(
        "People may also call you: Jarvis, jarvis-bot.",
      );
      expect(buildBotAliasLine([])).toBe("");
      expect(buildBotAliasLine()).toBe("");
    });
  });

  describe.each([
    {
      label: "chatBot",
      build: buildChatBotSystemInstruction,
      intro: (name: string) =>
        `You are ${name}, an intelligent Discord assistant in this server.`,
      guidelines: CHAT_BOT_PERMANENT_GUIDELINES,
    },
    {
      label: "policeBot",
      build: buildPoliceBotSystemInstruction,
      intro: (name: string) =>
        `You are ${name}, a moderation police bot dedicated to enforcing server rules.`,
      guidelines: POLICE_BOT_PERMANENT_GUIDELINES,
    },
  ])(
    "$label builder with aliases and placeholders",
    ({ build, intro, guidelines }) => {
      const aliases = ["Jarvis", "jarvis-bot"];
      const aliasLine = "People may also call you: Jarvis, jarvis-bot.";

      it("should append alias line to default intro", () => {
        expect(build({ botName: "Rồng", aliases })).toBe(
          `${intro("Rồng")}\n${aliasLine}\n\n${guidelines}`,
        );
      });

      it("should render placeholders and append alias line in overwrite_identity", () => {
        expect(
          build({
            botName: "Rồng",
            aliases,
            personalization: "  You are {{botName}} ({{ aliases }}).  ",
            mode: "overwrite_identity",
          }),
        ).toBe(
          `You are Rồng (Jarvis, jarvis-bot).\n${aliasLine}\n\n${guidelines}`,
        );
      });

      it("should render placeholders in directives and put alias line after intro in extend", () => {
        expect(
          build({
            botName: "Rồng",
            aliases,
            personalization: "Sign off as {{botName}}.",
            mode: "extend",
          }),
        ).toBe(
          `${intro("Rồng")}\n${aliasLine}\n\n${guidelines}\n\nAdditional Server Directives:\nSign off as Rồng.`,
        );
      });

      it("should render placeholders without alias line in overwrite_all", () => {
        const result = build({
          botName: "Rồng",
          aliases,
          personalization: "Only {{botName}}; also {{aliases}}.",
          mode: "overwrite_all",
        });
        expect(result).toBe("Only Rồng; also Jarvis, jarvis-bot.");
        expect(result).not.toContain("People may also call you");
      });

      it("should fall back to default layout in overwrite_all without personalization", () => {
        expect(build({ botName: "Rồng", aliases, mode: "overwrite_all" })).toBe(
          `${intro("Rồng")}\n${aliasLine}\n\n${guidelines}`,
        );
      });

      it("should keep $ sequences in botName literal", () => {
        expect(
          build({ botName: "$&", personalization: "I am {{botName}}." }),
        ).toBe(`I am $&.\n\n${guidelines}`);
      });

      it.each([
        undefined,
        "overwrite_identity",
        "extend",
        "overwrite_all",
      ] as const)(
        "should be byte-identical to legacy output with no aliases (mode=%s)",
        (mode) => {
          for (const personalization of [
            undefined,
            "",
            "   ",
            "  Custom persona line.  ",
          ]) {
            const expected = legacyBuild(
              intro("Jarvis"),
              guidelines,
              personalization,
              mode,
            );
            expect(build({ botName: "Jarvis", personalization, mode })).toBe(
              expected,
            );
            expect(
              build({ botName: "Jarvis", aliases: [], personalization, mode }),
            ).toBe(expected);
          }
        },
      );
    },
  );

  describe("resolveGuildSystemInstruction", () => {
    const identity = { botName: "Rồng", aliases: ["Jarvis"] };

    it("should return undefined when guild config or systemInstruction is missing", () => {
      expect(
        resolveGuildSystemInstruction("chatBot", undefined, identity),
      ).toBeUndefined();
      expect(
        resolveGuildSystemInstruction("policeBot", {}, identity),
      ).toBeUndefined();
    });

    it("should pass empty legacy systemInstruction through unchanged", () => {
      expect(
        resolveGuildSystemInstruction(
          "chatBot",
          { systemInstruction: "" },
          identity,
        ),
      ).toBe("");
    });

    it("should render placeholders in legacy systemInstruction without appending anything", () => {
      const legacy = "You are {{botName}} (aka {{aliases}}). Be terse.";
      for (const kind of ["chatBot", "policeBot"] as const) {
        expect(
          resolveGuildSystemInstruction(
            kind,
            {
              systemInstruction: legacy,
              personalization: "ignored without botName",
              personalizationMode: "extend",
            },
            identity,
          ),
        ).toBe("You are Rồng (aka Jarvis). Be terse.");
      }
    });

    it("should return legacy systemInstruction byte-identical when it has no placeholders", () => {
      const legacy = "Plain legacy prompt $& with no placeholders.";
      expect(
        resolveGuildSystemInstruction(
          "chatBot",
          { systemInstruction: legacy },
          identity,
        ),
      ).toBe(legacy);
    });

    it("should use the builder with identity botName when config botName is set", () => {
      expect(
        resolveGuildSystemInstruction(
          "chatBot",
          { botName: "Jarvis", personalizationMode: "extend" },
          identity,
        ),
      ).toBe(
        buildChatBotSystemInstruction({
          botName: "Rồng",
          aliases: ["Jarvis"],
          mode: "extend",
        }),
      );
      expect(
        resolveGuildSystemInstruction(
          "policeBot",
          { botName: "Jarvis" },
          identity,
        ),
      ).toBe(
        buildPoliceBotSystemInstruction({
          botName: "Rồng",
          aliases: ["Jarvis"],
        }),
      );
    });

    it("should prefer personalization over systemInstruction in the builder path", () => {
      expect(
        resolveGuildSystemInstruction(
          "chatBot",
          {
            botName: "Jarvis",
            personalization: "I am {{botName}}.",
            systemInstruction: "Legacy prompt.",
          },
          identity,
        ),
      ).toBe(
        `I am Rồng.\nPeople may also call you: Jarvis.\n\n${CHAT_BOT_PERMANENT_GUIDELINES}`,
      );
    });

    it("should fall back to systemInstruction as personalization in the builder path", () => {
      expect(
        resolveGuildSystemInstruction(
          "policeBot",
          {
            botName: "Jarvis",
            systemInstruction: "Legacy {{botName}}.",
            personalizationMode: "overwrite_all",
          },
          identity,
        ),
      ).toBe("Legacy Rồng.");
    });
  });
});
