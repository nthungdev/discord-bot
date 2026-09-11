import { describe, it, expect } from "vitest";
import { determineValueType, prepareParameters } from "./syncRemoteConfig";

describe("syncRemoteConfig helpers", () => {
  it("should determine correct valueType for various data types", () => {
    expect(determineValueType(123)).toBe("NUMBER");
    expect(determineValueType(0)).toBe("NUMBER");
    expect(determineValueType(true)).toBe("BOOLEAN");
    expect(determineValueType(false)).toBe("BOOLEAN");
    expect(determineValueType({ key: "val" })).toBe("JSON");
    expect(determineValueType(["a", "b"])).toBe("JSON");
    expect(determineValueType("hello")).toBe("STRING");
    expect(determineValueType(null)).toBe("STRING");
  });

  it("should prepare parameters with serialized strings and valueType", () => {
    const config = {
      guildEmojis: { "123": { "😀": ["test"] } },
      aiMaxOutputTokens: 4096,
      aiModelId: "gemini-3.6-flash",
    };

    const prepared = prepareParameters(config);

    expect(prepared.guildEmojis.valueType).toBe("JSON");
    expect(JSON.parse(prepared.guildEmojis.defaultValue.value)).toEqual({
      "123": { "😀": ["test"] },
    });

    expect(prepared.aiMaxOutputTokens.valueType).toBe("NUMBER");
    expect(prepared.aiMaxOutputTokens.defaultValue.value).toBe("4096");

    expect(prepared.aiModelId.valueType).toBe("STRING");
    expect(prepared.aiModelId.defaultValue.value).toBe("gemini-3.6-flash");
  });
});
