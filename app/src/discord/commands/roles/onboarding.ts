import {
  type ChatInputCommandInteraction,
  EmbedBuilder,
  type Guild,
  PermissionFlagsBits,
  SlashCommandBuilder,
  type TextChannel,
} from "discord.js";
import { getRoleStore } from "../../../services/roles";
import type {
  IRoleStore,
  OnboardingConfig,
} from "../../../services/roles/types";
import { DiscordCommand } from "../../constants";

export const data = new SlashCommandBuilder()
  .setName(DiscordCommand.RoleOnboarding)
  .setDescription("Configure new member onboarding welcome greetings.")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((sub) =>
    sub
      .setName("set")
      .setDescription(
        "Configure AI-generated witty welcome greeting for new members.",
      )
      .addChannelOption((opt) =>
        opt
          .setName("channel")
          .setDescription(
            "Channel to post welcome messages in (defaults to current)",
          )
          .setRequired(false),
      )
      .addBooleanOption((opt) =>
        opt
          .setName("enabled")
          .setDescription(
            "Enable witty welcome greeting flow (defaults to true)",
          )
          .setRequired(false),
      )
      .addStringOption((opt) =>
        opt
          .setName("locale")
          .setDescription("Locale override for welcome message (vi or en-US)")
          .setRequired(false)
          .addChoices(
            { name: "Tiếng Việt (vi)", value: "vi" },
            { name: "English (en-US)", value: "en-US" },
          ),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName("status")
      .setDescription("Display current onboarding configuration."),
  )
  .addSubcommand((sub) =>
    sub
      .setName("disable")
      .setDescription("Disable the new member onboarding greeting flow."),
  );

async function handleSet(
  interaction: ChatInputCommandInteraction,
  guild: Guild,
  store: IRoleStore,
): Promise<void> {
  const channelOption = interaction.options.getChannel("channel");
  const targetChannel = (channelOption ??
    interaction.channel) as TextChannel | null;
  if (!targetChannel?.isTextBased()) {
    await interaction.reply({
      content: "⚠️ Welcome channel must be a text-based channel.",
      ephemeral: true,
    });
    return;
  }

  const enabled = interaction.options.getBoolean("enabled") ?? true;
  const localeInput = interaction.options.getString?.("locale")?.trim();
  const existingConfig = await store.getOnboardingConfig(guild.id);
  const localeOverride = localeInput ?? existingConfig?.localeOverride;

  const config: OnboardingConfig = {
    guildId: guild.id,
    enabled,
    channelId: targetChannel.id,
    ...(localeOverride ? { localeOverride } : {}),
    updatedAt: Date.now(),
  };

  await store.saveOnboardingConfig(config);

  const localeDesc = localeOverride
    ? localeOverride === "vi"
      ? "Tiếng Việt (vi)"
      : "English (en-US)"
    : "Auto";

  await interaction.reply({
    content: `✅ Onboarding settings updated!\n- **Status**: ${enabled ? "Enabled" : "Disabled"}\n- **Channel**: <#${targetChannel.id}>\n- **Greeting**: 🤖 AI-generated witty welcome\n- **Locale**: ${localeDesc}`,
    ephemeral: true,
  });
}

async function handleStatus(
  interaction: ChatInputCommandInteraction,
  guild: Guild,
  store: IRoleStore,
): Promise<void> {
  const config = await store.getOnboardingConfig(guild.id);
  if (!config) {
    await interaction.reply({
      content:
        "ℹ️ Onboarding is not configured for this server. Use `/role-onboarding set` to configure it.",
      ephemeral: true,
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle("New Member Onboarding Status")
    .setColor(config.enabled ? 0x57f287 : 0xed4245)
    .addFields(
      {
        name: "Status",
        value: config.enabled ? "🟢 Enabled" : "🔴 Disabled",
        inline: true,
      },
      {
        name: "Welcome Channel",
        value: config.channelId ? `<#${config.channelId}>` : "Not set",
        inline: true,
      },
      {
        name: "Locale",
        value: config.localeOverride
          ? config.localeOverride === "vi"
            ? "🇻🇳 Tiếng Việt (vi)"
            : "🇺🇸 English (en-US)"
          : "Auto",
        inline: true,
      },
      {
        name: "Greeting Mode",
        value: "🤖 AI-generated witty welcome message",
        inline: false,
      },
    );

  await interaction.reply({
    embeds: [embed],
    ephemeral: true,
  });
}

async function handleDisable(
  interaction: ChatInputCommandInteraction,
  guild: Guild,
  store: IRoleStore,
): Promise<void> {
  const config = await store.getOnboardingConfig(guild.id);
  if (!config?.enabled) {
    await interaction.reply({
      content: "ℹ️ Onboarding is already disabled.",
      ephemeral: true,
    });
    return;
  }

  config.enabled = false;
  config.updatedAt = Date.now();
  await store.saveOnboardingConfig(config);

  await interaction.reply({
    content: "🔴 New member onboarding has been disabled.",
    ephemeral: true,
  });
}

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({
      content: "⚠️ This command can only be used inside a server.",
      ephemeral: true,
    });
    return;
  }

  const subcommand = interaction.options.getSubcommand();
  const store = getRoleStore();

  switch (subcommand) {
    case "set":
      return handleSet(interaction, guild, store);
    case "status":
      return handleStatus(interaction, guild, store);
    case "disable":
      return handleDisable(interaction, guild, store);
    default:
      await interaction.reply({
        content: `⚠️ Unknown subcommand: ${subcommand}`,
        ephemeral: true,
      });
  }
}
