/**
 * Type definitions for Voice Companion audio processing and streaming sessions.
 */

import type {
  SupportedGeminiLiveModel,
  SupportedGeminiVoice,
} from "./constants";

export type VoiceParticipationMode =
  | "ambient"
  | "addressed_only"
  | "push_to_talk";

export type VoiceSessionStatus =
  | "IDLE"
  | "CONNECTING"
  | "ACTIVE"
  | "PAUSED"
  | "DISCONNECTED";

export interface AudioFormat {
  readonly sampleRate: number;
  readonly channels: number;
  readonly bitDepth: number;
}

export interface VadOptions {
  /** Normalized RMS energy threshold for speech trigger (0.0 to 1.0) */
  readonly energyThreshold?: number;
  /** Number of consecutive active frames required to open speech gate */
  readonly attackFrames?: number;
  /** Number of silence frames required to close speech gate */
  readonly hangoverFrames?: number;
  /** Normalized RMS energy threshold for instant barge-in cutoff */
  readonly bargeInThreshold?: number;
}

export type VadState = "SILENCE" | "SPEECH";

export interface SpeakerProfile {
  readonly userId: string;
  readonly username: string;
  readonly displayName: string;
  ssrc?: number;
  isOptedOut: boolean;
  isSpeaking: boolean;
  lastSpokeAt: number;
}

export interface VoiceSessionStats {
  readonly guildId: string;
  readonly channelId: string;
  readonly status: VoiceSessionStatus;
  readonly participationMode: VoiceParticipationMode;
  readonly startedAt: number;
  readonly uptimeSeconds: number;
  readonly bargeInCount: number;
  readonly turnsCount: number;
  readonly packetsReceived: number;
  readonly packetsSent: number;
  readonly lastRoundTripLatencyMs: number;
  readonly activeSpeakersCount: number;
}

export interface VoiceCompanionSessionConfig {
  readonly guildId: string;
  readonly channelId: string;
  readonly modelId?: SupportedGeminiLiveModel;
  readonly voiceName?: SupportedGeminiVoice;
  readonly systemInstruction?: string;
  readonly participationMode?: VoiceParticipationMode;
  readonly energyThreshold?: number;
  readonly bargeInSensitivity?: "high" | "normal" | "low";
  readonly inactivityTimeoutMinutes?: number;
  readonly emptyChannelGraceSeconds?: number;
}
