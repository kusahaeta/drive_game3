/**
 * サンダーキャニオン（上級者向け）
 * 砂漠の台地（メサ）の上から始まる、道が細くて柵の少ないテクニカルコース。
 * 両側が切り立った尾根の S 字 → バンク付きの連続ヘアピン → 峡谷の裂け目を大ジャンプ → 落石の降る谷底の橋 →
 * 大岩が転がってくる登り → 柵のない崖っぷち → 台地を貫くトンネル → クラッシャーを抜け、ヘアピン 2 つでゴール。
 * 東側では、ヘアピンと裂け目を通らずに谷の上をまっすぐ下る、細くて壁のない近道を選べる。
 * フォーマットの説明は src/tracks/index.js を参照。
 */
export default {
  id: "thunder-canyon",
  name: "サンダーキャニオン",
  music: "assets/music/jungle.mp3",
  description: "峡谷の台地を駆ける上級者向けコース。細い道と柵のない崖、連続ヘアピン、裂け目ジャンプ。落石と大岩にも注意。",
  laps: 3,
  roadWidth: 14,
  shoulderWidth: 3,
  // [x, 高さ, z]。1点目がスタートライン。
  points: [
    [0, 30, 0],
    [0, 30, -130],
    [40, 32, -210],
    [130, 36, -230],
    // 尾根の S 字（両側が崖）
    [200, 40, -180],
    [220, 44, -100],
    // 連続ヘアピン
    [290, 46, -60],
    [350, 44, -110],
    [410, 40, -50],
    // 裂け目を飛び越えて谷へ下る
    [390, 34, 50],
    [300, 26, 90],
    [250, 20, 170],
    // 谷底の川に架かる橋
    [170, 16, 210],
    [80, 18, 180],
    // 大岩が転がってくる登り
    [20, 24, 230],
    [-60, 30, 250],
    // 柵のない崖っぷち
    [-140, 34, 200],
    [-200, 36, 120],
    // 台地を貫くトンネル
    [-200, 38, 20],
    [-140, 36, -40],
    [-90, 32, 20],
    [-60, 30, 100],
    [0, 30, 90],
  ],
  // 以下の位置は周回に対する割合（0〜1）
  itemBoxRows: [0.085, 0.345, 0.505, 0.69, 0.87],
  boostPads: [
    // 裂け目へ飛び込むダッシュ板
    { at: 0.364, lateral: 0, width: 8 },
    { at: 0.612, lateral: 3 },
    // トンネルの出口
    { at: 0.832, lateral: -2 },
    { at: 0.9, lateral: 3 },
  ],
  features: [
    // 両側が崖の細い尾根
    { type: "cliff", from: 0.2, to: 0.258, side: "both" },
    // 連続ヘアピン
    { type: "bank", from: 0.258, to: 0.286, angle: 14 },
    { type: "bank", from: 0.295, to: 0.325, angle: 16 },
    // 峡谷の裂け目をジャンプ（下り坂なので飛距離が出る）
    { type: "ramp", at: 0.372, length: 10, height: 2.6 },
    { type: "gap", from: 0.378, to: 0.386 },
    // 着地後の下りは左が崖
    { type: "cliff", from: 0.44, to: 0.48, side: "left" },
    // 谷底の川に架かる橋
    { type: "bridge", from: 0.52, to: 0.556 },
    // 右カーブの外側が崖。カーブの出口はバンク
    { type: "cliff", from: 0.668, to: 0.745, side: "left" },
    { type: "bank", from: 0.742, to: 0.772, angle: 12 },
    // 台地を貫くトンネル
    { type: "tunnel", from: 0.782, to: 0.828 },
    // 最後のヘアピン 2 つ
    { type: "bank", from: 0.914, to: 0.936, angle: 14 },
    { type: "bank", from: 0.946, to: 0.968, angle: 14 },
  ],
  // 分かれ道（from で分かれて to で合流。points は枝道が通る点）
  branches: [
    {
      // 東：ヘアピンと裂け目を通らず、谷の上を斜めに下る細い近道。壁がないので落ちると谷底へ
      from: 0.268,
      to: 0.43,
      points: [
        [318, 42, -18],
        [350, 36, 32],
      ],
      width: 9,
      shoulderWidth: 1,
      noWalls: true,
      elevated: true,
      itemBoxRows: [0.3],
      aiChance: 0.3,
    },
  ],
  hazards: [
    // 尾根の手前でクラッシャーが順番に落ちてくる
    { type: "crusher", at: 0.17, lateral: [-4, 0, 4], period: 3.2, stagger: 0.9 },
    // 近道の途中にもクラッシャー
    { type: "crusher", branch: 1, at: 0.55, lateral: [-2.5, 2.5], period: 2.8, stagger: 1.4 },
    // 谷底へ下る道に落石が降ってくる（赤い印の所に落ちる）
    { type: "meteor", from: 0.455, to: 0.51, interval: 1.2 },
    // 登り坂を大岩が転がり落ちてくる
    { type: "snowball", boulder: true, from: 0.59, to: 0.66, count: 3, speed: 13, radius: 2.3 },
    // トンネルを抜けた先のクラッシャー
    { type: "crusher", at: 0.865, lateral: [-4, 0, 4], period: 3, stagger: 1.2 },
  ],
  theme: {
    skyTop: "#2f6fc8",
    skyBottom: "#f7d9a8",
    fog: "#f0cf9c",
    fogNear: 220,
    fogFar: 1400,
    sun: "#ffe2b0",
    sunDir: [-0.4, 0.65, 0.35],
    light: { hemiSky: "#ffe6c2", hemiGround: "#8a4a2a", hemi: 1.3, sun: 2.2 },
    grass: ["#c98a52", "#b97a45", "#d5985e"],
    sand: "#e2b47a",
    rock: "#a4532f",
    snow: "#b5643a",
    water: "#3f98a8",
    waterLevel: 0,
    terrainBase: 2,
    hills: 12,
    mountains: 190,
    road: "#6b5a4e",
    roadLine: "#f4e6cc",
    offroad: "#c7925c",
    curbA: "#d6452b",
    curbB: "#f5ead6",
    wallA: "#8a4a2a",
    wallB: "#d4ad7c",
    treeLeaf: ["#6f8a3a", "#5d7a30", "#7f9a44"],
    treeTrunk: "#6b4a2a",
  },
  scenery: {
    trees: 160,
    seed: 31,
    treeTypes: ["round", "palm"],
    bushes: 260,
    spread: 260,
    balloons: false,
  },
};
