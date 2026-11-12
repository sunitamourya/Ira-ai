
const DB_NAME = "IraPrivateDatabase";
const DB_VERSION = 1;

const CONFIG = {
  maxContextMessages: 20
};

let database = null;
let encryptionKey = null;

const conversations = new Map();
const memories = new Map();

let activeConversationId = null;

// ------------------------------
// DATABASE
// ------------------------------

function openDatabase() {
  if (database) return Promise.resolve(database);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains("records")) {
        db.createObjectStore("records", { keyPath: "id" });
      }

      if (!db.objectStoreNames.contains("settings")) {
        db.createObjectStore("settings", { keyPath: "key" });
      }
    };

    request.onsuccess = () => {
      database = request.result;
      resolve(database);
    };

    request.onerror = () => reject(request.error);
  });
}

function transaction(storeName, mode, operation) {
  return new Promise(async (resolve, reject) => {
    try {
      const db = await openDatabase();
      const tx = db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);

      const request = operation(store);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);

      tx.onabort = () => reject(tx.error);
    } catch (error) {
      reject(error);
    }
  });
}

// ------------------------------
// ENCRYPTION
// ------------------------------

function toBase64(bytes) {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

function fromBase64(value) {
  return Uint8Array.from(
    atob(value),
    character => character.charCodeAt(0)
  );
}

async function deriveKey(passphrase, salt) {
  if (!globalThis.crypto?.subtle) {
    throw new Error("Secure encryption is unavailable.");
  }

  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 600000,
      hash: "SHA-256"
    },
    material,
    {
      name: "AES-GCM",
      length: 256
    },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptData(data) {
  if (!encryptionKey) {
    throw new Error("Ira storage is locked.");
  }

  const iv = crypto.getRandomValues(new Uint8Array(12));

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    encryptionKey,
    new TextEncoder().encode(JSON.stringify(data))
  );

  return {
    iv: toBase64(iv),
    data: toBase64(new Uint8Array(encrypted))
  };
}

async function decryptData(payload) {
  if (!encryptionKey) {
    throw new Error("Ira storage is locked.");
  }

  const decrypted = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: fromBase64(payload.iv)
    },
    encryptionKey,
    fromBase64(payload.data)
  );

  return JSON.parse(new TextDecoder().decode(decrypted));
}

// ------------------------------
// STORAGE SETUP
// ------------------------------

export async function setupStorage(passphrase) {
  if (typeof passphrase !== "string" || passphrase.length < 12) {
    throw new Error("Choose a passphrase of at least 12 characters.");
  }

  const existing = await transaction(
    "settings",
    "readonly",
    store => store.get("encryption")
  );

  if (existing) {
    throw new Error("Storage already exists. Unlock it instead.");
  }

  const salt = crypto.getRandomValues(new Uint8Array(16));

  encryptionKey = await deriveKey(passphrase, salt);

  await transaction("settings", "readwrite", store =>
    store.put({
      key: "encryption",
      salt: toBase64(salt),
      version: 1
    })
  );

  return true;
}

export async function unlockStorage(passphrase) {
  const settings = await transaction(
    "settings",
    "readonly",
    store => store.get("encryption")
  );

  if (!settings) {
    throw new Error("Storage has not been set up.");
  }

  encryptionKey = await deriveKey(
    passphrase,
    fromBase64(settings.salt)
  );

  try {
    await loadAllData();
  } catch (error) {
    encryptionKey = null;
    conversations.clear();
    memories.clear();
    throw new Error("Incorrect passphrase or damaged data.");
  }

  return true;
}

export function lockStorage() {
  encryptionKey = null;
  conversations.clear();
  memories.clear();
  activeConversationId = null;
}

export function isStorageUnlocked() {
  return encryptionKey !== null;
}

// ------------------------------
// SAVE AND LOAD
// ------------------------------

async function saveRecord(id, type, data) {
  const payload = await encryptData(data);

  await transaction("records", "readwrite", store =>
    store.put({ id, type, payload })
  );
}

async function deleteRecord(id) {
  await transaction("records", "readwrite", store =>
    store.delete(id)
  );
}

async function loadAllData() {
  const records = await transaction(
    "records",
    "readonly",
    store => store.getAll()
  );

  const loadedConversations = [];
  const loadedMemories = [];

  for (const record of records) {
    const data = await decryptData(record.payload);

    if (record.type === "conversation") {
      loadedConversations.push(data);
    }

    if (record.type === "memory") {
      loadedMemories.push(data);
    }
  }

  conversations.clear();
  memories.clear();

  for (const conversation of loadedConversations) {
    conversations.set(conversation.id, conversation);
  }

  for (const memory of loadedMemories) {
    memories.set(memory.id, memory);
  }
}

export async function reloadStorage() {
  if (!encryptionKey) {
    throw new Error("Unlock storage first.");
  }

  await loadAllData();
  return true;
}

// ------------------------------
// CONVERSATIONS
// ------------------------------

function createId() {
  return crypto.randomUUID();
}

function requireUnlocked() {
  if (!encryptionKey) {
    throw new Error("Unlock Ira storage first.");
  }
}

export async function createConversation(title = "New conversation") {
  requireUnlocked();

  const id = createId();

  const conversation = {
    id,
    title,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    summary: "",
    messages: []
  };

  await saveRecord(id, "conversation", conversation);

  conversations.set(id, conversation);
  activeConversationId = id;

  return structuredClone(conversation);
}

export function getActiveConversationId() {
  return activeConversationId;
}

export function switchConversation(id) {
  if (!conversations.has(id)) return false;

  activeConversationId = id;
  return true;
}

export async function addMessage(
  role,
  content,
  metadata = {},
  conversationId = activeConversationId
) {
  requireUnlocked();

  const conversation = conversations.get(conversationId);

  if (!conversation) {
    throw new Error("Conversation not found.");
  }

  if (!["user", "assistant", "system"].includes(role)) {
    throw new Error("Invalid message role.");
  }

  if (typeof content !== "string") {
    throw new Error("Message content must be text.");
  }

  const message = {
    id: createId(),
    role,
    content,
    metadata,
    timestamp: new Date().toISOString()
  };

  conversation.messages.push(message);
  conversation.updatedAt = new Date().toISOString();

  await saveRecord(
    conversation.id,
    "conversation",
    conversation
  );

  return structuredClone(message);
}

export async function addUserMessage(content, metadata = {}) {
  return addMessage("user", content, metadata);
}

export async function addAssistantMessage(content, metadata = {}) {
  return addMessage("assistant", content, metadata);
}

export function getMessages(id = activeConversationId) {
  const conversation = conversations.get(id);

  return conversation
    ? structuredClone(conversation.messages)
    : [];
}

export function getAIContext(
  id = activeConversationId,
  limit = CONFIG.maxContextMessages
) {
  const conversation = conversations.get(id);

  if (!conversation) return [];

  return conversation.messages
    .filter(message =>
      ["user", "assistant"].includes(message.role)
    )
    .slice(-Math.max(1, Number(limit) || 1))
    .map(({ role, content }) => ({ role, content }));
}

export async function renameConversation(id, title) {
  requireUnlocked();

  const conversation = conversations.get(id);

  if (!conversation || typeof title !== "string") {
    return false;
  }

  conversation.title = title;
  conversation.updatedAt = new Date().toISOString();

  await saveRecord(id, "conversation", conversation);
  return true;
}

export async function deleteConversation(id) {
  requireUnlocked();

  if (!conversations.has(id)) return false;

  await deleteRecord(id);
  conversations.delete(id);

  if (activeConversationId === id) {
    activeConversationId = null;
  }

  return true;
}

export function getConversationList() {
  return Array.from(conversations.values())
    .map(conversation => ({
      id: conversation.id,
      title: conversation.title,
      summary: conversation.summary,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      messageCount: conversation.messages.length
    }));
}

// ------------------------------
// SEARCH HISTORY
// ------------------------------

export function searchConversations(query) {
  const search = String(query).toLowerCase().trim();

  if (!search) return [];

  const results = [];

  for (const conversation of conversations.values()) {
    const matchingMessages = conversation.messages.filter(
      message => message.content.toLowerCase().includes(search)
    );

    if (
      conversation.title.toLowerCase().includes(search) ||
      conversation.summary.toLowerCase().includes(search) ||
      matchingMessages.length > 0
    ) {
      results.push({
        id: conversation.id,
        title: conversation.title,
        summary: conversation.summary,
        matchingMessages: structuredClone(matchingMessages)
      });
    }
  }

  return results;
}

// ------------------------------
// CONVERSATION SUMMARIES
// ------------------------------

export async function updateConversationSummary(id, summary) {
  requireUnlocked();

  const conversation = conversations.get(id);

  if (!conversation || typeof summary !== "string") {
    return false;
  }

  conversation.summary = summary;
  conversation.updatedAt = new Date().toISOString();

  await saveRecord(id, "conversation", conversation);
  return true;
}

// Summary text must be generated by the AI Brain
// and passed to this function.

// ------------------------------
// LONG-TERM MEMORY
// ------------------------------

export async function saveMemory(
  title,
  content,
  category = "general"
) {
  requireUnlocked();

  const memory = {
    id: createId(),
    title,
    content,
    category,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  await saveRecord(memory.id, "memory", memory);
  memories.set(memory.id, memory);

  return structuredClone(memory);
}

export function getMemories(category = null) {
  return Array.from(memories.values())
    .filter(memory =>
      !category || memory.category === category
    )
    .map(memory => structuredClone(memory));
}

export async function editMemory(id, updates) {
  requireUnlocked();

  const memory = memories.get(id);

  if (!memory || !updates || typeof updates !== "object") {
    return false;
  }

  memory.title = updates.title ?? memory.title;
  memory.content = updates.content ?? memory.content;
  memory.category = updates.category ?? memory.category;
  memory.updatedAt = new Date().toISOString();

  await saveRecord(id, "memory", memory);
  return true;
}

export async function deleteMemory(id) {
  requireUnlocked();

  if (!memories.has(id)) return false;

  await deleteRecord(id);
  memories.delete(id);

  return true;
}

export function searchMemories(query) {
  const search = String(query).toLowerCase().trim();

  if (!search) return [];

  return getMemories().filter(memory =>
    memory.title.toLowerCase().includes(search) ||
    memory.content.toLowerCase().includes(search) ||
    memory.category.toLowerCase().includes(search)
  );
}

// ------------------------------
// EXPORT AND PRIVACY
// ------------------------------

export async function exportAllData() {
  requireUnlocked();

  return JSON.stringify({
    exportedAt: new Date().toISOString(),
    conversations: getConversationList().map(item =>
      conversations.get(item.id)
    ),
    memories: getMemories()
  }, null, 2);
}

export async function deleteAllData() {
  requireUnlocked();

  await transaction("records", "readwrite", store =>
    store.clear()
  );

  conversations.clear();
  memories.clear();
  activeConversationId = null;

  return true;
}

export async function destroyStorage() {
  lockStorage();

  await new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(DB_NAME);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(
      new Error("Close other Ira tabs before deleting storage.")
    );
  });

  database = null;
  return true;
                     }
      
