import * as THREE from "three";
import { buildTerrain, buildWater } from "./terrain.js";
import { lerp, mulberry32 } from "./utils.js";

function canvasTexture(w, h, draw, repeat = true) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d"), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

function speckle(ctx, w, h, count, colors, size = 2) {
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[i % colors.length];
    ctx.fillRect(Math.random() * w, Math.random() * h, size, size);
  }
}

const lambert = (opts) => new THREE.MeshLambertMaterial({ side: THREE.DoubleSide, ...opts });

/** コース（track）の見た目をすべて組み立てて Group で返す */
export function buildTrackScene(track) {
  const g = new THREE.Group();
  const th = track.theme;
  const tex = makeTextures(th);
  track.sunDir = new THREE.Vector3(...th.sunDir).normalize();

  g.add(buildSky(track));
  if (th.space) {
    // 宇宙コース：地形・水・木の代わりに星空と惑星
    buildRoad(track, g, tex);
    for (const b of track.branches) buildRoad(b, g, tex, 0.03);
    buildRamps(track, g);
    buildStart(track, g);
    buildBoostPads(track, g);
    buildSpace(track, g);
    return g;
  }
  const terrain = buildTerrain(track);
  track.terrain = terrain;
  g.add(terrain.mesh);
  track.water = buildWater(track, terrain.size, terrain.center);
  g.add(track.water);

  buildRoad(track, g, tex);
  for (const b of track.branches) buildRoad(b, g, tex, 0.03);
  buildBridges(track, g, tex);
  buildGapFaces(track, g, tex);
  buildRamps(track, g);
  buildTunnels(track, g, tex);
  for (const path of track.paths) buildCastleHalls(path, g);
  buildStart(track, g);
  buildBoostPads(track, g);
  buildSigns(track, g);
  buildGrandstand(track, g);
  buildRuins(track, g, tex, terrain);
  buildNature(track, g, terrain);
  buildWinter(track, g, terrain);
  buildCastle(track, g, terrain);
  buildSkyObjects(track, g);
  return g;
}

function makeTextures(th) {
  return {
    road: canvasTexture(512, 512, (ctx, w, h) => {
      ctx.fillStyle = th.road;
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 40; i++) {
        ctx.fillStyle = `rgba(${i % 2 ? "0,0,0" : "255,255,255"},0.035)`;
        ctx.beginPath();
        ctx.ellipse(Math.random() * w, Math.random() * h, 20 + Math.random() * 60, 30 + Math.random() * 90, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      speckle(ctx, w, h, 9000, ["rgba(255,255,255,0.07)", "rgba(0,0,0,0.14)", "rgba(120,120,130,0.2)"]);
      if (th.roadBricks) drawBricks(ctx, w, h, 64, 32);
      ctx.fillStyle = th.roadLine;
      ctx.fillRect(14, 0, 12, h);
      ctx.fillRect(w - 26, 0, 12, h);
      if (th.roadCenter !== false) {
        ctx.fillStyle = "rgba(255,255,255,0.55)";
        ctx.fillRect(w / 2 - 4, 0, 8, h * 0.4);
      }
    }),
    dirt: canvasTexture(128, 128, (ctx, w, h) => {
      ctx.fillStyle = th.offroad;
      ctx.fillRect(0, 0, w, h);
      speckle(ctx, w, h, 1600, ["rgba(255,255,255,0.12)", "rgba(60,30,0,0.18)", "rgba(80,140,50,0.25)"], 3);
    }),
    curb: canvasTexture(16, 64, (ctx, w, h) => {
      ctx.fillStyle = th.curbA;
      ctx.fillRect(0, 0, w, h / 2);
      ctx.fillStyle = th.curbB;
      ctx.fillRect(0, h / 2, w, h / 2);
      ctx.fillStyle = "rgba(0,0,0,0.12)";
      ctx.fillRect(0, 0, 3, h);
    }),
    wall: canvasTexture(64, 64, (ctx, w, h) => {
      if (th.castle) {
        // 城壁：石積み
        ctx.fillStyle = th.wallA;
        ctx.fillRect(0, 0, w, h);
        speckle(ctx, w, h, 300, ["rgba(0,0,0,0.15)", "rgba(255,255,255,0.08)"], 2);
        drawBricks(ctx, w, h, 32, 16);
        return;
      }
      ctx.fillStyle = th.wallA;
      ctx.fillRect(0, 0, w, h / 2);
      ctx.fillStyle = th.wallB;
      ctx.fillRect(0, h / 2, w, h / 2);
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.fillRect(0, 0, 6, h);
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.fillRect(w - 8, 0, 8, h);
    }),
    rail: canvasTexture(64, 64, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "#d8dde6";
      ctx.fillRect(0, 0, 12, h);
      ctx.fillRect(28, 0, 8, h);
      ctx.fillStyle = "#e0463c";
      ctx.fillRect(0, 0, w, 10);
      ctx.fillRect(0, h - 6, w, 6);
    }),
    rock: canvasTexture(128, 128, (ctx, w, h) => {
      ctx.fillStyle = th.rock;
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 60; i++) {
        ctx.fillStyle = `rgba(${i % 3 ? "0,0,0" : "255,255,255"},${0.05 + Math.random() * 0.08})`;
        ctx.fillRect(Math.random() * w, Math.random() * h, 10 + Math.random() * 40, 4 + Math.random() * 10);
      }
      speckle(ctx, w, h, 900, ["rgba(0,0,0,0.15)", "rgba(255,255,255,0.1)"], 3);
    }),
    wood: canvasTexture(128, 128, (ctx, w, h) => {
      for (let y = 0; y < h; y += 16) {
        ctx.fillStyle = ["#8a5a32", "#7a4e2a", "#946438"][(y / 16) % 3];
        ctx.fillRect(0, y, w, 16);
        ctx.fillStyle = "rgba(0,0,0,0.35)";
        ctx.fillRect(0, y + 14, w, 2);
      }
      speckle(ctx, w, h, 700, ["rgba(0,0,0,0.12)", "rgba(255,220,160,0.1)"], 2);
    }),
    rope: canvasTexture(64, 64, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "#6b4526";
      ctx.fillRect(0, 0, 10, h);
      ctx.fillStyle = "#c9a36a";
      ctx.fillRect(0, 2, w, 5);
      ctx.fillRect(0, 30, w, 4);
      ctx.fillStyle = "rgba(201,163,106,0.9)";
      for (let x = 14; x < w; x += 12) ctx.fillRect(x, 6, 2, 26);
    }),
    stone: canvasTexture(128, 128, (ctx, w, h) => {
      ctx.fillStyle = "#9a9788";
      ctx.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 32) {
        for (let x = (y / 32) % 2 ? -32 : 0; x < w; x += 64) {
          ctx.fillStyle = `rgba(${Math.random() < 0.5 ? "255,255,255" : "0,0,0"},${0.05 + Math.random() * 0.08})`;
          ctx.fillRect(x + 2, y + 2, 60, 28);
        }
        ctx.fillStyle = "rgba(40,40,30,0.45)";
        ctx.fillRect(0, y, w, 2);
      }
      for (let i = 0; i < 26; i++) {
        const x = Math.random() * w;
        const y = Math.random() * h;
        const r = 6 + Math.random() * 18;
        ctx.fillStyle = `rgba(70,120,40,${0.3 + Math.random() * 0.35})`;
        ctx.beginPath();
        ctx.ellipse(x, y, r, r * 0.6, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }),
    concrete: canvasTexture(64, 64, (ctx, w, h) => {
      ctx.fillStyle = "#cfc9bd";
      ctx.fillRect(0, 0, w, h);
      speckle(ctx, w, h, 500, ["rgba(0,0,0,0.1)", "rgba(255,255,255,0.15)"]);
      ctx.fillStyle = "#e5a93a";
      ctx.fillRect(0, h * 0.45, w, 5);
    }),
  };
}

/** 石畳・石積みの目地を描く（1 段ごとに半分ずらす） */
function drawBricks(ctx, w, h, bw, bh) {
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  for (let y = 0; y < h; y += bh) {
    ctx.fillRect(0, y, w, 2);
    const shift = (y / bh) % 2 ? bw / 2 : 0;
    for (let x = shift; x < w + bw; x += bw) ctx.fillRect(x % w, y, 2, bh);
  }
  for (let y = 0; y < h; y += bh) {
    for (let x = 0; x < w; x += bw) {
      ctx.fillStyle = `rgba(${Math.random() < 0.5 ? "255,255,255" : "0,0,0"},${Math.random() * 0.08})`;
      ctx.fillRect(x + ((y / bh) % 2 ? bw / 2 : 0) + 2, y + 2, bw - 4, bh - 4);
    }
  }
}

/**
 * 城壁の上の凸凹（胸壁）と、壁の上で燃える松明（theme.castle のとき）
 */
function buildBattlements(path, g, tex, surf, wallAt, wallH) {
  const main = path.main ?? path;
  const wo = path.wallOffset;
  const spots = [];
  const torches = [];
  for (const side of [1, -1]) {
    let n = 0;
    for (let s = 1.5; s < path.length - 1.5; s += 3.2, n++) {
      const i = Math.floor(s / path.segLen) % path.count;
      if (path.gapF[i] || path.bridgeF[i] || path.tunnelF[i] || !wallAt(i, side)) continue;
      const p = path.pointAt(s, side * wo, {});
      const top = surf(wallH)(i, side * wo);
      spots.push([p.x, top + 0.45, p.z, p.heading]);
      if (n % 8 === (side > 0 ? 0 : 4)) torches.push([p.x, top, p.z]);
    }
  }
  const merlon = new THREE.InstancedMesh(new THREE.BoxGeometry(1.1, 0.9, 1.6), new THREE.MeshLambertMaterial({ map: tex.wall }), spots.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const one = new THREE.Vector3(1, 1, 1);
  spots.forEach(([x, y, z, h], k) => {
    q.setFromAxisAngle(up, h);
    merlon.setMatrixAt(k, m.compose(new THREE.Vector3(x, y, z), q, one));
  });
  merlon.castShadow = merlon.receiveShadow = true;
  g.add(merlon);

  // 松明：木の柄と、光る炎（ブルームで光る）
  const stick = new THREE.MeshLambertMaterial({ color: 0x4a3222 });
  const flameMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff9a2a).multiplyScalar(3.5) });
  main.torches ??= [];
  for (const [x, y, z] of torches) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 1.4, 6), stick);
    post.position.set(x, y + 0.7, z);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.0, 8), flameMat);
    flame.position.set(x, y + 1.8, z);
    g.add(post, flame);
    main.torches.push(flame);
  }
}

/**
 * 城（scenery.castle: { x, z, size }）。石の城壁・4 本の塔・赤い屋根・光る窓。
 * x, z の代わりに at（周回に対する割合）を書くと、城内（features の castle）の屋根の上に本丸が建つ。
 */
function buildCastle(track, g, terrain) {
  const c = track.def.scenery?.castle;
  if (!c) return;
  const size = c.size ?? 1;
  const root = new THREE.Group();
  const onHall = c.at != null;
  if (onHall) {
    // 大広間の屋根に土台の上面（高さ 14）が来るように置く
    const p = track.pointAt(c.at * track.length, 0, {});
    root.position.set(p.x, p.y + HALL.roof - 14 * size, p.z);
    root.rotation.y = p.heading + (c.rotation ?? 0);
  } else {
    const ground = terrain ? terrain.heightAt(c.x, c.z) : 0;
    root.position.set(c.x, ground - 2, c.z);
    root.rotation.y = c.rotation ?? 0;
  }
  root.scale.setScalar(size);
  g.add(root);

  const stoneTex = stoneTexture();
  const stone = (rx, ry) => {
    const t = stoneTex.clone();
    t.needsUpdate = true;
    t.repeat.set(rx, ry);
    return new THREE.MeshLambertMaterial({ map: t });
  };
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x8a1a1a });
  const winMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffa23a).multiplyScalar(2.5) });
  const add = (mesh, x, y, z) => {
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    root.add(mesh);
    return mesh;
  };

  // 土台と本丸
  if (!onHall) add(new THREE.Mesh(new THREE.CylinderGeometry(70, 80, 14, 8), stone(12, 2)), 0, 7, 0);
  add(new THREE.Mesh(new THREE.BoxGeometry(56, 40, 56), stone(8, 6)), 0, 34, 0);
  for (let k = 0; k < 4; k++) {
    // 本丸の上の胸壁
    for (let j = -3; j <= 3; j++) {
      const a = (k * Math.PI) / 2;
      const x = Math.cos(a) * 27 - Math.sin(a) * j * 8;
      const z = Math.sin(a) * 27 + Math.cos(a) * j * 8;
      add(new THREE.Mesh(new THREE.BoxGeometry(4, 4, 4), stone(1, 1)), x, 56, z);
    }
  }
  // 4 本の塔
  for (const [x, z] of [[-32, -32], [32, -32], [-32, 32], [32, 32]]) {
    add(new THREE.Mesh(new THREE.CylinderGeometry(9, 10, 62, 16), stone(6, 8)), x, 45, z);
    add(new THREE.Mesh(new THREE.ConeGeometry(12, 22, 16), roofMat), x, 87, z);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + 0.4;
      const win = add(new THREE.Mesh(new THREE.PlaneGeometry(2.2, 3.6), winMat), x + Math.cos(a) * 9.6, 58, z + Math.sin(a) * 9.6);
      win.rotation.y = Math.PI / 2 - a;
    }
  }
  // 中央の高い天守と旗
  add(new THREE.Mesh(new THREE.CylinderGeometry(11, 12, 40, 16), stone(6, 5)), 0, 74, 0);
  add(new THREE.Mesh(new THREE.ConeGeometry(15, 28, 16), roofMat), 0, 108, 0);
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 14), new THREE.MeshLambertMaterial({ color: 0x333333 })), 0, 128, 0);
  const flag = add(new THREE.Mesh(new THREE.PlaneGeometry(9, 5), new THREE.MeshLambertMaterial({ color: 0xe6a21a, side: THREE.DoubleSide })), 4.5, 132, 0);
  flag.castShadow = false;
  // 正面の門と窓
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2;
    const gate = add(new THREE.Mesh(new THREE.PlaneGeometry(12, 16), new THREE.MeshBasicMaterial({ color: 0x1a0c08 })), Math.sin(a) * 28.1, 22, Math.cos(a) * 28.1);
    gate.rotation.y = a;
    for (const dx of [-14, 14]) {
      const win = add(new THREE.Mesh(new THREE.PlaneGeometry(3, 5), winMat), Math.sin(a) * 28.1 + Math.cos(a) * dx, 40, Math.cos(a) * 28.1 - Math.sin(a) * dx);
      win.rotation.y = a;
    }
  }
}

function buildSky(track) {
  const th = track.theme;
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color(th.skyTop) },
      bottom: { value: new THREE.Color(th.skyBottom) },
      sunColor: { value: new THREE.Color(th.sun) },
      sunDir: { value: track.sunDir },
      sunGlow: { value: th.space ? 0 : 1 },
    },
    vertexShader: `varying vec3 vDir;
      void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 top; uniform vec3 bottom; uniform vec3 sunColor; uniform vec3 sunDir; uniform float sunGlow; varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        vec3 col = mix(bottom, top, smoothstep(-0.02, 0.55, d.y));
        float s = max(dot(d, sunDir), 0.0);
        col += sunColor * (pow(s, 900.0) * 6.0 + pow(s, 24.0) * 0.35 + pow(s, 4.0) * 0.08) * sunGlow;
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(2000, 32, 16), mat);
  sky.renderOrder = -1;
  sky.frustumCulled = false;
  track.sky = sky;
  return sky;
}

/**
 * コース中心線に沿った帯メッシュ。
 * offL/offR: 横位置（offL > offR）、yL/yR: (サンプル番号, 横位置) → 高さ、include: そのサンプルを描くか
 */
function ribbon(track, offL, offR, yL, yR, vScale, material, include = () => true) {
  const N = track.count;
  // 閉じたコースは最後に始点へ戻る 1 列を足す。枝道（開いた道）はそのまま
  const rows = track.closed ? N + 1 : N;
  const pos = new Float32Array(rows * 6);
  const uv = new Float32Array(rows * 4);
  const index = [];
  for (let r = 0; r < rows; r++) {
    const i = r % N;
    const v = (r * track.segLen) / vScale;
    const oL = typeof offL === "function" ? offL(i) : offL;
    const oR = typeof offR === "function" ? offR(i) : offR;
    pos.set([track.px[i] + track.nx[i] * oL, yL(i, oL), track.pz[i] + track.nz[i] * oL], r * 6);
    pos.set([track.px[i] + track.nx[i] * oR, yR(i, oR), track.pz[i] + track.nz[i] * oR], r * 6 + 3);
    uv.set([0, v, 1, v], r * 4);
    if (r < rows - 1 && include(i) && include((i + 1) % N)) {
      const a = r * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geo.setIndex(index);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, material);
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * 道・路肩・縁石・壁を描く。track にはメインコースか枝道（Branch）を渡す。
 * lift は枝道とメインコースが重なる所でちらつかないよう少し持ち上げる量。
 */
function buildRoad(track, g, tex, lift = 0) {
  const hw = track.halfWidth;
  const wo = track.wallOffset;
  const surf = (d) => (i, off) => track.py[i] + track.bank[i] * off + d + lift;
  const noGap = (i) => !track.gapF[i];
  const wallAt = (i, side) => track.wallAt(i * track.segLen, side);

  // カーブの区間だけ縁石を置く
  const N = track.count;
  const curvy = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (Math.abs(track.turnAngle(i * track.segLen - 10, 20)) > 0.22) {
      for (let k = -8; k <= 8; k++) curvy[(i + k + N) % N] = 1;
    }
  }

  const th = track.theme ?? track.main.theme;
  if (th.space) {
    buildRainbowRoad(track, g, surf, noGap, wallAt);
    return;
  }
  g.add(ribbon(track, wo, -wo, surf(0), surf(0), 14, lambert({ map: tex.dirt }), noGap));
  const road = ribbon(track, hw, -hw, surf(0.05), surf(0.05), 22, lambert({ map: tex.road }), noGap);
  g.add(road);
  // 凍った路面：道の上に青白く光る氷を重ねる
  if (track.ice?.length) {
    const iceTex = canvasTexture(256, 256, (ctx, w, h) => {
      ctx.fillStyle = "#bfe3ff";
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "rgba(255,255,255,0.8)";
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 40; i++) {
        let x = Math.random() * w;
        let y = Math.random() * h;
        ctx.beginPath();
        ctx.moveTo(x, y);
        for (let k = 0; k < 4; k++) {
          x += (Math.random() - 0.5) * 60;
          y += (Math.random() - 0.5) * 60;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
    });
    const iceMat = new THREE.MeshStandardMaterial({ map: iceTex, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.82, side: THREE.DoubleSide });
    const iceIdx = new Uint8Array(N);
    for (let i = 0; i < N; i++) iceIdx[i] = track.inAny(track.ice, i * track.segLen) ? 1 : 0;
    const ice = ribbon(track, hw, -hw, surf(0.09), surf(0.09), 18, iceMat, (i) => noGap(i) && iceIdx[i]);
    g.add(ice);
  }
  const curbMat = lambert({ map: tex.curb });
  const curbOk = (i) => noGap(i) && curvy[i];
  g.add(ribbon(track, hw + 1.6, hw - 0.4, surf(0.1), surf(0.1), 4, curbMat, curbOk));
  g.add(ribbon(track, -hw + 0.4, -hw - 1.6, surf(0.1), surf(0.1), 4, curbMat, curbOk));

  // 壁（橋の上は手すり、崖側・分岐の合流側は無し）
  const wallMat = lambert({ map: tex.wall });
  const wallH = th.wallHeight ?? 1.3;
  const wood = th.bridgeStyle === "wood";
  const railMat = lambert({ map: wood ? tex.rope : tex.rail, transparent: true, alphaTest: 0.5 });
  for (const side of [1, -1]) {
    const off = wo * side;
    const wall = ribbon(track, off, off, surf(wallH), surf(-0.4), 8, wallMat, (i) => noGap(i) && wallAt(i, side) && !track.bridgeF[i]);
    wall.castShadow = true;
    g.add(wall);
    g.add(ribbon(track, off, off, surf(1.2), surf(0), 3, railMat, (i) => track.bridgeF[i] && wallAt(i, side)));
    // 路肩の側面（谷や崖の区間で岩肌として見える）
    const skirt = ribbon(track, off, off, surf(0), (i) => track.py[i] - 45, 12, lambert({ map: tex.rock }), (i) => noGap(i) && !track.bridgeF[i]);
    g.add(skirt);
  }
  if (th.castle) buildBattlements(track, g, tex, surf, wallAt, wallH);
  if (!track.main) track.roadMesh = road;
}

/** 光る虹色の道とネオンのレール（宇宙コース） */
function buildRainbowRoad(track, g, surf, noGap, wallAt) {
  const hw = track.halfWidth;
  const wo = track.wallOffset;
  const rainbow = canvasTexture(128, 512, (ctx, w, h) => {
    for (let y = 0; y < h; y++) {
      ctx.fillStyle = `hsl(${(y / h) * 360}, 95%, 62%)`;
      ctx.fillRect(0, y, w, 1);
    }
    for (let y = 0; y < h; y += 32) {
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      ctx.fillRect(0, y, w, 2);
    }
    const edge = ctx.createLinearGradient(0, 0, w, 0);
    edge.addColorStop(0, "rgba(255,255,255,0.95)");
    edge.addColorStop(0.07, "rgba(255,255,255,0)");
    edge.addColorStop(0.93, "rgba(255,255,255,0)");
    edge.addColorStop(1, "rgba(255,255,255,0.95)");
    ctx.fillStyle = edge;
    ctx.fillRect(0, 0, w, h);
  });
  const main = track.main ?? track;
  main.scrolling = [...(main.scrolling ?? []), { tex: rainbow, speed: 0.05 }];
  const roadMat = new THREE.MeshLambertMaterial({
    map: rainbow,
    emissiveMap: rainbow,
    emissive: 0xffffff,
    emissiveIntensity: 0.45,
    transparent: true,
    opacity: 0.9,
    side: THREE.DoubleSide,
  });
  const road = ribbon(track, wo, -wo, surf(0.05), surf(0.05), 36, roadMat, noGap);
  g.add(road);
  // 裏側（下から見たときの厚み）
  g.add(ribbon(track, wo, -wo, surf(-0.4), surf(-0.4), 20, new THREE.MeshBasicMaterial({ color: 0x1b0f3a, transparent: true, opacity: 0.8, side: THREE.DoubleSide }), noGap));

  const neon = canvasTexture(16, 64, (ctx, w, h) => {
    const grd = ctx.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, "rgba(255,255,255,1)");
    grd.addColorStop(0.2, "rgba(140,220,255,0.9)");
    grd.addColorStop(1, "rgba(120,60,255,0)");
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, w, h);
  });
  neon.wrapS = neon.wrapT = THREE.ClampToEdgeWrapping;
  const railMat = new THREE.MeshBasicMaterial({ map: neon, color: new THREE.Color(1.6, 1.6, 2.2), transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
  for (const side of [1, -1]) {
    // ribbon の v はコース方向なので、高さ方向のグラデーションは u を使う（左→右 = 上→下）
    const rail = ribbon(track, wo * side, wo * side, surf(1.4), surf(0), 1e9, railMat, (i) => noGap(i) && wallAt(i, side));
    const uv = rail.geometry.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, 0.5, k % 2 === 0 ? 1 : 0);
    g.add(rail);
  }
}

function buildBridges(track, g, tex) {
  const wo = track.wallOffset;
  const hw = track.halfWidth;
  const wood = track.theme.bridgeStyle === "wood";
  const deck = lambert({ map: wood ? tex.wood : tex.concrete });
  const bridgeOk = (i) => track.bridgeF[i];
  if (wood) {
    // 木の吊り橋：路面の上に板を敷く
    const planks = lambert({ map: tex.wood });
    g.add(ribbon(track, wo, -wo, (i, o) => track.py[i] + track.bank[i] * o + 0.12, (i, o) => track.py[i] + track.bank[i] * o + 0.12, 3, planks, bridgeOk));
  }
  g.add(ribbon(track, wo, -wo, (i, o) => track.py[i] + track.bank[i] * o - 1.6, (i, o) => track.py[i] + track.bank[i] * o - 1.6, 10, deck, bridgeOk));
  for (const side of [1, -1]) {
    const off = wo * side;
    g.add(ribbon(track, off, off, (i) => track.py[i] + track.bank[i] * off, (i) => track.py[i] + track.bank[i] * off - 1.6, 10, deck, bridgeOk));
  }
  const pillarMat = new THREE.MeshLambertMaterial(wood ? { color: 0x6b4526 } : { map: tex.concrete });
  const p = {};
  for (const b of track.bridges) {
    for (let d = 8; d < b.len - 4; d += 16) {
      for (const lat of [hw - 1, -hw + 1]) {
        track.pointAt(b.s0 + d, lat, p);
        const h = p.y + 40;
        const pillar = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.5, h, 10), pillarMat);
        pillar.position.set(p.x, p.y - 1.6 - h / 2, p.z);
        pillar.castShadow = true;
        g.add(pillar);
      }
    }
  }
}

/** ギャップの両端の断面（崖の切り口） */
function buildGapFaces(track, g, tex) {
  const wo = track.wallOffset;
  const mat = lambert({ map: tex.rock });
  const p = {};
  for (const gap of track.gaps) {
    for (const s of [gap.s0, gap.s0 + gap.len]) {
      track.pointAt(s, 0, p);
      const face = new THREE.Mesh(new THREE.PlaneGeometry(wo * 2, 45), mat);
      face.position.set(p.x, p.y - 22.5, p.z);
      face.rotation.y = p.heading;
      g.add(face);
      // 端に黄色と黒の警告ライン
      const stripe = canvasTexture(128, 16, (ctx, w, h) => {
        for (let x = 0; x < w; x += 16) {
          ctx.fillStyle = (x / 16) % 2 ? "#111" : "#ffd23f";
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x + 16, 0);
          ctx.lineTo(x + 8, h);
          ctx.lineTo(x - 8, h);
          ctx.fill();
        }
      });
      stripe.repeat.set(4, 1);
      const line = new THREE.Mesh(new THREE.PlaneGeometry(wo * 2, 1.2), new THREE.MeshLambertMaterial({ map: stripe }));
      line.position.set(p.x, p.y - 0.6, p.z);
      line.rotation.y = p.heading + (s === gap.s0 ? Math.PI : 0);
      g.add(line);
    }
  }
}

function buildRamps(track, g) {
  const tex = canvasTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = "#3a86ff";
    ctx.fillRect(0, 0, w, h);
    for (const x of [0, w - 14]) {
      for (let y = 0; y < h; y += 32) {
        ctx.fillStyle = "#ffd23f";
        ctx.fillRect(x, y, 14, 16);
        ctx.fillStyle = "#2b2d42";
        ctx.fillRect(x, y + 16, 14, 16);
      }
    }
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 14;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(30, 88);
    ctx.lineTo(64, 44);
    ctx.lineTo(98, 88);
    ctx.stroke();
  });
  const topMat = new THREE.MeshLambertMaterial({ map: tex });
  const sideMat = new THREE.MeshLambertMaterial({ color: 0xff8c42 });
  for (const r of track.ramps) {
    const steps = Math.ceil(r.len);
    const top = [];
    const uvs = [];
    const idx = [];
    const side = [];
    const p = {};
    for (let k = 0; k <= steps; k++) {
      const d = (k / steps) * r.len;
      const h = r.height * Math.pow(d / r.len, 1.5) + 0.06;
      for (const lat of [r.lateral + r.width / 2, r.lateral - r.width / 2]) {
        track.pointAt(r.s0 + d, lat, p);
        const base = p.y + p.bank * lat;
        top.push(p.x, base + h, p.z);
        side.push([p.x, base, p.z, base + h]);
      }
      uvs.push(0, d / 5, 1, d / 5);
      if (k < steps) {
        const a = k * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(top, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, topMat);
    mesh.castShadow = mesh.receiveShadow = true;
    g.add(mesh);

    // 側面と先端の壁
    const sp = [];
    const sideTri = (a, b) => {
      sp.push(a[0], a[1], a[2], b[0], b[1], b[2], b[0], b[3], b[2]);
      sp.push(a[0], a[1], a[2], b[0], b[3], b[2], a[0], a[3], a[2]);
    };
    for (let k = 0; k < steps; k++) {
      sideTri(side[k * 2], side[k * 2 + 2]);
      sideTri(side[k * 2 + 1], side[k * 2 + 3]);
    }
    sideTri(side[steps * 2], side[steps * 2 + 1]);
    const sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.Float32BufferAttribute(sp, 3));
    sg.computeVertexNormals();
    const sm = new THREE.Mesh(sg, sideMat);
    sm.material.side = THREE.DoubleSide;
    g.add(sm);
  }
}

/**
 * コースに沿って断面 profile（[横位置, 高さ] の列）を押し出したメッシュ。
 * uLen を渡すと断面方向のテクスチャを長さ uLen ごとに繰り返す（省略時は断面全体で 4 回）。
 */
function extrudeAlong(track, profile, s0, len, mat, uLen) {
  const steps = Math.ceil(len / 2);
  const pos = [];
  const uv = [];
  const idx = [];
  const m = profile.length;
  const cum = [0];
  for (let j = 1; j < m; j++) cum.push(cum[j - 1] + Math.hypot(profile[j][0] - profile[j - 1][0], profile[j][1] - profile[j - 1][1]));
  const p = {};
  for (let k = 0; k <= steps; k++) {
    const s = s0 + (k / steps) * len;
    track.pointAt(s, 0, p);
    const nx = Math.cos(p.heading);
    const nz = -Math.sin(p.heading);
    profile.forEach(([lat, h], j) => {
      pos.push(p.x + nx * lat, p.y + h, p.z + nz * lat);
      uv.push(uLen ? cum[j] / uLen : (j / (m - 1)) * 4, (s - s0) / (uLen ?? 8));
    });
    if (k < steps) {
      for (let j = 0; j < m - 1; j++) {
        const a = k * m + j;
        idx.push(a, a + m, a + 1, a + 1, a + m, a + m + 1);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

/** トンネル：内側のアーチ・外側の岩山・入口の面・照明 */
function buildTunnels(track, g, tex) {
  const wo = track.wallOffset;
  const H = 9;
  const arch = [];
  for (let k = 0; k <= 16; k++) {
    const a = (k / 16) * Math.PI;
    arch.push([Math.cos(a) * wo, Math.sin(a) * H]);
  }
  const W = wo + 55;
  const shell = [[W, -6], [W - 12, 6], [wo + 22, 16], [wo + 6, 21], [0, 23], [-wo - 6, 21], [-wo - 22, 16], [-W + 12, 6], [-W, -6]];
  // DoubleSide と flatShading を併用すると裏面が真っ黒になるので flatShading は使わない
  const rockMat = new THREE.MeshLambertMaterial({ map: tex.rock, side: THREE.DoubleSide, color: 0xd8cab6, emissive: 0x2e2822 });
  const grassTop = new THREE.MeshLambertMaterial({ color: new THREE.Color(track.theme.grass[1]), side: THREE.DoubleSide });
  const innerMat = new THREE.MeshLambertMaterial({ map: tex.concrete, side: THREE.DoubleSide });
  const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffe2a0).multiplyScalar(4) });
  const p = {};

  const extrude = (profile, s0, len, mat) => extrudeAlong(track, profile, s0, len, mat);

  for (const t of track.tunnels) {
    g.add(extrude(arch, t.s0, t.len, innerMat));
    g.add(extrude(shell, t.s0, t.len, rockMat));
    // 岩山の上に草
    g.add(extrude(shell.slice(2, 7).map(([l, h]) => [l * 0.98, h + 0.4]), t.s0 + 2, t.len - 4, grassTop));

    for (const s of [t.s0, t.s0 + t.len]) {
      track.pointAt(s, 0, p);
      const shape = new THREE.Shape(shell.map(([l, h]) => new THREE.Vector2(l, h)));
      const hole = new THREE.Path([...arch.map(([l, h]) => new THREE.Vector2(l, h)), new THREE.Vector2(-wo, -1), new THREE.Vector2(wo, -1)]);
      shape.holes.push(hole);
      const faceGeo = new THREE.ShapeGeometry(shape);
      const fuv = faceGeo.attributes.uv;
      for (let k = 0; k < fuv.count; k++) fuv.setXY(k, fuv.getX(k) / 8, fuv.getY(k) / 8);
      const face = new THREE.Mesh(faceGeo, rockMat);
      face.position.set(p.x, p.y, p.z);
      face.rotation.y = p.heading;
      g.add(face);
      // 入口のアーチ枠
      const frame = new THREE.Mesh(new THREE.TorusGeometry(1, 0.1, 8, 24, Math.PI), new THREE.MeshLambertMaterial({ color: 0xe0463c }));
      frame.scale.set(wo + 0.8, H + 0.8, 8);
      frame.position.set(p.x, p.y, p.z);
      frame.rotation.y = p.heading;
      g.add(frame);
    }
    for (let d = 5; d < t.len; d += 9) {
      for (const lat of [wo * 0.45, -wo * 0.45]) {
        track.pointAt(t.s0 + d, lat, p);
        const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.25, 2.4), lampMat);
        lamp.position.set(p.x, p.y + Math.sin(Math.acos(0.45)) * H - 0.3, p.z);
        lamp.rotation.y = p.heading;
        g.add(lamp);
      }
    }
  }
}

/** 城内の大広間の寸法（壁の高さ・天井のアーチの高さ・外側の屋根の高さ・外壁までの横幅） */
const HALL = { wall: 12, vault: 6, roof: 22, half: 30 };

function stoneTexture(base = "#5c5652") {
  return canvasTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    speckle(ctx, w, h, 800, ["rgba(0,0,0,0.18)", "rgba(255,255,255,0.08)"], 2);
    drawBricks(ctx, w, h, 32, 16);
  });
}

/**
 * 城内（features の castle、枝道の castle）：城の大広間の中を走る。
 * 中はアーチ天井・柱・松明・垂れ幕・シャンデリア・赤じゅうたん・壁ぎわの溶岩の溝、
 * 外は胸壁のある城壁と光る窓、出入口には門の塔と上げた落とし格子。
 * 城内が 2 本並ぶときは外壁が重なるので、ほかの大広間に埋まる所には窓・胸壁・塔を置かない。
 */
function buildCastleHalls(track, g) {
  if (!track.castles?.length) return;
  const main = track.main ?? track;
  const wo = track.wallOffset;
  const iw = wo + 0.3; // 内壁は道の柵の少し外（柵が腰壁に見える）
  const W = HALL.half;
  const top = HALL.wall + HALL.vault;
  const inner = [[iw, -0.5]];
  for (let k = 0; k <= 14; k++) {
    const a = (k / 14) * Math.PI;
    inner.push([Math.cos(a) * iw, HALL.wall + Math.sin(a) * HALL.vault]);
  }
  inner.push([-iw, -0.5]);
  const outer = [[W, -14], [W, HALL.roof], [-W, HALL.roof], [-W, -14]];
  const vaultAt = (lat) => HALL.wall + Math.sqrt(Math.max(0, 1 - (lat / iw) ** 2)) * HALL.vault;
  const inHall = (path, s) =>
    path.castles.some((c) => {
      const d = path.closed ? path.wrapS(s - c.s0) : s - c.s0;
      return d >= 0 && d <= c.len;
    });
  const q = {};
  const covered = (x, z) =>
    main.paths.some((o) => {
      if (o === track || !o.castles?.length) return false;
      o.project(x, z, null, q);
      return Math.abs(q.lateral) < W + 1 && inHall(o, q.s);
    });

  const innerMat = new THREE.MeshLambertMaterial({ map: stoneTexture("#6a5a52"), side: THREE.DoubleSide, emissive: 0x2a1208 });
  const outerMat = new THREE.MeshLambertMaterial({ map: stoneTexture(), side: THREE.DoubleSide });
  const pillarMat = new THREE.MeshLambertMaterial({ map: stoneTexture("#7a6c64"), emissive: 0x24100a });
  const ironMat = new THREE.MeshLambertMaterial({ color: 0x2a2624 });
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x8a1a1a });
  const winMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffa23a).multiplyScalar(2.5), side: THREE.DoubleSide });
  const flameMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff9a2a).multiplyScalar(3.5) });
  const bannerMat = new THREE.MeshLambertMaterial({
    side: THREE.DoubleSide,
    emissive: 0x3a0806,
    map: canvasTexture(64, 128, (ctx, w, h) => {
      ctx.fillStyle = "#9a1414";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#e6a21a";
      ctx.fillRect(0, 0, w, 6);
      ctx.fillRect(4, 0, 4, h);
      ctx.fillRect(w - 8, 0, 4, h);
      // 下の端はギザギザ
      ctx.clearRect(0, h - 12, w, 12);
      ctx.fillStyle = "#9a1414";
      for (let x = 0; x < w; x += 16) {
        ctx.beginPath();
        ctx.moveTo(x, h - 12);
        ctx.lineTo(x + 16, h - 12);
        ctx.lineTo(x + 8, h);
        ctx.fill();
      }
      // 角の生えた紋章
      ctx.fillStyle = "#e6a21a";
      ctx.beginPath();
      ctx.arc(w / 2, 56, 15, 0, Math.PI * 2);
      ctx.fill();
      for (const d of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(w / 2 + d * 8, 46);
        ctx.lineTo(w / 2 + d * 18, 26);
        ctx.lineTo(w / 2 + d * 14, 50);
        ctx.fill();
      }
      ctx.fillStyle = "#3a0a0a";
      for (const d of [-1, 1]) ctx.fillRect(w / 2 + d * 6 - 2, 52, 4, 5);
      ctx.fillRect(w / 2 - 6, 62, 12, 3);
    }, false),
    transparent: true,
    alphaTest: 0.5,
  });
  const carpetMat = new THREE.MeshLambertMaterial({
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -2,
    map: canvasTexture(64, 128, (ctx, w, h) => {
      ctx.fillStyle = "#8e1212";
      ctx.fillRect(0, 0, w, h);
      speckle(ctx, w, h, 500, ["rgba(0,0,0,0.12)", "rgba(255,120,120,0.08)"], 2);
      ctx.fillStyle = "#e0a020";
      ctx.fillRect(3, 0, 4, h);
      ctx.fillRect(w - 7, 0, 4, h);
    }),
  });
  const lavaTex = canvasTexture(64, 256, (ctx, w, h) => {
    ctx.fillStyle = "#ff5a0a";
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) {
      ctx.fillStyle = i % 3 ? "rgba(255,210,60,0.55)" : "rgba(120,20,0,0.5)";
      ctx.beginPath();
      ctx.ellipse(Math.random() * w, Math.random() * h, 4 + Math.random() * 10, 8 + Math.random() * 20, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  const lavaMat = new THREE.MeshBasicMaterial({ map: lavaTex, color: new THREE.Color(1, 1, 1).multiplyScalar(1.6) });
  main.scrolling ??= [];
  main.scrolling.push({ tex: lavaTex, speed: 0.15 });
  main.torches ??= [];

  // じゅうたんと溶岩の溝（道のサンプル単位で城内だけ描く）
  const inside = new Uint8Array(track.count);
  for (let i = 0; i < track.count; i++) inside[i] = inHall(track, i * track.segLen) ? 1 : 0;
  // 枝道はメインコースと重なってもちらつかないよう少し持ち上げてある（buildRoad の lift）ので合わせる
  const lift = track.main ? 0.03 : 0;
  const surf = (d) => (i, off) => track.py[i] + track.bank[i] * off + d + lift;
  const floor = (i) => inside[i] && !track.gapF[i];
  g.add(ribbon(track, 3.2, -3.2, surf(0.06), surf(0.06), 6, carpetMat, floor));
  for (const side of [1, -1]) {
    const a = side * (wo - 0.15);
    const b = side * (wo - 1.5);
    g.add(ribbon(track, Math.max(a, b), Math.min(a, b), surf(0.08), surf(0.08), 10, lavaMat, floor));
  }

  // クラッシャーの真上にはシャンデリアを吊らない
  const crusherS = (main.def.hazards ?? []).filter((h) => h.type === "crusher" && (h.branch ?? 0) === track.id).map((h) => h.at * track.length);
  const nearCrusher = (s) => crusherS.some((c) => Math.abs(track.deltaS(c, s)) < 12);

  const p = {};
  const place = (mesh, s, lat, y, rot = 0) => {
    track.pointAt(s, lat, p);
    mesh.position.set(p.x, p.y + y, p.z);
    mesh.rotation.y = p.heading + rot;
    g.add(mesh);
    return mesh;
  };
  const pillarGeo = new THREE.BoxGeometry(1.8, HALL.wall + 0.5, 1.8);
  const capGeo = new THREE.BoxGeometry(2.6, 0.9, 2.6);
  const bannerGeo = new THREE.PlaneGeometry(3.4, 7);
  const winGeo = new THREE.PlaneGeometry(2.2, 3.6);
  const merlonGeo = new THREE.BoxGeometry(1.4, 1.4, 2);

  for (const c of track.castles) {
    g.add(extrudeAlong(track, inner, c.s0, c.len, innerMat, 8));
    g.add(extrudeAlong(track, outer, c.s0, c.len, outerMat, 8));

    // 柱と松明、柱のあいだの垂れ幕
    let n = 0;
    for (let d = 7; d < c.len - 4; d += 14, n++) {
      const s = c.s0 + d;
      for (const side of [1, -1]) {
        place(new THREE.Mesh(pillarGeo, pillarMat), s, side * iw, HALL.wall / 2 - 0.25).castShadow = true;
        place(new THREE.Mesh(capGeo, pillarMat), s, side * (iw - 0.2), HALL.wall);
        if (n % 2 === 0) {
          place(new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 1.2), ironMat), s, side * (iw - 1.4), 5.4, Math.PI / 2);
          const flame = place(new THREE.Mesh(new THREE.ConeGeometry(0.4, 1.1, 8), flameMat), s, side * (iw - 1.9), 6.2);
          main.torches.push(flame);
        }
        if (d + 7 < c.len - 4) place(new THREE.Mesh(bannerGeo, bannerMat), s + 7, side * (iw - 0.1), 6.4, Math.PI / 2);
      }
    }

    // シャンデリア（天井から鎖で吊った鉄の輪とろうそくの火）
    for (let d = 22; d < c.len - 10; d += 44) {
      const s = c.s0 + d;
      if (nearCrusher(s)) continue;
      track.pointAt(s, 0, p);
      const y = p.y + top - 5.5;
      const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 5.5, 4), ironMat);
      chain.position.set(p.x, y + 2.75, p.z);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.15, 6, 24), ironMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(p.x, y, p.z);
      g.add(chain, ring);
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const flame = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.7, 6), flameMat);
        flame.position.set(p.x + Math.cos(a) * 2.4, y + 0.45, p.z + Math.sin(a) * 2.4);
        g.add(flame);
        main.torches.push(flame);
      }
    }

    // 外壁：光る窓と屋根のふちの胸壁
    for (let d = 10; d < c.len - 6; d += 16) {
      for (const side of [1, -1]) {
        track.pointAt(c.s0 + d, side * (W + 0.05), p);
        if (!covered(p.x, p.z)) place(new THREE.Mesh(winGeo, winMat), c.s0 + d, side * (W + 0.05), HALL.roof - 8, (side * Math.PI) / 2);
      }
    }
    const spots = [];
    for (let d = 1; d < c.len; d += 3.4) for (const side of [1, -1]) spots.push([c.s0 + d, side * (W - 0.7)]);
    for (let l = -W + 3.4; l <= W - 3.4; l += 3.4) spots.push([c.s0 + 0.7, l], [c.s0 + c.len - 0.7, l]);
    const kept = spots.filter(([s, lat]) => {
      track.pointAt(s, lat, p);
      return !covered(p.x, p.z);
    });
    spots.length = 0;
    spots.push(...kept);
    const merlons = new THREE.InstancedMesh(merlonGeo, outerMat, spots.length);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const one = new THREE.Vector3(1, 1, 1);
    spots.forEach(([s, lat], k) => {
      track.pointAt(s, lat, p);
      q.setFromAxisAngle(up, p.heading);
      merlons.setMatrixAt(k, m4.compose(new THREE.Vector3(p.x, p.y + HALL.roof + 0.7, p.z), q, one));
    });
    merlons.castShadow = merlons.receiveShadow = true;
    g.add(merlons);

    // 出入口：アーチ穴のあいた壁面・門の塔・上げた落とし格子
    for (const [s, dir] of [[c.s0, -1], [c.s0 + c.len, 1]]) {
      track.pointAt(s, 0, p);
      const shape = new THREE.Shape(outer.map(([l, h]) => new THREE.Vector2(l, h)));
      shape.holes.push(new THREE.Path(inner.map(([l, h]) => new THREE.Vector2(l, h))));
      const faceGeo = new THREE.ShapeGeometry(shape);
      const fuv = faceGeo.attributes.uv;
      for (let k = 0; k < fuv.count; k++) fuv.setXY(k, fuv.getX(k) / 8, fuv.getY(k) / 8);
      const face = new THREE.Mesh(faceGeo, outerMat);
      face.position.set(p.x, p.y, p.z);
      face.rotation.y = p.heading;
      g.add(face);

      for (const side of [1, -1]) {
        track.pointAt(s, side * W, p);
        if (covered(p.x, p.z)) continue;
        const towerH = HALL.roof + 26;
        const tower = place(new THREE.Mesh(new THREE.CylinderGeometry(7, 7.5, towerH, 16), outerMat), s, side * W, towerH / 2 - 12);
        tower.castShadow = tower.receiveShadow = true;
        place(new THREE.Mesh(new THREE.ConeGeometry(9.5, 16, 16), roofMat), s, side * W, towerH - 12 + 8).castShadow = true;
        for (let k = 0; k < 4; k++) {
          const a = (k / 4) * Math.PI * 2 + 0.4;
          track.pointAt(s, side * W, p);
          const win = new THREE.Mesh(winGeo, winMat);
          win.position.set(p.x + Math.cos(a) * 7.3, p.y + towerH - 20, p.z + Math.sin(a) * 7.3);
          win.rotation.y = Math.PI / 2 - a;
          g.add(win);
        }
      }
      // 落とし格子：アーチの上のほうに鉄の格子が引き上げられている
      const gate = new THREE.Group();
      for (let l = -iw + 1.2; l < iw - 0.6; l += 1.6) {
        const h = vaultAt(l) - (HALL.wall - 1);
        const bar = new THREE.Mesh(new THREE.BoxGeometry(0.28, h, 0.28), ironMat);
        bar.position.set(l, HALL.wall - 1 + h / 2, 0);
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.8, 4), ironMat);
        spike.rotation.x = Math.PI;
        spike.position.set(l, HALL.wall - 1.4, 0);
        gate.add(bar, spike);
      }
      for (const y of [HALL.wall - 0.6, HALL.wall + 2]) {
        const w = 2 * Math.sqrt(Math.max(0, 1 - ((y - HALL.wall) / HALL.vault) ** 2)) * iw;
        const rail = new THREE.Mesh(new THREE.BoxGeometry(y < HALL.wall ? iw * 2 : w, 0.3, 0.3), ironMat);
        rail.position.set(0, y, 0);
        gate.add(rail);
      }
      place(gate, s + dir * 1.2, 0, 0);
    }
  }
}

function buildStart(track, g) {
  const hw = track.halfWidth;
  const p = track.pointAt(0, 0, {});
  const root = new THREE.Group();
  root.position.set(p.x, p.y, p.z);
  root.rotation.y = p.heading;
  g.add(root);

  const checker = canvasTexture(128, 32, (ctx) => {
    for (let x = 0; x < 16; x++)
      for (let y = 0; y < 4; y++) {
        ctx.fillStyle = (x + y) % 2 ? "#111" : "#fff";
        ctx.fillRect(x * 8, y * 8, 8, 8);
      }
  });
  const line = new THREE.Mesh(new THREE.PlaneGeometry(hw * 2, 3), new THREE.MeshLambertMaterial({ map: checker }));
  line.rotation.x = -Math.PI / 2;
  line.position.y = 0.12;
  line.receiveShadow = true;
  root.add(line);

  const postMat = new THREE.MeshLambertMaterial({ color: 0xf2f2f2 });
  for (const side of [1, -1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 10, 12), postMat);
    post.position.set(side * (hw + 2.6), 5, 0);
    post.castShadow = true;
    root.add(post);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshLambertMaterial({ color: 0xffd23f, emissive: 0x553300 }));
    ball.position.set(side * (hw + 2.6), 10.5, 0);
    root.add(ball);
  }
  const bannerTex = canvasTexture(
    1024,
    128,
    (ctx, w, h) => {
      const grd = ctx.createLinearGradient(0, 0, w, 0);
      grd.addColorStop(0, "#ff3d5a");
      grd.addColorStop(1, "#ff9f1c");
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "rgba(255,255,255,0.25)";
      ctx.fillRect(0, 0, w, 10);
      const text = `${track.def.name}  ★  TURBO KART GP`;
      ctx.font = "bold 72px sans-serif";
      const size = Math.min(72, (72 * (w - 60)) / ctx.measureText(text).width);
      ctx.font = `bold ${size}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "#fff";
      ctx.fillText(text, w / 2, h / 2 + 4);
    },
    false,
  );
  const banner = new THREE.Mesh(new THREE.BoxGeometry(hw * 2 + 6, 2.4, 0.5), new THREE.MeshLambertMaterial({ map: bannerTex }));
  banner.position.y = 8.6;
  banner.castShadow = true;
  root.add(banner);
}

function buildBoostPads(track, g) {
  if (!track.paths.some((path) => path.boostPads.length)) return;
  const tex = canvasTexture(64, 64, (ctx, w, h) => {
    ctx.fillStyle = "#ff8a00";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#fff36b";
    ctx.lineWidth = 9;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(12, h * 0.7);
    ctx.lineTo(w / 2, h * 0.3);
    ctx.lineTo(w - 12, h * 0.7);
    ctx.stroke();
  });
  track.animated.push(tex);
  const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide });
  for (const path of track.paths) for (const pad of path.boostPads) {
    tex.repeat.set(1, pad.length / pad.width);
    const p = path.pointAt(pad.s + pad.length / 2, pad.lateral, {});
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(pad.width, pad.length), mat);
    mesh.position.set(p.x, p.surfaceY + (path === track ? 0.14 : 0.18), p.z);
    // 平面の +Y（テクスチャの上）を進行方向に向ける
    mesh.rotateY(p.heading);
    mesh.rotateX(-Math.PI / 2);
    mesh.rotateZ(Math.PI);
    g.add(mesh);
  }
}

/** 急カーブの外側に矢印看板 */
function buildSigns(track, g) {
  const make = (dir) =>
    canvasTexture(
      128,
      96,
      (ctx, w, h) => {
        ctx.fillStyle = "#1d3fa8";
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 6;
        ctx.strokeRect(4, 4, w - 8, h - 8);
        ctx.fillStyle = "#ffd23f";
        for (let k = 0; k < 2; k++) {
          const x = w / 2 + (k - 0.5) * 40;
          ctx.beginPath();
          ctx.moveTo(x + 14 * dir, h / 2);
          ctx.lineTo(x - 10 * dir, h * 0.2);
          ctx.lineTo(x - 22 * dir, h * 0.2);
          ctx.lineTo(x + 2 * dir, h / 2);
          ctx.lineTo(x - 22 * dir, h * 0.8);
          ctx.lineTo(x - 10 * dir, h * 0.8);
          ctx.fill();
        }
      },
      false,
    );
  const mats = { 1: new THREE.MeshLambertMaterial({ map: make(-1) }), [-1]: new THREE.MeshLambertMaterial({ map: make(1) }) };
  const postMat = new THREE.MeshLambertMaterial({ color: 0x888888 });
  const geo = new THREE.PlaneGeometry(3.2, 2.4);
  const p = {};
  let cooldown = 0;
  for (let s = 0; s < track.length; s += 2) {
    cooldown -= 2;
    const turn = track.turnAngle(s, 30);
    if (Math.abs(turn) < 0.75 || cooldown > 0) continue;
    const i = Math.floor(s / track.segLen) % track.count;
    const dir = Math.sign(turn);
    const outer = -dir; // 左カーブなら右側（外側）に置く
    if (track.gapF[i] || track.tunnelF[i] || (outer > 0 ? track.cliffL[i] : track.cliffR[i])) continue;
    cooldown = 9;
    track.pointAt(s + 22, outer * (track.wallOffset + 1.5), p);
    const sign = new THREE.Mesh(geo, mats[dir]);
    sign.position.set(p.x, p.surfaceY + 2.6, p.z);
    sign.rotation.y = track.headingAt(s) + Math.PI;
    sign.castShadow = true;
    g.add(sign);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2), postMat);
    post.position.set(p.x, p.surfaceY + 0.8, p.z);
    g.add(post);
  }
}

/** スタート横の観客席 */
function buildGrandstand(track, g) {
  const root = new THREE.Group();
  const s = track.length - 45;
  const p = track.pointAt(s, -(track.wallOffset + 9), {});
  root.position.set(p.x, p.y - 0.5, p.z);
  root.rotation.y = p.heading;
  g.add(root);
  const len = 60;
  const stepMat = new THREE.MeshLambertMaterial({ color: 0xd9dde6 });
  // 手前（コース側）が低く、奥ほど高いひな壇
  for (let k = 0; k < 5; k++) {
    const h = 1.2 * (k + 1);
    const step = new THREE.Mesh(new THREE.BoxGeometry(2.2, h, len), stepMat);
    step.position.set(-k * 2.2 - 1.1, h / 2, len / 2);
    step.castShadow = step.receiveShadow = true;
    root.add(step);
  }
  const roof = new THREE.Mesh(new THREE.BoxGeometry(14, 0.4, len + 2), new THREE.MeshLambertMaterial({ color: 0xe63946 }));
  roof.position.set(-5.5, 10, len / 2);
  roof.rotation.z = 0.12;
  roof.castShadow = true;
  root.add(roof);
  const crowd = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.35, 0.6, 3, 6), new THREE.MeshLambertMaterial(), 5 * 45);
  const m = new THREE.Matrix4();
  const c = new THREE.Color();
  const rng = mulberry32(5);
  let n = 0;
  for (let k = 0; k < 5; k++)
    for (let j = 0; j < 45; j++) {
      m.makeTranslation(-k * 2.2 - 1.1 + rng() * 0.4, 1.2 * (k + 1) + 0.7, 1 + j * 1.3 + rng() * 0.4);
      crowd.setMatrixAt(n, m);
      crowd.setColorAt(n++, c.setHSL(rng(), 0.7, 0.55));
    }
  root.add(crowd);
  track.crowd = crowd;
  for (let k = 0; k < 6; k++) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 6), new THREE.MeshLambertMaterial({ color: 0xffffff }));
    pole.position.set(1.5, 3, 5 + k * 10);
    root.add(pole);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(2, 1.3), new THREE.MeshLambertMaterial({ color: [0xff3d5a, 0xffd23f, 0x3a86ff][k % 3], side: THREE.DoubleSide }));
    flag.position.set(1.5, 5.3, 5 + k * 10 + 1);
    flag.rotation.y = Math.PI / 2;
    root.add(flag);
  }
}

/**
 * 木・岩・下草（地形の上、コースと水辺を避けて配置）
 * scenery.treeTypes で木の種類を選ぶ: "pine"（針葉樹）, "round"（広葉樹）, "palm"（ヤシ）, "jungle"（熱帯の大木）
 * scenery.bushes でコース脇のしげみの数
 */
function buildNature(track, g, terrain) {
  const th = track.theme;
  const sc = track.def.scenery ?? {};
  const rng = mulberry32(sc.seed ?? 1);
  const count = sc.trees ?? 400;
  const types = sc.treeTypes ?? ["pine", "pine", "pine", "round", "round"];
  const { minX, maxX, minZ, maxZ } = track.bounds;
  const spread = sc.spread ?? 350; // コースの外側どこまで木を置くか
  const spots = { pine: [], snowpine: [], round: [], palm: [], jungle: [], rock: [], bush: [] };
  let placed = 0;
  for (let tries = 0; tries < count * 12 && placed < count; tries++) {
    const x = lerp(minX - spread, maxX + spread, rng());
    const z = lerp(minZ - spread, maxZ + spread, rng());
    if (terrain.nearTrack(x, z)) continue;
    const h = terrain.heightAt(x, z);
    if (h < th.waterLevel + 1.2 || h > 70) continue;
    const slope = Math.abs(terrain.heightAt(x + 3, z) - h) + Math.abs(terrain.heightAt(x, z + 3) - h);
    if (slope > 3) {
      if (rng() < 0.3) spots.rock.push([x, h, z, 1 + rng() * 2.5]);
      continue;
    }
    spots[types[Math.floor(rng() * types.length)]].push([x, h, z, 0.8 + rng() * 0.9]);
    placed++;
    if (rng() < 0.08) spots.rock.push([x + 4, h, z + 3, 0.6 + rng()]);
  }

  // コース脇のしげみ（壁のすぐ外側）
  const wo = track.wallOffset;
  const p = {};
  for (let k = 0; k < (sc.bushes ?? 0); k++) {
    const i = Math.floor(rng() * track.count);
    if (track.gapF[i] || track.bridgeF[i] || track.tunnelF[i]) continue;
    const side = rng() < 0.5 ? 1 : -1;
    if (side > 0 ? track.cliffL[i] : track.cliffR[i]) continue;
    track.pointAt(i * track.segLen, side * (wo + 2.5 + rng() * 22), p);
    const h = terrain.heightAt(p.x, p.z);
    if (h < th.waterLevel + 0.8 || h < p.y - 4) continue;
    spots.bush.push([p.x, h, p.z, 0.7 + rng() * 1.1]);
  }

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const c = new THREE.Color();
  const leaf = th.treeLeaf.map((l) => new THREE.Color(l));
  const leafColor = (i, hue = 0) => c.copy(leaf[i % leaf.length]).offsetHSL(hue, 0.03, (rng() - 0.5) * 0.1);
  const instanced = (geo, mat, list, color, { rot = true, squash = 1 } = {}) => {
    if (!list.length) return;
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach(([x, y, z, s], i) => {
      q.setFromAxisAngle(up, rot ? (i * 2.399) % (Math.PI * 2) : 0);
      m.compose(new THREE.Vector3(x, y - 0.3, z), q, new THREE.Vector3(s, s * squash, s));
      mesh.setMatrixAt(i, m);
      if (color) mesh.setColorAt(i, color(i));
    });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    g.add(mesh);
  };
  const trunkMat = new THREE.MeshLambertMaterial({ color: th.treeTrunk });
  const leafMat = new THREE.MeshLambertMaterial({ flatShading: true });

  instanced(new THREE.CylinderGeometry(0.35, 0.5, 3, 6).translate(0, 1.5, 0), trunkMat, spots.pine);
  instanced(mergeGeos([
    new THREE.ConeGeometry(2.6, 3.6, 8).translate(0, 3.6, 0),
    new THREE.ConeGeometry(2.1, 3.2, 8).translate(0, 5.4, 0),
    new THREE.ConeGeometry(1.5, 2.8, 8).translate(0, 7.1, 0),
  ]), leafMat, spots.pine, (i) => leafColor(i));

  // 雪をかぶったモミ：緑の円錐の上半分に白い円錐を重ねる
  const snowCap = new THREE.MeshLambertMaterial({ color: 0xf6faff, flatShading: true });
  const white = new THREE.Color(0xffffff);
  instanced(new THREE.CylinderGeometry(0.35, 0.5, 3, 6).translate(0, 1.5, 0), trunkMat, spots.snowpine);
  instanced(mergeGeos([
    new THREE.ConeGeometry(2.6, 3.6, 8).translate(0, 3.6, 0),
    new THREE.ConeGeometry(2.1, 3.2, 8).translate(0, 5.4, 0),
    new THREE.ConeGeometry(1.5, 2.8, 8).translate(0, 7.1, 0),
  ]), leafMat, spots.snowpine, (i) => leafColor(i).lerp(white, 0.35 + rng() * 0.2));
  // 各段のすそに積もった雪と、てっぺんの雪（緑の円錐より少し大きくして外側に見せる）
  instanced(mergeGeos([
    new THREE.CylinderGeometry(2.25, 2.75, 0.5, 8).translate(0, 2.05, 0),
    new THREE.CylinderGeometry(1.9, 2.2, 0.45, 8).translate(0, 4.0, 0),
    new THREE.CylinderGeometry(1.35, 1.6, 0.4, 8).translate(0, 5.9, 0),
    new THREE.ConeGeometry(0.85, 1.4, 8).translate(0, 7.85, 0),
  ]), snowCap, spots.snowpine);

  instanced(new THREE.CylinderGeometry(0.4, 0.55, 3.4, 6).translate(0, 1.7, 0), trunkMat, spots.round);
  instanced(new THREE.IcosahedronGeometry(2.6, 1).translate(0, 5, 0), leafMat, spots.round, (i) => leafColor(i + 1, 0.02));

  // ヤシ：曲がった幹と垂れ下がる葉
  const palmCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.4, 3, 0),
    new THREE.Vector3(1.3, 6, 0),
    new THREE.Vector3(2.4, 8.6, 0),
  ]);
  instanced(new THREE.TubeGeometry(palmCurve, 10, 0.32, 6), new THREE.MeshLambertMaterial({ color: 0x9a7b55 }), spots.palm);
  const fronds = [];
  for (let k = 0; k < 8; k++) {
    fronds.push(
      new THREE.ConeGeometry(0.7, 5.5, 4)
        .translate(0, 2.75, 0)
        .scale(1, 1, 0.18)
        .rotateZ(-(Math.PI / 2 - 0.35))
        .rotateY((k / 8) * Math.PI * 2)
        .translate(2.4, 8.6, 0),
    );
  }
  fronds.push(new THREE.IcosahedronGeometry(0.6, 0).translate(2.4, 8.4, 0));
  instanced(mergeGeos(fronds), leafMat, spots.palm, (i) => leafColor(i + 2, 0.03));

  // 熱帯の大木：高い幹と横に広がる樹冠
  instanced(new THREE.CylinderGeometry(0.45, 0.9, 12, 7).translate(0, 6, 0), trunkMat, spots.jungle);
  instanced(mergeGeos([
    new THREE.IcosahedronGeometry(3.6, 1).scale(1.2, 0.55, 1.2).translate(0, 12, 0),
    new THREE.IcosahedronGeometry(2.8, 1).scale(1.1, 0.6, 1.1).translate(2.8, 10.8, 1.4),
    new THREE.IcosahedronGeometry(2.6, 1).scale(1.1, 0.6, 1.1).translate(-2.4, 11, -1.8),
    new THREE.IcosahedronGeometry(2.2, 1).scale(1, 0.6, 1).translate(0.6, 9.6, -2.6),
  ]), leafMat, spots.jungle, (i) => leafColor(i + 3, -0.01));

  // しげみ・シダ
  instanced(mergeGeos([
    new THREE.IcosahedronGeometry(1.3, 1).scale(1, 0.6, 1).translate(0, 0.5, 0),
    new THREE.IcosahedronGeometry(0.9, 1).scale(1, 0.7, 1).translate(1.1, 0.4, 0.4),
    new THREE.IcosahedronGeometry(0.8, 1).scale(1, 0.7, 1).translate(-0.9, 0.35, -0.5),
  ]), leafMat, spots.bush, (i) => leafColor(i, 0.01));

  instanced(new THREE.DodecahedronGeometry(1.4, 0), new THREE.MeshLambertMaterial({ color: th.rock, flatShading: true }), spots.rock, null, { squash: 0.7 });
}

/** 複数のジオメトリを 1 つにまとめる（位置だけ。法線は作り直す） */
function mergeGeos(parts) {
  const flat = parts.map((p) => (p.index ? p.toNonIndexed() : p));
  const total = flat.reduce((n, p) => n + p.attributes.position.count, 0);
  const pos = new Float32Array(total * 3);
  let o = 0;
  for (const p of flat) {
    pos.set(p.attributes.position.array, o);
    o += p.attributes.position.array.length;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  return geo;
}

/** 遺跡：苔むした石柱、コースをまたぐ石のアーチ、脇に段々の神殿 */
function buildRuins(track, g, tex, terrain) {
  if (!track.ruins.length) return;
  const wo = track.wallOffset;
  const rng = mulberry32(77);
  const mat = new THREE.MeshLambertMaterial({ map: tex.stone });
  const p = {};
  const box = (w, h, d, x, y, z, rotY, rx = 0, rz = 0) => {
    // 石のテクスチャが大きさに合わせて繰り返されるよう UV を拡大
    const geo = new THREE.BoxGeometry(w, h, d);
    const uv = geo.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * Math.max(w, d) / 4, uv.getY(k) * h / 4);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, rotY, rz, "YXZ");
    mesh.castShadow = mesh.receiveShadow = true;
    g.add(mesh);
    return mesh;
  };
  for (const r of track.ruins) {
    let n = 0;
    for (let d = 6; d < r.len; d += 16, n++) {
      const arch = n % 3 === 1;
      for (const side of [1, -1]) {
        if (side > 0 ? track.cliffL[Math.floor((r.s0 + d) / track.segLen) % track.count] : track.cliffR[Math.floor((r.s0 + d) / track.segLen) % track.count]) continue;
        track.pointAt(r.s0 + d, side * (wo + 2.6), p);
        const base = p.y + p.bank * side * (wo + 2.6) - 0.5;
        const broken = !arch && rng() < 0.35;
        const h = arch ? 10 : broken ? 2.5 + rng() * 2 : 5 + rng() * 4;
        box(2.4, h, 2.4, p.x, base + h / 2, p.z, p.heading);
        box(3, 0.8, 3, p.x, base + h + 0.4, p.z, p.heading);
        if (broken) {
          // 崩れた柱のかけら
          const q = track.pointAt(r.s0 + d + 3, side * (wo + 5 + rng() * 3), {});
          box(2.2, 2.2, 3.5 + rng() * 2, q.x, q.y - 0.2, q.z, rng() * 3, 0, 0.3);
        }
      }
      if (arch) {
        track.pointAt(r.s0 + d, 0, p);
        box((wo + 2.6) * 2 + 3, 1.8, 2.8, p.x, p.y + 11.6, p.z, p.heading);
        box((wo + 2.6) * 2 - 4, 1.0, 2.2, p.x, p.y + 13, p.z, p.heading);
      }
    }
    // 脇にそびえる段々の神殿
    const mid = r.s0 + r.len / 2;
    const side = track.cliffL[Math.floor(mid / track.segLen) % track.count] ? -1 : 1;
    track.pointAt(mid, side * (wo + 42), p);
    const ground = terrain.heightAt(p.x, p.z);
    for (let k = 0; k < 5; k++) {
      const w = 26 - k * 4.5;
      box(w, 4, w, p.x, ground + 1 + k * 4, p.z, p.heading);
    }
    box(5, 5, 5, p.x, ground + 22.5, p.z, p.heading);
  }
}

/**
 * 雪山の飾り：丸太小屋（scenery.cabins）・雪だるま（scenery.snowmen）・降る雪（theme.snowfall）
 */
function buildWinter(track, g, terrain) {
  const sc = track.def.scenery ?? {};
  const rng = mulberry32((sc.seed ?? 1) + 101);
  const wo = track.wallOffset;
  const p = {};
  const spot = (minOff, maxOff) => {
    for (let tries = 0; tries < 40; tries++) {
      const i = Math.floor(rng() * track.count);
      if (track.gapF[i] || track.bridgeF[i] || track.tunnelF[i]) continue;
      const side = rng() < 0.5 ? 1 : -1;
      if (side > 0 ? track.cliffL[i] : track.cliffR[i]) continue;
      track.pointAt(i * track.segLen, side * lerp(minOff, maxOff, rng()), p);
      const h = terrain.heightAt(p.x, p.z);
      if (h < track.theme.waterLevel + 1 || Math.abs(h - p.y) > 6) continue;
      return { x: p.x, y: h, z: p.z, heading: p.heading, side };
    }
    return null;
  };

  const logMat = new THREE.MeshLambertMaterial({ color: 0x7a4e2c });
  const roofMat = new THREE.MeshLambertMaterial({ color: 0xf4f8ff });
  const winMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc466).multiplyScalar(2.2) });
  const stoneMat = new THREE.MeshLambertMaterial({ color: 0x6d6a66 });
  for (let k = 0; k < (sc.cabins ?? 0); k++) {
    const at = spot(wo + 14, wo + 34);
    if (!at) continue;
    const cabin = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(8, 4.5, 6), logMat);
    body.position.y = 2.25;
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(4.9, 4.9, 9, 3, 1).rotateZ(Math.PI / 2).scale(1, 0.55, 1), roofMat);
    roof.position.y = 5.4;
    const chimney = new THREE.Mesh(new THREE.BoxGeometry(1, 3, 1), stoneMat);
    chimney.position.set(2, 6.5, 1);
    cabin.add(body, roof, chimney);
    for (const x of [-2.2, 2.2]) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.2), winMat);
      win.position.set(x, 2.6, 3.01);
      cabin.add(win);
    }
    cabin.traverse((o) => (o.castShadow = o.receiveShadow = true));
    cabin.position.set(at.x, at.y - 0.3, at.z);
    // 窓（+z）をコースに向ける
    cabin.rotation.y = at.heading + (at.side > 0 ? -Math.PI / 2 : Math.PI / 2);
    g.add(cabin);
  }

  const snowMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const coal = new THREE.MeshLambertMaterial({ color: 0x222222 });
  const carrot = new THREE.MeshLambertMaterial({ color: 0xff8a2a });
  const scarfColors = [0xe63946, 0x3a86ff, 0x2ec27e, 0xffd23f];
  for (let k = 0; k < (sc.snowmen ?? 0); k++) {
    const at = spot(wo + 3, wo + 12);
    if (!at) continue;
    const man = new THREE.Group();
    const s = 0.9 + rng() * 0.6;
    for (const [r, y] of [[1.2, 1.1], [0.9, 2.8], [0.65, 4.1]]) {
      const ball = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), snowMat);
      ball.position.y = y;
      man.add(ball);
    }
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.7, 8).rotateX(Math.PI / 2), carrot);
    nose.position.set(0, 4.1, 0.9);
    man.add(nose);
    for (const x of [-0.22, 0.22]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 4), coal);
      eye.position.set(x, 4.3, 0.58);
      man.add(eye);
    }
    const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.8, 12), coal);
    hat.position.y = 4.9;
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.08, 16), coal);
    brim.position.y = 4.55;
    const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.16, 6, 16).rotateX(Math.PI / 2), new THREE.MeshLambertMaterial({ color: scarfColors[k % 4] }));
    scarf.position.y = 3.55;
    man.add(hat, brim, scarf);
    man.traverse((o) => (o.castShadow = true));
    man.scale.setScalar(s);
    man.position.set(at.x, at.y - 0.3, at.z);
    // 顔（+z）をコース側へ
    man.rotation.y = at.heading + (at.side > 0 ? -Math.PI / 2 : Math.PI / 2);
    g.add(man);
  }

  if (track.theme.snowfall) track.snowfall = buildSnowfall();
  if (track.snowfall) g.add(track.snowfall);
}

/** カメラのまわりに降り続ける雪。雪片は空間に固定し、カメラから離れたら反対側へ回り込ませる（main.js が center を更新） */
function buildSnowfall() {
  const n = 2500;
  const box = { x: 90, y: 50, z: 90 };
  const pos = new Float32Array(n * 3);
  const drift = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    pos.set([(Math.random() - 0.5) * box.x * 2, (Math.random() - 0.5) * box.y * 2, (Math.random() - 0.5) * box.z * 2], i * 3);
    drift[i] = Math.random() * Math.PI * 2;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const c = document.createElement("canvas");
  c.width = c.height = 32;
  const ctx = c.getContext("2d");
  const grd = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, 32, 32);
  const points = new THREE.Points(
    geo,
    new THREE.PointsMaterial({ size: 0.8, map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, color: 0xffffff }),
  );
  points.frustumCulled = false;
  let t = 0;
  const center = new THREE.Vector3();
  const wrap = (v, c, half) => (v - c > half ? v - half * 2 : v - c < -half ? v + half * 2 : v);
  points.userData.center = center;
  points.userData.update = (dt) => {
    t += dt;
    for (let i = 0; i < n; i++) {
      const j = i * 3;
      pos[j] = wrap(pos[j] + Math.sin(t * 0.8 + drift[i]) * 0.6 * dt, center.x, box.x);
      pos[j + 1] = wrap(pos[j + 1] - (2.5 + (i % 5) * 0.4) * dt, center.y, box.y);
      pos[j + 2] = wrap(pos[j + 2], center.z, box.z);
    }
    geo.attributes.position.needsUpdate = true;
  };
  return points;
}

/** 宇宙：星空・星雲・惑星・浮かぶ星のかけら・コースをくぐる光の輪 */
function buildSpace(track, g) {
  const rng = mulberry32(track.def.scenery?.seed ?? 3);
  const { cx, cz } = track.bounds;

  // 星（2 種類の大きさ）
  for (const [n, size] of [[3500, 1.4], [600, 2.8]]) {
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const u = rng() * 2 - 1;
      const a = rng() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      pos.set([cx + Math.cos(a) * r * 1500, u * 1500, cz + Math.sin(a) * r * 1500], i * 3);
      c.setHSL(0.55 + rng() * 0.2, 0.6, 0.75 + rng() * 0.25);
      col.set([c.r, c.g, c.b], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const stars = new THREE.Points(geo, new THREE.PointsMaterial({ size, sizeAttenuation: false, vertexColors: true, fog: false }));
    stars.frustumCulled = false;
    g.add(stars);
  }

  // 星雲
  const nebula = (hue) =>
    canvasTexture(
      256,
      256,
      (ctx, w, h) => {
        for (let i = 0; i < 18; i++) {
          const x = 60 + rng() * 136;
          const y = 60 + rng() * 136;
          const r = 40 + rng() * 70;
          const grd = ctx.createRadialGradient(x, y, 0, x, y, r);
          grd.addColorStop(0, `hsla(${hue + rng() * 40}, 90%, 60%, 0.18)`);
          grd.addColorStop(1, "hsla(0, 0%, 0%, 0)");
          ctx.fillStyle = grd;
          ctx.fillRect(0, 0, w, h);
        }
      },
      false,
    );
  for (const hue of [280, 200, 320, 240, 180]) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: nebula(hue), fog: false, depthWrite: false, blending: THREE.AdditiveBlending }));
    const a = rng() * Math.PI * 2;
    sp.position.set(cx + Math.cos(a) * 1300, -200 + rng() * 700, cz + Math.sin(a) * 1300);
    sp.scale.setScalar(900 + rng() * 500);
    g.add(sp);
  }

  // 惑星
  const bands = (colors) =>
    canvasTexture(
      256,
      128,
      (ctx, w, h) => {
        for (let y = 0; y < h; y += 4) {
          ctx.fillStyle = colors[Math.floor((Math.sin(y * 0.11) * 0.5 + 0.5) * colors.length) % colors.length];
          ctx.fillRect(0, y, w, 4);
        }
      },
      false,
    );
  const planets = [
    { r: 170, d: 950, y: 120, a: 0.6, colors: ["#e9b36a", "#c98a4a", "#f2d49b", "#b86f3a"], ring: true },
    { r: 90, d: 800, y: 260, a: 2.4, colors: ["#6ab8ff", "#3a7ad8", "#9fe0ff"] },
    { r: 55, d: 700, y: -120, a: 4.1, colors: ["#ff7ab8", "#c84a8a", "#ffb0d8"] },
    { r: 320, d: 1300, y: -520, a: 3.3, colors: ["#5a3ad8", "#3a2a98", "#7a5af8"] },
  ];
  for (const pl of planets) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(pl.r, 48, 24),
      new THREE.MeshLambertMaterial({ map: bands(pl.colors), emissive: 0x302040, fog: false }),
    );
    mesh.position.set(cx + Math.cos(pl.a) * pl.d, pl.y, cz + Math.sin(pl.a) * pl.d);
    mesh.rotation.z = 0.3;
    g.add(mesh);
    if (pl.ring) {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(pl.r * 1.3, pl.r * 2.1, 64),
        new THREE.MeshBasicMaterial({ color: 0xe8c890, transparent: true, opacity: 0.55, side: THREE.DoubleSide, fog: false }),
      );
      ring.position.copy(mesh.position);
      ring.rotation.set(-Math.PI / 2 + 0.35, 0, 0.3);
      g.add(ring);
    }
  }

  // コースのまわりに浮かぶ星のかけら
  const bits = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1, 0), new THREE.MeshBasicMaterial(), 320);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const c = new THREE.Color();
  const p = {};
  for (let i = 0; i < 320; i++) {
    const side = rng() < 0.5 ? 1 : -1;
    track.pointAt(rng() * track.length, side * (track.wallOffset + 35 + rng() * 90), p);
    q.setFromEuler(new THREE.Euler(rng() * 3, rng() * 3, 0));
    const s = 0.5 + rng() * 1.6;
    m.compose(new THREE.Vector3(p.x, p.y - 25 + rng() * 60, p.z), q, new THREE.Vector3(s, s * 1.6, s));
    bits.setMatrixAt(i, m);
    bits.setColorAt(i, c.setHSL(rng(), 1, 0.65).multiplyScalar(2.2));
  }
  g.add(bits);

  // コースをくぐる光の輪
  const rings = track.def.scenery?.rings ?? 0;
  for (let k = 0; k < rings; k++) {
    const s = ((k + 0.5) / rings) * track.length;
    const i = Math.floor(s / track.segLen) % track.count;
    if (track.gapF[i]) continue;
    track.pointAt(s, 0, p);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(track.wallOffset + 2.5, 0.45, 8, 48),
      new THREE.MeshBasicMaterial({ color: c.setHSL(k / rings, 1, 0.6).clone().multiplyScalar(2.4) }),
    );
    const root = new THREE.Group();
    root.position.set(p.x, p.y, p.z);
    root.rotation.y = p.heading;
    root.add(ring);
    g.add(root);
  }
}

/** ふわふわの雲と気球 */
function buildSkyObjects(track, g) {
  const rng = mulberry32(21);
  const { cx, cz } = track.bounds;
  const cloudTex = canvasTexture(
    256,
    128,
    (ctx, w, h) => {
      for (let i = 0; i < 14; i++) {
        const x = 40 + rng() * (w - 80);
        const y = 50 + rng() * 40;
        const r = 24 + rng() * 34;
        const grd = ctx.createRadialGradient(x, y, 0, x, y, r);
        grd.addColorStop(0, "rgba(255,255,255,0.95)");
        grd.addColorStop(0.6, "rgba(255,255,255,0.7)");
        grd.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    false,
  );
  const cloudMat = new THREE.SpriteMaterial({ map: cloudTex, depthWrite: false, fog: false, color: track.theme.cloudColor ?? 0xffffff });
  for (let i = 0; i < 26; i++) {
    const s = new THREE.Sprite(cloudMat);
    const a = rng() * Math.PI * 2;
    const r = 250 + rng() * 800;
    s.position.set(cx + Math.cos(a) * r, 150 + rng() * 120, cz + Math.sin(a) * r);
    const size = 140 + rng() * 160;
    s.scale.set(size, size / 2, 1);
    g.add(s);
  }

  const stripe = (a, b) =>
    canvasTexture(
      128,
      64,
      (ctx, w, h) => {
        for (let x = 0; x < 8; x++) {
          ctx.fillStyle = x % 2 ? a : b;
          ctx.fillRect((x * w) / 8, 0, w / 8, h);
        }
      },
      false,
    );
  track.balloons = [];
  if (track.def.scenery?.balloons === false) return;
  const colors = [["#ff3d5a", "#ffd23f"], ["#3a86ff", "#ffffff"], ["#2ec27e", "#ffd23f"], ["#8e5cf7", "#ff70a6"]];
  for (let i = 0; i < 4; i++) {
    const b = new THREE.Group();
    const env = new THREE.Mesh(new THREE.SphereGeometry(6, 20, 14), new THREE.MeshLambertMaterial({ map: stripe(...colors[i]) }));
    env.scale.y = 1.2;
    b.add(env);
    const basket = new THREE.Mesh(new THREE.BoxGeometry(2, 1.6, 2), new THREE.MeshLambertMaterial({ color: 0x8a5a2b }));
    basket.position.y = -9.5;
    b.add(basket);
    const a = (i / 4) * Math.PI * 2 + 0.6;
    b.position.set(cx + Math.cos(a) * 260, 70 + i * 12, cz + Math.sin(a) * 260);
    b.userData = { baseY: b.position.y, phase: i * 1.7 };
    track.balloons.push(b);
    g.add(b);
  }
}
