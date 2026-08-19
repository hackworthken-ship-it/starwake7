import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';

/* =========================================================================
   STARWAKE — a Quest 3 WebXR space-flight game
   Pilot the rocket down a procedurally-generated corridor of gates and
   asteroids. Bank through rings for score, dodge rock, and dock with the
   Transport Shuttle at the end of each wave to advance.
   ========================================================================= */

// ---------- Constants ----------------------------------------------------
const LANE_HALF_WIDTH = 5.2;   // how far left/right the rig can move
const LANE_HALF_HEIGHT = 3.2;  // how far up/down the rig can move
const SPAWN_Z = -420;           // where obstacles are born
const DESPAWN_Z = 14;           // where obstacles are recycled
const COLLIDE_Z_MIN = -1.6;     // z-band where we test for collisions
const COLLIDE_Z_MAX = 1.6;
const RINGS_PER_LEVEL = 8;
const MAX_LEVEL = 6;
const START_LIVES = 3;

// ---------- Renderer / Scene / Camera ------------------------------------
const canvasHost = document.getElementById('app');

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.xr.enabled = true;
renderer.outputColorSpace = THREE.SRGBColorSpace;
canvasHost.appendChild(renderer.domElement);

const vrButton = VRButton.createButton(renderer, document.getElementById('settings-panel'));
document.body.appendChild(vrButton);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x02030a);
scene.fog = new THREE.FogExp2(0x02030a, 0.0032);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 900);

// The rig is what actually strafes/dodges. In VR the XR camera renders
// relative to this rig's transform, so head movement adds on top of it.
const rig = new THREE.Group();
rig.position.set(0, 1.6, 0);
rig.add(camera);
scene.add(rig);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- Lighting -------------------------------------------------------
scene.add(new THREE.AmbientLight(0x445577, 0.9));
const sun = new THREE.DirectionalLight(0xfff2d8, 1.4);
sun.position.set(30, 60, -20);
scene.add(sun);
const rimLight = new THREE.DirectionalLight(0x4477ff, 0.6);
rimLight.position.set(-40, -10, 30);
scene.add(rimLight);

// ---------- Starfield & nebula backdrop ------------------------------------
function buildStarfield() {
  const counts = 3200;
  const positions = new Float32Array(counts * 3);
  const colors = new Float32Array(counts * 3);
  const palette = [
    new THREE.Color(0xffffff),
    new THREE.Color(0xbfd7ff),
    new THREE.Color(0xffe3c2),
    new THREE.Color(0x9fd8ff),
  ];
  for (let i = 0; i < counts; i++) {
    const radius = 260 + Math.random() * 420;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(THREE.MathUtils.randFloatSpread(2));
    positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = radius * Math.cos(phi);
    positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta) - 150;
    const c = palette[(Math.random() * palette.length) | 0];
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.PointsMaterial({ size: 1.35, vertexColors: true, sizeAttenuation: true });
  const pts = new THREE.Points(geo, mat);
  scene.add(pts);
  return pts;
}
const starfield = buildStarfield();

// distant nebula sprite panels for depth / color
function buildNebula() {
  const group = new THREE.Group();
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d');
  const grad = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  grad.addColorStop(0, 'rgba(120,90,255,0.55)');
  grad.addColorStop(0.5, 'rgba(60,40,140,0.25)');
  grad.addColorStop(1, 'rgba(10,10,30,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.9 });
  const spots = [
    [-140, 40, -380, 260, 0x000000],
    [160, -30, -420, 300, 0x000000],
    [0, 90, -500, 340, 0x000000],
  ];
  spots.forEach(([x, y, z, s]) => {
    const spr = new THREE.Sprite(mat);
    spr.position.set(x, y, z);
    spr.scale.set(s, s, 1);
    group.add(spr);
  });
  scene.add(group);
}
buildNebula();

// ---------- Asset loading ---------------------------------------------------
const manager = new THREE.LoadingManager();
const loadingBar = document.getElementById('loading-bar');
const loadingScreen = document.getElementById('loading-screen');
manager.onProgress = (_url, loaded, total) => {
  loadingBar.style.width = `${Math.round((loaded / total) * 100)}%`;
};
manager.onError = (url) => {
  console.error('Failed to load', url);
  const sub = document.getElementById('loading-sub');
  sub.textContent = `Failed to load: ${url}`;
  sub.style.color = '#ff5b7a';
};
manager.onLoad = () => {
  window.__starwakeLoaded = true;
  loadingScreen.classList.add('hidden');
  showMessage('STARWAKE', 'Fly the shrinking gate corridor — smaller rings are worth more.\nMiss a ring and it flashes red. Shoot asteroids before they arrive\nfor bonus points, or just dodge them. Dock to warp on — and watch the\nreplay of your run (press Space/Trigger any time to skip it).\n\nDesktop: Arrow/WASD to steer, Space to shoot/start, C to swap ship\nQuest: thumbstick to steer, trigger to shoot/start, click stick to swap ship', 'start');
};

// Safety net: if loading stalls (e.g. a blocked/failed asset that never
// resolves), don't leave the player stuck on the loading screen forever.
setTimeout(() => {
  if (!loadingScreen.classList.contains('hidden')) {
    console.warn('Loading manager did not finish in time — forcing start.');
    window.__starwakeLoaded = true;
    loadingScreen.classList.add('hidden');
    showMessage('STARWAKE', 'Fly the shrinking gate corridor — smaller rings are worth more.\nMiss a ring and it flashes red. Shoot asteroids before they arrive\nfor bonus points, or just dodge them. Dock to warp on — and watch the\nreplay of your run (press Space/Trigger any time to skip it).\n\nDesktop: Arrow/WASD to steer, Space to shoot/start, C to swap ship\nQuest: thumbstick to steer, trigger to shoot/start, click stick to swap ship', 'start');
  }
}, 15000);

const objLoader = new OBJLoader(manager);
const mtlLoaderRocket = new MTLLoader(manager);
const mtlLoaderShuttle = new MTLLoader(manager);
const mtlLoaderE45 = new MTLLoader(manager);
const mtlLoaderIntergalactic = new MTLLoader(manager);

let rocketModel = null;
let shuttleTemplate = null;       // used for the stationary "dock here" gate
let shuttlePlayerModel = null;    // used when flying the shuttle as your ship
let e45Model = null;
let intergalacticModel = null;
let shuttleVerticalOffset = 0;
let engineGlow = null;

// Shared helper for the newer player-ship variants: scales a model to a
// target nose-to-tail length along its (already rotated) local Z axis, then
// recenters it so its visual bounding-box center sits at the mount origin.
// Also records how far its tail extends, for placing the engine glow/trail.
function prepareShipModel(raw, { rotationY = 0, targetLength, extraZPush = 0 }) {
  const obj = raw.clone(true);
  obj.rotation.set(0, rotationY, 0);
  obj.updateMatrixWorld(true);
  const rawSize = new THREE.Vector3();
  new THREE.Box3().setFromObject(obj).getSize(rawSize);
  obj.scale.setScalar(targetLength / rawSize.z);
  obj.updateMatrixWorld(true);
  const center = new THREE.Vector3();
  new THREE.Box3().setFromObject(obj).getCenter(center);
  obj.position.set(-center.x, -center.y, -center.z + extraZPush);
  obj.updateMatrixWorld(true);
  obj.userData.tailZ = new THREE.Box3().setFromObject(obj).max.z;
  return obj;
}

mtlLoaderRocket.setPath('assets/rocket/');
mtlLoaderRocket.load('rocket.mtl', (materials) => {
  materials.preload();
  objLoader.setMaterials(materials);
  objLoader.setPath('assets/rocket/');
  objLoader.load('rocket.obj', (obj) => {
    obj.traverse((c) => { if (c.isMesh) { c.castShadow = false; c.receiveShadow = false; } });
    // Source model's long axis is ~1968 units nose-to-tail (file Z); scale it
    // down to a ~2.7 unit ship and flip 180° on Y so the nose (file +Z)
    // points down the world's -Z "forward" axis.
    obj.scale.setScalar(0.00135);
    obj.rotation.set(0, Math.PI, 0);
    obj.position.set(0, -0.05, 0);
    obj.rotation.z = Math.PI; // nose-forward relative to the mount
    rocketModel = obj;
    maybeInitShips();
  });
});

const shuttleObjLoader = new OBJLoader(manager);
mtlLoaderShuttle.setPath('assets/shuttle/');
mtlLoaderShuttle.load('shuttle.mtl', (materials) => {
  materials.preload();
  shuttleObjLoader.setMaterials(materials);
  shuttleObjLoader.setPath('assets/shuttle/');
  shuttleObjLoader.load('shuttle.obj', (raw) => {
    raw.traverse((c) => { if (c.isMesh) { c.castShadow = false; c.receiveShadow = false; } });

    // --- Variant 1: stationary "dock here" gate at the end of each wave ---
    const gateObj = raw.clone(true);
    gateObj.scale.setScalar(0.35);
    gateObj.rotation.set(0, Math.PI, 0);
    // Source model sits on its landing legs with its base at Y=0 (Y 0..4.4),
    // so its visual center is well above the object's origin. Recenter it
    // vertically so it reads as a floating "gate" centered on the lane.
    const gateBox = new THREE.Box3().setFromObject(gateObj);
    shuttleVerticalOffset = -(gateBox.min.y + gateBox.max.y) / 2;
    shuttleTemplate = gateObj;

    // --- Variant 2: playable ship. The model's nose (cockpit) points down
    // its local -X axis, not -Z, so it needs a -90° Y rotation (verified
    // empirically) to face the world's -Z "forward" direction instead of
    // the rocket's simple 180° flip. It's also wide/flat, so it's kept a
    // little shorter and pushed back slightly so it doesn't crowd the view.
    shuttlePlayerModel = prepareShipModel(raw, { rotationY: -Math.PI / 2, targetLength: 2.0, extraZPush: -0.3 });

    maybeInitShips();
  });
});

const e45ObjLoader = new OBJLoader(manager);
mtlLoaderE45.setPath('assets/e45/');
mtlLoaderE45.load('e45.mtl', (materials) => {
  materials.preload();
  e45ObjLoader.setMaterials(materials);
  e45ObjLoader.setPath('assets/e45/');
  e45ObjLoader.load('e45.obj', (raw) => {
    raw.traverse((c) => { if (c.isMesh) { c.castShadow = false; c.receiveShadow = false; } });
    // Nose already faces local -Z (verified by render), so no rotation needed.
    // Its tail cross-section is wide, so it's kept shorter and pushed back
    // a bit further than the slender rocket to avoid crowding the view.
    e45Model = prepareShipModel(raw, { rotationY: 0, targetLength: 1.9, extraZPush: -0.35 });
    maybeInitShips();
  });
});

const intergalacticObjLoader = new OBJLoader(manager);
mtlLoaderIntergalactic.setPath('assets/intergalactic/');
mtlLoaderIntergalactic.load('intergalactic.mtl', (materials) => {
  materials.preload();
  intergalacticObjLoader.setMaterials(materials);
  intergalacticObjLoader.setPath('assets/intergalactic/');
  intergalacticObjLoader.load('intergalactic.obj', (raw) => {
    raw.traverse((c) => { if (c.isMesh) { c.castShadow = false; c.receiveShadow = false; } });
    // Nose already faces local -Z (verified via vertex analysis + render).
    // Very wide wingspan, so scaled down a bit more than its raw length
    // would suggest, and pushed back slightly for breathing room.
    intergalacticModel = prepareShipModel(raw, { rotationY: 0, targetLength: 1.9, extraZPush: -0.2 });
    maybeInitShips();
  });
});

// ---------- Player ship visual (fixed relative to rig) ---------------------
const shipMount = new THREE.Group();
shipMount.position.set(0, -0.55, -2.05);
rig.add(shipMount);

const SHIP_ORDER = ['rocket', 'shuttle', 'e45', 'intergalactic'];
const SHIPS = {
  rocket: {
    label: 'Rocket',
    get model() { return rocketModel; },
    engineOffset: new THREE.Vector3(0, 0.1, 0.9),
    trailOffset: new THREE.Vector3(0, 0.1, 1.15),
    trailScale: new THREE.Vector3(1, 1, 1),
  },
  shuttle: {
    label: 'Transport Shuttle',
    get model() { return shuttlePlayerModel; },
    engineOffset: new THREE.Vector3(0, 0, 0.55),
    trailOffset: new THREE.Vector3(0, 0, 0.75),
    trailScale: new THREE.Vector3(1.6, 1.6, 0.7),
  },
  e45: {
    label: 'E-45 Aircraft',
    get model() { return e45Model; },
    get engineOffset() { const z = e45Model ? e45Model.userData.tailZ : 1; return new THREE.Vector3(0, 0, z * 0.7); },
    get trailOffset() { const z = e45Model ? e45Model.userData.tailZ : 1; return new THREE.Vector3(0, 0, z * 0.85); },
    trailScale: new THREE.Vector3(0.4, 0.35, 0.4),
  },
  intergalactic: {
    label: 'Intergalactic Spaceship',
    get model() { return intergalacticModel; },
    get engineOffset() { const z = intergalacticModel ? intergalacticModel.userData.tailZ : 1; return new THREE.Vector3(0, 0, z * 0.8); },
    get trailOffset() { const z = intergalacticModel ? intergalacticModel.userData.tailZ : 1; return new THREE.Vector3(0, 0, z * 0.95); },
    trailScale: new THREE.Vector3(0.7, 0.7, 0.7),
  },
};
let currentShipKey = 'rocket';
let shipsReady = false;
let trailMesh = null;

function maybeInitShips() {
  if (shipsReady || !rocketModel || !shuttlePlayerModel || !e45Model || !intergalacticModel) return;
  shipsReady = true;

  engineGlow = new THREE.PointLight(0xff8a3d, 3.5, 8, 2);
  shipMount.add(engineGlow);

  const trailGeo = new THREE.ConeGeometry(0.12, 0.9, 12, 1, true);
  const trailMat = new THREE.MeshBasicMaterial({ color: 0xffb066, transparent: true, opacity: 0.55 });
  trailMesh = new THREE.Mesh(trailGeo, trailMat);
  trailMesh.rotation.x = Math.PI / 2;
  shipMount.add(trailMesh);
  ship.trailMesh = trailMesh;

  mountShip(currentShipKey);
}

function mountShip(key) {
  const prev = SHIPS[currentShipKey];
  if (prev && prev.model) {
    shipMount.remove(prev.model);
    // guard against leaving it mid-blink-transparent from an invulnerability flash
    prev.model.traverse((c) => { if (c.isMesh) { c.material.transparent = false; c.material.opacity = 1; } });
  }

  currentShipKey = key;
  const cfg = SHIPS[key];
  shipMount.add(cfg.model);
  engineGlow.position.copy(cfg.engineOffset);
  trailMesh.position.copy(cfg.trailOffset);
  trailMesh.scale.copy(cfg.trailScale);
}

function switchShip() {
  if (!shipsReady) return;
  const idx = SHIP_ORDER.indexOf(currentShipKey);
  mountShip(SHIP_ORDER[(idx + 1) % SHIP_ORDER.length]);
  showShipNotice(SHIPS[currentShipKey].label);
  sfxConfirm();
}

// ---------- Gameplay state --------------------------------------------------
const ship = {
  x: 0, y: 0,           // current rig offset
  vx: 0, vy: 0,          // velocity (desktop keyboard easing)
  tilt: 0,
  trailMesh: null,
  invulnerableUntil: 0,
};

const STATE = { MENU: 'menu', PLAYING: 'playing', PAUSED_MSG: 'paused_msg', GAMEOVER: 'gameover', WIN: 'win', REPLAY: 'replay' };
let state = STATE.MENU;

let score = 0;
let level = 1;
let lives = START_LIVES;
let ringsThisLevel = 0;
let waveRingHistory = []; // { x, y, hit, points, order } — for the end-of-wave flyover
let waveRingCounter = 0;
let speed = 26; // world units / second
let elapsed = 0;
let nextSpawnZ = SPAWN_Z;
const RING_COLORS = [0x39d0ff, 0x8a5bff, 0x39ffb0, 0xffcf39, 0xff5b7a, 0xff9f39];

// Rings start huge (easy, low value) and shrink toward their baseline size
// as you rack up rings over the whole run — smaller ring = more points.
let totalRingsSpawned = 0;
const RING_START_RADIUS = 4.6;
const RING_BASE_RADIUS = 2.1;
const RING_SHRINK_OVER = 40; // rings encountered before reaching baseline size
const RING_MIN_POINTS = 50;
const RING_MAX_POINTS = 180;
const RING_HIT_COLOR = 0x3dff8a;
const RING_MISS_COLOR = 0xff3b4e;

const obstacles = []; // { type:'ring'|'asteroid'|'shuttle', mesh, x, y, radius, points, resolved }
const projectiles = [];
const popups = [];
const effects = [];

const PROJECTILE_SPEED = 260;
const SHOOT_COOLDOWN = 0.2;
let shootCooldownTimer = 0;

// Object pools / factory geometries
// Brighter + emissive so they read clearly against black space — smaller
// (harder to spot, higher-value) asteroids glow more to draw the eye.
const ASTEROID_TIERS = [
  { name: 'small', radius: 0.5, points: 220, emissiveIntensity: 0.85 },
  { name: 'medium', radius: 0.85, points: 130, emissiveIntensity: 0.6 },
  { name: 'large', radius: 1.3, points: 70, emissiveIntensity: 0.4 },
];
const asteroidMats = ASTEROID_TIERS.map((tier) => new THREE.MeshStandardMaterial({
  color: 0xcbb8a4,
  roughness: 0.7,
  metalness: 0.1,
  flatShading: true,
  emissive: 0xff6a35,
  emissiveIntensity: tier.emissiveIntensity,
}));
function buildAsteroidGeometry(radius) {
  const g = new THREE.IcosahedronGeometry(radius, 1);
  const pos = g.attributes.position;
  const jitter = radius * 0.16;
  for (let v = 0; v < pos.count; v++) {
    pos.setXYZ(
      v,
      pos.getX(v) + (Math.random() - 0.5) * jitter,
      pos.getY(v) + (Math.random() - 0.5) * jitter,
      pos.getZ(v) + (Math.random() - 0.5) * jitter
    );
  }
  g.computeVertexNormals();
  return g;
}
const asteroidGeoSets = ASTEROID_TIERS.map((tier) => [0, 1].map(() => buildAsteroidGeometry(tier.radius)));

const projGeo = new THREE.SphereGeometry(0.09, 8, 8);
const projMat = new THREE.MeshBasicMaterial({ color: 0x8ff5ff });

// ---------- Small text-sprite helper (ring labels, hit/miss popups) --------
function makeTextTexture(text, { color = '#eaf6ff', bg = 'rgba(4,10,24,0.6)', font = '700 40px "Segoe UI", sans-serif' } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = 200; canvas.height = 100;
  const ctx = canvas.getContext('2d');
  if (bg) {
    ctx.fillStyle = bg;
    roundRect(ctx, 4, 4, canvas.width - 8, canvas.height - 8, 18);
    ctx.fill();
  }
  ctx.fillStyle = color;
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
function makeRingLabel(text) {
  const tex = makeTextTexture(text, { color: '#eaf6ff' });
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: true });
  const spr = new THREE.Sprite(mat);
  spr.scale.set(1.15, 0.58, 1);
  return spr;
}
function spawnPopup(pos, text, color) {
  const tex = makeTextTexture(text, { color, bg: null, font: '800 46px "Segoe UI", sans-serif' });
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const spr = new THREE.Sprite(mat);
  spr.scale.set(1.5, 0.75, 1);
  spr.position.copy(pos);
  spr.renderOrder = 998;
  scene.add(spr);
  popups.push({ sprite: spr, mat, tex, life: 0, maxLife: 0.9 });
}
function updatePopups(dt) {
  for (let i = popups.length - 1; i >= 0; i--) {
    const p = popups[i];
    p.life += dt;
    p.sprite.position.y += dt * 1.3;
    p.sprite.material.opacity = Math.max(0, 1 - p.life / p.maxLife);
    if (p.life >= p.maxLife) {
      scene.remove(p.sprite);
      p.tex.dispose(); p.mat.dispose();
      popups.splice(i, 1);
    }
  }
}

// quick expanding flash for asteroid kills
function spawnHitFlash(pos) {
  const geo = new THREE.SphereGeometry(0.4, 10, 10);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.9 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(pos);
  scene.add(mesh);
  effects.push({ mesh, geo, mat, life: 0, maxLife: 0.35 });
}
function updateEffects(dt) {
  for (let i = effects.length - 1; i >= 0; i--) {
    const e = effects[i];
    e.life += dt;
    const t = e.life / e.maxLife;
    e.mesh.scale.setScalar(1 + t * 3);
    e.mesh.material.opacity = Math.max(0, 1 - t);
    if (e.life >= e.maxLife) {
      scene.remove(e.mesh);
      e.geo.dispose(); e.mat.dispose();
      effects.splice(i, 1);
    }
  }
}

function ringProgress() {
  return THREE.MathUtils.clamp(totalRingsSpawned / RING_SHRINK_OVER, 0, 1);
}
function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

function removeRing(o) {
  scene.remove(o.mesh);
  o.mesh.geometry.dispose();
  o.mesh.material.dispose();
  o.mesh.traverse((c) => { if (c.isSprite) { c.material.map.dispose(); c.material.dispose(); } });
}

function spawnRing(z) {
  const t = easeOutCubic(ringProgress());
  const r = THREE.MathUtils.lerp(RING_START_RADIUS, RING_BASE_RADIUS, t);
  const tube = THREE.MathUtils.clamp(r * 0.062, 0.09, 0.22);
  const points = Math.round(THREE.MathUtils.mapLinear(r, RING_START_RADIUS, RING_BASE_RADIUS, RING_MIN_POINTS, RING_MAX_POINTS));
  const geo = new THREE.TorusGeometry(r, tube, 12, 40);
  const color = RING_COLORS[(level - 1) % RING_COLORS.length];
  const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.65, roughness: 0.35, metalness: 0.4 });
  const mesh = new THREE.Mesh(geo, mat);
  const x = THREE.MathUtils.randFloatSpread(LANE_HALF_WIDTH * 1.3);
  const y = THREE.MathUtils.randFloatSpread(LANE_HALF_HEIGHT * 1.3);
  mesh.position.set(x, y, z);

  const label = makeRingLabel(`${points}`);
  label.position.set(r + 0.85, 0, 0);
  mesh.add(label);

  scene.add(mesh);
  obstacles.push({ type: 'ring', mesh, x, y, radius: r * 0.82, points, resolved: false });
  totalRingsSpawned += 1;
}

function pickAsteroidTier() {
  const roll = Math.random();
  if (roll < 0.3) return 0;   // small — worth the most, hardest to hit
  if (roll < 0.75) return 1;  // medium
  return 2;                    // large — easiest, worth the least
}

function spawnAsteroid(z) {
  const tierIdx = pickAsteroidTier();
  const tier = ASTEROID_TIERS[tierIdx];
  const geo = asteroidGeoSets[tierIdx][(Math.random() * 2) | 0];
  const mesh = new THREE.Mesh(geo, asteroidMats[tierIdx]);
  const x = THREE.MathUtils.randFloatSpread(LANE_HALF_WIDTH * 1.6);
  const y = THREE.MathUtils.randFloatSpread(LANE_HALF_HEIGHT * 1.6);
  mesh.position.set(x, y, z);
  mesh.userData.spin = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(1.2);

  const moving = Math.random() < Math.min(0.65, 0.25 + level * 0.08);
  const driftAmpX = moving ? THREE.MathUtils.randFloat(0.6, 1.8) : 0;
  const driftAmpY = moving ? THREE.MathUtils.randFloat(0.4, 1.3) : 0;
  const driftFreq = THREE.MathUtils.randFloat(0.6, 1.4) * (1 + level * 0.05);
  const driftPhase = Math.random() * Math.PI * 2;

  scene.add(mesh);
  obstacles.push({
    type: 'asteroid', mesh, x, y, baseX: x, baseY: y,
    radius: tier.radius, points: tier.points,
    driftAmpX, driftAmpY, driftFreq, driftPhase,
  });
}

function fireProjectile() {
  if (state !== STATE.PLAYING) return;
  if (shootCooldownTimer > 0) return;
  shootCooldownTimer = SHOOT_COOLDOWN;
  const origin = new THREE.Vector3();
  shipMount.getWorldPosition(origin);
  origin.z -= 1.2; // spawn just ahead of the nose tip
  const mesh = new THREE.Mesh(projGeo, projMat);
  mesh.position.copy(origin);
  scene.add(mesh);
  projectiles.push({ mesh, x: origin.x, y: origin.y });
  sfxShoot();
}

function updateProjectiles(dt) {
  const dz = PROJECTILE_SPEED * dt;
  outer: for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.mesh.position.z -= dz;
    const z = p.mesh.position.z;

    for (let j = obstacles.length - 1; j >= 0; j--) {
      const o = obstacles[j];
      if (o.type !== 'asteroid') continue;
      const dxp = o.x - p.x, dyp = o.y - p.y, dzp = o.mesh.position.z - z;
      if (Math.abs(dzp) < o.radius + 0.6 && Math.hypot(dxp, dyp) < o.radius + 0.4) {
        score += o.points;
        spawnPopup(o.mesh.position.clone(), `+${o.points}`, '#8ff5ff');
        spawnHitFlash(o.mesh.position.clone());
        sfxAsteroidPop();
        scene.remove(o.mesh);
        obstacles.splice(j, 1);
        scene.remove(p.mesh);
        projectiles.splice(i, 1);
        continue outer;
      }
    }
    if (z < SPAWN_Z - 20) {
      scene.remove(p.mesh);
      projectiles.splice(i, 1);
    }
  }
}

let shuttleObstacle = null;
function spawnShuttleGate(z) {
  if (!shuttleTemplate) return;
  const mesh = shuttleTemplate.clone(true);
  mesh.position.set(0, shuttleVerticalOffset, z);
  scene.add(mesh);
  const obj = { type: 'shuttle', mesh, x: 0, y: 0, radius: 3.4, resolved: false };
  obstacles.push(obj);
  shuttleObstacle = obj;
}

function clearObstacles() {
  for (const o of obstacles) {
    if (o.type === 'ring') removeRing(o);
    else scene.remove(o.mesh);
  }
  obstacles.length = 0;
  shuttleObstacle = null;
}

function clearTransient() {
  for (const p of projectiles) scene.remove(p.mesh);
  projectiles.length = 0;
  for (const p of popups) { scene.remove(p.sprite); p.tex.dispose(); p.mat.dispose(); }
  popups.length = 0;
  for (const e of effects) { scene.remove(e.mesh); e.geo.dispose(); e.mat.dispose(); }
  effects.length = 0;
}

// ---------- Wave / spawn director ------------------------------------------
let spawnCooldown = 0;
function updateSpawner(dt) {
  if (shuttleObstacle) return; // waiting to dock, hold spawns
  spawnCooldown -= dt;
  if (spawnCooldown <= 0) {
    spawnRing(SPAWN_Z);
    // occasional escort asteroid near (but not on top of) the ring
    if (Math.random() < 0.55 + level * 0.05) {
      spawnAsteroid(SPAWN_Z - 18 - Math.random() * 40);
    }
    spawnCooldown = Math.max(0.62, 1.35 - level * 0.09);
  }
}

// ---------- In-scene HUD (works identically in VR and on desktop) ---------
function makeCanvasPanel(width, height, canvasW = 512, canvasH = 256) {
  const canvas = document.createElement('canvas');
  canvas.width = canvasW; canvas.height = canvasH;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false });
  const geo = new THREE.PlaneGeometry(width, height);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 999;
  return { mesh, ctx, canvas, tex };
}

// small persistent HUD strip (score/level/lives), pinned low in view
const hud = makeCanvasPanel(1.15, 0.28, 640, 160);
hud.mesh.position.set(0, -0.62, -1.35);
camera.add(hud.mesh);

function drawHud() {
  const { ctx, canvas, tex } = hud;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(6,10,22,0.55)';
  roundRect(ctx, 4, 4, canvas.width - 8, canvas.height - 8, 22);
  ctx.fill();
  ctx.strokeStyle = 'rgba(90,170,255,0.55)';
  ctx.lineWidth = 3;
  roundRect(ctx, 4, 4, canvas.width - 8, canvas.height - 8, 22);
  ctx.stroke();

  ctx.fillStyle = '#eaf6ff';
  ctx.font = '700 40px "Segoe UI", sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(`SCORE ${score.toString().padStart(5, '0')}`, 28, 46);

  ctx.font = '600 30px "Segoe UI", sans-serif';
  ctx.fillStyle = '#8fd6ff';
  ctx.fillText(`WAVE ${level}`, 28, 108);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#ff5b7a';
  const heart = '\u2665';
  ctx.font = '700 34px "Segoe UI", sans-serif';
  ctx.fillText(heart.repeat(Math.max(0, lives)), canvas.width - 24, 108);
  ctx.textAlign = 'left';
  tex.needsUpdate = true;
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// large center message panel (menus / game over / level complete)
const messagePanel = makeCanvasPanel(2.6, 1.5, 900, 520);
messagePanel.mesh.position.set(0, 0, -2.4);
camera.add(messagePanel.mesh);
messagePanel.mesh.visible = false;

let pendingAction = null;
function showMessage(title, body, action) {
  const { ctx, canvas, tex } = messagePanel;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(4,8,20,0.82)';
  roundRect(ctx, 0, 0, canvas.width, canvas.height, 34);
  ctx.fill();
  ctx.strokeStyle = 'rgba(120,190,255,0.7)';
  ctx.lineWidth = 4;
  roundRect(ctx, 4, 4, canvas.width - 8, canvas.height - 8, 32);
  ctx.stroke();

  ctx.fillStyle = '#8fd6ff';
  ctx.font = '800 64px "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(title, canvas.width / 2, 96);

  ctx.fillStyle = '#eaf6ff';
  ctx.font = '400 27px "Segoe UI", sans-serif';
  const lines = body.split('\n');
  let ly = 190;
  for (const line of lines) {
    ctx.fillText(line, canvas.width / 2, ly);
    ly += 40;
  }

  ctx.fillStyle = '#ffcf39';
  ctx.font = '700 32px "Segoe UI", sans-serif';
  ctx.fillText('\u25B6  PRESS SPACE / TRIGGER  \u25B6', canvas.width / 2, canvas.height - 56);
  ctx.textAlign = 'left';
  tex.needsUpdate = true;
  messagePanel.mesh.visible = true;
  pendingAction = action;
  state = STATE.PAUSED_MSG;
}
function hideMessage() {
  messagePanel.mesh.visible = false;
}

// simple crosshair shown only while flying, to help aim shots
const reticle = makeCanvasPanel(0.14, 0.14, 64, 64);
reticle.mesh.position.set(0, 0, -2.6);
camera.add(reticle.mesh);
reticle.mesh.visible = false;
(function drawReticleOnce() {
  const { ctx, canvas, tex } = reticle;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = 'rgba(200,230,255,0.65)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(32, 32, 10, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(32, 12); ctx.lineTo(32, 22);
  ctx.moveTo(32, 42); ctx.lineTo(32, 52);
  ctx.moveTo(12, 32); ctx.lineTo(22, 32);
  ctx.moveTo(42, 32); ctx.lineTo(52, 32);
  ctx.stroke();
  tex.needsUpdate = true;
})();

// Brief "now flying: <ship>" notice shown when switching ships
const shipNotice = makeCanvasPanel(1.3, 0.32, 560, 140);
shipNotice.mesh.position.set(0, 0.55, -1.8);
camera.add(shipNotice.mesh);
shipNotice.mesh.visible = false;
let shipNoticeTimer = 0;
function showShipNotice(label) {
  const { ctx, canvas, tex } = shipNotice;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(4,10,24,0.75)';
  roundRect(ctx, 4, 4, canvas.width - 8, canvas.height - 8, 20);
  ctx.fill();
  ctx.strokeStyle = 'rgba(120,190,255,0.6)';
  ctx.lineWidth = 3;
  roundRect(ctx, 4, 4, canvas.width - 8, canvas.height - 8, 20);
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.fillStyle = '#8fd6ff';
  ctx.font = '600 22px "Segoe UI", sans-serif';
  ctx.fillText('NOW FLYING', canvas.width / 2, 48);
  ctx.fillStyle = '#eaf6ff';
  ctx.font = '800 34px "Segoe UI", sans-serif';
  ctx.fillText(label.toUpperCase(), canvas.width / 2, 92);
  ctx.textAlign = 'left';
  tex.needsUpdate = true;
  shipNotice.mesh.visible = true;
  shipNoticeTimer = 1.8;
}
function updateShipNotice(dt) {
  if (shipNoticeTimer <= 0) return;
  shipNoticeTimer -= dt;
  shipNotice.mesh.material.opacity = Math.min(1, shipNoticeTimer / 0.4);
  if (shipNoticeTimer <= 0) shipNotice.mesh.visible = false;
}

// ---------- Audio (procedural sfx + looping soundtrack, both fader-controlled) ----
function loadVolume(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : THREE.MathUtils.clamp(parseFloat(v), 0, 1);
  } catch { return fallback; }
}
function saveVolume(key, v) {
  try { localStorage.setItem(key, String(v)); } catch { /* storage unavailable — ignore */ }
}

let musicVolume = loadVolume('starwake-music-vol', 0.35);
let sfxVolume = loadVolume('starwake-sfx-vol', 1.0);

let audioCtx = null;
let sfxBusGain = null;
function ensureAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    sfxBusGain = audioCtx.createGain();
    sfxBusGain.gain.value = sfxVolume;
    sfxBusGain.connect(audioCtx.destination);
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
}

function beep(freq, dur, type = 'sine', gain = 0.18, when = 0, pan = 0) {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  osc.connect(g);
  let outNode = g;
  if (pan !== 0 && audioCtx.createStereoPanner) {
    const p = audioCtx.createStereoPanner();
    p.pan.value = THREE.MathUtils.clamp(pan, -1, 1);
    g.connect(p);
    outNode = p;
  }
  outNode.connect(sfxBusGain || audioCtx.destination);
  const t0 = audioCtx.currentTime + when;
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}
function sfxRing() { beep(660, 0.12, 'triangle', 0.16); beep(990, 0.16, 'triangle', 0.12, 0.05); }
function sfxRingMiss() { beep(220, 0.18, 'sawtooth', 0.14); beep(160, 0.22, 'sawtooth', 0.12, 0.06); }
function sfxHit() { beep(120, 0.28, 'sawtooth', 0.22); beep(80, 0.32, 'square', 0.15, 0.05); }
function sfxShoot() { beep(880, 0.06, 'square', 0.09); }
function sfxAsteroidPop() { beep(200, 0.15, 'square', 0.2); beep(140, 0.2, 'sawtooth', 0.15, 0.04); }
function sfxLevel() { [523, 659, 784, 1046].forEach((f, i) => beep(f, 0.18, 'triangle', 0.14, i * 0.09)); }
function sfxGameOver() { [392, 349, 293, 220].forEach((f, i) => beep(f, 0.35, 'sawtooth', 0.16, i * 0.16)); }
function sfxConfirm() { beep(700, 0.05, 'sine', 0.12); beep(1000, 0.06, 'sine', 0.08, 0.045); }
// Short directional blip — pitch encodes up/down, stereo pan encodes left/right.
function sfxSteer(dir) {
  const table = {
    up: { freq: 760, pan: 0 },
    down: { freq: 340, pan: 0 },
    left: { freq: 520, pan: -0.7 },
    right: { freq: 520, pan: 0.7 },
  };
  const t = table[dir];
  if (!t) return;
  beep(t.freq, 0.055, 'triangle', 0.055, 0, t.pan);
}

// Continuous low thruster hum: gain tracks how hard you're steering, pitch
// tracks up/down, stereo pan tracks left/right. Lazily created on the first
// user gesture (same moment audioCtx becomes available).
let thrusterOsc = null, thrusterGain = null, thrusterPanner = null;
function ensureThruster() {
  if (thrusterOsc || !audioCtx) return;
  thrusterOsc = audioCtx.createOscillator();
  thrusterOsc.type = 'sawtooth';
  thrusterOsc.frequency.value = 90;
  thrusterGain = audioCtx.createGain();
  thrusterGain.gain.value = 0;
  thrusterOsc.connect(thrusterGain);
  if (audioCtx.createStereoPanner) {
    thrusterPanner = audioCtx.createStereoPanner();
    thrusterGain.connect(thrusterPanner);
    thrusterPanner.connect(sfxBusGain);
  } else {
    thrusterGain.connect(sfxBusGain);
  }
  thrusterOsc.start();
}
function updateThruster() {
  if (!thrusterOsc) return;
  const speedMag = Math.min(1, Math.hypot(ship.vx, ship.vy) / 6);
  const targetGain = state === STATE.PLAYING ? speedMag * 0.09 : 0;
  thrusterGain.gain.setTargetAtTime(targetGain, audioCtx.currentTime, 0.08);
  const pitchLift = THREE.MathUtils.clamp(ship.vy / 6, -1, 1);
  thrusterOsc.frequency.setTargetAtTime(90 + pitchLift * 40, audioCtx.currentTime, 0.1);
  if (thrusterPanner) {
    const pan = THREE.MathUtils.clamp(ship.vx / 6, -1, 1);
    thrusterPanner.pan.setTargetAtTime(pan, audioCtx.currentTime, 0.1);
  }
}

// ---------- Music: three tracks, crossfaded based on game state -----------
// menu/pause -> Launch Bay, gameplay -> Flight Loop, wave clear -> a short
// one-shot stinger that then hands back off to whichever track fits.
const MUSIC_TRACKS = {
  menu: 'assets/audio/launch-bay.mp3',
  flight: 'assets/audio/flight-loop.mp3',
  waveclear: 'assets/audio/wave-clear.mp3',
};

const musicChannels = [new Audio(), new Audio()];
let activeMusicChannel = 0;
let currentTrackKey = null;
let stingerPlaying = false;
let audioUnlocked = false;

function unlockAudio() { audioUnlocked = true; }

function crossfadeTo(key, { loop = true, onEnded = null, fadeMs = 700 } = {}) {
  if (currentTrackKey === key) return;
  currentTrackKey = key;
  const outgoing = musicChannels[activeMusicChannel];
  const incomingIndex = 1 - activeMusicChannel;
  const incoming = musicChannels[incomingIndex];

  incoming.src = MUSIC_TRACKS[key];
  incoming.loop = loop;
  incoming.currentTime = 0;
  incoming.volume = 0;
  incoming.onended = onEnded;
  incoming.play().catch(() => { /* needs a user gesture first */ });
  activeMusicChannel = incomingIndex;

  const targetVol = musicVolume;
  const outgoingStartVol = outgoing.volume;
  const t0 = performance.now();
  (function step() {
    const t = Math.min(1, (performance.now() - t0) / fadeMs);
    incoming.volume = targetVol * t;
    outgoing.volume = outgoingStartVol * (1 - t);
    if (t < 1) requestAnimationFrame(step);
    else outgoing.pause();
  })();
}

function playWaveClearStinger() {
  stingerPlaying = true;
  crossfadeTo('waveclear', {
    loop: false,
    fadeMs: 300,
    onEnded: () => {
      stingerPlaying = false;
      crossfadeTo(state === STATE.PLAYING ? 'flight' : 'menu');
    },
  });
}

function updateMusicForState() {
  if (!audioUnlocked || stingerPlaying) return;
  const desired = state === STATE.PLAYING ? 'flight' : 'menu';
  if (desired !== currentTrackKey) crossfadeTo(desired);
}

// ---------- Volume fader UI (desktop DOM panel) -----------------------------
const settingsToggle = document.getElementById('settings-toggle');
const settingsPanel = document.getElementById('settings-panel');
const musicSlider = document.getElementById('music-vol');
const sfxSlider = document.getElementById('sfx-vol');
const musicValLabel = document.getElementById('music-vol-val');
const sfxValLabel = document.getElementById('sfx-vol-val');

function setMusicVolume(v) {
  musicVolume = THREE.MathUtils.clamp(v, 0, 1);
  musicSlider.value = Math.round(musicVolume * 100);
  musicValLabel.textContent = `${musicSlider.value}%`;
  musicChannels[activeMusicChannel].volume = musicVolume;
  saveVolume('starwake-music-vol', musicVolume);
  drawVRSettingsPanel();
}
function setSfxVolume(v) {
  sfxVolume = THREE.MathUtils.clamp(v, 0, 1);
  sfxSlider.value = Math.round(sfxVolume * 100);
  sfxValLabel.textContent = `${sfxSlider.value}%`;
  if (sfxBusGain) sfxBusGain.gain.value = sfxVolume;
  saveVolume('starwake-sfx-vol', sfxVolume);
  drawVRSettingsPanel();
}

settingsToggle.addEventListener('click', () => {
  settingsPanel.classList.toggle('open');
});
musicSlider.addEventListener('input', () => setMusicVolume(musicSlider.value / 100));
sfxSlider.addEventListener('input', () => setSfxVolume(sfxSlider.value / 100));

// ---------- VR controllers + in-scene settings panel ------------------------
// The DOM panel above only reaches players in VR via WebXR's DOM Overlay
// feature, which isn't reliably supported — this 3D equivalent is pointed at
// and clicked with a controller, and works regardless of DOM Overlay support.
const controllerRig1 = renderer.xr.getController(0);
const controllerRig2 = renderer.xr.getController(1);
const controllers = [controllerRig1, controllerRig2];
controllers.forEach((c) => {
  const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -5)]);
  const mat = new THREE.LineBasicMaterial({ color: 0x8fd6ff, transparent: true, opacity: 0.5 });
  const line = new THREE.Line(geo, mat);
  line.name = 'ray';
  line.visible = false;
  c.add(line);
  scene.add(c);
});

const VR_PANEL_W = 480, VR_PANEL_H = 260;
const vrSettings = makeCanvasPanel(1.3, 0.7, VR_PANEL_W, VR_PANEL_H);
vrSettings.mesh.position.set(0, 0, -1.7);
vrSettings.mesh.renderOrder = 1000;
camera.add(vrSettings.mesh);
vrSettings.mesh.visible = false;

let vrSettingsOpen = false;
const VR_TRACK = { x0: 60, x1: 420, width: 360, musicY: 128, sfxY: 198, rowHalfHeight: 24 };

function drawVRSettingsPanel() {
  const { ctx, canvas, tex } = vrSettings;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(4,8,20,0.92)';
  roundRect(ctx, 0, 0, canvas.width, canvas.height, 26);
  ctx.fill();
  ctx.strokeStyle = 'rgba(120,190,255,0.7)';
  ctx.lineWidth = 3;
  roundRect(ctx, 3, 3, canvas.width - 6, canvas.height - 6, 24);
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.fillStyle = '#8fd6ff';
  ctx.font = '800 30px "Segoe UI", sans-serif';
  ctx.fillText('SOUND SETTINGS', canvas.width / 2, 46);

  function drawTrack(y, label, value) {
    ctx.textAlign = 'left';
    ctx.fillStyle = '#bcd6ee';
    ctx.font = '600 21px "Segoe UI", sans-serif';
    ctx.fillText(label, VR_TRACK.x0, y - 22);
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.round(value * 100)}%`, VR_TRACK.x1, y - 22);

    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    roundRect(ctx, VR_TRACK.x0, y - 8, VR_TRACK.width, 16, 8);
    ctx.fill();
    ctx.fillStyle = '#8fd6ff';
    roundRect(ctx, VR_TRACK.x0, y - 8, VR_TRACK.width * value, 16, 8);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(VR_TRACK.x0 + VR_TRACK.width * value, y, 13, 0, Math.PI * 2);
    ctx.fillStyle = '#eaf6ff';
    ctx.fill();
  }
  drawTrack(VR_TRACK.musicY, 'MUSIC', musicVolume);
  drawTrack(VR_TRACK.sfxY, 'SOUND EFFECTS', sfxVolume);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffcf39';
  ctx.font = '600 18px "Segoe UI", sans-serif';
  ctx.fillText('Grip: open/close  ·  Trigger: point + hold to adjust', canvas.width / 2, canvas.height - 22);

  ctx.textAlign = 'left';
  tex.needsUpdate = true;
}
drawVRSettingsPanel();

// Now that both the DOM sliders and the VR panel exist, apply the loaded
// (or default) volumes to both, and to the actual audio graph.
setMusicVolume(musicVolume);
setSfxVolume(sfxVolume);

function setVRSettingsOpen(open) {
  vrSettingsOpen = open;
  vrSettings.mesh.visible = open;
  controllers.forEach((c) => {
    const line = c.getObjectByName('ray');
    if (line) line.visible = open;
  });
}

const vrRaycaster = new THREE.Raycaster();
function raycastSettingsPanel(controller) {
  const m = new THREE.Matrix4().identity().extractRotation(controller.matrixWorld);
  vrRaycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
  vrRaycaster.ray.direction.set(0, 0, -1).applyMatrix4(m);
  const hits = vrRaycaster.intersectObject(vrSettings.mesh, false);
  return hits.length ? hits[0] : null;
}
function hitToSliderValue(hit) {
  if (!hit || !hit.uv) return null;
  const px = hit.uv.x * VR_PANEL_W;
  const py = (1 - hit.uv.y) * VR_PANEL_H;
  const value = THREE.MathUtils.clamp((px - VR_TRACK.x0) / VR_TRACK.width, 0, 1);
  if (Math.abs(py - VR_TRACK.musicY) <= VR_TRACK.rowHalfHeight) return { row: 'music', value };
  if (Math.abs(py - VR_TRACK.sfxY) <= VR_TRACK.rowHalfHeight) return { row: 'sfx', value };
  return null;
}
function updateVRSettingsInteraction() {
  if (!renderer.xr.getSession()) return;

  const squeeze = getXRSqueeze();
  if (squeeze && !prevSqueeze) setVRSettingsOpen(!vrSettingsOpen);
  prevSqueeze = squeeze;

  if (!vrSettingsOpen) return;

  if (getXRTrigger()) {
    for (const controller of controllers) {
      const slider = hitToSliderValue(raycastSettingsPanel(controller));
      if (slider) {
        if (slider.row === 'music') setMusicVolume(slider.value);
        else setSfxVolume(slider.value);
        break;
      }
    }
  }
}

// ---------- Input ------------------------------------------------------------
// Unlock audio (and start the menu music) on the very first user gesture,
// separately from Space/click's own confirm action — otherwise the first
// Space press both unlocks audio and starts the game in the same instant,
// and Launch Bay never gets a chance to play during the "press start" screen.
function unlockOnFirstGesture() {
  ensureAudio();
  ensureThruster();
  unlockAudio();
  window.removeEventListener('keydown', unlockOnFirstGesture);
  window.removeEventListener('pointerdown', unlockOnFirstGesture);
}
window.addEventListener('keydown', unlockOnFirstGesture);
window.addEventListener('pointerdown', unlockOnFirstGesture);

const keys = {};
window.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'Space') {
    if (state === STATE.PLAYING) fireProjectile();
    else if (state === STATE.REPLAY) skipReplay();
    else handleConfirm();
  }
  if (e.code === 'KeyC') switchShip();
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });
canvasHost.addEventListener('click', () => {
  if (state === STATE.PLAYING) fireProjectile();
  else if (state === STATE.REPLAY) skipReplay();
  else handleConfirm();
});

function handleConfirm() {
  ensureAudio();
  ensureThruster();
  unlockAudio();
  if (state === STATE.PAUSED_MSG && pendingAction) {
    const action = pendingAction;
    pendingAction = null;
    sfxConfirm();
    hideMessage();
    stingerPlaying = false; // let an explicit action cut a wave-clear stinger short
    if (action === 'start') startGame();
    else if (action === 'restart') startGame();
    else if (action === 'next') beginLevel(level + 1);
  }
}

function getXRAxes() {
  const session = renderer.xr.getSession();
  if (!session) return null;
  for (const src of session.inputSources) {
    if (src.handedness === 'right' && src.gamepad) {
      const a = src.gamepad.axes;
      // most Quest controller mappings expose thumbstick on axes[2],[3]
      const x = a.length >= 4 ? a[2] : (a[0] || 0);
      const y = a.length >= 4 ? a[3] : (a[1] || 0);
      return { x, y: -y };
    }
  }
  return null;
}
function getXRTrigger() {
  const session = renderer.xr.getSession();
  if (!session) return false;
  for (const src of session.inputSources) {
    if (src.gamepad && src.gamepad.buttons[0] && src.gamepad.buttons[0].pressed) return true;
  }
  return false;
}
function getXRSqueeze() {
  const session = renderer.xr.getSession();
  if (!session) return false;
  for (const src of session.inputSources) {
    if (src.gamepad && src.gamepad.buttons[1] && src.gamepad.buttons[1].pressed) return true;
  }
  return false;
}
function getXRThumbstickClick() {
  const session = renderer.xr.getSession();
  if (!session) return false;
  for (const src of session.inputSources) {
    if (src.gamepad && src.gamepad.buttons[3] && src.gamepad.buttons[3].pressed) return true;
  }
  return false;
}
let prevTrigger = false;
let prevSqueeze = false;
let prevThumbClick = false;
let prevDirX = 0, prevDirY = 0;

// ---------- Game flow ---------------------------------------------------------
function startGame() {
  score = 0; lives = START_LIVES;
  totalRingsSpawned = 0;
  clearObstacles();
  clearTransient();
  beginLevel(1);
}

function beginLevel(n) {
  level = Math.min(n, MAX_LEVEL);
  ringsThisLevel = 0;
  speed = 24 + (level - 1) * 6.5;
  spawnCooldown = 0.3;
  nextSpawnZ = SPAWN_Z;
  waveRingHistory = [];
  waveRingCounter = 0;
  clearObstacles();
  clearTransient();
  state = STATE.PLAYING;
}

function loseLife() {
  if (performance.now() < ship.invulnerableUntil) return;
  lives -= 1;
  ship.invulnerableUntil = performance.now() + 1500;
  sfxHit();
  flashDamage();
  if (lives <= 0) {
    state = STATE.GAMEOVER;
    sfxGameOver();
    showMessage('SIGNAL LOST', `Run ended in wave ${level}.\nFinal score: ${score}`, 'restart');
  }
}

const damageOverlay = document.getElementById('damage-flash');
function flashDamage() {
  damageOverlay.style.opacity = '0.55';
  setTimeout(() => { damageOverlay.style.opacity = '0'; }, 180);
}

// ---------- End-of-wave flyover replay --------------------------------------
// Rings are cheap to rebuild from waveRingHistory (position + hit/miss are
// all that's recorded) rather than kept alive in the scene the whole wave.
const REPLAY_SPACING = 5.5;
const REPLAY_DURATION = 4.5;
let replayRings = [];
let replayTimer = 0;
let replayOnComplete = null;
const replayStartRigPos = new THREE.Vector3();

function buildReplayRing(entry, zOffset) {
  const color = entry.hit ? RING_HIT_COLOR : RING_MISS_COLOR;
  const geo = new THREE.TorusGeometry(1.7, 0.13, 12, 32);
  const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.1, roughness: 0.35, metalness: 0.4 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(entry.x, entry.y, zOffset);
  const label = makeRingLabel(entry.hit ? `+${entry.points}` : 'MISS');
  label.position.set(2.5, 0, 0);
  mesh.add(label);
  scene.add(mesh);
  return mesh;
}

function startReplay(onComplete) {
  replayOnComplete = onComplete;
  if (waveRingHistory.length === 0) { onComplete(); return; }

  state = STATE.REPLAY;
  replayTimer = 0;
  replayStartRigPos.copy(rig.position);
  const total = waveRingHistory.length;
  replayRings = waveRingHistory.map((entry) => {
    // most-recently-passed ring closest to camera, first one furthest back
    const z = (total - entry.order) * REPLAY_SPACING;
    return buildReplayRing(entry, z);
  });
  rig.rotation.y = 0;
}

function endReplay() {
  for (const m of replayRings) { removeRing({ mesh: m }); }
  replayRings = [];
  rig.rotation.y = 0;
  // leave the camera centered (where the replay settled it) rather than
  // snapping back to wherever the ship happened to be at docking — and
  // keep the steering state in sync so next wave doesn't jerk back to it
  rig.position.set(0, 1.6, rig.position.z);
  ship.x = 0; ship.y = 0; ship.vx = 0; ship.vy = 0;
  const cb = replayOnComplete;
  replayOnComplete = null;
  if (cb) cb();
}

function skipReplay() {
  if (state !== STATE.REPLAY) return;
  endReplay();
}

function updateReplay(dt) {
  replayTimer += dt;
  const t = Math.min(1, replayTimer / REPLAY_DURATION);
  // ease in/out full 360° spin so the player can read the trail as it passes
  const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  rig.rotation.y = eased * Math.PI * 2;
  rig.position.x = THREE.MathUtils.lerp(replayStartRigPos.x, 0, Math.min(1, replayTimer * 2));
  rig.position.y = THREE.MathUtils.lerp(replayStartRigPos.y, 1.6, Math.min(1, replayTimer * 2));
  if (replayTimer >= REPLAY_DURATION) endReplay();
}

function completeLevel() {
  playWaveClearStinger();
  const isWin = level >= MAX_LEVEL;
  if (!isWin) sfxLevel();
  startReplay(() => {
    if (isWin) {
      state = STATE.WIN;
      showMessage('MISSION COMPLETE', `You cleared all ${MAX_LEVEL} waves.\nFinal score: ${score}`, 'restart');
    } else {
      showMessage(`WAVE ${level} CLEAR`, `Docked with the shuttle.\nScore: ${score}\nNext wave: ${level + 1}`, 'next');
    }
  });
}

// ---------- Per-frame update ---------------------------------------------------
const clock = new THREE.Clock();

function updateShipControl(dt) {
  let ix = 0, iy = 0;
  if (keys['ArrowLeft'] || keys['KeyA']) ix -= 1;
  if (keys['ArrowRight'] || keys['KeyD']) ix += 1;
  if (keys['ArrowUp'] || keys['KeyW']) iy += 1;
  if (keys['ArrowDown'] || keys['KeyS']) iy -= 1;

  const xr = getXRAxes();
  if (xr) { ix = THREE.MathUtils.clamp(xr.x, -1, 1); iy = THREE.MathUtils.clamp(xr.y, -1, 1); }

  // Directional blip whenever a new steering direction engages (works for
  // both digital keys and the analog XR thumbstick via a deadzone).
  const dirThreshold = 0.35;
  const dirX = ix > dirThreshold ? 1 : ix < -dirThreshold ? -1 : 0;
  const dirY = iy > dirThreshold ? 1 : iy < -dirThreshold ? -1 : 0;
  if (dirX !== prevDirX && dirX !== 0) sfxSteer(dirX > 0 ? 'right' : 'left');
  if (dirY !== prevDirY && dirY !== 0) sfxSteer(dirY > 0 ? 'up' : 'down');
  prevDirX = dirX; prevDirY = dirY;

  const accel = 18;
  const damping = 4.2;
  ship.vx += ix * accel * dt;
  ship.vy += iy * accel * dt;
  ship.vx -= ship.vx * damping * dt;
  ship.vy -= ship.vy * damping * dt;

  ship.x = THREE.MathUtils.clamp(ship.x + ship.vx * dt, -LANE_HALF_WIDTH, LANE_HALF_WIDTH);
  ship.y = THREE.MathUtils.clamp(ship.y + ship.vy * dt, -LANE_HALF_HEIGHT, LANE_HALF_HEIGHT);

  rig.position.x = THREE.MathUtils.lerp(rig.position.x, ship.x, Math.min(1, dt * 8));
  rig.position.y = THREE.MathUtils.lerp(rig.position.y, 1.6 + ship.y, Math.min(1, dt * 8));

  ship.tilt = THREE.MathUtils.lerp(ship.tilt, -ship.vx * 0.05, Math.min(1, dt * 6));
  shipMount.rotation.z = ship.tilt;
  shipMount.rotation.x = THREE.MathUtils.lerp(shipMount.rotation.x, ship.vy * 0.05, Math.min(1, dt * 6));

  // XR trigger fires while playing (menu confirm and settings-panel dragging
  // are handled separately, and settings panel takes priority over shooting)
  const trig = getXRTrigger();
  if (trig && !prevTrigger && !vrSettingsOpen) fireProjectile();
  prevTrigger = trig;

  // Thumbstick click swaps the active ship (edge-triggered), unless the
  // settings panel is open and using the trigger for something else.
  const thumbClick = getXRThumbstickClick();
  if (thumbClick && !prevThumbClick && !vrSettingsOpen) switchShip();
  prevThumbClick = thumbClick;
}

function updateObstacles(dt) {
  const dz = speed * dt;
  for (let i = obstacles.length - 1; i >= 0; i--) {
    const o = obstacles[i];
    o.mesh.position.z += dz;

    if (o.type === 'asteroid') {
      const s = o.mesh.userData.spin;
      o.mesh.rotation.x += s.x * dt;
      o.mesh.rotation.y += s.y * dt;
      o.mesh.rotation.z += s.z * dt;
      if (o.driftAmpX || o.driftAmpY) {
        o.driftPhase += dt * o.driftFreq;
        o.x = o.baseX + Math.sin(o.driftPhase) * o.driftAmpX;
        o.y = o.baseY + Math.cos(o.driftPhase * 0.8) * o.driftAmpY;
        o.mesh.position.x = o.x;
        o.mesh.position.y = o.y;
      }
    }

    const z = o.mesh.position.z;

    if (!o.resolved && z > COLLIDE_Z_MIN && z < COLLIDE_Z_MAX) {
      const dx = o.x - ship.x;
      const dy = o.y - ship.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (o.type === 'ring' && dist < o.radius) {
        o.resolved = true;
        o.hit = true;
        score += o.points;
        sfxRing();
        o.mesh.material.color.set(RING_HIT_COLOR);
        o.mesh.material.emissive.set(RING_HIT_COLOR);
        o.mesh.material.emissiveIntensity = 1.2;
        spawnPopup(o.mesh.position.clone(), `+${o.points}`, '#3dff8a');
        waveRingHistory.push({ x: o.x, y: o.y, hit: true, points: o.points, order: waveRingCounter++ });
      }
      if (o.type === 'asteroid' && dist < o.radius + 0.55) {
        loseLife();
        scene.remove(o.mesh);
        obstacles.splice(i, 1);
        continue;
      }
      if (o.type === 'shuttle' && dist < o.radius) {
        o.resolved = true;
        completeLevel();
      }
    }

    if (o.type === 'ring' && !o.resolved && z >= COLLIDE_Z_MAX) {
      o.resolved = true;
      o.hit = false;
      sfxRingMiss();
      o.mesh.material.color.set(RING_MISS_COLOR);
      o.mesh.material.emissive.set(RING_MISS_COLOR);
      o.mesh.material.emissiveIntensity = 1.2;
      spawnPopup(o.mesh.position.clone(), 'MISS', '#ff3b4e');
      waveRingHistory.push({ x: o.x, y: o.y, hit: false, points: o.points, order: waveRingCounter++ });
    }

    if (z > DESPAWN_Z) {
      if (o.type === 'ring') {
        ringsThisLevel += 1;
        removeRing(o);
      } else {
        scene.remove(o.mesh);
      }
      obstacles.splice(i, 1);
      if (o.type === 'shuttle') shuttleObstacle = null;
      if (o.type === 'ring' && ringsThisLevel >= RINGS_PER_LEVEL && !shuttleObstacle && state === STATE.PLAYING) {
        spawnShuttleGate(SPAWN_Z - 40);
      }
    }
  }
}

function updateShipFx(dt) {
  if (engineGlow) engineGlow.intensity = 2.8 + Math.sin(elapsed * 30) * 0.6 + Math.random() * 0.4;
  if (ship.trailMesh) ship.trailMesh.scale.y = 0.85 + Math.sin(elapsed * 24) * 0.15;
  const blink = performance.now() < ship.invulnerableUntil ? (Math.sin(performance.now() * 0.03) > 0 ? 0.25 : 1) : 1;
  const activeModel = SHIPS[currentShipKey] && SHIPS[currentShipKey].model;
  if (activeModel) {
    activeModel.traverse((c) => {
      if (c.isMesh) {
        c.material.transparent = blink < 1;
        c.material.opacity = blink;
      }
    });
  }
}

function animate() {
  const dt = Math.min(clock.getDelta(), 0.05);
  elapsed += dt;

  starfield.rotation.y += dt * 0.003;
  updateVRSettingsInteraction();

  if (state === STATE.PLAYING && !vrSettingsOpen) {
    updateShipControl(dt);
    updateSpawner(dt);
    updateObstacles(dt);
    updateProjectiles(dt);
    updateShipFx(dt);
    if (shootCooldownTimer > 0) shootCooldownTimer -= dt;
    reticle.mesh.visible = true;
  } else {
    reticle.mesh.visible = false;
    if (state === STATE.REPLAY) {
      updateReplay(dt);
      const trig = getXRTrigger();
      if (trig && !prevTrigger) skipReplay();
      prevTrigger = trig;
    } else {
      // still allow steering feedback (thumbstick click) even while paused,
      // but not shoot/confirm while the settings panel has the trigger
      if (state === STATE.PLAYING) updateShipControl(dt);
      if (!vrSettingsOpen) {
        const trig = getXRTrigger();
        if (trig && !prevTrigger) handleConfirm();
        prevTrigger = trig;
      }
    }
  }

  updatePopups(dt);
  updateEffects(dt);
  updateShipNotice(dt);
  updateThruster();
  updateMusicForState();

  drawHud();
  renderer.render(scene, camera);
}

renderer.setAnimationLoop(animate);
