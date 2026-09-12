import React from "react";
import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string | number;
  subtext?: string;
  icon: LucideIcon;
  variant?: "blurple" | "green" | "yellow" | "red";
}

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  subtext,
  icon: Icon,
  variant = "blurple",
}) => {
  const variantStyles = {
    blurple: "text-discord-blurple bg-discord-blurple/10 border-discord-blurple/20",
    green: "text-discord-green bg-discord-green/10 border-discord-green/20",
    yellow: "text-discord-yellow bg-discord-yellow/10 border-discord-yellow/20",
    red: "text-discord-red bg-discord-red/10 border-discord-red/20",
  };

  return (
    <div className="glass-card rounded-2xl p-5 relative overflow-hidden transition-all hover:border-white/20">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-discord-muted uppercase tracking-wider">
          {label}
        </span>
        <div className={`p-2.5 rounded-xl border ${variantStyles[variant]}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
      <div className="text-3xl font-extrabold text-white tracking-tight">
        {value}
      </div>
      {subtext && (
        <div className="mt-1 text-xs text-discord-muted flex items-center gap-1.5">
          {subtext}
        </div>
      )}
    </div>
  );
};
