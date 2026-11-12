/**
 * IRA AI — Decision Engine
 * Version: 1.0.0
 */

const actionRegistry = new Map();
const pendingApprovals = new Map();
const executionHistory = [];

let permissionChecker = null;
let approvalHandler = null;

const ACTION_STATUS = Object.freeze({
  REGISTERED: "registered",
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
  EXECUTING: "executing",
  COMPLETED: "completed",
  FAILED: "failed"
});

function createId() {
  return crypto.randomUUID();
}

function configureDecisionEngine(options = {}) {
  if (typeof options.permissionChecker === "function") {
    permissionChecker = options.permissionChecker;
  }

  if (typeof options.approvalHandler === "function") {
    approvalHandler = options.approvalHandler;
  }

  return getEngineStatus();
}

function registerAction(config) {
  const {
    id,
    name,
    description = "",
    handler,
    permissions = [],
    requiresApproval = true,
    category = "general",
    enabled = true
  } = config;

  if (!id || typeof handler !== "function") {
    throw new Error("Action ID and handler are required.");
  }

  if (actionRegistry.has(id)) {
    throw new Error(`Action already registered: ${id}`);
  }

  const action = {
    id,
    name: name || id,
    description,
    handler,
    permissions: [...permissions],
    requiresApproval,
    category,
    enabled,
    registeredAt: new Date().toISOString()
  };

  actionRegistry.set(id, action);

  return getPublicAction(action);
}

function getPublicAction(action) {
  const { handler, ...publicAction } = action;
  return { ...publicAction };
}

function unregisterAction(id) {
  return actionRegistry.delete(id);
}

function enableAction(id) {
  const action = actionRegistry.get(id);
  if (!action) return false;
  action.enabled = true;
  return true;
}

function disableAction(id) {
  const action = actionRegistry.get(id);
  if (!action) return false;
  action.enabled = false;
  return true;
}

function getAction(id) {
  const action = actionRegistry.get(id);
  return action ? getPublicAction(action) : null;
}

function getAvailableActions(category = null) {
  return [...actionRegistry.values()]
    .filter(action => action.enabled)
    .filter(action => !category || action.category === category)
    .map(getPublicAction);
}

async function checkPermissions(action, context = {}) {
  if (!action.permissions.length) return true;
  if (!permissionChecker) return false;

  try {
    return Boolean(
      await permissionChecker(action.permissions, context)
    );
  } catch {
    return false;
  }
}

function createExecutionRecord(action, args) {
  const record = {
    id: createId(),
    actionId: action.id,
    actionName: action.name,
    status: ACTION_STATUS.REGISTERED,
    createdAt: new Date().toISOString(),
    completedAt: null,
    result: null,
    error: null,
    args
  };

  executionHistory.push(record);
  return record;
}

async function executeRegisteredAction(action, args, context) {
  const record = createExecutionRecord(action, args);

  try {
    record.status = ACTION_STATUS.EXECUTING;

    const result = await action.handler(args, {
      ...context,
      actionId: action.id,
      executionId: record.id
    });

    record.status = ACTION_STATUS.COMPLETED;
    record.result = result;
    record.completedAt = new Date().toISOString();

    return {
      success: true,
      executionId: record.id,
      result
    };
  } catch (error) {
    record.status = ACTION_STATUS.FAILED;
    record.error = error.message || String(error);
    record.completedAt = new Date().toISOString();

    return {
      success: false,
      executionId: record.id,
      error: record.error
    };
  }
}

async function requestAction(id, args = {}, context = {}) {
  const action = actionRegistry.get(id);

  if (!action || !action.enabled) {
    return { success: false, error: "ACTION_NOT_AVAILABLE" };
  }

  const permitted = await checkPermissions(action, context);

  if (!permitted) {
    return { success: false, error: "PERMISSION_DENIED" };
  }

  if (action.requiresApproval) {
    const approval = {
      id: createId(),
      actionId: id,
      args,
      context,
      status: ACTION_STATUS.PENDING,
      createdAt: new Date().toISOString()
    };

    pendingApprovals.set(approval.id, approval);

    if (approvalHandler) {
      try {
        const decision = await approvalHandler({
          ...approval,
          action: getPublicAction(action)
        });

        if (decision === true) return approveAction(approval.id);
        if (decision === false) return rejectAction(approval.id);
      } catch {
        // Keep approval pending for manual review.
      }
    }

    return {
      success: true,
      requiresApproval: true,
      approvalId: approval.id
    };
  }

  return executeRegisteredAction(action, args, context);
}

async function approveAction(approvalId) {
  const approval = pendingApprovals.get(approvalId);

  if (!approval || approval.status !== ACTION_STATUS.PENDING) {
    return { success: false, error: "APPROVAL_NOT_FOUND" };
  }

  const action = actionRegistry.get(approval.actionId);

  if (!action || !action.enabled) {
    return { success: false, error: "ACTION_NOT_AVAILABLE" };
  }

  const permitted = await checkPermissions(action, approval.context);

  if (!permitted) {
    return { success: false, error: "PERMISSION_DENIED" };
  }

  approval.status = ACTION_STATUS.APPROVED;
  approval.approvedAt = new Date().toISOString();

  pendingApprovals.delete(approvalId);

  return executeRegisteredAction(
    action,
    approval.args,
    approval.context
  );
}

function rejectAction(approvalId) {
  const approval = pendingApprovals.get(approvalId);

  if (!approval || approval.status !== ACTION_STATUS.PENDING) {
    return false;
  }

  approval.status = ACTION_STATUS.REJECTED;
  approval.rejectedAt = new Date().toISOString();

  pendingApprovals.delete(approvalId);
  return true;
}

function getPendingApprovals() {
  return [...pendingApprovals.values()].map(item => ({ ...item }));
}

function getExecutionHistory(limit = 100) {
  return executionHistory.slice(-limit).reverse()
    .map(item => ({ ...item }));
}

function getExecution(executionId) {
  const record = executionHistory.find(
    item => item.id === executionId
  );

  return record ? { ...record } : null;
}

function clearExecutionHistory() {
  executionHistory.length = 0;
}

function getEngineStatus() {
  return {
    registeredActions: actionRegistry.size,
    enabledActions: [...actionRegistry.values()]
      .filter(action => action.enabled).length,
    pendingApprovals: pendingApprovals.size,
    executions: executionHistory.length,
    permissionCheckerConfigured: Boolean(permissionChecker)
  };
}

export {
  ACTION_STATUS,
  configureDecisionEngine,
  registerAction,
  unregisterAction,
  enableAction,
  disableAction,
  getAction,
  getAvailableActions,
  requestAction,
  approveAction,
  rejectAction,
  getPendingApprovals,
  getExecutionHistory,
  getExecution,
  clearExecutionHistory,
  getEngineStatus
};
  
