/**
 * Ira AI — Avatar Manager
 * File: src/core/avatar-manager.js
 *
 * Manages avatar state and communicates with a 3D renderer.
 *
 * This module does not itself render VRM models.
 * The renderer must connect the supplied callbacks
 * to the actual VRM model, bones and blendshapes.
 */

const EXPRESSIONS = [
  "neutral",
  "happy",
  "sad",
  "angry",
  "relaxed",
  "surprised",
  "excited",
  "tired",
  "shy",
];

const ANIMATIONS = [
  "idle",
  "blink",
  "wave",
  "nod",
  "dance",
  "sit",
];

const state = {
  loaded: false,
  visible: true,
  expression: "neutral",
  animation: "idle",
  scale: 1,
  outfit: "default",
  accessories: [],
  modelName: null,
  modelUrl: null,
};

let renderer = null;
const listeners = new Set();

function emit(event, details = {}) {
  const payload = {
    event,
    state: getAvatarState(),
    details,
  };

  for (const listener of listeners) {
    try {
      listener(payload);
    } catch (error) {
      console.error("[Ira Avatar] Listener error:", error);
    }
  }
}

function updateState(changes) {
  Object.assign(state, changes);
  emit("state_changed", changes);
}

/**
 * Connect the avatar manager to the 3D renderer.
 *
 * The renderer should implement the supported methods.
 */
export function connectAvatarRenderer(adapter) {
  if (!adapter || typeof adapter !== "object") {
    throw new Error("A renderer adapter is required.");
  }

  renderer = adapter;

  return {
    connected: true,
    methods: [
      "loadModel",
      "setExpression",
      "playAnimation",
      "setVisible",
      "setScale",
      "setOutfit",
      "setAccessories",
      "dispose",
    ],
  };
}

function requireRenderer() {
  if (!renderer) {
    throw new Error("Avatar renderer is not connected.");
  }

  return renderer;
}

/**
 * Load an avatar model through the renderer.
 */
export async function loadAvatar({
  url,
  name = "Ira",
} = {}) {
  if (typeof url !== "string" || !url.trim()) {
    throw new Error("Avatar model URL is required.");
  }

  const adapter = requireRenderer();

  if (typeof adapter.loadModel !== "function") {
    throw new Error("Renderer does not support model loading.");
  }

  const result = await adapter.loadModel({
    url,
    name,
  });

  updateState({
    loaded: true,
    modelName: name,
    modelUrl: url,
  });

  await setExpression("neutral");
  await playAnimation("idle");

  return {
    success: true,
    result,
    state: getAvatarState(),
  };
}

/**
 * Change facial expression.
 */
export async function setExpression(expression, intensity = 1) {
  if (!EXPRESSIONS.includes(expression)) {
    throw new Error(`Unsupported expression: ${expression}`);
  }

  const adapter = requireRenderer();

  const safeIntensity = Math.max(
    0,
    Math.min(Number(intensity) || 1, 1)
  );

  if (typeof adapter.setExpression === "function") {
    await adapter.setExpression({
      expression,
      intensity: safeIntensity,
    });
  }

  updateState({
    expression,
  });

  return true;
}

/**
 * Play an avatar animation.
 */
export async function playAnimation(animation, options = {}) {
  if (!ANIMATIONS.includes(animation)) {
    throw new Error(`Unsupported animation: ${animation}`);
  }

  const adapter = requireRenderer();

  if (typeof adapter.playAnimation === "function") {
    await adapter.playAnimation({
      animation,
      loop: options.loop ?? animation === "idle",
      duration: options.duration ?? null,
    });
  }

  updateState({
    animation,
  });

  return true;
}

/**
 * Control avatar visibility.
 */
export async function setAvatarVisible(visible) {
  const adapter = requireRenderer();

  if (typeof adapter.setVisible === "function") {
    await adapter.setVisible(visible === true);
  }

  updateState({
    visible: visible === true,
  });

  return state.visible;
}

/**
 * Change avatar scale.
 */
export async function setAvatarScale(scale) {
  const safeScale = Math.max(
    0.25,
    Math.min(Number(scale) || 1, 3)
  );

  const adapter = requireRenderer();

  if (typeof adapter.setScale === "function") {
    await adapter.setScale(safeScale);
  }

  updateState({
    scale: safeScale,
  });

  return safeScale;
}

/**
 * Change outfit.
 *
 * The renderer decides which outfit assets are available.
 */
export async function setAvatarOutfit(outfitId) {
  if (
    typeof outfitId !== "string" ||
    !outfitId.trim()
  ) {
    throw new Error("Outfit ID is required.");
  }

  const adapter = requireRenderer();

  if (typeof adapter.setOutfit === "function") {
    await adapter.setOutfit(outfitId);
  }

  updateState({
    outfit: outfitId,
  });

  return outfitId;
}

/**
 * Set accessories.
 */
export async function setAvatarAccessories(accessories = []) {
  if (!Array.isArray(accessories)) {
    throw new Error("Accessories must be an array.");
  }

  const safeAccessories = [
    ...new Set(
      accessories.filter(
        item => typeof item === "string" && item.trim()
      )
    ),
  ];

  const adapter = requireRenderer();

  if (typeof adapter.setAccessories === "function") {
    await adapter.setAccessories(safeAccessories);
  }

  updateState({
    accessories: safeAccessories,
  });

  return [...safeAccessories];
}

/**
 * Reset the avatar to its default state.
 */
export async function resetAvatar() {
  await setExpression("neutral");
  await playAnimation("idle");
  await setAvatarScale(1);
  await setAvatarOutfit("default");
  await setAvatarAccessories([]);

  return getAvatarState();
}

/**
 * Subscribe to avatar changes.
 */
export function subscribeAvatar(callback) {
  if (typeof callback !== "function") {
    throw new Error("Callback must be a function.");
  }

  listeners.add(callback);

  return () => {
    listeners.delete(callback);
  };
}

/**
 * Get current avatar state.
 */
export function getAvatarState() {
  return {
    ...state,
    accessories: [...state.accessories],
  };
}

/**
 * Get supported expressions and animations.
 */
export function getAvatarCapabilities() {
  return {
    expressions: [...EXPRESSIONS],
    animations: [...ANIMATIONS],
  };
}

/**
 * Disconnect renderer and release resources.
 */
export async function disconnectAvatarRenderer() {
  if (renderer && typeof renderer.dispose === "function") {
    await renderer.dispose();
  }

  renderer = null;

  updateState({
    loaded: false,
    modelName: null,
    modelUrl: null,
  });

  return true;
}
  
