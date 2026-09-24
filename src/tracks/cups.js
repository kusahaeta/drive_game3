/**
 * グランプリのカップ一覧。1 カップ = 4 レース。
 *
 * 新しいカップを追加するときは CUPS に { id, name, icon, courses } を足す。
 * courses はコースの id（src/tracks/*.js の id）を走る順に 4 つ並べる。
 */
import { TRACKS } from "./index.js";

export const CUP_RACES = 4;

const CUP_DEFS = [
  { id: "sunshine", name: "サンシャインカップ", icon: "🌻", courses: ["sunny-circuit", "seaside-bay", "jungle-ruins", "snow-peak"] },
  { id: "flame", name: "フレイムカップ", icon: "🔥", courses: ["sunny-circuit", "starlight-road", "jungle-ruins", "magma-castle"] },
  { id: "star", name: "スターカップ", icon: "⭐", courses: ["seaside-bay", "magma-castle", "snow-peak", "starlight-road"] },
  { id: "thunder", name: "サンダーカップ", icon: "⚡", courses: ["jungle-ruins", "starlight-road", "magma-castle", "thunder-canyon"] },
  { id: "ghost", name: "ゴーストカップ", icon: "👻", courses: ["snow-peak", "seaside-bay", "thunder-canyon", "haunted-mansion"] },
];

// コースの id を TRACKS の番号に置き換えておく
export const CUPS = CUP_DEFS.map((cup) => {
  const courses = cup.courses.map((id) => {
    const i = TRACKS.findIndex((t) => t.id === id);
    if (i < 0) throw new Error(`カップ ${cup.id}: コース ${id} が見つかりません`);
    return i;
  });
  if (courses.length !== CUP_RACES) throw new Error(`カップ ${cup.id}: コースは ${CUP_RACES} つにしてください`);
  return { ...cup, courses };
});
