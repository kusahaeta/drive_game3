/**
 * シーサイドベイ
 * 砂浜のスタート → 水深 10m の海底へ潜って入り江を渡る → ヤシの小島 → もう一度海底へ潜る
 * → 岬の崖道 → 岩場のトンネル → 桟橋からジャンプして砂浜へ。
 * フォーマットの説明は src/tracks/index.js を参照。
 */
export default {
  id: "seaside-bay",
  name: "シーサイドベイ",
  description: "水深10mの海底へ潜って入り江を渡る。岬の崖道と桟橋ジャンプも。",
  laps: 3,
  roadWidth: 18,
  shoulderWidth: 5,
  // [x, 高さ, z]。1点目がスタートライン。浅瀬の区間は features の shallows で自動的に海の中へ沈む
  points: [
    [0, 2, 40],
    [0, 2, -60],
    [25, 1.5, -150],
    [95, 1.5, -200],
    [180, 1.5, -200],
    [245, 2, -150],
    [265, 2.5, -70],
    [240, 2, 10],
    [270, 1.5, 90],
    [320, 2, 160],
    [300, 6, 240],
    [220, 12, 280],
    [140, 12, 270],
    [80, 7, 225],
    [20, 3, 230],
    [-40, 2, 190],
    [-30, 2, 120],
  ],
  itemBoxRows: [0.07, 0.31, 0.55, 0.83],
  boostPads: [
    { at: 0.21, lateral: 0, width: 6 },
    { at: 0.43, lateral: -3 },
    { at: 0.906, lateral: 0, width: 6 },
  ],
  features: [
    // 入り江の海底トンネルならぬ海底道路：水深 10m まで潜って渡る
    { type: "shallows", from: 0.07, to: 0.25, depth: 10 },
    // 小島のあと、ふたたび海に潜って沖の岩場を回る
    { type: "shallows", from: 0.36, to: 0.56, depth: 10 },
    // 岬の登りカーブはバンク付き
    { type: "bank", from: 0.58, to: 0.64, angle: 10 },
    // 右側が海に落ちる岬の崖道（壁なし）
    { type: "cliff", from: 0.66, to: 0.74, side: "right" },
    // 岩場を抜けるトンネル
    { type: "tunnel", from: 0.76, to: 0.8 },
    // 桟橋の先からダッシュ板→ジャンプ台で海峡を飛び越えて砂浜へ
    { type: "ramp", at: 0.9185, length: 10, height: 2.4 },
    { type: "gap", from: 0.9255, to: 0.94 },
  ],
  theme: {
    skyTop: "#1f8ee8",
    skyBottom: "#d4f1ff",
    fog: "#d8f0fb",
    fogNear: 300,
    fogFar: 1600,
    sun: "#fff4d6",
    sunDir: [0.3, 0.75, -0.45],
    grass: ["#7cc653", "#6bb84a", "#8fd062"],
    sand: "#f0dca2",
    water: "#1fa6d6",
    waterLevel: 0,
    waterOpacity: 0.72,
    terrainBase: 2,
    hills: 7,
    mountains: 90,
    offroad: "#e6cf92",
    curbA: "#ff8a3d",
    curbB: "#ffffff",
    wallA: "#26b3c9",
    wallB: "#ffffff",
    treeLeaf: ["#3aa845", "#2f8f3a", "#4cb34f", "#5cc35a"],
    treeTrunk: "#8a5d3a",
  },
  scenery: {
    trees: 500,
    seed: 23,
    treeTypes: ["palm", "palm", "palm", "round"],
    bushes: 200,
    spread: 300,
  },
};
