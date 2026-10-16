/**
 * Local Voice Activity Detection (VAD) and Silence Gate.
 * Implements RMS energy thresholding, attack window pre-roll, and hangover smoothing.
 */

import { EventEmitter } from "node:events";
import {
  DEFAULT_BARGE_IN_THRESHOLD,
  DEFAULT_VAD_ATTACK_FRAMES,
  DEFAULT_VAD_ENERGY_THRESHOLD,
  DEFAULT_VAD_HANGOVER_FRAMES,
} from "../constants";
import type { VadOptions, VadState } from "../types";
import {
  calculateRmsEnergy,
  calculateZeroCrossingRate,
} from "./audio-resampler";

export interface VadProcessResult {
  readonly state: VadState;
  readonly isSpeech: boolean;
  readonly rms: number;
  readonly zcr: number;
  /** Audio buffers flushed from pre-roll when gate opens */
  readonly flushedFrames?: Buffer[];
}

/**
 * Energy-based Voice Activity Detector with Attack and Hangover windows.
 */
export class VoiceActivityDetector extends EventEmitter {
  private readonly energyThreshold: number;
  private readonly attackFrames: number;
  private readonly hangoverFrames: number;
  private readonly bargeInThreshold: number;

  private state: VadState = "SILENCE";
  private consecutiveActiveFrames = 0;
  private remainingHangoverFrames = 0;
  private preRollBuffer: Buffer[] = [];

  constructor(options: VadOptions = {}) {
    super();
    this.energyThreshold =
      options.energyThreshold ?? DEFAULT_VAD_ENERGY_THRESHOLD;
    this.attackFrames = options.attackFrames ?? DEFAULT_VAD_ATTACK_FRAMES;
    this.hangoverFrames = options.hangoverFrames ?? DEFAULT_VAD_HANGOVER_FRAMES;
    this.bargeInThreshold =
      options.bargeInThreshold ?? DEFAULT_BARGE_IN_THRESHOLD;
  }

  /**
   * Fast evaluation for instant barge-in detection (<20ms).
   * Checks whether the current 20ms frame has immediate high speech energy.
   */
  public isInstantSpeech(frame: Buffer): boolean {
    if (!frame || frame.length === 0) return false;
    const rms = calculateRmsEnergy(frame);
    return rms >= this.bargeInThreshold;
  }

  /**
   * Processes a single 16kHz mono PCM frame through the VAD state machine.
   */
  public processFrame(frame: Buffer): VadProcessResult {
    if (!frame || frame.length === 0) {
      return { state: this.state, isSpeech: false, rms: 0, zcr: 0 };
    }

    const rms = calculateRmsEnergy(frame);
    const zcr = calculateZeroCrossingRate(frame);
    const isFrameActive = rms >= this.energyThreshold;

    if (this.state === "SILENCE") {
      return this.handleSilenceState(frame, isFrameActive, rms, zcr);
    }

    return this.handleSpeechState(frame, isFrameActive, rms, zcr);
  }

  /**
   * Handles frame processing while in SILENCE state.
   */
  private handleSilenceState(
    frame: Buffer,
    isFrameActive: boolean,
    rms: number,
    zcr: number,
  ): VadProcessResult {
    this.preRollBuffer.push(frame);
    if (this.preRollBuffer.length > this.attackFrames) {
      this.preRollBuffer.shift();
    }

    if (isFrameActive) {
      this.consecutiveActiveFrames++;
      if (this.consecutiveActiveFrames >= this.attackFrames) {
        this.state = "SPEECH";
        this.remainingHangoverFrames = this.hangoverFrames;
        const flushedFrames = [...this.preRollBuffer];
        this.preRollBuffer = [];

        this.emit("speechStart", { rms, zcr });
        return {
          state: "SPEECH",
          isSpeech: true,
          rms,
          zcr,
          flushedFrames,
        };
      }
    } else {
      this.consecutiveActiveFrames = 0;
    }

    return {
      state: "SILENCE",
      isSpeech: false,
      rms,
      zcr,
    };
  }

  /**
   * Handles frame processing while in SPEECH state.
   */
  private handleSpeechState(
    _frame: Buffer,
    isFrameActive: boolean,
    rms: number,
    zcr: number,
  ): VadProcessResult {
    if (isFrameActive) {
      this.remainingHangoverFrames = this.hangoverFrames;
      return {
        state: "SPEECH",
        isSpeech: true,
        rms,
        zcr,
      };
    }

    // Silence frame during active speech - check hangover
    this.remainingHangoverFrames--;
    if (this.remainingHangoverFrames <= 0) {
      this.state = "SILENCE";
      this.consecutiveActiveFrames = 0;
      this.preRollBuffer = [];
      this.emit("speechEnd");
      return {
        state: "SILENCE",
        isSpeech: false,
        rms,
        zcr,
      };
    }

    return {
      state: "SPEECH",
      isSpeech: true,
      rms,
      zcr,
    };
  }

  /**
   * Returns the current state of the VAD.
   */
  public getState(): VadState {
    return this.state;
  }

  /**
   * Resets VAD state and buffers.
   */
  public reset(): void {
    this.state = "SILENCE";
    this.consecutiveActiveFrames = 0;
    this.remainingHangoverFrames = 0;
    this.preRollBuffer = [];
  }
}
