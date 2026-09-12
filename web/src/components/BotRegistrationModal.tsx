import React, { useState } from "react";
import { Bot, Key, Shield, X } from "lucide-react";
import type { BotType } from "../types";

interface BotRegistrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (bot: {
    id: string;
    name: string;
    botType: BotType;
    clientId: string;
    token: string;
    autoStart: boolean;
  }) => Promise<void>;
}

export const BotRegistrationModal: React.FC<BotRegistrationModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
}) => {
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [botType, setBotType] = useState<BotType>("chatBot");
  const [clientId, setClientId] = useState("");
  const [token, setToken] = useState("");
  const [autoStart, setAutoStart] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !name || !clientId || !token) {
      setError("Please fill in all required fields.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await onSubmit({ id, name, botType, clientId, token, autoStart });
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="glass-card bg-discord-dark border border-white/10 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-150">
        <div className="flex items-center justify-between p-5 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-discord-blurple/20 text-discord-blurple">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-bold text-white text-base">Register Bot Instance</h2>
              <p className="text-xs text-discord-muted">
                Add a new Discord bot to the dynamic lifecycle manager
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-discord-muted hover:text-white p-1 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-3 bg-discord-red/10 border border-discord-red/20 rounded-xl text-xs text-discord-red">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-discord-muted mb-1.5">
                Instance ID *
              </label>
              <input
                type="text"
                placeholder="e.g. chatBot-secondary"
                value={id}
                onChange={(e) => setId(e.target.value)}
                className="w-full bg-discord-darkest border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-discord-blurple"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-discord-muted mb-1.5">
                Display Name *
              </label>
              <input
                type="text"
                placeholder="e.g. Chat AI 2"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-discord-darkest border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-discord-blurple"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-discord-muted mb-1.5">
                Bot Type *
              </label>
              <select
                value={botType}
                onChange={(e) => setBotType(e.target.value as BotType)}
                className="w-full bg-discord-darkest border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-discord-blurple"
              >
                <option value="chatBot">ChatBot (GenAI conversational)</option>
                <option value="policeBot">PoliceBot (Moderation)</option>
                <option value="bouncergonBot">BouncergonBot (Voice)</option>
                <option value="custom">Custom Handler</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-discord-muted mb-1.5">
                Discord Client ID *
              </label>
              <input
                type="text"
                placeholder="18-19 digit Snowflake ID"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className="w-full bg-discord-darkest border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-discord-blurple"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-discord-muted mb-1.5 flex items-center gap-1">
              <Key className="w-3.5 h-3.5" />
              Bot Token * (Encrypted with AES-256-GCM at rest)
            </label>
            <input
              type="password"
              placeholder="Paste bot token from Discord Developer Portal"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className="w-full bg-discord-darkest border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-discord-blurple"
            />
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="autoStart"
              checked={autoStart}
              onChange={(e) => setAutoStart(e.target.checked)}
              className="w-4 h-4 rounded bg-discord-darkest border-white/10 text-discord-blurple focus:ring-0"
            />
            <label htmlFor="autoStart" className="text-xs font-medium text-white cursor-pointer">
              Auto-start bot when server initializes
            </label>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-discord-muted hover:text-white hover:bg-discord-darker transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 px-5 py-2 rounded-xl bg-discord-blurple text-white text-xs font-semibold hover:bg-discord-blurple-hover transition-colors disabled:opacity-50 shadow-md shadow-discord-blurple/20"
            >
              <Shield className="w-3.5 h-3.5" />
              {loading ? "Registering..." : "Register Bot"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
