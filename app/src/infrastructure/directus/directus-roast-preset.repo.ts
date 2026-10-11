import { readItems } from "@directus/sdk";
import {
  DEFAULT_ROAST_PRESET,
  type RoastPreset,
} from "../../domain/models/roast-preset";
import type { IRoastPresetRepository } from "../../domain/repositories/roast-preset.repository";
import { directusClient } from "./client";

export class DirectusRoastPresetRepository implements IRoastPresetRepository {
  private cache = new Map<string, { preset: RoastPreset; expiresAt: number }>();
  private idToPresetNameMap = new Map<string, string>();
  private readonly ttlMs: number;

  constructor(ttlMs = 5 * 60 * 1000) {
    this.ttlMs = ttlMs;
  }

  async getPreset(name = "default"): Promise<RoastPreset> {
    const cached = this.cache.get(name);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.preset;
    }

    try {
      const items = await directusClient.request(
        readItems("bot_roast_presets", {
          filter: {
            preset_name: { _eq: name },
            is_active: { _eq: true },
          },
          limit: 1,
        }),
      );

      if (!items || items.length === 0) {
        this.cache.set(name, {
          preset: DEFAULT_ROAST_PRESET,
          expiresAt: Date.now() + this.ttlMs,
        });
        return DEFAULT_ROAST_PRESET;
      }

      const raw = items[0];
      if (raw.id) {
        this.idToPresetNameMap.set(String(raw.id), raw.preset_name);
      }
      const preset: RoastPreset = {
        name: raw.preset_name,
        systemPrompt: raw.system_prompt,
        temperature: raw.temperature ?? 0.8,
        isActive: raw.is_active ?? true,
        bannedTerms: raw.banned_terms ?? [],
      };

      this.cache.set(name, {
        preset,
        expiresAt: Date.now() + this.ttlMs,
      });

      return preset;
    } catch (error) {
      console.warn(
        `[RoastPresetRepo] Directus fetch failed for preset ${name}. Returning fallback.`,
        error,
      );
      return cached?.preset ?? DEFAULT_ROAST_PRESET;
    }
  }

  invalidate(key?: string): void {
    if (key) {
      const targetName = this.idToPresetNameMap.get(key) || key;
      this.cache.delete(targetName);
      this.idToPresetNameMap.delete(key);
      if (key !== targetName) {
        this.cache.delete(key);
      }
      console.log(
        `[RoastPresetRepo] Invalidation applied for key: ${key} (preset: ${targetName})`,
      );
    } else {
      this.cache.clear();
      this.idToPresetNameMap.clear();
      console.log("[RoastPresetRepo] All cached presets evicted.");
    }
  }
}
