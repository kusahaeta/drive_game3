import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.1/build/three.module.js";

const $ = (id) => document.getElementById(id);
const canvas = $("game-canvas");
const dom = {
  loading: $("loading"), hud: $("hud"), start: $("start-screen"), end: $("end-screen"),
  startButton: $("start-button"), restartButton: $("restart-button"), speed: $("speed-value"),
  time: $("time-value"), near: $("near-value"), score: $("score-value"), damageFill: $("damage-fill"),
  damage: $("damage-value"), warning: $("warning"), nearToast: $("near-toast"), message: $("message"),
  incidentTitle: $("incident-title"), incidentDistance: $("incident-distance"), incidentProgress: $("incident-progress"),
  objective: $("objective-text"), flash: $("flash"), resultKicker: $("result-kicker"),
  resultTitle: $("result-title"), resultCopy: $("result-copy"), resultNear: $("result-near"),
  resultScore: $("result-score"), resultIntegrity: $("result-integrity"), minimap: $("minimap"),
};

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x08131a);
scene.fog = new THREE.FogExp2(0x0a171d, 0.014);
const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 340);
const clock = new THREE.Clock();
const world = new THREE.Group();
scene.add(world);

const up = new THREE.Vector3(0, 1, 0);
const tmpVec = new THREE.Vector3();
const tmpVec2 = new THREE.Vector3();
const roadCenters = [-60, 0, 60];
const roadHalf = 10;
const cityLimit = 129;
let randomSeed = 9182;
const rand = () => {
  randomSeed = (randomSeed * 16807) % 2147483647;
  return (randomSeed - 1) / 2147483646;
};
const range = (a, b) => a + (b - a) * rand();
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, t) => {
  const x = clamp((t - a) / (b - a), 0, 1);
  return x * x * (3 - 2 * x);
};
const distXZ = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const forwardOf = (heading, target = new THREE.Vector3()) => target.set(-Math.sin(heading), 0, -Math.cos(heading));
const setShadow = (root) => root.traverse((node) => { if (node.isMesh) { node.castShadow = true; node.receiveShadow = true; } });

const materials = {
  asphalt: new THREE.MeshStandardMaterial({ color: 0x171f24, roughness: 0.88, metalness: 0.04 }),
  asphaltEdge: new THREE.MeshStandardMaterial({ color: 0x222c31, roughness: 0.84 }),
  concrete: new THREE.MeshStandardMaterial({ color: 0x6c7471, roughness: 0.9 }),
  line: new THREE.MeshStandardMaterial({ color: 0xd9d7bc, roughness: 0.66, emissive: 0x181707 }),
  yellow: new THREE.MeshStandardMaterial({ color: 0xcfac33, roughness: 0.58, emissive: 0x1d1503 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x101518, roughness: 0.8, metalness: 0.2 }),
  window: new THREE.MeshStandardMaterial({ color: 0x1a333c, roughness: 0.24, metalness: 0.55, emissive: 0x071417, emissiveIntensity: 0.7 }),
  litWindow: new THREE.MeshStandardMaterial({ color: 0xffba62, roughness: 0.38, emissive: 0xf48a22, emissiveIntensity: 1.3 }),
  lamp: new THREE.MeshStandardMaterial({ color: 0xe9ffd0, emissive: 0xbfff74, emissiveIntensity: 2.3, roughness: 0.4 }),
  redLamp: new THREE.MeshStandardMaterial({ color: 0xff5138, emissive: 0xff2a15, emissiveIntensity: 2.8 }),
};

function box(w, h, d, material, x = 0, y = h / 2, z = 0, parent = world) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function addLights() {
  const hemi = new THREE.HemisphereLight(0x7898a6, 0x111715, 1.9);
  scene.add(hemi);
  const moon = new THREE.DirectionalLight(0xa4c9d9, 2.4);
  moon.position.set(-70, 115, 40);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  moon.shadow.camera.left = -125;
  moon.shadow.camera.right = 125;
  moon.shadow.camera.top = 125;
  moon.shadow.camera.bottom = -125;
  moon.shadow.bias = -0.00025;
  scene.add(moon);
  const cityGlow = new THREE.PointLight(0x48a5c2, 15, 110, 2);
  cityGlow.position.set(0, 25, -18);
  scene.add(cityGlow);
}

function buildRoads() {
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(320, 320), new THREE.MeshStandardMaterial({ color: 0x0f191a, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  world.add(ground);
  const roadGroup = new THREE.Group();
  world.add(roadGroup);
  for (const c of roadCenters) {
    const vertical = new THREE.Mesh(new THREE.PlaneGeometry(roadHalf * 2, 278), materials.asphalt);
    vertical.rotation.x = -Math.PI / 2;
    vertical.position.set(c, 0.013, 0);
    vertical.receiveShadow = true;
    roadGroup.add(vertical);
    const horizontal = new THREE.Mesh(new THREE.PlaneGeometry(278, roadHalf * 2), materials.asphalt);
    horizontal.rotation.x = -Math.PI / 2;
    horizontal.position.set(0, 0.014, c);
    horizontal.receiveShadow = true;
    roadGroup.add(horizontal);
    for (let p = -130; p <= 130; p += 9) {
      if (!roadCenters.some((cross) => Math.abs(p - cross) < 13)) {
        box(0.18, 0.022, 4.8, materials.line, c - 4.65, 0.029, p, roadGroup);
        box(0.18, 0.022, 4.8, materials.line, c + 4.65, 0.029, p, roadGroup);
        box(4.8, 0.022, 0.18, materials.line, p, 0.03, c - 4.65, roadGroup);
        box(4.8, 0.022, 0.18, materials.line, p, 0.03, c + 4.65, roadGroup);
      }
    }
    for (let p = -127; p <= 127; p += 7) {
      box(0.16, 0.023, 3.2, materials.yellow, c, 0.032, p, roadGroup);
      box(3.2, 0.023, 0.16, materials.yellow, p, 0.033, c, roadGroup);
    }
    for (const offset of [-11.3, 11.3]) {
      box(2.3, 0.18, 280, materials.concrete, c + offset, 0.09, 0, roadGroup);
      box(280, 0.18, 2.3, materials.concrete, 0, 0.09, c + offset, roadGroup);
    }
  }
  for (const x of roadCenters) for (const z of roadCenters) {
    for (let n = -7; n <= 7; n += 2) {
      box(1.05, 0.026, 4.6, materials.line, x + n, 0.044, z - 7.1, roadGroup);
      box(4.6, 0.026, 1.05, materials.line, x - 7.1, 0.045, z + n, roadGroup);
    }
  }
}

function createBuilding(x, z, w, d, h, tint) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  world.add(group);
  const facade = new THREE.MeshStandardMaterial({ color: tint, roughness: range(0.62, 0.9), metalness: range(0.04, 0.18) });
  box(w, h, d, facade, 0, h / 2, 0, group);
  const floors = Math.min(10, Math.floor(h / 3.4));
  const cols = Math.max(2, Math.floor(w / 3.5));
  for (let floor = 0; floor < floors; floor++) {
    const y = 2 + floor * 3.3;
    for (let col = 0; col < cols; col++) {
      const xx = -w / 2 + (col + 0.5) * (w / cols);
      const lit = rand() > 0.68;
      const windowMat = lit ? materials.litWindow : materials.window;
      box(Math.max(0.7, w / cols - 0.6), 1.35, 0.055, windowMat, xx, y, -d / 2 - 0.035, group);
      if (rand() > 0.24) box(Math.max(0.7, w / cols - 0.6), 1.35, 0.055, windowMat, xx, y, d / 2 + 0.035, group);
    }
  }
  const roof = box(w * 0.26, 0.5, d * 0.3, materials.dark, range(-1, 1), h + 0.25, range(-1, 1), group);
  roof.castShadow = true;
  if (rand() > 0.55) {
    const antenna = box(0.13, range(3, 8), 0.13, materials.dark, w * .2, h + 2.5, d * .15, group);
    antenna.castShadow = true;
  }
  return group;
}

function buildCity() {
  const blocks = [-128, -72, -48, -12, 12, 48, 72, 128];
  const colors = [0x3c4c52, 0x54605e, 0x323c47, 0x5a564e, 0x3e5253, 0x4c4650];
  for (let ix = 0; ix < blocks.length - 1; ix += 2) {
    for (let iz = 0; iz < blocks.length - 1; iz += 2) {
      const minX = blocks[ix], maxX = blocks[ix + 1], minZ = blocks[iz], maxZ = blocks[iz + 1];
      const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
      const bw = maxX - minX - 5, bd = maxZ - minZ - 5;
      const count = rand() > .5 ? 2 : 3;
      for (let n = 0; n < count; n++) {
        const w = range(9, Math.max(11, bw / count + 5));
        const d = range(10, Math.max(12, bd * .62));
        const h = range(10, 38) * (rand() > .78 ? 1.55 : 1);
        createBuilding(cx + range(-bw * .22, bw * .22), cz + range(-bd * .17, bd * .17), w, d, h, colors[Math.floor(rand() * colors.length)]);
      }
      const treeX = cx + (rand() > .5 ? bw * .4 : -bw * .4);
      const treeZ = cz + (rand() > .5 ? bd * .4 : -bd * .4);
      createTree(treeX, treeZ, range(.8, 1.25));
    }
  }
}

function createTree(x, z, size = 1) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  const trunk = box(.28 * size, 2.6 * size, .28 * size, new THREE.MeshStandardMaterial({ color: 0x342b20, roughness: 1 }), 0, 1.3 * size, 0, g);
  trunk.castShadow = true;
  const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(1.5 * size, 1), new THREE.MeshStandardMaterial({ color: 0x172f29, roughness: .95 }));
  leaf.position.y = 3.2 * size;
  leaf.castShadow = true;
  g.add(leaf);
  world.add(g);
}

function createStreetLight(x, z, angle = 0, glow = false) {
  const g = new THREE.Group();
  g.position.set(x, 0, z);
  g.rotation.y = angle;
  box(.17, 6.4, .17, materials.dark, 0, 3.2, 0, g);
  box(.16, .16, 1.15, materials.dark, 0, 6.25, -.5, g);
  box(.55, .16, .35, materials.lamp, 0, 6.13, -1.04, g);
  if (glow) {
    const light = new THREE.PointLight(0xd8ffc5, 13, 27, 2.2);
    light.position.set(0, 5.9, -1.0);
    g.add(light);
  }
  world.add(g);
}

function buildStreetFurniture() {
  let lampIndex = 0;
  for (const c of roadCenters) {
    for (let p = -122; p <= 122; p += 24) {
      createStreetLight(c - 12.2, p, 0, lampIndex++ % 4 === 0);
      createStreetLight(p, c + 12.2, Math.PI / 2, lampIndex++ % 4 === 0);
    }
  }
  for (const x of roadCenters) for (const z of roadCenters) {
    const signal = new THREE.Group();
    signal.position.set(x - 9, 0, z - 9);
    box(.16, 4.7, .16, materials.dark, 0, 2.35, 0, signal);
    box(.36, .85, .36, materials.dark, 0, 4.5, 0, signal);
    box(.14, .14, .06, materials.redLamp, 0, 4.73, -.2, signal);
    world.add(signal);
  }
}

function makeCar(color = 0x456c78, options = {}) {
  const g = new THREE.Group();
  const carMat = new THREE.MeshPhysicalMaterial({ color, roughness: .29, metalness: .62, clearcoat: .65, clearcoatRoughness: .22 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x192e36, roughness: .12, metalness: .35, transparent: true, opacity: .88 });
  const tire = new THREE.MeshStandardMaterial({ color: 0x101112, roughness: .92 });
  const rim = new THREE.MeshStandardMaterial({ color: 0x778a88, roughness: .27, metalness: .88 });
  const body = box(1.86, .48, 4.12, carMat, 0, .65, 0, g);
  body.geometry.translate(0, 0, 0);
  const hood = box(1.75, .2, 1.05, carMat, 0, .98, -1.22, g);
  hood.rotation.x = -.06;
  const cabin = box(1.58, .65, 1.83, glass, 0, 1.2, .24, g);
  cabin.geometry.translate(0, 0, 0);
  const roof = box(1.5, .12, .94, carMat, 0, 1.55, .28, g);
  roof.geometry.translate(0, 0, 0);
  const lights = [];
  for (const sx of [-.66, .66]) {
    const head = box(.31, .15, .055, materials.lamp, sx, .84, -2.08, g);
    lights.push(head);
    box(.3, .15, .06, materials.redLamp, sx, .82, 2.08, g);
  }
  const wheels = [];
  for (const sx of [-.92, .92]) for (const zz of [-1.3, 1.3]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(.37, .37, .23, 14), tire);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(sx, .4, zz);
    wheel.castShadow = true;
    g.add(wheel);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(.19, .19, .242, 12), rim);
    hub.rotation.z = Math.PI / 2;
    hub.position.copy(wheel.position);
    hub.castShadow = true;
    g.add(hub);
    wheels.push(wheel, hub);
  }
  if (options.roofLight) {
    const bar = box(1.15, .12, .28, materials.dark, 0, 1.72, .26, g);
    box(.43, .09, .2, materials.redLamp, -.27, 1.77, .26, g);
    box(.43, .09, .2, new THREE.MeshStandardMaterial({ color: 0x356eff, emissive: 0x175dff, emissiveIntensity: 2 }), .27, 1.77, .26, g);
    bar.castShadow = true;
  }
  g.userData = { wheels, headlights: lights, radius: options.radius || 1.34 };
  setShadow(g);
  return g;
}

function makeTruckRig() {
  const root = new THREE.Group();
  const cab = new THREE.Group();
  const truckMat = new THREE.MeshPhysicalMaterial({ color: 0xd9dad0, roughness: .42, metalness: .43, clearcoat: .18 });
  box(2.08, .85, 2.45, truckMat, 0, .8, -3.15, cab);
  box(1.92, .85, 1.05, new THREE.MeshStandardMaterial({ color: 0x1a2d32, roughness: .22, metalness: .42 }), 0, 1.58, -3.4, cab);
  for (const sx of [-1.05, 1.05]) for (const z of [-3.75, -2.55]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(.43, .43, .24, 12), new THREE.MeshStandardMaterial({ color: 0x101010, roughness: .92 }));
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(sx, .43, z);
    cab.add(wheel);
  }
  root.add(cab);
  const trailerPivot = new THREE.Group();
  trailerPivot.position.set(0, .64, 2.2);
  const trailer = box(2.3, 2.55, 7.5, new THREE.MeshStandardMaterial({ color: 0xbfc6c1, roughness: .53, metalness: .25 }), 0, 1.28, 1.55, trailerPivot);
  for (const sx of [-1.12, 1.12]) for (const z of [4.0, .2]) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(.39, .39, .24, 12), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: .9 }));
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(sx, .38, z);
    trailerPivot.add(wheel);
  }
  root.add(trailerPivot);
  root.userData = { trailerPivot, trailer };
  setShadow(root);
  return root;
}

function makePedestrian() {
  const g = new THREE.Group();
  const cloth = new THREE.MeshStandardMaterial({ color: 0xc37755, roughness: .88 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xa86e52, roughness: .92 });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(.26, .8, 4, 8), cloth);
  torso.position.y = 1.25;
  torso.castShadow = true;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.25, 12, 9), skin);
  head.position.y = 2.1;
  head.castShadow = true;
  g.add(head);
  const legs = [];
  for (const sx of [-.14, .14]) {
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(.1, .63, 3, 7), new THREE.MeshStandardMaterial({ color: 0x1d2932, roughness: 1 }));
    leg.position.set(sx, .48, 0);
    leg.castShadow = true;
    g.add(leg);
    legs.push(leg);
  }
  const arms = [];
  for (const sx of [-.34, .34]) {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(.08, .52, 3, 7), skin);
    arm.position.set(sx, 1.38, 0);
    arm.castShadow = true;
    g.add(arm);
    arms.push(arm);
  }
  g.userData = { legs, arms };
  return g;
}

function buildParkedVehicles() {
  const van = makeCar(0x4a5356, { radius: 1.4 });
  van.scale.set(1.1, 1.23, 1.43);
  van.position.set(7.6, 0, -75);
  van.rotation.y = Math.PI;
  world.add(van);
  for (const [x, z, c, r] of [[-66, -21, 0x9f4235, 0], [66, 19, 0x5a7c89, Math.PI], [23, 66, 0x766b50, Math.PI / 2], [-20, -66, 0x303b55, -Math.PI / 2]]) {
    const car = makeCar(c);
    car.position.set(x, 0, z);
    car.rotation.y = r;
    world.add(car);
  }
}

const traffic = [];
function addTraffic(x, z, heading, speed, color) {
  const group = makeCar(color);
  group.position.set(x, 0, z);
  group.rotation.y = heading;
  world.add(group);
  traffic.push({ group, heading, speed, radius: 1.2, checked: false, closest: Infinity });
}

function buildTraffic() {
  const colors = [0x263c55, 0x855146, 0x4e6762, 0x645d76, 0x8a794a, 0x415562];
  for (let n = 0; n < 3; n++) {
    addTraffic(3.2, -105 + n * 74, Math.PI, range(5, 8), colors[n]);
    addTraffic(63.2, 104 - n * 72, 0, range(5, 8), colors[n + 2]);
    addTraffic(-108 + n * 75, -3.2, -Math.PI / 2, range(5, 8), colors[n + 3]);
    addTraffic(108 - n * 71, 63.2, Math.PI / 2, range(5, 8), colors[n + 1]);
  }
}

function makeRain() {
  const count = 950;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = range(-110, 110);
    positions[i * 3 + 1] = range(1, 30);
    positions[i * 3 + 2] = range(-110, 110);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const rain = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0x9fcbd3, size: .08, transparent: true, opacity: .35, depthWrite: false }));
  scene.add(rain);
  return { rain, positions };
}

addLights();
buildRoads();
buildCity();
buildStreetFurniture();
buildParkedVehicles();
buildTraffic();
const weather = makeRain();

const playerGroup = makeCar(0xd43c30, { radius: 1.05 });
playerGroup.position.set(-3.15, 0, 111);
playerGroup.rotation.y = 0;
world.add(playerGroup);
const player = {
  group: playerGroup, heading: 0, speed: 0, steer: 0, damage: 100, safe: new THREE.Vector3(-3.15, 0, 111),
  radius: 1.05, shake: 0, wheelSpin: 0,
};

const input = { forward: false, backward: false, left: false, right: false, handbrake: false };
const keyMap = { KeyW: "forward", ArrowUp: "forward", KeyS: "backward", ArrowDown: "backward", KeyA: "left", ArrowLeft: "left", KeyD: "right", ArrowRight: "right", Space: "handbrake" };
window.addEventListener("keydown", (event) => {
  if (keyMap[event.code]) { input[keyMap[event.code]] = true; event.preventDefault(); }
  if (event.code === "KeyR" && game.state !== "ready") resetGame();
});
window.addEventListener("keyup", (event) => { if (keyMap[event.code]) { input[keyMap[event.code]] = false; event.preventDefault(); } });
window.addEventListener("blur", () => Object.keys(input).forEach((key) => { input[key] = false; }));

const audio = {
  ctx: null, engine: null, engineGain: null, started: false,
  start() {
    if (this.started) return;
    this.started = true;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();
    osc.type = "sawtooth";
    osc.frequency.value = 45;
    filter.type = "lowpass";
    filter.frequency.value = 330;
    gain.gain.value = .0001;
    osc.connect(filter).connect(gain).connect(this.ctx.destination);
    osc.start();
    this.engine = osc;
    this.engineGain = gain;
  },
  updateEngine(speed) {
    if (!this.engine) return;
    const t = this.ctx.currentTime;
    this.engine.frequency.setTargetAtTime(42 + Math.abs(speed) * 4.2, t, .05);
    this.engineGain.gain.setTargetAtTime(.012 + Math.abs(speed) * .0015, t, .08);
  },
  tone(freq, duration, type = "sine", volume = .08, slide = null) {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slide), this.ctx.currentTime + duration);
    gain.gain.setValueAtTime(.0001, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(volume, this.ctx.currentTime + .015);
    gain.gain.exponentialRampToValueAtTime(.0001, this.ctx.currentTime + duration);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(); osc.stop(this.ctx.currentTime + duration + .03);
  },
  horn() { this.tone(310, .22, "square", .055, 235); setTimeout(() => this.tone(286, .25, "square", .05, 220), 235); },
  warning() { this.tone(760, .07, "square", .035, 680); },
  near() { this.tone(560, .1, "sine", .06, 930); setTimeout(() => this.tone(880, .13, "sine", .05, 1200), 90); },
  crash() { this.tone(90, .55, "sawtooth", .18, 35); this.tone(240, .3, "square", .06, 70); },
};

function makeHazards() {
  const list = [];
  const oncomingCar = makeCar(0x4c6f82, { roofLight: true, radius: 1.2 });
  oncomingCar.visible = false;
  world.add(oncomingCar);
  list.push({
    id: "oncoming", title: "対向車の逆走", subtitle: "ハイビーム接近 / センターライン侵入", group: oncomingCar, state: "armed", time: 0,
    radius: 1.25, nearDistance: 4.15, bonus: 550, closest: Infinity, completed: false, soundPlayed: false,
    display: new THREE.Vector3(3.2, 0, 35),
    activate() {
      this.state = "active"; this.time = 0; this.group.visible = true;
      this.group.position.set(3.2, 0, 35); this.group.rotation.y = Math.PI;
      this.display.copy(this.group.position); this.soundPlayed = true; audio.horn();
      showMessage("対向車が車線を越えています", 2.0);
    },
    update(dt) {
      if (this.state === "armed" && player.group.position.z < 91 && Math.abs(player.group.position.x) < 13) this.activate();
      if (this.state !== "active") return;
      this.time += dt;
      this.group.position.z += 9.6 * dt;
      this.group.position.x = lerp(3.2, -3.1, smooth(.55, 2.1, this.time));
      this.group.rotation.y = Math.PI + Math.sin(clamp(this.time, 0, 2.5) * 2.4) * .1;
      this.display.copy(this.group.position);
      if (this.group.position.z > player.group.position.z + 13 || this.time > 8) finishHazard(this);
    },
    collider() { return this.group.position; },
  });

  const rig = makeTruckRig();
  rig.visible = false;
  world.add(rig);
  list.push({
    id: "trailer", title: "トレーラー横転", subtitle: "交差点で積載車が転倒", group: rig, state: "armed", time: 0,
    radius: 4.45, nearDistance: 6.25, bonus: 750, closest: Infinity, completed: false,
    display: new THREE.Vector3(-36, 0, -28),
    activate() {
      this.state = "active"; this.time = 0; this.group.visible = true;
      this.group.position.set(-44, 0, -28); this.group.rotation.y = -Math.PI / 2;
      this.group.userData.trailerPivot.rotation.z = 0; this.display.copy(this.group.position);
      showMessage("横転の危険 — 交差点を通過中", 2.3); audio.tone(115, .4, "sawtooth", .07, 65);
    },
    update(dt) {
      // Start early enough that a driver at full speed sees the rig begin to tip,
      // but late enough that the previous oncoming incident has cleared.
      if (this.state === "armed" && player.group.position.z < 62 && Math.abs(player.group.position.x) < 14) this.activate();
      if (this.state !== "active") return;
      this.time += dt;
      this.group.position.x = Math.min(0.5, -44 + this.time * 11.7);
      const tilt = smooth(2.35, 3.35, this.time);
      this.group.userData.trailerPivot.rotation.z = -tilt * 1.35;
      this.group.userData.trailerPivot.position.y = .64 + tilt * .75;
      this.display.set(Math.min(0, this.group.position.x + 3), 0, -28);
      if (this.time > 3.0 && this.time < 3.13) { audio.tone(58, .4, "sawtooth", .11, 31); player.shake = .22; }
      if ((player.group.position.z < -42 && this.time > 3.15) || this.time > 10) finishHazard(this);
    },
    collider() { return this.time < 2.5 ? this.group.position : tmpVec.set(0, 0, -28); },
  });

  const ped = makePedestrian();
  ped.visible = false;
  world.add(ped);
  list.push({
    id: "pedestrian", title: "歩行者の飛び出し", subtitle: "駐車車両の死角 / 横断中", group: ped, state: "armed", time: 0,
    radius: .48, nearDistance: 2.8, bonus: 1000, closest: Infinity, completed: false,
    display: new THREE.Vector3(8, 0, -74),
    activate() {
      this.state = "active"; this.time = 0; this.group.visible = true;
      this.group.position.set(8, 0, -74); this.group.rotation.y = -Math.PI / 2; this.display.copy(this.group.position);
      showMessage("歩行者を検知 — ブレーキ", 1.85); audio.warning();
    },
    update(dt) {
      if (this.state === "armed" && player.group.position.z < -31 && Math.abs(player.group.position.x) < 14) this.activate();
      if (this.state !== "active") return;
      this.time += dt;
      this.group.position.x -= 4.15 * dt;
      this.group.position.y = Math.abs(Math.sin(this.time * 12)) * .035;
      this.group.userData.legs[0].rotation.x = Math.sin(this.time * 14) * .65;
      this.group.userData.legs[1].rotation.x = -Math.sin(this.time * 14) * .65;
      this.group.userData.arms[0].rotation.x = -Math.sin(this.time * 14) * .85;
      this.group.userData.arms[1].rotation.x = Math.sin(this.time * 14) * .85;
      this.display.copy(this.group.position);
      if (this.group.position.x < -10 || player.group.position.z < -86 || this.time > 7.5) finishHazard(this);
    },
    collider() { return this.group.position; },
  });
  return list;
}

let hazards = makeHazards();
const game = { state: "ready", elapsed: 0, duration: 90, score: 0, near: 0, messageTimer: 0, warningTimer: 0, crashTimer: 0, lastWarning: 0 };

function showMessage(text, duration = 1.5) {
  dom.message.textContent = text;
  dom.message.classList.add("show");
  game.messageTimer = duration;
}

function showNear(hazard) {
  const ratio = clamp((hazard.nearDistance - hazard.closest) / hazard.nearDistance, 0, 1);
  const points = Math.round(hazard.bonus * (.72 + ratio * .54) + Math.max(0, player.speed - 8) * 18);
  game.near += 1;
  game.score += points;
  dom.nearToast.querySelector("span").textContent = `+${points}`;
  dom.nearToast.classList.add("show");
  setTimeout(() => dom.nearToast.classList.remove("show"), 1100);
  player.shake = .075;
  audio.near();
}

function finishHazard(hazard) {
  if (hazard.state !== "active") return;
  hazard.state = "complete";
  hazard.completed = true;
  hazard.group.visible = false;
  const collisionRange = player.radius + hazard.radius;
  if (hazard.closest > collisionRange + .18 && hazard.closest < hazard.nearDistance && player.speed > 5) {
    showNear(hazard);
    showMessage("NEAR MISS — そのまま走れ", 1.4);
  } else if (hazard.id === "pedestrian") {
    showMessage("歩行者を安全に回避", 1.3);
  } else {
    showMessage("危険区域を通過", 1.15);
  }
}

function getGamepadInput() {
  const gp = navigator.getGamepads?.()[0];
  if (!gp) return;
  input.forward = input.forward || (gp.buttons[7]?.value || 0) > .1;
  input.backward = input.backward || (gp.buttons[6]?.value || 0) > .1;
  if (Math.abs(gp.axes[0] || 0) > .2) {
    input.left = input.left || gp.axes[0] < -.2;
    input.right = input.right || gp.axes[0] > .2;
  }
}

function updatePlayer(dt) {
  getGamepadInput();
  const throttle = input.forward ? 1 : 0;
  const brake = input.backward ? 1 : 0;
  const direction = Math.sign(player.speed || 1);
  if (throttle) player.speed += 18.5 * dt;
  if (brake) player.speed -= (player.speed > 0 ? 31 : 14) * dt;
  if (!throttle && !brake) player.speed *= Math.pow(.22, dt);
  if (input.handbrake) player.speed *= Math.pow(.03, dt);
  player.speed = clamp(player.speed, -8, 29);
  if (Math.abs(player.speed) < .025) player.speed = 0;
  const desiredSteer = (input.left ? 1 : 0) - (input.right ? 1 : 0);
  player.steer = THREE.MathUtils.damp(player.steer, desiredSteer, 9, dt);
  const steerAuthority = .68 / (1 + Math.max(0, Math.abs(player.speed) - 10) * .045);
  player.heading += player.steer * steerAuthority * (player.speed / 13) * dt;
  const forward = forwardOf(player.heading, tmpVec);
  player.group.position.addScaledVector(forward, player.speed * dt);
  if (Math.abs(player.group.position.x) > cityLimit || Math.abs(player.group.position.z) > cityLimit) {
    player.group.position.x = clamp(player.group.position.x, -cityLimit, cityLimit);
    player.group.position.z = clamp(player.group.position.z, -cityLimit, cityLimit);
    player.speed *= -.18;
    player.shake = .12;
  }
  player.group.rotation.y = player.heading;
  player.wheelSpin += player.speed * dt * 2.6;
  player.group.userData.wheels.forEach((wheel) => { wheel.rotation.x = player.wheelSpin; });
  if (Math.abs(player.speed) < 21 && Math.abs(player.steer) < .35) player.safe.lerp(player.group.position, dt * .35);
  audio.updateEngine(player.speed);
}

function updateTraffic(dt) {
  for (const car of traffic) {
    const fwd = forwardOf(car.heading, tmpVec);
    car.group.position.addScaledVector(fwd, car.speed * dt);
    if (Math.abs(car.group.position.x) > 138 || Math.abs(car.group.position.z) > 138) car.group.position.multiplyScalar(-.96);
    car.group.userData.wheels.forEach((wheel) => { wheel.rotation.x += car.speed * dt * 2.2; });
    const distance = distXZ(player.group.position, car.group.position);
    car.closest = Math.min(car.closest, distance);
    if (!car.checked && distance < player.radius + car.radius) crash("一般車両と接触");
    if (!car.checked && car.closest < 3.0 && distance > car.closest + .9 && player.speed > 8) {
      car.checked = true;
      game.near += 1;
      game.score += 180;
      dom.nearToast.querySelector("span").textContent = "+180";
      dom.nearToast.classList.add("show");
      setTimeout(() => dom.nearToast.classList.remove("show"), 850);
    }
    if (distance > 20 && car.checked) car.closest = Infinity;
  }
}

function updateHazards(dt) {
  let danger = false;
  let closestThreat = Infinity;
  for (const hazard of hazards) {
    hazard.update(dt);
    if (hazard.state !== "active") continue;
    const pos = hazard.collider();
    const d = distXZ(player.group.position, pos);
    hazard.closest = Math.min(hazard.closest, d);
    const impact = player.radius + hazard.radius;
    if (d < impact) {
      crash(hazard.id === "pedestrian" ? "歩行者と接触" : "事故を回避できなかった");
      return;
    }
    if (d < Math.max(13, hazard.nearDistance * 2.2)) {
      closestThreat = Math.min(closestThreat, d / Math.max(13, hazard.nearDistance * 2.2));
      danger = true;
    }
  }
  dom.warning.classList.toggle("show", danger);
  if (danger && game.elapsed - game.lastWarning > .75) {
    game.lastWarning = game.elapsed;
    audio.warning();
  }
  document.documentElement.style.setProperty("--danger", closestThreat);
}

function crash(reason) {
  if (game.state !== "playing") return;
  game.state = "crashed";
  player.speed = 0;
  player.damage = Math.max(0, player.damage - 42);
  player.shake = .55;
  dom.flash.classList.add("active");
  setTimeout(() => dom.flash.classList.remove("active"), 150);
  audio.crash();
  showMessage(reason, 1.5);
  setTimeout(() => finishGame(false, reason), 900);
}

function updateCamera(dt, intro = false) {
  const forward = forwardOf(player.heading, tmpVec);
  const speedRatio = clamp(Math.abs(player.speed) / 29, 0, 1);
  const follow = tmpVec2.copy(player.group.position).addScaledVector(forward, -8.5 - speedRatio * 2.1);
  follow.y += 4.3 + speedRatio * .65;
  if (intro) {
    follow.set(-13 + Math.sin(clock.elapsedTime * .13) * 2, 8.2, 126);
  }
  if (player.shake > .001) {
    follow.x += (Math.random() - .5) * player.shake;
    follow.y += (Math.random() - .5) * player.shake;
    player.shake = Math.max(0, player.shake - dt * 1.6);
  }
  camera.position.lerp(follow, 1 - Math.pow(.0009, dt));
  const look = tmpVec2.copy(player.group.position).addScaledVector(forward, 13 + speedRatio * 7);
  look.y = 1.2;
  if (intro) look.set(-2, 1.2, 83);
  camera.lookAt(look);
  camera.fov = THREE.MathUtils.damp(camera.fov, 58 + speedRatio * 8, 3.5, dt);
  camera.updateProjectionMatrix();
}

function updateWeather(dt) {
  const attr = weather.rain.geometry.attributes.position;
  for (let i = 0; i < weather.positions.length; i += 3) {
    weather.positions[i + 1] -= dt * 17;
    if (weather.positions[i + 1] < 0) {
      weather.positions[i + 1] = range(15, 34);
      weather.positions[i] = player.group.position.x + range(-100, 100);
      weather.positions[i + 2] = player.group.position.z + range(-100, 100);
    }
  }
  attr.needsUpdate = true;
}

function updateUI() {
  const kmh = Math.abs(player.speed) * 3.6;
  dom.speed.textContent = String(Math.round(kmh)).padStart(3, "0");
  dom.time.textContent = `${String(Math.floor(Math.max(0, game.duration - game.elapsed) / 60)).padStart(2, "0")}:${String(Math.ceil(Math.max(0, game.duration - game.elapsed) % 60)).padStart(2, "0")}`;
  dom.near.textContent = String(game.near).padStart(2, "0");
  dom.score.textContent = String(game.score).padStart(6, "0");
  dom.damageFill.style.width = `${player.damage}%`;
  dom.damageFill.style.background = player.damage < 45 ? "#ff5b30" : "#e5ff3d";
  dom.damage.textContent = `${Math.round(player.damage)}%`;
  document.querySelectorAll(".speed-bars i").forEach((bar, i) => bar.classList.toggle("active", kmh > i * 28 + 5));
  let focus = hazards.find((h) => h.state === "active") || hazards.find((h) => h.state === "armed");
  if (focus) {
    const d = distXZ(player.group.position, focus.display);
    dom.incidentTitle.textContent = focus.title;
    dom.incidentDistance.textContent = focus.state === "active" ? `${Math.round(d)}m — 回避行動を取れ` : `${Math.round(d)}m 前方 — 状況を確認`;
    const progress = focus.state === "active" ? clamp(100 - d * 2.4, 10, 100) : clamp(100 - d * .75, 5, 65);
    dom.incidentProgress.style.width = `${progress}%`;
  } else {
    dom.incidentTitle.textContent = "危険区域を通過";
    dom.incidentDistance.textContent = "このまま慎重に走行してください";
    dom.incidentProgress.style.width = "100%";
  }
  if (game.messageTimer <= 0) dom.message.classList.remove("show");
  drawMinimap();
}

function drawMinimap() {
  const c = dom.minimap;
  const ctx = c.getContext("2d");
  const s = c.width / 280;
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.fillStyle = "rgba(6,12,15,.88)";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.strokeStyle = "rgba(165,192,187,.24)";
  ctx.lineWidth = 9 * s;
  for (const road of roadCenters) {
    const p = (road + 140) * s;
    ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, c.height); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(c.width, p); ctx.stroke();
  }
  for (const h of hazards) if (h.state !== "complete") {
    const p = h.state === "active" ? h.collider() : h.display;
    ctx.fillStyle = h.state === "active" ? "#ff6138" : "#d4a541";
    ctx.beginPath(); ctx.arc((p.x + 140) * s, (p.z + 140) * s, h.state === "active" ? 4 : 2.5, 0, Math.PI * 2); ctx.fill();
  }
  const x = (player.group.position.x + 140) * s, z = (player.group.position.z + 140) * s;
  ctx.save(); ctx.translate(x, z); ctx.rotate(player.heading + Math.PI); ctx.fillStyle = "#e5ff3d";
  ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(4.3, 5); ctx.lineTo(-4.3, 5); ctx.closePath(); ctx.fill(); ctx.restore();
  ctx.strokeStyle = "rgba(229,255,61,.55)"; ctx.lineWidth = 1;
  ctx.strokeRect(.5, .5, c.width - 1, c.height - 1);
}

function finishGame(success, reason = "") {
  if (game.state === "ended") return;
  game.state = "ended";
  dom.hud.classList.add("hidden");
  dom.end.classList.remove("hidden");
  if (success) {
    dom.resultKicker.textContent = "SHIFT COMPLETE / ALL INCIDENTS CLEARED";
    dom.resultTitle.textContent = "夜を、抜けた。";
    dom.resultCopy.textContent = "危険を読み、最後の瞬間まで車をコントロールした。都市の夜は、あなたを通した。";
  } else {
    dom.resultKicker.textContent = "SHIFT TERMINATED / INCIDENT RECORDED";
    dom.resultTitle.textContent = "一瞬の遅れ。";
    dom.resultCopy.textContent = `${reason}。危険の予兆を見逃さず、速度を落として回避ルートを作ろう。`;
  }
  dom.resultNear.textContent = String(game.near).padStart(2, "0");
  dom.resultScore.textContent = String(game.score).padStart(6, "0");
  dom.resultIntegrity.textContent = `${Math.round(player.damage)}%`;
}

function resetGame() {
  window.location.reload();
}

function startGame() {
  audio.start();
  game.state = "playing";
  game.elapsed = 0;
  dom.start.classList.add("hidden");
  dom.hud.classList.remove("hidden");
  showMessage("無線: 最初の事故地点へ向かってください", 2.5);
}
dom.startButton.addEventListener("click", startGame);
dom.restartButton.addEventListener("click", resetGame);

function render() {
  const dt = Math.min(clock.getDelta(), .05);
  if (game.state === "playing") {
    game.elapsed += dt;
    game.messageTimer -= dt;
    updatePlayer(dt);
    updateTraffic(dt);
    updateHazards(dt);
    updateWeather(dt);
    updateUI();
    if (game.elapsed >= game.duration) finishGame(true);
    if (hazards.every((h) => h.completed) && game.elapsed > 6) setTimeout(() => { if (game.state === "playing") finishGame(true); }, 450);
  } else {
    updateWeather(dt);
    if (game.state === "ready") updateUI();
  }
  updateCamera(dt, game.state === "ready");
  renderer.render(scene, camera);
  requestAnimationFrame(render);
}

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

setTimeout(() => dom.loading.classList.add("hidden"), 650);
render();
