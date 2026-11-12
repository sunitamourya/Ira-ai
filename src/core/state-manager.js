/**
 * IRA AI — State Manager
 * Version: 1.0.0
 *
 * Features:
 * - Centralized application state
 * - Reactive state subscriptions
 * - Namespaced state
 * - State updates and transactions
 * - Selectors
 * - Change notifications
 * - Persistent browser storage
 * - Import and export
 * - State reset
 */

const DEFAULT_STATE = {
  system: {
    initialized: false,
    status: "idle",
    version: "1.0.0"
  },

  ai: {
    connected: false,
    processing: false,
    model: null,
    provider: null
  },

  conversation: {
    activeId: null,
    messageCount: 0
  },

  voice: {
    enabled: false,
    listening: false,
    speaking: false
  },

  avatar: {
    loaded: false,
    expression: "neutral",
    visible: true
  },

  memory: {
    enabled: true,
    unlocked: false
  },

  settings: {
    language: "auto",
    mode: "normal",
    theme: "dark"
  }
};

let state = structuredClone(DEFAULT_STATE);

const listeners = new Map();
let listenerSequence = 0;
let transactionDepth = 0;
let pendingChanges = new Set();

const STORAGE_KEY = "ira-ai-state-v1";

let persistenceEnabled = true;

/**
 * Safely clone state data.
 */
function clone(value) {
  return structuredClone(value);
}

/**
 * Read a nested state path.
 * Example: getState("voice.listening")
 */
function getState(path = null) {
  const snapshot = clone(state);

  if (!path) return snapshot;

  return path.split(".").reduce(
    (current, key) => current?.[key],
    snapshot
  );
}

/**
 * Create a nested state object if needed.
 */
function setNestedValue(target, path, value) {
  const keys = path.split(".");
  let current = target;

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];

    if (
      !current[key] ||
      typeof current[key] !== "object"
    ) {
      current[key] = {};
    }

    current = current[key];
  }

  current[keys[keys.length - 1]] = value;
}

/**
 * Subscribe to all state changes or a specific path.
 */
function subscribe(callback, path = null) {
  if (typeof callback !== "function") {
    throw new TypeError("Subscriber must be a function.");
  }

  const id = ++listenerSequence;

  listeners.set(id, {
    callback,
    path
  });

  return () => listeners.delete(id);
}

/**
 * Notify subscribers about state changes.
 */
function notify(changedPaths) {
  const snapshot = clone(state);

  for (const [id, listener] of listeners) {
    const matches = changedPaths.some(changed => {
      if (!listener.path) return true;

      return (
        changed === listener.path ||
        changed.startsWith(listener.path + ".") ||
        listener.path.startsWith(changed + ".")
      );
    });

    if (!matches) continue;

    try {
      listener.callback({
        state: snapshot,
        changedPaths: [...changedPaths]
      });
    } catch (error) {
      console.error("Ira state subscriber error:", error);
    }
  }
}

/**
 * Update a state path.
 */
function setState(path, value) {
  if (typeof path !== "string" || !path.trim()) {
    throw new TypeError("A valid state path is required.");
  }

  setNestedValue(state, path, clone(value));

  pendingChanges.add(path);

  if (transactionDepth === 0) {
    flushChanges();
  }

  return getState(path);
}

/**
 * Update a state object using a function.
 */
function updateState(path, updater) {
  if (typeof updater !== "function") {
    throw new TypeError("Updater must be a function.");
  }

  const current = getState(path);
  const next = updater(current);

  return setState(path, next);
}

/**
 * Apply multiple updates as one transaction.
 */
function transaction(callback) {
  if (typeof callback !== "function") {
    throw new TypeError("Transaction callback is required.");
  }

  transactionDepth++;

  try {
    return callback({
      getState,
      setState,
      updateState
    });
  } finally {
    transactionDepth--;

    if (transactionDepth === 0) {
      flushChanges();
    }
  }
}

/**
 * Notify listeners and persist changes.
 */
function flushChanges() {
  if (pendingChanges.size === 0) return;

  const changes = [...pendingChanges];
  pendingChanges.clear();

  notify(changes);
  saveState();
}

/**
 * Reset all state or one state namespace.
 */
function resetState(path = null) {
  if (!path) {
    state = clone(DEFAULT_STATE);
    pendingChanges.add("*");
  } else {
    const defaultValue = path.split(".").reduce(
      (current, key) => current?.[key],
      DEFAULT_STATE
    );

    setNestedValue(
      state,
      path,
      defaultValue === undefined ? null : clone(defaultValue)
    );

    pendingChanges.add(path);
  }

  if (transactionDepth === 0) {
    flushChanges();
  }

  return getState();
}

/**
 * Select a derived value from state.
 */
function selectState(selector) {
  if (typeof selector !== "function") {
    throw new TypeError("Selector must be a function.");
  }

  return selector(getState());
}

/**
 * Save state in browser storage.
 */
function saveState() {
  if (!persistenceEnabled) return false;

  try {
    if (typeof localStorage === "undefined") {
      return false;
    }

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(state)
    );

    return true;
  } catch (error) {
    console.error("Ira state persistence failed:", error);
    return false;
  }
}

/**
 * Restore saved state.
 */
function loadState() {
  if (typeof localStorage === "undefined") {
    return false;
  }

  try {
    const saved = localStorage.getItem(STORAGE_KEY);

    if (!saved) return false;

    const parsed = JSON.parse(saved);

    if (!parsed || typeof parsed !== "object") {
      return false;
    }

    state = {
      ...clone(DEFAULT_STATE),
      ...parsed
    };

    notify(["*"]);

    return true;
  } catch (error) {
    console.error("Ira state restoration failed:", error);
    return false;
  }
}

/**
 * Enable or disable automatic persistence.
 */
function configurePersistence(enabled) {
  persistenceEnabled = Boolean(enabled);

  if (persistenceEnabled) {
    saveState();
  }

  return persistenceEnabled;
}

/**
 * Export current state.
 */
function exportState() {
  return JSON.stringify({
    version: "1.0.0",
    exportedAt: new Date().toISOString(),
    state: getState()
  }, null, 2);
}

/**
 * Import state.
 */
function importState(json) {
  const data = JSON.parse(json);

  if (!data.state || typeof data.state !== "object") {
    throw new Error("Invalid Ira state backup.");
  }

  state = {
    ...clone(DEFAULT_STATE),
    ...data.state
  };

  pendingChanges.add("*");
  flushChanges();

  return getState();
}

/**
 * Remove saved browser state.
 */
function clearSavedState() {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(STORAGE_KEY);
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Get manager diagnostics.
 */
function getStateManagerStatus() {
  return {
    subscribers: listeners.size,
    persistenceEnabled,
    transactionActive: transactionDepth > 0,
    pendingChanges: pendingChanges.size
  };
}

export {
  getState,
  setState,
  updateState,
  subscribe,
  transaction,
  resetState,
  selectState,
  saveState,
  loadState,
  configurePersistence,
  exportState,
  importState,
  clearSavedState,
  getStateManagerStatus
};
