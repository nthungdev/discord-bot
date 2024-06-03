import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { DiscordCommand } from '../../constants';

export const data = new SlashCommandBuilder()
  .setName(DiscordCommand.CheckIn)
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
