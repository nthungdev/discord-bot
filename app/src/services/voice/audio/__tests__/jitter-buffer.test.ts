import { describe, expect, it, vi } from "vitest";
import { MODEL_FRAME_BYTES } from "../../constants";
import { OutboundJitterBuffer } from "../jitter-buffer";

describe("OutboundJitterBuffer", () => {
  it("should pre-buffer frames before starting to stream", () => {
    // 3 frames pre-buffer by default (60ms)
    const jitter = new OutboundJitterBuffer({ preBufferMs: 60 });
    const chunk24k = Buffer.alloc(MODEL_FRAME_BYTES, 10); // 20ms model audio

    // Push 1 frame
    jitter.pushModelAudio(chunk24k);
    expect(jitter.getBufferedFrameCount()).toBe(1);
    expect(jitter.read()).toBeNull(); // Still pre-buffering

    // Push 2nd frame
    jitter.pushModelAudio(chunk24k);
    expect(jitter.getBufferedFrameCount()).toBe(2);
    expect(jitter.read()).toBeNull();

    // Push 3rd frame (threshold reached)
    jitter.pushModelAudio(chunk24k);
    const readFrame = jitter.read();
    expect(readFrame).not.toBeNull();
    expect(readFrame?.length).toBe(3840); // 20ms of 48kHz stereo
  });

  it("should immediately purge all buffers and emit purged event", () => {
    const jitter = new OutboundJitterBuffer();
    const purgedListener = vi.fn();
    jitter.on("purged", purgedListener);

    jitter.pushModelAudio(Buffer.alloc(MODEL_FRAME_BYTES * 4, 10));
    expect(jitter.getBufferedFrameCount()).toBeGreaterThan(0);

    // Trigger barge-in purge
    jitter.purge();
    expect(jitter.getBufferedFrameCount()).toBe(0);
    expect(purgedListener).toHaveBeenCalledTimes(1);

    // Subsequent pushes while purged should be ignored
    jitter.pushModelAudio(Buffer.alloc(MODEL_FRAME_BYTES, 10));
    expect(jitter.getBufferedFrameCount()).toBe(0);

    // Reset allows new turn
    jitter.reset();
    jitter.pushModelAudio(Buffer.alloc(MODEL_FRAME_BYTES, 10));
    expect(jitter.getBufferedFrameCount()).toBe(1);
  });

  it("should flush remaining frames on finishTurn", () => {
    const jitter = new OutboundJitterBuffer({ preBufferMs: 100 });
    const chunk24k = Buffer.alloc(MODEL_FRAME_BYTES, 10);

    jitter.pushModelAudio(chunk24k);
    // Not enough frames to meet 100ms preBuffer, but turn completes
    jitter.finishTurn();

    const readFrame = jitter.read();
    expect(readFrame).not.toBeNull();
  });

  it("should continue draining frames that arrive after pre-buffer is exhausted", () => {
    const jitter = new OutboundJitterBuffer({ preBufferMs: 60 });
    const chunk24k = Buffer.alloc(MODEL_FRAME_BYTES, 10);

    // Fill and exhaust pre-buffer
    jitter.pushModelAudio(chunk24k);
    jitter.pushModelAudio(chunk24k);
    jitter.pushModelAudio(chunk24k);

    expect(jitter.read()).not.toBeNull();
    expect(jitter.read()).not.toBeNull();
    expect(jitter.read()).not.toBeNull();
    expect(jitter.read()).toBeNull(); // Empty

    // Push subsequent frame while not pre-buffering
    jitter.pushModelAudio(chunk24k);
    const subsequentFrame = jitter.read();
    expect(subsequentFrame).not.toBeNull();
    expect(subsequentFrame?.length).toBe(3840);
  });

  it("should emit EOF (null) when turn completes and all frames are consumed", async () => {
    const jitter = new OutboundJitterBuffer({ preBufferMs: 20 });
    const chunk24k = Buffer.alloc(MODEL_FRAME_BYTES, 10);

    const endPromise = new Promise<void>((resolve) => {
      jitter.on("end", resolve);
    });

    jitter.pushModelAudio(chunk24k);
    jitter.finishTurn();

    // Consume the single frame
    expect(jitter.read()).not.toBeNull();
    // Next read signals EOF
    expect(jitter.read()).toBeNull();

    await endPromise;
    expect(jitter.readableEnded).toBe(true);
  });
});
