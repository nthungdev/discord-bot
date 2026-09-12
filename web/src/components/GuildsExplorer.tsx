import React, { useState } from "react";
import {
  CheckCircle,
  Hash,
  Send,
  Server,
  Users,
  Volume2,
} from "lucide-react";
import type { JoinedGuildDetail } from "../types";

interface GuildsExplorerProps {
  guilds: JoinedGuildDetail[];
  botId: string;
  onDeployCommand: (botId: string, guildId: string) => Promise<void>;
  onDeployAll: (botId: string) => Promise<void>;
  canManage: boolean;
}

export const GuildsExplorer: React.FC<GuildsExplorerProps> = ({
  guilds,
  botId,
  onDeployCommand,
  onDeployAll,
  canManage,
}) => {
  const [selectedGuildId, setSelectedGuildId] = useState<string>(
    guilds[0]?.id || "",
  );
  const [deploying, setDeploying] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const selectedGuild = guilds.find((g) => g.id === selectedGuildId) || guilds[0];

  const handleDeploy = async (guildId: string) => {
    setDeploying(guildId);
    setSuccessMessage(null);
    try {
      await onDeployCommand(botId, guildId);
      setSuccessMessage(`Slash commands successfully deployed to guild '${guildId}'!`);
      setTimeout(() => setSuccessMessage(null), 4000);
    } finally {
      setDeploying(null);
    }
  };

  const handleDeployAll = async () => {
    setDeploying("ALL");
    setSuccessMessage(null);
    try {
      await onDeployAll(botId);
      setSuccessMessage("Slash commands deployed to all joined guilds!");
      setTimeout(() => setSuccessMessage(null), 4000);
    } finally {
      setDeploying(null);
    }
  };

  if (guilds.length === 0) {
    return (
      <div className="glass-card rounded-2xl p-10 text-center border border-white/10 space-y-3">
        <Server className="w-10 h-10 text-discord-muted mx-auto" />
        <h3 className="text-base font-bold text-white">No Guilds Found</h3>
        <p className="text-xs text-discord-muted max-w-sm mx-auto">
          This bot has not joined any Discord servers yet or the bot is currently offline.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">
            Guild Explorer & Command Deployment
          </h2>
          <p className="text-xs text-discord-muted">
            Inspect joined Discord servers, channel permissions, and dispatch slash commands
          </p>
        </div>

        {canManage && (
          <button
            disabled={deploying !== null}
            onClick={handleDeployAll}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-discord-blurple text-white text-xs font-semibold hover:bg-discord-blurple-hover transition-colors disabled:opacity-50 shadow-md shadow-discord-blurple/20"
          >
            <Send className="w-3.5 h-3.5" />
            {deploying === "ALL" ? "Deploying..." : "Deploy Commands to All Guilds"}
          </button>
        )}
      </div>

      {successMessage && (
        <div className="p-3 bg-discord-green/10 border border-discord-green/20 rounded-xl text-xs text-discord-green flex items-center gap-2">
          <CheckCircle className="w-4 h-4 shrink-0" />
          {successMessage}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Guild Selection List */}
        <div className="glass-card rounded-2xl p-4 border border-white/10 space-y-2">
          <div className="text-xs font-bold text-discord-muted uppercase tracking-wider px-2 mb-2">
            Joined Servers ({guilds.length})
          </div>
          {guilds.map((g) => {
            const isSelected = g.id === selectedGuild?.id;
            return (
              <button
                key={g.id}
                onClick={() => setSelectedGuildId(g.id)}
                className={`w-full flex items-center justify-between p-3 rounded-xl text-left transition-all ${
                  isSelected
                    ? "bg-discord-blurple text-white shadow-md shadow-discord-blurple/20"
                    : "bg-discord-darkest/50 hover:bg-discord-darker text-discord-text"
                }`}
              >
                <div className="flex items-center gap-3">
                  {g.icon ? (
                    <img src={g.icon} alt={g.name} className="w-8 h-8 rounded-full" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-discord-dark flex items-center justify-center text-xs font-bold">
                      {g.name[0]}
                    </div>
                  )}
                  <div>
                    <div className="text-xs font-bold line-clamp-1">{g.name}</div>
                    <div className="text-[11px] text-discord-muted flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      {g.memberCount} members
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Guild Channel & Policy Detail */}
        {selectedGuild && (
          <div className="md:col-span-2 glass-card rounded-2xl p-6 border border-white/10 space-y-6">
            <div className="flex items-center justify-between border-b border-white/5 pb-4">
              <div className="flex items-center gap-3">
                {selectedGuild.icon ? (
                  <img
                    src={selectedGuild.icon}
                    alt={selectedGuild.name}
                    className="w-12 h-12 rounded-xl"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-discord-dark flex items-center justify-center text-base font-bold">
                    {selectedGuild.name[0]}
                  </div>
                )}
                <div>
                  <h3 className="text-base font-bold text-white">{selectedGuild.name}</h3>
                  <p className="text-xs text-discord-muted">Guild ID: {selectedGuild.id}</p>
                </div>
              </div>

              {canManage && (
                <button
                  disabled={deploying === selectedGuild.id}
                  onClick={() => handleDeploy(selectedGuild.id)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-discord-green text-black text-xs font-bold hover:bg-discord-green/90 transition-all disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  {deploying === selectedGuild.id ? "Deploying..." : "Deploy Slash Commands"}
                </button>
              )}
            </div>

            {/* Channels topology */}
            <div>
              <h4 className="text-xs font-bold text-discord-muted uppercase tracking-wider mb-3">
                Server Channels ({selectedGuild.channels.length})
              </h4>
              <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-1">
                {selectedGuild.channels.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center gap-2 p-2 rounded-lg bg-discord-darkest/70 border border-white/5 text-xs text-discord-text"
                  >
                    {c.isVoice ? (
                      <Volume2 className="w-3.5 h-3.5 text-discord-muted shrink-0" />
                    ) : (
                      <Hash className="w-3.5 h-3.5 text-discord-muted shrink-0" />
                    )}
                    <span className="truncate">{c.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
