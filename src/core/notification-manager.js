
/**
 * Ira AI — Notification Manager
 * File: src/core/notification-manager.js
 *
 * Features:
 * - In-app notifications
 * - Notification history
 * - Read/unread management
 * - Notification categories
 * - Browser notification integration
 * - Optional sound callback
 * - Clear and delete notifications
 *
 * Browser notifications require user permission.
 * Android background notifications require native integration.
 */

const STORAGE_KEY = "ira_notifications_v1";
const MAX_NOTIFICATIONS = 300;

const notifications = [];
const listeners = new Set();

let browserPermission = "default";
let soundHandler = null;
let notificationEnabled = true;

function createId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `notification-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

function notifyListeners(event, notification = null) {
  for (const listener of listeners) {
    try {
      listener({
        event,
        notification: notification
          ? { ...notification }
          : null,
      });
    } catch (error) {
      console.error("[Ira Notifications] Listener error:", error);
    }
  }
}

function saveNotifications() {
  try {
    if (typeof localStorage === "undefined") return false;

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(notifications)
    );

    return true;
  } catch (error) {
    console.warn("[Ira Notifications] Save failed:", error);
    return false;
  }
}

function loadNotifications() {
  try {
    if (typeof localStorage === "undefined") return false;

    const saved = localStorage.getItem(STORAGE_KEY);

    if (!saved) return true;

    const parsed = JSON.parse(saved);

    if (!Array.isArray(parsed)) return false;

    notifications.length = 0;

    notifications.push(
      ...parsed
        .filter(item =>
          item &&
          typeof item.id === "string" &&
          typeof item.title === "string"
        )
        .slice(0, MAX_NOTIFICATIONS)
    );

    return true;
  } catch (error) {
    console.warn("[Ira Notifications] Load failed:", error);
    return false;
  }
}

/**
 * Configure notification behavior.
 */
export function configureNotificationManager({
  enabled = true,
  onSound = null,
} = {}) {
  notificationEnabled = enabled === true;

  soundHandler =
    typeof onSound === "function"
      ? onSound
      : null;

  return getNotificationStatus();
}

/**
 * Request browser notification permission.
 *
 * This must be called following a user action,
 * such as tapping an Enable Notifications button.
 */
export async function requestBrowserPermission() {
  if (
    typeof Notification === "undefined"
  ) {
    return {
      supported: false,
      permission: "unsupported",
    };
  }

  browserPermission = await Notification.requestPermission();

  return {
    supported: true,
    permission: browserPermission,
  };
}

/**
 * Create an in-app notification.
 *
 * category examples:
 * reminder, system, ai, security, learning
 */
export function createNotification({
  title,
  message = "",
  category = "system",
  priority = "normal",
  showBrowser = false,
  playSound = false,
  data = null,
} = {}) {
  if (!notificationEnabled) {
    return null;
  }

  if (typeof title !== "string" || !title.trim()) {
    throw new Error("Notification title is required.");
  }

  if (![
    "low",
    "normal",
    "high",
    "urgent",
  ].includes(priority)) {
    throw new Error("Invalid notification priority.");
  }

  const notification = {
    id: createId(),
    title: title.trim(),
    message: String(message),
    category: String(category),
    priority,
    read: false,
    createdAt: new Date().toISOString(),
    data,
  };

  notifications.unshift(notification);

  if (notifications.length > MAX_NOTIFICATIONS) {
    notifications.length = MAX_NOTIFICATIONS;
  }

  saveNotifications();

  notifyListeners("created", notification);

  if (playSound && soundHandler) {
    try {
      soundHandler(notification);
    } catch (error) {
      console.warn("[Ira Notifications] Sound error:", error);
    }
  }

  if (showBrowser) {
    showBrowserNotification(notification);
  }

  return { ...notification };
}

/**
 * Show a browser notification when permitted.
 */
export function showBrowserNotification(notification) {
  if (
    typeof Notification === "undefined" ||
    Notification.permission !== "granted"
  ) {
    return false;
  }

  try {
    new Notification(notification.title, {
      body: notification.message,
      tag: notification.id,
    });

    return true;
  } catch (error) {
    console.warn("[Ira Notifications] Browser notification failed:", error);
    return false;
  }
}

/**
 * Mark one notification as read.
 */
export function markNotificationRead(id) {
  const notification = notifications.find(item => item.id === id);

  if (!notification) return false;

  notification.read = true;

  saveNotifications();
  notifyListeners("read", notification);

  return true;
}

/**
 * Mark every notification as read.
 */
export function markAllNotificationsRead() {
  for (const notification of notifications) {
    notification.read = true;
  }

  saveNotifications();
  notifyListeners("all_read");

  return true;
}

/**
 * Delete one notification.
 */
export function deleteNotification(id) {
  const index = notifications.findIndex(item => item.id === id);

  if (index === -1) return false;

  const [removed] = notifications.splice(index, 1);

  saveNotifications();
  notifyListeners("deleted", removed);

  return true;
}

/**
 * Clear all notifications.
 */
export function clearNotifications() {
  notifications.length = 0;

  saveNotifications();
  notifyListeners("cleared");

  return true;
}

/**
 * Get notifications.
 */
export function getNotifications({
  category = null,
  unreadOnly = false,
  limit = 100,
} = {}) {
  const safeLimit = Math.max(
    0,
    Math.min(Number(limit) || 100, MAX_NOTIFICATIONS)
  );

  return notifications
    .filter(item => {
      if (category && item.category !== category) {
        return false;
      }

      if (unreadOnly && item.read) {
        return false;
      }

      return true;
    })
    .slice(0, safeLimit)
    .map(item => ({ ...item }));
}

/**
 * Count unread notifications.
 */
export function getUnreadNotificationCount() {
  return notifications.filter(item => !item.read).length;
}

/**
 * Subscribe to notification changes.
 */
export function subscribeNotifications(callback) {
  if (typeof callback !== "function") {
    throw new Error("Listener must be a function.");
  }

  listeners.add(callback);

  return () => {
    listeners.delete(callback);
  };
}

/**
 * Enable or disable notifications.
 */
export function setNotificationsEnabled(enabled) {
  notificationEnabled = enabled === true;

  return notificationEnabled;
}

/**
 * Get current notification status.
 */
export function getNotificationStatus() {
  return {
    enabled: notificationEnabled,
    total: notifications.length,
    unread: getUnreadNotificationCount(),
    browserPermission:
      typeof Notification !== "undefined"
        ? Notification.permission
        : "unsupported",
    browserSupported:
      typeof Notification !== "undefined",
    listenerCount: listeners.size,
  };
}

/**
 * Initialize notification storage.
 */
export function initializeNotificationManager() {
  const loaded = loadNotifications();

  return {
    loaded,
    status: getNotificationStatus(),
  };
}
