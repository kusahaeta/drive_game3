/**
 * ホーンテッドマンション（上級者向け）
 * 満月の夜、沼地に囲まれた丘の上の洋館へ向かう、道が細くて柵の少ないコース。
 * 墓地の脇道（おばけ）→ 柵のない沼の崖っぷち → 崩れた橋を大ジャンプして木の吊り橋 → 沼べりの連続ヘアピン →
 * 雷の落ちる丘の登り → 洋館の中へ。館内は 2 本の大広間に分かれ、外回りはおばけ、中庭側は青白い人魂の棒が待つ。
 * 館を出たら墓地の坂を下ってゴール。
 * フォーマットの説明は src/tracks/index.js を参照。
 */
export default {
  id: "haunted-mansion",
  name: "ホーンテッドマンション",
  music: "assets/music/castle.mp3",
  description: "満月の夜のお化け屋敷へ向かう上級者向けコース。細い道と柵のない沼の崖、崩れた橋のジャンプ、連続ヘアピン。消えては現れるおばけに注意。",
  laps: 3,
  roadWidth: 14,
  shoulderWidth: 3,
  // [x, 高さ, z]。1点目がスタートライン。
  points: [
    [0, 10, 200],
    [120, 10, 200],
    // 墓地の脇道
    [220, 14, 170],
    [310, 16, 110],
    // 沼の崖っぷちの S 字
    [270, 18, 30],
    [230, 20, -30],
    // 崩れた橋をジャンプして沼を渡る
    [260, 14, -110],
    [200, 8, -190],
    // 沼べりの連続ヘアピン
    [120, 6, -235],
    [70, 7, -190],
    [20, 9, -235],
    // 丘を登って洋館へ
    [-90, 16, -220],
    [-170, 22, -160],
    // 洋館の中（外回りの大広間）
    [-190, 24, -70],
    [-195, 24, 20],
    [-185, 22, 100],
    // 墓地の坂を下ってゴールへ
    [-130, 14, 180],
    [-60, 10, 210],
  ],
  // 以下の位置は周回に対する割合（0〜1）
  itemBoxRows: [0.05, 0.29, 0.445, 0.6, 0.668, 0.935],
  boostPads: [
    // 崩れた橋へ飛び込むダッシュ板
    { at: 0.36, lateral: 0, width: 8 },
    // ヘアピンの出口
    { at: 0.548, lateral: -3 },
    // 館の門へ飛び込むダッシュ板
    { at: 0.684, lateral: 0 },
    { at: 0.878, lateral: 3 },
  ],
  features: [
    // 墓地を抜けた左カーブ。外側（右）は柵のない崖
    { type: "cliff", from: 0.17, to: 0.235, side: "right" },
    { type: "bank", from: 0.185, to: 0.225, angle: 12 },
    // 沼を見下ろす S 字は両側が崖
    { type: "cliff", from: 0.262, to: 0.3, side: "both" },
    // 崩れた橋：ジャンプ台から裂け目を飛び越え、木の吊り橋で沼を渡る
    { type: "ramp", at: 0.368, length: 10, height: 2.6 },
    { type: "gap", from: 0.374, to: 0.384 },
    { type: "bridge", from: 0.39, to: 0.43 },
    // 沼べりの連続ヘアピン
    { type: "bank", from: 0.463, to: 0.495, angle: 14 },
    { type: "bank", from: 0.503, to: 0.537, angle: 16 },
    // 丘の登りは左が崖
    { type: "cliff", from: 0.575, to: 0.625, side: "left" },
    // 洋館の中（外回りの大広間）。中庭側の大広間は枝道 1 の castle
    { type: "castle", from: 0.73, to: 0.865 },
    // 館を出た右カーブ
    { type: "bank", from: 0.868, to: 0.895, angle: 12 },
  ],
  // 分かれ道（from で分かれて to で合流。points は枝道が通る点）
  branches: [
    {
      // 西：館の手前で分かれ、中庭側の大広間を通る。こちらは青白い人魂の棒が回っている
      from: 0.69,
      to: 0.915,
      points: [
        [-245, 24, -110],
        [-255, 24, -20],
        [-248, 23, 60],
        [-205, 19, 160],
      ],
      width: 13,
      shoulderWidth: 2,
      castle: { from: 0.2, to: 0.78 },
      itemBoxRows: [0.5],
      boostPads: [{ at: 0.12 }],
      aiChance: 0.5,
    },
  ],
  hazards: [
    // 墓地の脇道におばけ 2 匹（透けている間は当たらない。はっきり見えたら要注意）
    { type: "ghost", from: 0.07, to: 0.17, count: 2, speed: 8 },
    // 丘の登りは雷雲が雷を落とす
    { type: "lightning", from: 0.56, to: 0.66, count: 2, interval: 2.4 },
    // 外回りの大広間：おばけ 2 匹
    { type: "ghost", from: 0.74, to: 0.855, count: 2, speed: 8 },
    // 中庭側の大広間：青白い人魂の棒が 2 本（逆回り）
    { type: "firebar", branch: 1, at: 0.4, length: 6, speed: 1.6, color: 0x5ad8ff },
    { type: "firebar", branch: 1, at: 0.64, length: 6, speed: -1.8, color: 0x5ad8ff },
    // ゴール前の坂にもおばけ
    { type: "ghost", from: 0.92, to: 0.985, count: 1, speed: 8 },
  ],
  theme: {
    haunted: true,
    castle: true,
    bridgeStyle: "wood",
    cloudColor: "#3a3058",
    skyTop: "#070414",
    skyBottom: "#3a2a5c",
    fog: "#231a38",
    fogNear: 140,
    fogFar: 950,
    // 月明かり
    sun: "#dfe6ff",
    sunDir: [-0.35, 0.42, -0.6],
    light: { hemiSky: "#8a80c0", hemiGround: "#1a1428", hemi: 1.05, sun: 1.3 },
    grass: ["#2c3628", "#253020", "#323c2c"],
    sand: "#4a4234",
    rock: "#4a4552",
    snow: "#4a4552",
    water: "#1f3a2c",
    waterOpacity: 0.94,
    waterLevel: 0,
    terrainBase: 1,
    hills: 10,
    mountains: 170,
    road: "#4a4652",
    roadLine: "rgba(0,0,0,0)",
    roadCenter: false,
    roadBricks: true,
    offroad: "#3a3428",
    curbA: "#5a2a7a",
    curbB: "#1c1824",
    wallA: "#4a4458",
    wallB: "#4a4458",
    wallHeight: 2,
    treeLeaf: ["#2a3a24", "#34402a"],
    treeTrunk: "#3a302c",
  },
  scenery: {
    trees: 240,
    seed: 44,
    treeTypes: ["dead", "dead", "dead", "pine"],
    bushes: 120,
    graves: 90,
    pumpkins: 28,
    spread: 300,
    balloons: false,
    // 大広間の屋根の上に洋館の本館が建つ
    castle: { at: 0.8, size: 0.7 },
  },
};
