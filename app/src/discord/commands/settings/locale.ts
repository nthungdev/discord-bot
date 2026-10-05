import {
  type ChatInputCommandInteraction,
  Locale,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { Config, ConfigParameter } from "../../../config";
import type { BotsConfig } from "../../../config/types";
import {
  type GuildLocaleSetting,
  getGuildLocaleStore,
} from "../../../services/locale/store";
import { DiscordCommand } from "../../constants";
import { deployGuildCommands } from "../../deployCommands";

export enum LocaleSubcommand {
  Set = "set",
  Status = "status",
}

export const data = new SlashCommandBuilder()
  .setName(DiscordCommand.Locale)
  .setNameLocalizations({
    [Locale.Vietnamese]: "ngon-ngu",
    [Locale.EnglishUS]: "locale",
  })
  .setDescription("Manage server-wide language settings for bot and commands.")
  .setDescriptionLocalizations({
    [Locale.Vietnamese]:
      "Cài đặt ngôn ngữ cho bot và câu lệnh trên toàn máy chủ.",
    [Locale.EnglishUS]:
      "Manage server-wide language settings for bot and commands.",
  })
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addSubcommand((subcommand) =>
    subcommand
      .setName(LocaleSubcommand.Set)
      .setNameLocalizations({
        [Locale.Vietnamese]: "cai-dat",
        [Locale.EnglishUS]: "set",
      })
      .setDescription("Set the server language override")
      .setDescriptionLocalizations({
        [Locale.Vietnamese]: "Cài đặt ngôn ngữ máy chủ",
        [Locale.EnglishUS]: "Set the server language override",
      })
      .addStringOption((option) =>
        option
          .setName("language")
          .setNameLocalizations({
            [Locale.Vietnamese]: "ngon-ngu",
            [Locale.EnglishUS]: "language",
          })
          .setDescription("Select the server language")
          .setDescriptionLocalizations({
            [Locale.Vietnamese]: "Chọn ngôn ngữ máy chủ",
            [Locale.EnglishUS]: "Select the server language",
          })
          .setRequired(true)
          .addChoices(
            {
              name: "Tiếng Việt (Vietnamese)",
              name_localizations: {
                [Locale.Vietnamese]: "Tiếng Việt",
                [Locale.EnglishUS]: "Vietnamese",
              },
              value: "vi",
            },
            {
              name: "English",
              name_localizations: {
                [Locale.Vietnamese]: "Tiếng Anh (English)",
                [Locale.EnglishUS]: "English",
              },
              value: "en-US",
            },
            {
              name: "Auto / Tự động (Theo ứng dụng)",
              name_localizations: {
                [Locale.Vietnamese]: "Tự động (Theo ứng dụng)",
                [Locale.EnglishUS]: "Auto (Follow client)",
              },
              value: "auto",
            },
          ),
      ),
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName(LocaleSubcommand.Status)
      .setNameLocalizations({
        [Locale.Vietnamese]: "trang-thai",
        [Locale.EnglishUS]: "status",
      })
      .setDescription("Check the current server language setting")
      .setDescriptionLocalizations({
        [Locale.Vietnamese]: "Xem cài đặt ngôn ngữ hiện tại của máy chủ",
        [Locale.EnglishUS]: "Check the current server language setting",
      }),
  );

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({
      content: "This command can only be used inside a server.",
      ephemeral: true,
    });
    return;
  }

  const subcommand = interaction.options.getSubcommand();
  const localeStore = getGuildLocaleStore();

  const botsConfig = Config.getInstance().getConfigValue(
    ConfigParameter.bots,
  ) as BotsConfig;
  const guildConfig = botsConfig?.chatBot?.guilds?.[guildId];

  if (subcommand === LocaleSubcommand.Status) {
    const currentSetting = localeStore.getLocale(guildId, guildConfig);
    const labelMap: Record<GuildLocaleSetting, string> = {
      vi: "🇻🇳 Tiếng Việt (Cố định toàn server)",
      "en-US": "🇺🇸 English (Forced server-wide)",
      auto: "🌐 Tự động / Auto (Theo ngôn ngữ Discord của từng người dùng)",
    };

    await interaction.reply({
      content: `Ngôn ngữ máy chủ hiện tại / Current server language: **${labelMap[currentSetting]}**`,
      ephemeral: true,
    });
    return;
  }

  if (subcommand === LocaleSubcommand.Set) {
    const language = interaction.options.getString(
      "language",
      true,
    ) as GuildLocaleSetting;

    await interaction.deferReply({ ephemeral: true });

    await localeStore.setLocale(guildId, language);

    // Refresh Discord application commands for this guild with Option A filtering
    const token = process.env.DISCORD_TOKEN;
    const clientId = process.env.DISCORD_CLIENT_ID;
    if (token && clientId) {
      deployGuildCommands(token, clientId, guildId, language).catch((err) => {
        console.error(
          `[LocaleCommand] Error reloading commands for guild ${guildId}:`,
          err,
        );
      });
    }

    if (language === "vi") {
      await interaction.editReply({
        content:
          "✅ Đã cài đặt ngôn ngữ máy chủ thành **Tiếng Việt**!\n- Các câu lệnh (`/chan`, `/chan-khien`) sẽ hiển thị bằng Tiếng Việt trong danh sách gợi ý cho tất cả thành viên.\n- Phản hồi và câu khịa của bot sẽ luôn được tạo bằng Tiếng Việt.",
      });
    } else if (language === "en-US") {
      await interaction.editReply({
        content:
          "✅ Server language has been set to **English**!\n- Slash commands (`/roast`, `/roast-shield`) will be shown in English.\n- Bot responses and jokes will always be generated in English.",
      });
    } else {
      await interaction.editReply({
        content:
          "✅ Đã đặt lại ngôn ngữ máy chủ về **Tự động**!\n- Ngôn ngữ câu lệnh và phản hồi sẽ linh hoạt theo cài đặt Discord của từng thành viên.",
      });
    }
  }
}
