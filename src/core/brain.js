const DEFAULT_CONFIG = {
  endpoint: "",
  apiKey: "",
  mode: "normal",
  language: "auto",
  timeout: 60000,
  maxHistory: 20
};

let config = { ...DEFAULT_CONFIG };
let conversationHistory = [];
let activeRequest = null;

const SYSTEM_PROMPT = `
You are Ira, a helpful AI assistant.

Personality:
- Friendly, natural, respectful and supportive.
- Never pretend to be human or conscious.
- Never invent facts or claim abilities you do not have.
- Ask for clarification when necessary.
- Respect privacy and user choices.

Language:
- Support Hindi, Hinglish, English, Urdu and Gujarati.
- Follow the language used by the user unless requested otherwise.

Modes:
- Normal: conversational, friendly and clear.
- Accurate: precise, factual and transparent about uncertainty.

Safety:
- Do not assist with harmful or dangerous activities.
- Ask for confirmation before consequential actions.
`;

function validateEndpoint(endpoint) {
  if (!endpoint) {
    throw new Error("AI backend endpoint is not configured.");
  }

  const url = new URL(endpoint);

  const secure =
    url.protocol === "https:" ||
    (
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(url.hostname)
    );

  if (!secure) {
    throw new Error("AI endpoint must use HTTPS.");
  }

  return url.toString();
}

export function configureAIBrain(options = {}) {
  const nextConfig = {
    ...config,
    ...options
  };

  if (options.endpoint !== undefined) {
    nextConfig.endpoint = validateEndpoint(options.endpoint);
  }

  if (
    !["normal", "accurate"].includes(nextConfig.mode)
  ) {
    throw new Error("Invalid AI mode.");
  }

  if (
    !Number.isFinite(nextConfig.timeout) ||
    nextConfig.timeout < 1000
  ) {
    throw new Error("Invalid timeout.");
  }

  config = nextConfig;

  return getAIBrainConfig();
}

export function getAIBrainConfig() {
  return {
    endpoint: config.endpoint,
    mode: config.mode,
    language: config.language,
    timeout: config.timeout,
    maxHistory: config.maxHistory,
    configured: Boolean(config.endpoint)
  };
}

export function setAIMode(mode) {
  if (!["normal", "accurate"].includes(mode)) {
    throw new Error("Unsupported AI mode.");
  }

  config.mode = mode;
  return config.mode;
}

export function setAILanguage(language) {
  config.language = language || "auto";
  return config.language;
}

function buildSystemPrompt() {
  return `${SYSTEM_PROMPT}

Current mode: ${config.mode}
Preferred language: ${config.language}

${
  config.mode === "accurate"
    ? "Prioritize factual accuracy. State uncertainty clearly."
    : "Keep conversations natural, warm and easy to understand."
}`;
}

function extractResponse(data) {
  const content =
    data?.choices?.[0]?.message?.content ??
    data?.output_text ??
    data?.response ??
    data?.message?.content ??
    data?.message ??
    data?.content;

  if (typeof content === "string" && content.trim()) {
    return content.trim();
  }

  if (Array.isArray(content)) {
    const text = content
      .map(item => item?.text || "")
      .join("")
      .trim();

    if (text) return text;
  }

  throw new Error("The AI backend returned an unsupported response.");
}

export async function sendMessage(message) {
  if (typeof message !== "string" || !message.trim()) {
    throw new Error("Message cannot be empty.");
  }

  if (activeRequest) {
    activeRequest.abort();
  }

  const controller = new AbortController();
  activeRequest = controller;

  const timeoutId = setTimeout(
    () => controller.abort(),
    config.timeout
  );

  const userMessage = message.trim();

  const history = conversationHistory.slice(-config.maxHistory);

  try {
    const endpoint = validateEndpoint(config.endpoint);

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.apiKey
          ? { Authorization: `Bearer ${config.apiKey}` }
          : {})
      },
      body: JSON.stringify({
        messages: [
          {
            role: "system",
            content: buildSystemPrompt()
          },
          ...history,
          {
            role: "user",
            content: userMessage
          }
        ],
        mode: config.mode,
        language: config.language
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(
        `AI backend error: HTTP ${response.status}`
      );
    }

    const data = await response.json();
    const reply = extractResponse(data);

    conversationHistory.push(
      { role: "user", content: userMessage },
      { role: "assistant", content: reply }
    );

    conversationHistory =
      conversationHistory.slice(-config.maxHistory);

    return reply;

  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("AI request timed out or was cancelled.");
    }

    throw error;

  } finally {
    clearTimeout(timeoutId);

    if (activeRequest === controller) {
      activeRequest = null;
    }
  }
}

export function clearAIConversation() {
  conversationHistory = [];

  if (activeRequest) {
    activeRequest.abort();
    activeRequest = null;
  }

  return true;
}

export function getAIConversation() {
  return conversationHistory.map(message => ({
    ...message
  }));
}

export function cancelAIRequest() {
  if (!activeRequest) return false;

  activeRequest.abort();
  activeRequest = null;

  return true;
}
