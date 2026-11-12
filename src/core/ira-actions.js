/**
 * IRA AI — Built-in Actions
 * Version: 1.0.0
 *
 * Connects Ira's built-in capabilities
 * to the Decision Engine.
 */

import {
  registerAction,
  getAction,
  getAvailableActions,
  requestAction,
  getEngineStatus
} from "./decision-engine.js";

import {
  getCurrentMode,
  setMode,
  getAvailableModes
} from "./mode-manager.js";

import { IRA_CONFIG } from "./feature-registry.js";

const BUILT_IN_ACTIONS = [
  {
    id: "get_ira_status",
    name: "Get Ira Status",
    description: "Returns Ira's current system status.",
    category: "system",
    requiresApproval: false,

    handler: async () => ({
      name: IRA_CONFIG.name,
      version: IRA_CONFIG.version,
      mode: getCurrentMode(),
      engine: getEngineStatus(),
      availableModes: getAvailableModes()
    })
  },

  {
    id: "set_mode",
    name: "Change Ira Mode",
    description: "Changes Ira between supported operating modes.",
    category: "settings",
    requiresApproval: false,

    handler: async ({ mode }) => {
      if (!mode) {
        throw new Error("A mode is required.");
      }

      const availableModes = getAvailableModes();

      const modeExists = availableModes.some(item =>
        (typeof item === "string" ? item : item.id) === mode
      );

      if (!modeExists) {
        throw new Error(`Unsupported mode: ${mode}`);
      }

      const result = await setMode(mode);

      if (result === false) {
        throw new Error("Mode change failed.");
      }

      return {
        success: true,
        currentMode: getCurrentMode()
      };
    }
  },

  {
    id: "list_ira_capabilities",
    name: "List Ira Capabilities",
    description: "Lists all currently registered Ira actions.",
    category: "system",
    requiresApproval: false,

    handler: async () => ({
      capabilities: getAvailableActions()
    })
  },

  {
    id: "get_current_mode",
    name: "Get Current Mode",
    description: "Returns Ira's current operating mode.",
    category: "system",
    requiresApproval: false,

    handler: async () => ({
      currentMode: getCurrentMode(),
      availableModes: getAvailableModes()
    })
  }
];

/**
 * Register all built-in actions.
 * Safe to call more than once.
 */
function registerBuiltInActions() {
  const results = [];

  for (const action of BUILT_IN_ACTIONS) {
    if (getAction(action.id)) {
      results.push({
        id: action.id,
        registered: false,
        reason: "Already registered"
      });

      continue;
    }

    try {
      registerAction(action);

      results.push({
        id: action.id,
        registered: true
      });
    } catch (error) {
      results.push({
        id: action.id,
        registered: false,
        error: error.message
      });
    }
  }

  return results;
}

/**
 * Ask the Decision Engine to execute
 * one of Ira's registered actions.
 */
async function runIraAction(actionId, args = {}, context = {}) {
  return requestAction(actionId, args, context);
}

/**
 * Get built-in action definitions.
 */
function getBuiltInActions() {
  return BUILT_IN_ACTIONS.map(({ handler, ...action }) => ({
    ...action
  }));
}

export {
  BUILT_IN_ACTIONS,
  registerBuiltInActions,
  runIraAction,
  getBuiltInActions
};
      
