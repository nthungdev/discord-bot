import type { SupportedGenAiModel } from "../../genAi/types";
import { getGenAi } from "../../utils/genAi";
import type { AddresseeEvaluationContext, AddresseeResult } from "./types";

export const DEFAULT_CLASSIFIER_MODEL: SupportedGenAiModel =
  "gemini-3.5-flash-lite";
export const DEFAULT_CLASSIFIER_TEMPERATURE = 0.1;
export const DEFAULT_CLASSIFIER_MAX_OUTPUT_TOKENS = 300;
export const DEFAULT_AMBIENT_CONFIDENCE_THRESHOLD = 0.75;

export interface AmbientClassificationResponse {
  isAddressedToBot: boolean;
  confidence: number;
  targetAudience: "bot" | "user" | "everyone" | "unknown";
  reason: string;
}

/**
 * Builds the system instruction for the Tier 2 intent classification model.
 */
export function buildClassifierSystemInstruction(
  botName: string = "ChatBot",
): string {
  return `You are an intent classification engine for an AI Discord bot named "${botName}".
Your task is to analyze the given Discord message and determine if it is intended for the bot, or if it is part of a conversation between human members.

Evaluation Rules:
1. Target Audience:
   - "bot": The message is directly asking a question, making a request, or conversing with ${botName} (even without an explicit ping).
   - "user": The message is responding to or addressing another human member in the channel.
   - "everyone": The message is a general rhetorical remark, broadcast, or casual banter not directed at an assistant.
2. Positive Indicators for "bot":
   - Inquiries requesting assistant action, calculations, definitions, translations, or technical assistance.
   - Asking factual questions or assistance where no other human is addressed.

Keep the "reason" field very brief (under 10 words).
Output strictly valid JSON with no markdown formatting or markdown codeblocks:
{"isAddressedToBot": boolean, "confidence": number, "targetAudience": "bot" | "user" | "everyone" | "unknown", "reason": string}`;
}

/**
 * Sanitizes and extracts candidate JSON string from raw model text.
 */
function extractCandidateJson(raw: string): string {
  const trimmed = raw.trim();
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return trimmed.substring(firstBrace, lastBrace + 1).trim();
  }

  return trimmed;
}

/**
 * Extracts ambient classification fields using regex fallback when JSON is truncated or malformed.
 */
function parseClassifierOutputFallback(
  rawContent: string,
): AmbientClassificationResponse | null {
  const isAddressedMatch = rawContent.match(
    /"isAddressedToBot"\s*:\s*(true|false)/i,
  );
  const confidenceMatch = rawContent.match(
    /"confidence"\s*:\s*([0-9]+(?:\.[0-9]+)?)/,
  );

  if (!(isAddressedMatch && confidenceMatch)) {
    return null;
  }

  const isAddressedToBot = isAddressedMatch[1].toLowerCase() === "true";
  const confidence = Number.parseFloat(confidenceMatch[1]);
  if (Number.isNaN(confidence)) {
    return null;
  }

  const audienceMatch = rawContent.match(/"targetAudience"\s*:\s*"([^"]+)"/i);
  const reasonMatch = rawContent.match(/"reason"\s*:\s*"([^"]*)"?/i);

  return {
    isAddressedToBot,
    confidence,
    targetAudience:
      (audienceMatch?.[1] as AmbientClassificationResponse["targetAudience"]) ??
      "unknown",
    reason: reasonMatch?.[1] ?? "",
  };
}

/**
 * Parses structured JSON response from classifier model safely, with fallback recovery for truncated responses.
 */
export function parseClassifierOutput(
  rawContent: string,
): AmbientClassificationResponse | null {
  if (!rawContent?.trim()) {
    return null;
  }

  const candidate = extractCandidateJson(rawContent);

  try {
    const parsed = JSON.parse(
      candidate,
    ) as Partial<AmbientClassificationResponse>;
    if (
      typeof parsed.isAddressedToBot === "boolean" &&
      typeof parsed.confidence === "number"
    ) {
      return {
        isAddressedToBot: parsed.isAddressedToBot,
        confidence: parsed.confidence,
        targetAudience: parsed.targetAudience ?? "unknown",
        reason: parsed.reason ?? "",
      };
    }
  } catch {
    // Fallback regex parsing on raw content
  }

  return parseClassifierOutputFallback(rawContent);
}

/**
 * Executes Tier 2 structured ambient intent classification.
 */
export async function classifyAmbientIntent(
  context: AddresseeEvaluationContext,
): Promise<AddresseeResult> {
  const botName = context.guildConfig?.botName ?? context.botName ?? "ChatBot";
  const classifierConfig = context.guildConfig?.smartReply?.classifierModel;
  const confidenceThreshold =
    context.guildConfig?.smartReply?.ambientConfidenceThreshold ??
    DEFAULT_AMBIENT_CONFIDENCE_THRESHOLD;

  const modelId = classifierConfig?.modelId ?? DEFAULT_CLASSIFIER_MODEL;
  const maxOutputTokens =
    classifierConfig?.maxOutputTokens ?? DEFAULT_CLASSIFIER_MAX_OUTPUT_TOKENS;
  const systemInstruction = buildClassifierSystemInstruction(botName);

  const startTime = Date.now();
  try {
    const genAi = getGenAi({
      apiKey: process.env.AI_API_KEY,
      guildId: context.message.guildId,
      modelId,
      maxOutputTokens,
      systemInstruction,
    });
    await genAi.init();

    const promptText = `Sender: ${context.message.author.username}\nMessage: "${context.message.cleanContent}"`;

    console.info(
      `[SmartReply:Classifier] Classify message from ${context.message.author.username} in #${context.message.channelId}: "${context.message.cleanContent}"`,
    );
    const response = await genAi.generate({
      text: promptText,
    });

    const durationMs = Date.now() - startTime;
    const parsed = parseClassifierOutput(response.content);
    if (!parsed) {
      console.warn(
        `[SmartReply:Classifier] (${durationMs}ms) Failed to parse JSON classifier response: "${response.content}"`,
      );
      return {
        decision: "ignore",
        tier: "tier2_classifier",
        reason: "addressed_to_other",
        confidence: 0,
      };
    }

    const isAccepted =
      parsed.isAddressedToBot && parsed.confidence >= confidenceThreshold;

    console.info(
      `[SmartReply:Classifier] (${durationMs}ms) [model: ${modelId}] ` +
        `decision: ${isAccepted ? "ACCEPT (respond)" : "REJECT (ignore)"} | ` +
        `confidence: ${parsed.confidence.toFixed(2)} (threshold: ${confidenceThreshold}) | ` +
        `addressed: ${parsed.isAddressedToBot} | audience: "${parsed.targetAudience}" | reason: "${parsed.reason}"`,
    );

    if (isAccepted) {
      return {
        decision: "respond",
        tier: "tier2_classifier",
        reason: "ambient_candidate",
        confidence: parsed.confidence,
      };
    }

    return {
      decision: "ignore",
      tier: "tier2_classifier",
      reason: "addressed_to_other",
      confidence: parsed.confidence,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    console.error(
      `[SmartReply:Classifier] (${durationMs}ms) Error executing ambient intent classifier:`,
      error,
    );
    return {
      decision: "ignore",
      tier: "tier2_classifier",
      reason: "addressed_to_other",
      confidence: 0,
    };
  }
}
