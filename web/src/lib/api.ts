import type {
  ActivityLogEvent,
  BotGuildConfig,
  BotRuntimeMetrics,
  DashboardStats,
  JoinedGuildDetail,
  StoredChatMessage,
  UserSession,
} from "../types";

const API_BASE = "/api/v1";

async function request<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    credentials: "include",
  });

  const data = await res.json();
  if (!res.ok || data.ok === false) {
    throw new Error(data.message || `API request failed with status ${res.status}`);
  }
  return data;
}

export const api = {
  // Auth
  getMe: () => request<{ ok: boolean; session: UserSession }>("/auth/me"),
  getLoginUrl: () => request<{ ok: boolean; authUrl: string }>("/auth/discord/login"),
  logout: () => request<{ ok: boolean }>("/auth/logout", { method: "POST" }),

  // Dashboard
  getStats: () => request<{ ok: boolean; stats: DashboardStats }>("/dashboard/stats"),

  // Guilds & Servers
  getGuilds: () =>
    request<{ ok: boolean; guilds: JoinedGuildDetail[]; inviteUrl: string }>("/guilds"),
  getInviteUrl: () =>
    request<{ ok: boolean; inviteUrl: string }>("/guilds/invite-url"),
  getGuildConfig: (guildId: string) =>
    request<{ ok: boolean; guildId: string; config: BotGuildConfig }>(
      `/guilds/${guildId}/config`,
    ),
  updateGuildConfig: (guildId: string, updates: Partial<BotGuildConfig>) =>
    request<{ ok: boolean; message: string; config: BotGuildConfig }>(
      `/guilds/${guildId}/config`,
      {
        method: "PUT",
        body: JSON.stringify(updates),
      },
    ),
  deployGuildCommands: (guildId: string) =>
    request<{ ok: boolean; message: string }>(
      `/guilds/${guildId}/deploy-commands`,
      { method: "POST" },
    ),

  // Bots
  getBots: () => request<{ ok: boolean; bots: BotRuntimeMetrics[] }>("/bots"),
  getBot: (id: string) => request<{ ok: boolean; bot: BotRuntimeMetrics }>(`/bots/${id}`),
  startBot: (id = "bot") =>
    request<{ ok: boolean }>(`/bots/${id}/start`, { method: "POST" }),
  stopBot: (id = "bot") =>
    request<{ ok: boolean }>(`/bots/${id}/stop`, { method: "POST" }),
  restartBot: (id = "bot") =>
    request<{ ok: boolean }>(`/bots/${id}/restart`, { method: "POST" }),
  deployAllCommands: (id = "bot") =>
    request<{ ok: boolean; message: string }>(
      `/bots/${id}/deploy-commands-all`,
      { method: "POST" },
    ),
  unregisterBot: (id: string) =>
    request<{ ok: boolean }>(`/bots/${id}`, { method: "DELETE" }),
  registerBot: (botData: Record<string, unknown>) =>
    request<{ ok: boolean; bot: BotRuntimeMetrics }>("/bots", {
      method: "POST",
      body: JSON.stringify(botData),
    }),


  // Config
  getConfig: () => request<{ ok: boolean; config: Record<string, unknown> }>("/config"),
  reloadConfig: () => request<{ ok: boolean; message: string }>("/config/reload", { method: "POST" }),

  // Memory
  getChannelHistory: (botId: string, channelId: string) =>
    request<{ ok: boolean; history: StoredChatMessage[] }>(
      `/memory/conversations/${botId}/${channelId}`,
    ),
  clearChannelHistory: (botId: string, channelId: string) =>
    request<{ ok: boolean; message: string }>(
      `/memory/conversations/${botId}/${channelId}`,
      { method: "DELETE" },
    ),
  clearAllHistory: () =>
    request<{ ok: boolean; message: string }>("/memory/conversations", {
      method: "DELETE",
    }),
};

export function subscribeToEvents(callbacks: {
  onInitialState?: (stats: DashboardStats) => void;
  onTelemetryTick?: (stats: DashboardStats) => void;
  onActivityLog?: (event: ActivityLogEvent) => void;
}): () => void {
  const eventSource = new EventSource(`${API_BASE}/dashboard/events`, {
    withCredentials: true,
  });

  eventSource.addEventListener("initial_state", (e) => {
    try {
      const data: DashboardStats = JSON.parse(e.data);
      callbacks.onInitialState?.(data);
    } catch (err) {
      console.error("Error parsing initial_state SSE:", err);
    }
  });

  eventSource.addEventListener("telemetry_tick", (e) => {
    try {
      const data: DashboardStats = JSON.parse(e.data);
      callbacks.onTelemetryTick?.(data);
    } catch (err) {
      console.error("Error parsing telemetry_tick SSE:", err);
    }
  });

  eventSource.addEventListener("activity_log", (e) => {
    try {
      const data: ActivityLogEvent = JSON.parse(e.data);
      callbacks.onActivityLog?.(data);
    } catch (err) {
      console.error("Error parsing activity_log SSE:", err);
    }
  });

  return () => {
    eventSource.close();
  };
}
