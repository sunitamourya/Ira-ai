
import { sendMessage } from "./ai-brain.js";

const listeners = new Set();
let busy = false;

let chatState = {
  messages: [],
  status: "ready",
  error: null
};

function notify() {
  const snapshot = getChatState();

  for (const listener of listeners) {
    try {
      listener(snapshot);
    } catch (error) {
      console.error("Chat listener error:", error);
    }
  }
}

export function getChatState() {
  return {
    ...chatState,
    messages: chatState.messages.map(message => ({ ...message }))
  };
}

export function subscribeChat(listener) {
  if (typeof listener !== "function") {
    throw new Error("A valid listener is required.");
  }

  listeners.add(listener);

  return () => listeners.delete(listener);
}

export async function sendChatMessage(text) {
  const content = String(text || "").trim();

  if (!content) {
    throw new Error("Message cannot be empty.");
  }

  if (busy) {
    throw new Error("Ira is already processing a message.");
  }

  busy = true;

  const userMessage = {
    id: crypto.randomUUID(),
    role: "user",
    content,
    timestamp: Date.now()
  };

  chatState.messages.push(userMessage);
  chatState.status = "thinking";
  chatState.error = null;
  notify();

  try {
    const response = await sendMessage(content);

    const assistantContent =
      typeof response === "string"
        ? response
        : response?.content || response?.message;

    if (
      typeof assistantContent !== "string" ||
      !assistantContent.trim()
    ) {
      throw new Error("AI backend returned an empty response.");
    }

    chatState.messages.push({
      id: crypto.randomUUID(),
      role: "assistant",
      content: assistantContent,
      timestamp: Date.now()
    });

    chatState.status = "ready";
    notify();

    return assistantContent;

  } catch (error) {
    chatState.status = "error";
    chatState.error = error.message;
    notify();

    throw error;

  } finally {
    busy = false;
  }
}

export function clearChatView() {
  chatState.messages = [];
  chatState.status = "ready";
  chatState.error = null;
  notify();
}

export function isChatBusy() {
  return busy;
      }
    
