import {
  Client,
  Events,
  GatewayIntentBits,
  Guild,
  Message,
  userMention,
} from "discord.js";
import BaseBot from "./base-bot";
import { getAnswer } from "../utils/wordle";
import { generateChatMessageWithGenAi, getGenAi } from "../utils/genAi";

interface PoliceBotConfig {
  token: string;
}

const censorCharacters = "▓▓▓▓▓";

export default class PoliceBot extends BaseBot {
  token: string;
  client: Client;
  lastWordleAnswerTime?: string; // YYYY-MM-DD format
  cachedWordleAnswer?: string;

  constructor(config: PoliceBotConfig) {
    super();
    this.token = config.token;
    this.client = new Client({
      intents: [
        // TODO make sure to only use the intents needed
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessages,
      ],
    });
    this.handleNewMessage = this.handleNewMessage.bind(this);
  }

  activate(): void {
    console.log("Activate PoliceBot");
    this.client.on(Events.MessageCreate, this.handleNewMessage);
  }

  private async getTodayWordleAnswer() {
    // en-CA returns YYYY-MM-DD format
    const todayString = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York",
    }).format();

    if (todayString === this.lastWordleAnswerTime && this.cachedWordleAnswer) {
      return this.cachedWordleAnswer;
    }

    const answer = await getAnswer(todayString);
    this.lastWordleAnswerTime = todayString;
    this.cachedWordleAnswer = answer || undefined;
    return answer;
  }

  private async handleNewMessage(message: Message<boolean>) {
    try {
      if (message.author.bot) return;

      if (!message.inGuild()) return;

      if (!message.channel.isSendable()) {
        console.log("Channel is not sendable, skipping message handling");
        return;
      }

      const wordleAnswer = await this.getTodayWordleAnswer();

      if (!wordleAnswer) {
        console.log(
          "No Wordle answer found for today, skipping message handling"
        );
        return;
      }

      const regex = new RegExp(`\\b${wordleAnswer}\\b`, "gi");
      const matches = [...message.content.matchAll(regex)];

      if (matches.length > 0) {
        // censor the wordle answer in the message
        const censoredContent = message.content.replace(
          regex,
          censorCharacters
        );

        await message.channel.sendTyping();

        const comment = await this.generateComment(message.guild);

        const quotedContent = `${userMention(message.author.id)} said:
${censoredContent
  .split("\n")
  .map((line) => `> ${line}`)
  .join("\n")}`;
        await message.reply(quotedContent);
        await message.delete();
        await message.channel.send(comment);
        await message.channel.send(this.getRandomPoliceGif());
      }
    } catch (error) {
      console.log("Error handling new message in PoliceBot", error);
    }
  }

  private getRandomPoliceGif() {
    const gifs = [
      "https://tenor.com/view/catpopo-gif-14363104828101683866",
      "https://tenor.com/view/cops-police-sirens-catching-crminals-what-you-gonna-do-gif-22472645",
      "https://tenor.com/view/pepe-gif-4322712730189377072",
      "https://tenor.com/view/eric-police-respect-respect-my-authority-south-park-gif-24479349",
      "https://tenor.com/view/super-tr-gif-18865790",
      "https://tenor.com/view/cop-police-popo-policeman-law-gif-17603106871416626477",
      "https://tenor.com/view/pokemon-squirtle-sunglasses-deal-with-it-gif-5634922",
      "https://tenor.com/view/dolerp-dole-department-of-law-enforcement-doj-five-m-gif-23229685",
      "https://tenor.com/view/abhijit-naskar-naskar-law-and-order-law-law-abiding-gif-22892062",
      "https://tenor.com/view/shock-anime-akibas-trip-akibastrip-cop-gif-14686985010886003011",
      "https://tenor.com/view/police-costume-angel-vsfs-victorias-secret-victorias-secret-fasion-show-gif-13764354",
      "https://tenor.com/view/anime-order-is-the-rabbit-gif-9154127",
      "https://tenor.com/view/fbi-kana-gif-7441334008951759059",
      "https://tenor.com/view/police-anime-police-keisatsu-freeze-stop-it-gif-21413596",
      "https://tenor.com/view/handcuffs-brave-police-j-decker-arrested-anime-gif-17728544",
      "https://tenor.com/view/girls-frontline-handcuffs-animated-chibi-police-gif-17783252",
      "https://tenor.com/view/mai-sakurajima-gif-9999869741454015552",
      "https://tenor.com/view/anime-funny-hand-jail-crime-gif-8523482",
      "https://tenor.com/view/capoo-bugcat-cute-arrest-illegal-gif-26565715",
      "https://tenor.com/view/cat-gif-24925438",
    ];
    return gifs[Math.floor(Math.random() * gifs.length)];
  }

  private async generateComment(guild: Guild) {
    const promptText = `What would you say to a user who spoil the Wordle answer in a Discord message?`;

    const genAi = getGenAi({
      guildId: guild.id,
      systemInstruction: `You're Popogon. You are a police bot. You make sure everyone in the Discord server follows the rules. You speak Vietnamese. You are satire. You are funny. You are sarcastic. You use the "sir" pronoun. You only use 1 emoji at the end.`,
    });
    await genAi.init();
    const { content } = await generateChatMessageWithGenAi(
      genAi,
      { text: promptText },
      [],
      guild
    );
    return content;
  }
}
