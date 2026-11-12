
import {
  registerAutomationAction,
  initializeAutomationManager,
  startAutomationScheduler
} from "./automation-manager.js";

import { connectAvatarRenderer } from "./core/avatar-manager.js";
import { createVRMRenderer } from "./renderer/vrm-renderer.js";
import { attachAvatarControls } from "./renderer/avatar-controls.js";

// AUTOMATION SYSTEM

registerAutomationAction(
  "show_reminder",
  async input => {
    return { message: input.message };
  }
);

initializeAutomationManager();
startAutomationScheduler();

// AVATAR SYSTEM

const avatarContainer = document.getElementById("avatar-container");

let vrmRenderer = null;
let avatarControls = null;

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

console.log("Ira systems initialized.");
