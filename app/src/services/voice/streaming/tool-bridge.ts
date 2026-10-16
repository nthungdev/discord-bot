/**
 * Mid-conversation Tool Calling Bridge for Gemini Live Sessions.
 * Maps repository tools into GenAI FunctionDeclarations and executes requested tool calls.
 */

import type { FunctionDeclaration } from "@google/genai";
import { getToolRegistry } from "../../../tools/registry";
import type {
  ToolDefinition,
  ToolExecutionContext,
} from "../../../tools/types";
import type { LiveFunctionCall, LiveFunctionResponse } from "./types";

/**
 * Converts repository ToolDefinitions into Gemini Live FunctionDeclarations.
 */
export function buildFunctionDeclarations(
  tools: readonly ToolDefinition[],
): FunctionDeclaration[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters as unknown as FunctionDeclaration["parameters"],
  }));
}

/**
 * Executes a single function call emitted by the Gemini Live session.
 */
export async function executeSingleToolCall(
  call: LiveFunctionCall,
  context: ToolExecutionContext,
): Promise<LiveFunctionResponse> {
  const registry = getToolRegistry();
  const tool = registry.getTool(call.name);

  if (!tool) {
    console.warn(`[ToolBridge] Tool '${call.name}' not found in registry.`);
    return {
      id: call.id,
      name: call.name,
      response: {
        output: { error: `Tool '${call.name}' not registered.` },
      },
    };
  }

  // Check contextual availability if tool implements isAvailable
  if (tool.isAvailable) {
    try {
      const available = await tool.isAvailable(context);
      if (!available) {
        return {
          id: call.id,
          name: call.name,
          response: {
            output: {
              error: `Tool '${call.name}' is not available in current context.`,
            },
          },
        };
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        id: call.id,
        name: call.name,
        response: {
          output: { error: `Availability check failed: ${message}` },
        },
      };
    }
  }

  console.info(`[ToolBridge] Executing mid-conversation tool '${call.name}'`, {
    args: call.args,
  });

  try {
    const output = await tool.execute(call.args ?? {}, context);
    console.info(`[ToolBridge] Tool '${call.name}' succeeded`, { output });
    return {
      id: call.id,
      name: call.name,
      response: { output },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[ToolBridge] Tool '${call.name}' failed:`, message);
    return {
      id: call.id,
      name: call.name,
      response: { output: { error: message } },
    };
  }
}

/**
 * Executes all function calls in batch and collects responses.
 */
export async function executeToolCalls(
  calls: readonly LiveFunctionCall[],
  context: ToolExecutionContext,
): Promise<LiveFunctionResponse[]> {
  const responses: LiveFunctionResponse[] = [];
  for (const call of calls) {
    const res = await executeSingleToolCall(call, context);
    responses.push(res);
  }
  return responses;
}
