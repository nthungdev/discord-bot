import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js'
import { DiscordCommand } from '../../constants'
import { addMessageHistory } from '../../../features/chatbot'
import { store } from '../../../store'
import { generateChatMessageWithGenAi, getGenAi } from '../../../utils/genAi'
import { AiPrompt } from '../../../types'

enum CommandCheckInOption {
  what = 'what',
  slavegonComment = 'slavegon-comment',
}

export const data = new SlashCommandBuilder()
  .setName(DiscordCommand.CheckIn)
  .setDescription('Check in...')
  .addStringOption((option) =>
    option
      .setName(CommandCheckInOption.what)
      // TODO localize description
      .setDescription('Tôi đã làm gì')
      .setRequired(true)
  )
  .addBooleanOption((option) =>
    option
      .setName(CommandCheckInOption.slavegonComment)
      .setDescription('Thêm comment của Slavegon')
      .setRequired(false)
  )

export async function execute(interaction: ChatInputCommandInteraction) {
  const hasSlavegonComment =
    interaction.options.getBoolean(
      CommandCheckInOption.slavegonComment,
      false
    ) ?? true
  const purpose = interaction.options.getString(CommandCheckInOption.what, true)

  try {
    if (!hasSlavegonComment) {
      console.info(`${interaction.user.displayName} checked in without Slavegon comment`)
      await interaction.reply(
        `*${interaction.user.displayName} checked in ${purpose}*`
      )
      return
    }

    await interaction.deferReply()

    const mentionedIds = [...purpose.matchAll(/<@(\d+)>/g)].map(
      (match) => match[1]
    )

    const mentionedUsers = Object.fromEntries(
      mentionedIds.map((id) => [id, interaction.client.users.cache.get(id)])
    )

    const text = `${interaction.user.username} says: checked in ${purpose}`
    const textWithUsername = mentionedIds.reduce((acc, id) => {
      return acc.replaceAll(`<@${id}>`, `@${mentionedUsers[id]?.username}`)
    }, text)
    const prompt: AiPrompt = {
      text: textWithUsername
    }

    const genAi = getGenAi({ guildId: interaction.guildId })
    await genAi.init()
    const { content } = await generateChatMessageWithGenAi(
      genAi,
      prompt,
      interaction.guild?.members.cache.toJSON().map(m => ({
        id: m.id,
        nickname: m.nickname ?? m.displayName,
        username: m.user.username,
      })) || [],
      interaction.guild
    )

    const message = `*${interaction.user.displayName} checked in ${purpose}*\n${content}`
    await interaction.editReply(message)

    store.dispatch(
      addMessageHistory({
        channelId: interaction.channelId,
        userMessage: prompt.text,
        botMessage: content,
      })
    )
  } catch (error: unknown) {
    console.error(`Failed to include Slavegon's comment`, error)
    const message = `*${interaction.user.displayName} checked in ${purpose}*`
    if (interaction.replied || interaction.deferred) {
      await interaction.editReply(message)
    } else {
      await interaction.reply(message)
    }
  }
}
