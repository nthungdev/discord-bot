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
    const author = context.message.author.username;
    const channelName =
      (context.message.channel as { name?: string }).name ||
      context.message.channelId;
    const preview =
      context.message.cleanContent.length > 50
        ? `${context.message.cleanContent.slice(0, 50)}...`
        : context.message.cleanContent;

    console.info(
      `[SmartReply:Addressee] Evaluating message from @${author} in #${channelName}: "${preview}"`,
    );

    // 1. Evaluate Tier 1 Deterministic Heuristics (< 1ms, zero cost)
    const tier1Result = evaluateTier1Heuristics(context);
    if (tier1Result) {
      console.info(
        `[SmartReply:Addressee] Tier 1 (${tier1Result.reason}) -> decision: ${tier1Result.decision} (confidence: ${tier1Result.confidence})`,
      );
      return tier1Result;
    }

    // 2. Ambient Candidate Handling via Tier 2 Classifier
    const smartReplyMode = context.guildConfig?.smartReply?.mode;
    if (smartReplyMode === "ambient_intent") {
      const tier2Result = await classifyAmbientIntent(context);
      console.info(
        `[SmartReply:Addressee] Tier 2 ambient classification -> decision: ${tier2Result.decision} (confidence: ${tier2Result.confidence})`,
      );
      return tier2Result;
    }

    // 3. Default fallback for ambiguous messages
    console.info(
      `[SmartReply:Addressee] Fallback (mode: ${smartReplyMode ?? "default"}) -> decision: ignore (addressed_to_other)`,
    );
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
