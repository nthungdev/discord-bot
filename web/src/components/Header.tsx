import React from "react";
import { Bot, LogIn, LogOut, Shield } from "lucide-react";
import type { UserSession } from "../types";

interface HeaderProps {
  session: UserSession | null;
  onLogout: () => void;
  onLogin: () => void;
}

export const Header: React.FC<HeaderProps> = ({ session, onLogout, onLogin }) => {
  return (
    <header className="h-16 border-b border-discord-darker bg-discord-darkest px-6 flex items-center justify-between sticky top-0 z-40">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-discord-blurple flex items-center justify-center shadow-lg shadow-discord-blurple/20">
          <Bot className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="font-bold text-lg leading-tight tracking-wide text-white">
            Discord Bot Admin
          </h1>
          <p className="text-xs text-discord-muted">
            Management & Telemetry Engine
          </p>
        </div>
      </div>

      <div className="flex items-center gap-4">
        {session ? (
          <div className="flex items-center gap-3 bg-discord-darker py-1.5 px-3 rounded-full border border-white/5">
            {session.user.avatar ? (
              <img
                src={`https://cdn.discordapp.com/avatars/${session.user.id}/${session.user.avatar}.png`}
                alt="Avatar"
                className="w-7 h-7 rounded-full"
              />
            ) : (
              <div className="w-7 h-7 rounded-full bg-discord-blurple flex items-center justify-center text-xs font-bold">
                {session.user.username[0]?.toUpperCase()}
              </div>
            )}
            <div className="flex flex-col">
              <span className="text-xs font-semibold text-white leading-tight">
                {session.user.globalName || session.user.username}
              </span>
              <span className="text-[10px] text-discord-green font-medium flex items-center gap-1">
                <Shield className="w-2.5 h-2.5" />
                {session.role}
              </span>
            </div>
            <button
              onClick={onLogout}
              className="ml-2 text-discord-muted hover:text-discord-red transition-colors p-1"
              title="Logout"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button
            onClick={onLogin}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-discord-blurple text-white text-xs font-semibold hover:bg-discord-blurple-hover transition-colors shadow-md shadow-discord-blurple/20"
          >
            <LogIn className="w-3.5 h-3.5" />
            Discord Login
          </button>
        )}
      </div>
    </header>
  );
};
