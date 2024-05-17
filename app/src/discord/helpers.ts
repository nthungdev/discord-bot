import { GuildMember, userMention } from "discord.js";

export const replaceWithUserMentions = (message: string, serverMembers: GuildMember[]) => {
  let messageWithMentions
  const mentionMatches = new Set<string>();
  [...message.matchAll(/(?<=\@)((\.?(?:[\w]+\.)*\w+)\.?)/g)].forEach(match => {
    const [, withDot, withoutDot] = match
    mentionMatches.add(withDot)
    mentionMatches.add(withoutDot)
  })
  // console.log({mentionMatches})
  if (mentionMatches !== null) {
    messageWithMentions = [...mentionMatches].reduce((acc, mentionedUsername) => {
      const serverMember = serverMembers?.find(m => mentionedUsername.toLowerCase() === m.user.username.toLowerCase())
      return serverMember ? acc.replaceAll(`@${mentionedUsername}`, userMention(serverMember.id)) : acc
    }, message)
  }
  return messageWithMentions ?? message
}