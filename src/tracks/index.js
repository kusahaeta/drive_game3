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
 *   theme        色や地形の上書き（src/track.js の DEFAULT_THEME を参照。waterLevel, hills, mountains など）
 *   scenery      { trees: 木の本数, seed: 地形と木の乱数シード }
 *
 * 高低差は points の 2 番目の値（高さ）で付ける。坂の頂上が急だと自然に車体が浮く。
 */
import sunnyCircuit from "./sunnyCircuit.js";

export const TRACKS = [sunnyCircuit];
