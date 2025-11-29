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
appEl.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xdfe7fb);
renderer.setClearColor(scene.background);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.05, 50);
camera.position.set(1.5, 0.85, 1.5);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 0, 0);

const hemiLight = new THREE.HemisphereLight(0xffffff, 0x111122, 1.1);
scene.add(hemiLight);

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
  backgroundColor: "#100f0f",
  autoOrbit: false,
  overlayOpacity: 1,
  hemiIntensity: 1.1,
  hemiSkyColor: "#ffffff",
  hemiGroundColor: "#111122",
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

const createTexture = (path) => {
  const texture = textureLoader.load(path);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
};

const sleeveWidth = 1;
const sleeveHeight = 1;
const sleeveThickness = 0.006;
const sleeveGroup = new THREE.Group();
scene.add(sleeveGroup);

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
    3
  );
  merged.hemiSkyColor = typeof merged.hemiSkyColor === "string" ? merged.hemiSkyColor : DEFAULT_STATE.hemiSkyColor;
  merged.hemiGroundColor = typeof merged.hemiGroundColor === "string" ? merged.hemiGroundColor : DEFAULT_STATE.hemiGroundColor;
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
        overlayOpacity: state.overlayOpacity,
        hemiIntensity: state.hemiIntensity,
        hemiSkyColor: state.hemiSkyColor,
        hemiGroundColor: state.hemiGroundColor,
      })
    );
  } catch (error) {
    console.warn("Failed to save state", error);
  }
};

const frontMaterial = new THREE.MeshStandardMaterial({
  map: createTexture(artworkChoices[state.frontArt] ?? artworkChoices[DEFAULT_STATE.frontArt]),
  roughness: 0.8,
  metalness: 0.1,
  side: THREE.FrontSide,
});
const frontMesh = new THREE.Mesh(planeGeometry, frontMaterial);
frontMesh.position.z = planeOffset;

const backMaterial = new THREE.MeshStandardMaterial({
  map: createTexture(artworkChoices[state.backArt] ?? artworkChoices[DEFAULT_STATE.backArt]),
  roughness: 0.8,
  metalness: 0.1,
  side: THREE.FrontSide,
});
const backMesh = new THREE.Mesh(planeGeometry, backMaterial);
backMesh.rotation.y = Math.PI;
backMesh.position.z = -planeOffset;

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
  frontMaterial.map = createTexture(artworkChoices[state.frontArt]);
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
  hemiLight.intensity = state.hemiIntensity;
  hemiLight.color.set(state.hemiSkyColor);
  hemiLight.groundColor.set(state.hemiGroundColor);
};

updateHemiLight();

updateVinylReveal(state.vinylReveal);

const applyCustomArtwork = (material, file) => {
  const reader = new FileReader();
  reader.onload = () => {
    material.map?.dispose?.();
    material.map = createTexture(reader.result);
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
  .name("Scene Background")
  .onChange((value) => {
    updateBackgroundColor(value);
    persistState();
  });
coverFolder.add(state, "autoOrbit").name("Auto Orbit").onChange(persistState);
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
  .add(state, "hemiIntensity", 0, 3, 0.01)
  .name("Hemisphere Intensity")
  .onChange((value) => {
    state.hemiIntensity = value;
    updateHemiLight();
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

window.addEventListener("resize", () => {
  const { innerWidth, innerHeight } = window;
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
});

const clock = new THREE.Clock();
const animate = () => {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  if (state.autoOrbit) {
    sleeveGroup.rotation.y += delta * 0.25;
  }
  controls.update();
  renderer.render(scene, camera);
};
animate();
