/**
 * Outbound Jitter Buffer and Audio Stream for Discord AudioPlayer playback.
 * Buffers 24kHz PCM chunks, upsamples to 48kHz stereo, and provides instant purge capability for barge-in.
 */

import { Readable } from "node:stream";
import {
  AUDIO_FRAME_MS,
  DEFAULT_JITTER_BUFFER_MS,
  DISCORD_FRAME_BYTES,
} from "../constants";
import { interpolateMono24kToStereo48k } from "./audio-resampler";

export interface JitterBufferOptions {
  /** Jitter pre-buffer duration in milliseconds before starting playback */
  readonly preBufferMs?: number;
}

/**
 * Readable stream feeding 48kHz stereo 16-bit PCM into Discord's AudioPlayer resource.
 */
export class OutboundJitterBuffer extends Readable {
  private readonly preBufferFrames: number;
  private queue: Buffer[] = [];
  private partialRemainder = Buffer.alloc(0);
  private isPreBuffering = true;
  private isPurged = false;
  private isFinished = false;
  private hasEnded = false;

  constructor(options: JitterBufferOptions = {}) {
    super({ highWaterMark: DISCORD_FRAME_BYTES * 10 });
    const preBufferMs = options.preBufferMs ?? DEFAULT_JITTER_BUFFER_MS;
    this.preBufferFrames = Math.max(
      1,
      Math.floor(preBufferMs / AUDIO_FRAME_MS),
    );
  }

  // Readable implementation
  _read(_size: number): void {
    this.drainNextFrame();
  }

  /**
   * Pushes raw 24kHz mono PCM audio received from the AI model into the jitter buffer.
   */
  public pushModelAudio(chunk24kMono: Buffer): void {
    if (
      this.isPurged ||
      this.isEnded() ||
      !chunk24kMono ||
      chunk24kMono.length === 0
    ) {
      return;
    }

    // Upsample 24kHz Mono to 48kHz Stereo PCM
    const stereo48kChunk = interpolateMono24kToStereo48k(chunk24kMono);
    if (stereo48kChunk.length === 0) {
      return;
    }

    // Combine with any previously leftover partial frame
    const combined =
      this.partialRemainder.length > 0
        ? Buffer.concat([this.partialRemainder, stereo48kChunk])
        : stereo48kChunk;

    // Slice into standard 20ms Discord frames (3840 bytes)
    let offset = 0;
    while (offset + DISCORD_FRAME_BYTES <= combined.length) {
      const frame = Buffer.from(
        combined.subarray(offset, offset + DISCORD_FRAME_BYTES),
      );
      this.queue.push(frame);
      offset += DISCORD_FRAME_BYTES;
    }

    // Store remaining unaligned bytes
    this.partialRemainder = Buffer.from(combined.subarray(offset));

    // End pre-buffering once threshold frames are collected
    if (this.isPreBuffering) {
      if (this.queue.length >= this.preBufferFrames) {
        this.isPreBuffering = false;
        this.drainNextFrame();
      }
    } else {
      this.drainNextFrame();
    }
  }

  /**
   * Signals that the current speech turn from the model has ended.
   */
  public finishTurn(): void {
    if (this.isPurged) {
      return;
    }
    this.isPreBuffering = false;
    this.isFinished = true;
    // Pad remainder with silence if any leftover bytes exist
    if (this.partialRemainder.length > 0) {
      const padded = Buffer.alloc(DISCORD_FRAME_BYTES, 0);
      this.partialRemainder.copy(padded);
      this.queue.push(padded);
      this.partialRemainder = Buffer.alloc(0);
    }
    this.drainNextFrame();
  }

  /**
   * Instantly purges all queued and remaining audio buffers (<1ms).
   * Used for responsive barge-in interruption.
   */
  public purge(): void {
    this.isPurged = true;
    this.queue = [];
    this.partialRemainder = Buffer.alloc(0);
    this.isPreBuffering = true;
    this.isFinished = false;
    this.hasEnded = false;
    this.emit("purged");
  }

  /**
   * Resets purge state for the next model turn.
   */
  public reset(): void {
    this.isPurged = false;
    this.queue = [];
    this.partialRemainder = Buffer.alloc(0);
    this.isPreBuffering = true;
    this.isFinished = false;
    this.hasEnded = false;
  }

  /**
   * Returns whether this stream has ended (EOF sent), is destroyed, or purged.
   */
  public isEnded(): boolean {
    return this.hasEnded || this.readableEnded || this.destroyed;
  }

  /**
   * Returns current count of queued 20ms frames awaiting playback.
   */
  public getBufferedFrameCount(): number {
    return this.queue.length;
  }

  /**
   * Drains one frame to downstream consumer if not pre-buffering.
   */
  private drainNextFrame(): void {
    if (this.isPreBuffering || this.isPurged) {
      return;
    }

    if (this.queue.length > 0) {
      const frame = this.queue.shift();
      if (frame) {
        this.push(frame);
      }
    } else if (this.isFinished) {
      if (!this.hasEnded) {
        this.hasEnded = true;
        this.push(null);
      }
    }
  }
}
