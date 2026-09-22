import * as THREE from "three";
import { clamp, fbm, lerp, makeNoise2D, smoothstep } from "./utils.js";

/**
 * コースの周りの地形（ハイトマップ）を作る。
 * - コースのそばは路面の高さに合わせ、離れるほど自然な丘・遠くは山になる
 * - 橋・ギャップ・崖の区間は谷（水面より下）まで掘り下げる
 */
export function buildTerrain(track) {
  const th = track.theme;
  const noise = makeNoise2D(track.def.scenery?.seed ?? 1);
  const { minX, maxX, minZ, maxZ, cx, cz } = track.bounds;
  const size = Math.max(maxX - minX, maxZ - minZ) + 1500;
  const seg = 300;
  const n = seg + 1;
  const step = size / seg;
  const x0 = cx - size / 2;
  const z0 = cz - size / 2;
  const wo = track.wallOffset;

  // 各頂点から一番近いコースのサンプルを求める
  const dist2 = new Float32Array(n * n).fill(1e12);
  const near = new Int32Array(n * n).fill(-1);
  const nearPath = new Uint8Array(n * n);
  const R = 130;
  const rc = Math.ceil(R / step);
  // メインコースと枝道のすべてのサンプルで、各頂点に一番近い道の点を記録
  const paths = track.paths ?? [track];
  for (let pi = 0; pi < paths.length; pi++) {
    const path = paths[pi];
  for (let i = 0; i < path.count; i++) {
    const gx = Math.round((path.px[i] - x0) / step);
    const gz = Math.round((path.pz[i] - z0) / step);
    for (let dz = -rc; dz <= rc; dz++) {
      const Z = gz + dz;
      if (Z < 0 || Z >= n) continue;
      for (let dx = -rc; dx <= rc; dx++) {
        const X = gx + dx;
        if (X < 0 || X >= n) continue;
        const k = Z * n + X;
        const vx = x0 + X * step - path.px[i];
        const vz = z0 + Z * step - path.pz[i];
        const d2 = vx * vx + vz * vz;
        if (d2 < dist2[k]) {
          dist2[k] = d2;
          near[k] = i;
          nearPath[k] = pi;
        }
      }
    }
  }
  }

  // 谷の強さ（左右別）。区間の端でなめらかに
  const N = track.count;
  const blur = (src) => {
    const out = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      let s = 0;
      for (let k = -6; k <= 6; k++) s += src(((i + k) % N + N) % N);
      out[i] = s / 13;
    }
    return out;
  };
  const canyonL = blur((i) => (track.gapF[i] || track.bridgeF[i] || track.cliffL[i] ? 1 : 0));
  const canyonR = blur((i) => (track.gapF[i] || track.bridgeF[i] || track.cliffR[i] ? 1 : 0));
  const under = blur((i) => (track.gapF[i] || track.bridgeF[i] ? 1 : 0));
  // 枝道：elevated なら道の下と両側を谷に（分岐・合流の端はなめらかに）
  const branchCanyon = (b, i) => (b.canyon ? smoothstep(b.splitLen, b.splitLen + 20, i * b.segLen) * smoothstep(b.mergeLen, b.mergeLen + 20, b.length - i * b.segLen) : 0);

  const natural = (x, z, d) => {
    const far = smoothstep(90, 650, d);
    let h = th.terrainBase + fbm(noise, x / 240, z / 240, 4) * th.hills * 2;
    h += fbm(noise, x / 60 + 31, z / 60 - 17, 3) * 3;
    const ridge = 1 - Math.abs(fbm(noise, x / 420 - 9, z / 420 + 5, 4) * 2);
    h += far * far * (0.35 + 0.65 * ridge) * th.mountains;
    return h;
  };

  const heights = new Float32Array(n * n);
  const flags = new Uint8Array(n * n); // 1: コース近く（木を置かない）
  for (let Z = 0; Z < n; Z++) {
    for (let X = 0; X < n; X++) {
      const k = Z * n + X;
      const x = x0 + X * step;
      const z = z0 + Z * step;
      const i = near[k];
      let d;
      if (i >= 0) d = Math.sqrt(dist2[k]);
      else {
        // 遠い頂点は間引いたサンプルでおおよその距離を出す
        let best = Infinity;
        for (let j = 0; j < track.count; j += 8) {
          const dx = x - track.px[j];
          const dz = z - track.pz[j];
          best = Math.min(best, dx * dx + dz * dz);
        }
        d = Math.sqrt(best);
      }
      let h = natural(x, z, d);
      if (i >= 0) {
        const path = paths[nearPath[k]];
        const isMain = path === track;
        const pwo = path.wallOffset;
        const ty = path.py[i];
        const lat = (x - path.px[i]) * path.nx[i] + (z - path.pz[i]) * path.nz[i];
        const ground0 = ty - 0.7 - Math.abs(path.bank[i]) * pwo;
        const floor = Math.min(ty - 20, th.waterLevel - 4);
        const c = isMain ? (Math.abs(lat) < wo + 1 ? under[i] : lat > 0 ? canyonL[i] : canyonR[i]) : branchCanyon(path, i);
        const target = lerp(ground0, floor, c);
        const t = smoothstep(pwo + 4 + c * 20, pwo + 45 + c * 70, d);
        h = lerp(target, h, t);
        if (d < pwo + 8 && c < 0.5) h = Math.min(h, ground0);
        if (d < pwo + (track.def.scenery?.clearance ?? 14)) flags[k] = 1;
        if (path.tunnelF[i] && d < pwo + 60) flags[k] = 1;
      }
      heights[k] = h;
    }
  }

  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  geo.translate(cx, 0, cz);
  const pos = geo.attributes.position;
  for (let k = 0; k < n * n; k++) pos.setY(k, heights[k]);
  geo.computeVertexNormals();

  // 高さと傾きで色分け（砂浜・草・岩・雪）
  const colors = new Float32Array(n * n * 3);
  const c = new THREE.Color();
  const grass = th.grass.map((g) => new THREE.Color(g));
  const sand = new THREE.Color(th.sand);
  const rock = new THREE.Color(th.rock);
  const snow = new THREE.Color(th.snow);
  const nrm = geo.attributes.normal;
  for (let k = 0; k < n * n; k++) {
    const x = pos.getX(k);
    const z = pos.getZ(k);
    const h = heights[k];
    const v = (fbm(noise, x / 45, z / 45, 2) + 0.5) * grass.length;
    c.copy(grass[clamp(Math.floor(v), 0, grass.length - 1)]);
    c.lerp(sand, 1 - smoothstep(th.waterLevel + 0.6, th.waterLevel + 2.2, h));
    c.lerp(rock, smoothstep(0.82, 0.62, nrm.getY(k)));
    c.lerp(snow, smoothstep(95, 125, h) * smoothstep(0.55, 0.75, nrm.getY(k)));
    colors.set([c.r, c.g, c.b], k * 3);
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  mesh.receiveShadow = true;

  const heightAt = (x, z) => {
    const fx = clamp((x - x0) / step, 0, seg - 1e-3);
    const fz = clamp((z - z0) / step, 0, seg - 1e-3);
    const X = Math.floor(fx);
    const Z = Math.floor(fz);
    const u = fx - X;
    const w = fz - Z;
    const h = (a, b) => heights[(Z + b) * n + X + a];
    return lerp(lerp(h(0, 0), h(1, 0), u), lerp(h(0, 1), h(1, 1), u), w);
  };
  const nearTrack = (x, z) => {
    const X = clamp(Math.round((x - x0) / step), 0, seg);
    const Z = clamp(Math.round((z - z0) / step), 0, seg);
    return flags[Z * n + X] === 1;
  };

  return { mesh, heightAt, nearTrack, size, center: [cx, cz] };
}

/** 波立つ水面（法線マップをスクロール） */
export function buildWater(track, size, center) {
  const th = track.theme;
  const S = 128;
  const hgt = new Float32Array(S * S);
  const noise = makeNoise2D(99);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      // 周期的になるように円筒座標でサンプル
      const a = (x / S) * Math.PI * 2;
      const b = (y / S) * Math.PI * 2;
      hgt[y * S + x] = fbm(noise, Math.cos(a) * 2 + Math.cos(b) * 3, Math.sin(a) * 2 + Math.sin(b) * 3, 3);
    }
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = S;
  const ctx = canvas.getContext("2d");
  const img = ctx.createImageData(S, S);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const h = (xx, yy) => hgt[((yy + S) % S) * S + ((xx + S) % S)];
      const dx = (h(x + 1, y) - h(x - 1, y)) * 3;
      const dy = (h(x, y + 1) - h(x, y - 1)) * 3;
      const l = Math.hypot(dx, dy, 1);
      const o = (y * S + x) * 4;
      img.data[o] = (-dx / l * 0.5 + 0.5) * 255;
      img.data[o + 1] = (-dy / l * 0.5 + 0.5) * 255;
      img.data[o + 2] = (1 / l * 0.5 + 0.5) * 255;
      img.data[o + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
  const normalMap = new THREE.CanvasTexture(canvas);
  normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;
  normalMap.repeat.set(size / 40, size / 40);
  // theme.frozen: 凍った湖（波の代わりに氷のひび割れのような微妙な凹凸、つやあり）
  const mat = new THREE.MeshStandardMaterial({
    color: th.frozen ? "#d4ecfa" : th.water,
    roughness: th.frozen ? 0.08 : 0.12,
    metalness: 0.1,
    transparent: true,
    opacity: th.frozen ? 0.96 : 0.86,
    normalMap,
    normalScale: th.frozen ? new THREE.Vector2(0.12, 0.12) : new THREE.Vector2(0.5, 0.5),
  });
  if (th.frozen) normalMap.repeat.set(size / 120, size / 120);
  if (th.lava) {
    // 溶岩：黒っぽい表面に光る模様（emissiveMap をゆっくり流す）
    const L = document.createElement("canvas");
    L.width = L.height = 256;
    const ctx2 = L.getContext("2d");
    const n2 = makeNoise2D(7);
    const img2 = ctx2.createImageData(256, 256);
    for (let y = 0; y < 256; y++)
      for (let x = 0; x < 256; x++) {
        const a = (x / 256) * Math.PI * 2;
        const b = (y / 256) * Math.PI * 2;
        const v = fbm(n2, Math.cos(a) * 1.5 + Math.cos(b) * 2.5, Math.sin(a) * 1.5 + Math.sin(b) * 2.5, 4);
        const k = Math.max(0, Math.min(1, 0.55 + v * 1.8));
        const o = (y * 256 + x) * 4;
        img2.data[o] = 255 * Math.min(1, k * 1.2);
        img2.data[o + 1] = 255 * k * k * 0.75;
        img2.data[o + 2] = 255 * k * k * k * 0.25;
        img2.data[o + 3] = 255;
      }
    ctx2.putImageData(img2, 0, 0);
    const lavaMap = new THREE.CanvasTexture(L);
    lavaMap.colorSpace = THREE.SRGBColorSpace;
    lavaMap.wrapS = lavaMap.wrapT = THREE.RepeatWrapping;
    lavaMap.repeat.set(size / 90, size / 90);
    const lava = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshStandardMaterial({ color: 0x2a0a04, emissive: 0xffffff, emissiveMap: lavaMap, emissiveIntensity: 1.6, roughness: 0.9 }),
    );
    lava.rotation.x = -Math.PI / 2;
    lava.position.set(center[0], th.waterLevel, center[1]);
    return lava;
  }
  const water = new THREE.Mesh(new THREE.PlaneGeometry(size, size), mat);
  water.rotation.x = -Math.PI / 2;
  water.position.set(center[0], th.waterLevel, center[1]);
  water.receiveShadow = true;
  return water;
}
