
export const IRA_MODES = {
  normal: {
    id: "normal",
    name: "Normal Mode",
    description: "Friendly, playful and casual",
    style: "warm, natural and conversational"
  },

  accurate: {
    id: "accurate",
    name: "Accurate Mode",
    description: "Focused and precise",
    style: "clear, factual and structured"
  }
};

let currentMode = "normal";

export function getCurrentMode() {
  return IRA_MODES[currentMode];
}

export function setMode(mode) {
  if (!IRA_MODES[mode]) {
    return false;
  }

  currentMode = mode;
  return true;
}

export function getAvailableModes() {
  return Object.values(IRA_MODES);
}
