import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { DiscordCommand } from '../../constants';

export const data = new SlashCommandBuilder()
  .setName(DiscordCommand.Ping)
  .setDescription('Replies with Pong!');

export async function execute(interaction: ChatInputCommandInteraction) {
  await interaction.reply('Pong!');
}
