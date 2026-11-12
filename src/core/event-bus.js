/**
 * IRA AI — Event Bus
 * Version: 1.0.0
 *
 * Features:
 * - Module-to-module communication
 * - Event subscriptions
 * - One-time listeners
 * - Wildcard listeners
 * - Async event handling
 * - Event history
 * - Listener management
 * - Error isolation
 */

const eventListeners = new Map();
const eventHistory = [];

const MAX_EVENT_HISTORY = 500;

let eventSequence = 0;

function createEventId() {
  return `ira-event-${Date.now()}-${++eventSequence}`;
}

/**
 * Subscribe to an event.
 */
function on(eventName, callback, options = {}) {
  if (typeof callback !== "function") {
    throw new TypeError("Event callback must be a function.");
  }

  const {
    once = false,
    priority = 0
  } = options;

  const listener = {
    id: createEventId(),
    callback,
    once,
    priority,
    active: true
  };

  if (!eventListeners.has(eventName)) {
    eventListeners.set(eventName, []);
  }

  eventListeners.get(eventName).push(listener);

  eventListeners.get(eventName).sort(
    (a, b) => b.priority - a.priority
  );

  return () => off(eventName, listener.id);
}

/**
 * Subscribe to an event only once.
 */
function once(eventName, callback, options = {}) {
  return on(eventName, callback, {
    ...options,
    once: true
  });
}

/**
 * Remove a listener.
 */
function off(eventName, listenerId) {
  const listeners = eventListeners.get(eventName);

  if (!listeners) return false;

  const updated = listeners.filter(
    listener => listener.id !== listenerId
  );

  eventListeners.set(eventName, updated);

  if (updated.length === 0) {
    eventListeners.delete(eventName);
  }

  return updated.length !== listeners.length;
}

/**
 * Remove all listeners for an event.
 */
function removeAllListeners(eventName) {
  if (eventName) {
    return eventListeners.delete(eventName);
  }

  eventListeners.clear();
  return true;
}

/**
 * Get listeners for an event.
 */
function getListeners(eventName) {
  return (eventListeners.get(eventName) || [])
    .map(listener => ({
      id: listener.id,
      priority: listener.priority,
      once: listener.once,
      active: listener.active
    }));
}

/**
 * Get all registered event names.
 */
function getEventNames() {
  return [...eventListeners.keys()];
}

/**
 * Store event history.
 */
function recordEvent(event) {
  eventHistory.push(event);

  if (eventHistory.length > MAX_EVENT_HISTORY) {
    eventHistory.shift();
  }
}

/**
 * Emit an event and await its listeners.
 */
async function emit(eventName, payload = null, options = {}) {
  const {
    source = "ira",
    stopOnError = false
  } = options;

  const event = {
    id: createEventId(),
    name: eventName,
    source,
    payload,
    timestamp: new Date().toISOString()
  };

  recordEvent(event);

  const listeners = [
    ...(eventListeners.get(eventName) || []),
    ...(eventListeners.get("*") || [])
  ].sort((a, b) => b.priority - a.priority);

  const results = [];

  for (const listener of listeners) {
    if (!listener.active) continue;

    try {
      const result = await listener.callback(event);

      results.push({
        listenerId: listener.id,
        success: true,
        result
      });
    } catch (error) {
      results.push({
        listenerId: listener.id,
        success: false,
        error: error.message || String(error)
      });

      if (stopOnError) {
        break;
      }
    }

    if (listener.once) {
      const matchingEvent = listener ===
        (eventListeners.get(eventName) || [])
          .find(item => item.id === listener.id)
        ? eventName
        : "*";

      off(matchingEvent, listener.id);
    }
  }

  return {
    eventId: event.id,
    eventName,
    listenerCount: listeners.length,
    results
  };
}

/**
 * Emit without waiting for the result.
 * Errors are handled by emit().
 */
function emitDetached(eventName, payload = null, options = {}) {
  return emit(eventName, payload, options).catch(error => ({
    success: false,
    error: error.message || String(error)
  }));
}

/**
 * Retrieve event history.
 */
function getEventHistory(options = {}) {
  const {
    eventName = null,
    limit = 100
  } = options;

  let history = eventHistory;

  if (eventName) {
    history = history.filter(
      event => event.name === eventName
    );
  }

  return history.slice(-limit).reverse();
}

/**
 * Clear event history.
 */
function clearEventHistory() {
  eventHistory.length = 0;
}

/**
 * Get event bus status.
 */
function getEventBusStatus() {
  let totalListeners = 0;

  for (const listeners of eventListeners.values()) {
    totalListeners += listeners.length;
  }

  return {
    registeredEvents: eventListeners.size,
    totalListeners,
    storedEvents: eventHistory.length
  };
}

export {
  on,
  once,
  off,
  removeAllListeners,
  getListeners,
  getEventNames,
  emit,
  emitDetached,
  getEventHistory,
  clearEventHistory,
  getEventBusStatus
};
    
