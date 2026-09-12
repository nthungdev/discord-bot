import React, { useState } from "react";
import { Bot, Database, Search, Trash2, User } from "lucide-react";
import type { StoredChatMessage } from "../types";

interface MemoryInspectorProps {
  onFetchHistory: (botId: string, channelId: string) => Promise<StoredChatMessage[]>;
  onClearHistory: (botId: string, channelId: string) => Promise<void>;
  onClearAll: () => Promise<void>;
  canManage: boolean;
}

export const MemoryInspector: React.FC<MemoryInspectorProps> = ({
  onFetchHistory,
  onClearHistory,
  onClearAll,
  canManage,
}) => {
  const [botId, setBotId] = useState("chatBot");
  const [channelId, setChannelId] = useState("");
  const [history, setHistory] = useState<StoredChatMessage[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [clearing, setClearing] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!channelId) return;

    setLoading(true);
    try {
      const messages = await onFetchHistory(botId, channelId);
      setHistory(messages);
    } catch {
      setHistory([]);
    } finally {
      setLoading(false);
    }
  };

  const handleClear = async () => {
    if (!channelId || !confirm(`Clear conversation memory for channel '${channelId}'?`)) return;

    setClearing(true);
    try {
      await onClearHistory(botId, channelId);
      setHistory([]);
    } finally {
      setClearing(false);
    }
  };

  const handleClearAllGlobal = async () => {
    if (!confirm("Are you sure you want to clear ALL persistent conversation memories across all bots and channels?")) return;

    setClearing(true);
    try {
      await onClearAll();
      setHistory([]);
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">
            Conversation Memory Inspector
          </h2>
          <p className="text-xs text-discord-muted">
            Inspect multi-user conversation turns, actor attribution, and clear cached memories
          </p>
        </div>

        {canManage && (
          <button
            onClick={handleClearAllGlobal}
            disabled={clearing}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-discord-red/20 text-discord-red border border-discord-red/30 text-xs font-semibold hover:bg-discord-red/30 transition-colors disabled:opacity-50"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Purge All Memory Partitions
          </button>
        )}
      </div>

      <div className="glass-card rounded-2xl p-5 border border-white/10">
        <form onSubmit={handleSearch} className="flex flex-wrap items-center gap-3">
          <div className="w-48">
            <select
              value={botId}
              onChange={(e) => setBotId(e.target.value)}
              className="w-full bg-discord-darkest border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-discord-blurple"
            >
              <option value="chatBot">chatBot (Gemini)</option>
              <option value="policeBot">policeBot</option>
            </select>
          </div>

          <div className="flex-1 min-w-[240px]">
            <input
              type="text"
              placeholder="Enter Discord Channel Snowflake ID (e.g. 1087094723984572416)"
              value={channelId}
              onChange={(e) => setChannelId(e.target.value)}
              className="w-full bg-discord-darkest border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-discord-blurple"
            />
          </div>

          <button
            type="submit"
            disabled={loading || !channelId}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-discord-blurple text-white text-xs font-semibold hover:bg-discord-blurple-hover transition-colors disabled:opacity-50 shadow-md shadow-discord-blurple/20"
          >
            <Search className="w-3.5 h-3.5" />
            {loading ? "Searching..." : "Inspect Turns"}
          </button>

          {history && history.length > 0 && canManage && (
            <button
              type="button"
              onClick={handleClear}
              disabled={clearing}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-discord-dark border border-white/10 text-discord-red text-xs font-semibold hover:bg-discord-red/20 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear Channel History
            </button>
          )}
        </form>
      </div>

      {history !== null && (
        <div className="glass-card rounded-2xl p-6 border border-white/10 space-y-4">
          <div className="flex items-center justify-between border-b border-white/5 pb-3">
            <div className="flex items-center gap-2 text-xs font-bold text-discord-muted uppercase tracking-wider">
              <Database className="w-4 h-4 text-discord-blurple" />
              Stored Dialogue Turns ({history.length})
            </div>
            <span className="text-xs text-discord-muted">
              Channel: {channelId}
            </span>
          </div>

          {history.length === 0 ? (
            <div className="text-center py-10 text-discord-muted text-xs">
              No conversational turns recorded for this channel.
            </div>
          ) : (
            <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
              {history.map((msg, index) => {
                const isBot = msg.author === "bot";
                return (
                  <div
                    key={index}
                    className={`p-3 rounded-xl border flex items-start gap-3 ${
                      isBot
                        ? "bg-discord-darkest/90 border-discord-blurple/30"
                        : "bg-discord-darker border-white/5"
                    }`}
                  >
                    <div
                      className={`p-2 rounded-lg shrink-0 ${
                        isBot
                          ? "bg-discord-blurple/20 text-discord-blurple"
                          : "bg-discord-dark text-discord-muted"
                      }`}
                    >
                      {isBot ? <Bot className="w-4 h-4" /> : <User className="w-4 h-4" />}
                    </div>

                    <div className="flex-1 overflow-hidden">
                      <div className="flex items-center justify-between text-[11px] mb-1">
                        <span className="font-bold text-white">
                          {isBot ? "Bot Assistant" : msg.displayName || msg.username || "User"}
                        </span>
                        {msg.timestamp && (
                          <span className="text-discord-muted">
                            {new Date(msg.timestamp).toLocaleTimeString()}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-discord-text whitespace-pre-wrap break-words">
                        {msg.content}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
