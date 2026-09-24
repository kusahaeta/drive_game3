/**
 * マグマキャッスル
 * 溶岩の海に浮かぶ岩の道。スタート直後は火山弾が降りそそぐ。
 * 東の岩場から北を回り、北側で「壁のある回り道」と「壁のない溶岩の上の近道」に分かれる。
 * 西側で城に入る。城内は 2 本の大広間に分かれていて、外回りはクラッシャー、城側はファイアバーが待つ。
 * 南の門から外へ出て、ゴールへ。
 * フォーマットの説明は src/tracks/index.js を参照。
 */
export default {
  id: "magma-castle",
  name: "マグマキャッスル",
  music: "assets/music/castle.mp3",
  description: "溶岩に囲まれた魔王の城。後半は城の中へ。2 本に分かれた大広間でクラッシャーとファイアバーが待ち構える。",
  laps: 3,
  roadWidth: 17,
  shoulderWidth: 5,
  // [x, 高さ, z]。1点目がスタートライン。
  points: [
    [0, 5, -212],
    [138, 6, -212],
    [238, 8, -150],
    [250, 10, -37],
    [213, 12, 63],
    [263, 14, 150],
    [200, 16, 238],
    [88, 18, 238],
    [0, 18, 188],
    [-87, 16, 238],
    [-187, 15, 219],
    [-256, 14, 138],
    // ここから城内（外回りの大広間）
    [-281, 13, 50],
    [-285, 12, -37],
    [-269, 10, -125],
    // 南の門から出てゴールへ
    [-206, 7, -200],
    [-100, 5, -222],
  ],
  // 以下の位置は周回に対する割合（0〜1）
  itemBoxRows: [0.117, 0.352, 0.509, 0.63, 0.76, 0.9],
  boostPads: [
    { at: 0.098, lateral: 0, width: 6 },
    { at: 0.264, lateral: -3 },
    // 城門へ飛び込むダッシュ板
    { at: 0.685, lateral: 0 },
    { at: 0.862, lateral: 3 },
  ],
  features: [
    // 東側の溶岩に架かる石橋
    { type: "bridge", from: 0.147, to: 0.196 },
    { type: "bank", from: 0.294, to: 0.338, angle: 12 },
    // 城内（外回りの大広間）。城側の大広間は枝道 2 の castle
    { type: "castle", from: 0.695, to: 0.828 },
  ],
  // 分かれ道（from で分かれて to で合流。points は枝道が通る点）
  branches: [
    {
      // 北：溶岩の上をまっすぐ渡る細い近道。壁がないので落ちると溶岩へ
      from: 0.421,
      to: 0.593,
      points: [
        [50, 20, 278],
        [-50, 20, 278],
      ],
      width: 10,
      shoulderWidth: 1.5,
      noWalls: true,
      elevated: true,
      boostPads: [{ at: 0.3 }, { at: 0.65 }],
      aiChance: 0.4,
    },
    {
      // 西：城の手前で分かれ、城側の大広間を通る。こちらはファイアバーが回っている
      from: 0.65,
      to: 0.85,
      points: [
        [-222, 14, 110],
        [-226, 13, 40],
        [-229, 12, -40],
        [-220, 10, -105],
      ],
      width: 15,
      castle: { from: 0.25, to: 0.81 },
      itemBoxRows: [0.52],
      boostPads: [{ at: 0.2 }],
      aiChance: 0.5,
    },
  ],
  hazards: [
    // スタート直後の直線に、溶岩から火山弾が降りそそぐ（赤い印の所に落ちる）
    { type: "meteor", from: 0.024, to: 0.088, interval: 1.3 },
    // 東の登りで大火の玉が転がってくる
    { type: "snowball", fire: true, from: 0.211, to: 0.284, count: 2, speed: 13, radius: 2.2 },
    // 外回りの大広間：クラッシャーが 2 列
    { type: "crusher", at: 0.722, lateral: [-5, 0, 5], period: 3.4, stagger: 1.1 },
    { type: "crusher", at: 0.795, lateral: [-4, 4], period: 3, stagger: 1.5 },
    // 城側の大広間：ファイアバーが 2 本（逆回り）
    { type: "firebar", branch: 2, at: 0.4, length: 7, speed: 1.5 },
    { type: "firebar", branch: 2, at: 0.68, length: 7, speed: -1.7 },
    // ゴール手前にもファイアバー
    { type: "firebar", at: 0.926, lateral: 0, length: 7.5, speed: -1.3 },
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
    // 城内の大広間の屋根の上に本丸が建つ
    castle: { at: 0.76, size: 0.7 },
  },
};
