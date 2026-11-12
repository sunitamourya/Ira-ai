
import {
  registerAutomationAction,
  initializeAutomationManager,
  startAutomationScheduler
} from "./automation-manager.js";

import {
  connectAvatarRenderer,
  loadAvatar,
  getAvatarState
} from "./core/avatar-manager.js";

import { createVRMRenderer } from "./renderer/vrm-renderer.js";
import { attachAvatarControls } from "./renderer/avatar-controls.js";

// AUTOMATION

registerAutomationAction(
  "show_reminder",
  async input => ({
    message: input.message
  })
);

initializeAutomationManager();
startAutomationScheduler();

// AVATAR INITIALIZATION

const avatarContainer = document.getElementById("avatar-container");
const fileInput = document.getElementById("file");
const message = document.getElementById("message");
const placeholder = document.getElementById("placeholder");

let vrmRenderer = null;
let avatarControls = null;
let currentModelURL = null;

if (avatarContainer) {
  vrmRenderer = createVRMRenderer();

  vrmRenderer.init(avatarContainer);
  connectAvatarRenderer(vrmRenderer);

  avatarControls = attachAvatarControls({
    container: avatarContainer,
    renderer: vrmRenderer,
    resetButton: document.getElementById("reset-view")
  });
}

// VRM UPLOAD

if (fileInput) {
  fileInput.addEventListener("change", async event => {
    const file = event.target.files?.[0];

    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".vrm")) {
      message.textContent = "Please select a .vrm file.";
      fileInput.value = "";
      return;
    }

    if (file.size > 100 * 1024 * 1024) {
      message.textContent = "VRM file is too large (maximum 100 MB).";
      fileInput.value = "";
      return;
    }

    const previousURL = currentModelURL;
    const newURL = URL.createObjectURL(file);

    message.textContent = "Loading Ira's avatar...";

    try {
      await loadAvatar(newURL);

      currentModelURL = newURL;

      if (previousURL) {
        URL.revokeObjectURL(previousURL);
      }

      if (placeholder) {
        placeholder.style.display = "none";
      }

      message.textContent = "Ira's avatar loaded: " + file.name;

    } catch (error) {
      URL.revokeObjectURL(newURL);

      console.error("Avatar loading failed:", error);

      message.textContent =
        "Avatar loading failed: " + error.message;
    }

    fileInput.value = "";
  });
}

// INITIAL STATUS

console.log("Ira automation and avatar systems initialized.");
console.log("Avatar state:", getAvatarState());
      
