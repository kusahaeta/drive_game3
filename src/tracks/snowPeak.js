/**
 * スノーピーク
 * 凍った湖のほとりから、つづら折りで雪山を登り、山頂のトンネルを抜けてスキージャンプ。
 * 崖沿いを下り、湖岸の凍った道を滑ってゴールへ。登り坂では大雪玉が転がってくる。
 * フォーマットの説明は src/tracks/index.js を参照。
 */
export default {
  id: "snow-peak",
  name: "スノーピーク",
  music: "assets/music/snow.mp3",
  description: "凍った湖面からスタートし、雪山を登って山頂からスキージャンプ。転がる大雪玉と、つるつる滑る凍った道に注意。",
  laps: 3,
  roadWidth: 17,
  shoulderWidth: 6,
  // [x, 高さ, z]。1点目がスタートライン。
  points: [
    [0, 0, 0],
    [0, 0, -110],
    [30, 1, -180],
    [100, 4, -195],
    [150, 8, -150],
    [120, 12, -90],
    [170, 16, -40],
    [230, 20, -70],
    [270, 26, -10],
    [250, 32, 70],
    [190, 34, 120],
    [120, 30, 120],
    [60, 20, 160],
    [-10, 12, 170],
    [-80, 7, 160],
    [-140, 3, 110],
    [-145, 1, 35],
    [-95, 0, 15],
    [-50, 0, 70],
    [-8, 0, 90],
    [22, 0, 58],
  ],
  // 以下の位置は周回に対する割合（0〜1）
  itemBoxRows: [0.1, 0.42, 0.66, 0.84],
  boostPads: [
    { at: 0.576, lateral: 0, width: 6 },
    { at: 0.7, lateral: 3 },
    { at: 0.97, lateral: -2 },
    // 凍ったスタート直線のダッシュ板（滑りながら狙う）
    { at: 0.035, lateral: 4 },
  ],
  features: [
    // つづら折りのヘアピンはバンク付き
    { type: "bank", from: 0.205, to: 0.235, angle: 12 },
    { type: "bank", from: 0.248, to: 0.276, angle: 12 },
    { type: "bank", from: 0.298, to: 0.327, angle: 12 },
    { type: "bank", from: 0.34, to: 0.372, angle: 12 },
    // 山頂のトンネル
    { type: "tunnel", from: 0.49, to: 0.55 },
    // トンネルを出てすぐスキージャンプで谷越え
    { type: "ramp", at: 0.585, length: 10, height: 2.6 },
    { type: "gap", from: 0.5916, to: 0.605 },
    // 左側が谷へ落ちる崖沿いの下り（壁なし）
    { type: "cliff", from: 0.63, to: 0.7, side: "left" },
    // 湖岸のつるつる滑る凍った道。ゴールをまたいでスタート直後の直線まで続く
    { type: "ice", from: 0.9, to: 0.06 },
  ],
  hazards: [
    // 登り坂を大雪玉が転がり落ちてくる
    { type: "snowball", from: 0.37, to: 0.465, count: 2, speed: 13, radius: 2.2 },
  ],
  theme: {
    skyTop: "#6fa8e0",
    skyBottom: "#eef5ff",
    fog: "#e6eef8",
    fogNear: 160,
    fogFar: 1100,
    sun: "#fff8ec",
    sunDir: [0.5, 0.55, 0.35],
    grass: ["#f4f8fc", "#e8eff8", "#f9fbff"],
    sand: "#dfe7f1",
    rock: "#5f636b",
    snow: "#ffffff",
    frozen: true,
    waterLevel: -2,
    hills: 16,
    mountains: 230,
    road: "#4a4e57",
    roadLine: "#f4f4f4",
    offroad: "#eef3fa",
    curbA: "#2f7fe0",
    curbB: "#f8f8f8",
    wallA: "#ff6a2a",
    wallB: "#f8f8f8",
    treeLeaf: ["#2c5e3a", "#2f6b40", "#24503a"],
    treeTrunk: "#5b3d22",
    snowfall: true,
    light: { hemiSky: "#eaf3ff", hemiGround: "#b8c8dc", hemi: 1.5, sun: 2.3 },
  },
  scenery: {
    trees: 1300,
    seed: 21,
    treeTypes: ["snowpine", "snowpine", "snowpine", "pine"],
    clearance: 10,
    spread: 300,
    cabins: 7,
    snowmen: 14,
    balloons: false,
  },
};
