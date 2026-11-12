
export const IRA_PERMISSIONS = [
  {
    id: "microphone",
    name: "Microphone",
    purpose: "Voice conversations and wake-word features",
    required: false
  },
  {
    id: "notifications",
    name: "Notifications",
    purpose: "Reminders and background status",
    required: false
  },
  {
    id: "camera",
    name: "Camera",
    purpose: "Optional visual and AR features",
    required: false
  },
  {
    id: "location",
    name: "Location",
    purpose: "Optional location-based assistance",
    required: false
  },
  {
    id: "overlay",
    name: "Display over other apps",
    purpose: "Optional floating Ira avatar",
    required: false
  }
];

const permissionStatus = {};

export function getPermissionStatus(id) {
  return permissionStatus[id] ?? "not_requested";
}

export function updatePermissionStatus(id, status) {
  const permission = IRA_PERMISSIONS.find(item => item.id === id);

  if (!permission) return false;

  const allowedStatuses = [
    "granted",
    "denied",
    "not_requested"
  ];

  if (!allowedStatuses.includes(status)) return false;

  permissionStatus[id] = status;
  return true;
}

export function getAllPermissions() {
  return IRA_PERMISSIONS.map(permission => ({
    ...permission,
    status: getPermissionStatus(permission.id)
  }));
}
