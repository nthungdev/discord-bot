import { ToolDefinition, ToolExecutionContext } from "./types";

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();

  /** Register a single tool definition */
  register(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  /** Register multiple tool definitions */
  registerBatch(tools: ToolDefinition[]): void {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  /** Get a registered tool by its unique name */
  getTool(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  /** Get all registered tools */
  getAllTools(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /** Filter registered tools based on context availability */
  async getAvailableTools(
    context: ToolExecutionContext,
  ): Promise<ToolDefinition[]> {
    const available: ToolDefinition[] = [];
    for (const tool of this.tools.values()) {
      if (!tool.isAvailable || (await tool.isAvailable(context))) {
        available.push(tool);
      }
    }
    return available;
  }
}

let defaultRegistry: ToolRegistry | null = null;

export const getToolRegistry = (): ToolRegistry => {
  if (!defaultRegistry) {
    defaultRegistry = new ToolRegistry();
  }
  return defaultRegistry;
};

export const setToolRegistry = (registry: ToolRegistry | null): void => {
  defaultRegistry = registry;
};
