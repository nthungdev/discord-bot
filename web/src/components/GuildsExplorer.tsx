import React, { useEffect, useState } from "react";
import {
  CheckCircle,
  ExternalLink,
  Hash,
  Save,
  Send,
  Server,
  Shield,
  Sparkles,
  Users,
} from "lucide-react";
import { api } from "../lib/api";
import type { BotGuildConfig, JoinedGuildDetail } from "../types";

interface GuildsExplorerProps {
  guilds: JoinedGuildDetail[];
  botId: string;
  onDeployCommand: (botId: string, guildId: string) => Promise<void>;
  onDeployAll: (botId: string) => Promise<void>;
  canManage: boolean;
}

export const GuildsExplorer: React.FC<GuildsExplorerProps> = ({
  guilds,
  onDeployCommand,
  onDeployAll,
  canManage,
}) => {
  const [selectedGuildId, setSelectedGuildId] = useState<string>(
    guilds[0]?.id || "",
  );
  const [deploying, setDeploying] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string>("");
  const [savingConfig, setSavingConfig] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<"channels" | "persona" | "smartReply">("channels");

  // Active Guild Config Form State
  const [guildConfig, setGuildConfig] = useState<BotGuildConfig>({
    replyChannelIds: [],
    ignoredChannelIds: [],
    respondToMentions: true,
    systemInstruction: "",
    tools: { googleSearch: true, discord: true },
    smartReply: {
      enabled: true,
      mode: "ambient_intent",
      ambientConfidenceThreshold: 0.75,
    },
  });

  const selectedGuild = guilds.find((g) => g.id === selectedGuildId) || guilds[0];

  useEffect(() => {
    api.getInviteUrl().then((res) => {
      if (res.ok && res.inviteUrl) {
        setInviteUrl(res.inviteUrl);
      }
    });
  }, []);

  useEffect(() => {
    if (selectedGuild) {
      api.getGuildConfig(selectedGuild.id).then((res) => {
        if (res.ok && res.config) {
          setGuildConfig({
            replyChannelIds: res.config.replyChannelIds || [],
            ignoredChannelIds: res.config.ignoredChannelIds || [],
            respondToMentions: res.config.respondToMentions ?? true,
            systemInstruction: res.config.systemInstruction || "",
            tools: res.config.tools || { googleSearch: true, discord: true },
            smartReply: res.config.smartReply || {
              enabled: true,
              mode: "ambient_intent",
              ambientConfidenceThreshold: 0.75,
            },
          });
        }
      });
    }
  }, [selectedGuild?.id]);

  const handleSaveConfig = async () => {
    if (!selectedGuild) return;
    setSavingConfig(true);
    try {
      await api.updateGuildConfig(selectedGuild.id, guildConfig);
      setSuccessMessage(`Configuration for '${selectedGuild.name}' saved and live-reloaded!`);
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err) {
      console.error("Failed to save guild config:", err);
    } finally {
      setSavingConfig(false);
    }
  };

  const handleDeploy = async (guildId: string) => {
    setDeploying(guildId);
    setSuccessMessage(null);
    try {
      await onDeployCommand("bot", guildId);
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
      await onDeployAll("bot");
      setSuccessMessage("Slash commands deployed to all joined guilds!");
      setTimeout(() => setSuccessMessage(null), 4000);
    } finally {
      setDeploying(null);
    }
  };

  const toggleChannel = (channelId: string, listType: "reply" | "ignored") => {
    if (listType === "reply") {
      const current = guildConfig.replyChannelIds || [];
      const updated = current.includes(channelId)
        ? current.filter((id) => id !== channelId)
        : [...current, channelId];
      setGuildConfig({ ...guildConfig, replyChannelIds: updated });
    } else {
      const current = guildConfig.ignoredChannelIds || [];
      const updated = current.includes(channelId)
        ? current.filter((id) => id !== channelId)
        : [...current, channelId];
      setGuildConfig({ ...guildConfig, ignoredChannelIds: updated });
    }
  };

  if (guilds.length === 0) {
    return (
      <div className="glass-card rounded-2xl p-10 text-center border border-white/10 space-y-4">
        <Server className="w-12 h-12 text-discord-blurple mx-auto" />
        <h3 className="text-lg font-bold text-white">No Connected Discord Servers Found</h3>
        <p className="text-xs text-discord-muted max-w-md mx-auto">
          The bot has not joined any Discord servers yet. Use the invite link below to install the bot to your Discord server:
        </p>
        {inviteUrl && (
          <a
            href={inviteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-discord-blurple text-white font-bold text-xs hover:bg-discord-blurple-hover transition-all shadow-lg shadow-discord-blurple/25"
          >
            <ExternalLink className="w-4 h-4" />
            Install Bot to Discord Server
          </a>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header & Global Actions */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">
            Server Connection & Settings Manager
          </h2>
          <p className="text-xs text-discord-muted">
            Manage per-server channel routing, custom AI personas, and slash command deployment
          </p>
        </div>

        <div className="flex items-center gap-3">
          {inviteUrl && (
            <a
              href={inviteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-discord-dark hover:bg-discord-darker border border-white/10 text-xs font-semibold text-white transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5 text-discord-blurple" />
              Add Bot to New Server
            </a>
          )}

          {canManage && (
            <button
              disabled={deploying !== null}
              onClick={handleDeployAll}
              className="flex items-center gap-2 px-4 py-1.5 rounded-xl bg-discord-blurple text-white text-xs font-semibold hover:bg-discord-blurple-hover transition-colors disabled:opacity-50 shadow-md shadow-discord-blurple/20"
            >
              <Send className="w-3.5 h-3.5" />
              {deploying === "ALL" ? "Deploying..." : "Deploy All Commands"}
            </button>
          )}
        </div>
      </div>

      {successMessage && (
        <div className="p-3 bg-discord-green/10 border border-discord-green/20 rounded-xl text-xs text-discord-green flex items-center gap-2">
          <CheckCircle className="w-4 h-4 shrink-0" />
          {successMessage}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Guild Selection Sidebar */}
        <div className="glass-card rounded-2xl p-4 border border-white/10 space-y-2">
          <div className="text-xs font-bold text-discord-muted uppercase tracking-wider px-2 mb-2 flex items-center justify-between">
            <span>Connected Servers</span>
            <span className="bg-discord-darkest px-2 py-0.5 rounded-full text-[10px]">
              {guilds.length}
            </span>
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

        {/* Guild Settings Panel */}
        {selectedGuild && (
          <div className="md:col-span-2 glass-card rounded-2xl p-6 border border-white/10 space-y-6">
            {/* Guild Header */}
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
                  <p className="text-xs text-discord-muted font-mono">ID: {selectedGuild.id}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {canManage && (
                  <button
                    disabled={deploying === selectedGuild.id}
                    onClick={() => handleDeploy(selectedGuild.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-discord-dark hover:bg-discord-darker border border-white/10 text-white text-xs font-semibold transition-all disabled:opacity-50"
                  >
                    <Send className="w-3.5 h-3.5 text-discord-green" />
                    {deploying === selectedGuild.id ? "Deploying..." : "Deploy Commands"}
                  </button>
                )}

                {canManage && (
                  <button
                    disabled={savingConfig}
                    onClick={handleSaveConfig}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-discord-green text-black text-xs font-bold hover:bg-discord-green/90 transition-all disabled:opacity-50 shadow-md shadow-discord-green/20"
                  >
                    <Save className="w-3.5 h-3.5" />
                    {savingConfig ? "Saving..." : "Save Settings"}
                  </button>
                )}
              </div>
            </div>

            {/* Settings Tabs */}
            <div className="flex items-center gap-2 border-b border-white/5 pb-2">
              <button
                onClick={() => setActiveTab("channels")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === "channels"
                    ? "bg-discord-blurple text-white"
                    : "text-discord-muted hover:text-white"
                }`}
              >
                <Hash className="w-3.5 h-3.5" />
                Channel Whitelist / Blacklist
              </button>
              <button
                onClick={() => setActiveTab("persona")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === "persona"
                    ? "bg-discord-blurple text-white"
                    : "text-discord-muted hover:text-white"
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                AI Persona & Prompts
              </button>
              <button
                onClick={() => setActiveTab("smartReply")}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  activeTab === "smartReply"
                    ? "bg-discord-blurple text-white"
                    : "text-discord-muted hover:text-white"
                }`}
              >
                <Shield className="w-3.5 h-3.5" />
                Smart Reply & Moderation
              </button>
            </div>

            {/* Tab 1: Channels Routing */}
            {activeTab === "channels" && (
              <div className="space-y-4">
                <div>
                  <h4 className="text-xs font-bold text-discord-muted uppercase tracking-wider mb-1">
                    Reply Channels Whitelist
                  </h4>
                  <p className="text-[11px] text-discord-muted mb-3">
                    If configured, the bot will strictly only respond to messages in selected channels. (Leave empty to respond anywhere).
                  </p>
                  <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1 bg-discord-darkest/40 p-3 rounded-xl border border-white/5">
                    {selectedGuild.channels
                      .filter((c) => c.isText)
                      .map((c) => {
                        const isWhitelisted = guildConfig.replyChannelIds?.includes(c.id);
                        return (
                          <label
                            key={c.id}
                            className={`flex items-center gap-2 p-2 rounded-lg text-xs cursor-pointer transition-all ${
                              isWhitelisted
                                ? "bg-discord-blurple/20 text-white border border-discord-blurple/40"
                                : "hover:bg-discord-darker text-discord-text"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isWhitelisted}
                              onChange={() => toggleChannel(c.id, "reply")}
                              className="w-3.5 h-3.5 rounded bg-discord-darkest border-white/10 text-discord-blurple"
                            />
                            <Hash className="w-3.5 h-3.5 text-discord-muted" />
                            <span className="truncate">{c.name}</span>
                          </label>
                        );
                      })}
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-bold text-discord-muted uppercase tracking-wider mb-1">
                    Ignored Channels Blacklist
                  </h4>
                  <p className="text-[11px] text-discord-muted mb-3">
                    Channels where all bot triggers and ambient replies are completely muted.
                  </p>
                  <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1 bg-discord-darkest/40 p-3 rounded-xl border border-white/5">
                    {selectedGuild.channels
                      .filter((c) => c.isText)
                      .map((c) => {
                        const isIgnored = guildConfig.ignoredChannelIds?.includes(c.id);
                        return (
                          <label
                            key={c.id}
                            className={`flex items-center gap-2 p-2 rounded-lg text-xs cursor-pointer transition-all ${
                              isIgnored
                                ? "bg-discord-red/20 text-white border border-discord-red/40"
                                : "hover:bg-discord-darker text-discord-text"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isIgnored}
                              onChange={() => toggleChannel(c.id, "ignored")}
                              className="w-3.5 h-3.5 rounded bg-discord-darkest border-white/10 text-discord-red"
                            />
                            <Hash className="w-3.5 h-3.5 text-discord-muted" />
                            <span className="truncate">{c.name}</span>
                          </label>
                        );
                      })}
                  </div>
                </div>
              </div>
            )}

            {/* Tab 2: AI Persona */}
            {activeTab === "persona" && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-discord-muted uppercase tracking-wider mb-1.5">
                    Server System Prompt Override
                  </label>
                  <p className="text-[11px] text-discord-muted mb-2">
                    Define custom personality traits, rules, or backstory for the AI specifically in this Discord server.
                  </p>
                  <textarea
                    rows={6}
                    value={guildConfig.systemInstruction || ""}
                    onChange={(e) =>
                      setGuildConfig({ ...guildConfig, systemInstruction: e.target.value })
                    }
                    placeholder="e.g. You are a helpful technical assistant specialized in Roblox programming for this Discord guild..."
                    className="w-full bg-discord-darkest border border-white/10 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-discord-blurple font-mono leading-relaxed"
                  />
                </div>
              </div>
            )}

            {/* Tab 3: Smart Reply & Tools */}
            {activeTab === "smartReply" && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-discord-darkest/40 p-4 rounded-xl border border-white/5 space-y-2">
                    <label className="text-xs font-bold text-white block">Smart Reply Mode</label>
                    <select
                      value={guildConfig.smartReply?.mode || "ambient_intent"}
                      onChange={(e) =>
                        setGuildConfig({
                          ...guildConfig,
                          smartReply: {
                            ...guildConfig.smartReply,
                            mode: e.target.value as any,
                          },
                        })
                      }
                      className="w-full bg-discord-dark border border-white/10 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-discord-blurple"
                    >
                      <option value="ambient_intent">Ambient Intent (AI decides when to reply)</option>
                      <option value="mentions_and_vocative">Mentions & Bot Name Only</option>
                      <option value="disabled">Disabled</option>
                    </select>
                  </div>

                  <div className="bg-discord-darkest/40 p-4 rounded-xl border border-white/5 space-y-2">
                    <label className="text-xs font-bold text-white block">
                      Ambient Confidence Threshold ({guildConfig.smartReply?.ambientConfidenceThreshold ?? 0.75})
                    </label>
                    <input
                      type="range"
                      min="0.5"
                      max="0.95"
                      step="0.05"
                      value={guildConfig.smartReply?.ambientConfidenceThreshold ?? 0.75}
                      onChange={(e) =>
                        setGuildConfig({
                          ...guildConfig,
                          smartReply: {
                            ...guildConfig.smartReply,
                            ambientConfidenceThreshold: parseFloat(e.target.value),
                          },
                        })
                      }
                      className="w-full accent-discord-blurple cursor-pointer"
                    />
                  </div>
                </div>

                <div className="bg-discord-darkest/40 p-4 rounded-xl border border-white/5 space-y-3">
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider">Tool Capabilities</h4>
                  <div className="flex items-center gap-6">
                    <label className="flex items-center gap-2 text-xs text-discord-text cursor-pointer">
                      <input
                        type="checkbox"
                        checked={guildConfig.tools?.googleSearch ?? true}
                        onChange={(e) =>
                          setGuildConfig({
                            ...guildConfig,
                            tools: { ...guildConfig.tools, googleSearch: e.target.checked },
                          })
                        }
                        className="w-4 h-4 rounded bg-discord-dark border-white/10 text-discord-blurple"
                      />
                      Google Web Search Grounding
                    </label>

                    <label className="flex items-center gap-2 text-xs text-discord-text cursor-pointer">
                      <input
                        type="checkbox"
                        checked={guildConfig.tools?.discord ?? true}
                        onChange={(e) =>
                          setGuildConfig({
                            ...guildConfig,
                            tools: { ...guildConfig.tools, discord: e.target.checked },
                          })
                        }
                        className="w-4 h-4 rounded bg-discord-dark border-white/10 text-discord-blurple"
                      />
                      Discord Server Operations
                    </label>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
