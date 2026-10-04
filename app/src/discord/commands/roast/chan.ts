import {
  type ChatInputCommandInteraction,
  Locale,
  SlashCommandBuilder,
} from "discord.js";
import { executeRoast } from "../../../services/roast/handler";
import {
  CommandRoastOptionVi,
  RoastIntensity,
} from "../../../services/roast/types";
import { DiscordCommand } from "../../constants";

export const data = new SlashCommandBuilder()
  .setName(DiscordCommand.Chan)
  .setNameLocalizations({
    [Locale.Vietnamese]: "chan",
    [Locale.EnglishUS]: "roast",
  })
  .setDescription("Chan bạn bè bằng AI với độ mặn mòi đỉnh cao (Default)")
  .setDescriptionLocalizations({
    [Locale.Vietnamese]: "Chan bạn bè bằng AI với độ mặn mòi đỉnh cao.",
    [Locale.EnglishUS]:
      "Playfully roast a server member with AI-powered comedy.",
  })
  .addUserOption((option) =>
    option
      .setName(CommandRoastOptionVi.Target)
      .setNameLocalizations({
        [Locale.Vietnamese]: "muc-tieu",
        [Locale.EnglishUS]: "target",
      })
      .setDescription("Thành viên bị chan")
      .setDescriptionLocalizations({
        [Locale.Vietnamese]: "Thành viên bị chan",
        [Locale.EnglishUS]: "The server member to roast",
      })
      .setRequired(true),
  )
  .addStringOption((option) =>
    option
      .setName(CommandRoastOptionVi.Intensity)
      .setNameLocalizations({
        [Locale.Vietnamese]: "muc-do",
        [Locale.EnglishUS]: "intensity",
      })
      .setDescription("Mức độ cay cú/mặn mòi")
      .setDescriptionLocalizations({
        [Locale.Vietnamese]:
          "Mức độ cay cú/mặn mòi (mild: nhẹ, medium: vừa, savage: gắt)",
        [Locale.EnglishUS]: "The spiciness level of the roast",
      })
      .addChoices(
        {
          name: "Nhẹ nhàng",
          name_localizations: {
            [Locale.Vietnamese]: "Nhẹ nhàng",
            [Locale.EnglishUS]: "Mild",
          },
          value: RoastIntensity.Mild,
        },
        {
          name: "Vừa phải",
          name_localizations: {
            [Locale.Vietnamese]: "Vừa phải",
            [Locale.EnglishUS]: "Medium",
          },
          value: RoastIntensity.Medium,
        },
        {
          name: "Cực gắt",
          name_localizations: {
            [Locale.Vietnamese]: "Cực gắt",
            [Locale.EnglishUS]: "Savage",
          },
          value: RoastIntensity.Savage,
        },
      )
      .setRequired(false),
  )
  .addStringOption((option) =>
    option
      .setName(CommandRoastOptionVi.Topic)
      .setNameLocalizations({
        [Locale.Vietnamese]: "chu-de",
        [Locale.EnglishUS]: "topic",
      })
      .setDescription("Chủ đề hoặc phốt cụ thể muốn chan")
      .setDescriptionLocalizations({
        [Locale.Vietnamese]: "Chủ đề hoặc phốt cụ thể muốn chan",
        [Locale.EnglishUS]: "Specific topic or blunder to focus on",
      })
      .setRequired(false),
  )
  .addBooleanOption((option) =>
    option
      .setName(CommandRoastOptionVi.Ephemeral)
      .setNameLocalizations({
        [Locale.Vietnamese]: "rieng-tu",
        [Locale.EnglishUS]: "ephemeral",
      })
      .setDescription("Chỉ gửi kết quả cho riêng bạn")
      .setDescriptionLocalizations({
        [Locale.Vietnamese]: "Chỉ gửi kết quả cho riêng bạn",
        [Locale.EnglishUS]: "Send roast only to you ephemerally",
      })
      .setRequired(false),
  );

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  await executeRoast(interaction);
}
