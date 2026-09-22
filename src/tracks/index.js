/**
 * コース一覧。
 *
 * 新しいコースを追加する手順:
 *   1. このフォルダに `myCourse.js` を作り、下記フォーマットのオブジェクトを default export する
 *   2. このファイルで import して TRACKS に追加する
 * タイトル画面のコース選択に自動で並びます。
 *
 * フォーマット（* は必須）:
 *   id*          一意なID
 *   name*        表示名
 *   description  説明文
 *   music        BGM のファイル（例 "assets/music/circuit.mp3"）。ループ再生される
 *   laps         周回数（既定 3）
 *   roadWidth    路面の幅（既定 18）
 *   shoulderWidth 路肩（ダート）の幅。外側に壁が立つ（既定 6）
 *   points*      [x, 高さ, z] の配列。閉じたスプラインとして周回する。1点目がスタートライン。
 *                急すぎるカーブ（半径 25 未満程度）や、コース同士が 80 以内に近づく配置は避ける
 *   itemBoxRows  アイテムボックス列の位置（周回に対する割合 0〜1）
 *   boostPads    ダッシュ板 [{ at: 割合, lateral: 中心からの横位置(+が左), length, width }]
 *   features     コースの仕掛け（位置は周回に対する割合 0〜1）:
 *     { type: "ramp",   at, length: 10, height: 2.4, lateral: 0, width }  ジャンプ台（空中でドリフトボタン→トリック）
 *     { type: "gap",    from, to }                 路面が途切れた谷。手前にジャンプ台とダッシュ板を置く
 *     { type: "cliff",  from, to, side: "left" | "right" | "both" }  壁のない崖道。落ちるとコースに戻される
 *     { type: "bridge", from, to }                 谷に架かる橋（下は川になる）
 *     { type: "tunnel", from, to }                 山を貫くトンネル
 *     { type: "bank",   from, to, angle: 12 }      カーブの外側が高いバンク（向きは自動）
 *     { type: "ruins",  from, to }                 苔むした石柱・石のアーチ・脇に神殿が並ぶ遺跡
 *     { type: "ice",    from, to }                 つるつる滑る凍った路面
 *     { type: "shallows", from, to, depth: 0.4, ramp }  海に沈んだ道（海面より depth 下を走る。少し遅くなる。
 *                  depth を大きくすると完全に潜り、水中はカメラが青くかすむ。ramp は出入りの坂の長さ（既定 depth×8、最低 30）
 *   branches     分かれ道（src/branch.js 参照）。メインコースの from で分かれ、points を通って to で合流する:
 *     { from, to, points: [[x, y, z], ...], width, shoulderWidth, noWalls, elevated, itemBoxRows, boostPads, aiChance }
 *     noWalls: 壁なし（はみ出すと落ちる）, elevated: 下を谷（水・溶岩）まで掘り下げる, aiChance: NPC がこの道を選ぶ確率
 *     itemBoxRows / boostPads の位置は枝道の長さに対する割合。枝道はメインコースから 30 以上離れた所を通す
 *   hazards      邪魔してくる敵（src/hazards.js 参照。branch: 番号 で枝道の上にも置ける）:
 *     { type: "crusher", at, lateral: [-5, 0, 5], period: 3.2, stagger: 0.8 }  震えて予告してから落ちてくる石ブロック
 *     { type: "ufo",     at, count: 1, amplitude, speed: 1 }                   道の上を左右に往復する UFO（光線に当たるとスピン）
 *     { type: "meteor",  from, to, interval: 1.4 }                             赤い印で予告して降ってくる隕石
 *     { type: "snowball", from, to, count: 3, speed: 15, radius: 2.2, fire, boulder }  to から from へ転がり落ちてくる大雪玉（fire: true で大火の玉、boulder: true で大岩）
 *     { type: "firebar", at, lateral: 0, length: 7, speed: 1.6 }               道の上で水平に回る火の玉の棒（speed を負にすると逆回転）
 *   theme        色や地形の上書き（src/track.js の DEFAULT_THEME を参照。waterLevel, hills, mountains など）
 *   scenery      { trees: 木の本数, seed: 地形と木の乱数シード,
 *                  treeTypes: ["pine" | "snowpine" | "round" | "palm" | "jungle", ...]（多く書いた種類ほど増える）,
 *                  cabins: 丸太小屋の数, snowmen: 雪だるまの数,
 *                  bushes: コース脇のしげみの数, balloons: false で気球なし,
 *                  clearance: 壁から木までの最小距離（既定 14）, spread: コースの外側どこまで木を置くか（既定 350） }
 *   theme.bridgeStyle: "wood" で橋が木の吊り橋に、theme.roadCenter: false で中央線なし
 *   theme.space: true で宇宙コース（地形・木なし、星空と惑星、虹色の光る道、ネオンの柵）。scenery.rings で光の輪の数
 *   theme.light: { hemiSky, hemiGround, hemi, sun } で明るさを変える
 *   theme.underwaterFog で水中の色（既定 #0f6f9c）、theme.waterOpacity で水面の不透明度（既定 0.86。浅瀬の道を見せるなら低めに）
 *   theme.frozen: true で水面が凍った湖に、theme.snowfall: true で雪が降る
 *   theme.lava: true で水面が溶岩に（落ちるとコースに戻される）
 *   theme.castle: true で城壁風の柵（胸壁と松明）、theme.roadBricks: true で石畳、theme.wallHeight で柵の高さ
 *   theme.cloudColor で雲の色、scenery.castle: { x, z, size, rotation } で城を建てる
 *   宇宙コースでは立体交差もできる（上下の道は 15 以上離す）
 *
 * 高低差は points の 2 番目の値（高さ）で付ける。坂の頂上が急だと自然に車体が浮く。
 */
import sunnyCircuit from "./sunnyCircuit.js";
import jungleRuins from "./jungleRuins.js";
import starlightRoad from "./starlightRoad.js";
import snowPeak from "./snowPeak.js";
import magmaCastle from "./magmaCastle.js";
import seasideBay from "./seasideBay.js";

export const TRACKS = [sunnyCircuit, jungleRuins, snowPeak, magmaCastle, seasideBay, starlightRoad];
