const DEFAULT_CONFIG = {
  maxContextMessages: 20
};

const conversations = new Map();
let activeConversationId = null;

function createId() {
  return globalThis.crypto?.randomUUID?.() ??
    `ira-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getConversation(id = activeConversationId) {
  return id ? conversations.get(id) ?? null : null;
}

function createMessage(role, content, metadata = {}) {
  return {
    id: createId(),
    role,
    content,
    timestamp: new Date().toISOString(),
    metadata: { ...metadata }
  };
}

export function createConversation(title = "New conversation") {
  const id = createId();

  conversations.set(id, {
    id,
    title,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messages: [],
    metadata: {}
  });

  activeConversationId = id;
  return getConversation(id);
}

export function switchConversation(id) {
  if (!conversations.has(id)) return false;

  activeConversationId = id;
  return true;
}

export function getActiveConversationId() {
  return activeConversationId;
}

export function addMessage(
  role,
  content,
  metadata = {},
  conversationId = activeConversationId
) {
  const conversation = getConversation(conversationId);

  if (!conversation) {
    return { success: false, error: "Conversation not found" };
  }

  if (!["user", "assistant", "system"].includes(role)) {
    return { success: false, error: "Invalid message role" };
  }

  if (typeof content !== "string") {
    return { success: false, error: "Message must be text" };
  }

  const message = createMessage(role, content, metadata);

  conversation.messages.push(message);
  conversation.updatedAt = new Date().toISOString();

  return { success: true, message };
}

export function addUserMessage(content, metadata = {}) {
  return addMessage("user", content, metadata);
}

export function addAssistantMessage(content, metadata = {}) {
  return addMessage("assistant", content, metadata);
}

export function getMessages(conversationId = activeConversationId) {
  const conversation = getConversation(conversationId);

  return conversation
    ? conversation.messages.map(message => ({
        ...message,
        metadata: { ...message.metadata }
      }))
    : [];
}

export function getAIContext(
  conversationId = activeConversationId,
  limit = DEFAULT_CONFIG.maxContextMessages
) {
  const conversation = getConversation(conversationId);

  if (!conversation) return [];

  const safeLimit = Math.max(1, Math.floor(Number(limit) || 1));

  return conversation.messages
    .slice(-safeLimit)
    .filter(message =>
      ["user", "assistant"].includes(message.role)
    )
    .map(({ role, content }) => ({ role, content }));
}

export function renameConversation(id, title) {
  const conversation = getConversation(id);

  if (!conversation || typeof title !== "string") {
    return false;
  }

  conversation.title = title;
  conversation.updatedAt = new Date().toISOString();

  return true;
}

export function getConversationList() {
  return Array.from(conversations.values()).map(
    conversation => ({
      id: conversation.id,
      title: conversation.title,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
      messageCount: conversation.messages.length
    })
  );
}

export function deleteConversation(id) {
  if (!conversations.has(id)) return false;

  conversations.delete(id);

  if (activeConversationId === id) {
    activeConversationId = null;
  }

  return true;
}

export function clearAllConversations() {
  conversations.clear();
  activeConversationId = null;
  return true;
}

export function exportConversation(id = activeConversationId) {
  const conversation = getConversation(id);

  return conversation
    ? JSON.stringify(conversation, null, 2)
    : null;
}

export function importConversation(jsonData) {
  try {
    const data = JSON.parse(jsonData);

    if (!data || !Array.isArray(data.messages)) {
      return {
        success: false,
        error: "Invalid conversation data"
      };
    }

    const id = createId();

    const conversation = {
      id,
      title: data.title || "Imported conversation",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: data.messages.map(message => ({
        ...message,
        id: createId()
      })),
      metadata: {}
    };

    conversations.set(id, conversation);
    activeConversationId = id;

    return { success: true, conversationId: id };
  } catch {
    return {
      success: false,
      error: "Could not import conversation"
    };
  }
}

export function getConversationConfig() {
  return { ...DEFAULT_CONFIG };
  }
                   
