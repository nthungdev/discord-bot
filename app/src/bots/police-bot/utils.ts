import { getAnswer } from "../../utils/wordle";
import type { Violation } from "./types";

const censorCharacter = "▓";

export function getRandomPoliceGif() {
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
    "https://tenor.com/view/police-peachu-pechu-afsar-gomu-peachu-gif-4643007441015917766",
    "https://tenor.com/view/handcuff-handcuffs-crime-criminal-illegal-gif-17983892065688760108",
    "https://tenor.com/view/peepo-police-gif-19704800",
    "https://tenor.com/view/stickers-bear-police-bear-siren-crawling-gif-15585735",
    "https://tenor.com/view/borzoi-siren-dawg-with-the-light-on-him-sailorzoop-dog-gif-2844905554045249724",
    "https://tenor.com/view/cat-fbi-fbi-open-up-gif-293416153668306594",
    "https://tenor.com/view/fbi-calling-telephone-dialing-tom-and-jerry-gif-17581243",
    "https://tenor.com/view/fbi-gif-19574432",
  ];
  const randomIndex = Math.floor(Math.random() * gifs.length);
  return gifs[randomIndex];
}

export { buildRegexFromTerms, createFlexiblePattern } from "./detector";

export function censorMessage(message: string, violations: Violation[]) {
  let censoredMessage = message;
  for (const { terms } of violations) {
    for (const term of terms) {
      if (!term) continue;
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(escaped, "giu");
      censoredMessage = censoredMessage.replaceAll(regex, (match) =>
        censorCharacter.repeat(match.length),
      );
    }
  }
  return censoredMessage;
}

export async function getWordleAnswers() {
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
    (a) => a !== null,
  );
}
