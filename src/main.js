import {
  registerAutomationAction,
  initializeAutomationManager,
  startAutomationScheduler
} from "./automation-manager.js";

registerAutomationAction(
  "show_reminder",
  async input => {
    return { message: input.message };
  }
);

initializeAutomationManager();
startAutomationScheduler();
