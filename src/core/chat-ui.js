import {
  sendChatMessage,
  subscribeChat,
  getChatState
} from "./chat-manager.js";

export function initializeChatUI() {
  const main = document.querySelector("main");

  if (!main) {
    throw new Error("Main app container not found.");
  }

  const panel = document.createElement("section");
  panel.id = "ira-chat-panel";

  panel.style.cssText = `
    display: none;
    position: fixed;
    z-index: 10;
    inset: 65px 0 0;
    background: #080f20;
    padding: 15px;
    flex-direction: column;
    gap: 12px;
  `;

  panel.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center">
      <h2 style="color:#80caff;margin:5px">Chat with Ira</h2>
      <button id="ira-chat-close">Close</button>
    </div>

    <div id="ira-chat-messages"
      style="
        flex:1;
        overflow-y:auto;
        padding:10px;
        background:#10182b;
        border-radius:12px;
      ">
      <p style="color:#91a9ca;text-align:center">
        Hello! I'm Ira. How can I help you?
      </p>
    </div>

    <div style="display:flex;gap:8px">
      <input
        id="ira-chat-input"
        type="text"
        placeholder="Message Ira..."
        style="
          flex:1;
          min-width:0;
          padding:13px;
          border-radius:10px;
          border:1px solid #3976c9;
          background:#152039;
          color:white;
        "
      >

      <button id="ira-chat-send">Send</button>
    </div>

    <p id="ira-chat-status"
      style="color:#91a9ca;font-size:12px;margin:0">
      Ready
    </p>
  `;

  document.body.appendChild(panel);

  const messages = panel.querySelector("#ira-chat-messages");
  const input = panel.querySelector("#ira-chat-input");
  const sendButton = panel.querySelector("#ira-chat-send");
  const status = panel.querySelector("#ira-chat-status");

  function openChat() {
    panel.style.display = "flex";
    input.focus();
  }

  function closeChat() {
    panel.style.display = "none";
  }

  function renderMessages(state) {
    messages.replaceChildren();

    for (const message of state.messages) {
      const bubble = document.createElement("div");

      bubble.style.cssText = `
        max-width:85%;
        width:fit-content;
        margin:10px 0;
        margin-left:${message.role === "user" ? "auto" : "0"};
        padding:12px;
        border-radius:12px;
        background:${message.role === "user" ? "#174b88" : "#202d46"};
        color:white;
        white-space:pre-wrap;
        overflow-wrap:anywhere;
      `;

      const label = document.createElement("strong");
      label.textContent =
        message.role === "user" ? "You" : "Ira";

      const content = document.createElement("p");
      content.textContent = message.content;
      content.style.margin = "6px 0 0";

      bubble.append(label, content);
      messages.appendChild(bubble);
    }

    messages.scrollTop = messages.scrollHeight;

    status.textContent =
      state.status === "thinking"
        ? "Ira is thinking..."
        : state.status === "error"
          ? "There was an error. Please try again."
          : "Ready";
  }

  async function send() {
    const text = input.value.trim();

    if (!text) return;

    if (sendButton.disabled) return;

    input.value = "";
    sendButton.disabled = true;

    try {
      await sendChatMessage(text);
    } catch (error) {
      console.error("Chat error:", error);
      status.textContent = error.message;
    } finally {
      sendButton.disabled = false;
      input.focus();
    }
  }

  sendButton.addEventListener("click", send);

  input.addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      send();
    }
  });

  panel.querySelector("#ira-chat-close")
    .addEventListener("click", closeChat);

  const chatMenuItem = [...document.querySelectorAll(".menuitem")]
    .find(item => item.textContent.includes("Chat"));

  if (chatMenuItem) {
    chatMenuItem.addEventListener("click", () => {
      openChat();
      document.getElementById("menu")?.classList.remove("open");
    });
  }

  const unsubscribe = subscribeChat(renderMessages);
  renderMessages(getChatState());

  return {
    open: openChat,
    close: closeChat,
    destroy() {
      unsubscribe();
      panel.remove();
    }
  };
}
