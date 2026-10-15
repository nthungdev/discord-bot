import type { Client, Interaction } from "discord.js";
import { describe, expect, it } from "vitest";
import type { Config } from "../../config";
import { ValorantCapability } from "../valorant-capability";

describe("ValorantCapability", () => {
  it("should have correct capability metadata", () => {
    const capability = new ValorantCapability();
    expect(capability.id).toBe("valorant");
    expect(capability.name).toBe("Valorant Esports & Player Intelligence");
  });

  it("should initialize and destroy cleanly without errors", () => {
    const capability = new ValorantCapability();
    const mockClient = {} as Client;
    const mockConfig = {} as Config;

    expect(() => capability.init(mockClient, mockConfig)).not.toThrow();
    expect(() => capability.destroy()).not.toThrow();
  });

  it("should handle custom interaction without throwing", async () => {
    const capability = new ValorantCapability();
    const mockInteraction = {
      isButton: () => true,
    } as unknown as Interaction;

    await expect(
      capability.handleInteraction(mockInteraction),
    ).resolves.not.toThrow();
  });
});
