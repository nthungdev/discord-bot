import {
  type GuildScheduledEvent,
  GuildScheduledEventStatus,
} from "discord.js";
import type { ToolDefinition } from "../types";

export interface GetScheduledEventsArgs {
  limit?: number;
}

export const discordGetScheduledEventsTool: ToolDefinition<
  GetScheduledEventsArgs,
  {
    events: {
      id: string;
      name: string;
      description: string | null;
      startTime: string | null;
      endTime: string | null;
      status: string;
      userCount: number;
      channelId: string | null;
      creator: {
        id: string;
        username: string;
      } | null;
    }[];
    count: number;
  }
> = {
  name: "discord_get_scheduled_events",
  description:
    "Retrieves scheduled community events on the Discord server, including upcoming and active events, start times, and attendee counts.",
  parameters: {
    type: "OBJECT",
    properties: {
      limit: {
        type: "INTEGER",
        description: "Maximum number of events to return (1-20, default: 10).",
      },
    },
  },
  isAvailable: (ctx) => Boolean(ctx.guild),
  execute: async (args, ctx) => {
    if (!ctx.guild) {
      throw new Error("No Discord guild context available.");
    }

    const limit = Math.min(Math.max(args.limit ?? 10, 1), 20);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fetched: any = await ctx.guild.scheduledEvents.fetch();
    const eventList: GuildScheduledEvent[] =
      "values" in fetched
        ? Array.from(fetched.values())
        : Array.isArray(fetched)
          ? fetched
          : [];

    const formatted = eventList.slice(0, limit).map((ev) => ({
      id: ev.id,
      name: ev.name,
      description: ev.description ?? null,
      startTime: ev.scheduledStartAt?.toISOString() ?? null,
      endTime: ev.scheduledEndAt?.toISOString() ?? null,
      status: GuildScheduledEventStatus[ev.status] ?? String(ev.status),
      userCount: ev.userCount ?? 0,
      channelId: ev.channelId ?? null,
      creator: ev.creator
        ? {
            id: ev.creator.id,
            username: ev.creator.username,
          }
        : null,
    }));

    return {
      events: formatted,
      count: formatted.length,
    };
  },
};
