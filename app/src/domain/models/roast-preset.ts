export interface RoastPreset {
  name: string;
  systemPrompt: string;
  temperature: number;
  isActive: boolean;
  bannedTerms: string[];
}

export const DEFAULT_ROAST_PRESET: RoastPreset = {
  name: "default",
  systemPrompt:
    "You are a sharp, witty Discord bot comedian. Generate a playful, comedic roast of the targeted user based on the provided context.",
  temperature: 0.8,
  isActive: true,
  bannedTerms: ["hate speech", "slur", "harassment"],
};
