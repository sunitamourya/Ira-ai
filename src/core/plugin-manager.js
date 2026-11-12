
/**
 * Ira AI — Plugin Manager
 * File: src/core/plugin-manager.js
 *
 * Features:
 * - Runtime plugin registration
 * - Install, uninstall, enable and disable
 * - Plugin and action validation
 * - Permission declarations and grants
 * - Optional integration with the decision engine
 * - Lifecycle hooks
 * - Execution history
 *
 * Security:
 * - Plugins must be supplied as trusted, imported modules.
 * - No eval(), Function(), or remote code execution.
 * - Plugins receive only the capabilities explicitly provided to them.
 * - Sensitive actions can require explicit approval.
 */

const STORAGE_KEY = "ira_plugin_metadata_v1";

const plugins = new Map();
const grantedPermissions = new Map();
const executionHistory = [];

const MAX_HISTORY = 200;

let permissionChecker = null;
let actionRegistrar = null;
let actionUnregistrar = null;

function clone(value) {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value));
}

function validateId(value, label = "ID") {
  if (
    typeof value !== "string" ||
    !/^[a-z0-9][a-z0-9._-]{1,63}$/i.test(value)
  ) {
    throw new Error(`Invalid ${label}.`);
  }

  return value;
}

function validateManifest(manifest) {
  if (!manifest || typeof manifest !== "object") {
    throw new Error("Plugin manifest is required.");
  }

  validateId(manifest.id, "plugin ID");

  if (
    typeof manifest.name !== "string" ||
    !manifest.name.trim()
  ) {
    throw new Error("Plugin name is required.");
  }

  if (
    typeof manifest.version !== "string" ||
    !manifest.version.trim()
  ) {
    throw new Error("Plugin version is required.");
  }

  const permissions = manifest.permissions ?? [];

  if (!Array.isArray(permissions)) {
    throw new Error("Plugin permissions must be an array.");
  }

  for (const permission of permissions) {
    validateId(permission, "permission");
  }

  return {
    id: manifest.id,
    name: manifest.name.trim(),
    version: manifest.version,
    description: String(manifest.description ?? ""),
    author: String(manifest.author ?? "Unknown"),
    permissions: [...new Set(permissions)],
  };
}

function saveMetadata() {
  try {
    const metadata = [...plugins.values()].map(plugin => ({
      manifest: plugin.manifest,
      enabled: plugin.enabled,
      installedAt: plugin.installedAt,
      updatedAt: plugin.updatedAt,
    }));

    if (typeof localStorage !== "undefined") {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(metadata)
      );
    }

    return true;
  } catch (error) {
    console.warn("[Ira Plugin Manager] Metadata save failed:", error);
    return false;
  }
}

function recordExecution(entry) {
  executionHistory.unshift({
    ...entry,
    timestamp: new Date().toISOString(),
  });

  if (executionHistory.length > MAX_HISTORY) {
    executionHistory.length = MAX_HISTORY;
  }
}

/**
 * Configure integrations.
 *
 * actionRegistrar receives:
 * {
 *   id,
 *   description,
 *   requiresApproval,
 *   handler
 * }
 *
 * Connect it to Ira's decision engine using an adapter
 * that matches the decision engine's actual API.
 */
export function configurePluginManager({
  checkPermission = null,
  registerAction = null,
  unregisterAction = null,
} = {}) {
  permissionChecker =
    typeof checkPermission === "function"
      ? checkPermission
      : null;

  actionRegistrar =
    typeof registerAction === "function"
      ? registerAction
      : null;

  actionUnregistrar =
    typeof unregisterAction === "function"
      ? unregisterAction
      : null;

  return getPluginManagerStatus();
}

/**
 * Install a trusted, already-imported plugin module.
 *
 * Example:
 * installPlugin({
 *   manifest: { ... },
 *   actions: { ... },
 *   onInstall() {},
 *   onEnable() {},
 *   onDisable() {},
 *   onUninstall() {}
 * }, { approved: true });
 */
export async function installPlugin(
  pluginModule,
  { approved = false } = {}
) {
  if (approved !== true) {
    throw new Error("Plugin installation requires user approval.");
  }

  if (!pluginModule || typeof pluginModule !== "object") {
    throw new Error("A trusted plugin module is required.");
  }

  const manifest = validateManifest(pluginModule.manifest);

  if (plugins.has(manifest.id)) {
    throw new Error(`Plugin "${manifest.id}" is already installed.`);
  }

  const actions = pluginModule.actions ?? {};

  if (
    !actions ||
    typeof actions !== "object" ||
    Array.isArray(actions)
  ) {
    throw new Error("Plugin actions must be an object.");
  }

  const preparedActions = new Map();

  for (const [actionId, definition] of Object.entries(actions)) {
    validateId(actionId, "action ID");

    if (!definition || typeof definition !== "object") {
      throw new Error(`Invalid action: ${actionId}`);
    }

    if (typeof definition.handler !== "function") {
      throw new Error(
        `Action "${actionId}" must have a trusted handler function.`
      );
    }

    const requiredPermissions = definition.permissions ?? [];

    if (!Array.isArray(requiredPermissions)) {
      throw new Error(
        `Permissions for "${actionId}" must be an array.`
      );
    }

    for (const permission of requiredPermissions) {
      validateId(permission, "action permission");

      if (!manifest.permissions.includes(permission)) {
        throw new Error(
          `Action "${actionId}" requests undeclared permission "${permission}".`
        );
      }
    }

    preparedActions.set(actionId, {
      id: actionId,
      description: String(definition.description ?? ""),
      permissions: [...new Set(requiredPermissions)],
      requiresApproval: definition.requiresApproval === true,
      handler: definition.handler,
    });
  }

  const plugin = {
    manifest,
    actions: preparedActions,
    enabled: false,
    installedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lifecycle: {
      onInstall: pluginModule.onInstall,
      onEnable: pluginModule.onEnable,
      onDisable: pluginModule.onDisable,
      onUninstall: pluginModule.onUninstall,
    },
  };

  plugins.set(manifest.id, plugin);

  try {
    if (typeof plugin.lifecycle.onInstall === "function") {
      await plugin.lifecycle.onInstall();
    }

    saveMetadata();

    return {
      success: true,
      plugin: getPlugin(manifest.id),
    };
  } catch (error) {
    plugins.delete(manifest.id);
    throw new Error(`Plugin installation failed: ${error.message}`);
  }
}

/**
 * Enable a previously installed plugin.
 */
export async function enablePlugin(pluginId) {
  const plugin = getPluginInternal(pluginId);

  if (plugin.enabled) {
    return { success: true, message: "Plugin is already enabled." };
  }

  plugin.enabled = true;

  try {
    if (typeof plugin.lifecycle.onEnable === "function") {
      await plugin.lifecycle.onEnable();
    }

    // Register plugin actions with the configured action bridge.
    if (actionRegistrar) {
      for (const action of plugin.actions.values()) {
        await actionRegistrar({
          id: `${pluginId}.${action.id}`,
          description: action.description,
          requiresApproval: action.requiresApproval,
          handler: input =>
            runPluginAction(pluginId, action.id, input, {
              approved: false,
            }),
        });
      }
    }

    plugin.updatedAt = new Date().toISOString();
    saveMetadata();

    return { success: true, plugin: getPlugin(pluginId) };
  } catch (error) {
    plugin.enabled = false;
    throw new Error(`Could not enable plugin: ${error.message}`);
  }
}

/**
 * Disable a plugin and unregister its bridged actions.
 */
export async function disablePlugin(pluginId) {
  const plugin = getPluginInternal(pluginId);

  if (!plugin.enabled) {
    return { success: true, message: "Plugin is already disabled." };
  }

  if (actionUnregistrar) {
    for (const action of plugin.actions.values()) {
      await actionUnregistrar(`${pluginId}.${action.id}`);
    }
  }

  if (typeof plugin.lifecycle.onDisable === "function") {
    await plugin.lifecycle.onDisable();
  }

  plugin.enabled = false;
  plugin.updatedAt = new Date().toISOString();

  saveMetadata();

  return { success: true, plugin: getPlugin(pluginId) };
}

/**
 * Uninstall a plugin.
 */
export async function uninstallPlugin(
  pluginId,
  { approved = false } = {}
) {
  if (approved !== true) {
    throw new Error("Plugin removal requires user approval.");
  }

  const plugin = getPluginInternal(pluginId);

  if (plugin.enabled) {
    await disablePlugin(pluginId);
  }

  if (typeof plugin.lifecycle.onUninstall === "function") {
    await plugin.lifecycle.onUninstall();
  }

  plugins.delete(pluginId);
  grantedPermissions.delete(pluginId);

  saveMetadata();

  return { success: true, pluginId };
}

/**
 * Grant a declared permission to an installed plugin.
 */
export function grantPluginPermission(
  pluginId,
  permission,
  { approved = false } = {}
) {
  if (approved !== true) {
    throw new Error("Permission grant requires user approval.");
  }

  const plugin = getPluginInternal(pluginId);
  validateId(permission, "permission");

  if (!plugin.manifest.permissions.includes(permission)) {
    throw new Error("Plugin did not declare this permission.");
  }

  const grants = grantedPermissions.get(pluginId) ?? new Set();
  grants.add(permission);
  grantedPermissions.set(pluginId, grants);

  return getPluginPermissions(pluginId);
}

/**
 * Revoke a plugin permission.
 */
export function revokePluginPermission(pluginId, permission) {
  const plugin = getPluginInternal(pluginId);
  const grants = grantedPermissions.get(pluginId);

  if (grants) {
    grants.delete(permission);
  }

  return getPluginPermissions(pluginId);
}

export function getPluginPermissions(pluginId) {
  const plugin = getPluginInternal(pluginId);
  const grants = grantedPermissions.get(pluginId) ?? new Set();

  return {
    declared: [...plugin.manifest.permissions],
    granted: [...grants],
  };
}

async function hasPermission(pluginId, permission) {
  const grants = grantedPermissions.get(pluginId) ?? new Set();

  if (!grants.has(permission)) {
    return false;
  }

  // Optional native/platform permission check.
  if (permissionChecker) {
    return (await permissionChecker(pluginId, permission)) === true;
  }

  return true;
}

/**
 * Run one registered plugin action.
 *
 * Consequential actions must be explicitly approved by
 * the user before calling this function with approved: true.
 */
export async function runPluginAction(
  pluginId,
  actionId,
  input = {},
  { approved = false } = {}
) {
  const plugin = getPluginInternal(pluginId);

  if (!plugin.enabled) {
    throw new Error("This plugin is disabled.");
  }

  const action = plugin.actions.get(actionId);

  if (!action) {
    throw new Error(`Unknown plugin action: ${actionId}`);
  }

  if (action.requiresApproval && approved !== true) {
    throw new Error("This action requires explicit user approval.");
  }

  for (const permission of action.permissions) {
    if (!(await hasPermission(pluginId, permission))) {
      throw new Error(`Permission not granted: ${permission}`);
    }
  }

  const startedAt = Date.now();

  try {
    const result = await action.handler({
      input: clone(input),
      plugin: {
        id: plugin.manifest.id,
        name: plugin.manifest.name,
      },
      permissions: [...action.permissions],
    });

    recordExecution({
      pluginId,
      actionId,
      success: true,
      durationMs: Date.now() - startedAt,
    });

    return {
      success: true,
      result,
    };
  } catch (error) {
    recordExecution({
      pluginId,
      actionId,
      success: false,
      error: error.message,
      durationMs: Date.now() - startedAt,
    });

    throw error;
  }
}

function getPluginInternal(pluginId) {
  validateId(pluginId, "plugin ID");

  const plugin = plugins.get(pluginId);

  if (!plugin) {
    throw new Error(`Plugin not found: ${pluginId}`);
  }

  return plugin;
}

/**
 * Public plugin information.
 * Handler functions are never exposed.
 */
export function getPlugin(pluginId) {
  const plugin = getPluginInternal(pluginId);

  return {
    manifest: clone(plugin.manifest),
    enabled: plugin.enabled,
    installedAt: plugin.installedAt,
    updatedAt: plugin.updatedAt,
    actions: [...plugin.actions.values()].map(action => ({
      id: action.id,
      description: action.description,
      permissions: [...action.permissions],
      requiresApproval: action.requiresApproval,
    })),
    permissions: getPluginPermissions(pluginId),
  };
}

export function getAllPlugins() {
  return [...plugins.keys()].map(getPlugin);
}

export function getPluginAction(pluginId, actionId) {
  const plugin = getPluginInternal(pluginId);
  const action = plugin.actions.get(actionId);

  if (!action) return null;

  return {
    id: action.id,
    description: action.description,
    permissions: [...action.permissions],
    requiresApproval: action.requiresApproval,
  };
}

export function getPluginExecutionHistory(limit = 50) {
  const safeLimit = Math.max(
    0,
    Math.min(Number(limit) || 50, MAX_HISTORY)
  );

  return clone(executionHistory.slice(0, safeLimit));
}

export function getPluginManagerStatus() {
  return {
    installedPlugins: plugins.size,
    enabledPlugins: [...plugins.values()].filter(p => p.enabled).length,
    totalActions: [...plugins.values()].reduce(
      (total, plugin) => total + plugin.actions.size,
      0
    ),
    permissionBridgeConfigured: Boolean(permissionChecker),
    actionBridgeConfigured: Boolean(actionRegistrar),
    storage: typeof localStorage !== "undefined",
  };
}

/**
 * Read saved plugin metadata.
 *
 * Metadata alone cannot restore executable handlers.
 * Trusted plugin modules must be imported and installed again
 * when the application starts.
 */
export function getSavedPluginMetadata() {
  try {
    if (typeof localStorage === "undefined") return [];

    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return [];

    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function clearPluginMetadata() {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(STORAGE_KEY);
    }

    return true;
  } catch {
    return false;
  }
  }
  
