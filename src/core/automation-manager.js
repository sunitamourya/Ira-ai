
/**
 * Ira AI — Automation Manager
 * File: src/core/automation-manager.js
 *
 * Manages reminders and scheduled automations.
 *
 * Important:
 * - This is the web-side scheduler.
 * - It runs only while the application scheduler is active.
 * - Background Android scheduling requires native Android integration.
 * - Only explicitly registered action handlers can execute.
 */

const STORAGE_KEY = "ira_automations_v1";
const HISTORY_KEY = "ira_automation_history_v1";

const automations = new Map();
const handlers = new Map();
const executionHistory = [];

const MAX_HISTORY = 200;

let schedulerTimer = null;
let schedulerInterval = 15000;
let approvalHandler = null;
let notificationHandler = null;

function createId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `ira-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

function validDate(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid scheduled date.");
  }

  return date;
}

function saveData() {
  try {
    if (typeof localStorage === "undefined") return false;

    const data = [...automations.values()].map(task => ({
      ...task,
    }));

    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));

    localStorage.setItem(
      HISTORY_KEY,
      JSON.stringify(executionHistory)
    );

    return true;
  } catch (error) {
    console.warn("[Ira Automation] Save failed:", error);
    return false;
  }
}

function loadData() {
  try {
    if (typeof localStorage === "undefined") return false;

    const saved = localStorage.getItem(STORAGE_KEY);
    const history = localStorage.getItem(HISTORY_KEY);

    if (saved) {
      const parsed = JSON.parse(saved);

      if (Array.isArray(parsed)) {
        for (const task of parsed) {
          if (
            task &&
            typeof task.id === "string" &&
            typeof task.actionId === "string"
          ) {
            automations.set(task.id, task);
          }
        }
      }
    }

    if (history) {
      const parsedHistory = JSON.parse(history);

      if (Array.isArray(parsedHistory)) {
        executionHistory.push(...parsedHistory.slice(0, MAX_HISTORY));
      }
    }

    return true;
  } catch (error) {
    console.warn("[Ira Automation] Load failed:", error);
    return false;
  }
}

/**
 * Configure approval and notification integrations.
 */
export function configureAutomationManager({
  onApprovalRequired = null,
  onNotification = null,
  intervalMs = 15000,
} = {}) {
  approvalHandler =
    typeof onApprovalRequired === "function"
      ? onApprovalRequired
      : null;

  notificationHandler =
    typeof onNotification === "function"
      ? onNotification
      : null;

  schedulerInterval = Math.max(
    5000,
    Math.min(Number(intervalMs) || 15000, 300000)
  );

  return getAutomationStatus();
}

/**
 * Register a trusted action handler.
 *
 * Example:
 * registerAutomationAction("show_reminder", async input => {
 *   return { message: input.message };
 * });
 */
export function registerAutomationAction(
  actionId,
  handler,
  { requiresApproval = false } = {}
) {
  if (
    typeof actionId !== "string" ||
    !/^[a-z0-9._-]{2,64}$/i.test(actionId)
  ) {
    throw new Error("Invalid automation action ID.");
  }

  if (typeof handler !== "function") {
    throw new Error("Action handler must be a function.");
  }

  if (handlers.has(actionId)) {
    throw new Error(`Action already registered: ${actionId}`);
  }

  handlers.set(actionId, {
    handler,
    requiresApproval: requiresApproval === true,
  });

  return true;
}

export function unregisterAutomationAction(actionId) {
  return handlers.delete(actionId);
}

/**
 * Calculate the next scheduled time.
 */
function calculateNextRun(task, fromDate = new Date()) {
  if (task.repeat === "once") {
    return null;
  }

  const current = new Date(fromDate);
  const scheduled = new Date(task.scheduledAt);

  if (task.repeat === "daily") {
    const next = new Date(current);
    next.setHours(
      scheduled.getHours(),
      scheduled.getMinutes(),
      0,
      0
    );

    if (next <= current) {
      next.setDate(next.getDate() + 1);
    }

    return next.toISOString();
  }

  if (task.repeat === "weekly") {
    const next = new Date(current);
    const targetDay = scheduled.getDay();

    next.setHours(
      scheduled.getHours(),
      scheduled.getMinutes(),
      0,
      0
    );

    let difference = (targetDay - current.getDay() + 7) % 7;

    if (difference === 0 && next <= current) {
      difference = 7;
    }

    next.setDate(next.getDate() + difference);

    return next.toISOString();
  }

  throw new Error(`Unsupported repeat type: ${task.repeat}`);
}

/**
 * Create a scheduled automation.
 *
 * repeat:
 * - once
 * - daily
 * - weekly
 */
export function createAutomation({
  title,
  description = "",
  actionId,
  input = {},
  scheduledAt,
  repeat = "once",
  requiresApproval = false,
}) {
  if (!title || typeof title !== "string") {
    throw new Error("Automation title is required.");
  }

  if (!handlers.has(actionId)) {
    throw new Error(`Unknown automation action: ${actionId}`);
  }

  if (!["once", "daily", "weekly"].includes(repeat)) {
    throw new Error("Repeat must be once, daily, or weekly.");
  }

  const date = validDate(scheduledAt);

  if (date <= new Date()) {
    throw new Error("Scheduled time must be in the future.");
  }

  const id = createId();

  const task = {
    id,
    title: title.trim(),
    description: String(description),
    actionId,
    input,
    scheduledAt: date.toISOString(),
    nextRunAt: date.toISOString(),
    repeat,
    requiresApproval: requiresApproval === true,
    enabled: true,
    status: "scheduled",
    createdAt: new Date().toISOString(),
    lastRunAt: null,
    lastError: null,
  };

  automations.set(id, task);
  saveData();

  return { ...task };
}

/**
 * Enable a previously paused automation.
 */
export function enableAutomation(id) {
  const task = getAutomationInternal(id);

  if (task.status === "completed" && task.repeat === "once") {
    throw new Error("A completed one-time automation cannot be resumed.");
  }

  task.enabled = true;
  task.status = "scheduled";
  task.lastError = null;

  saveData();

  return { ...task };
}

/**
 * Pause an automation.
 */
export function pauseAutomation(id) {
  const task = getAutomationInternal(id);

  task.enabled = false;
  task.status = "paused";

  saveData();

  return { ...task };
}

/**
 * Delete an automation.
 */
export function deleteAutomation(id) {
  if (!automations.has(id)) {
    throw new Error("Automation not found.");
  }

  automations.delete(id);
  saveData();

  return true;
}

/**
 * Update a scheduled time.
 */
export function rescheduleAutomation(id, scheduledAt) {
  const task = getAutomationInternal(id);
  const date = validDate(scheduledAt);

  if (date <= new Date()) {
    throw new Error("New scheduled time must be in the future.");
  }

  task.scheduledAt = date.toISOString();
  task.nextRunAt = date.toISOString();
  task.status = "scheduled";
  task.enabled = true;
  task.lastError = null;

  saveData();

  return { ...task };
}

function getAutomationInternal(id) {
  const task = automations.get(id);

  if (!task) {
    throw new Error("Automation not found.");
  }

  return task;
}

/**
 * Execute one automation.
 */
async function executeAutomation(task) {
  const registered = handlers.get(task.actionId);

  if (!registered) {
    task.status = "error";
    task.lastError = "Action handler is unavailable.";

    saveData();
    return;
  }

  const needsApproval =
    task.requiresApproval || registered.requiresApproval;

  if (needsApproval) {
    if (!approvalHandler) {
      task.status = "awaiting_approval";
      task.lastError = "Approval handler is not configured.";

      saveData();
      return;
    }

    let approved = false;

    try {
      approved = await approvalHandler({
        automationId: task.id,
        title: task.title,
        actionId: task.actionId,
        input: task.input,
      });
    } catch (error) {
      task.lastError = error.message;
    }

    if (approved !== true) {
      task.status = "awaiting_approval";
      saveData();
      return;
    }
  }

  try {
    const result = await registered.handler(task.input);

    task.lastRunAt = new Date().toISOString();
    task.lastError = null;

    executionHistory.unshift({
      automationId: task.id,
      title: task.title,
      actionId: task.actionId,
      success: true,
      timestamp: task.lastRunAt,
    });

    if (task.repeat === "once") {
      task.enabled = false;
      task.status = "completed";
      task.nextRunAt = null;
    } else {
      task.nextRunAt = calculateNextRun(task);
      task.status = "scheduled";
    }

    if (notificationHandler) {
      await notificationHandler({
        type: "automation_completed",
        title: task.title,
        result,
      });
    }
  } catch (error) {
    task.status = "error";
    task.lastError = String(error.message || error);

    executionHistory.unshift({
      automationId: task.id,
      title: task.title,
      actionId: task.actionId,
      success: false,
      error: task.lastError,
      timestamp: new Date().toISOString(),
    });
  }

  if (executionHistory.length > MAX_HISTORY) {
    executionHistory.length = MAX_HISTORY;
  }

  saveData();
}

/**
 * Check all due tasks.
 *
 * Can be called manually or by the scheduler.
 */
export async function runDueAutomations() {
  const now = Date.now();
  const dueTasks = [...automations.values()].filter(task =>
    task.enabled &&
    task.status === "scheduled" &&
    task.nextRunAt &&
    new Date(task.nextRunAt).getTime() <= now
  );

  for (const task of dueTasks) {
    await executeAutomation(task);
  }

  return {
    checked: automations.size,
    executed: dueTasks.length,
  };
}

/**
 * Start the in-app scheduler.
 */
export function startAutomationScheduler() {
  if (schedulerTimer !== null) {
    return { running: true, message: "Scheduler already running." };
  }

  schedulerTimer = setInterval(() => {
    runDueAutomations().catch(error => {
      console.error("[Ira Automation] Scheduler error:", error);
    });
  }, schedulerInterval);

  return {
    running: true,
    intervalMs: schedulerInterval,
  };
}

/**
 * Stop the in-app scheduler.
 */
export function stopAutomationScheduler() {
  if (schedulerTimer !== null) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }

  return { running: false };
}

export function getAutomation(id) {
  const task = getAutomationInternal(id);
  return { ...task };
}

export function getAllAutomations() {
  return [...automations.values()].map(task => ({ ...task }));
}

export function getAutomationHistory(limit = 50) {
  const safeLimit = Math.max(
    0,
    Math.min(Number(limit) || 50, MAX_HISTORY)
  );

  return executionHistory.slice(0, safeLimit).map(item => ({
    ...item,
  }));
}

export function getAutomationStatus() {
  const tasks = [...automations.values()];

  return {
    total: tasks.length,
    scheduled: tasks.filter(t => t.status === "scheduled").length,
    paused: tasks.filter(t => t.status === "paused").length,
    completed: tasks.filter(t => t.status === "completed").length,
    errors: tasks.filter(t => t.status === "error").length,
    awaitingApproval: tasks.filter(
      t => t.status === "awaiting_approval"
    ).length,
    registeredActions: handlers.size,
    schedulerRunning: schedulerTimer !== null,
    schedulerIntervalMs: schedulerInterval,
  };
}

/**
 * Load saved metadata during application startup.
 *
 * Action handlers must be registered separately before
 * scheduled tasks can execute.
 */
export function initializeAutomationManager() {
  return {
    loaded: loadData(),
    status: getAutomationStatus(),
  };
}
