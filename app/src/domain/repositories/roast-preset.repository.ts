import type { RoastPreset } from "../models/roast-preset";

export interface IRoastPresetRepository {
  getPreset(name?: string): Promise<RoastPreset>;
  invalidate(name?: string): void;
}
