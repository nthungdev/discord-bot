import React, { useState } from "react";
import {
  Check,
  Clock,
  Code,
  ExternalLink,
  RefreshCw,
  Save,
  Sliders,
} from "lucide-react";
import type { ConfigSource } from "../types";

interface ConfigEditorProps {
  config: Record<string, unknown>;
  source?: ConfigSource;
  lastFetchedAt?: number;
  directusUrl?: string | null;
  onReload: () => Promise<void>;
}

const SOURCE_BADGE_META: Record<
  ConfigSource,
  { label: string; badgeClass: string }
> = {
  directus: {
    label: "Directus",
    badgeClass:
      "bg-discord-green/10 text-discord-green border border-discord-green/30",
  },
  "remote-config": {
    label: "Remote Config",
    badgeClass:
      "bg-discord-yellow/10 text-discord-yellow border border-discord-yellow/30",
  },
  local: {
    label: "Local",
    badgeClass:
      "bg-discord-muted/10 text-discord-muted border border-white/10",
  },
};

function getSafeDirectusUrl(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) {
    return null;
  }
  try {
    const parsed = new URL(rawUrl);
    if (parsed.username || parsed.password) {
      return null;
    }
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? rawUrl
      : null;
  } catch {
    return null;
  }
}

function formatLastSynced(lastFetchedAt: number | undefined): string {
  if (!lastFetchedAt || lastFetchedAt <= 0) {
    return "Not synced yet";
  }
  return new Date(lastFetchedAt).toLocaleString();
}

export const ConfigEditor: React.FC<ConfigEditorProps> = ({
  config,
  source = "remote-config",
  lastFetchedAt = 0,
  directusUrl = null,
  onReload,
}) => {
  const [jsonMode, setJsonMode] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [copied, setCopied] = useState(false);

  const sourceMeta = SOURCE_BADGE_META[source] ?? SOURCE_BADGE_META.local;
  const safeDirectusUrl = getSafeDirectusUrl(directusUrl);

  const handleReload = async () => {
    setReloading(true);
    try {
      await onReload();
    } finally {
      setReloading(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(JSON.stringify(config, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="text-xl font-bold text-white tracking-tight">
              Configuration Management
            </h2>
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${sourceMeta.badgeClass}`}
            >
              {sourceMeta.label}
            </span>
          </div>
          <p className="text-xs text-discord-muted">
            Inspect and synchronize Directus control plane &amp; dynamic runtime parameters
          </p>
          <div className="flex items-center gap-1.5 text-[11px] text-discord-muted">
            <Clock className="w-3 h-3" />
            <span>Last synced: {formatLastSynced(lastFetchedAt)}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {safeDirectusUrl && (
            <a
              href={safeDirectusUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-discord-dark text-white border border-white/10 hover:bg-discord-darker text-xs font-semibold transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5 text-discord-green" />
              Directus Admin UI
            </a>
          )}

          <button
            onClick={() => setJsonMode(!jsonMode)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all ${
              jsonMode
                ? "bg-discord-blurple text-white border-discord-blurple"
                : "bg-discord-dark text-discord-muted border-white/10 hover:text-white"
            }`}
          >
            <Code className="w-3.5 h-3.5" />
            {jsonMode ? "Visual View" : "Raw JSON"}
          </button>

          <button
            onClick={handleReload}
            disabled={reloading}
            className="flex items-center gap-2 px-4 py-1.5 rounded-xl bg-discord-blurple text-white text-xs font-semibold hover:bg-discord-blurple-hover transition-colors disabled:opacity-50 shadow-md shadow-discord-blurple/20"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${reloading ? "animate-spin" : ""}`} />
            {reloading ? "Reloading..." : "Reload Config"}
          </button>
        </div>
      </div>

      {jsonMode ? (
        <div className="glass-card rounded-2xl p-5 border border-white/10 relative">
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-white/5">
            <span className="text-xs font-semibold text-discord-muted uppercase tracking-wider">
              Active Parameters Payload
            </span>
            <button
              onClick={copyToClipboard}
              className="flex items-center gap-1.5 text-xs text-discord-muted hover:text-white px-2 py-1 rounded bg-discord-darkest border border-white/5"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-discord-green" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  <span>Copy JSON</span>
                </>
              )}
            </button>
          </div>
          <pre className="text-xs font-mono text-discord-text overflow-x-auto p-4 bg-discord-darkest/80 rounded-xl max-h-[600px]">
            {JSON.stringify(config, null, 2)}
          </pre>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* AI Settings Section */}
          <div className="glass-card rounded-2xl p-5 border border-white/10 space-y-4">
            <div className="flex items-center gap-2 text-white font-bold text-sm border-b border-white/5 pb-3">
              <Sliders className="w-4 h-4 text-discord-blurple" />
              GenAI & Model Inference
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex justify-between items-center py-2 border-b border-white/5">
                <span className="text-discord-muted">AI Provider</span>
                <span className="font-semibold text-white bg-discord-darkest px-2.5 py-1 rounded-md border border-white/5">
                  {String(config.aiProvider || "google-genai")}
                </span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-white/5">
                <span className="text-discord-muted">Default AI Model</span>
                <span className="font-semibold text-discord-green bg-discord-darkest px-2.5 py-1 rounded-md border border-white/5">
                  {String(config.aiModelId || "gemini-4-hydrogen")}
                </span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-white/5">
                <span className="text-discord-muted">Max Output Tokens</span>
                <span className="font-semibold text-white bg-discord-darkest px-2.5 py-1 rounded-md border border-white/5">
                  {String(config.aiMaxOutputTokens || 1024)}
                </span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-discord-muted">Conversation History Capacity</span>
                <span className="font-semibold text-white bg-discord-darkest px-2.5 py-1 rounded-md border border-white/5">
                  {String(config.aiMaxConversationHistory || 60)} turns
                </span>
              </div>
            </div>
          </div>

          {/* Storage & Moderation Section */}
          <div className="glass-card rounded-2xl p-5 border border-white/10 space-y-4">
            <div className="flex items-center gap-2 text-white font-bold text-sm border-b border-white/5 pb-3">
              <Sliders className="w-4 h-4 text-discord-yellow" />
              Memory & Persistence
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex justify-between items-center py-2 border-b border-white/5">
                <span className="text-discord-muted">Memory Store Type</span>
                <span className="font-semibold text-white bg-discord-darkest px-2.5 py-1 rounded-md border border-white/5">
                  {String(config.memoryStoreType || "local")}
                </span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-white/5">
                <span className="text-discord-muted">Configured Bot Policies</span>
                <span className="font-semibold text-white bg-discord-darkest px-2.5 py-1 rounded-md border border-white/5">
                  {config.bots ? Object.keys(config.bots as object).length : 0} bots
                </span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-discord-muted">Custom Guild Emojis</span>
                <span className="font-semibold text-white bg-discord-darkest px-2.5 py-1 rounded-md border border-white/5">
                  {config.guildEmojis ? Object.keys(config.guildEmojis as object).length : 0} guilds
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
