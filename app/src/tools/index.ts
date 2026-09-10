import { discordTools } from "./discord";
import { getToolRegistry, ToolRegistry } from "./registry";

export * from "./types";
export * from "./registry";
export * from "./discord";

/**
 * Register all default tools (such as Discord tools) into the specified registry.
 * If no registry is provided, the singleton registry is used.
 */
export const registerDefaultTools = (
  registry: ToolRegistry = getToolRegistry(),
): void => {
  registry.registerBatch(discordTools);
};
