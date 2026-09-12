import React from "react";
import { AlertTriangle, Bot, MessageSquare, Radio, Terminal } from "lucide-react";
import type { ActivityLogEvent } from "../types";

interface LiveEventStreamProps {
  events: ActivityLogEvent[];
}

export const LiveEventStream: React.FC<LiveEventStreamProps> = ({ events }) => {
  return (
    <div className="glass-card rounded-2xl p-5 border border-white/10 space-y-4">
      <div className="flex items-center justify-between border-b border-white/5 pb-3">
        <div className="flex items-center gap-2">
          <Radio className="w-4 h-4 text-discord-green animate-pulse" />
          <h3 className="font-bold text-white text-sm">
            Live Gateway Activity Feed (SSE)
          </h3>
        </div>
        <span className="text-[11px] text-discord-muted bg-discord-darkest px-2 py-0.5 rounded-full border border-white/5">
          Real-time Event Stream
        </span>
      </div>

      {events.length === 0 ? (
        <div className="text-center py-10 text-discord-muted text-xs flex flex-col items-center gap-2">
          <Terminal className="w-6 h-6 text-discord-muted/60" />
          Waiting for incoming bot actions, messages, or Gateway events...
        </div>
      ) : (
        <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1 font-mono text-xs">
          {events.map((event) => {
            const isError = event.type === "error";
            const isMod = event.type === "moderation_action";
            const isStatus = event.type === "bot_status_changed";

            return (
              <div
                key={event.id}
                className={`p-2.5 rounded-xl border flex items-start gap-2.5 transition-all ${
                  isError
                    ? "bg-discord-red/10 border-discord-red/20 text-discord-red"
                    : isMod
                      ? "bg-discord-yellow/10 border-discord-yellow/20 text-discord-yellow"
                      : isStatus
                        ? "bg-discord-blurple/10 border-discord-blurple/20 text-discord-text"
                        : "bg-discord-darkest/70 border-white/5 text-discord-text"
                }`}
              >
                <div className="mt-0.5 shrink-0">
                  {isError ? (
                    <AlertTriangle className="w-3.5 h-3.5 text-discord-red" />
                  ) : isStatus ? (
                    <Bot className="w-3.5 h-3.5 text-discord-blurple" />
                  ) : (
                    <MessageSquare className="w-3.5 h-3.5 text-discord-green" />
                  )}
                </div>

                <div className="flex-1 overflow-hidden">
                  <div className="flex items-center justify-between text-[10px] text-discord-muted mb-0.5">
                    <span className="font-bold text-white uppercase tracking-wider">
                      [{event.botId}] {event.type}
                    </span>
                    <span>{new Date(event.timestamp).toLocaleTimeString()}</span>
                  </div>
                  <p className="text-xs break-words">{event.summary}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
