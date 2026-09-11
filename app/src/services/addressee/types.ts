import type { Message } from "discord.js";
import type { BotGuildConfig } from "../../config/types";

export type ResolutionTier =
  | "tier1_deterministic"
  | "tier2_classifier"
  | "rejected";

export type AddresseeDecision = "respond" | "ignore" | "classify_ambient";

export type AddresseeReason =
  | "bot_author"
  | "channel_opt_out"
  | "channel_silenced"
  | "addressed_to_other"
  | "command_prefix"
  | "bot_thread"
  | "explicit_mention"
  | "direct_reply"
  | "vocative_name"
  | "active_session"
  | "reply_channel_whitelist"
  | "ambient_candidate";

export interface AddresseeResult {
  decision: AddresseeDecision;
  tier: ResolutionTier;
  reason: AddresseeReason;
  confidence: number;
  targetUser?: string;
}

export interface AddresseeEvaluationContext {
  message: Message<boolean>;
  botUserId: string;
  botName?: string;
  guildConfig?: BotGuildConfig;
  refMessage?: Message<boolean> | null;
  activeSessionTimestamp?: number;
  channelSilencedUntil?: number;
  now?: number;
}
