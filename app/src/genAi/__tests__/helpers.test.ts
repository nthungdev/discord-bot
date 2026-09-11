import { describe, expect, it } from "vitest";
import {
  ALLOWED_CONTENT_TYPES,
  buildChatBotSystemInstruction,
  IGNORED_CONTENT,
} from "../helpers";

describe("genAi helpers", () => {
  it("should define IGNORED_CONTENT string", () => {
    expect(typeof IGNORED_CONTENT).toBe("string");
  });

  it("should define valid ALLOWED_CONTENT_TYPES array", () => {
    expect(ALLOWED_CONTENT_TYPES).toContain("image/jpeg");
    expect(ALLOWED_CONTENT_TYPES).toContain("image/png");
    expect(ALLOWED_CONTENT_TYPES).toContain("image/gif");
  });

  it("should build default system instruction using botName", () => {
    const instruction = buildChatBotSystemInstruction({ botName: "Jarvis" });
    expect(instruction).toContain(
      "You are Jarvis, an intelligent Discord assistant in this server.",
    );
    expect(instruction).toContain("Guidelines for Group Channels:");
  });

  it("should override identity when personalization is provided", () => {
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
});
