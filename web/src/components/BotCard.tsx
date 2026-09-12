import React, { useState } from "react";
import {
  Activity,
  Bot,
  Play,
  RefreshCw,
  Server,
  Square,
  Trash2,
  Wifi,
} from "lucide-react";
import type { BotRuntimeMetrics } from "../types";

interface BotCardProps {
  bot: BotRuntimeMetrics;
  onStart: (id: string) => Promise<void>;
  onStop: (id: string) => Promise<void>;
  onRestart: (id: string) => Promise<void>;
  onUnregister: (id: string) => Promise<void>;
  canManage: boolean;
}

export const BotCard: React.FC<BotCardProps> = ({
  bot,
  onStart,
  onStop,
  onRestart,
  onUnregister,
  canManage,
}) => {
  const [loading, setLoading] = useState(false);

  const handleAction = async (action: () => Promise<void>) => {
    setLoading(true);
    try {
      await action();
    } finally {
      setLoading(false);
    }
  };

  const isOnline = bot.status === "ONLINE";
  const isStopped = bot.status === "STOPPED";
  const isError = bot.status === "ERROR";

  return (
    <div className="glass-card rounded-2xl p-5 transition-all hover:border-white/20 flex flex-col justify-between">
      <div>
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="relative">
              {bot.avatarUrl ? (
                <img
                  src={bot.avatarUrl}
                  alt={bot.name}
                  className="w-12 h-12 rounded-xl object-cover"
                />
              ) : (
                <div className="w-12 h-12 rounded-xl bg-discord-dark flex items-center justify-center border border-white/10">
                  <Bot className="w-6 h-6 text-discord-blurple" />
                </div>
              )}
              <span
                className={`absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-discord-darkest ${
                  isOnline
                    ? "bg-discord-green animate-pulse"
                    : isError
                      ? "bg-discord-red"
                      : "bg-discord-muted"
                }`}
              />
            </div>
            <div>
              <h3 className="font-bold text-white text-base leading-snug">
                {bot.name}
              </h3>
              <div className="text-xs text-discord-muted flex items-center gap-2">
                <span>ID: {bot.id}</span>
                <span>•</span>
                <span className="capitalize">{bot.botType}</span>
              </div>
            </div>
          </div>

          <div
            className={`px-2.5 py-1 rounded-full text-xs font-semibold tracking-wider ${
              isOnline
                ? "bg-discord-green/10 text-discord-green border border-discord-green/20"
                : isError
                  ? "bg-discord-red/10 text-discord-red border border-discord-red/20"
                  : "bg-discord-muted/10 text-discord-muted border border-discord-muted/20"
            }`}
          >
            {bot.status}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-4 bg-discord-darkest/60 p-3 rounded-xl border border-white/5 text-xs">
          <div className="flex items-center gap-2 text-discord-muted">
            <Wifi className="w-3.5 h-3.5" />
            <span>Ping:</span>
            <span className="font-semibold text-white">
              {bot.gatewayPingMs >= 0 ? `${bot.gatewayPingMs} ms` : "N/A"}
            </span>
          </div>
          <div className="flex items-center gap-2 text-discord-muted">
            <Server className="w-3.5 h-3.5" />
            <span>Guilds:</span>
            <span className="font-semibold text-white">
              {bot.joinedGuildsCount}
            </span>
          </div>
          <div className="flex items-center gap-2 text-discord-muted">
            <Activity className="w-3.5 h-3.5" />
            <span>Uptime:</span>
            <span className="font-semibold text-white">
              {bot.uptimeSeconds > 0 ? `${Math.floor(bot.uptimeSeconds / 60)}m` : "0m"}
            </span>
          </div>
          <div className="flex items-center gap-2 text-discord-muted">
            <span>Token:</span>
            <span className="font-mono text-[11px] text-discord-muted">
              {bot.tokenMasked}
            </span>
          </div>
        </div>

        {bot.lastError && (
          <div className="mb-4 p-2.5 bg-discord-red/10 border border-discord-red/20 rounded-lg text-xs text-discord-red">
            {bot.lastError}
          </div>
        )}
      </div>

      {canManage && (
        <div className="flex items-center gap-2 pt-2 border-t border-white/5">
          {isStopped || isError ? (
            <button
              disabled={loading}
              onClick={() => handleAction(() => onStart(bot.id))}
              className="flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-discord-green text-black font-semibold text-xs hover:bg-discord-green/90 transition-all disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              Start
            </button>
          ) : (
            <button
              disabled={loading}
              onClick={() => handleAction(() => onStop(bot.id))}
              className="flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-discord-red/20 text-discord-red border border-discord-red/30 font-semibold text-xs hover:bg-discord-red/30 transition-all disabled:opacity-50"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              Stop
            </button>
          )}

          <button
            disabled={loading}
            onClick={() => handleAction(() => onRestart(bot.id))}
            className="p-2 rounded-lg bg-discord-dark hover:bg-discord-darker text-white border border-white/10 transition-all disabled:opacity-50"
            title="Restart Bot"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>

          <button
            disabled={loading}
            onClick={() => {
              if (confirm(`Are you sure you want to unregister '${bot.name}'?`)) {
                handleAction(() => onUnregister(bot.id));
              }
            }}
            className="p-2 rounded-lg bg-discord-dark hover:bg-discord-red/20 text-discord-muted hover:text-discord-red border border-white/10 transition-all disabled:opacity-50"
            title="Unregister Bot"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};
