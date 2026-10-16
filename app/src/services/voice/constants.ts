/**
 * Voice Companion audio and lifecycle constants.
 * No magic values in business logic.
 */

// Audio formats and sample rates
export const DISCORD_SAMPLE_RATE = 48000;
export const DISCORD_CHANNELS = 2; // Stereo
export const MODEL_SAMPLE_RATE = 24000;
export const MODEL_CHANNELS = 1; // Mono
export const VAD_SAMPLE_RATE = 16000;
export const VAD_CHANNELS = 1; // Mono
export const BYTES_PER_SAMPLE = 2; // 16-bit PCM

// Frame metrics for 20ms audio slices
export const AUDIO_FRAME_MS = 20;
export const DISCORD_FRAME_SAMPLES = 960; // 48000 * 0.020
export const DISCORD_FRAME_BYTES =
  DISCORD_FRAME_SAMPLES * DISCORD_CHANNELS * BYTES_PER_SAMPLE; // 3840 bytes

export const VAD_FRAME_SAMPLES = 320; // 16000 * 0.020
export const VAD_FRAME_BYTES =
  VAD_FRAME_SAMPLES * VAD_CHANNELS * BYTES_PER_SAMPLE; // 640 bytes

export const MODEL_FRAME_SAMPLES = 480; // 24000 * 0.020
export const MODEL_FRAME_BYTES =
  MODEL_FRAME_SAMPLES * MODEL_CHANNELS * BYTES_PER_SAMPLE; // 960 bytes

// Decimation & Interpolation ratios
export const DECIMATION_RATIO = 3; // 48000 / 16000
export const INTERPOLATION_RATIO = 2; // 48000 / 24000

// PCM 16-bit bounds
export const PCM_INT16_MIN = -32768;
export const PCM_INT16_MAX = 32767;
export const PCM_NORMALIZATION_DIVISOR = 32768.0;

// Voice Activity Detection (VAD) defaults
export const DEFAULT_VAD_ENERGY_THRESHOLD = 0.012; // ~ -38 dBFS
export const DEFAULT_VAD_ATTACK_FRAMES = 3; // 60ms attack window
export const DEFAULT_VAD_HANGOVER_FRAMES = 20; // 400ms hangover window
export const DEFAULT_BARGE_IN_THRESHOLD = 0.02; // RMS threshold for immediate barge-in interruption
export const DEFAULT_BARGE_IN_PURGE_LATENCY_MS = 20; // Purge local audio buffer within <20ms

// Session & Jitter Buffer defaults
export const DEFAULT_JITTER_BUFFER_MS = 60; // 3 frames pre-buffering
export const DEFAULT_EMPTY_CHANNEL_GRACE_SECONDS = 60;
export const DEFAULT_INACTIVITY_TIMEOUT_MINUTES = 15;

// Gemini Live configuration
export const DEFAULT_GEMINI_LIVE_MODEL = "gemini-3.8-live";
export const SUPPORTED_GEMINI_LIVE_MODELS = ["gemini-3.8-live"] as const;
export type SupportedGeminiLiveModel =
  (typeof SUPPORTED_GEMINI_LIVE_MODELS)[number];

export const DEFAULT_VOICE_NAME = "Aoede";
export const SUPPORTED_GEMINI_VOICES = [
  "Puck",
  "Charon",
  "Kore",
  "Fenrir",
  "Aoede",
] as const;

export type SupportedGeminiVoice = (typeof SUPPORTED_GEMINI_VOICES)[number];
