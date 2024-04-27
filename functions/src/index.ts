import { onRequest } from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
// import { onSchedule } from "firebase-functions/v2/scheduler";

const sendMessage = async (channelId: string, message: string) => {
  const botToken = TOKEN;

  const headers = new Headers();
  headers.append("Authorization", `Bot ${botToken}`);
  headers.append("Content-Type", "application/json");

  const body = JSON.stringify({
    "content": message,
  });

  try {
    const res = await fetch(`https://discordapp.com/api/channels/${channelId}/messages`, {
      method: "POST",
      headers,
      body,
    })
      .then((response) => response.json());

    logger.info("message sent", { res });
  } catch (error) {
    logger.error("send message failed", { structuredData: true });
  }
};

export const helloWorld = onRequest((request, response) => {
  logger.info("Hello logs!", { structuredData: true });
  response.send("Hello from Firebase!");
});

const CHANNELS = {
  communication: "1205294345951903812",
};

const TOKEN = "MTIzMzUzMzM5NTgxMjc0OTM0NA.GixDID.Q6GC1W4oC-7lafX51FlbCBwOKf72dWZIkcZc48";

// const sendSleepReminder = async () => {
//   logger.info("Sleep reminder running", { structuredData: true });

//   // TODO get users from voice channels
//   // Not possible with REST API, need Gateway API (WebSocket)

//   // TODO compose a message tagging those user's usernames
//   const message = "how are you, @bluegon aniki?";

//   // TODO send the message to #communication
//   await sendMessage(CHANNELS.communication, message);

//   logger.log("sleep reminder finished", { structuredData: true });
//   logger.log(`message: ${message} to ${CHANNELS.communication}`, { structuredData: true });
// };

// // Run once a day at 01:00 AM, remind everyone in the voice channel to sleep
// export const sleepReminder = onSchedule("every day 04:10", async (event) => {
//   await sendSleepReminder();
// });

// Run once a day at 01:00 AM, remind everyone in the voice channel to sleep
export const testMessage = onRequest(async (request, response) => {
  const { message } = request.query;
  // await sendSleepReminder()
  sendMessage(CHANNELS.communication, message?.toString() ?? "I'm bored");
  response.send("Message sent");
});
