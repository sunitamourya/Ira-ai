
/**
 * Ira AI — Voice Manager
 * File: src/core/voice-manager.js
 *
 * Browser voice interface.
 *
 * Note:
 * - Microphone access requires user permission.
 * - Browser speech recognition support varies.
 * - This does not implement always-on background listening.
 * - Native Android wake-word functionality requires native code.
 */

const SpeechRecognition =
  globalThis.SpeechRecognition ||
  globalThis.webkitSpeechRecognition ||
  null;

const synthesis = globalThis.speechSynthesis || null;

let recognition = null;
let listening = false;
let speaking = false;
let voiceEnabled = true;
let continuousMode = false;

let language = "en-IN";
let speechRate = 1;
let speechPitch = 1;
let speechVolume = 1;

let callbacks = {
  onResult: null,
  onInterim: null,
  onListeningChange: null,
  onSpeakingChange: null,
  onError: null,
  onWakeWord: null,
};

function emit(callback, data) {
  if (typeof callback !== "function") return;

  try {
    callback(data);
  } catch (error) {
    console.error("[Ira Voice] Callback error:", error);
  }
}

function setListening(value) {
  listening = value === true;

  emit(callbacks.onListeningChange, {
    listening,
  });
}

function setSpeaking(value) {
  speaking = value === true;

  emit(callbacks.onSpeakingChange, {
    speaking,
  });
}

/**
 * Configure voice settings and callbacks.
 */
export function configureVoiceManager(options = {}) {
  if (options.language) {
    language = options.language;
  }

  if (typeof options.enabled === "boolean") {
    voiceEnabled = options.enabled;
  }

  if (typeof options.continuous === "boolean") {
    continuousMode = options.continuous;
  }

  if (options.rate !== undefined) {
    setSpeechRate(options.rate);
  }

  if (options.pitch !== undefined) {
    setSpeechPitch(options.pitch);
  }

  if (options.volume !== undefined) {
    setSpeechVolume(options.volume);
  }

  callbacks = {
    ...callbacks,
    ...options.callbacks,
  };

  return getVoiceStatus();
}

/**
 * Create speech recognition.
 */
function createRecognition() {
  if (!SpeechRecognition) {
    throw new Error(
      "Speech recognition is not supported by this browser."
    );
  }

  const engine = new SpeechRecognition();

  engine.lang = language;
  engine.continuous = continuousMode;
  engine.interimResults = true;
  engine.maxAlternatives = 1;

  engine.onstart = () => {
    setListening(true);
  };

  engine.onend = () => {
    setListening(false);
    recognition = null;
  };

  engine.onerror = event => {
    setListening(false);

    emit(callbacks.onError, {
      type: "recognition",
      error: event.error,
    });
  };

  engine.onresult = event => {
    let finalText = "";
    let interimText = "";

    for (
      let index = event.resultIndex;
      index < event.results.length;
      index++
    ) {
      const result = event.results[index];
      const text = result[0]?.transcript || "";

      if (result.isFinal) {
        finalText += text;
      } else {
        interimText += text;
      }
    }

    if (interimText) {
      emit(callbacks.onInterim, {
        text: interimText,
      });
    }

    if (finalText.trim()) {
      handleRecognizedText(finalText.trim());
    }
  };

  return engine;
}

/**
 * Process recognized speech.
 */
function handleRecognizedText(text) {
  const normalized = text.toLowerCase().trim();

  emit(callbacks.onResult, {
    text,
    language,
    timestamp: new Date().toISOString(),
  });

  // Wake-word callback hook.
  if (
    normalized.startsWith("hey ira") ||
    normalized.startsWith("hello ira")
  ) {
    emit(callbacks.onWakeWord, {
      text,
      detected: true,
    });
  }
}

/**
 * Start listening.
 * Call following a user gesture and microphone permission.
 */
export function startListening() {
  if (!voiceEnabled) {
    throw new Error("Voice is disabled.");
  }

  if (listening || recognition) {
    return { listening: true };
  }

  recognition = createRecognition();

  try {
    recognition.start();

    return {
      started: true,
      language,
    };
  } catch (error) {
    recognition = null;

    emit(callbacks.onError, {
      type: "start",
      error: error.message,
    });

    throw error;
  }
}

/**
 * Stop listening.
 */
export function stopListening() {
  if (recognition) {
    try {
      recognition.stop();
    } catch {
      // Recognition may already have stopped.
    }

    recognition = null;
  }

  setListening(false);

  return true;
}

/**
 * Cancel recognition immediately.
 */
export function cancelListening() {
  if (recognition) {
    try {
      recognition.abort();
    } catch {
      // Recognition may already have stopped.
    }

    recognition = null;
  }

  setListening(false);

  return true;
}

/**
 * Speak text using browser text-to-speech.
 */
export function speak(text, options = {}) {
  if (!voiceEnabled) {
    throw new Error("Voice is disabled.");
  }

  if (!synthesis) {
    throw new Error("Text-to-speech is unavailable.");
  }

  if (typeof text !== "string" || !text.trim()) {
    throw new Error("Speech text is required.");
  }

  stopSpeaking();

  const utterance = new SpeechSynthesisUtterance(text);

  utterance.lang = options.language || language;
  utterance.rate = options.rate ?? speechRate;
  utterance.pitch = options.pitch ?? speechPitch;
  utterance.volume = options.volume ?? speechVolume;

  if (options.voice) {
    utterance.voice = options.voice;
  }

  utterance.onstart = () => {
    setSpeaking(true);
  };

  utterance.onend = () => {
    setSpeaking(false);
  };

  utterance.onerror = event => {
    setSpeaking(false);

    emit(callbacks.onError, {
      type: "speech",
      error: event.error,
    });
  };

  synthesis.speak(utterance);

  return true;
}

/**
 * Pause current speech.
 */
export function pauseSpeaking() {
  if (!synthesis) return false;

  synthesis.pause();

  return true;
}

/**
 * Resume paused speech.
 */
export function resumeSpeaking() {
  if (!synthesis) return false;

  synthesis.resume();

  return true;
}

/**
 * Stop current speech.
 */
export function stopSpeaking() {
  if (!synthesis) return false;

  synthesis.cancel();
  setSpeaking(false);

  return true;
}

/**
 * Change recognition and speech language.
 */
export function setVoiceLanguage(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Language code is required.");
  }

  language = value;

  if (recognition) {
    stopListening();
  }

  return language;
}

export function setSpeechRate(value) {
  speechRate = Math.max(0.5, Math.min(Number(value) || 1, 2));
  return speechRate;
}

export function setSpeechPitch(value) {
  speechPitch = Math.max(0, Math.min(Number(value) || 1, 2));
  return speechPitch;
}

export function setSpeechVolume(value) {
  speechVolume = Math.max(0, Math.min(Number(value), 1));
  return speechVolume;
}

/**
 * Get available system voices.
 */
export function getAvailableVoices() {
  if (!synthesis) return [];

  return synthesis.getVoices().map(voice => ({
    name: voice.name,
    language: voice.lang,
    default: voice.default,
  }));
}

/**
 * Enable or disable voice.
 */
export function setVoiceEnabled(enabled) {
  voiceEnabled = enabled === true;

  if (!voiceEnabled) {
    stopListening();
    stopSpeaking();
  }

  return voiceEnabled;
}

/**
 * Voice system status.
 */
export function getVoiceStatus() {
  return {
    enabled: voiceEnabled,
    listening,
    speaking,
    language,
    continuousMode,
    recognitionSupported: Boolean(SpeechRecognition),
    speechSupported: Boolean(synthesis),
    rate: speechRate,
    pitch: speechPitch,
    volume: speechVolume,
  };
}

/**
 * Release voice resources.
 */
export function destroyVoiceManager() {
  stopListening();
  stopSpeaking();

  callbacks = {
    onResult: null,
    onInterim: null,
    onListeningChange: null,
    onSpeakingChange: null,
    onError: null,
    onWakeWord: null,
  };

  return true;
}
