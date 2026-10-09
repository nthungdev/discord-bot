import { describe, expect, it } from "vitest";
import { parseDeployArgs } from "../deployCommands";

describe("deployCommands parseDeployArgs", () => {
  it("should parse positional guild ID", () => {
    const res = parseDeployArgs(["123456789"]);
    expect(res).toEqual({
      guildId: "123456789",
      localeOverride: null,
    });
  });

  it("should parse --guild and -g flags", () => {
    expect(parseDeployArgs(["--guild", "123456789"])).toEqual({
      guildId: "123456789",
      localeOverride: null,
    });

    expect(parseDeployArgs(["-g", "123456789"])).toEqual({
      guildId: "123456789",
      localeOverride: null,
    });
  });

  it("should parse --locale and -l flags", () => {
    expect(parseDeployArgs(["123456789", "--locale", "vi"])).toEqual({
      guildId: "123456789",
      localeOverride: "vi",
    });

    expect(parseDeployArgs(["-l", "en-US", "123456789"])).toEqual({
      guildId: "123456789",
      localeOverride: "en-US",
    });
  });

  it("should reject missing flag values", () => {
    expect(parseDeployArgs(["--guild"])).toEqual({
      error: "Missing value for --guild flag.",
    });

    expect(parseDeployArgs(["--guild", "--locale"])).toEqual({
      error: "Missing value for --guild flag.",
    });

    expect(parseDeployArgs(["123456789", "--locale"])).toEqual({
      error: "Missing value for --locale flag.",
    });
  });

  it("should reject unsupported locale values", () => {
    const res = parseDeployArgs(["123456789", "--locale", "fr"]);
    expect(res.error).toContain('Unsupported locale "fr"');
  });

  it("should reject unknown flags", () => {
    const res = parseDeployArgs(["--unknown", "123456789"]);
    expect(res.error).toBe("Unknown flag: --unknown");
  });

  it("should handle locale flag before positional guild ID without mistaking locale value as guildId", () => {
    const res = parseDeployArgs(["--locale", "vi", "987654321"]);
    expect(res).toEqual({
      guildId: "987654321",
      localeOverride: "vi",
    });
  });
});
