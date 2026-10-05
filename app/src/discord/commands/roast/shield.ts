import {
  type ChatInputCommandInteraction,
  Locale,
  SlashCommandBuilder,
} from "discord.js";
import { Config, ConfigParameter } from "../../../config";
import type { BotsConfig } from "../../../config/types";
import { getRoastCooldownManager } from "../../../services/roast/cooldown";
import {
  formatDuration,
  ROAST_MESSAGES,
  resolveRoastLocale,
} from "../../../services/roast/i18n";
import { getRoastOptOutStore } from "../../../services/roast/opt-out";
import { DiscordCommand } from "../../constants";

export enum ShieldSubcommand {
  OptOut = "opt-out",
  OptIn = "opt-in",
  Status = "status",
}

export const data = new SlashCommandBuilder()
  .setName(DiscordCommand.RoastShield)
  .setNameLocalizations({
    [Locale.Vietnamese]: "chan-khien",
    [Locale.EnglishUS]: "roast-shield",
  })
  .setDescription("Manage roast opt-out immunity and harassment shield status.")
  .setDescriptionLocalizations({
    [Locale.Vietnamese]: "Quản lý miễn nhiễm chan và khiên bảo vệ.",
    [Locale.EnglishUS]:
      "Manage roast opt-out immunity and harassment shield status.",
  })
  .addSubcommand((subcommand) =>
    subcommand
      .setName(ShieldSubcommand.OptOut)
      .setNameLocalizations({
        [Locale.Vietnamese]: "tu-choi",
        [Locale.EnglishUS]: "opt-out",
      })
      .setDescription("Opt out of being targeted by roasts")
      .setDescriptionLocalizations({
        [Locale.Vietnamese]: "Từ chối tham gia bị chan",
        [Locale.EnglishUS]: "Opt out of being targeted by roasts",
      }),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName(ShieldSubcommand.OptIn)
      .setNameLocalizations({
        [Locale.Vietnamese]: "tham-gia",
        [Locale.EnglishUS]: "opt-in",
      })
      .setDescription("Re-enable participation in roasts")
      .setDescriptionLocalizations({
        [Locale.Vietnamese]: "Bật lại khả năng tham gia bị chan",
        [Locale.EnglishUS]: "Re-enable participation in roasts",
      }),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName(ShieldSubcommand.Status)
      .setNameLocalizations({
        [Locale.Vietnamese]: "trang-thai",
        [Locale.EnglishUS]: "status",
      })
      .setDescription("Check your opt-out and shield status")
      .setDescriptionLocalizations({
        [Locale.Vietnamese]: "Xem trạng thái miễn nhiễm và khiên bảo vệ",
        [Locale.EnglishUS]: "Check your opt-out and shield status",
      }),
  );

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const subcommand = interaction.options.getSubcommand();
  console.info(
    `[ShieldCommand] execute: subcommand=${subcommand}, user=${interaction.user?.tag ?? interaction.user?.id ?? "unknown"}, guild=${interaction.guildId}`,
  );
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({
      content: "This command can only be used in a server.",
      ephemeral: true,
    });
    return;
  }

  const botsConfig = Config.getInstance().getConfigValue(
    ConfigParameter.bots,
  ) as BotsConfig;
  const guildConfig = botsConfig?.chatBot?.guilds?.[guildId];
  const locale = resolveRoastLocale(interaction, guildConfig);
  const msgs = ROAST_MESSAGES[locale];
  const optOutStore = getRoastOptOutStore();
  const cooldownManager = getRoastCooldownManager();
  const userId = interaction.user.id;

  if (subcommand === ShieldSubcommand.OptOut || subcommand === "tu-choi") {
    await optOutStore.optOut(guildId, userId);
    await interaction.reply({
      content: msgs.optOutSuccess(),
      ephemeral: true,
    });
    return;
  }

  if (subcommand === ShieldSubcommand.OptIn || subcommand === "tham-gia") {
    await optOutStore.optIn(guildId, userId);
    await interaction.reply({
      content: msgs.optInSuccess(),
      ephemeral: true,
    });
    return;
  }

  if (subcommand === ShieldSubcommand.Status || subcommand === "trang-thai") {
    const isOptedOut = await optOutStore.isOptedOut(guildId, userId);
    const shieldResult = cooldownManager.checkTargetShield(
      guildId,
      userId,
      guildConfig?.roast?.targetShieldCooldownSeconds,
    );

    const optStatus = isOptedOut ? msgs.statusOptedOut : msgs.statusOptedIn;
    const shieldStatus = shieldResult.isShielded
      ? msgs.statusShieldActive(
          formatDuration(shieldResult.remainingSeconds, locale),
        )
      : msgs.statusShieldInactive;

    await interaction.reply({
      content: msgs.statusDisplay(optStatus, shieldStatus),
      ephemeral: true,
    });
  }
}
