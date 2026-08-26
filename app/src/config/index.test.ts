import { describe, it, expect } from "vitest";
import { Config, ConfigParameter } from "./index";

describe("Config", () => {
  it("should return the singleton instance", () => {
    const instance1 = Config.getInstance();
    const instance2 = Config.getInstance();
    expect(instance1).toBe(instance2);
  });

  it("should fetch config values correctly", () => {
    const config = Config.getInstance();
    const botsConfig = config.getConfigValue(ConfigParameter.bots);
    expect(botsConfig).toBeDefined();
  });
});
