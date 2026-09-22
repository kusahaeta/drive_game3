/**
 * スターライトロード
 * 宇宙に浮かぶ虹色の道。立体交差の 8 の字で、柵のない区間から落ちると宇宙へ真っ逆さま。
 * クラッシャー・UFO・隕石が邪魔をしてくる。
 * フォーマットの説明は src/tracks/index.js を参照。
 */
export default {
  id: "starlight-road",
  name: "スターライトロード",
  description: "宇宙に浮かぶ虹の道。柵のない区間と、邪魔してくる敵に注意。上級者向け。",
  laps: 3,
  roadWidth: 16,
  shoulderWidth: 2,
  // [x, 高さ, z]。1点目がスタートライン。
  points: [
    [0, 40, 0],
    [0, 40, -120],
    [40, 44, -200],
    [130, 50, -210],
    [190, 56, -150],
    [180, 62, -60],
    [110, 66, -10],
    [40, 68, 40],
    [-40, 64, 60],
    [-120, 56, 20],
    [-170, 48, -60],
    [-150, 42, -150],
    [-80, 36, -180],
    [-40, 30, -100],
    [-70, 32, 0],
    [-55, 35, 85],
    [0, 39, 70],
  ],
  // 以下の位置は周回に対する割合（0〜1）
  itemBoxRows: [0.12, 0.36, 0.61, 0.8],
  boostPads: [
    { at: 0.462, lateral: 0, width: 6 },
    { at: 0.55, lateral: 3 },
    { at: 0.86, lateral: -3 },
  ],
  features: [
    // 登りながら回る大きなバンク。途中は柵なし
    { type: "bank", from: 0.12, to: 0.33, angle: 16 },
    { type: "cliff", from: 0.18, to: 0.28, side: "both" },
    // 頂上から宇宙の裂け目をジャンプ
    { type: "ramp", at: 0.47, length: 10, height: 2.4 },
    { type: "gap", from: 0.4766, to: 0.4896 },
    // 下りの柵なし区間
    { type: "cliff", from: 0.52, to: 0.6, side: "both" },
    // ヘアピンはバンク付き
    { type: "bank", from: 0.705, to: 0.745, angle: 18 },
    { type: "bank", from: 0.893, to: 0.927, angle: 18 },
    { type: "bank", from: 0.938, to: 0.967, angle: 14 },
  ],
  hazards: [
    // スタート直後の直線にクラッシャー 3 つ（順番に落ちてくる）
    { type: "crusher", at: 0.065, lateral: [-5, 0, 5], period: 3.4, stagger: 1.1 },
    // 頂上の直線を UFO が左右に往復
    { type: "ufo", at: 0.39, count: 2, speed: 0.75 },
    // 下りの後半に隕石が降ってくる
    { type: "meteor", from: 0.62, to: 0.7, interval: 1.1 },
    // 低い区間の終わりにもクラッシャー
    { type: "crusher", at: 0.83, lateral: [-4, 4], period: 3, stagger: 1.5 },
  ],
  theme: {
    space: true,
    skyTop: "#04021a",
    skyBottom: "#1c0b40",
    fog: "#0c0624",
    fogNear: 500,
    fogFar: 3000,
    sun: "#c8c0ff",
    sunDir: [0.3, 0.8, -0.4],
    light: { hemiSky: "#a898ff", hemiGround: "#3a1a60", hemi: 1.6, sun: 1.6 },
  },
  scenery: { seed: 9, rings: 14 },
};
