import { describe, it, expect, beforeEach } from "vitest";
import { ToolRegistry, getToolRegistry, setToolRegistry } from "./registry";
import { ToolDefinition, ToolExecutionContext } from "./types";

describe("ToolRegistry", () => {
  beforeEach(() => {
    setToolRegistry(null);
  });

  const sampleTool: ToolDefinition = {
    name: "sample_tool",
    description: "Sample tool for testing",
    parameters: {
      type: "OBJECT",
      properties: {
        query: {
          type: "STRING",
          description: "Search query",
        },
      },
    },
    execute: async (args) => ({ result: args }),
  };

  const restrictedTool: ToolDefinition = {
    name: "restricted_tool",
    description: "Tool only available when guild is present",
    parameters: { type: "OBJECT", properties: {} },
    isAvailable: (ctx) => Boolean(ctx.guild),
    execute: async () => ({ status: "ok" }),
  };

  it("should register and retrieve a tool by name", () => {
    const registry = new ToolRegistry();
    registry.register(sampleTool);

    expect(registry.getTool("sample_tool")).toBe(sampleTool);
    expect(registry.getTool("non_existent")).toBeUndefined();
    expect(registry.getAllTools()).toEqual([sampleTool]);
  });

  it("should filter available tools based on isAvailable predicate", async () => {
    const registry = new ToolRegistry();
    registry.registerBatch([sampleTool, restrictedTool]);

    const contextWithoutGuild: ToolExecutionContext = {
      botId: "bot-1",
      guild: null,
    };
    const availableNoGuild =
      await registry.getAvailableTools(contextWithoutGuild);
    expect(availableNoGuild).toEqual([sampleTool]);

    const contextWithGuild: ToolExecutionContext = {
      botId: "bot-1",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      guild: { id: "guild-1" } as any,
    };
    const availableWithGuild =
      await registry.getAvailableTools(contextWithGuild);
    expect(availableWithGuild).toEqual([sampleTool, restrictedTool]);
  });

  it("should initialize default singleton registry with discord tools", () => {
    const registry = getToolRegistry();
    expect(registry).toBeDefined();
    expect(registry.getTool("discord_get_server_info")).toBeDefined();
    expect(registry.getTool("discord_get_server_owner")).toBeDefined();
    expect(registry.getTool("discord_get_member_info")).toBeDefined();
    expect(registry.getTool("discord_list_channels")).toBeDefined();
    expect(registry.getTool("discord_get_channel_info")).toBeDefined();
    expect(registry.getTool("discord_list_roles")).toBeDefined();
  });
});
