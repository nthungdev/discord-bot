import React, { useEffect, useState } from "react";
import {
  Bot,
  Cpu,
  Plus,
  Server,
  Wifi,
} from "lucide-react";
import { BotCard } from "./components/BotCard";
import { BotRegistrationModal } from "./components/BotRegistrationModal";
import { ConfigEditor } from "./components/ConfigEditor";
import { GuildsExplorer } from "./components/GuildsExplorer";
import { Header } from "./components/Header";
import { LiveEventStream } from "./components/LiveEventStream";
import { MemoryInspector } from "./components/MemoryInspector";
import { type NavTab, Sidebar } from "./components/Sidebar";
import { StatCard } from "./components/StatCard";
import { api, subscribeToEvents } from "./lib/api";
import type {
  ActivityLogEvent,
  BotRuntimeMetrics,
  DashboardStats,
  JoinedGuildDetail,
  UserSession,
} from "./types";

export const App: React.FC = () => {
  const [session, setSession] = useState<UserSession | null>(null);
  const [currentTab, setCurrentTab] = useState<NavTab>("dashboard");
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [bots, setBots] = useState<BotRuntimeMetrics[]>([]);
  const [config, setConfig] = useState<Record<string, unknown>>({});
  const [guilds, setGuilds] = useState<JoinedGuildDetail[]>([]);
  const [events, setEvents] = useState<ActivityLogEvent[]>([]);
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  // Initial data load
  const loadInitialData = async () => {
    try {
      const [meRes, statsRes, configRes] = await Promise.allSettled([
        api.getMe(),
        api.getStats(),
        api.getConfig(),
      ]);

      if (meRes.status === "fulfilled") {
        setSession(meRes.value.session);
      }
      if (statsRes.status === "fulfilled") {
        setStats(statsRes.value.stats);
        setBots(statsRes.value.stats.bots || []);
      }
      if (configRes.status === "fulfilled") {
        setConfig(configRes.value.config || {});
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInitialData();

    // Subscribe to real-time Server-Sent Events (SSE)
    const unsubscribe = subscribeToEvents({
      onInitialState: (data) => {
        setStats(data);
        setBots(data.bots || []);
      },
      onTelemetryTick: (data) => {
        setStats(data);
        setBots(data.bots || []);
      },
      onActivityLog: (event) => {
        setEvents((prev) => [event, ...prev].slice(0, 50));
      },
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Fetch guilds when navigating to guilds tab or changing bot
  useEffect(() => {
    if (currentTab === "guilds" && bots.length > 0) {
      const activeBot = bots.find((b) => b.status === "ONLINE") || bots[0];
      if (activeBot) {
        api.getBotGuilds(activeBot.id).then((res) => {
          setGuilds(res.guilds || []);
        });
      }
    }
  }, [currentTab, bots]);

  const canManage =
    session?.role === "SUPER_ADMIN" || session?.role === "GUILD_ADMIN";

  // Bot actions
  const handleStartBot = async (id: string) => {
    await api.startBot(id);
    const updated = await api.getBots();
    setBots(updated.bots);
  };

  const handleStopBot = async (id: string) => {
    await api.stopBot(id);
    const updated = await api.getBots();
    setBots(updated.bots);
  };

  const handleRestartBot = async (id: string) => {
    await api.restartBot(id);
    const updated = await api.getBots();
    setBots(updated.bots);
  };

  const handleUnregisterBot = async (id: string) => {
    await api.unregisterBot(id);
    const updated = await api.getBots();
    setBots(updated.bots);
  };

  const handleRegisterBot = async (botData: Record<string, unknown>) => {
    await api.registerBot(botData);
    const updated = await api.getBots();
    setBots(updated.bots);
  };

  const handleReloadConfig = async () => {
    await api.reloadConfig();
    const configRes = await api.getConfig();
    setConfig(configRes.config);
  };

  const handleLogout = async () => {
    await api.logout();
    setSession(null);
  };

  const handleLogin = async () => {
    try {
      const res = await api.getLoginUrl();
      window.location.href = res.authUrl;
    } catch (err) {
      console.error("Login failed:", err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-discord-darkest flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-discord-blurple border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-semibold text-discord-muted">
            Loading Discord Bot Management Platform...
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-discord-darkest flex flex-col">
      <Header
        session={session}
        onLogout={handleLogout}
        onLogin={handleLogin}
      />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar currentTab={currentTab} onSelectTab={setCurrentTab} />

        <main className="flex-1 p-8 overflow-y-auto max-w-7xl mx-auto w-full space-y-8">
          {/* TAB 1: DASHBOARD */}
          {currentTab === "dashboard" && (
            <div className="space-y-8">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-black text-white tracking-tight">
                    System Overview
                  </h2>
                  <p className="text-xs text-discord-muted">
                    Real-time Discord Gateway telemetry, bot lifecycles & memory consumption
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  {canManage && (
                    <button
                      onClick={() => setIsRegisterModalOpen(true)}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-discord-blurple text-white text-xs font-bold hover:bg-discord-blurple-hover transition-colors shadow-lg shadow-discord-blurple/25"
                    >
                      <Plus className="w-4 h-4" />
                      Register Bot
                    </button>
                  )}
                </div>
              </div>

              {/* KPI Stat Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <StatCard
                  label="Active Bots"
                  value={`${stats?.onlineBots || 0} / ${stats?.totalBots || bots.length}`}
                  subtext={`${bots.filter((b) => b.status === "STOPPED").length} stopped`}
                  icon={Bot}
                  variant="blurple"
                />
                <StatCard
                  label="Total Guilds"
                  value={stats?.totalGuilds || 0}
                  subtext="Connected Discord servers"
                  icon={Server}
                  variant="green"
                />
                <StatCard
                  label="Avg Gateway Ping"
                  value={stats?.avgGatewayPingMs ? `${stats.avgGatewayPingMs}ms` : "N/A"}
                  subtext="WebSocket latency"
                  icon={Wifi}
                  variant="yellow"
                />
                <StatCard
                  label="Heap Memory"
                  value={
                    stats?.process.heapUsedBytes
                      ? `${Math.round(stats.process.heapUsedBytes / 1024 / 1024)} MB`
                      : "0 MB"
                  }
                  subtext={`Uptime: ${Math.floor((stats?.process.uptimeSeconds || 0) / 60)}m`}
                  icon={Cpu}
                  variant="red"
                />
              </div>

              {/* Registered Bot Cards Grid */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <Bot className="w-4 h-4 text-discord-blurple" />
                    Registered Bot Instances ({bots.length})
                  </h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {bots.map((bot) => (
                    <BotCard
                      key={bot.id}
                      bot={bot}
                      onStart={handleStartBot}
                      onStop={handleStopBot}
                      onRestart={handleRestartBot}
                      onUnregister={handleUnregisterBot}
                      canManage={canManage}
                    />
                  ))}
                </div>
              </div>

              {/* Live SSE Stream */}
              <LiveEventStream events={events} />
            </div>
          )}

          {/* TAB 2: BOT REGISTRY */}
          {currentTab === "bots" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-black text-white tracking-tight">
                    Bot Registry & Lifecycle
                  </h2>
                  <p className="text-xs text-discord-muted">
                    Manage active instances, token credentials, and runtime parameters
                  </p>
                </div>

                {canManage && (
                  <button
                    onClick={() => setIsRegisterModalOpen(true)}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-discord-blurple text-white text-xs font-bold hover:bg-discord-blurple-hover transition-colors shadow-lg shadow-discord-blurple/25"
                  >
                    <Plus className="w-4 h-4" />
                    Register New Bot
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {bots.map((bot) => (
                  <BotCard
                    key={bot.id}
                    bot={bot}
                    onStart={handleStartBot}
                    onStop={handleStopBot}
                    onRestart={handleRestartBot}
                    onUnregister={handleUnregisterBot}
                    canManage={canManage}
                  />
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: CONFIG EDITOR */}
          {currentTab === "config" && (
            <ConfigEditor config={config} onReload={handleReloadConfig} />
          )}

          {/* TAB 4: GUILDS & COMMANDS */}
          {currentTab === "guilds" && (
            <GuildsExplorer
              guilds={guilds}
              botId={bots[0]?.id || "chatBot"}
              onDeployCommand={async (botId, guildId) => {
                await api.deployGuildCommands(botId, guildId);
              }}
              onDeployAll={async (botId) => {
                await api.deployAllCommands(botId);
              }}
              canManage={canManage}
            />
          )}

          {/* TAB 5: MEMORY INSPECTOR */}
          {currentTab === "memory" && (
            <MemoryInspector
              onFetchHistory={async (botId, channelId) => {
                const res = await api.getChannelHistory(botId, channelId);
                return res.history || [];
              }}
              onClearHistory={async (botId, channelId) => {
                await api.clearChannelHistory(botId, channelId);
              }}
              onClearAll={async () => {
                await api.clearAllHistory();
              }}
              canManage={canManage}
            />
          )}

          {/* TAB 6: LOGS */}
          {currentTab === "logs" && <LiveEventStream events={events} />}
        </main>
      </div>

      <BotRegistrationModal
        isOpen={isRegisterModalOpen}
        onClose={() => setIsRegisterModalOpen(false)}
        onSubmit={handleRegisterBot}
      />
    </div>
  );
};
