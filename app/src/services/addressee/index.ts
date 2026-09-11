import { classifyAmbientIntent } from "./classifier";
import { evaluateTier1Heuristics } from "./heuristics";
import type { AddresseeEvaluationContext, AddresseeResult } from "./types";

export class AddresseeService {
  /**
   * Resolves whether an incoming Discord message is addressed to the bot.
   */
  async resolveAddressee(
    context: AddresseeEvaluationContext,
  ): Promise<AddresseeResult> {
    // 1. Evaluate Tier 1 Deterministic Heuristics (< 1ms, zero cost)
    const tier1Result = evaluateTier1Heuristics(context);
    if (tier1Result) {
      return tier1Result;
    }

    // 2. Ambient Candidate Handling via Tier 2 Classifier
    const smartReplyMode = context.guildConfig?.smartReply?.mode;
    if (smartReplyMode === "ambient_intent") {
      return await classifyAmbientIntent(context);
    }

    // 3. Default fallback for ambiguous messages
    return {
      decision: "ignore",
      tier: "tier1_deterministic",
      reason: "addressed_to_other",
      confidence: 1.0,
    };
  }
}

let addresseeServiceInstance: AddresseeService | null = null;

export function getAddresseeService(): AddresseeService {
  if (!addresseeServiceInstance) {
    addresseeServiceInstance = new AddresseeService();
  }
  return addresseeServiceInstance;
}

export * from "./heuristics";
export * from "./types";
