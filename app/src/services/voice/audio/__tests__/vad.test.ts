import { describe, expect, it, vi } from "vitest";
import { VAD_FRAME_BYTES } from "../../constants";
import { VoiceActivityDetector } from "../vad";

describe("VoiceActivityDetector", () => {
  const createFrame = (amplitude: number): Buffer => {
    const buf = Buffer.alloc(VAD_FRAME_BYTES);
    for (let i = 0; i < buf.length; i += 2) {
      buf.writeInt16LE(amplitude, i);
    }
    return buf;
  };

  it("should initialize in SILENCE state", () => {
    const vad = new VoiceActivityDetector();
    expect(vad.getState()).toBe("SILENCE");
  });

  it("should remain in SILENCE state when below energy threshold", () => {
    const vad = new VoiceActivityDetector({ energyThreshold: 0.05 });
    const silentFrame = createFrame(100); // normalized RMS ~ 0.003
    const result = vad.processFrame(silentFrame);

    expect(result.state).toBe("SILENCE");
    expect(result.isSpeech).toBe(false);
    expect(vad.getState()).toBe("SILENCE");
  });

  it("should require attackFrames consecutive active frames before opening speech gate", () => {
    const vad = new VoiceActivityDetector({
      energyThreshold: 0.05,
      attackFrames: 3,
    });
    const speechStartListener = vi.fn();
    vad.on("speechStart", speechStartListener);

    const activeFrame = createFrame(4000); // normalized RMS ~ 0.122

    // Frame 1
    const res1 = vad.processFrame(activeFrame);
    expect(res1.state).toBe("SILENCE");
    expect(res1.isSpeech).toBe(false);

    // Frame 2
    const res2 = vad.processFrame(activeFrame);
    expect(res2.state).toBe("SILENCE");
    expect(res2.isSpeech).toBe(false);

    // Frame 3 (attack window satisfied)
    const res3 = vad.processFrame(activeFrame);
    expect(res3.state).toBe("SPEECH");
    expect(res3.isSpeech).toBe(true);
    expect(res3.flushedFrames?.length).toBe(3); // Pre-roll flushed
    expect(speechStartListener).toHaveBeenCalledTimes(1);
  });

  it("should stay in SPEECH during hangover period and transition back to SILENCE after hangover expires", () => {
    const vad = new VoiceActivityDetector({
      energyThreshold: 0.05,
      attackFrames: 1,
      hangoverFrames: 2,
    });
    const speechEndListener = vi.fn();
    vad.on("speechEnd", speechEndListener);

    const activeFrame = createFrame(4000);
    const silentFrame = createFrame(0);

    // Frame 1: opens gate
    vad.processFrame(activeFrame);
    expect(vad.getState()).toBe("SPEECH");

    // Frame 2: silence (hangover 1/2)
    const res2 = vad.processFrame(silentFrame);
    expect(res2.state).toBe("SPEECH");
    expect(res2.isSpeech).toBe(true);

    // Frame 3: silence (hangover 2/2 -> expires)
    const res3 = vad.processFrame(silentFrame);
    expect(res3.state).toBe("SILENCE");
    expect(res3.isSpeech).toBe(false);
    expect(speechEndListener).toHaveBeenCalledTimes(1);
  });

  it("should detect instant speech for barge-in threshold", () => {
    const vad = new VoiceActivityDetector({ bargeInThreshold: 0.1 });
    const loudFrame = createFrame(5000); // RMS ~ 0.15
    const quietFrame = createFrame(500); // RMS ~ 0.015

    expect(vad.isInstantSpeech(loudFrame)).toBe(true);
    expect(vad.isInstantSpeech(quietFrame)).toBe(false);
    expect(vad.isInstantSpeech(Buffer.alloc(0))).toBe(false);
  });
});
