import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('checkin')
  .setDescription('Check in...')
  .addStringOption(option => option
    .setName('for')
    .setDescription('Tôi đã')
    .setRequired(true));

export async function execute(interaction: ChatInputCommandInteraction) {
  const purpose = interaction.options.getString('for', true)
  const message = `${interaction.user.displayName} đã điểm danh ${purpose}`
  await interaction.reply(message);
}
