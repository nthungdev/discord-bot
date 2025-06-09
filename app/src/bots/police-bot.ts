import {
  Client,
  GatewayIntentBits,
  Guild,
  Interaction,
  Message,
  userMention,
} from "discord.js";
import BaseBot, { BaseBotConfig } from "./base-bot";
import { getAnswer } from "../utils/wordle";
import { generateChatMessageWithGenAi, getGenAi } from "../utils/genAi";

interface Violation {
  reason: string;
  terms: string[];
}

const censorCharacter = "▓";

/**
 * Support regex for terms with accented characters and spaces
 */
function buildRegexFromTerms(terms: string[]) {
  const escapedTerms = terms.map((term) => {
    // Escape special regex characters, and normalize spaces
    const escaped = term
      .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\s+/g, "\\s+");
    return `(?<!\\p{L})${escaped}(?!\\p{L})`;
  });

  return new RegExp(escapedTerms.join("|"), "giu"); // g = global, i = ignore case, u = Unicode
}

export default class PoliceBot extends BaseBot {
  protected client: Client;

  constructor(config: BaseBotConfig) {
    super(config);
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

  private async getWordleAnswers() {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York",
    });

    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    // en-CA returns YYYY-MM-DD format
    const todayString = formatter.format(today);
    const yesterdayString = formatter.format(yesterday);
    const tomorrowString = formatter.format(tomorrow);

    const todayAnswer = await getAnswer(todayString);
    const yesterdayAnswer = await getAnswer(yesterdayString);
    const tomorrowAnswer = await getAnswer(tomorrowString);
    return [todayAnswer, yesterdayAnswer, tomorrowAnswer].filter(
      (a) => a !== null
    );
  }
  protected handleNewInteraction(interaction: Interaction): Promise<void> {
    console.log(interaction.applicationId);
    throw new Error("Method not implemented.");
  }

  protected async handleNewMessage(message: Message<boolean>) {
    try {
      if (message.author.bot) return;

      if (!message.inGuild()) return;

      if (!message.channel.isSendable()) {
        console.log("Channel is not sendable, skipping message handling");
        return;
      }

      const violations = await this.analyzeMessageContent(message.content);

      if (violations.length > 0) {
        this.handleViolatedMessage(message, violations);
      }
    } catch (error) {
      console.log("Error handling new message in PoliceBot", error);
    }
  }

  private async handleViolatedMessage(
    message: Message<true>,
    violations: Violation[]
  ) {
    const censoredMessage = this.censorMessage(message.content, violations);

    await message.channel.sendTyping();

    const comment = await this.generateViolationComment(
      message.guild,
      violations.map((v) => v.reason),
      message.content
    );

    // The bot might quote the original message, so we need to censor it as well
    const censoredComment = this.censorMessage(comment, violations);

    const quotedContent = `${userMention(message.author.id)} said:
${censoredMessage
  .split("\n")
  .map((line) => `> ${line}`)
  .join("\n")}`;
    console.log({ censoredMessage, quotedContent, violations });
    await message.reply(quotedContent);
    await Promise.all([
      await message.delete(),
      await message.channel.send(censoredComment),
    ]);
    await message.channel.send(this.getRandomPoliceGif());
  }

  private async analyzeMessageContent(message: string) {
    const bans = [
      {
        reason: `từ ngữ phân biệt chủng tộc tới người da đen`,
        terms: ["nig", "nigger", "niggers"],
      },
      {
        reason: `dùng từ cấm`,
        terms: ["3 que"],
      },
      {
        reason: `dùng từ bậy`,
        terms: [
          "faggot",
          "fuck",
          "shit",
          "bitch",
          "bitches",
          "asshole",
          "assholes",
          "ass hole",
          "dit me",
          "địt mẹ",
          "du me",
          "đụ mẹ",
          "ditme",
          "đĩ",
          "điếm",
          "dit con me",
          "địt con mẹ",
          "địt con đĩ",
          "địt con điếm",
          "du ma",
          "đụ má",
          "chó đẻ",
          "chó đái",
          "chó chết",
          "lồn",
          "loz",
          "cai lon",
          "lon tao",
          "cặc",
          "con cac",
        ],
      },
    ];

    const wordleAnswers = await this.getWordleAnswers();

    if (wordleAnswers.length) {
      bans.push({
        reason: "spoil wordle answer",
        terms: wordleAnswers,
      });
    }

    const violations: Violation[] = [];
    for (const { reason, terms } of bans) {
      const violatedTerms = [];
      const regex = buildRegexFromTerms(terms);
      const matches = [...message.matchAll(regex)];
      if (matches.length === 0) continue;
      violatedTerms.push(...matches.map((m) => m[0]));
      violations.push({
        reason,
        terms: violatedTerms,
      });
    }

    return violations;
  }

  private censorMessage(message: string, violations: Violation[]) {
    let consoredMessage = message;
    for (const { terms } of violations) {
      for (const term of terms) {
        const regex = buildRegexFromTerms([term]);
        consoredMessage = consoredMessage.replaceAll(
          regex,
          censorCharacter.repeat(term.length)
        );
      }
    }
    return consoredMessage;
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
    const randomIndex = Math.floor(Math.random() * gifs.length);
    return gifs[randomIndex];
  }

  private async generateViolationComment(
    guild: Guild,
    violations: string[],
    originalMessage: string
  ) {
    const violationString = violations.join(", ");
    const promptText = `What would you say to a user who violated: ${violationString}? They said: ${originalMessage}`;

    console.log(promptText);

    const genAi = getGenAi({
      guildId: guild.id,
      systemInstruction: `Bạn là Popogon. Bạn là một police bot. Bạn đảm bảo mọi người trong Discord server tuân thủ luật. Bạn nói chuyện bằng tiếng Việt. Bạn châm biếm, hài hước, và mỉa mai. Bạn gọi người khác là sir và gọi bản thân là tôi. Bạn nói chuyện ngắn gọn nhưng xúc tích. Bạn không lập lại từ cấm của người khác. Bạn chỉ dùng emoji ở cuối cùng.`,
      membersInstruction: " ",
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
