import { readItems } from "@directus/sdk";
import {
  DEFAULT_ROAST_PRESET,
  type RoastPreset,
} from "../../domain/models/roast-preset";
import type { IRoastPresetRepository } from "../../domain/repositories/roast-preset.repository";
import { directusClient } from "./client";

export class DirectusRoastPresetRepository implements IRoastPresetRepository {
  private cache = new Map<string, { preset: RoastPreset; expiresAt: number }>();
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

  invalidate(name?: string): void {
    if (name) {
      this.cache.delete(name);
      console.log(`[RoastPresetRepo] Invalidation applied for preset: ${name}`);
    } else {
      this.cache.clear();
      console.log("[RoastPresetRepo] All cached presets evicted.");
    }
  }
}
