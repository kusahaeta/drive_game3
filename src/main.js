import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { TRACKS } from "./tracks/index.js";
import { Race, DIFFICULTIES } from "./race.js";
import { HUD } from "./hud.js";
import { input } from "./input.js";
import { sound } from "./audio.js";
import { Particles } from "./particles.js";
import { clamp, damp, dampAngle, formatTime, hexCss } from "./utils.js";

const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------- 描画まわり
const renderer = new THREE.WebGLRenderer({ canvas: $("game"), antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.1, 4200);
const hemi = new THREE.HemisphereLight(0xe4f2ff, 0x6a7f4a, 1.5);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff3d6, 2.6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -80, right: 80, top: 80, bottom: -80, near: 1, far: 400 });
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.04;
scene.add(sun, sun.target);

// ポストエフェクト：ブルーム（光るもの＝火花・ダッシュの炎・太陽がにじむ）
const composer = new EffectComposer(
  renderer,
  new THREE.WebGLRenderTarget(innerWidth, innerHeight, { samples: 4, type: THREE.HalfFloatType }),
);
composer.setPixelRatio(renderer.getPixelRatio());
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.4, 0.45, 1.6);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const particles = new Particles(scene);
const hud = new HUD();

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
});

// ---------------------------------------------------------------- 状態
let race = null;
let mode = "title"; // title | race | paused | results
let trackIndex = 0;
let difficulty = "normal";
const cam = { yaw: 0, orbit: 0, focus: 0, focusTimer: 0 };

function setScreen(name) {
  for (const id of ["title-screen", "pause-screen", "result-screen"]) $(id).classList.toggle("hidden", id !== name);
}

function loadRace(demo) {
  race?.dispose();
  particles.clear();
  race = new Race({
    scene,
    trackDef: TRACKS[trackIndex],
    difficulty,
    particles,
    sound,
    demo,
    onEvent: (type, kart, data) => hud.handleEvent(type, kart, data),
  });
  const th = race.track.theme;
  scene.fog = new THREE.Fog(th.fog, th.fogNear, th.fogFar);
  scene.background = new THREE.Color(th.skyBottom);
  sun.color.set(th.sun);
  // 明るさ（宇宙コースなどで変える）
  const light = { hemiSky: "#e4f2ff", hemiGround: "#6a7f4a", hemi: 1.5, sun: 2.6, ...th.light };
  hemi.color.set(light.hemiSky);
  hemi.groundColor.set(light.hemiGround);
  hemi.intensity = light.hemi;
  sun.intensity = light.sun;
  updateCamera(0, true);
}

function showTitle() {
  mode = "title";
  loadRace(true);
  hud.show(false);
  setScreen("title-screen");
  sound.engine(0, false, false);
}

function startRace() {
  sound.init();
  loadRace(false);
  hud.setup(race);
  hud.show(true);
  setScreen(null);
  mode = "race";
}

function togglePause() {
  if (mode === "race") {
    mode = "paused";
    setScreen("pause-screen");
    sound.engine(0, false, false);
  } else if (mode === "paused") {
    mode = "race";
    setScreen(null);
  }
}

function showResults() {
  mode = "results";
  hud.show(false);
  const rows = race.results();
  const me = rows.find((r) => r.isPlayer);
  $("result-title").textContent = me.rank === 1 ? "優勝!" : `${me.rank}位でフィニッシュ!`;
  $("result-sub").textContent = `${TRACKS[trackIndex].name} ・ ${DIFFICULTIES[difficulty].label}`;
  $("result-table").innerHTML =
    "<tr><th>順位</th><th>ドライバー</th><th>タイム</th><th>ベストラップ</th></tr>" +
    rows
      .map(
        (r) =>
          `<tr class="${r.isPlayer ? "me" : ""}"><td>${r.rank}</td><td><i style="background:${hexCss(r.color)}"></i>${r.name}</td><td>${r.time == null ? "走行中" : formatTime(r.time)}</td><td>${formatTime(r.best)}</td></tr>`,
      )
      .join("");
  setScreen("result-screen");
}

// ---------------------------------------------------------------- タイトル画面
function buildTitle() {
  const list = $("track-list");
  list.innerHTML = "";
  TRACKS.forEach((t, i) => {
    const b = document.createElement("button");
    b.className = `choice${i === trackIndex ? " selected" : ""}`;
    b.innerHTML = `<strong>${t.name}</strong><span>${t.description ?? ""}</span><small>${t.laps ?? 3} LAPS</small>`;
    b.onclick = () => {
      if (trackIndex === i) return;
      trackIndex = i;
      buildTitle();
      loadRace(true);
    };
    list.appendChild(b);
  });
  const diff = $("difficulty");
  diff.innerHTML = "";
  for (const [key, d] of Object.entries(DIFFICULTIES)) {
    const b = document.createElement("button");
    b.className = `pill${key === difficulty ? " selected" : ""}`;
    b.textContent = d.label;
    b.onclick = () => {
      difficulty = key;
      buildTitle();
    };
    diff.appendChild(b);
  }
}

$("start-btn").onclick = startRace;
$("retry-btn").onclick = startRace;
$("menu-btn").onclick = showTitle;
$("resume-btn").onclick = togglePause;
$("pause-retry-btn").onclick = startRace;
$("pause-menu-btn").onclick = showTitle;
$("mute-btn").onclick = () => ($("mute-btn").textContent = sound.toggleMute() ? "🔇" : "🔊");

// ---------------------------------------------------------------- カメラ
const look = new THREE.Vector3();

function updateCamera(dt, snap = false) {
  let target;
  if (race.demo) {
    // タイトル画面では数秒ごとに追いかける車を切り替える
    cam.focusTimer -= dt;
    if (cam.focusTimer <= 0 || snap) {
      cam.focus = (cam.focus + 3) % race.karts.length;
      cam.focusTimer = 7;
      snap = true;
    }
    target = race.karts[cam.focus];
  } else target = race.player;

  const finished = !race.demo && target.finished;
  const want = new THREE.Vector3();
  if (finished) {
    cam.orbit += dt * 0.5;
    want.set(target.pos.x + Math.sin(cam.orbit) * 9, target.y + 3.2, target.pos.z + Math.cos(cam.orbit) * 9);
  } else {
    if (target.spinTimer <= 0 || snap) cam.yaw = snap ? target.heading : dampAngle(cam.yaw, target.heading + target.bodyYaw * 0.25, 5, dt);
    const dist = race.demo ? 11 : 7.2;
    const h = race.demo ? 4.6 : 3.0;
    want.set(target.pos.x - Math.sin(cam.yaw) * dist, target.y + h, target.pos.z - Math.cos(cam.yaw) * dist);
    cam.orbit = cam.yaw + Math.PI;
  }
  if (target.respawned) {
    target.respawned = false;
    snap = true;
    cam.yaw = target.heading;
    want.set(target.pos.x - Math.sin(cam.yaw) * 7.2, target.y + 3, target.pos.z - Math.cos(cam.yaw) * 7.2);
  }
  if (snap) camera.position.copy(want);
  else {
    camera.position.x = damp(camera.position.x, want.x, 12, dt);
    camera.position.z = damp(camera.position.z, want.z, 12, dt);
    camera.position.y = damp(camera.position.y, want.y, 8, dt);
  }
  const ahead = finished ? 0 : 4;
  look.set(target.pos.x + Math.sin(cam.yaw) * ahead, target.y + 1.3, target.pos.z + Math.cos(cam.yaw) * ahead);
  camera.lookAt(look);

  const fov = 68 + clamp(target.speed / target.maxSpeed, 0, 1.3) * 6 + (target.boostTimer > 0 ? 7 : 0);
  camera.fov = snap ? fov : damp(camera.fov, fov, 4, dt);
  camera.updateProjectionMatrix();

  const sd = race.track.sunDir;
  sun.position.set(target.pos.x + sd.x * 150, target.y + sd.y * 150, target.pos.z + sd.z * 150);
  sun.target.position.set(target.pos.x, target.y, target.pos.z);
  race.track.sky.position.copy(camera.position);
}

// ---------------------------------------------------------------- メインループ
const clock = new THREE.Clock();

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 1 / 20);

  if (input.hit("Escape", "KeyP") && (mode === "race" || mode === "paused")) togglePause();
  if (input.hit("KeyR") && (mode === "race" || mode === "paused" || mode === "results")) startRace();
  if (input.hit("KeyM")) $("mute-btn").click();
  if (input.hit("Enter") && (mode === "title" || mode === "results")) startRace();

  if (mode !== "paused") {
    race.update(dt, input);
    particles.update(dt);
    if (!window.kartGP.freeCam) updateCamera(dt);
    if (mode === "race") {
      hud.update(race, dt);
      if (race.state === "done") showResults();
    }
  }
  input.endFrame();
  const p = race.demo ? null : race.player;
  document.body.classList.toggle("boosting", !!p && p.boostTimer > 0 && mode === "race");
  composer.render();
}

// デバッグ用：コンソールから window.kartGP.race で状態を確認できる
window.kartGP = { get race() { return race; }, startRace, showTitle, camera, freeCam: false };

buildTitle();
showTitle();
$("loading").remove();
frame();
