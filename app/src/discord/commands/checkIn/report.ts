import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  DiscordjsErrorCodes
} from 'discord.js'
import { countCheckInsInChannel, formatCheckInLeaderboard, getCurrentMonthStart, getPreviousMonthEnd, getPreviousMonthStart } from '../../checkIn/checkinStreak'

export const data = new SlashCommandBuilder()
  .setName('checkin-report')
  .setDescription('Tạo báo cáo điểm danh')

export async function execute(interaction: ChatInputCommandInteraction) {
  const lastMonth = new ButtonBuilder()
    .setCustomId('last-month')
    .setLabel('Tháng trước')
    .setStyle(ButtonStyle.Primary)

  const currentMonth = new ButtonBuilder()
    .setCustomId('current-month')
    .setLabel('Tháng này')
    .setStyle(ButtonStyle.Primary)

  const cancel = new ButtonBuilder()
    .setCustomId('cancel')
    .setLabel('Huỷ')
    .setStyle(ButtonStyle.Secondary)

  const row = new ActionRowBuilder<ButtonBuilder>()
    .addComponents(lastMonth, currentMonth, cancel)

  const response = await interaction.reply({
    // content: 'Check-in Report...',
    components: [row],
    // ephemeral: true,
  })

  const collectorFilter = (i: any) => i.user.id === interaction.user.id;

  try {
    const confirmation = await response.awaitMessageComponent({
      filter: collectorFilter,
      time: 180_000
    });


    if (confirmation.customId === 'cancel') {
      await confirmation.update({ content: 'Huỷ tạo báo cáo', components: [] });
      return
    }

    let start: Date, end: Date
    if (confirmation.customId === 'last-month') {
      start = getPreviousMonthStart()
      end = getPreviousMonthEnd()
    } else {
      start = getCurrentMonthStart()
      end = new Date()
    }

    const leaderboard = await countCheckInsInChannel(interaction.channelId, start, end)
    const report = formatCheckInLeaderboard(start, end, leaderboard)
    if (!report) {
      await interaction.editReply({ content: 'Chả có ai check in tháng trước', components: [] });
    } else {
      await interaction.editReply({ content: report, components: [] });
    }

  } catch (e: any) {
    console.error({ e });
    if (e?.code === DiscordjsErrorCodes.InteractionCollectorError) {
      await interaction.editReply({
        content: `Confirmation not received within 3 minute, cancelling`,
        components: []
      });
    } else {
      await interaction.editReply({
        content: `Something went wrong, cancelling`,
        components: []
      });
    }

  }
}
