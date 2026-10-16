import { describe, expect, it } from "vitest";
import {
  DISCORD_FRAME_BYTES,
  MODEL_FRAME_BYTES,
  VAD_FRAME_BYTES,
} from "../../constants";
import {
  calculateRmsEnergy,
  calculateZeroCrossingRate,
  clampInt16,
  decimateStereo48kToMono16k,
  interpolateMono24kToStereo48k,
} from "../audio-resampler";

describe("Audio Resampler", () => {
  describe("clampInt16", () => {
    it("should clamp values beyond int16 boundaries", () => {
      expect(clampInt16(40000)).toBe(32767);
      expect(clampInt16(-40000)).toBe(-32768);
      expect(clampInt16(1234.6)).toBe(1235);
    });

    it("should return 0 when value is NaN", () => {
      expect(clampInt16(Number.NaN)).toBe(0);
    });
  });

  describe("decimateStereo48kToMono16k", () => {
    it("should return empty buffer for empty or invalid input", () => {
      expect(decimateStereo48kToMono16k(Buffer.alloc(0))).toEqual(
        Buffer.alloc(0),
      );
      expect(decimateStereo48kToMono16k(Buffer.alloc(4))).toEqual(
        Buffer.alloc(0),
      );
    });

    it("should decimate standard 20ms Discord frame (3840 bytes) to 16kHz mono (640 bytes)", () => {
      const input = Buffer.alloc(DISCORD_FRAME_BYTES, 0);
      // Fill with constant stereo tone of 6000
      for (let i = 0; i < input.length; i += 4) {
        input.writeInt16LE(6000, i);
        input.writeInt16LE(6000, i + 2);
      }

      const output = decimateStereo48kToMono16k(input);
      expect(output.length).toBe(VAD_FRAME_BYTES);

      // Value should be preserved without clipping
      for (let i = 0; i < output.length; i += 2) {
        expect(output.readInt16LE(i)).toBe(6000);
      }
    });

    it("should correctly average stereo channels across 3-tap decimation window", () => {
      // 3 stereo frames: (100, 200), (300, 400), (500, 600)
      // Mono sum = 100 + 200 + 300 + 400 + 500 + 600 = 2100. Average = 2100 / 6 = 350
      const input = Buffer.alloc(12);
      input.writeInt16LE(100, 0);
      input.writeInt16LE(200, 2);
      input.writeInt16LE(300, 4);
      input.writeInt16LE(400, 6);
      input.writeInt16LE(500, 8);
      input.writeInt16LE(600, 10);

      const output = decimateStereo48kToMono16k(input);
      expect(output.length).toBe(2);
      expect(output.readInt16LE(0)).toBe(350);
    });
  });

  describe("interpolateMono24kToStereo48k", () => {
    it("should return empty buffer for empty input", () => {
      expect(interpolateMono24kToStereo48k(Buffer.alloc(0))).toEqual(
        Buffer.alloc(0),
      );
    });

    it("should interpolate standard 20ms model frame (960 bytes) to 48kHz stereo (3840 bytes)", () => {
      const input = Buffer.alloc(MODEL_FRAME_BYTES, 0);
      for (let i = 0; i < input.length; i += 2) {
        input.writeInt16LE(4000, i);
      }

      const output = interpolateMono24kToStereo48k(input);
      expect(output.length).toBe(DISCORD_FRAME_BYTES);

      for (let i = 0; i < output.length; i += 4) {
        expect(output.readInt16LE(i)).toBe(4000);
        expect(output.readInt16LE(i + 2)).toBe(4000);
      }
    });

    it("should linearly interpolate between sample midpoints", () => {
      // 2 mono samples: 1000 and 2000
      const input = Buffer.alloc(4);
      input.writeInt16LE(1000, 0);
      input.writeInt16LE(2000, 2);

      const output = interpolateMono24kToStereo48k(input);
      // Expected: 2 input samples * 2 frames * 2 channels * 2 bytes = 16 bytes
      expect(output.length).toBe(16);

      // Sample 0: 1000, 1000
      expect(output.readInt16LE(0)).toBe(1000);
      expect(output.readInt16LE(2)).toBe(1000);

      // Midpoint: (1000 + 2000)/2 = 1500
      expect(output.readInt16LE(4)).toBe(1500);
      expect(output.readInt16LE(6)).toBe(1500);

      // Sample 1: 2000, 2000
      expect(output.readInt16LE(8)).toBe(2000);
      expect(output.readInt16LE(10)).toBe(2000);
    });
  });

  describe("calculateRmsEnergy & calculateZeroCrossingRate", () => {
    it("should return zero for silent or empty buffer", () => {
      expect(calculateRmsEnergy(Buffer.alloc(0))).toBe(0);
      expect(calculateRmsEnergy(Buffer.alloc(640, 0))).toBe(0);
      expect(calculateZeroCrossingRate(Buffer.alloc(0))).toBe(0);
    });

    it("should accurately compute normalized RMS for known amplitude", () => {
      const buffer = Buffer.alloc(640);
      const amp = 16384; // Half of 32768
      for (let i = 0; i < buffer.length; i += 2) {
        buffer.writeInt16LE(amp, i);
      }

      const rms = calculateRmsEnergy(buffer);
      expect(rms).toBeCloseTo(0.5, 2);
    });

    it("should accurately compute zero crossing rate for alternating sign wave", () => {
      const buffer = Buffer.alloc(20);
      // Alternating +1000, -1000
      for (let i = 0; i < 10; i++) {
        buffer.writeInt16LE(i % 2 === 0 ? 1000 : -1000, i * 2);
      }

      const zcr = calculateZeroCrossingRate(buffer);
      expect(zcr).toBe(1.0);
    });
  });
});
