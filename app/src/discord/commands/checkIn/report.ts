import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  DiscordjsErrorCodes,
  DiscordjsError,
} from "discord.js";
import { DiscordCommand } from "../../constants";
import { countCheckInsInChannel, formatCheckInLeaderboard, getCurrentMonthStart, getPreviousMonthEnd, getPreviousMonthStart } from "../utilities/checkIn";

// TODO localize description

export const data = new SlashCommandBuilder()
  .setName(DiscordCommand.CheckInReport)
  .setDescription("Tạo báo cáo điểm danh");

export async function execute(interaction: ChatInputCommandInteraction) {
  const lastMonth = new ButtonBuilder()
    .setCustomId("last-month")
    .setLabel("Tháng trước")
    .setStyle(ButtonStyle.Primary);

  const currentMonth = new ButtonBuilder()
    .setCustomId("current-month")
    .setLabel("Tháng này")
    .setStyle(ButtonStyle.Primary);

  const cancel = new ButtonBuilder()
    .setCustomId("cancel")
    .setLabel("Huỷ")
    .setStyle(ButtonStyle.Secondary);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    lastMonth,
    currentMonth,
    cancel,
  );

  try {
    const response = await interaction.reply({
      // content: 'Check-in Report...',
      components: [row],
    });

    const collectorFilter = (i: unknown) =>
      (i as ChatInputCommandInteraction).user.id === interaction.user.id;

    const confirmation = await response.awaitMessageComponent({
      filter: collectorFilter,
      time: 180_000,
    });

    if (confirmation.customId === "cancel") {
      await confirmation.update({ content: "Huỷ tạo báo cáo", components: [] });
      return;
    }

    await confirmation.deferUpdate();

    let start: Date, end: Date;
    if (confirmation.customId === "last-month") {
      start = getPreviousMonthStart();
      end = getPreviousMonthEnd();
    } else {
      start = getCurrentMonthStart();
      end = new Date();
    }

    const leaderboard = await countCheckInsInChannel(
      interaction.client,
      interaction.channelId,
      start,
      end,
    );

    const report = formatCheckInLeaderboard(start, end, leaderboard);
    if (!report) {
      await interaction.editReply({
        content: "Chả có ai check in cả",
        components: [],
      });
    } else {
      await interaction.editReply({ content: report, components: [] });
    }
  } catch (e: unknown) {
    console.error({ e });
    if (
      e instanceof DiscordjsError &&
      e.code === DiscordjsErrorCodes.InteractionCollectorError
    ) {
      await interaction.editReply({
        content: `Đợi chọn option lâu quá, hủy`,
        components: [],
      });
    } else {
      await interaction.editReply({
        content: `Something went wrong!`,
        components: [],
      });
    }
  }
}
