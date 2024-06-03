import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js'
import { DiscordCommand } from '../../constants'
import { addMessageHistory } from '../../../features/chatbot'
import { store } from '../../../store'
import { generateContent } from '../../../utils/ai'
import { replaceWithUserMentions } from '../../helpers'

enum CommandCheckInOption {
  what = 'what',
  slavegonComment = 'slavegon-comment'
}

export const data = new SlashCommandBuilder()
  .setName(DiscordCommand.CheckIn)
  .setDescription('Check in...')
  .addStringOption((option) =>
    option.setName(CommandCheckInOption.what).setDescription('Tôi đã làm gì').setRequired(true)
  )
  .addBooleanOption((option) =>
    option
      .setName(CommandCheckInOption.slavegonComment)
      .setDescription('Thêm comment của Slavegon')
      .setRequired(false)
  )

export async function execute(interaction: ChatInputCommandInteraction) {
  const hasSlavegonComment =
    interaction.options.getBoolean(CommandCheckInOption.slavegonComment, false) ?? true
  const purpose = interaction.options.getString(CommandCheckInOption.what, true)

  if (!hasSlavegonComment) {
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

  const prompt = `${interaction.user.username} says: checked in ${purpose}`
  const promptWithUsername = mentionedIds.reduce((acc, id) => {
    return acc.replaceAll(`<@${id}>`, `@${mentionedUsers[id]?.username}`)
  }, prompt)

  try {
    let { content } = await generateContent(promptWithUsername, [])

    console.log({
      user: promptWithUsername,
      bot: content
    })

    // replace @<username> in message with @<user id>
    let contentWithMentions = replaceWithUserMentions(
      content,
      interaction.guild?.members.cache.toJSON() ?? []
    )

    const message = `*${interaction.user.displayName} checked in ${purpose}*\n${contentWithMentions}`
    await interaction.editReply(message)

    store.dispatch(
      addMessageHistory({
        channelId: interaction.channelId,
        userMessage: prompt,
        botMessage: content,
      })
    )
  } catch (error: any) {
    console.error(`Failed to include Slavegon's comment`)
    await interaction.editReply(
      `*${interaction.user.displayName} checked in ${purpose}*`
    )
  }
}