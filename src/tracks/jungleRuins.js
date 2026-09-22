/**
 * ジャングル遺跡
 * 大岩が転がってくる密林の土の道 → 洞窟 → 台地の遺跡 → 川の谷を大ジャンプ → 木の吊り橋 → 崖沿いを下ってゴール。
 * フォーマットの説明は src/tracks/index.js を参照。
 */
export default {
  id: "jungle-ruins",
  name: "ジャングル遺跡",
  music: "assets/music/jungle.mp3",
  description: "密林を抜けて古代遺跡へ。洞窟、谷越えジャンプ、木の吊り橋が待つ。",
  laps: 3,
  roadWidth: 17,
  shoulderWidth: 6,
  // [x, 高さ, z]。1点目がスタートライン。
  points: [
    [0, 0, 20],
    [0, 0, -100],
    [-30, 2, -170],
    [-100, 4, -190],
    [-165, 6, -150],
    [-175, 8, -75],
    [-140, 10, -20],
    [-165, 13, 40],
    [-150, 15, 110],
    [-90, 16, 150],
    [-20, 16, 190],
    [60, 8, 200],
    [130, 4, 160],
    [190, 3, 90],
    [210, 4, 0],
    [188, 5, -70],
    [142, 4, -130],
    [88, 3, -85],
    [102, 1, 10],
    [62, 0, 92],
    [12, 0, 82],
  ],
  // 以下の位置は周回に対する割合（0〜1）
  itemBoxRows: [0.1, 0.41, 0.62, 0.86],
  boostPads: [
    { at: 0.481, lateral: 0, width: 6 },
    { at: 0.57, lateral: -3 },
    { at: 0.9, lateral: 2 },
  ],
  features: [
    // 岩山の洞窟を抜けて登る
    { type: "tunnel", from: 0.14, to: 0.2 },
    // 台地の上の古代遺跡
    { type: "ruins", from: 0.37, to: 0.485 },
    // 遺跡の先からダッシュ板→ジャンプ台で川の谷を飛び越える
    { type: "ramp", at: 0.4885, length: 10, height: 2.4 },
    { type: "gap", from: 0.4945, to: 0.5045 },
    // 川に架かる木の吊り橋
    { type: "bridge", from: 0.6, to: 0.66 },
    // 右側が川へ落ちる崖道（壁なし）
    { type: "cliff", from: 0.69, to: 0.75, side: "right" },
    // 急なヘアピンはバンク付き
    { type: "bank", from: 0.75, to: 0.79, angle: 14 },
  ],
  hazards: [
    // スタート直後の直線を、遺跡の罠の大岩が転がってくる
    { type: "snowball", boulder: true, from: 0.015, to: 0.09, count: 2, speed: 11, radius: 2.4 },
  ],
  theme: {
    skyTop: "#4f9fd6",
    skyBottom: "#d9f0d8",
    fog: "#cfe6cf",
    fogNear: 140,
    fogFar: 900,
    sun: "#fff0c8",
    sunDir: [-0.35, 0.75, 0.4],
    grass: ["#3f8f2f", "#2f7a26", "#4c9e36"],
    sand: "#b89a62",
    rock: "#7d7a66",
    water: "#2f8f7f",
    waterLevel: -2,
    hills: 18,
    mountains: 120,
    road: "#8a6a45",
    roadLine: "rgba(0,0,0,0)",
    roadCenter: false,
    offroad: "#5d7a2c",
    curbA: "#e2b53c",
    curbB: "#3f7a2a",
    wallA: "#6b4526",
    wallB: "#8a5e36",
    treeLeaf: ["#2f7d2a", "#3c9a33", "#256b25", "#4aa83a", "#1f5e22"],
    treeTrunk: "#5b3d22",
    bridgeStyle: "wood",
  },
  scenery: {
    trees: 2200,
    seed: 5,
    spread: 220,
    clearance: 6,
    treeTypes: ["jungle", "jungle", "palm", "palm", "round"],
    bushes: 900,
    balloons: false,
  },
};
