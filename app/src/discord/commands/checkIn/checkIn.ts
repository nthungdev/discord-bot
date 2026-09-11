import {
  type ChatInputCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";
import { getMemoryService } from "../../../services/memory";
import type { AiPrompt } from "../../../types";
import { generateChatMessageWithGenAi, getGenAi } from "../../../utils/genAi";
import { DiscordCommand } from "../../constants";

enum CommandCheckInOption {
  what = "what",
  slavegonComment = "slavegon-comment",
}

export const data = new SlashCommandBuilder()
  .setName(DiscordCommand.CheckIn)
  .setDescription("Check in...")
  .addStringOption((option) =>
    option
      .setName(CommandCheckInOption.what)
      // TODO localize description
      .setDescription("Tôi đã làm gì")
      .setRequired(true),
  )
  .addBooleanOption((option) =>
    option
      .setName(CommandCheckInOption.slavegonComment)
      .setDescription("Thêm comment của Slavegon")
      .setRequired(false),
  );

export async function execute(interaction: ChatInputCommandInteraction) {
  const hasSlavegonComment =
    interaction.options.getBoolean(
      CommandCheckInOption.slavegonComment,
      false,
    ) ?? true;
  const purpose = interaction.options.getString(
    CommandCheckInOption.what,
    true,
  );

  try {
    if (!hasSlavegonComment) {
      console.info(
        `${interaction.user.displayName} checked in without Slavegon comment`,
      );
      await interaction.reply(
        `*${interaction.user.displayName} checked in ${purpose}*`,
      );
      return;
    }

    await interaction.deferReply();

    const mentionedIds = [...purpose.matchAll(/<@(\d+)>/g)].map(
      (match) => match[1],
    );

    const mentionedUsers = Object.fromEntries(
      mentionedIds.map((id) => [id, interaction.client.users.cache.get(id)]),
    );

    const text = `${interaction.user.username} says: checked in ${purpose}`;
    const textWithUsername = mentionedIds.reduce((acc, id) => {
      return acc.replaceAll(`<@${id}>`, `@${mentionedUsers[id]?.username}`);
    }, text);
    const prompt: AiPrompt = {
      text: textWithUsername,
    };

    const genAi = getGenAi({
      apiKey: process.env.AI_API_KEY,
      guildId: interaction.guildId,
      botId: "chatBot",
    });
    await genAi.init();
    const { content } = await generateChatMessageWithGenAi(
      genAi,
      prompt,
      interaction.guild?.members.cache.toJSON().map((m) => ({
        id: m.id,
        nickname: m.nickname ?? m.displayName,
        username: m.user.username,
      })) || [],
      interaction.guild,
    );

    const message = `*${interaction.user.displayName} checked in ${purpose}*\n${content}`;
    await interaction.editReply(message);

    await getMemoryService().addTurn(
      interaction.client.user.id,
      interaction.channelId,
      prompt.text,
      content,
      {
        userId: interaction.user.id,
        username: interaction.user.username,
        displayName: interaction.user.displayName,
      },
      interaction.guildId ?? undefined,
      "chatBot",
    );
  } catch (error: unknown) {
    console.error(`Failed to include Slavegon's comment`, error);
    const message = `*${interaction.user.displayName} checked in ${purpose}*`;
    if (interaction.replied || interaction.deferred) {
      await interaction.editReply(message);
    } else {
      await interaction.reply(message);
    }
  }
}
