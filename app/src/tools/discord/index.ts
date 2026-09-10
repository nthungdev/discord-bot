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
} from "./channel";
import { discordListRolesTool } from "./role";

export * from "./server";
export * from "./member";
export * from "./channel";
export * from "./role";

export const discordTools: ToolDefinition[] = [
  discordGetServerInfoTool as ToolDefinition,
  discordGetServerOwnerTool as ToolDefinition,
  discordGetMemberInfoTool as ToolDefinition,
  discordSearchMembersTool as unknown as ToolDefinition,
  discordListChannelsTool as ToolDefinition,
  discordGetChannelInfoTool as ToolDefinition,
  discordListRolesTool as ToolDefinition,
];

