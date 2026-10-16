/**
 * Audio Resampling and Decimation Utilities.
 * Pure mathematical functions for converting between Discord audio formats
 * (48kHz Stereo) and Gemini Live formats (16kHz Mono Ingress / 24kHz Mono Egress).
 */

import {
  BYTES_PER_SAMPLE,
  DECIMATION_RATIO,
  DISCORD_CHANNELS,
  INTERPOLATION_RATIO,
  PCM_INT16_MAX,
  PCM_INT16_MIN,
  PCM_NORMALIZATION_DIVISOR,
} from "../constants";

/**
 * Clamps a numerical sample value to 16-bit signed integer boundaries.
 */
export function clampInt16(value: number): number {
  if (Number.isNaN(value)) return 0;
  if (value > PCM_INT16_MAX) return PCM_INT16_MAX;
  if (value < PCM_INT16_MIN) return PCM_INT16_MIN;
  return Math.round(value);
}

/**
 * Decimates 48,000 Hz Stereo 16-bit PCM down to 16,000 Hz Mono 16-bit PCM.
 * Uses a 3:1 polyphase decimation with anti-aliasing boxcar averaging across stereo channels.
 *
 * @param inputBuffer Raw 48kHz 16-bit stereo PCM Buffer (3840 bytes for 20ms frame)
 * @returns Resampled 16kHz 16-bit mono PCM Buffer (640 bytes for 20ms frame)
 */
export function decimateStereo48kToMono16k(inputBuffer: Buffer): Buffer {
  if (!inputBuffer || inputBuffer.length === 0) {
    return Buffer.alloc(0);
  }

  // 1 stereo frame = 2 channels * 2 bytes = 4 bytes
  const bytesPerStereoFrame = DISCORD_CHANNELS * BYTES_PER_SAMPLE;
  const totalStereoFrames = Math.floor(
    inputBuffer.length / bytesPerStereoFrame,
  );
  const outputSampleCount = Math.floor(totalStereoFrames / DECIMATION_RATIO);

  if (outputSampleCount === 0) {
    return Buffer.alloc(0);
  }

  const outputBuffer = Buffer.alloc(outputSampleCount * BYTES_PER_SAMPLE);

  for (let i = 0; i < outputSampleCount; i++) {
    const baseFrameIndex = i * DECIMATION_RATIO;
    const offset0 = baseFrameIndex * bytesPerStereoFrame;
    const offset1 = (baseFrameIndex + 1) * bytesPerStereoFrame;
    const offset2 = (baseFrameIndex + 2) * bytesPerStereoFrame;

    // Read 3 consecutive stereo sample pairs
    const left0 = inputBuffer.readInt16LE(offset0);
    const right0 = inputBuffer.readInt16LE(offset0 + BYTES_PER_SAMPLE);

    const left1 = inputBuffer.readInt16LE(offset1);
    const right1 = inputBuffer.readInt16LE(offset1 + BYTES_PER_SAMPLE);

    const left2 = inputBuffer.readInt16LE(offset2);
    const right2 = inputBuffer.readInt16LE(offset2 + BYTES_PER_SAMPLE);

    // Sum all 6 channel samples and average to produce 1 anti-aliased mono sample
    const monoAverage = (left0 + right0 + left1 + right1 + left2 + right2) / 6;
    const clampedSample = clampInt16(monoAverage);

    outputBuffer.writeInt16LE(clampedSample, i * BYTES_PER_SAMPLE);
  }

  return outputBuffer;
}

/**
 * Interpolates 24,000 Hz Mono 16-bit PCM up to 48,000 Hz Stereo 16-bit PCM.
 * Uses 1:2 linear interpolation and duplicates mono channels to stereo.
 *
 * @param inputBuffer Raw 24kHz 16-bit mono PCM Buffer (960 bytes for 20ms frame)
 * @returns Upsampled 48kHz 16-bit stereo PCM Buffer (3840 bytes for 20ms frame)
 */
export function interpolateMono24kToStereo48k(inputBuffer: Buffer): Buffer {
  if (!inputBuffer || inputBuffer.length === 0) {
    return Buffer.alloc(0);
  }

  const inputSampleCount = Math.floor(inputBuffer.length / BYTES_PER_SAMPLE);
  if (inputSampleCount === 0) {
    return Buffer.alloc(0);
  }

  // 1:2 interpolation: each mono sample produces 2 stereo frames (4 samples, 8 bytes)
  const bytesPerOutputStereoFrame = DISCORD_CHANNELS * BYTES_PER_SAMPLE;
  const outputBuffer = Buffer.alloc(
    inputSampleCount * INTERPOLATION_RATIO * bytesPerOutputStereoFrame,
  );

  for (let i = 0; i < inputSampleCount; i++) {
    const currentSample = inputBuffer.readInt16LE(i * BYTES_PER_SAMPLE);
    const nextSample =
      i < inputSampleCount - 1
        ? inputBuffer.readInt16LE((i + 1) * BYTES_PER_SAMPLE)
        : currentSample;

    const interpolatedMidpoint = clampInt16((currentSample + nextSample) / 2);

    const outOffsetFrame0 = i * 2 * bytesPerOutputStereoFrame;
    const outOffsetFrame1 = (i * 2 + 1) * bytesPerOutputStereoFrame;

    // Frame 0: [current, current]
    outputBuffer.writeInt16LE(currentSample, outOffsetFrame0);
    outputBuffer.writeInt16LE(
      currentSample,
      outOffsetFrame0 + BYTES_PER_SAMPLE,
    );

    // Frame 1: [midpoint, midpoint]
    outputBuffer.writeInt16LE(interpolatedMidpoint, outOffsetFrame1);
    outputBuffer.writeInt16LE(
      interpolatedMidpoint,
      outOffsetFrame1 + BYTES_PER_SAMPLE,
    );
  }

  return outputBuffer;
}

/**
 * Calculates normalized Root-Mean-Square (RMS) energy of a 16-bit mono PCM buffer.
 *
 * @param pcmBuffer 16-bit mono PCM buffer
 * @returns Normalized RMS energy in range [0.0, 1.0]
 */
export function calculateRmsEnergy(pcmBuffer: Buffer): number {
  if (!pcmBuffer || pcmBuffer.length < BYTES_PER_SAMPLE) {
    return 0;
  }

  const sampleCount = Math.floor(pcmBuffer.length / BYTES_PER_SAMPLE);
  let sumSquares = 0;

  for (let i = 0; i < sampleCount; i++) {
    const sample = pcmBuffer.readInt16LE(i * BYTES_PER_SAMPLE);
    sumSquares += sample * sample;
  }

  const meanSquare = sumSquares / sampleCount;
  const rms = Math.sqrt(meanSquare);

  return Math.min(1.0, rms / PCM_NORMALIZATION_DIVISOR);
}

/**
 * Calculates Zero Crossing Rate (ZCR) of a 16-bit mono PCM buffer.
 * Useful for differentiating unvoiced speech / fricatives from low frequency hum.
 *
 * @param pcmBuffer 16-bit mono PCM buffer
 * @returns Zero crossing rate in range [0.0, 1.0]
 */
export function calculateZeroCrossingRate(pcmBuffer: Buffer): number {
  if (!pcmBuffer || pcmBuffer.length < BYTES_PER_SAMPLE * 2) {
    return 0;
  }

  const sampleCount = Math.floor(pcmBuffer.length / BYTES_PER_SAMPLE);
  let zeroCrossings = 0;
  let previousSample = pcmBuffer.readInt16LE(0);

  for (let i = 1; i < sampleCount; i++) {
    const currentSample = pcmBuffer.readInt16LE(i * BYTES_PER_SAMPLE);
    if (
      (previousSample >= 0 && currentSample < 0) ||
      (previousSample < 0 && currentSample >= 0)
    ) {
      zeroCrossings++;
    }
    previousSample = currentSample;
  }

  return zeroCrossings / (sampleCount - 1);
}
