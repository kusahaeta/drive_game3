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
  const terrain = buildTerrain(track);
  track.terrain = terrain;
  g.add(terrain.mesh);
  track.water = buildWater(track, terrain.size, terrain.center);
  g.add(track.water);

  buildRoad(track, g, tex);
  buildBridges(track, g, tex);
  buildGapFaces(track, g, tex);
  buildRamps(track, g);
  buildTunnels(track, g, tex);
  buildStart(track, g);
  buildBoostPads(track, g);
  buildSigns(track, g);
  buildGrandstand(track, g);
  buildNature(track, g, terrain);
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
      ctx.fillStyle = th.roadLine;
      ctx.fillRect(14, 0, 12, h);
      ctx.fillRect(w - 26, 0, 12, h);
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.fillRect(w / 2 - 4, 0, 8, h * 0.4);
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
    concrete: canvasTexture(64, 64, (ctx, w, h) => {
      ctx.fillStyle = "#cfc9bd";
      ctx.fillRect(0, 0, w, h);
      speckle(ctx, w, h, 500, ["rgba(0,0,0,0.1)", "rgba(255,255,255,0.15)"]);
      ctx.fillStyle = "#e5a93a";
      ctx.fillRect(0, h * 0.45, w, 5);
    }),
  };
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
    },
    vertexShader: `varying vec3 vDir;
      void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 top; uniform vec3 bottom; uniform vec3 sunColor; uniform vec3 sunDir; varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        vec3 col = mix(bottom, top, smoothstep(-0.02, 0.55, d.y));
        float s = max(dot(d, sunDir), 0.0);
        col += sunColor * (pow(s, 900.0) * 6.0 + pow(s, 24.0) * 0.35 + pow(s, 4.0) * 0.08);
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
  const pos = new Float32Array((N + 1) * 6);
  const uv = new Float32Array((N + 1) * 4);
  const index = [];
  for (let r = 0; r <= N; r++) {
    const i = r % N;
    const v = (r * track.segLen) / vScale;
    const oL = typeof offL === "function" ? offL(i) : offL;
    const oR = typeof offR === "function" ? offR(i) : offR;
    pos.set([track.px[i] + track.nx[i] * oL, yL(i, oL), track.pz[i] + track.nz[i] * oL], r * 6);
    pos.set([track.px[i] + track.nx[i] * oR, yR(i, oR), track.pz[i] + track.nz[i] * oR], r * 6 + 3);
    uv.set([0, v, 1, v], r * 4);
    if (r < N && include(i) && include((i + 1) % N)) {
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

function buildRoad(track, g, tex) {
  const hw = track.halfWidth;
  const wo = track.wallOffset;
  const surf = (d) => (i, off) => track.py[i] + track.bank[i] * off + d;
  const noGap = (i) => !track.gapF[i];

  // カーブの区間だけ縁石を置く
  const N = track.count;
  const curvy = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    if (Math.abs(track.turnAngle(i * track.segLen - 10, 20)) > 0.22) {
      for (let k = -8; k <= 8; k++) curvy[(i + k + N) % N] = 1;
    }
  }

  g.add(ribbon(track, wo, -wo, surf(0), surf(0), 14, lambert({ map: tex.dirt }), noGap));
  const road = ribbon(track, hw, -hw, surf(0.05), surf(0.05), 22, lambert({ map: tex.road }), noGap);
  g.add(road);
  const curbMat = lambert({ map: tex.curb });
  const curbOk = (i) => noGap(i) && curvy[i];
  g.add(ribbon(track, hw + 1.6, hw - 0.4, surf(0.1), surf(0.1), 4, curbMat, curbOk));
  g.add(ribbon(track, -hw + 0.4, -hw - 1.6, surf(0.1), surf(0.1), 4, curbMat, curbOk));

  // 壁（橋の上は手すり、崖側は無し）
  const wallMat = lambert({ map: tex.wall });
  const railMat = lambert({ map: tex.rail, transparent: true, alphaTest: 0.5 });
  for (const side of [1, -1]) {
    const cliff = side > 0 ? track.cliffL : track.cliffR;
    const off = wo * side;
    const wall = ribbon(track, off, off, surf(1.3), surf(-0.4), 8, wallMat, (i) => noGap(i) && !cliff[i] && !track.bridgeF[i]);
    wall.castShadow = true;
    g.add(wall);
    g.add(ribbon(track, off, off, surf(1.2), surf(0), 3, railMat, (i) => track.bridgeF[i] && !cliff[i]));
    // 路肩の側面（谷や崖の区間で岩肌として見える）
    const skirt = ribbon(track, off, off, surf(0), (i) => track.py[i] - 45, 12, lambert({ map: tex.rock }), (i) => noGap(i) && !track.bridgeF[i]);
    g.add(skirt);
  }
  track.roadMesh = road;
}

function buildBridges(track, g, tex) {
  const wo = track.wallOffset;
  const hw = track.halfWidth;
  const deck = lambert({ map: tex.concrete });
  const bridgeOk = (i) => track.bridgeF[i];
  g.add(ribbon(track, wo, -wo, (i, o) => track.py[i] + track.bank[i] * o - 1.6, (i, o) => track.py[i] + track.bank[i] * o - 1.6, 10, deck, bridgeOk));
  for (const side of [1, -1]) {
    const off = wo * side;
    g.add(ribbon(track, off, off, (i) => track.py[i] + track.bank[i] * off, (i) => track.py[i] + track.bank[i] * off - 1.6, 10, deck, bridgeOk));
  }
  const pillarMat = new THREE.MeshLambertMaterial({ map: tex.concrete });
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

  const extrude = (profile, s0, len, mat) => {
    const steps = Math.ceil(len / 2);
    const pos = [];
    const uv = [];
    const idx = [];
    const m = profile.length;
    for (let k = 0; k <= steps; k++) {
      const s = s0 + (k / steps) * len;
      track.pointAt(s, 0, p);
      const nx = Math.cos(p.heading);
      const nz = -Math.sin(p.heading);
      profile.forEach(([lat, h], j) => {
        pos.push(p.x + nx * lat, p.y + h, p.z + nz * lat);
        uv.push(j / (m - 1) * 4, (s - s0) / 8);
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
  };

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
  if (!track.boostPads.length) return;
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
  for (const pad of track.boostPads) {
    tex.repeat.set(1, pad.length / pad.width);
    const p = track.pointAt(pad.s + pad.length / 2, pad.lateral, {});
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(pad.width, pad.length), mat);
    mesh.position.set(p.x, p.surfaceY + 0.14, p.z);
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

/** 木・岩（地形の上、コースと水辺を避けて配置） */
function buildNature(track, g, terrain) {
  const th = track.theme;
  const rng = mulberry32(track.def.scenery?.seed ?? 1);
  const count = track.def.scenery?.trees ?? 400;
  const { minX, maxX, minZ, maxZ } = track.bounds;
  const spots = { pine: [], round: [], rock: [] };
  for (let tries = 0; tries < count * 12 && spots.pine.length + spots.round.length < count; tries++) {
    const x = lerp(minX - 350, maxX + 350, rng());
    const z = lerp(minZ - 350, maxZ + 350, rng());
    if (terrain.nearTrack(x, z)) continue;
    const h = terrain.heightAt(x, z);
    if (h < th.waterLevel + 1.2 || h > 70) continue;
    const slope = Math.abs(terrain.heightAt(x + 3, z) - h) + Math.abs(terrain.heightAt(x, z + 3) - h);
    if (slope > 3) {
      if (rng() < 0.3) spots.rock.push([x, h, z, 1 + rng() * 2.5]);
      continue;
    }
    (rng() < 0.6 ? spots.pine : spots.round).push([x, h, z, 0.8 + rng() * 0.9]);
    if (rng() < 0.08) spots.rock.push([x + 4, h, z + 3, 0.6 + rng()]);
  }

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const c = new THREE.Color();
  const leaf = th.treeLeaf.map((l) => new THREE.Color(l));
  const instanced = (geo, mat, list, color, rot = false) => {
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach(([x, y, z, s], i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rot ? rng() * 6 : 0);
      m.compose(new THREE.Vector3(x, y - 0.3, z), q, new THREE.Vector3(s, s * (rot ? 0.7 : 1), s));
      mesh.setMatrixAt(i, m);
      if (color) mesh.setColorAt(i, color(i));
    });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    g.add(mesh);
  };
  const trunkMat = new THREE.MeshLambertMaterial({ color: th.treeTrunk });
  const leafMat = new THREE.MeshLambertMaterial({ flatShading: true });
  const pineLeaf = mergeCones();
  instanced(new THREE.CylinderGeometry(0.35, 0.5, 3, 6).translate(0, 1.5, 0), trunkMat, spots.pine);
  instanced(pineLeaf, leafMat, spots.pine, (i) => c.copy(leaf[i % leaf.length]).offsetHSL(0, 0, (rng() - 0.5) * 0.08));
  instanced(new THREE.CylinderGeometry(0.4, 0.55, 3.4, 6).translate(0, 1.7, 0), trunkMat, spots.round);
  instanced(new THREE.IcosahedronGeometry(2.6, 1).translate(0, 5, 0), leafMat, spots.round, (i) => c.copy(leaf[(i + 1) % leaf.length]).offsetHSL(0.02, 0.05, (rng() - 0.5) * 0.1));
  instanced(new THREE.DodecahedronGeometry(1.4, 0), new THREE.MeshLambertMaterial({ color: th.rock, flatShading: true }), spots.rock, null, true);
}

function mergeCones() {
  const parts = [
    new THREE.ConeGeometry(2.6, 3.6, 8).translate(0, 3.6, 0),
    new THREE.ConeGeometry(2.1, 3.2, 8).translate(0, 5.4, 0),
    new THREE.ConeGeometry(1.5, 2.8, 8).translate(0, 7.1, 0),
  ].map((p) => p.toNonIndexed());
  const total = parts.reduce((n, p) => n + p.attributes.position.count, 0);
  const pos = new Float32Array(total * 3);
  let o = 0;
  for (const p of parts) {
    pos.set(p.attributes.position.array, o);
    o += p.attributes.position.array.length;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  return geo;
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
  const cloudMat = new THREE.SpriteMaterial({ map: cloudTex, depthWrite: false, fog: false, color: 0xffffff });
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
