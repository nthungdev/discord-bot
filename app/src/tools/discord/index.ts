import type { ToolDefinition } from "../types";
import {
  discordGetChannelInfoTool,
  discordGetChannelMembersTool,
  discordListChannelsTool,
} from "./channel";
import { discordGetScheduledEventsTool } from "./event";
import { discordGetMemberInfoTool, discordSearchMembersTool } from "./member";
import {
  discordGetPinnedMessagesTool,
  discordGetRecentMessagesTool,
  discordReactToMessageTool,
} from "./message";
import { discordListRolesTool } from "./role";
import { discordGetServerInfoTool, discordGetServerOwnerTool } from "./server";
import { discordGetVoiceChannelStateTool } from "./voice";

export * from "./channel";
export * from "./event";
export * from "./member";
export * from "./message";
export * from "./role";
export * from "./server";
export * from "./voice";

export const discordTools: ToolDefinition[] = [
  discordGetServerInfoTool as ToolDefinition,
  discordGetServerOwnerTool as ToolDefinition,
  discordGetMemberInfoTool as ToolDefinition,
  discordSearchMembersTool as unknown as ToolDefinition,
  discordListChannelsTool as ToolDefinition,
  discordGetChannelInfoTool as ToolDefinition,
  discordGetChannelMembersTool as unknown as ToolDefinition,
  discordListRolesTool as ToolDefinition,
  discordGetVoiceChannelStateTool as unknown as ToolDefinition,
  discordGetRecentMessagesTool as unknown as ToolDefinition,
  discordGetPinnedMessagesTool as unknown as ToolDefinition,
  discordReactToMessageTool as unknown as ToolDefinition,
  discordGetScheduledEventsTool as unknown as ToolDefinition,
];
