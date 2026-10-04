export type SupportedRoastLocale = "vi" | "en-US";

export enum RoastIntensity {
  Mild = "mild",
  Medium = "medium",
  Savage = "savage",
}

export enum CommandRoastOption {
  Target = "target",
  Intensity = "intensity",
  Topic = "topic",
  Ephemeral = "ephemeral",
}

export enum CommandRoastOptionVi {
  Target = "muc-tieu",
  Intensity = "muc-do",
  Topic = "chu-de",
  Ephemeral = "rieng-tu",
}

export interface RoastTargetActor {
  id: string;
  username: string;
  displayName: string;
  nickname?: string | null;
  joinedAt?: Date | null;
  roles: string[];
  activity?: string | null;
}

export interface RoastCallerActor {
  id: string;
  username: string;
  displayName: string;
}

export interface RoastRequest {
  guildId: string;
  channelId: string;
  locale: SupportedRoastLocale;
  caller: RoastCallerActor;
  target: RoastTargetActor;
  intensity: RoastIntensity;
  topic?: string | null;
  isCounterRoast?: boolean;
  chainDepth?: number;
}

export interface RoastResult {
  content: string;
  locale: SupportedRoastLocale;
  targetId: string;
  callerId: string;
  intensity: RoastIntensity;
  topic?: string | null;
  isCounterRoast: boolean;
  chainDepth: number;
}

export interface RoastReactionRecord {
  burnCount: number;
  laughCount: number;
  burnReactors: Set<string>;
  laughReactors: Set<string>;
  callerId: string;
  targetId: string;
  intensity: RoastIntensity;
  locale: SupportedRoastLocale;
  topic?: string | null;
  chainDepth: number;
}

export type PreflightCheckResult =
  | { allowed: true }
  | {
      allowed: false;
      reasonKey:
        | "target_opted_out"
        | "target_shielded"
        | "caller_cooldown"
        | "channel_disabled"
        | "feature_disabled";
      remainingSeconds?: number;
      targetName?: string;
    };

export const ROAST_BUTTON_PREFIX_BURN = "roast:burn";
export const ROAST_BUTTON_PREFIX_LAUGH = "roast:laugh";
export const ROAST_BUTTON_PREFIX_COUNTER = "roast:counter";

export const DEFAULT_CALLER_COOLDOWN_SECONDS = 60;
export const DEFAULT_TARGET_SHIELD_SECONDS = 300;
export const MAX_COUNTER_ROAST_CHAIN_DEPTH = 2;
export const MAX_RECENT_CHANNEL_MESSAGES_FETCH = 20;
export const MAX_TARGET_MESSAGES_SAMPLE = 5;
export const MAX_TARGET_MESSAGE_LENGTH = 150;
