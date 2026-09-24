import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { TRACKS } from "./tracks/index.js";
import { CUPS, CUP_RACES } from "./tracks/cups.js";
import { Track } from "./track.js";
import { Race, DIFFICULTIES, RACERS } from "./race.js";
import { loadKartModel } from "./kart.js";
import { HUD } from "./hud.js";
import { input } from "./input.js";
import { sound } from "./audio.js";
import { Particles } from "./particles.js";
import { drawCoursePreview, courseStats } from "./coursePreview.js";
import { clamp, damp, dampAngle, hexCss, timeHtml } from "./utils.js";

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
  if (mode === "title" && race) updateTitlePreview();
});

// ---------------------------------------------------------------- 状態
let race = null;
let mode = "title"; // title | race | paused | results | gpFinal
let trackIndex = 0; // 読み込んでいるコース
let courseIndex = 0; // 1レースで選んでいるコース
let cupIndex = 0; // グランプリで選んでいるカップ
let difficulty = "normal";
let gameMode = "single"; // single | gp
let gp = null; // グランプリ中の状態（startGP で作る）
let underwater = null; // カメラが水中か
const cam = { yaw: 0, orbit: 0, focus: 0, focusTimer: 0, roll: 0, trauma: 0, base: new THREE.Vector3() };

// ---------------------------------------------------------------- 手ごたえ（画面の揺れ・フラッシュ・振動）
// trauma は 0〜1。揺れの大きさは trauma² で、時間とともに減っていく
function shake(amount, rumbleMs = 0) {
  cam.trauma = Math.min(1, cam.trauma + amount);
  if (rumbleMs) input.rumble(amount * 1.4, rumbleMs);
}

function flash(cls = "hit") {
  const el = $("flash");
  el.classList.remove("hit", "zap");
  void el.offsetWidth;
  el.classList.add(cls);
}

function feedback(type, kart, data) {
  const p = race.player;
  const me = kart === p;
  switch (type) {
    case "hit":
      if (me) {
        shake(0.65, 300);
        flash();
      }
      break;
    case "wall":
      if (me) shake(Math.min(0.45, data * 0.025), 90);
      break;
    case "bump":
      if (me || data.other === p) shake(Math.min(0.3, data.rel * 0.03), 80);
      break;
    case "land":
      if (me) shake(Math.min(0.4, data * 0.022), 120);
      break;
    case "fall":
      if (me) shake(0.35, 200);
      break;
    case "lightning":
      flash("zap");
      if (kart !== p && p.shrinkTimer > 0) shake(0.5, 250);
      break;
    case "star":
    case "bullet":
    case "rocket":
    case "boostPad":
    case "boostItem":
    case "trickBoost":
      if (me) shake(0.12, 60);
      break;
    case "driftBoost":
      if (me) shake(0.06 + data * 0.05, 60);
      break;
    case "slam": // クラッシャーや隕石・落雷・爆発は近いほど大きく揺れる
    case "meteor":
    case "thunder":
    case "explode": {
      const d = Math.hypot(data.x - p.pos.x, data.z - p.pos.z);
      if (d < 50) shake((type === "slam" ? 0.5 : 0.6) * (1 - d / 50), 150);
      if (type === "thunder" && d < 35) flash("zap");
      break;
    }
  }
}

// ---------------------------------------------------------------- グランプリ
// 選んだカップの 4 コースを順に走り、順位ごとのポイントの合計で最終順位を決める
const GP_POINTS = [15, 12, 10, 8, 6, 4, 2, 1]; // 1位〜8位

function startGP() {
  const cup = CUPS[cupIndex];
  gp = { cup, courses: cup.courses, round: 0, points: RACERS.map(() => []) };
  trackIndex = cup.courses[0];
  startRace();
}

// 今のレースの順位で入るポイント（CPU が走行中でも今の順位で数える）
function racePoints(rows) {
  const pts = RACERS.map(() => 0);
  for (const r of rows) pts[r.index] = GP_POINTS[r.rank - 1] ?? 0;
  return pts;
}

// 総合順位：合計ポイントが多い順。同点なら直近のレースで上だった方
function gpStandings(extra = null) {
  return RACERS.map((r, i) => {
    const pts = extra ? [...gp.points[i], extra[i]] : gp.points[i];
    return { index: i, name: r.name, color: r.color, isPlayer: i === 0, pts, total: pts.reduce((a, b) => a + b, 0) };
  })
    .sort((a, b) => b.total - a.total || b.pts.at(-1) - a.pts.at(-1))
    .map((s, i, all) => ({ ...s, rank: i > 0 && s.total === all[i - 1].total && s.pts.at(-1) === all[i - 1].pts.at(-1) ? all[i - 1].rank : i + 1 }));
}

// 1 レースの集計。全員ゴールして順位が確定してから始める
//   count: 獲得ポイントを出して合計をカウントアップ → sort: 総合順位に並べ替え → done
let tally = null; // 順位の確定待ちの間は null
const TALLY_DELAY = 0.5;
const TALLY_COUNT = 1.4;
const TALLY_SORT_DELAY = 0.7;
const gpTotals = () => gp.points.map((p) => p.reduce((a, b) => a + b, 0));

function beginTally() {
  const rows = race.results();
  const prev = gpTotals();
  // 前のレースまでの総合順位（1 戦目はなし）
  const prevRank = gp.round > 0 ? Object.fromEntries(gpStandings().map((st) => [st.index, st.rank])) : null;
  const pts = racePoints(rows);
  pts.forEach((p, i) => gp.points[i].push(p)); // ポイントはここで確定
  tally = { phase: "count", t: 0, prev, prevRank, pts, tick: -1 };
  renderGPTable(rows, prev);
  setResultButtons();
}

function updateTally(dt) {
  if (!tally || tally.phase === "done") return;
  tally.t += dt;
  if (tally.phase === "count") {
    const k = clamp((tally.t - TALLY_DELAY) / TALLY_COUNT, 0, 1);
    if (tally.t >= TALLY_DELAY) showTallyPoints(k);
    const tick = Math.floor(k * 14);
    if (tick !== tally.tick && k > 0 && k < 1) sound.play("roulette", tick);
    tally.tick = tick;
    if (k >= 1) {
      sound.play("get");
      tally.phase = "sort";
      tally.t = 0;
    }
  } else if (tally.phase === "sort" && tally.t >= TALLY_SORT_DELAY) sortGPTable();
}

// 獲得ポイントを表示し、合計を k (0〜1) の割合まで数え上げる
function showTallyPoints(k) {
  for (const tr of $("result-table").querySelectorAll("tr[data-index]")) {
    const i = +tr.dataset.index;
    const gain = tr.querySelector(".gain");
    if (!gain.textContent) gain.textContent = `+${tally.pts[i]}`;
    tr.querySelector(".total").textContent = tally.prev[i] + Math.round(tally.pts[i] * k);
  }
}

// 総合順位の順に行を並べ替える（元の位置から滑らかに移動させる）
function sortGPTable() {
  const table = $("result-table");
  const trs = [...table.querySelectorAll("tr[data-index]")];
  const byIndex = new Map(trs.map((tr) => [+tr.dataset.index, tr]));
  const before = new Map(trs.map((tr) => [tr, tr.getBoundingClientRect().top]));
  const standings = gpStandings();
  const parent = trs[0].parentNode;
  standings.forEach((st) => {
    const tr = byIndex.get(st.index);
    parent.appendChild(tr);
    // 前のレースまでの総合順位からの上がり下がり
    const move = tally.prevRank ? tally.prevRank[st.index] - st.rank : 0;
    tr.cells[0].innerHTML = `${st.rank}${move ? `<small class="move ${move > 0 ? "up" : "down"}">${move > 0 ? "▲" : "▼"}${Math.abs(move)}</small>` : ""}`;
  });
  table.querySelector("th").textContent = "総合";
  for (const tr of trs) {
    const dy = before.get(tr) - tr.getBoundingClientRect().top;
    if (!dy) continue;
    tr.style.transition = "none";
    tr.style.transform = `translateY(${dy}px)`;
    void tr.offsetWidth;
    tr.style.transition = "";
    tr.style.transform = "";
  }
  updateGPSub(standings.find((st) => st.isPlayer).rank);
  tally.phase = "done";
  setResultButtons();
}

// 集計を最後まで飛ばす（順位の確定待ちなら今の順位で確定する）
function skipTally() {
  if (!tally) beginTally();
  if (tally.phase === "count") showTallyPoints(1);
  if (tally.phase !== "done") sortGPTable();
}

function nextGPRace() {
  if (tally?.phase !== "done") return skipTally();
  tally = null;
  gp.round++;
  if (gp.round < gp.courses.length) {
    trackIndex = gp.courses[gp.round];
    startRace();
  } else showGPFinal();
}

function showGPFinal() {
  mode = "gpFinal";
  trackIndex = gp.courses.at(-1);
  loadRace(true); // 背景はデモ走行
  const rows = gpStandings();
  const me = rows.find((r) => r.isPlayer);
  $("result-title").textContent = me.rank === 1 ? `${gp.cup.name}優勝!` : `総合 ${me.rank}位`;
  $("result-sub").textContent = `${gp.cup.icon} ${gp.cup.name} 最終結果 ・ ${DIFFICULTIES[difficulty].label}`;
  $("result-table").innerHTML =
    `<tr><th>順位</th><th>ドライバー</th>${gp.courses.map((_, i) => `<th>R${i + 1}</th>`).join("")}<th>合計</th></tr>` +
    rows
      .map(
        (r) =>
          `<tr class="${r.isPlayer ? "me" : ""}"><td>${r.rank}</td><td><i style="background:${hexCss(r.color)}"></i>${r.name}</td>${r.pts.map((p) => `<td>${p}</td>`).join("")}<td class="total">${r.total}</td></tr>`,
      )
      .join("");
  setResultButtons();
  setScreen("result-screen");
  sound.playMusic(me.rank <= 3 ? "assets/music/victory.mp3" : TRACKS[trackIndex].music, true);
}

function setResultButtons() {
  const inGP = !!gp && mode === "results";
  $("next-btn").classList.toggle("hidden", !inGP);
  $("next-btn").firstChild.textContent =
    inGP && tally?.phase !== "done" ? "スキップ " : inGP && gp.round === gp.courses.length - 1 ? "最終結果へ " : "次のレースへ ";
  $("retry-btn").classList.toggle("hidden", !!gp);
}

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
    onEvent: (type, kart, data) => {
      hud.handleEvent(type, kart, data);
      feedback(type, kart, data);
      // 結果画面の表示中も CPU は走り続けるので、ゴールしたら表を更新する
      if (type === "finish" && mode === "results" && !tally) {
        race.updateRanks(); // finish は順位の再計算より先に届く
        renderResultTable();
      }
    },
  });
  const th = race.track.theme;
  scene.fog = new THREE.Fog(th.fog, th.fogNear, th.fogFar);
  scene.background = new THREE.Color(th.skyBottom);
  underwater = null;
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
  gp = null;
  trackIndex = titleTrack();
  loadRace(true);
  updateTitlePreview();
  hud.show(false);
  setScreen("title-screen");
  sound.engine(0, false, false);
  sound.playMusic(TRACKS[trackIndex].music, true);
}

function startRace() {
  sound.init();
  loadRace(false);
  sound.stopMusic(); // カウントダウン中は鳴らさない（GO! で race.js が流す）
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
    sound.pauseMusic();
  } else if (mode === "paused") {
    mode = "race";
    sound.resumeMusic();
    setScreen(null);
  }
}

function showResults() {
  mode = "results";
  hud.show(false);
  const rows = race.results();
  const me = rows.find((r) => r.isPlayer);
  $("result-title").textContent = me.rank === 1 ? "優勝!" : `${me.rank}位でフィニッシュ!`;
  tally = null;
  renderResultTable(rows);
  setResultButtons();
  setScreen("result-screen");
}

function renderResultTable(rows = race.results()) {
  const sub = `${TRACKS[trackIndex].name} ・ ${DIFFICULTIES[difficulty].label}`;
  if (gp) {
    // グランプリ：全員ゴールするまではレースの順位だけ。確定したら集計を始める
    renderGPTable(rows, gpTotals());
    updateGPSub(gpStandings().find((st) => st.isPlayer).rank);
    if (race.karts.every((k) => k.finished)) beginTally();
    return;
  }
  $("result-sub").textContent = sub;
  $("result-table").innerHTML =
    "<tr><th>順位</th><th>ドライバー</th><th>タイム</th><th>ベストラップ</th></tr>" +
    rows
      .map(
        (r) =>
          `<tr class="${r.isPlayer ? "me" : ""}"><td>${r.rank}</td><td><i style="background:${hexCss(r.color)}"></i>${r.name}</td><td>${r.time == null ? "走行中" : timeHtml(r.time)}</td><td>${timeHtml(r.best)}</td></tr>`,
      )
      .join("");
}

function renderGPTable(rows, totals) {
  $("result-table").innerHTML =
    "<tr><th>順位</th><th>ドライバー</th><th>タイム</th><th>獲得</th><th>合計</th></tr>" +
    rows
      .map(
        (r) =>
          `<tr data-index="${r.index}" class="${r.isPlayer ? "me" : ""}"><td>${r.rank}</td><td><i style="background:${hexCss(r.color)}"></i>${r.name}</td><td>${r.time == null ? "走行中" : timeHtml(r.time)}</td><td class="gain"></td><td class="total">${totals[r.index]}</td></tr>`,
      )
      .join("");
}

function updateGPSub(rank) {
  const sub = `${TRACKS[trackIndex].name} ・ ${DIFFICULTIES[difficulty].label}`;
  $("result-sub").textContent = `${gp.cup.name} 第${gp.round + 1}戦 / ${gp.courses.length} ・ ${sub} ・ 総合 ${rank}位`;
}

// ---------------------------------------------------------------- タイトル画面
// タイトル画面の背景で走らせるコース（グランプリならカップの 1 コース目）
const titleTrack = () => (gameMode === "gp" ? CUPS[cupIndex].courses[0] : courseIndex);

function buildTitle() {
  const gpMode = gameMode === "gp";
  const dots = (id, list, selected, onSelect) => {
    const el = $(id);
    el.innerHTML = "";
    list.forEach((item, i) => {
      const d = document.createElement("button");
      d.className = i === selected ? "selected" : "";
      d.title = item.name;
      d.onclick = () => onSelect(i);
      el.appendChild(d);
    });
  };
  dots("course-dots", TRACKS, courseIndex, selectTrack);
  dots("cup-dots", CUPS, cupIndex, selectCup);
  for (const id of ["course-select", "course-dots"]) $(id).classList.toggle("hidden", gpMode);
  for (const id of ["cup-select", "cup-dots"]) $(id).classList.toggle("hidden", !gpMode);
  $("select-label").textContent = gpMode ? "カップ" : "コース";
  $("start-label").textContent = gpMode ? "グランプリスタート" : "レーススタート";

  const modes = $("mode-select");
  modes.innerHTML = "";
  for (const [key, label, note] of [
    ["single", "1レース", "コースを選んで走る"],
    ["gp", "グランプリ", `カップの${CUP_RACES}レースで合計ポイントを競う`],
  ]) {
    const b = document.createElement("button");
    b.className = `pill${key === gameMode ? " selected" : ""}`;
    b.innerHTML = `${label}<small>${note}</small>`;
    b.onclick = () => setGameMode(key);
    modes.appendChild(b);
  }
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

function setGameMode(key) {
  if (key === gameMode) return;
  gameMode = key;
  buildTitle();
  showTitleTrack();
}

// 背景のデモ走行と BGM を選択中のコースに合わせる
function showTitleTrack() {
  if (titleTrack() !== trackIndex) {
    trackIndex = titleTrack();
    loadRace(true);
    sound.playMusic(TRACKS[trackIndex].music);
  }
  updateTitlePreview();
}

// 左右で切り替える（端まで行くと反対側へ回る）。選んだ番号とスライドの向きを返す
function step(i, current, n) {
  i = ((i % n) + n) % n;
  const dir = i === (current + 1) % n ? "next" : i === (current - 1 + n) % n ? "prev" : i > current ? "next" : "prev";
  return [i, dir];
}

function slideCard(id, dir) {
  const card = $(id);
  card.classList.remove("slide-next", "slide-prev");
  void card.offsetWidth; // アニメーションを再スタート
  card.classList.add(`slide-${dir}`);
}

function selectTrack(i) {
  const [next, dir] = step(i, courseIndex, TRACKS.length);
  if (next === courseIndex) return;
  courseIndex = next;
  buildTitle();
  showTitleTrack();
  slideCard("course-preview", dir);
}

function selectCup(i) {
  const [next, dir] = step(i, cupIndex, CUPS.length);
  if (next === cupIndex) return;
  cupIndex = next;
  buildTitle();
  showTitleTrack();
  slideCard("cup-preview", dir);
}

function updateTitlePreview() {
  if (gameMode === "gp") updateCupPreview();
  else updateCoursePreview();
}

// 選択中のコース図（loadRace で作った Track から描く）
function updateCoursePreview() {
  const t = race.track;
  const st = courseStats(t);
  const def = TRACKS[trackIndex];
  $("course-name").textContent = def.name;
  $("course-laps").textContent = `${def.laps ?? 3} LAPS`;
  $("course-count").textContent = `${trackIndex + 1} / ${TRACKS.length}`;
  $("course-desc").textContent = def.description ?? "";
  $("course-stats").innerHTML =
    `<div><dt>全長</dt><dd>${st.length.toLocaleString()} m</dd></div>` +
    `<div><dt>高低差</dt><dd>${st.climb} m</dd></div>` +
    (st.branches ? `<div><dt>分かれ道</dt><dd>${st.branches} か所</dd></div>` : "");
  $("course-legend").innerHTML =
    `<li><i style="background:#ff3d5a"></i>スタート → 進行方向</li>` +
    (st.branches ? `<li><i style="background:#6b5fd6"></i>分かれ道</li>` : "") +
    st.features.map(([, label, color]) => `<li><i style="background:${color}"></i>${label}</li>`).join("");
  drawCoursePreview($("course-map"), t);
}

// カップの 4 コースを小さなコース図で並べる（コース図用の Track は一度作ったら使い回す）
const previewTracks = new Map();
const previewTrack = (i) => previewTracks.get(i) ?? previewTracks.set(i, new Track(TRACKS[i])).get(i);

function updateCupPreview() {
  const cup = CUPS[cupIndex];
  $("cup-name").textContent = `${cup.icon} ${cup.name}`;
  $("cup-count").textContent = `${cupIndex + 1} / ${CUPS.length}`;
  const list = $("cup-courses");
  list.innerHTML = cup.courses.map((t, i) => `<li><canvas></canvas><span><b>${i + 1}</b> ${TRACKS[t].name}</span></li>`).join("");
  list.querySelectorAll("canvas").forEach((c, i) => drawCoursePreview(c, previewTrack(cup.courses[i])));
}

$("course-prev").onclick = () => selectTrack(courseIndex - 1);
$("course-next").onclick = () => selectTrack(courseIndex + 1);
$("cup-prev").onclick = () => selectCup(cupIndex - 1);
$("cup-next").onclick = () => selectCup(cupIndex + 1);
const start = () => (gameMode === "gp" ? startGP() : startRace());
$("start-btn").onclick = start;
$("retry-btn").onclick = startRace;
$("next-btn").onclick = nextGPRace;
$("menu-btn").onclick = showTitle;
$("resume-btn").onclick = togglePause;
$("pause-retry-btn").onclick = startRace;
$("pause-menu-btn").onclick = showTitle;
// ブラウザは操作があるまで音を出せないので、最初のクリックかキー入力で音を有効にする（タイトル画面の BGM 用）
for (const ev of ["pointerdown", "keydown"]) addEventListener(ev, () => sound.init(), { once: true });
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
  // 揺れを足す前の位置で追いかける（揺れがカメラの遅れに混ざらないように）
  if (snap) cam.base.copy(want);
  else {
    cam.base.x = damp(cam.base.x, want.x, 12, dt);
    cam.base.z = damp(cam.base.z, want.z, 12, dt);
    cam.base.y = damp(cam.base.y, want.y, 8, dt);
  }
  const ahead = finished ? 0 : 4;
  look.set(target.pos.x + Math.sin(cam.yaw) * ahead, target.y + 1.3, target.pos.z + Math.cos(cam.yaw) * ahead);

  // 画面の揺れ：なめらかなノイズ（周波数の違う sin の和）で位置と傾きをずらす
  cam.trauma = race.demo ? 0 : Math.max(0, cam.trauma - dt * 1.8);
  const s = cam.trauma * cam.trauma;
  const t = clock.elapsedTime;
  const n = (a, b) => Math.sin(t * a) * 0.6 + Math.sin(t * b + 1.7) * 0.4;
  camera.position.set(cam.base.x + n(41, 67) * s * 0.5, cam.base.y + n(53, 89) * s * 0.4, cam.base.z + n(37, 71) * s * 0.5);
  camera.lookAt(look);
  // ドリフト中は曲がる側へ少しだけ傾ける
  const lean = finished ? 0 : target.bodyYaw * 0.09;
  cam.roll = snap ? lean : damp(cam.roll, lean, 5, dt);
  camera.rotateZ(cam.roll + n(29, 59) * s * 0.06);

  const fov = 68 + clamp(target.speed / target.maxSpeed, 0, 1.3) * 6 + (target.boostTimer > 0 ? 7 : 0);
  camera.fov = snap ? fov : damp(camera.fov, fov, 4, dt);
  camera.updateProjectionMatrix();

  const sd = race.track.sunDir;
  sun.position.set(target.pos.x + sd.x * 150, target.y + sd.y * 150, target.pos.z + sd.z * 150);
  sun.target.position.set(target.pos.x, target.y, target.pos.z);
  race.track.sky.position.copy(camera.position);
  race.track.snowfall?.userData.center.copy(camera.position);
}

// カメラが海に沈んだら青いフォグで水中の見た目に（海に沈んだ道のあるコースだけ）
function updateUnderwater() {
  const track = race.track;
  const on = !!track.shallows?.length && camera.position.y < track.theme.waterLevel - 0.1;
  if (on === underwater) return;
  underwater = on;
  const th = track.theme;
  scene.fog.color.set(on ? th.underwaterFog ?? "#0f6f9c" : th.fog);
  scene.fog.near = on ? 2 : th.fogNear;
  scene.fog.far = on ? 110 : th.fogFar;
  scene.background.set(on ? th.underwaterFog ?? "#0f6f9c" : th.skyBottom);
  track.sky.visible = !on;
  sound.underwater(on && !race.demo);
}

// ブラウザは操作があるまで音を出せないことが多い。自動再生できなければ
// 読み込み画面を「クリックしてスタート」にして、最初の操作で BGM を流す
async function unlockAudio() {
  sound.init();
  if (!sound.ctx) return;
  await Promise.race([sound.ctx.resume(), new Promise((r) => setTimeout(r, 300))]);
  if (sound.ctx.state === "running") return;
  const gate = $("loading");
  gate.textContent = "クリック または キーを押してスタート";
  gate.classList.add("gate");
  await new Promise((resolve) => {
    // pointerdown だと離した時のクリックが下のボタンに届くので click で待つ
    for (const ev of ["click", "keydown"]) addEventListener(ev, resolve, { once: true });
  });
  sound.init();
}

// ---------------------------------------------------------------- メインループ
const clock = new THREE.Clock();

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 1 / 20);

  if (input.hit("Escape", "KeyP") && (mode === "race" || mode === "paused")) togglePause();
  // グランプリの結果画面ではやり直せない（ポイントは次へ進む時に確定する）
  if (input.hit("KeyR") && (mode === "race" || mode === "paused" || (mode === "results" && !gp))) startRace();
  if (input.hit("KeyM")) $("mute-btn").click();
  if (input.hit("Enter")) {
    if (mode === "title") start();
    else if (mode === "results") gp ? nextGPRace() : startRace();
    else if (mode === "gpFinal") showTitle();
  }
  if (mode === "title") {
    const select = gameMode === "gp" ? (d) => selectCup(cupIndex + d) : (d) => selectTrack(courseIndex + d);
    if (input.hit("ArrowLeft", "KeyA")) select(-1);
    if (input.hit("ArrowRight", "KeyD")) select(1);
  }

  if (mode !== "paused") {
    race.update(dt, input);
    particles.update(dt);
    if (!window.kartGP.freeCam) updateCamera(dt);
    updateUnderwater();
    if (mode === "results" && gp) updateTally(dt);
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

await loadKartModel();
buildTitle();
showTitle();
await unlockAudio();
$("loading").remove();
input.endFrame(); // スタートのために押したキーでレースが始まらないように
frame();
