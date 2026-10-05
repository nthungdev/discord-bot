import {
  type ChatInputCommandInteraction,
  Locale,
  SlashCommandBuilder,
} from "discord.js";
import { executeRoast } from "../../../services/roast/handler";
import {
  CommandRoastOption,
  RoastIntensity,
} from "../../../services/roast/types";
import { DiscordCommand } from "../../constants";

export const data = new SlashCommandBuilder()
  .setName(DiscordCommand.Roast)
  .setNameLocalizations({
    [Locale.Vietnamese]: "chan",
    [Locale.EnglishUS]: "roast",
  })
  .setDescription("Playfully roast a server member with AI-powered comedy.")
  .setDescriptionLocalizations({
    [Locale.Vietnamese]: "Chan bạn bè bằng AI với độ mặn mòi đỉnh cao.",
    [Locale.EnglishUS]:
      "Playfully roast a server member with AI-powered comedy.",
  })
  .addUserOption((option) =>
    option
      .setName(CommandRoastOption.Target)
      .setNameLocalizations({
        [Locale.Vietnamese]: "muc-tieu",
        [Locale.EnglishUS]: "target",
      })
      .setDescription("The server member to roast")
      .setDescriptionLocalizations({
        [Locale.Vietnamese]: "Thành viên bị chan",
        [Locale.EnglishUS]: "The server member to roast",
      })
      .setRequired(true),
  )
  .addStringOption((option) =>
    option
      .setName(CommandRoastOption.Topic)
      .setNameLocalizations({
        [Locale.Vietnamese]: "chu-de",
        [Locale.EnglishUS]: "topic",
      })
      .setDescription("Specific topic or blunder to focus on")
      .setDescriptionLocalizations({
        [Locale.Vietnamese]: "Chủ đề hoặc phốt cụ thể muốn chan",
        [Locale.EnglishUS]: "Specific topic or blunder to focus on",
      })
      .setRequired(true),
  )
  .addStringOption((option) =>
    option
      .setName(CommandRoastOption.Intensity)
      .setNameLocalizations({
        [Locale.Vietnamese]: "muc-do",
        [Locale.EnglishUS]: "intensity",
      })
      .setDescription("The spiciness level of the roast")
      .setDescriptionLocalizations({
        [Locale.Vietnamese]:
          "Mức độ cay cú/mặn mòi (mild: nhẹ, medium: vừa, savage: gắt)",
        [Locale.EnglishUS]: "The spiciness level of the roast",
      })
      .addChoices(
        {
          name: "mild",
          name_localizations: {
            [Locale.Vietnamese]: "Nhẹ nhàng",
            [Locale.EnglishUS]: "Mild",
          },
          value: RoastIntensity.Mild,
        },
        {
          name: "medium",
          name_localizations: {
            [Locale.Vietnamese]: "Vừa phải",
            [Locale.EnglishUS]: "Medium",
          },
          value: RoastIntensity.Medium,
        },
        {
          name: "savage",
          name_localizations: {
            [Locale.Vietnamese]: "Cực gắt",
            [Locale.EnglishUS]: "Savage",
          },
          value: RoastIntensity.Savage,
        },
      )
      .setRequired(false),
  )
  .addBooleanOption((option) =>
    option
      .setName(CommandRoastOption.Preview)
      .setNameLocalizations({
        [Locale.Vietnamese]: "xem-truoc",
        [Locale.EnglishUS]: "preview",
      })
      .setDescription("Preview roast before posting to channel")
      .setDescriptionLocalizations({
        [Locale.Vietnamese]: "Xem trước câu chan trước khi gửi vào kênh",
        [Locale.EnglishUS]: "Preview roast before posting to channel",
      })
      .setRequired(false),
  );

export async function execute(
  interaction: ChatInputCommandInteraction,
): Promise<void> {
  await executeRoast(interaction);
}
