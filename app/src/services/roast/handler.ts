import type {
  ChatInputCommandInteraction,
  User,
  UserContextMenuCommandInteraction,
} from "discord.js";
import { Config, ConfigParameter } from "../../config";
import type { BotsConfig } from "../../config/types";
import { buildTargetActor, fetchTargetRecentMessages } from "./ammunition";
import { ROAST_MESSAGES, resolveRoastLocale } from "./i18n";
import { clampIntensity, getRoastService } from "./index";
import {
  CommandRoastOption,
  CommandRoastOptionVi,
  RoastIntensity,
  type RoastRequest,
} from "./types";

interface ParsedRoastInputs {
  targetUser: User | null;
  requestedIntensity: RoastIntensity;
  topic: string | null;
  ephemeral: boolean;
}

/**
 * Extracts options from slash command or user context menu interaction.
 */
function parseRoastCommandInputs(
  interaction: ChatInputCommandInteraction | UserContextMenuCommandInteraction,
): ParsedRoastInputs {
  if (interaction.isUserContextMenuCommand()) {
    return {
      targetUser: interaction.targetUser,
      requestedIntensity: RoastIntensity.Medium,
      topic: null,
      ephemeral: false,
    };
  }

  const targetUser =
    interaction.options.getUser(CommandRoastOption.Target) ||
    interaction.options.getUser(CommandRoastOptionVi.Target);

  const intensityVal =
    interaction.options.getString(CommandRoastOption.Intensity) ||
    interaction.options.getString(CommandRoastOptionVi.Intensity);
  const requestedIntensity = intensityVal
    ? (intensityVal as RoastIntensity)
    : RoastIntensity.Medium;

  const topic =
    interaction.options.getString(CommandRoastOption.Topic) ||
    interaction.options.getString(CommandRoastOptionVi.Topic) ||
    null;

  const ephemeral =
    interaction.options.getBoolean(CommandRoastOption.Preview) ??
    interaction.options.getBoolean(CommandRoastOptionVi.Preview) ??
    interaction.options.getBoolean(CommandRoastOption.Ephemeral) ??
    interaction.options.getBoolean(CommandRoastOptionVi.Ephemeral) ??
    false;

  return { targetUser, requestedIntensity, topic, ephemeral };
}

/**
 * Handles execution of roast commands (slash commands & user context menu).
 */
export async function executeRoast(
  interaction: ChatInputCommandInteraction | UserContextMenuCommandInteraction,
): Promise<void> {
  const guildId = interaction.guildId;
  const channelId = interaction.channelId;
  console.info(
    `[RoastHandler] executeRoast starting: command=${interaction.commandName}, user=${interaction.user?.tag ?? interaction.user?.id ?? "unknown"}, guild=${guildId}, channel=${channelId}`,
  );

  if (!(guildId && channelId)) {
    await interaction.reply({
      content: "This command can only be used in a server channel.",
      ephemeral: true,
    });
    return;
  }

  const botsConfig = Config.getInstance().getConfigValue(
    ConfigParameter.bots,
  ) as BotsConfig;
  const guildConfig = botsConfig?.chatBot?.guilds?.[guildId];
  const locale = resolveRoastLocale(interaction, guildConfig);

  const { targetUser, requestedIntensity, topic, ephemeral } =
    parseRoastCommandInputs(interaction);

  if (!targetUser) {
    console.warn("[RoastHandler] No target user provided or resolved.");
    await interaction.reply({
      content: ROAST_MESSAGES[locale].errorGeneric(),
      ephemeral: true,
    });
    return;
  }

  const botUserId = interaction.client.user?.id || "";
  const roastService = getRoastService();

  // Preflight validation
  const preflight = await roastService.validateRoastRequest(
    guildId,
    channelId,
    interaction.user.id,
    targetUser.id,
    botUserId,
    guildConfig,
  );

  console.info(
    `[RoastHandler] Preflight result: allowed=${preflight.allowed}, reason=${preflight.allowed ? "OK" : preflight.reasonKey}`,
  );

  if (!preflight.allowed) {
    const notice = roastService.formatPreflightNotice(
      preflight,
      locale,
      targetUser.id,
    );
    await interaction.reply({
      content: notice,
      ephemeral: true,
    });
    return;
  }

  await interaction.deferReply({ ephemeral });

  try {
    const guild = interaction.guild;
    const targetMember = guild?.members.cache.get(targetUser.id);
    const targetActor = buildTargetActor(targetMember, targetUser);

    const recentMessages = interaction.channel?.isTextBased()
      ? await fetchTargetRecentMessages(interaction.channel, targetUser.id)
      : [];

    const effectiveIntensity = clampIntensity(
      requestedIntensity,
      guildConfig?.roast?.maxIntensity,
    );

    const callerDisplayName =
      interaction.member && "displayName" in interaction.member
        ? (interaction.member.displayName as string)
        : interaction.user.displayName;

    const request: RoastRequest = {
      guildId,
      channelId,
      locale,
      caller: {
        id: interaction.user.id,
        username: interaction.user.username,
        displayName: callerDisplayName,
      },
      target: targetActor,
      intensity: effectiveIntensity,
      topic,
      isCounterRoast: false,
      chainDepth: 0,
      skipCooldown: ephemeral,
    };

    const result = await roastService.generateRoast(
      request,
      botUserId,
      guild,
      recentMessages,
    );

    if (ephemeral) {
      const previewId = `roast-preview-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      roastService.storePreview({
        previewId,
        guildId,
        channelId,
        callerId: interaction.user.id,
        targetId: targetUser.id,
        result,
        createdAt: Date.now(),
      });
      const previewPayload = roastService.buildRoastPreviewPayload(
        previewId,
        result,
      );
      await interaction.editReply(previewPayload);
      return;
    }

    const roastId = `roast-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const payload = roastService.buildRoastMessagePayload(
      roastId,
      result,
      guildConfig?.roast?.allowCounterRoast !== false,
    );

    await interaction.editReply(payload);
  } catch (error) {
    console.error("[RoastHandler] Command execution failed:", error);
    await interaction.editReply({
      content: ROAST_MESSAGES[locale].errorGeneric(),
    });
  }
}
