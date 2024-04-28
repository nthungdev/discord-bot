const formatMemberIds = (memberIds: string[]): string =>
  memberIds.reduce(
    (acc, curr) => [...acc, `<@${curr}>`],
    [] as string[]
  ).join(', ')

const message1 = (memberIds: string[]): string => {
  const members = formatMemberIds(memberIds)
  return `${members} bé ơi ngủ đi, đêm đã khuya rồi 🎶`
}

const message2 = (memberIds: string[]): string => {
  const pronoun = memberIds.length > 1 ? ' các ' : ' '
  const members = formatMemberIds(memberIds)
  return `Đề nghị${pronoun}đồng chí ${members} cuốn gói lên giường ngủ`
}

const message3 = (memberIds: string[]): string => {
  const members = formatMemberIds(memberIds)
  return `${members} có biết bây giờ là mấy giờ rồi không?`
}


const message4 = (memberIds: string[]): string => {
  const members = formatMemberIds(memberIds)
  return `${members} it's sleep time!`
}

const getRandomSleepReminderMessage = (memberIds: string[]): string => {
  const messageEngines = [message1, message2, message3, message4]
  const randomIndex = Math.floor(Math.random() * messageEngines.length);
  return messageEngines[randomIndex](memberIds)
}

export { getRandomSleepReminderMessage }