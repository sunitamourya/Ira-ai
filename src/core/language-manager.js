
export const IRA_LANGUAGES = [
  { id: "en", name: "English" },
  { id: "hi", name: "Hindi" },
  { id: "hinglish", name: "Hinglish" },
  { id: "ur", name: "Urdu" },
  { id: "gu", name: "Gujarati" }
];

let currentLanguage = "en";

export function getCurrentLanguage() {
  return IRA_LANGUAGES.find(
    language => language.id === currentLanguage
  );
}

export function setLanguage(languageId) {
  const language = IRA_LANGUAGES.find(
    item => item.id === languageId
  );

  if (!language) return false;

  currentLanguage = languageId;
  return true;
}

export function getAvailableLanguages() {
  return [...IRA_LANGUAGES];
}

export function detectLanguage(text) {
  if (typeof text !== "string") return "en";

  if (/[\u0900-\u097F]/.test(text)) return "hi";
  if (/[\u0A80-\u0AFF]/.test(text)) return "gu";
  if (/[\u0600-\u06FF]/.test(text)) return "ur";

  return "en";
}
