import { ChannelType, VoiceBasedChannel } from "discord.js";
import { ToolDefinition } from "../types";

export interface GetVoiceChannelStateArgs {
  channelIdOrName?: string;
}

export const discordGetVoiceChannelStateTool: ToolDefinition<
  GetVoiceChannelStateArgs,
  {
    voiceChannels: {
      id: string;
      name: string;
      type: string;
      memberCount: number;
      members: {
        id: string;
        username: string;
        displayName: string;
        nickname: string | null;
        isMuted: boolean;
        isDeafened: boolean;
        isStreaming: boolean;
      }[];
    }[];
    totalConnected: number;
  }
> = {
  name: "discord_get_voice_channel_state",
  description:
    "Retrieves members currently connected to voice/stage channels in the Discord server, including their mute, deafen, and streaming states.",
  parameters: {
    type: "OBJECT",
    properties: {
      channelIdOrName: {
        type: "STRING",
        description:
          "Optional specific voice channel ID or name (e.g. 'General Voice'). If omitted, returns all voice channels with connected members.",
      },
    },
  },
  isAvailable: (ctx) => Boolean(ctx.guild),
  execute: async (args, ctx) => {
    if (!ctx.guild) {
      throw new Error("No Discord guild context available.");
    }

    const query = args.channelIdOrName?.trim().replace(/^#/, "").toLowerCase();
    const channels = await ctx.guild.channels.fetch();
    const voiceChannels: VoiceBasedChannel[] = [];

    channels.forEach((c) => {
      if (
        c &&
        (c.type === ChannelType.GuildVoice ||
          c.type === ChannelType.GuildStageVoice)
      ) {
        voiceChannels.push(c as VoiceBasedChannel);
      }
    });

    const targetVoiceChannels = query
      ? voiceChannels.filter(
          (c) => c.id === query || c.name.toLowerCase() === query,
        )
      : voiceChannels.filter((c) => c.members && c.members.size > 0);

    let totalConnected = 0;
    const results = targetVoiceChannels.map((vc) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const membersList: any[] = vc.members
        ? "values" in vc.members
          ? Array.from(vc.members.values())
          : Array.isArray(vc.members)
            ? vc.members
            : []
        : [];

      totalConnected += membersList.length;

      return {
        id: vc.id,
        name: vc.name,
        type: ChannelType[vc.type] ?? String(vc.type),
        memberCount: membersList.length,
        members: membersList.map((m) => {
          const vs = m.voice;
          return {
            id: m.id,
            username: m.user?.username ?? m.username ?? "unknown",
            displayName:
              m.displayName ??
              m.user?.displayName ??
              m.user?.username ??
              "unknown",
            nickname: m.nickname ?? null,
            isMuted: Boolean(vs?.mute || vs?.selfMute),
            isDeafened: Boolean(vs?.deaf || vs?.selfDeaf),
            isStreaming: Boolean(vs?.streaming),
          };
        }),
      };
    });

    return {
      voiceChannels: results,
      totalConnected,
    };
  },
};
