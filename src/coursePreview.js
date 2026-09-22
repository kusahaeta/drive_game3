/**
 * タイトル画面のコース図。Track（と枝道）のサンプル列から俯瞰図を描く。
 * 向きは HUD のミニマップと同じ（上が +z、左が +x）。
 */

const COLORS = {
  edge: "#ffffff",
  road: "#3a3f52",
  branch: "#6b5fd6",
  tunnel: "#1b1d29",
  gap: "#ff3d5a",
  ice: "#8fd8ff",
  bridge: "#b07a3e",
  cliff: "#ffb400",
  shallows: "#2fb8ff",
};

export const FEATURE_LABELS = [
  ["tunnels", "トンネル", COLORS.tunnel],
  ["bridges", "橋", COLORS.bridge],
  ["gaps", "ジャンプ", COLORS.gap],
  ["cliffs", "崖道", COLORS.cliff],
  ["ice", "凍った道", COLORS.ice],
  ["shallows", "海の中の道", COLORS.shallows],
];

export function drawCoursePreview(canvas, track) {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const w = canvas.clientWidth || canvas.width;
  const h = canvas.clientHeight || canvas.height;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  // 枝道も含めた範囲に収める
  let { minX, maxX, minZ, maxZ } = track.bounds;
  for (const b of track.branches) {
    for (let i = 0; i < b.count; i++) {
      minX = Math.min(minX, b.px[i]);
      maxX = Math.max(maxX, b.px[i]);
      minZ = Math.min(minZ, b.pz[i]);
      maxZ = Math.max(maxZ, b.pz[i]);
    }
  }
  const pad = 18;
  const scale = Math.min((w - pad * 2) / (maxX - minX), (h - pad * 2) / (maxZ - minZ));
  const ox = (w - (maxX - minX) * scale) / 2;
  const oy = (h - (maxZ - minZ) * scale) / 2;
  const toMap = (x, z) => [ox + (maxX - x) * scale, oy + (maxZ - z) * scale];
  const roadW = Math.max(5, Math.min(12, track.halfWidth * 2 * scale * 1.6));

  // path の s0 から len ぶんを線として描く（メインコースは周回で折り返す）
  const strokeRange = (path, s0, len, color, width, dash) => {
    const n = path.count;
    const i0 = Math.round(s0 / path.segLen);
    const steps = Math.max(1, Math.round(len / path.segLen));
    ctx.beginPath();
    for (let k = 0; k <= steps; k += 2) {
      let i = i0 + Math.min(k, steps);
      i = path.closed ? ((i % n) + n) % n : Math.min(Math.max(i, 0), n - 1);
      const [x, y] = toMap(path.px[i], path.pz[i]);
      if (k === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.setLineDash(dash ?? []);
    ctx.stroke();
    ctx.setLineDash([]);
  };
  const whole = (p) => (p.closed ? p.length + p.segLen : p.length);

  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  // 白いふち → 路面（枝道は色を変える）
  for (const p of track.paths) strokeRange(p, 0, whole(p), COLORS.edge, roadW + 5);
  for (const p of track.branches) strokeRange(p, 0, whole(p), COLORS.branch, roadW);
  strokeRange(track, 0, whole(track), COLORS.road, roadW);

  // コースの仕掛け
  ctx.lineCap = "butt";
  for (const f of track.shallows) strokeRange(track, f.s0, f.len, COLORS.shallows, roadW * 0.55);
  for (const f of track.ice) strokeRange(track, f.s0, f.len, COLORS.ice, roadW * 0.55);
  for (const f of track.bridges) strokeRange(track, f.s0, f.len, COLORS.bridge, roadW);
  for (const f of track.cliffs) strokeRange(track, f.s0, f.len, COLORS.cliff, roadW * 0.4, [3, 3]);
  for (const f of track.tunnels) strokeRange(track, f.s0, f.len, COLORS.tunnel, roadW + 3);
  for (const f of track.gaps) strokeRange(track, f.s0 - 4, f.len + 8, COLORS.gap, roadW + 3);

  // スタートライン（チェッカー）と進行方向の矢印
  const [sx, sy] = toMap(track.px[0], track.pz[0]);
  const ahead = Math.round(Math.min(40, track.length * 0.04) / track.segLen);
  const [ax, ay] = toMap(track.px[ahead], track.pz[ahead]);
  const ang = Math.atan2(ay - sy, ax - sx);
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(ang);
  const cw = roadW + 6;
  const cell = cw / 4;
  for (let r = 0; r < 2; r++)
    for (let c = 0; c < 4; c++) {
      ctx.fillStyle = (r + c) % 2 ? "#16182a" : "#ffffff";
      ctx.fillRect(-cell + r * cell, -cw / 2 + c * cell, cell, cell);
    }
  ctx.strokeStyle = "#16182a";
  ctx.lineWidth = 1;
  ctx.strokeRect(-cell, -cw / 2, cell * 2, cw);
  ctx.restore();

  ctx.save();
  ctx.translate(ax, ay);
  ctx.rotate(ang);
  ctx.beginPath();
  ctx.moveTo(8, 0);
  ctx.lineTo(-5, -6);
  ctx.lineTo(-5, 6);
  ctx.closePath();
  ctx.fillStyle = "#ff3d5a";
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fill();
  ctx.restore();
}

/** 全長・高低差などコース図の横に出す情報 */
export function courseStats(track) {
  let lo = Infinity, hi = -Infinity;
  for (const p of track.paths)
    for (let i = 0; i < p.count; i++) {
      lo = Math.min(lo, p.py[i]);
      hi = Math.max(hi, p.py[i]);
    }
  return {
    length: Math.round(track.length),
    climb: Math.round(hi - lo),
    branches: track.branches.length,
    features: FEATURE_LABELS.filter(([key]) => track[key]?.length),
  };
}
