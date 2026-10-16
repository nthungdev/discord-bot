import { beforeEach, describe, expect, it, vi } from "vitest";
import { setToolRegistry, ToolRegistry } from "../../../../tools/registry";
import type {
  ToolDefinition,
  ToolExecutionContext,
} from "../../../../tools/types";
import {
  buildFunctionDeclarations,
  executeSingleToolCall,
  executeToolCalls,
} from "../tool-bridge";

describe("ToolBridge", () => {
  let registry: ToolRegistry;
  const mockContext: ToolExecutionContext = {
    botId: "bot-1",
  };

  beforeEach(() => {
    registry = new ToolRegistry();
    setToolRegistry(registry);
  });

  it("should convert ToolDefinitions to Gemini FunctionDeclarations", () => {
    const tools: ToolDefinition[] = [
      {
        name: "test_tool",
        description: "A test tool",
        parameters: {
          type: "OBJECT",
          properties: {
            query: { type: "STRING", description: "Search query" },
          },
          required: ["query"],
        },
        execute: vi.fn(),
      },
    ];

    const decls = buildFunctionDeclarations(tools);
    expect(decls).toHaveLength(1);
    expect(decls[0].name).toBe("test_tool");
    expect(decls[0].description).toBe("A test tool");
    expect(decls[0].parameters).toEqual(tools[0].parameters);
  });

  it("should execute a registered tool and return structured response", async () => {
    const mockExecute = vi
      .fn()
      .mockResolvedValue({ status: "success", count: 42 });
    registry.register({
      name: "get_stats",
      description: "Get server stats",
      parameters: { type: "OBJECT", properties: {} },
      execute: mockExecute,
    });

    const response = await executeSingleToolCall(
      { id: "call-1", name: "get_stats", args: { limit: 10 } },
      mockContext,
    );

    expect(mockExecute).toHaveBeenCalledWith({ limit: 10 }, mockContext);
    expect(response.id).toBe("call-1");
    expect(response.name).toBe("get_stats");
    expect(response.response.output).toEqual({ status: "success", count: 42 });
  });

  it("should return an error response when tool is not registered", async () => {
    const response = await executeSingleToolCall(
      { id: "call-2", name: "unknown_tool", args: {} },
      mockContext,
    );

    expect(response.id).toBe("call-2");
    expect(response.name).toBe("unknown_tool");
    expect(response.response.output).toEqual({
      error: "Tool 'unknown_tool' not registered.",
    });
  });

  it("should handle tool execution failure gracefully without throwing", async () => {
    registry.register({
      name: "failing_tool",
      description: "Always fails",
      parameters: { type: "OBJECT", properties: {} },
      execute: vi.fn().mockRejectedValue(new Error("Database disconnected")),
    });

    const response = await executeSingleToolCall(
      { id: "call-3", name: "failing_tool", args: {} },
      mockContext,
    );

    expect(response.id).toBe("call-3");
    expect(response.response.output).toEqual({
      error: "Database disconnected",
    });
  });

  it("should execute batch tool calls sequentially", async () => {
    registry.register({
      name: "tool_a",
      description: "Tool A",
      parameters: { type: "OBJECT", properties: {} },
      execute: vi.fn().mockResolvedValue({ a: 1 }),
    });
    registry.register({
      name: "tool_b",
      description: "Tool B",
      parameters: { type: "OBJECT", properties: {} },
      execute: vi.fn().mockResolvedValue({ b: 2 }),
    });

    const responses = await executeToolCalls(
      [
        { id: "1", name: "tool_a", args: {} },
        { id: "2", name: "tool_b", args: {} },
      ],
      mockContext,
    );

    expect(responses).toHaveLength(2);
    expect(responses[0].response.output).toEqual({ a: 1 });
    expect(responses[1].response.output).toEqual({ b: 2 });
  });
});
