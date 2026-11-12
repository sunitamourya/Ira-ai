import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";

const EXPRESSION_MAP = {
  neutral: null,
  happy: "happy",
  sad: "sad",
  angry: "angry",
  relaxed: "relaxed",
  surprised: "surprised",
  excited: "happy",
  tired: "relaxed",
  shy: "relaxed"
};

export function createVRMRenderer() {
  let container = null;
  let scene = null;
  let camera = null;
  let renderer = null;
  let loader = null;
  let vrm = null;
  let animationFrame = null;
  let resizeObserver = null;
  let clock = new THREE.Clock();

  let visible = true;
  let currentAnimation = "idle";
  let currentExpression = "neutral";
  let animationTime = 0;
  let baseScale = 1;

  function requireRenderer() {
    if (!renderer || !scene || !camera) {
      throw new Error("VRM renderer has not been initialized.");
    }
  }

  function init(target) {
    if (!target) {
      throw new Error("A container element is required.");
    }

    if (renderer) dispose();

    container = target;
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x101827);

    camera = new THREE.PerspectiveCamera(
      30,
      target.clientWidth / Math.max(target.clientHeight, 1),
      0.1,
      100
    );

    camera.position.set(0, 1.35, 3.2);
    camera.lookAt(0, 1.15, 0);

    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false
    });

    renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, 2)
    );

    renderer.setSize(
      target.clientWidth,
      target.clientHeight
    );

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;

    target.replaceChildren(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(
      0xffffff,
      1.5
    );

    scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(
      0xffffff,
      2
    );

    keyLight.position.set(1, 2, 3);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(
      0x9bbcff,
      0.7
    );

    fillLight.position.set(-2, 1, -2);
    scene.add(fillLight);

    loader = new GLTFLoader();
    loader.register(parser =>
      new VRMLoaderPlugin(parser)
    );

    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(target);

    animate();

    return true;
  }

  function resize() {
    if (!renderer || !camera || !container) return;

    const width = Math.max(container.clientWidth, 1);
    const height = Math.max(container.clientHeight, 1);

    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    renderer.setSize(width, height);
  }

  function validateModelURL(url) {
    if (typeof url !== "string" || !url.trim()) {
      throw new Error("A valid VRM model URL is required.");
    }

    const parsed = new URL(url, window.location.href);

    const allowed =
      parsed.protocol === "https:" ||
      parsed.protocol === "blob:" ||
      (
        parsed.protocol === "http:" &&
        (
          parsed.hostname === "localhost" ||
          parsed.hostname === "127.0.0.1"
        )
      );

    if (!allowed) {
      throw new Error("Unsupported model URL protocol.");
    }

    return parsed.href;
  }

  async function loadModel(url) {
    requireRenderer();

    const safeURL = validateModelURL(url);

    const gltf = await loader.loadAsync(safeURL);
    const newVRM = gltf.userData.vrm;

    if (!newVRM) {
      throw new Error("This file does not contain a valid VRM model.");
    }

    if (newVRM.meta?.metaVersion === "0") {
      VRMUtils.rotateVRM0(newVRM);
    }

    const oldVRM = vrm;

    vrm = newVRM;
    scene.add(vrm.scene);

    vrm.scene.position.set(0, 0, 0);
    vrm.scene.scale.setScalar(baseScale);

    if (oldVRM) {
      scene.remove(oldVRM.scene);
      VRMUtils.deepDispose(oldVRM.scene);
    }

    setExpression(currentExpression);

    return {
      loaded: true,
      modelName: vrm.meta?.name || "VRM Avatar",
      metaVersion: vrm.meta?.metaVersion || "unknown"
    };
  }

  function setExpression(expression) {
    if (!EXPRESSION_MAP.hasOwnProperty(expression)) {
      throw new Error(`Unknown expression: ${expression}`);
    }

    currentExpression = expression;

    if (!vrm?.expressionManager) return false;

    const manager = vrm.expressionManager;

    for (const name of Object.values(EXPRESSION_MAP)) {
      if (name) manager.setValue(name, 0);
    }

    const target = EXPRESSION_MAP[expression];

    if (target) {
      manager.setValue(target, 1);
    }

    return true;
  }

  function findBone(...names) {
    if (!vrm?.humanoid) return null;

    for (const name of names) {
      const bone = vrm.humanoid.getNormalizedBoneNode(name);
      if (bone) return bone;
    }

    return null;
  }

  function playAnimation(animation) {
    const allowed = [
      "idle",
      "blink",
      "wave",
      "nod",
      "dance",
      "sit"
    ];

    if (!allowed.includes(animation)) {
      throw new Error(`Unknown animation: ${animation}`);
    }

    if (!vrm) return false;

    if (animation === "sit" || animation === "dance") {
      throw new Error(
        `${animation} requires a compatible animation asset.`
      );
    }

    if (animation === "wave" && !findBone("rightUpperArm")) {
      throw new Error("This model has no compatible right arm bone.");
    }

    currentAnimation = animation;
    animationTime = 0;

    return true;
  }

  function setVisible(value) {
    visible = Boolean(value);

    if (renderer?.domElement) {
      renderer.domElement.style.display =
        visible ? "block" : "none";
    }

    return visible;
  }

  function setScale(value) {
    const scale = Number(value);

    if (!Number.isFinite(scale) || scale < 0.25 || scale > 3) {
      throw new Error("Avatar scale must be between 0.25 and 3.");
    }

    baseScale = scale;

    if (vrm?.scene) {
      vrm.scene.scale.setScalar(baseScale);
    }

    return baseScale;
  }

  function setOutfit() {
    throw new Error(
      "Outfit changes require compatible clothing assets."
    );
  }

  function setAccessories() {
    throw new Error(
      "Accessories require compatible accessory assets."
    );
  }

  function animate() {
    if (!renderer) return;

    animationFrame = requestAnimationFrame(animate);

    const delta = Math.min(clock.getDelta(), 0.05);
    animationTime += delta;

    if (vrm) {
      vrm.update(delta);

      const root = vrm.scene;
      const body = findBone("spine", "chest");
      const rightArm = findBone("rightUpperArm");

      if (currentAnimation === "idle") {
        root.position.y = Math.sin(animationTime * 1.5) * 0.015;
        root.rotation.y = Math.sin(animationTime * 0.5) * 0.035;

        if (body) {
          body.rotation.x =
            Math.sin(animationTime * 1.5) * 0.015;
        }
      }

      if (currentAnimation === "nod") {
        root.rotation.x =
          Math.sin(animationTime * 3) * 0.08;
      }

      if (currentAnimation === "wave" && rightArm) {
        rightArm.rotation.z =
          -0.8 + Math.sin(animationTime * 5) * 0.25;
      }

      if (currentAnimation === "blink") {
        const blink = vrm.expressionManager;

        if (blink) {
          const value = Math.max(
            0,
            Math.sin(animationTime * 5)
          );

          blink.setValue("blink", value > 0.95 ? 1 : 0);
        }
      }
    }

    if (visible) {
      renderer.render(scene, camera);
    }
  }

  function dispose() {
    if (animationFrame !== null) {
      cancelAnimationFrame(animationFrame);
      animationFrame = null;
    }

    resizeObserver?.disconnect();
    resizeObserver = null;

    if (vrm) {
      scene?.remove(vrm.scene);
      VRMUtils.deepDispose(vrm.scene);
      vrm = null;
    }

    if (renderer) {
      renderer.dispose();
      renderer.domElement.remove();
      renderer = null;
    }

    scene = null;
    camera = null;
    loader = null;
    container = null;
  }

  return {
    init,
    loadModel,
    setExpression,
    playAnimation,
    setVisible,
    setScale,
    setOutfit,
    setAccessories,
    resize,
    dispose,

    getStatus() {
      return {
        initialized: Boolean(renderer),
        loaded: Boolean(vrm),
        visible,
        expression: currentExpression,
        animation: currentAnimation,
        modelName: vrm?.meta?.name || null
      };
    }
  };
    }
                  
