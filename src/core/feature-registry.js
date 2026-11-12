
export const IRA_CONFIG = {
  name: "Ira",
  version: "0.1.0",
  personality: "Friendly, caring, playful and helpful",
  defaultMode: "normal",
  languages: ["Hindi", "English", "Hinglish", "Urdu", "Gujarati"],
  confirmationRequired: true
};

export const IRA_FEATURES = [
  { id: "ai-brain", name: "AI Brain", enabled: true, status: "foundation" },
  { id: "voice", name: "Voice Engine", enabled: false, status: "planned" },
  { id: "wake-word", name: "Hey Ira", enabled: false, status: "planned" },
  { id: "background", name: "Background Engine", enabled: false, status: "planned" },
  { id: "memory", name: "Memory System", enabled: false, status: "planned" },
  { id: "emotions", name: "Emotion Engine", enabled: false, status: "planned" },
  { id: "avatar", name: "3D Avatar", enabled: false, status: "planned" },
  { id: "wardrobe", name: "Appearance Studio", enabled: false, status: "planned" },
  { id: "creative", name: "Creative Studio", enabled: false, status: "planned" },
  { id: "learning", name: "Learning Engine", enabled: false, status: "planned" },
  { id: "daily-assistant", name: "Daily Assistant", enabled: false, status: "planned" },
  { id: "privacy", name: "Privacy and Security", enabled: true, status: "foundation" }
];

export function getFeature(id) {
  return IRA_FEATURES.find(feature => feature.id === id);
}

export function getAvailableFeatures() {
  return IRA_FEATURES.filter(feature => feature.enabled);
   }
   
