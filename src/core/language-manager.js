const LANGUAGES = {
  en: {
    id: "en",
    name: "English",
    nativeName: "English",
    script: "Latin"
  },
  hi: {
    id: "hi",
    name: "Hindi",
    nativeName: "हिन्दी",
    script: "Devanagari"
  },
  hinglish: {
    id: "hinglish",
    name: "Hinglish",
    nativeName: "Hinglish",
    script: "Latin"
  },
  ur: {
    id: "ur",
    name: "Urdu",
    nativeName: "اردو",
    script: "Arabic"
  },
  gu: {
    id: "gu",
    name: "Gujarati",
    nativeName: "ગુજરાતી",
    script: "Gujarati"
  }
};

const LANGUAGE_INSTRUCTIONS = {
  en: "Reply naturally in clear English.",
  hi: "Reply naturally in Hindi using Devanagari script.",
  hinglish: "Reply naturally in conversational Hinglish using Roman script.",
  ur: "Reply naturally in Urdu. Prefer Urdu script unless the user uses Roman Urdu.",
  gu: "Reply naturally in Gujarati using Gujarati script."
};

let preferredLanguage = "auto";
let responseLanguage = "auto";
let lastDetectedLanguage = "en";

const DEVANAGARI = /[\u0900-\u097F]/;
const GUJARATI = /[\u0A80-\u0AFF]/;
const ARABIC = /[\u0600-\u06FF]/;

const HINDI_WORDS = new Set([
  "hai", "hain", "ho", "ka", "ki", "ke",
  "kya", "kyun", "kaise", "mera", "meri",
  "tum", "aap", "mujhe", "nahi", "nahin",
  "haan", "accha", "achha", "bahut",
  "karna", "karo", "chahiye", "matlab",
  "aur", "lekin", "abhi", "kal", "mera"
]);

const URDU_WORDS = new Set([
  "aap", "ap", "aapka", "aapki", "mujhe",
  "mujhy", "hai", "hain", "nahi", "nahin",
  "kyun", "kya", "kaise", "shukriya",
  "meherbani", "janab", "khuda", "acha",
  "theek", "bohat", "zaroor"
]);

function countWords(text, dictionary) {
  const words = text
    .toLowerCase()
    .replace(/[^\p{L}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);

  return words.filter(word => dictionary.has(word)).length;
}

function detectRomanLanguage(text) {
  const hindiScore = countWords(text, HINDI_WORDS);
  const urduScore = countWords(text, URDU_WORDS);

  if (hindiScore === 0 && urduScore === 0) {
    return "en";
  }

  if (urduScore > hindiScore) return "ur";
  if (hindiScore > urduScore) return "hinglish";

  return "hinglish";
}

export function detectLanguage(text) {
  if (typeof text !== "string" || !text.trim()) {
    return lastDetectedLanguage;
  }

  if (GUJARATI.test(text)) return "gu";
  if (DEVANAGARI.test(text)) return "hi";
  if (ARABIC.test(text)) return "ur";

  return detectRomanLanguage(text);
}

export function setPreferredLanguage(languageId) {
  if (
    languageId !== "auto" &&
    !LANGUAGES[languageId]
  ) {
    return false;
  }

  preferredLanguage = languageId;
  return true;
}

export function setResponseLanguage(languageId) {
  if (
    languageId !== "auto" &&
    !LANGUAGES[languageId]
  ) {
    return false;
  }

  responseLanguage = languageId;
  return true;
}

export function getCurrentLanguage() {
  return preferredLanguage === "auto"
    ? LANGUAGES[lastDetectedLanguage]
    : LANGUAGES[preferredLanguage];
}

export function getAvailableLanguages() {
  return Object.values(LANGUAGES).map(language => ({
    ...language
  }));
}

export function processUserLanguage(text) {
  const detected = detectLanguage(text);
  lastDetectedLanguage = detected;

  const selected =
    preferredLanguage === "auto"
      ? detected
      : preferredLanguage;

  const output =
    responseLanguage === "auto"
      ? selected
      : responseLanguage;

  return {
    detectedLanguage: detected,
    preferredLanguage,
    responseLanguage: output,
    language: LANGUAGES[output],
    instruction: LANGUAGE_INSTRUCTIONS[output]
  };
}

export function getLanguageInstruction(languageId) {
  return LANGUAGE_INSTRUCTIONS[languageId] ?? null;
}

export function resetLanguageSettings() {
  preferredLanguage = "auto";
  responseLanguage = "auto";
  lastDetectedLanguage = "en";
  }
  
