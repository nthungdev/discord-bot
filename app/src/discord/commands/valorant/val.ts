import {
  type ChatInputCommandInteraction,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { Config, ConfigParameter } from "../../../config";
import type {
  BotGuildConfig,
  BotsConfig,
  ValorantFeaturesConfig,
} from "../../../config/types";
import { isValorantFeatureEnabled } from "../../../config/types";
import { ValorantCardBuilder } from "../../../services/valorant/card-builder";
import {
  getValorantService,
  InvalidRiotIdFormatError,
  UserNotLinkedError,
} from "../../../services/valorant/valorant-service";
import { DiscordCommand } from "../../constants";

export const data = new SlashCommandBuilder()
  .setName(DiscordCommand.Val)
  .setDescription("Valorant esports capabilities, stats, and coaching hub")
  .addSubcommand((sub) =>
    sub
      .setName("stats")
      .setDescription("Detailed personal performance summary and AI coaching")
      .addUserOption((opt) =>
        opt
          .setName("user")
          .setDescription("Target user to inspect (defaults to you)")
          .setRequired(false),
      )
      .addStringOption((opt) =>
        opt
          .setName("period")
          .setDescription("Stats time window")
          .setRequired(false)
          .addChoices(
            { name: "Recent 20 Matches", value: "recent_20" },
            { name: "Current Act", value: "current_act" },
            { name: "All Time", value: "all_time" },
          ),
      )
      .addStringOption((opt) =>
        opt
          .setName("mode")
          .setDescription("Queue mode")
          .setRequired(false)
          .addChoices(
            { name: "Competitive", value: "competitive" },
            { name: "Unrated", value: "unrated" },
          ),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("compare")
      .setDescription("Head-to-head aim duel and sportscaster comparison")
      .addUserOption((opt) =>
        opt.setName("user1").setDescription("First player").setRequired(true),
      )
      .addUserOption((opt) =>
        opt.setName("user2").setDescription("Second player").setRequired(true),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("live")
      .setDescription("Real-time active match scouting and smurf alerts")
      .addUserOption((opt) =>
        opt
          .setName("user")
          .setDescription("Player in an active game (defaults to you)")
          .setRequired(false),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("profile")
      .setDescription("Compact player card with rank badge and top agents")
      .addUserOption((opt) =>
        opt
          .setName("user")
          .setDescription("Target player (defaults to you)")
          .setRequired(false),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("health")
      .setDescription(
        "Aim fatigue analysis, late-night hours, and tilt risk factor",
      )
      .addUserOption((opt) =>
        opt
          .setName("user")
          .setDescription("Target player (defaults to you)")
          .setRequired(false),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("link")
      .setDescription("Link your Discord account to a Riot ID")
      .addStringOption((opt) =>
        opt
          .setName("riot_id")
          .setDescription("Riot ID in Name#TAG format (e.g., TenZ#NA1)")
          .setRequired(true),
      )
      .addStringOption((opt) =>
        opt
          .setName("region")
          .setDescription("Your Riot account region")
          .setRequired(true)
          .addChoices(
            { name: "Asia Pacific (AP)", value: "ap" },
            { name: "North America (NA)", value: "na" },
            { name: "Europe (EU)", value: "eu" },
            { name: "Korea (KR)", value: "kr" },
            { name: "Latin America (LATAM)", value: "latam" },
            { name: "Brazil (BR)", value: "br" },
          ),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("config")
      .setDescription(
        "Configure server-wide Valorant sub-features (Admin only)",
      )
      .addStringOption((opt) =>
        opt
          .setName("feature")
          .setDescription("The sub-feature to configure")
          .setRequired(true)
          .addChoices(
            { name: "Compare Duel Cards (compare)", value: "compare" },
            { name: "Stats & AI Coach (statsSummary)", value: "statsSummary" },
            { name: "Live Scouting (liveScouting)", value: "liveScouting" },
            {
              name: "Tilt Protection (tiltProtection)",
              value: "tiltProtection",
            },
            { name: "Rank Role Sync (rankRoleSync)", value: "rankRoleSync" },
            { name: "Auto Match Recap (autoRecap)", value: "autoRecap" },
            { name: "All Features (all)", value: "all" },
          ),
      )
      .addBooleanOption((opt) =>
        opt
          .setName("enabled")
          .setDescription("Enable or disable this feature")
          .setRequired(true),
      )
      .addChannelOption((opt) =>
        opt
          .setName("channel")
          .setDescription("Channel for alerts / recaps (if applicable)")
          .setRequired(false),
      ),
  );

/**
 * Returns a polite notice when a specific Valorant sub-feature is disabled in the guild.
 */
function getFeatureDisabledMessage(feature: string): string {
  return `⚠️ **[Valorant]** The \`${feature}\` feature is currently disabled on this server. Contact a server administrator to enable it.`;
}

/**
 * Handles `/val stats` subcommand.
 */
async function handleStatsSubcommand(
  interaction: ChatInputCommandInteraction,
  guildConfig?: BotGuildConfig,
): Promise<void> {
  if (!isValorantFeatureEnabled(guildConfig, "statsSummary")) {
    await interaction.reply({
      content: getFeatureDisabledMessage("statsSummary"),
      ephemeral: true,
    });
    return;
  }

  const targetUser = interaction.options.getUser("user") ?? interaction.user;
  const period = (interaction.options.getString("period") ?? "recent_20") as
    | "recent_20"
    | "current_act"
    | "all_time";
  const mode = interaction.options.getString("mode") ?? "competitive";

  await interaction.deferReply();

  try {
    const service = getValorantService();
    const summary = await service.getPersonalSummary(
      targetUser.id,
      period,
      mode,
    );
    const embed = ValorantCardBuilder.buildPersonalSummaryEmbed(summary);
    await interaction.editReply({ embeds: [embed] });
  } catch (err: unknown) {
    if (err instanceof UserNotLinkedError) {
      await interaction.editReply({
        content: `⚠️ <@${targetUser.id}> has not linked their Riot account yet. Run \`/val link\` to connect your Riot ID.`,
      });
      return;
    }
    await interaction.editReply({
      content: `❌ Failed to fetch Valorant stats: ${(err as Error).message}`,
    });
  }
}

/**
 * Handles `/val compare` subcommand.
 */
async function handleCompareSubcommand(
  interaction: ChatInputCommandInteraction,
  guildConfig?: BotGuildConfig,
): Promise<void> {
  if (!isValorantFeatureEnabled(guildConfig, "compare")) {
    await interaction.reply({
      content: getFeatureDisabledMessage("compare"),
      ephemeral: true,
    });
    return;
  }

  const user1 = interaction.options.getUser("user1", true);
  const user2 = interaction.options.getUser("user2", true);

  await interaction.deferReply();

  try {
    const service = getValorantService();
    const comparison = await service.getComparison(user1.id, user2.id);
    const embed = ValorantCardBuilder.buildComparisonEmbed(comparison);
    await interaction.editReply({ embeds: [embed] });
  } catch (err: unknown) {
    if (err instanceof UserNotLinkedError) {
      await interaction.editReply({
        content: `⚠️ One or both players have not linked their Riot accounts yet. Run \`/val link\` to connect.`,
      });
      return;
    }
    await interaction.editReply({
      content: `❌ Failed to compare players: ${(err as Error).message}`,
    });
  }
}

/**
 * Handles `/val live` subcommand.
 */
async function handleLiveSubcommand(
  interaction: ChatInputCommandInteraction,
  guildConfig?: BotGuildConfig,
): Promise<void> {
  if (!isValorantFeatureEnabled(guildConfig, "liveScouting")) {
    await interaction.reply({
      content: getFeatureDisabledMessage("liveScouting"),
      ephemeral: true,
    });
    return;
  }

  const targetUser = interaction.options.getUser("user") ?? interaction.user;
  await interaction.deferReply();

  try {
    const service = getValorantService();
    const liveData = await service.getLiveMatch(targetUser.id);
    if (!liveData) {
      await interaction.editReply({
        content: `ℹ️ <@${targetUser.id}> is not currently in an active Valorant match.`,
      });
      return;
    }

    const embed = ValorantCardBuilder.buildLiveMatchEmbed(liveData);
    await interaction.editReply({ embeds: [embed] });
  } catch (err: unknown) {
    if (err instanceof UserNotLinkedError) {
      await interaction.editReply({
        content: `⚠️ <@${targetUser.id}> has not linked their Riot account yet. Run \`/val link\` to connect.`,
      });
      return;
    }
    await interaction.editReply({
      content: `❌ Failed to scout live match: ${(err as Error).message}`,
    });
  }
}

/**
 * Handles `/val profile` subcommand.
 */
async function handleProfileSubcommand(
  interaction: ChatInputCommandInteraction,
  guildConfig?: BotGuildConfig,
): Promise<void> {
  if (!isValorantFeatureEnabled(guildConfig, "statsSummary")) {
    await interaction.reply({
      content: getFeatureDisabledMessage("statsSummary"),
      ephemeral: true,
    });
    return;
  }

  const targetUser = interaction.options.getUser("user") ?? interaction.user;
  await interaction.deferReply();

  try {
    const service = getValorantService();
    const summary = await service.getPersonalSummary(targetUser.id);
    const embed = ValorantCardBuilder.buildProfileEmbed(summary);
    await interaction.editReply({ embeds: [embed] });
  } catch (err: unknown) {
    if (err instanceof UserNotLinkedError) {
      await interaction.editReply({
        content: `⚠️ <@${targetUser.id}> has not linked their Riot account yet. Run \`/val link\` to connect.`,
      });
      return;
    }
    await interaction.editReply({
      content: `❌ Failed to fetch player profile: ${(err as Error).message}`,
    });
  }
}

/**
 * Handles `/val health` subcommand.
 */
async function handleHealthSubcommand(
  interaction: ChatInputCommandInteraction,
  guildConfig?: BotGuildConfig,
): Promise<void> {
  if (!isValorantFeatureEnabled(guildConfig, "tiltProtection")) {
    await interaction.reply({
      content: getFeatureDisabledMessage("tiltProtection"),
      ephemeral: true,
    });
    return;
  }

  const targetUser = interaction.options.getUser("user") ?? interaction.user;
  await interaction.deferReply();

  try {
    const service = getValorantService();
    const health = await service.getHealthAnalysis(targetUser.id);
    const embed = ValorantCardBuilder.buildHealthEmbed(health);
    await interaction.editReply({ embeds: [embed] });
  } catch (err: unknown) {
    if (err instanceof UserNotLinkedError) {
      await interaction.editReply({
        content: `⚠️ <@${targetUser.id}> has not linked their Riot account yet. Run \`/val link\` to connect.`,
      });
      return;
    }
    await interaction.editReply({
      content: `❌ Failed to fetch health metrics: ${(err as Error).message}`,
    });
  }
}

/**
 * Handles `/val link` subcommand.
 */
async function handleLinkSubcommand(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const riotId = interaction.options.getString("riot_id", true);
  const region = interaction.options.getString("region", true);

  await interaction.deferReply({ ephemeral: true });

  try {
    const service = getValorantService();
    const { account } = await service.linkAccount(
      interaction.user.id,
      riotId,
      region,
    );
    const embed = ValorantCardBuilder.buildLinkSuccessEmbed(account, region);
    await interaction.editReply({ embeds: [embed] });
  } catch (err: unknown) {
    if (err instanceof InvalidRiotIdFormatError) {
      await interaction.editReply({
        content: `❌ ${err.message}`,
      });
      return;
    }
    await interaction.editReply({
      content: `❌ Failed to link Riot account: ${(err as Error).message}`,
    });
  }
}

/**
 * Handles `/val config` administrative subcommand.
 */
async function handleConfigSubcommand(
  interaction: ChatInputCommandInteraction,
  guildConfig?: BotGuildConfig,
): Promise<void> {
  const memberPerms = interaction.memberPermissions;
  if (!memberPerms?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({
      content:
        "❌ You need the **Manage Server** permission to configure Valorant features.",
      ephemeral: true,
    });
    return;
  }

  const feature = interaction.options.getString("feature", true) as
    | keyof ValorantFeaturesConfig
    | "all";
  const enabled = interaction.options.getBoolean("enabled", true);
  const channel = interaction.options.getChannel("channel");

  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({
      content: "This command can only be used inside a server.",
      ephemeral: true,
    });
    return;
  }

  // Update in-memory configuration
  const botsConfig = Config.getInstance().getConfigValue(
    ConfigParameter.bots,
  ) as BotsConfig;
  const currentGuildConfig = botsConfig?.chatBot?.guilds?.[guildId] ??
    guildConfig ?? {
      replyChannelIds: [],
      ignoredChannelIds: [],
      respondToMentions: false,
    };

  if (!currentGuildConfig.valorant) {
    currentGuildConfig.valorant = { enabled: true, features: {} };
  }
  if (!currentGuildConfig.valorant.features) {
    currentGuildConfig.valorant.features = {};
  }

  if (feature === "all") {
    currentGuildConfig.valorant.enabled = enabled;
  } else {
    currentGuildConfig.valorant.features[feature] = {
      ...(currentGuildConfig.valorant.features[feature] as object),
      enabled,
      ...(channel ? { channelId: channel.id } : {}),
    };
  }

  await interaction.reply({
    content: `✅ Successfully set Valorant feature **${feature}** to **${enabled ? "ENABLED" : "DISABLED"}**${channel ? ` in <#${channel.id}>` : ""}.`,
    ephemeral: true,
  });
}

/**
 * Dispatches `/val` slash command interactions.
 */
export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const subcommand = interaction.options.getSubcommand();
  const guildId = interaction.guildId;

  let guildConfig: BotGuildConfig | undefined;
  if (guildId) {
    try {
      const botsConfig = Config.getInstance().getConfigValue(
        ConfigParameter.bots,
      ) as BotsConfig;
      guildConfig = botsConfig?.chatBot?.guilds?.[guildId];
    } catch {
      // Ignore if config not fully loaded
    }
  }

  switch (subcommand) {
    case "stats":
      await handleStatsSubcommand(interaction, guildConfig);
      break;
    case "compare":
      await handleCompareSubcommand(interaction, guildConfig);
      break;
    case "live":
      await handleLiveSubcommand(interaction, guildConfig);
      break;
    case "profile":
      await handleProfileSubcommand(interaction, guildConfig);
      break;
    case "health":
      await handleHealthSubcommand(interaction, guildConfig);
      break;
    case "link":
      await handleLinkSubcommand(interaction);
      break;
    case "config":
      await handleConfigSubcommand(interaction, guildConfig);
      break;
    default:
      await interaction.reply({
        content: `Unknown subcommand: ${subcommand}`,
        ephemeral: true,
      });
  }
}
