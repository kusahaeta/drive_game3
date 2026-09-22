/**
 * マグマキャッスル
 * 溶岩の海に浮かぶ岩の道。スタート直後は火山弾が降りそそぐ。
 * 中央にそびえる城のまわりを一周する。
 * 北側で「壁のある回り道」と「壁のない溶岩の上の近道」に分かれ、
 * 西側では左右 2 本に分かれて、片方はクラッシャー、片方はファイアバーが待つ。
 * フォーマットの説明は src/tracks/index.js を参照。
 */
export default {
  id: "magma-castle",
  name: "マグマキャッスル",
  music: "assets/music/castle.mp3",
  description: "溶岩に囲まれた魔王の城。分かれ道の近道は壁なし、クラッシャーとファイアバーが待ち構える。",
  laps: 3,
  roadWidth: 17,
  shoulderWidth: 5,
  // [x, 高さ, z]。1点目がスタートライン。
  points: [
    [0, 5, -170],
    [110, 6, -170],
    [190, 8, -120],
    [200, 10, -30],
    [170, 12, 50],
    [210, 14, 120],
    [160, 16, 190],
    [70, 18, 190],
    [0, 18, 150],
    [-70, 16, 190],
    [-150, 14, 170],
    [-200, 12, 90],
    [-215, 10, 10],
    [-200, 8, -80],
    [-150, 6, -160],
    [-70, 5, -175],
  ],
  // 以下の位置は周回に対する割合（0〜1）
  itemBoxRows: [0.12, 0.36, 0.52, 0.68, 0.9],
  boostPads: [
    { at: 0.1, lateral: 0, width: 6 },
    { at: 0.27, lateral: -3 },
    { at: 0.86, lateral: 3 },
  ],
  features: [
    // 東側の溶岩に架かる石橋
    { type: "bridge", from: 0.15, to: 0.2 },
    { type: "bank", from: 0.3, to: 0.345, angle: 12 },
    // ゴール手前の城門（トンネル）
    { type: "tunnel", from: 0.955, to: 0.994 },
  ],
  // 分かれ道（from で分かれて to で合流。points は枝道が通る点）
  branches: [
    {
      // 北：溶岩の上をまっすぐ渡る細い近道。壁がないので落ちると溶岩へ
      from: 0.43,
      to: 0.605,
      points: [
        [40, 20, 222],
        [-40, 20, 222],
      ],
      width: 10,
      shoulderWidth: 1.5,
      noWalls: true,
      elevated: true,
      boostPads: [{ at: 0.3 }, { at: 0.65 }],
      aiChance: 0.4,
    },
    {
      // 西：城側を回るもう 1 本の道。こちらはファイアバーが回っている
      from: 0.715,
      to: 0.81,
      points: [[-172, 11, 10]],
      width: 15,
      itemBoxRows: [0.3],
      aiChance: 0.5,
    },
  ],
  hazards: [
    // スタート直後の直線に、溶岩から火山弾が降りそそぐ（赤い印の所に落ちる）
    { type: "meteor", from: 0.025, to: 0.09, interval: 1.3 },
    // 東の登りで大火の玉が転がってくる
    { type: "snowball", fire: true, from: 0.215, to: 0.29, count: 2, speed: 13, radius: 2.2 },
    // 西の分かれ道：外回り（メイン）はクラッシャー、城側（枝道 2）はファイアバー
    { type: "crusher", at: 0.76, lateral: [-5, 0, 5], period: 3.4, stagger: 1.1 },
    { type: "firebar", branch: 2, at: 0.45, length: 7, speed: 1.5 },
    // 城門の手前にもファイアバー
    { type: "firebar", at: 0.925, lateral: 0, length: 7.5, speed: -1.3 },
  ],
  theme: {
    castle: true,
    lava: true,
    cloudColor: "#4a1c14",
    skyTop: "#1a0606",
    skyBottom: "#6a1e0c",
    fog: "#3a1208",
    fogNear: 180,
    fogFar: 1100,
    sun: "#ffb070",
    sunDir: [0.3, 0.6, -0.5],
    light: { hemiSky: "#ff9a6a", hemiGround: "#40140a", hemi: 1.3, sun: 1.8 },
    grass: ["#2b2522", "#342c28", "#241f1d"],
    sand: "#4a2416",
    rock: "#3a3330",
    snow: "#3a3330",
    waterLevel: 1,
    terrainBase: -2,
    hills: 10,
    mountains: 200,
    road: "#5a5552",
    roadLine: "rgba(0,0,0,0)",
    roadCenter: false,
    roadBricks: true,
    offroad: "#3a302b",
    curbA: "#b3261e",
    curbB: "#2a2422",
    wallA: "#6a625c",
    wallB: "#6a625c",
    wallHeight: 2,
    treeLeaf: ["#3a2a20"],
    treeTrunk: "#2a1d15",
  },
  scenery: {
    trees: 0,
    seed: 13,
    balloons: false,
    castle: { x: 0, z: 10, size: 0.85 },
  },
};
