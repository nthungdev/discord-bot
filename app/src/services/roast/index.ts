import {
  ActionRowBuilder,
  ButtonBuilder,
  type ButtonInteraction,
  ButtonStyle,
  type Guild,
} from "discord.js";
import type { BotGuildConfig } from "../../config/types";
import type { DiscordUser } from "../../types";
import { generateChatMessageWithGenAi, getGenAi } from "../../utils/genAi";
import {
  buildAmmunitionPrompt,
  buildTargetActor,
  fetchTargetRecentMessages,
} from "./ammunition";
import { getRoastCooldownManager, type RoastCooldownManager } from "./cooldown";
import {
  ENGLISH_SYSTEM_INSTRUCTION,
  formatDuration,
  INTENSITY_INSTRUCTIONS,
  INTENSITY_LABELS,
  ROAST_MESSAGES,
  VIETNAMESE_SYSTEM_INSTRUCTION,
} from "./i18n";
import { getRoastOptOutStore, type IRoastOptOutStore } from "./opt-out";
import {
  DEFAULT_CALLER_COOLDOWN_SECONDS,
  DEFAULT_TARGET_SHIELD_SECONDS,
  MAX_COUNTER_ROAST_CHAIN_DEPTH,
  type PreflightCheckResult,
  ROAST_BUTTON_PREFIX_BURN,
  ROAST_BUTTON_PREFIX_COUNTER,
  ROAST_BUTTON_PREFIX_LAUGH,
  RoastIntensity,
  type RoastReactionRecord,
  type RoastRequest,
  type RoastResult,
  type SupportedRoastLocale,
} from "./types";

const INTENSITY_WEIGHT: Record<RoastIntensity, number> = {
  [RoastIntensity.Mild]: 1,
  [RoastIntensity.Medium]: 2,
  [RoastIntensity.Savage]: 3,
};

/**
 * Clamps requested intensity if guild has configured a lower maximum intensity.
 */
export function clampIntensity(
  requested: RoastIntensity,
  maxAllowed?: "mild" | "medium" | "savage",
): RoastIntensity {
  if (!maxAllowed) return requested;
  const maxEnum = maxAllowed as RoastIntensity;
  if (INTENSITY_WEIGHT[requested] > INTENSITY_WEIGHT[maxEnum]) {
    return maxEnum;
  }
  return requested;
}

export class RoastService {
  private cooldownManager: RoastCooldownManager;
  private optOutStore: IRoastOptOutStore;
  private activeRoasts = new Map<string, RoastReactionRecord>();

  constructor(
    cooldownManager?: RoastCooldownManager,
    optOutStore?: IRoastOptOutStore,
  ) {
    this.cooldownManager = cooldownManager || getRoastCooldownManager();
    this.optOutStore = optOutStore || getRoastOptOutStore();
  }

  /**
   * Pre-flight checks verifying channel permissions, opt-out status, and rate limits.
   */
  public async validateRoastRequest(
    guildId: string,
    channelId: string,
    callerId: string,
    targetId: string,
    botUserId: string,
    guildConfig?: BotGuildConfig,
  ): Promise<PreflightCheckResult> {
    if (guildConfig?.roast?.enabled === false) {
      return { allowed: false, reasonKey: "feature_disabled" };
    }

    const ignoredChannels = guildConfig?.roast?.ignoredChannelIds ?? [];
    if (ignoredChannels.includes(channelId)) {
      return { allowed: false, reasonKey: "channel_disabled" };
    }

    const allowedChannels = guildConfig?.roast?.allowedChannelIds ?? [];
    if (allowedChannels.length > 0 && !allowedChannels.includes(channelId)) {
      return { allowed: false, reasonKey: "channel_disabled" };
    }

    const callerCooldownSeconds =
      guildConfig?.roast?.callerCooldownSeconds ??
      DEFAULT_CALLER_COOLDOWN_SECONDS;
    const targetShieldSeconds =
      guildConfig?.roast?.targetShieldCooldownSeconds ??
      DEFAULT_TARGET_SHIELD_SECONDS;

    // Caller rate limit check
    const callerStatus = this.cooldownManager.checkCallerCooldown(
      guildId,
      callerId,
      callerCooldownSeconds,
    );
    if (callerStatus.onCooldown) {
      return {
        allowed: false,
        reasonKey: "caller_cooldown",
        remainingSeconds: callerStatus.remainingSeconds,
      };
    }

    // Self-roasts and bot reversals bypass opt-out and target shield
    const isSelfRoast = callerId === targetId;
    const isBotRoast = targetId === botUserId;
    if (isSelfRoast || isBotRoast) {
      return { allowed: true };
    }

    // Target opt-out check
    const hasOptedOut = await this.optOutStore.isOptedOut(guildId, targetId);
    if (hasOptedOut) {
      return { allowed: false, reasonKey: "target_opted_out" };
    }

    // Target harassment shield check
    const shieldStatus = this.cooldownManager.checkTargetShield(
      guildId,
      targetId,
      targetShieldSeconds,
    );
    if (shieldStatus.isShielded) {
      return {
        allowed: false,
        reasonKey: "target_shielded",
        remainingSeconds: shieldStatus.remainingSeconds,
      };
    }

    return { allowed: true };
  }

  /**
   * Generates localized comedic roast content using GenAI or edge case templates.
   */
  public async generateRoast(
    request: RoastRequest,
    botUserId: string,
    guild?: Guild | null,
    recentMessages: string[] = [],
  ): Promise<RoastResult> {
    const isSelfRoast = request.caller.id === request.target.id;
    const isBotRoast = request.target.id === botUserId;
    const chainDepth = request.chainDepth ?? 0;
    const locale = request.locale;

    // Edge case 1: Self-roast
    if (isSelfRoast) {
      const fallback = ROAST_MESSAGES[locale].selfRoastFallback(
        request.caller.id,
      );
      return {
        content: fallback,
        locale,
        targetId: request.caller.id,
        callerId: request.caller.id,
        intensity: request.intensity,
        topic: request.topic,
        isCounterRoast: false,
        chainDepth,
      };
    }

    // Edge case 2: Bot-roast reversal
    if (isBotRoast) {
      const fallback = ROAST_MESSAGES[locale].botRoastFallback(
        request.caller.id,
      );
      return {
        content: fallback,
        locale,
        targetId: request.caller.id, // Bot reversals target the caller!
        callerId: request.caller.id,
        intensity: request.intensity,
        topic: request.topic,
        isCounterRoast: false,
        chainDepth,
      };
    }

    // Normal GenAI Generation
    const baseSystem =
      locale === "vi"
        ? VIETNAMESE_SYSTEM_INSTRUCTION
        : ENGLISH_SYSTEM_INSTRUCTION;
    const intensityAddon =
      INTENSITY_INSTRUCTIONS[locale][request.intensity] ??
      INTENSITY_INSTRUCTIONS[locale][RoastIntensity.Medium];
    const fullSystemInstruction = `${baseSystem}\n\n${intensityAddon}`;

    const ammunitionText = buildAmmunitionPrompt(request, recentMessages);

    const membersCache = guild?.members?.cache;
    const users: DiscordUser[] = membersCache
      ? Array.from(membersCache.values()).map((m) => ({
          id: m.id,
          nickname: m.nickname ?? m.displayName,
          username: m.user?.username ?? m.displayName,
        }))
      : [];

    try {
      const genAi = getGenAi({
        apiKey: process.env.AI_API_KEY,
        guildId: request.guildId,
        botId: "chatBot",
        systemInstruction: fullSystemInstruction,
      });

      const { content } = await generateChatMessageWithGenAi(
        genAi,
        { text: ammunitionText },
        users,
        guild,
      );

      // Clean wrapping quotes or spaces if any
      const cleaned = content.replace(/^["']|["']$/g, "").trim();

      // Record successful roast cooldowns
      this.cooldownManager.recordRoast(
        request.guildId,
        request.caller.id,
        request.target.id,
      );

      return {
        content: cleaned || ROAST_MESSAGES[locale].errorGeneric(),
        locale,
        targetId: request.target.id,
        callerId: request.caller.id,
        intensity: request.intensity,
        topic: request.topic,
        isCounterRoast: Boolean(request.isCounterRoast),
        chainDepth,
      };
    } catch (error) {
      console.error("[RoastService] GenAI generation failed:", error);
      return {
        content: ROAST_MESSAGES[locale].errorGeneric(),
        locale,
        targetId: request.target.id,
        callerId: request.caller.id,
        intensity: request.intensity,
        topic: request.topic,
        isCounterRoast: Boolean(request.isCounterRoast),
        chainDepth,
      };
    }
  }

  /**
   * Builds the formatted message text and action row buttons.
   */
  public buildRoastMessagePayload(
    roastId: string,
    result: RoastResult,
    allowCounterRoast: boolean = true,
  ): {
    content: string;
    components: ActionRowBuilder<ButtonBuilder>[];
  } {
    const locale = result.locale;
    const header = ROAST_MESSAGES[locale].header(result.targetId);
    const intensityLabel = INTENSITY_LABELS[locale][result.intensity];
    const footer = ROAST_MESSAGES[locale].footer(
      result.callerId,
      intensityLabel,
      result.topic,
    );

    const messageText = `${header}\n"${result.content}"\n\n${footer}`;

    // Initialize or fetch reaction record
    let record = this.activeRoasts.get(roastId);
    if (!record) {
      record = {
        burnCount: 0,
        laughCount: 0,
        burnReactors: new Set(),
        laughReactors: new Set(),
        callerId: result.callerId,
        targetId: result.targetId,
        intensity: result.intensity,
        locale: result.locale,
        topic: result.topic,
        chainDepth: result.chainDepth,
      };
      this.activeRoasts.set(roastId, record);
    }

    const burnButton = new ButtonBuilder()
      .setCustomId(`${ROAST_BUTTON_PREFIX_BURN}:${roastId}`)
      .setLabel(ROAST_MESSAGES[locale].buttonBurn(record.burnCount))
      .setStyle(ButtonStyle.Primary);

    const laughButton = new ButtonBuilder()
      .setCustomId(`${ROAST_BUTTON_PREFIX_LAUGH}:${roastId}`)
      .setLabel(ROAST_MESSAGES[locale].buttonLaugh(record.laughCount))
      .setStyle(ButtonStyle.Secondary);

    const canCounter =
      allowCounterRoast &&
      record.chainDepth < MAX_COUNTER_ROAST_CHAIN_DEPTH &&
      result.callerId !== result.targetId; // Cannot counter a self-roast

    const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      burnButton,
      laughButton,
    );

    if (canCounter) {
      const counterButton = new ButtonBuilder()
        .setCustomId(`${ROAST_BUTTON_PREFIX_COUNTER}:${roastId}`)
        .setLabel(ROAST_MESSAGES[locale].buttonCounter())
        .setStyle(ButtonStyle.Danger);
      actionRow.addComponents(counterButton);
    }

    return {
      content: messageText,
      components: [actionRow],
    };
  }

  /**
   * Toggles reaction counters for burn and laugh buttons.
   */
  private async handleReactionToggle(
    interaction: ButtonInteraction,
    roastId: string,
    record: RoastReactionRecord,
    type: "burn" | "laugh",
    allowCounter: boolean,
  ): Promise<void> {
    const userId = interaction.user.id;
    const isBurn = type === "burn";
    const reactors = isBurn ? record.burnReactors : record.laughReactors;

    if (reactors.has(userId)) {
      reactors.delete(userId);
      if (isBurn) {
        record.burnCount = Math.max(0, record.burnCount - 1);
      } else {
        record.laughCount = Math.max(0, record.laughCount - 1);
      }
    } else {
      reactors.add(userId);
      if (isBurn) {
        record.burnCount += 1;
      } else {
        record.laughCount += 1;
      }
    }

    const updatedPayload = this.buildRoastMessagePayload(
      roastId,
      {
        content: "",
        locale: record.locale,
        targetId: record.targetId,
        callerId: record.callerId,
        intensity: record.intensity,
        topic: record.topic,
        isCounterRoast: false,
        chainDepth: record.chainDepth,
      },
      allowCounter,
    );

    await interaction.update({ components: updatedPayload.components });
  }

  /**
   * Generates and replies with the counter-roast payload.
   */
  private async dispatchCounterRoast(
    interaction: ButtonInteraction,
    record: RoastReactionRecord,
    botUserId: string,
    guildConfig?: BotGuildConfig,
  ): Promise<void> {
    const guild = interaction.guild;
    const originalCallerMember = guild?.members.cache.get(record.callerId);
    const counterTargetUser =
      originalCallerMember?.user ??
      (await interaction.client.users.fetch(record.callerId).catch(() => null));

    if (!counterTargetUser) {
      await interaction.editReply({
        content: ROAST_MESSAGES[record.locale].errorGeneric(),
      });
      return;
    }

    const targetActor = buildTargetActor(originalCallerMember, {
      id: counterTargetUser.id,
      username: counterTargetUser.username,
      displayName:
        originalCallerMember?.displayName ?? counterTargetUser.displayName,
    });

    const recentMessages = interaction.channel?.isTextBased()
      ? await fetchTargetRecentMessages(interaction.channel, targetActor.id)
      : [];

    const callerDisplayName =
      interaction.member && "displayName" in interaction.member
        ? (interaction.member.displayName as string)
        : interaction.user.displayName;

    const counterRequest: RoastRequest = {
      guildId: interaction.guildId || "",
      channelId: interaction.channelId,
      locale: record.locale,
      caller: {
        id: interaction.user.id,
        username: interaction.user.username,
        displayName: callerDisplayName,
      },
      target: targetActor,
      intensity: record.intensity,
      topic: record.topic,
      isCounterRoast: true,
      chainDepth: record.chainDepth + 1,
    };

    const result = await this.generateRoast(
      counterRequest,
      botUserId,
      guild,
      recentMessages,
    );

    const newRoastId = `roast-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const payload = this.buildRoastMessagePayload(
      newRoastId,
      result,
      guildConfig?.roast?.allowCounterRoast !== false,
    );

    await interaction.editReply(payload);
  }

  /**
   * Handles pre-checks and triggers counter-roast generation.
   */
  private async handleCounterRoast(
    interaction: ButtonInteraction,
    record: RoastReactionRecord,
    botUserId: string,
    guildConfig?: BotGuildConfig,
  ): Promise<void> {
    const userId = interaction.user.id;
    const locale = record.locale;

    if (userId !== record.targetId) {
      await interaction.reply({
        content: ROAST_MESSAGES[locale].counterOnlyTarget(record.targetId),
        ephemeral: true,
      });
      return;
    }

    if (record.chainDepth >= MAX_COUNTER_ROAST_CHAIN_DEPTH) {
      await interaction.reply({
        content: ROAST_MESSAGES[locale].counterChainLimit(),
        ephemeral: true,
      });
      return;
    }

    const cooldownSecs =
      guildConfig?.roast?.callerCooldownSeconds ??
      DEFAULT_CALLER_COOLDOWN_SECONDS;
    const callerStatus = this.cooldownManager.checkCallerCooldown(
      interaction.guildId || "",
      userId,
      cooldownSecs,
    );
    if (callerStatus.onCooldown) {
      const timeStr = formatDuration(callerStatus.remainingSeconds, locale);
      await interaction.reply({
        content: ROAST_MESSAGES[locale].callerCooldown(timeStr),
        ephemeral: true,
      });
      return;
    }

    await interaction.deferReply();
    await this.dispatchCounterRoast(
      interaction,
      record,
      botUserId,
      guildConfig,
    );
  }

  /**
   * Handles button click interactions for reactions and counter-roast triggers.
   */
  public async handleButtonInteraction(
    interaction: ButtonInteraction,
    botUserId: string,
    guildConfig?: BotGuildConfig,
  ): Promise<void> {
    const customId = interaction.customId;
    const parts = customId.split(":");
    if (parts.length < 3) return;

    const action = `${parts[0]}:${parts[1]}`;
    const roastId = parts[2];
    const record = this.activeRoasts.get(roastId);
    if (!record) {
      await interaction.reply({
        content: "This roast interaction has expired.",
        ephemeral: true,
      });
      return;
    }

    const allowCounter = guildConfig?.roast?.allowCounterRoast !== false;

    if (action === ROAST_BUTTON_PREFIX_BURN) {
      await this.handleReactionToggle(
        interaction,
        roastId,
        record,
        "burn",
        allowCounter,
      );
      return;
    }

    if (action === ROAST_BUTTON_PREFIX_LAUGH) {
      await this.handleReactionToggle(
        interaction,
        roastId,
        record,
        "laugh",
        allowCounter,
      );
      return;
    }

    if (action === ROAST_BUTTON_PREFIX_COUNTER) {
      await this.handleCounterRoast(
        interaction,
        record,
        botUserId,
        guildConfig,
      );
    }
  }

  /**
   * Helper to format preflight failure notices into localized ephemeral strings.
   */
  public formatPreflightNotice(
    result: PreflightCheckResult,
    locale: SupportedRoastLocale,
    targetId: string,
  ): string {
    if (result.allowed) return "";

    const msgs = ROAST_MESSAGES[locale];
    switch (result.reasonKey) {
      case "target_opted_out":
        return msgs.targetOptedOut(targetId);
      case "target_shielded": {
        const time = formatDuration(result.remainingSeconds ?? 0, locale);
        return msgs.targetShielded(targetId, time);
      }
      case "caller_cooldown": {
        const time = formatDuration(result.remainingSeconds ?? 0, locale);
        return msgs.callerCooldown(time);
      }
      case "channel_disabled":
        return msgs.channelDisabled();
      case "feature_disabled":
        return msgs.featureDisabled();
      default:
        return msgs.errorGeneric();
    }
  }

  /**
   * Clears internal state (for testing).
   */
  public clearState(): void {
    this.activeRoasts.clear();
    this.cooldownManager.clearAll();
  }
}

// Singleton instance
let roastServiceInstance: RoastService | null = null;

export function getRoastService(): RoastService {
  if (!roastServiceInstance) {
    roastServiceInstance = new RoastService();
  }
  return roastServiceInstance;
}
