import { beforeEach, describe, expect, it } from "vitest";
import { registerDefaultTools } from ".././index";
import { getToolRegistry, setToolRegistry, ToolRegistry } from ".././registry";
import type { ToolDefinition, ToolExecutionContext } from ".././types";

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

  it("should initialize empty default singleton registry and populate via registerDefaultTools", () => {
    const registry = getToolRegistry();
    expect(registry).toBeDefined();
    expect(registry.getAllTools()).toHaveLength(0);

    registerDefaultTools(registry);
    expect(registry.getTool("discord_get_server_info")).toBeDefined();
    expect(registry.getTool("discord_get_server_owner")).toBeDefined();
    expect(registry.getTool("discord_get_member_info")).toBeDefined();
    expect(registry.getTool("discord_search_members")).toBeDefined();
    expect(registry.getTool("discord_list_channels")).toBeDefined();
    expect(registry.getTool("discord_get_channel_info")).toBeDefined();
    expect(registry.getTool("discord_get_channel_members")).toBeDefined();
    expect(registry.getTool("discord_list_roles")).toBeDefined();
    expect(registry.getTool("discord_get_voice_channel_state")).toBeDefined();
    expect(registry.getTool("discord_get_recent_messages")).toBeDefined();
    expect(registry.getTool("discord_get_pinned_messages")).toBeDefined();
    expect(registry.getTool("discord_react_to_message")).toBeDefined();
    expect(registry.getTool("discord_get_scheduled_events")).toBeDefined();
  });
});
