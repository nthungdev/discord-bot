import type { Violation } from "./types";

export interface BanRule {
  reason: string;
  terms: (string | RegExp)[];
}

const CHAR_MAP: Record<string, string> = {
  a: "[aàáảãạăằắẳẵặâầấẩẫậ4@]",
  à: "[aàáảãạăằắẳẵặâầấẩẫậ4@]",
  á: "[aàáảãạăằắẳẵặâầấẩẫậ4@]",
  ả: "[aàáảãạăằắẳẵặâầấẩẫậ4@]",
  ã: "[aàáảãạăằắẳẵặâầấẩẫậ4@]",
  ạ: "[aàáảãạăằắẳẵặâầấẩẫậ4@]",
  ă: "[aàáảãạăằắẳẵặâầấẩẫậ4@]",
  ằ: "[aàáảãạăằắẳẵặâầấẩẫậ4@]",
  ắ: "[aàáảãạăằắẳẵặâầấẩẫậ4@]",
  ẳ: "[aàáảãạăằắẳẵặâầấẩẫậ4@]",
  ẵ: "[aàáảãạăằắẳẵặâầấẩẫậ4@]",
  ặ: "[aàáảãạăằắẳẵặâầấẩẫậ4@]",
  â: "[aàáảãạăằắẳẵặâầấẩẫậ4@]",
  ầ: "[aàáảãạăằắẳẵặâầấẩẫậ4@]",
  ấ: "[aàáảãạăằắẳẵặâầấẩẫậ4@]",
  ẩ: "[aàáảãạăằắẳẵặâầấẩẫậ4@]",
  ẫ: "[aàáảãạăằắẳẵặâầấẩẫậ4@]",
  ậ: "[aàáảãạăằắẳẵặâầấẩẫậ4@]",
  b: "[b8]",
  c: "[c]",
  d: "[dđ]",
  đ: "[dđ]",
  e: "[eèéẻẽẹêềếểễệ3]",
  è: "[eèéẻẽẹêềếểễệ3]",
  é: "[eèéẻẽẹêềếểễệ3]",
  ẻ: "[eèéẻẽẹêềếểễệ3]",
  ẽ: "[eèéẻẽẹêềếểễệ3]",
  ẹ: "[eèéẻẽẹêềếểễệ3]",
  ê: "[eèéẻẽẹêềếểễệ3]",
  ề: "[eèéẻẽẹêềếểễệ3]",
  ế: "[eèéẻẽẹêềếểễệ3]",
  ể: "[eèéẻẽẹêềếểễệ3]",
  ễ: "[eèéẻẽẹêềếểễệ3]",
  ệ: "[eèéẻẽẹêềếểễệ3]",
  g: "[g]",
  h: "[h]",
  i: "[iìíỉĩị1!|]",
  ì: "[iìíỉĩị1!|]",
  í: "[iìíỉĩị1!|]",
  ỉ: "[iìíỉĩị1!|]",
  ĩ: "[iìíỉĩị1!|]",
  ị: "[iìíỉĩị1!|]",
  j: "[j]",
  k: "[k]",
  l: "[l1|]",
  m: "[m]",
  n: "[n]",
  o: "[oòóỏõọôồốổỗộơờớởỡợ0]",
  ò: "[oòóỏõọôồốổỗộơờớởỡợ0]",
  ó: "[oòóỏõọôồốổỗộơờớởỡợ0]",
  ỏ: "[oòóỏõọôồốổỗộơờớởỡợ0]",
  õ: "[oòóỏõọôồốổỗộơờớởỡợ0]",
  ọ: "[oòóỏõọôồốổỗộơờớởỡợ0]",
  ô: "[oòóỏõọôồốổỗộơờớởỡợ0]",
  ồ: "[oòóỏõọôồốổỗộơờớởỡợ0]",
  ố: "[oòóỏõọôồốổỗộơờớởỡợ0]",
  ổ: "[oòóỏõọôồốổỗộơờớởỡợ0]",
  ỗ: "[oòóỏõọôồốổỗộơờớởỡợ0]",
  ộ: "[oòóỏõọôồốổỗộơờớởỡợ0]",
  ơ: "[oòóỏõọôồốổỗộơờớởỡợ0]",
  ờ: "[oòóỏõọôồốổỗộơờớởỡợ0]",
  ớ: "[oòóỏõọôồốổỗộơờớởỡợ0]",
  ở: "[oòóỏõọôồốổỗộơờớởỡợ0]",
  ỡ: "[oòóỏõọôồốổỗộơờớởỡợ0]",
  ợ: "[oòóỏõọôồốổỗộơờớởỡợ0]",
  p: "[p]",
  r: "[r]",
  s: "[s5$]",
  t: "[t7+]",
  u: "[uùúủũụưừứửữự]",
  ù: "[uùúủũụưừứửữự]",
  ú: "[uùúủũụưừứửữự]",
  ủ: "[uùúủũụưừứửữự]",
  ũ: "[uùúủũụưừứửữự]",
  ụ: "[uùúủũụưừứửữự]",
  ư: "[uùúủũụưừứửữự]",
  ừ: "[uùúủũụưừứửữự]",
  ứ: "[uùúủũụưừứửữự]",
  ử: "[uùúủũụưừứửữự]",
  ữ: "[uùúủũụưừứửữự]",
  ự: "[uùúủũụưừứửữự]",
  v: "[v]",
  w: "[w]",
  x: "[x]",
  y: "[yỳýỷỹỵ]",
  ỳ: "[yỳýỷỹỵ]",
  ý: "[yỳýỷỹỵ]",
  ỷ: "[yỳýỷỹỵ]",
  ỹ: "[yỳýỷỹỵ]",
  ỵ: "[yỳýỷỹỵ]",
  z: "[z]",
};

/**
 * Creates a regex pattern string that matches a word or phrase with support for:
 * - Character repetitions (e.g. "niiiigggeer")
 * - Optional separator punctuation/spaces between characters (e.g. "n.i.g.g.e.r", "n i g g a")
 * - Leetspeak substitutions (e.g. "@", "1", "3", "0", "$")
 * - Word boundaries avoiding false positives in benign words (e.g. "Nigeria", "Japan")
 */
export function createFlexiblePattern(term: string): string {
  const words = term.trim().split(/\s+/);
  const wordPatterns = words.map((word) => {
    const chars = [...word.toLowerCase()];
    const charPatterns = chars.map((char) => {
      const mapped = CHAR_MAP[char];
      if (mapped) {
        return `${mapped}+`;
      }
      const escaped = char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return `${escaped}+`;
    });
    // In-between characters of the same word, allow optional separators
    return charPatterns.join("[\\s._\\-*~]*");
  });

  // In-between words, require at least one whitespace or separator
  const body = wordPatterns.join("[\\s._\\-*~]+");
  return `(?<!\\p{L})${body}(?!\\p{L})`;
}

/**
 * Builds a compiled RegExp for a list of string terms or existing RegExps.
 */
export function buildRegexFromTerms(terms: (string | RegExp)[]): RegExp {
  const patterns = terms.map((term) => {
    if (term instanceof RegExp) {
      const src = term.source;
      if (src.startsWith("(?<!") || src.startsWith("\\b")) {
        return src;
      }
      return `(?<!\\p{L})${src}(?!\\p{L})`;
    }
    return createFlexiblePattern(term);
  });

  return new RegExp(patterns.join("|"), "giu");
}

/**
 * Curated list of English racial and ethnic slurs.
 */
export const ENGLISH_RACIST_TERMS: (string | RegExp)[] = [
  // Anti-Black slurs & variants
  "nigger",
  "niggers",
  "nigga",
  "niggas",
  "niggaz",
  "niggah",
  "niggahs",
  /n+[i1!|]+g{2,}[e3a@u]+r*s*/,
  /n+[i1!|]+g{2,}[a@]+s*/,
  /n+[i1!|]+g+[a@]+h+s*/,
  "negro",
  "negros",
  "negroes",
  "coon",
  "coons",
  "darky",
  "darkies",
  "darkie",
  "jigaboo",
  "jigaboos",
  "jiggaboo",
  "jiggaboos",
  "pickaninny",
  "pickaninnies",
  "tarbaby",
  "tar baby",
  "tarbabies",

  // Anti-Asian slurs & variants
  "chink",
  "chinks",
  "chinky",
  /c+h+[i1!|]+n+k+[i1!ys]*/,
  "gook",
  "gooks",
  "gooky",
  "slant eye",
  "slant eyes",
  "slant-eye",
  "slant-eyes",
  "zipperhead",
  "zipperheads",
  "jap",
  "japs",
  "ching chong",
  "ching chong ding dong",

  // Anti-Hispanic / Latino slurs
  "spic",
  "spics",
  "spick",
  "spicks",
  "wetback",
  "wetbacks",
  "beaner",
  "beaners",

  // Antisemitic & Middle-Eastern slurs
  "kike",
  "kikes",
  "raghead",
  "ragheads",
  "towelhead",
  "towelheads",
  "paki",
  "pakis",
];

/**
 * Curated list of Vietnamese racial slurs and derogatory ethnic/regional slurs.
 * Includes accented and unaccented variations.
 */
export const VIETNAMESE_RACIST_TERMS: (string | RegExp)[] = [
  // Anti-Black & ethnic slurs
  "mọi đen",
  "moi den",
  "mọi da đen",
  "moi da den",
  "mọi rợ",
  "moi ro",
  "mọi miên",
  "moi mien",
  "mọi hồi",
  "moi hoi",
  "mọi tàu",
  "moi tau",
  "thằng mọi",
  "thang moi",
  "con mọi",
  "con moi",
  "lũ mọi",
  "lu moi",
  "bọn mọi",
  "bon moi",
  "đồ mọi",
  "do moi",
  "khỉ mọi",
  "khi moi",
  "da đen bẩn thỉu",
  "da den ban thiu",

  // Regional hate speech and ethnic slurs
  "bắc kỳ chó",
  "bac ky cho",
  "bắc kì chó",
  "bac ki cho",
  "bắc cầy",
  "bac cay",
  "nam kỳ chó",
  "nam ky cho",
  "nam kì chó",
  "nam ki cho",
  "nam cầy",
  "nam cay",
  "bucky chó",
  "bucky cho",
  "parky chó",
  "parky cho",
  "bake chó",
  "bake cho",
  "namke chó",
  "namke cho",
  "tàu khựa",
  "tau khua",
  "khựa",
  "khua",
  "ba tàu",
  "ba tau",
];

export const RACIST_BAN_RULES: BanRule[] = [
  {
    reason: "từ ngữ phân biệt chủng tộc",
    terms: [...ENGLISH_RACIST_TERMS, ...VIETNAMESE_RACIST_TERMS],
  },
];

/**
 * Analyzes message content against racist and hate speech ban rules.
 * Returns violations with matched terms.
 */
export function detectRacistViolations(message: string): Violation[] {
  if (!message || typeof message !== "string") {
    return [];
  }

  const normalizedMessage = message.normalize("NFC");
  const violations: Violation[] = [];

  for (const { reason, terms } of RACIST_BAN_RULES) {
    const regex = buildRegexFromTerms(terms);
    const matches = [...normalizedMessage.matchAll(regex)];
    if (matches.length === 0) continue;

    const matchedTerms = [...new Set(matches.map((m) => m[0]))];
    violations.push({
      reason,
      terms: matchedTerms,
    });
  }

  return violations;
}
