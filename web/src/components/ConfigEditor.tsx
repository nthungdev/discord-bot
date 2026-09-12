import React, { useState } from "react";
import { Check, Code, RefreshCw, Save, Sliders } from "lucide-react";

interface ConfigEditorProps {
  config: Record<string, unknown>;
  onReload: () => Promise<void>;
}

export const ConfigEditor: React.FC<ConfigEditorProps> = ({ config, onReload }) => {
  const [jsonMode, setJsonMode] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [copied, setCopied] = useState(false);

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
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight">
            Configuration Management
          </h2>
          <p className="text-xs text-discord-muted">
            Inspect and synchronize Firebase Remote Config & dynamic runtime parameters
          </p>
        </div>

        <div className="flex items-center gap-3">
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
            {reloading ? "Reloading..." : "Reload Remote Config"}
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
                  {String(config.aiModelId || "gemini-2.0-flash")}
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
