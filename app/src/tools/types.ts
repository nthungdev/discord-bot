import type { Client, Guild, TextBasedChannel } from "discord.js";

export interface ToolExecutionContext {
  botId: string;
  client?: Client;
  guild?: Guild | null;
  channel?: TextBasedChannel | null;
  messageId?: string;
  author?: {
    id: string;
    username: string;
    displayName: string;
  };
}

export type ToolParameterType =
  | "STRING"
  | "NUMBER"
  | "INTEGER"
  | "BOOLEAN"
  | "ARRAY"
  | "OBJECT";

export interface ToolParameterProperty {
  type: ToolParameterType;
  description: string;
  enum?: string[];
  items?: ToolParameterProperty;
  properties?: Record<string, ToolParameterProperty>;
  required?: string[];
}

export interface ToolParameterSchema {
  type: "OBJECT";
  properties: Record<string, ToolParameterProperty>;
  required?: string[];
}

export interface ToolDefinition<
  TArgs = Record<string, unknown>,
  TResult = unknown,
> {
  name: string;
  description: string;
  parameters: ToolParameterSchema;
  /** Optional filter to check if the tool is usable in the given context */
  isAvailable?: (context: ToolExecutionContext) => boolean | Promise<boolean>;
  /** Execution logic for the tool */
  execute: (args: TArgs, context: ToolExecutionContext) => Promise<TResult>;
}
