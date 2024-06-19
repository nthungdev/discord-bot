import { members, instructions } from "./data"

export const IGNORED_CONTENT = `I'm not able to help with that, as I'm only a language model.`

export const ALLOWED_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/gif']

export const getContext = () => {
  // TODO: experiment to see whether the bot still pick up the first member on the list to mention or not
  const shuffledMembers = members.sort(() => Math.random() - 0.5);
  const membersString = shuffledMembers.map(({ name, gender, username }) => `${name} (gender: ${gender}, username: @${username})`).join(', ');
  return [...instructions, `Some of the members are: ${membersString}`].join('; ')
}