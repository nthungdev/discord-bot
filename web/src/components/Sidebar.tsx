import React from "react";
import {
  Activity,
  Bot,
  Database,
  Radio,
  Sliders,
  Users,
} from "lucide-react";

export type NavTab = "dashboard" | "bots" | "config" | "guilds" | "memory" | "logs";

interface SidebarProps {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentTab, onSelectTab }) => {
  const navItems = [
    { id: "dashboard" as const, label: "Dashboard", icon: Activity },
    { id: "bots" as const, label: "Bot Registry", icon: Bot },
    { id: "config" as const, label: "Config Editor", icon: Sliders },
    { id: "guilds" as const, label: "Guilds & Commands", icon: Users },
    { id: "memory" as const, label: "Memory Inspector", icon: Database },
    { id: "logs" as const, label: "Live SSE Events", icon: Radio },
  ];

  return (
    <aside className="w-64 border-r border-discord-darker bg-discord-darkest/95 p-4 flex flex-col justify-between shrink-0">
      <nav className="space-y-1.5">
        <div className="px-3 pb-2 text-[11px] font-bold uppercase tracking-wider text-discord-muted">
          Navigation
        </div>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? "bg-discord-blurple text-white shadow-md shadow-discord-blurple/25"
                  : "text-discord-muted hover:bg-discord-darker hover:text-discord-text"
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? "text-white" : "text-discord-muted"}`} />
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="p-3 bg-discord-darker/60 rounded-xl border border-white/5 text-xs text-discord-muted">
        <div className="flex items-center gap-2 mb-1 text-discord-green font-semibold">
          <span className="w-2 h-2 rounded-full bg-discord-green animate-pulse" />
          Gateway Connected
        </div>
        <div>v0.2.0 • Node.js 22</div>
      </div>
    </aside>
  );
};
