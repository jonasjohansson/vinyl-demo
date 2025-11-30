import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import GUI from "https://cdn.jsdelivr.net/npm/lil-gui@0.19/+esm";

const appEl = document.getElementById("app");
const frontUploadInput = document.getElementById("front-upload");
const backUploadInput = document.getElementById("back-upload");
const dropOverlay = document.getElementById("drop-overlay");

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
appEl.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x433423); // Dark brown
renderer.setClearColor(scene.background);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.05, 50);
camera.position.set(1.5, 0.85, 1.5);
camera.lookAt(0, 0, 0);

// Create a dummy object for controls, then apply rotation to sleeveGroup
const controlsTarget = new THREE.Object3D();
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.target.set(0, 0.2, 0); // Will update after sleeveGroup is created
controls.enablePan = false;
controls.enableRotate = false; // We handle rotation manually
controls.enableZoom = true;
controls.zoomSpeed = 1.0;
controls.minDistance = 0.5;
controls.maxDistance = 10;
controls.enableKeys = false;

const hemiLight = new THREE.HemisphereLight(0xffffff, 0x111122, 1.1);
scene.add(hemiLight);

// Directional light for shadows
const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(2, 3, 2);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 2048;
dirLight.shadow.mapSize.height = 2048;
dirLight.shadow.camera.near = 0.1;
dirLight.shadow.camera.far = 10;
dirLight.shadow.camera.left = -3;
dirLight.shadow.camera.right = 3;
dirLight.shadow.camera.top = 3;
dirLight.shadow.camera.bottom = -3;
dirLight.shadow.bias = -0.0001;
scene.add(dirLight);

const textureLoader = new THREE.TextureLoader();
const artworkChoices = {
  Front: "front.jpg",
  Back: "back.jpg",
};

const vinylTexturePath = "disc.png";
const overlayTexturePath = "overlay.jpg";
const STORAGE_KEY = "vinyl-demo-settings-v1";
const DEFAULT_STATE = {
  frontArt: "Front",
  backArt: "Back",
  vinylReveal: 0.25,
  backgroundColor: "#433423", // Dark brown
  autoOrbit: false,
  autoOrbitSpeed: 0.0625, // 1/4 of original speed (0.25 / 4)
  overlayOpacity: 1,
  hemiIntensity: 1.1,
  hemiSkyColor: "#ffffff",
  hemiGroundColor: "#111122",
  brightness: 1.0,
  fogEnabled: true,
  fogColor: "#433423", // Will be synced with backgroundColor
  fogNear: 2,
  fogFar: 8,
};

const loadPersistedState = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (error) {
    console.warn("Failed to load saved state", error);
    return {};
  }
};

const createTexture = (path, onLoad) => {
  const texture = textureLoader.load(
    path,
    onLoad, // onLoad callback
    undefined, // onProgress
    undefined // onError
  );
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
};

const createBlurredTexture = (texture, blurAmount = 30, brightness = 0.6) => {
  return new Promise((resolve) => {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      // Use smaller size for performance and more blur effect
      const scale = 0.4;
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;

      // Draw and blur
      ctx.filter = `blur(${blurAmount}px)`;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      ctx.filter = "none";

      // Adjust brightness (less darkening, more visible)
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        data[i] = Math.floor(data[i] * brightness); // R
        data[i + 1] = Math.floor(data[i + 1] * brightness); // G
        data[i + 2] = Math.floor(data[i + 2] * brightness); // B
      }
      ctx.putImageData(imageData, 0, 0);

      const blurredTexture = new THREE.CanvasTexture(canvas);
      blurredTexture.colorSpace = THREE.SRGBColorSpace;
      blurredTexture.wrapS = THREE.RepeatWrapping;
      blurredTexture.wrapT = THREE.RepeatWrapping;
      resolve(blurredTexture);
    };

    img.onerror = () => {
      console.warn("Failed to load image for backdrop");
      resolve(null);
    };

    // Get image source from texture
    if (texture.image) {
      if (texture.image instanceof HTMLImageElement) {
        img.src = texture.image.src;
      } else if (texture.image instanceof HTMLCanvasElement) {
        img.src = texture.image.toDataURL();
      } else if (texture.image.src) {
        img.src = texture.image.src;
      }
    } else if (texture.source?.data) {
      const source = texture.source.data;
      if (source instanceof HTMLImageElement) {
        img.src = source.src;
      } else if (source instanceof HTMLCanvasElement) {
        img.src = source.toDataURL();
      }
    }

    // If image is already loaded
    if (img.complete && img.naturalWidth > 0) {
      img.onload();
    }
  });
};

const sleeveWidth = 1;
const sleeveHeight = 1;
const sleeveThickness = 0.006;
const sleeveGroup = new THREE.Group();
sleeveGroup.position.y = 0.2; // Raise the vinyl from the floor
scene.add(sleeveGroup);

// Update controls target to match sleeveGroup position
controls.target.set(0, sleeveGroup.position.y, 0);

const sleeveBodyGeometry = new THREE.BoxGeometry(sleeveWidth, sleeveHeight, sleeveThickness);
const sleeveBodyMaterial = new THREE.MeshStandardMaterial({
  color: 0x1c1c22,
  roughness: 0.95,
  metalness: 0.05,
});
const sleeveBody = new THREE.Mesh(sleeveBodyGeometry, sleeveBodyMaterial);
sleeveGroup.add(sleeveBody);

const planeGeometry = new THREE.PlaneGeometry(sleeveWidth, sleeveHeight);
const planeOffset = sleeveThickness / 2 + 0.0004;

const state = (() => {
  const persisted = loadPersistedState();
  const merged = { ...DEFAULT_STATE, ...persisted };
  merged.frontArt = artworkChoices[merged.frontArt] ? merged.frontArt : DEFAULT_STATE.frontArt;
  merged.backArt = artworkChoices[merged.backArt] ? merged.backArt : DEFAULT_STATE.backArt;
  merged.vinylReveal = THREE.MathUtils.clamp(merged.vinylReveal, 0, 1);
  merged.overlayOpacity = THREE.MathUtils.clamp(merged.overlayOpacity, 0, 1);
  merged.hemiIntensity = THREE.MathUtils.clamp(
    typeof merged.hemiIntensity === "number" ? merged.hemiIntensity : DEFAULT_STATE.hemiIntensity,
    0,
    6
  );
  merged.hemiSkyColor = typeof merged.hemiSkyColor === "string" ? merged.hemiSkyColor : DEFAULT_STATE.hemiSkyColor;
  merged.hemiGroundColor = typeof merged.hemiGroundColor === "string" ? merged.hemiGroundColor : DEFAULT_STATE.hemiGroundColor;
  merged.brightness = THREE.MathUtils.clamp(typeof merged.brightness === "number" ? merged.brightness : DEFAULT_STATE.brightness, 0, 3);
  merged.fogEnabled = typeof merged.fogEnabled === "boolean" ? merged.fogEnabled : DEFAULT_STATE.fogEnabled;
  // Sync fog color with background color if not explicitly set
  merged.fogColor =
    typeof merged.fogColor === "string" && merged.fogColor !== DEFAULT_STATE.fogColor ? merged.fogColor : merged.backgroundColor;
  merged.fogNear = THREE.MathUtils.clamp(typeof merged.fogNear === "number" ? merged.fogNear : DEFAULT_STATE.fogNear, 0, 20);
  merged.fogFar = THREE.MathUtils.clamp(typeof merged.fogFar === "number" ? merged.fogFar : DEFAULT_STATE.fogFar, 0, 50);
  merged.autoOrbitSpeed = THREE.MathUtils.clamp(
    typeof merged.autoOrbitSpeed === "number" ? merged.autoOrbitSpeed : DEFAULT_STATE.autoOrbitSpeed,
    0,
    2
  );
  return merged;
})();

const persistState = () => {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        frontArt: state.frontArt,
        backArt: state.backArt,
        vinylReveal: state.vinylReveal,
        backgroundColor: state.backgroundColor,
        autoOrbit: state.autoOrbit,
        autoOrbitSpeed: state.autoOrbitSpeed,
        overlayOpacity: state.overlayOpacity,
        hemiIntensity: state.hemiIntensity,
        hemiSkyColor: state.hemiSkyColor,
        hemiGroundColor: state.hemiGroundColor,
        brightness: state.brightness,
        fogEnabled: state.fogEnabled,
        fogColor: state.fogColor,
        fogNear: state.fogNear,
        fogFar: state.fogFar,
      })
    );
  } catch (error) {
    console.warn("Failed to save state", error);
  }
};

const frontTexture = createTexture(artworkChoices[state.frontArt] ?? artworkChoices[DEFAULT_STATE.frontArt], () => {
  // Create backdrop after front texture loads
  setTimeout(() => createBlurredBackdrop(), 100);
});
const frontMaterial = new THREE.MeshStandardMaterial({
  map: frontTexture,
  roughness: 0.8,
  metalness: 0.1,
  side: THREE.FrontSide,
});
const frontMesh = new THREE.Mesh(planeGeometry, frontMaterial);
frontMesh.position.z = planeOffset;
frontMesh.castShadow = true;

const backMaterial = new THREE.MeshStandardMaterial({
  map: createTexture(artworkChoices[state.backArt] ?? artworkChoices[DEFAULT_STATE.backArt]),
  roughness: 0.8,
  metalness: 0.1,
  side: THREE.FrontSide,
});
const backMesh = new THREE.Mesh(planeGeometry, backMaterial);
backMesh.rotation.y = Math.PI;
backMesh.position.z = -planeOffset;
backMesh.castShadow = true;

sleeveGroup.add(frontMesh);
sleeveGroup.add(backMesh);

let overlayTexture = createTexture(overlayTexturePath);
const overlayMaterialFront = new THREE.MeshStandardMaterial({
  map: overlayTexture,
  transparent: true,
  roughness: 1,
  metalness: 0,
  color: 0xffffff,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  opacity: 1,
});
const overlayMaterialBack = overlayMaterialFront.clone();
overlayMaterialBack.map = overlayTexture;

const overlayOffset = planeOffset + 0.0008;
const frontOverlayMesh = new THREE.Mesh(planeGeometry, overlayMaterialFront);
frontOverlayMesh.position.z = overlayOffset;
const backOverlayMesh = new THREE.Mesh(planeGeometry, overlayMaterialBack);
backOverlayMesh.rotation.y = Math.PI;
backOverlayMesh.position.z = -overlayOffset;
sleeveGroup.add(frontOverlayMesh);
sleeveGroup.add(backOverlayMesh);

const vinylRadius = sleeveWidth * 0.48;
const vinylGeometry = new THREE.CircleGeometry(vinylRadius, 96);
const vinylMaterial = new THREE.MeshStandardMaterial({
  map: createTexture(vinylTexturePath),
  roughness: 0.4,
  metalness: 0.2,
  side: THREE.DoubleSide,
  transparent: true,
});
const vinylDisc = new THREE.Mesh(vinylGeometry, vinylMaterial);
vinylDisc.castShadow = true;
const vinylBaseX = -0; // tucked inside on the left
const vinylExitX = 0.5; // reveal toward the right only
vinylDisc.position.set(vinylBaseX, 0, -planeOffset + 0.0002);
sleeveGroup.add(vinylDisc);

const updateVinylReveal = (value) => {
  const maxSlide = vinylExitX - vinylBaseX;
  vinylDisc.position.x = vinylBaseX + value * maxSlide;
  vinylDisc.rotation.z = THREE.MathUtils.degToRad(5 * value);
};

const overlayMaterials = [overlayMaterialFront, overlayMaterialBack];

const reloadArtwork = () => {
  frontMaterial.map?.dispose?.();
  const frontTex = createTexture(artworkChoices[state.frontArt], () => {
    createBlurredBackdrop();
  });
  frontMaterial.map = frontTex;
  frontMaterial.needsUpdate = true;

  backMaterial.map?.dispose?.();
  backMaterial.map = createTexture(artworkChoices[state.backArt]);
  backMaterial.needsUpdate = true;
};

const reloadOverlayTexture = () => {
  overlayTexture?.dispose?.();
  overlayTexture = createTexture(overlayTexturePath);
  overlayMaterials.forEach((material) => {
    material.map = overlayTexture;
    material.needsUpdate = true;
  });
};

const updateOverlayOpacity = (value) => {
  overlayMaterials.forEach((material) => {
    material.opacity = value;
    material.needsUpdate = true;
  });
};

reloadOverlayTexture();
updateOverlayOpacity(state.overlayOpacity);
const updateHemiLight = () => {
  const baseIntensity = state.hemiIntensity;
  hemiLight.intensity = baseIntensity * state.brightness;
  hemiLight.color.set(state.hemiSkyColor);
  hemiLight.groundColor.set(state.hemiGroundColor);
};

updateHemiLight();

// Create backdrop with front artwork
let backdropTexture = null;
let backdropMesh = null;
let floorMesh = null;

const createBlurredBackdrop = async () => {
  // Dispose old backdrop texture if exists
  if (backdropTexture) {
    backdropTexture.dispose();
    backdropTexture = null;
  }

  // Get front artwork texture
  const frontTex = frontMaterial.map;
  if (!frontTex) return;

  // Create blurred texture (brighter, more visible)
  try {
    backdropTexture = await createBlurredTexture(frontTex, 40, 0.6);
    if (!backdropTexture) return;

    // Create a large plane for the backdrop (far behind the scene)
    if (!backdropMesh) {
      const backdropGeometry = new THREE.PlaneGeometry(20, 20);
      const backdropMaterial = new THREE.MeshStandardMaterial({
        map: backdropTexture,
        emissive: 0x000000,
        roughness: 1,
        metalness: 0,
        side: THREE.DoubleSide,
      });

      backdropMesh = new THREE.Mesh(backdropGeometry, backdropMaterial);
      backdropMesh.position.set(0, 0, -5); // Far behind
      backdropMesh.rotation.y = Math.PI; // Face the camera
      scene.add(backdropMesh);
    } else {
      backdropMesh.material.map?.dispose();
      backdropMesh.material.map = backdropTexture;
      backdropMesh.material.needsUpdate = true;
    }

    // Apply same texture to floor
    if (floorMesh) {
      floorMesh.material.map?.dispose();
      const floorTexture = backdropTexture.clone();
      floorTexture.wrapS = THREE.RepeatWrapping;
      floorTexture.wrapT = THREE.RepeatWrapping;
      floorTexture.repeat.set(2, 2); // Tile the texture on the floor
      floorMesh.material.map = floorTexture;
      floorMesh.material.needsUpdate = true;
    }
  } catch (error) {
    console.warn("Failed to create blurred backdrop", error);
  }
};

// Create floor (texture will be applied when backdrop is created)
const floorGeometry = new THREE.PlaneGeometry(80, 80);
const floorMaterial = new THREE.MeshStandardMaterial({
  color: state.backgroundColor, // Match background color
  roughness: 0.8,
  metalness: 0.1,
});
floorMesh = new THREE.Mesh(floorGeometry, floorMaterial);
floorMesh.rotation.x = -Math.PI / 2;
floorMesh.position.y = -0.6;
floorMesh.receiveShadow = true;
scene.add(floorMesh);

// Backdrop will be created when front texture loads

const updateBrightness = () => {
  const baseHemiIntensity = state.hemiIntensity;
  hemiLight.intensity = baseHemiIntensity * state.brightness;
  dirLight.intensity = 0.8 * state.brightness;
};

updateBrightness();

// Fog setup - sync with background color from start
state.fogColor = state.backgroundColor; // Ensure fog matches background from start
let fog = null;
const updateFog = () => {
  if (state.fogEnabled) {
    if (!fog) {
      fog = new THREE.Fog(state.fogColor, state.fogNear, state.fogFar);
      scene.fog = fog;
    } else {
      fog.color.set(state.fogColor);
      fog.near = state.fogNear;
      fog.far = state.fogFar;
    }
  } else {
    scene.fog = null;
    fog = null;
  }
};
updateFog();

updateVinylReveal(state.vinylReveal);
// Backdrop will be created when front texture loads (see frontTexture.onLoad above)

const applyCustomArtwork = (material, file) => {
  const reader = new FileReader();
  reader.onload = () => {
    material.map?.dispose?.();
    const isFront = material === frontMaterial;
    material.map = createTexture(reader.result, () => {
      // Update backdrop if front artwork changed
      if (isFront) {
        createBlurredBackdrop();
      }
    });
    material.needsUpdate = true;
  };
  reader.readAsDataURL(file);
};

const bindUpload = (inputElement, material) => {
  inputElement.addEventListener("change", () => {
    const file = inputElement.files?.[0];
    if (!file) return;
    applyCustomArtwork(material, file);
    inputElement.value = "";
  });
};

bindUpload(frontUploadInput, frontMaterial);
bindUpload(backUploadInput, backMaterial);

const updateBackgroundColor = (value) => {
  scene.background.set(value);
  renderer.setClearColor(value);
  document.body.style.background = value;
  // Update floor color to match background
  if (floorMesh) {
    floorMesh.material.color.set(value);
    floorMesh.material.needsUpdate = true;
  }
  // Always sync fog color with background color
  state.fogColor = value;
  updateFog();
};
updateBackgroundColor(state.backgroundColor);
persistState();

const showDropOverlay = () => {
  dropOverlay.classList.add("visible");
};

const hideDropOverlay = () => {
  dropOverlay.classList.remove("visible");
};

let dragDepth = 0;

const handleDrop = (event) => {
  event.preventDefault();
  dragDepth = 0;
  hideDropOverlay();
  const file = event.dataTransfer.files?.[0];
  if (!file || !file.type.startsWith("image/")) {
    return;
  }
  const targetMaterial = event.clientX < window.innerWidth / 2 ? frontMaterial : backMaterial;
  applyCustomArtwork(targetMaterial, file);
};

window.addEventListener("dragenter", (event) => {
  event.preventDefault();
  dragDepth += 1;
  showDropOverlay();
});

window.addEventListener("dragover", (event) => {
  event.preventDefault();
});

window.addEventListener("dragleave", (event) => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) {
    hideDropOverlay();
  }
});

window.addEventListener("drop", handleDrop);

const gui = new GUI();
const coverFolder = gui.addFolder("Sleeve Artwork");
coverFolder
  .add(state, "frontArt", Object.keys(artworkChoices))
  .name("Front")
  .onChange(() => {
    reloadArtwork();
    persistState();
  });
coverFolder
  .add(state, "backArt", Object.keys(artworkChoices))
  .name("Back")
  .onChange(() => {
    reloadArtwork();
    persistState();
  });
coverFolder
  .add(
    {
      uploadFront: () => frontUploadInput.click(),
    },
    "uploadFront"
  )
  .name("Upload Front");
coverFolder
  .add(
    {
      uploadBack: () => backUploadInput.click(),
    },
    "uploadBack"
  )
  .name("Upload Back");
coverFolder
  .addColor(state, "backgroundColor")
  .name("Scene Background & Fog")
  .onChange((value) => {
    updateBackgroundColor(value);
    persistState();
  });
coverFolder.add(state, "autoOrbit").name("Auto Orbit").onChange(persistState);
coverFolder
  .add(state, "autoOrbitSpeed", 0, 2, 0.01)
  .name("Auto Orbit Speed")
  .onChange((value) => {
    persistState();
  });
coverFolder.open();

gui
  .add(state, "vinylReveal", 0, 1, 0.01)
  .name("Vinyl Reveal")
  .onChange((value) => {
    updateVinylReveal(value);
    persistState();
  });

const fxFolder = gui.addFolder("Surface FX");
fxFolder
  .add(state, "overlayOpacity", 0, 1, 0.01)
  .name("Overlay Opacity")
  .onChange((value) => {
    updateOverlayOpacity(value);
    persistState();
  });
fxFolder.open();

const lightingFolder = gui.addFolder("Lighting");
lightingFolder
  .add(state, "hemiIntensity", 0, 6, 0.01)
  .name("Hemisphere Intensity")
  .onChange((value) => {
    state.hemiIntensity = value;
    updateHemiLight();
    updateBrightness();
    persistState();
  });
lightingFolder
  .add(state, "brightness", 0, 3, 0.01)
  .name("Brightness")
  .onChange((value) => {
    state.brightness = value;
    updateBrightness();
    persistState();
  });
lightingFolder
  .addColor(state, "hemiSkyColor")
  .name("Hemisphere Sky")
  .onChange((value) => {
    state.hemiSkyColor = value;
    updateHemiLight();
    persistState();
  });
lightingFolder
  .addColor(state, "hemiGroundColor")
  .name("Hemisphere Ground")
  .onChange((value) => {
    state.hemiGroundColor = value;
    updateHemiLight();
    persistState();
  });
lightingFolder.open();

const fogFolder = gui.addFolder("Fog");
fogFolder
  .add(state, "fogEnabled")
  .name("Enabled")
  .onChange((value) => {
    updateFog();
    persistState();
  });
fogFolder
  .addColor(state, "fogColor")
  .name("Color")
  .onChange((value) => {
    // Sync background color with fog color
    state.backgroundColor = value;
    scene.background.set(value);
    renderer.setClearColor(value);
    document.body.style.background = value;
    if (floorMesh) {
      floorMesh.material.color.set(value);
      floorMesh.material.needsUpdate = true;
    }
    updateFog();
    persistState();
  });
fogFolder
  .add(state, "fogNear", 0, 20, 0.1)
  .name("Near")
  .onChange((value) => {
    updateFog();
    persistState();
  });
fogFolder
  .add(state, "fogFar", 0, 50, 0.1)
  .name("Far")
  .onChange((value) => {
    updateFog();
    persistState();
  });
fogFolder.open();

window.addEventListener("resize", () => {
  const { innerWidth, innerHeight } = window;
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
});

// Track object rotation separately
let objectRotationX = 0;
let objectRotationY = 0;

// Store previous mouse position to calculate delta
let previousMouseX = 0;
let previousMouseY = 0;
let isDragging = false;

renderer.domElement.addEventListener("mousedown", (e) => {
  isDragging = true;
  previousMouseX = e.clientX;
  previousMouseY = e.clientY;
});

renderer.domElement.addEventListener("mousemove", (e) => {
  if (!isDragging) return;

  const deltaX = e.clientX - previousMouseX;
  const deltaY = e.clientY - previousMouseY;

  objectRotationY += deltaX * 0.01;
  objectRotationX += deltaY * 0.01;

  // Clamp vertical rotation
  objectRotationX = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, objectRotationX));

  previousMouseX = e.clientX;
  previousMouseY = e.clientY;
});

renderer.domElement.addEventListener("mouseup", () => {
  isDragging = false;
});

renderer.domElement.addEventListener("mouseleave", () => {
  isDragging = false;
});

// Disable default OrbitControls rotation
controls.enableRotate = false;

// Camera orbit variables
let cameraAngle = 0;
let baseCameraDistance = 2.5;
const cameraHeight = 0.85;

const clock = new THREE.Clock();
const animate = () => {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();

  // Apply object rotation
  sleeveGroup.rotation.y = objectRotationY;
  sleeveGroup.rotation.x = objectRotationX;

  // Auto orbit: rotate camera around the object (only when enabled)
  // Do this BEFORE controls.update() so zoom can still work
  if (state.autoOrbit) {
    cameraAngle += delta * state.autoOrbitSpeed;
    // Get the current horizontal distance to preserve zoom
    const dx = camera.position.x - controls.target.x;
    const dz = camera.position.z - controls.target.z;
    const horizontalDistance = Math.sqrt(dx * dx + dz * dz) || 2.5;

    // Rotate around the object while preserving zoom distance
    camera.position.x = controls.target.x + Math.cos(cameraAngle) * horizontalDistance;
    camera.position.z = controls.target.z + Math.sin(cameraAngle) * horizontalDistance;
    camera.position.y = controls.target.y + cameraHeight;
    camera.lookAt(controls.target);
  }

  // Update controls (handles zoom on scroll/wheel - this should be the ONLY way zoom happens)
  controls.update();

  renderer.render(scene, camera);
};
animate();
