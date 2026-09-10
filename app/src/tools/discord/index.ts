import { ToolDefinition } from "../types";
import {
  discordGetServerInfoTool,
  discordGetServerOwnerTool,
} from "./server";
import {
  discordGetMemberInfoTool,
  discordSearchMembersTool,
} from "./member";
import {
  discordListChannelsTool,
  discordGetChannelInfoTool,
  discordGetChannelMembersTool,
} from "./channel";
import { discordListRolesTool } from "./role";
import { discordGetVoiceChannelStateTool } from "./voice";
import {
  discordGetRecentMessagesTool,
  discordGetPinnedMessagesTool,
  discordReactToMessageTool,
} from "./message";
import { discordGetScheduledEventsTool } from "./event";

export * from "./server";
export * from "./member";
export * from "./channel";
export * from "./role";
export * from "./voice";
export * from "./message";
export * from "./event";

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
