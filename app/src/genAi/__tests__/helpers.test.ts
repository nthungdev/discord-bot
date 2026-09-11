import { describe, expect, it } from "vitest";
import {
  ALLOWED_CONTENT_TYPES,
  buildChatBotSystemInstruction,
  buildPoliceBotSystemInstruction,
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
});
