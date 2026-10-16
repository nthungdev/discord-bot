/**
 * Discord Voice Companion Session Coordinator.
 * Manages VoiceConnection lifecycle, per-speaker Opus decoding, VAD,
 * Gemini Live bidirectional streaming, jitter buffering, and instant barge-in.
 */

import { EventEmitter } from "node:events";
import type { Readable, Transform } from "node:stream";
import {
  type AudioPlayer,
  AudioPlayerStatus,
  createAudioPlayer,
  createAudioResource,
  EndBehaviorType,
  joinVoiceChannel,
  NoSubscriberBehavior,
  StreamType,
  type VoiceConnection,
  VoiceConnectionStatus,
} from "@discordjs/voice";
import type { BaseGuildVoiceChannel, Guild, GuildMember } from "discord.js";
import prism from "prism-media";
import { decimateStereo48kToMono16k } from "./audio/audio-resampler";
import { OutboundJitterBuffer } from "./audio/jitter-buffer";
import { VoiceActivityDetector } from "./audio/vad";
import {
  DEFAULT_BARGE_IN_THRESHOLD,
  DEFAULT_EMPTY_CHANNEL_GRACE_SECONDS,
  DEFAULT_INACTIVITY_TIMEOUT_MINUTES,
  DEFAULT_JITTER_BUFFER_MS,
} from "./constants";
import { SpeakerTracker } from "./speaker/speaker-tracker";
import { GeminiLiveSession } from "./streaming/gemini-live-session";
import type { IStreamingGenAiSession } from "./streaming/types";
import type {
  VoiceCompanionSessionConfig,
  VoiceParticipationMode,
  VoiceSessionStats,
  VoiceSessionStatus,
} from "./types";

interface ActiveSpeakerStream {
  readonly opusStream: Readable;
  readonly opusDecoder: Transform;
  readonly vad: VoiceActivityDetector;
  readonly turnState: { isAttributedTurn: boolean };
}

function resolveBargeInThreshold(
  sensitivity?: "high" | "normal" | "low",
): number {
  switch (sensitivity) {
    case "high":
      return 0.01;
    case "low":
      return 0.04;
    default:
      return DEFAULT_BARGE_IN_THRESHOLD;
  }
}

export class VoiceSession extends EventEmitter {
  public readonly guildId: string;
  public readonly channelId: string;

  private connection: VoiceConnection | null = null;
  private audioPlayer: AudioPlayer;
  private liveSession: IStreamingGenAiSession;
  private speakerTracker: SpeakerTracker;
  private activeJitterBuffer: OutboundJitterBuffer | null = null;
  private activeSpeakerStreams = new Map<string, ActiveSpeakerStream>();
  private guild: Guild | null = null;
  private channel: BaseGuildVoiceChannel | null = null;

  private status: VoiceSessionStatus = "IDLE";
  private participationMode: VoiceParticipationMode = "ambient";
  private startedAt = 0;
  private bargeInCount = 0;
  private turnsCount = 0;
  private packetsReceived = 0;
  private packetsSent = 0;
  private lastLatencyMs = 0;
  private readonly bargeInThreshold: number;

  private emptyChannelTimer: NodeJS.Timeout | null = null;
  private inactivityTimer: NodeJS.Timeout | null = null;
  private readonly emptyChannelGraceMs: number;
  private readonly inactivityTimeoutMs: number;

  constructor(
    private readonly config: VoiceCompanionSessionConfig,
    injectedSession?: IStreamingGenAiSession,
  ) {
    super();
    this.guildId = config.guildId;
    this.channelId = config.channelId;
    this.participationMode = config.participationMode ?? "ambient";
    this.bargeInThreshold = resolveBargeInThreshold(config.bargeInSensitivity);

    this.emptyChannelGraceMs =
      (config.emptyChannelGraceSeconds ?? DEFAULT_EMPTY_CHANNEL_GRACE_SECONDS) *
      1000;
    this.inactivityTimeoutMs =
      (config.inactivityTimeoutMinutes ?? DEFAULT_INACTIVITY_TIMEOUT_MINUTES) *
      60 *
      1000;

    this.speakerTracker = new SpeakerTracker();
    this.liveSession = injectedSession ?? new GeminiLiveSession();

    this.audioPlayer = createAudioPlayer({
      behaviors: {
        noSubscriber: NoSubscriberBehavior.Play,
      },
    });

    this.setupAudioPlayerEvents();
    this.setupLiveSessionEvents();
  }

  /**
   * Initializes Discord voice connection and starts live streaming session.
   */
  public async start(
    guild: Guild,
    channel: BaseGuildVoiceChannel,
  ): Promise<void> {
    if (this.status === "ACTIVE" || this.status === "CONNECTING") {
      return;
    }

    this.status = "CONNECTING";
    this.startedAt = Date.now();
    this.guild = guild;
    this.channel = channel;

    // Cache current channel members in tracker
    for (const [, member] of channel.members) {
      if (!member.user.bot) {
        this.speakerTracker.registerMember(member);
      }
    }

    try {
      this.connection = joinVoiceChannel({
        channelId: this.channelId,
        guildId: this.guildId,
        adapterCreator: guild.voiceAdapterCreator,
        selfDeaf: false,
        selfMute: false,
      });

      this.connection.subscribe(this.audioPlayer);
      this.setupConnectionEvents();

      // Connect GenAI bidirectional WebSocket session
      await this.liveSession.connect({
        modelId: this.config.modelId,
        voiceName: this.config.voiceName,
        systemInstruction: this.config.systemInstruction,
        toolContext: {
          botId: guild.client.user.id,
          client: guild.client,
          guild,
          channel:
            "isTextBased" in channel &&
            typeof (channel as { isTextBased?: unknown }).isTextBased ===
              "function" &&
            channel.isTextBased()
              ? channel
              : null,
        },
      });

      this.status = "ACTIVE";
      this.resetInactivityTimer();
      this.emit("ready");
    } catch (err: unknown) {
      this.status = "DISCONNECTED";
      const error = err instanceof Error ? err : new Error(String(err));
      console.error(
        `[VoiceSession] Failed to start voice session for guild ${this.guildId}:`,
        error,
      );
      this.destroy();
      throw error;
    }
  }

  /**
   * Registers or updates a guild member in the tracker dynamically.
   */
  public registerMember(member: GuildMember): void {
    this.speakerTracker.registerMember(member);
  }

  /**
   * Subscribes to speaking stream of a Discord voice participant with per-speaker VAD.
   */
  public handleSpeakerStart(userId: string): void {
    if (this.status !== "ACTIVE" || !this.connection) {
      return;
    }

    if (this.speakerTracker.isUserOptedOut(userId)) {
      return;
    }

    // Try registering speaker if not yet tracked
    if (!this.speakerTracker.getSpeakerByUserId(userId)) {
      const member =
        this.channel?.members.get(userId) ??
        this.guild?.members.cache.get(userId);
      if (member && !member.user.bot) {
        this.speakerTracker.registerMember(member);
      }
    }

    this.speakerTracker.setSpeaking(userId, true);

    // Prevent duplicate subscriptions for an already active speaker
    if (this.activeSpeakerStreams.has(userId)) {
      return;
    }

    const vad = new VoiceActivityDetector({
      energyThreshold: this.config.energyThreshold,
      bargeInThreshold: this.bargeInThreshold,
    });

    const turnState = { isAttributedTurn: false };

    vad.on("speechEnd", () => {
      turnState.isAttributedTurn = false;
    });

    const receiver = this.connection.receiver;
    const opusStream = receiver.subscribe(userId, {
      end: {
        behavior: EndBehaviorType.AfterSilence,
        duration: 100,
      },
    });

    const opusDecoder = new prism.opus.Decoder({
      frameSize: 960,
      channels: 2,
      rate: 48000,
    });

    opusStream.pipe(opusDecoder);

    const activeStream: ActiveSpeakerStream = {
      opusStream,
      opusDecoder,
      vad,
      turnState,
    };
    this.activeSpeakerStreams.set(userId, activeStream);

    opusDecoder.on("data", (pcm48kStereo: Buffer) => {
      this.handleDecodedFrame(pcm48kStereo, userId, vad, turnState);
    });

    const cleanup = () => {
      this.cleanupSpeakerStream(userId);
    };

    opusStream.once("end", cleanup);
    opusStream.once("close", cleanup);
    opusDecoder.once("error", (err) => {
      console.warn(
        `[VoiceSession] Opus decoder error for user ${userId}:`,
        err,
      );
      cleanup();
    });
  }

  /**
   * Cleans up decoder and subscriptions for a speaker when they stop speaking.
   */
  private cleanupSpeakerStream(userId: string): void {
    const stream = this.activeSpeakerStreams.get(userId);
    if (!stream) return;

    this.activeSpeakerStreams.delete(userId);
    this.speakerTracker.setSpeaking(userId, false);

    try {
      stream.opusDecoder.destroy();
    } catch {
      // ignore
    }
    try {
      stream.opusStream.destroy();
    } catch {
      // ignore
    }
  }

  /**
   * Instantly purges local audio buffer and alerts model upon human barge-in (<20ms).
   */
  public triggerInstantBargeIn(speakerUserId?: string): void {
    const startTime = Date.now();
    this.audioPlayer.stop(true);
    if (this.activeJitterBuffer) {
      this.activeJitterBuffer.purge();
      this.activeJitterBuffer = null;
    }
    this.bargeInCount++;

    const latency = Date.now() - startTime;
    this.lastLatencyMs = latency;
    console.info(
      `[VoiceSession] Instant barge-in triggered by ${speakerUserId ?? "user"} in ${latency}ms`,
    );

    this.liveSession.sendClientContent(
      [
        {
          role: "user",
          parts: [{ text: "[Interrupted by speaker]" }],
        },
      ],
      false,
    );
  }

  /**
   * Evaluates channel member count changes to manage auto-leave grace period.
   */
  public onMemberCountChanged(humanCount: number): void {
    if (humanCount === 0) {
      if (!this.emptyChannelTimer) {
        console.info(
          `[VoiceSession] Voice channel is empty. Starting ${this.emptyChannelGraceMs / 1000}s auto-leave grace timer.`,
        );
        this.emptyChannelTimer = setTimeout(() => {
          console.info(
            `[VoiceSession] Auto-leaving empty channel in guild ${this.guildId}.`,
          );
          this.destroy();
        }, this.emptyChannelGraceMs);
      }
    } else {
      if (this.emptyChannelTimer) {
        clearTimeout(this.emptyChannelTimer);
        this.emptyChannelTimer = null;
        console.info(
          "[VoiceSession] Human rejoined channel. Cancelled auto-leave grace timer.",
        );
      }
    }
  }

  /**
   * Pauses voice processing and audio responses.
   */
  public pause(): void {
    this.status = "PAUSED";
    this.audioPlayer.pause();
    if (this.activeJitterBuffer) {
      this.activeJitterBuffer.purge();
      this.activeJitterBuffer = null;
    }
    this.emit("paused");
  }

  /**
   * Resumes active voice processing.
   */
  public resume(): void {
    this.status = "ACTIVE";
    this.audioPlayer.unpause();
    this.emit("resumed");
  }

  /**
   * Sets user opt-out status for privacy protection.
   */
  public setOptOut(userId: string, optOut: boolean): void {
    this.speakerTracker.setOptOut(userId, optOut);
  }

  /**
   * Returns current active jitter buffer for inspection.
   */
  public getJitterBuffer(): OutboundJitterBuffer | null {
    return this.activeJitterBuffer;
  }

  /**
   * Returns telemetry snapshot for status command and observability.
   */
  public getStats(): VoiceSessionStats {
    const uptimeSeconds =
      this.startedAt > 0 ? Math.floor((Date.now() - this.startedAt) / 1000) : 0;

    return {
      guildId: this.guildId,
      channelId: this.channelId,
      status: this.status,
      participationMode: this.participationMode,
      startedAt: this.startedAt,
      uptimeSeconds,
      bargeInCount: this.bargeInCount,
      turnsCount: this.turnsCount,
      packetsReceived: this.packetsReceived,
      packetsSent: this.packetsSent,
      lastRoundTripLatencyMs: this.lastLatencyMs,
      activeSpeakersCount: this.speakerTracker.getAllSpeakers().length,
    };
  }

  /**
   * Gracefully tears down connection, streaming sessions, and cleans up resources.
   */
  public destroy(): void {
    this.status = "DISCONNECTED";

    if (this.emptyChannelTimer) {
      clearTimeout(this.emptyChannelTimer);
      this.emptyChannelTimer = null;
    }
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
      this.inactivityTimer = null;
    }

    for (const userId of Array.from(this.activeSpeakerStreams.keys())) {
      this.cleanupSpeakerStream(userId);
    }
    this.activeSpeakerStreams.clear();

    this.audioPlayer.stop(true);
    if (this.activeJitterBuffer) {
      this.activeJitterBuffer.purge();
      this.activeJitterBuffer = null;
    }
    this.speakerTracker.clear();

    void this.liveSession.close();

    if (this.connection) {
      try {
        this.connection.destroy();
      } catch (err) {
        console.warn("[VoiceSession] Error destroying connection:", err);
      }
      this.connection = null;
    }

    this.emit("destroyed");
  }

  private setupAudioPlayerEvents(): void {
    this.audioPlayer.on(AudioPlayerStatus.Idle, () => {
      if (this.activeJitterBuffer) {
        this.activeJitterBuffer = null;
      }
    });

    this.audioPlayer.on("error", (error) => {
      console.error("[VoiceSession] AudioPlayer error:", error);
    });
  }

  private setupLiveSessionEvents(): void {
    this.liveSession.on("audio", (pcm24kMono: Buffer) => {
      if (this.status !== "ACTIVE") return;

      if (
        !this.activeJitterBuffer ||
        this.activeJitterBuffer.destroyed ||
        this.audioPlayer.state.status === AudioPlayerStatus.Idle
      ) {
        this.activeJitterBuffer = new OutboundJitterBuffer({
          preBufferMs: DEFAULT_JITTER_BUFFER_MS,
        });

        const resource = createAudioResource(this.activeJitterBuffer, {
          inputType: StreamType.Raw,
        });
        this.audioPlayer.play(resource);
      }

      this.activeJitterBuffer.pushModelAudio(pcm24kMono);
    });

    this.liveSession.on("turnComplete", () => {
      this.turnsCount++;
      if (this.activeJitterBuffer) {
        this.activeJitterBuffer.finishTurn();
      }
    });

    this.liveSession.on("interrupted", () => {
      this.audioPlayer.stop(true);
      if (this.activeJitterBuffer) {
        this.activeJitterBuffer.purge();
        this.activeJitterBuffer = null;
      }
      this.bargeInCount++;
    });

    this.liveSession.on("error", (err: Error) => {
      console.error("[VoiceSession] Streaming GenAI session error:", err);
    });

    this.liveSession.on("close", () => {
      console.info("[VoiceSession] Streaming GenAI session disconnected.");
    });
  }

  private setupConnectionEvents(): void {
    if (!this.connection) return;

    this.connection.on(VoiceConnectionStatus.Ready, () => {
      console.info(
        `[VoiceSession] VoiceConnection ready for guild ${this.guildId}`,
      );
    });

    this.connection.on(VoiceConnectionStatus.Disconnected, async () => {
      console.warn(
        `[VoiceSession] VoiceConnection disconnected in guild ${this.guildId}. Cleaning up.`,
      );
      this.destroy();
    });

    this.connection.receiver.speaking.on("start", (userId: string) => {
      this.handleSpeakerStart(userId);
    });
  }

  private handleDecodedFrame(
    pcm48kStereo: Buffer,
    userId: string,
    vad: VoiceActivityDetector,
    turnState: { isAttributedTurn: boolean },
  ): void {
    if (this.status !== "ACTIVE") return;

    this.packetsReceived++;
    this.resetInactivityTimer();

    const pcm16kMono = decimateStereo48kToMono16k(pcm48kStereo);
    if (pcm16kMono.length === 0) return;

    // Instant barge-in: If bot is currently playing audio and human speech energy detected
    if (
      this.audioPlayer.state.status === AudioPlayerStatus.Playing &&
      vad.isInstantSpeech(pcm16kMono)
    ) {
      this.triggerInstantBargeIn(userId);
    }

    const vadResult = vad.processFrame(pcm16kMono);
    if (!vadResult.isSpeech) return;

    if (!turnState.isAttributedTurn) {
      turnState.isAttributedTurn = true;
      this.attributeSpeakerTurn(userId);
    }

    this.forwardActiveSpeech(pcm16kMono, vadResult.flushedFrames);
  }

  private attributeSpeakerTurn(userId: string): void {
    const speakerTag = this.speakerTracker.formatSpeakerTag(userId);
    this.liveSession.sendClientContent(
      [
        {
          role: "user",
          parts: [{ text: speakerTag }],
        },
      ],
      false,
    );
  }

  private forwardActiveSpeech(
    pcm16kMono: Buffer,
    flushedFrames?: Buffer[],
  ): void {
    if (flushedFrames && flushedFrames.length > 0) {
      for (const flushed of flushedFrames) {
        this.liveSession.sendAudioChunk(flushed);
        this.packetsSent++;
      }
      return;
    }

    this.liveSession.sendAudioChunk(pcm16kMono);
    this.packetsSent++;
  }

  private resetInactivityTimer(): void {
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
    }

    this.inactivityTimer = setTimeout(() => {
      console.info(
        `[VoiceSession] Inactivity timeout reached (${this.inactivityTimeoutMs / 60000}m) in guild ${this.guildId}. Auto-leaving.`,
      );
      this.destroy();
    }, this.inactivityTimeoutMs);
  }
}
