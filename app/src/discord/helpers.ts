import fs from 'node:fs'
import path from 'node:path'
import { GuildMember, userMention } from 'discord.js'

export const replaceWithUserMentions = (
  message: string,
  serverMembers: GuildMember[]
) => {
  let messageWithMentions
  const mentionMatches = new Set<string>()
  ;[...message.matchAll(/(?<=@)((\.?(?:[\w]+\.)*\w+)\.?)/g)].forEach(
    (match) => {
      const [, withDot, withoutDot] = match
      mentionMatches.add(withDot)
      mentionMatches.add(withoutDot)
    }
  )
  // console.log({mentionMatches})
  if (mentionMatches !== null) {
    messageWithMentions = [...mentionMatches].reduce(
      (acc, mentionedUsername) => {
        const serverMember = serverMembers?.find(
          (m) =>
            mentionedUsername.toLowerCase() === m.user.username.toLowerCase()
        )
        return serverMember
          ? acc.replaceAll(
              `@${mentionedUsername}`,
              userMention(serverMember.id)
            )
          : acc
      },
      message
    )
  }
  return messageWithMentions ?? message
}

export const parseCommands = async () => {
  const commands = []
  // Grab all the command folders from the commands directory
  const foldersPath = path.join(__dirname, 'commands')
  const commandFolders = fs.readdirSync(foldersPath)

  for (const folder of commandFolders) {
    // Grab all the command files from the commands directory
    const commandsPath = path.join(foldersPath, folder)
    const commandFiles = fs
      .readdirSync(commandsPath)
      .filter((file) => file.endsWith('.ts') || file.endsWith('.js'))
    // Grab the SlashCommandBuilder#toJSON() output of each command's data for deployment
    for (const file of commandFiles) {
      const filePath = path.join(commandsPath, file)
      const command = await import(filePath)
      if ('data' in command && 'execute' in command) {
        commands.push(command)
      } else {
        console.log(
          `[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`
        )
      }
    }
  }
  return commands
}
