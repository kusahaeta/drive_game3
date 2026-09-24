import * as THREE from "three";
import { KART_RADIUS } from "./kart.js";
import { clamp, damp, lerp, wrapAngle } from "./utils.js";

/**
 * アイテム一覧。追加する場合は ITEMS・WEIGHTS・ItemSystem.use() に足す
 * held: 持っている間カートのまわりを回る物。
 *       持っている物は飛んできたアイテムを 1 つ防ぐ（その分 1 回減る）
 */
export const ITEMS = {
  boost: { name: "ダッシュ", icon: "🚀", uses: 1 },
  triple: { name: "トリプルダッシュ", icon: "🚀", uses: 3 },
  gold: { name: "ゴールドダッシュ", icon: "✨", uses: Infinity },
  banana: { name: "バナナ", icon: "🍌", uses: 1 },
  banana3: { name: "トリプルバナナ", icon: "🍌", uses: 3, held: "banana" },
  fake: { name: "ニセボックス", icon: "❓", uses: 1 },
  shell: { name: "シェル", icon: "🟢", uses: 1 },
  shell3: { name: "トリプルシェル", icon: "🟢", uses: 3, held: "shell" },
  homing: { name: "ホーミング", icon: "🎯", uses: 1 },
  homing3: { name: "トリプルホーミング", icon: "🎯", uses: 3, held: "homing" },
  bomb: { name: "ボム", icon: "💣", uses: 1 },
  spiny: { name: "トップシェル", icon: "🔵", uses: 1 },
  ink: { name: "スミ", icon: "🦑", uses: 1 },
  horn: { name: "ホーン", icon: "📯", uses: 1 },
  star: { name: "スター", icon: "⭐", uses: 1 },
  lightning: { name: "サンダー", icon: "⚡", uses: 1 },
  bullet: { name: "ジェット", icon: "✈️", uses: 1 },
};

// [先頭のときの重み, 最後尾のときの重み]
const WEIGHTS = {
  banana: [34, 2],
  banana3: [10, 2],
  fake: [12, 0],
  shell: [24, 6],
  shell3: [3, 10],
  horn: [6, 2],
  boost: [8, 12],
  triple: [0, 14],
  gold: [0, 8],
  homing: [3, 12],
  homing3: [0, 8],
  bomb: [0, 6],
  ink: [0, 6],
  spiny: [0, 5],
  star: [0, 18],
  lightning: [0, 8],
  bullet: [0, 12],
};

// 同時に 1 つまでのアイテム（誰かが持っている・使っている間は出ない）
const UNIQUE = ["spiny", "lightning"];

export function rollItem(rank, total, rng, exclude = []) {
  const t = (rank - 1) / Math.max(1, total - 1);
  const entries = Object.entries(WEIGHTS)
    .filter(([k]) => !exclude.includes(k))
    .map(([k, [a, b]]) => [k, lerp(a, b, t)]);
  let r = rng() * entries.reduce((sum, [, w]) => sum + w, 0);
  for (const [k, w] of entries) {
    if ((r -= w) <= 0) return k;
  }
  return "boost";
}

const BOX_RESPAWN = 2.5;
const GOLD_TIME = 7.5;
const STAR_TIME = 7;
const BULLET_TIME = 5.5;
const INK_TIME = 4.5;
const BOMB_FUSE = 2.6;
const tmp = { x: 0, y: 0, z: 0, heading: 0 };

// 当たり判定の半径と、地面からの高さ（見た目）
const RADIUS = { banana: 0.9, fake: 1.1, shell: 0.7, homing: 0.7, bomb: 0.8 };
const LIFT = { banana: 0.25, fake: 0.95, shell: 0.6, homing: 0.6, bomb: 0.7 };
const LIFE = { banana: Infinity, fake: Infinity, shell: 8, homing: 12, spiny: 30, bomb: BOMB_FUSE, blast: 0.45 };

function boxTexture(fake = false) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d");
  const g = ctx.createLinearGradient(0, 0, 128, 128);
  // ニセボックスは本物より少し赤っぽく、「?」が逆さま
  const cols = fake ? ["#ff3b5c", "#ff9a5a", "#ffd36e", "#ff6ea8", "#c77dff"] : ["#ff5f6d", "#ffc371", "#7dffb0", "#6ec3ff", "#c77dff"];
  cols.forEach((col, i) => g.addColorStop(i / 4, col));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, 118, 118);
  ctx.font = "bold 86px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (fake) {
    ctx.translate(64, 64);
    ctx.rotate(Math.PI);
    ctx.translate(-64, -64);
  }
  ctx.lineWidth = 8;
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.strokeText("?", 64, 70);
  ctx.fillStyle = "#fff";
  ctx.fillText("?", 64, 70);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class ItemSystem {
  constructor(race) {
    this.race = race;
    this.track = race.track;
    this.group = new THREE.Group();
    this.boxes = [];
    this.objects = [];
    this.held = new Map(); // kart → 持っているアイテムの見た目

    this.geo = {
      box: new THREE.BoxGeometry(1.7, 1.7, 1.7),
      banana: new THREE.TorusGeometry(0.5, 0.2, 8, 12, Math.PI * 1.1),
      shell: new THREE.SphereGeometry(0.6, 14, 10),
      rim: new THREE.TorusGeometry(0.6, 0.1, 6, 16),
      spike: new THREE.ConeGeometry(0.16, 0.45, 6),
      wing: new THREE.BoxGeometry(1.1, 0.06, 0.4),
      bomb: new THREE.SphereGeometry(0.7, 14, 10),
      fuse: new THREE.CylinderGeometry(0.08, 0.08, 0.35, 6),
      spark: new THREE.SphereGeometry(0.14, 6, 4),
      blast: new THREE.SphereGeometry(1, 16, 10),
      aura: new THREE.SphereGeometry(2.1, 16, 10),
      bulletBody: new THREE.CylinderGeometry(1.35, 1.35, 2.6, 18).rotateX(Math.PI / 2),
      bulletNose: new THREE.SphereGeometry(1.35, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2),
      bulletFin: new THREE.BoxGeometry(0.12, 1.2, 1.0),
      eye: new THREE.SphereGeometry(0.28, 8, 6),
    };
    const boxTex = boxTexture();
    const fakeTex = boxTexture(true);
    this.mat = {
      box: new THREE.MeshStandardMaterial({ map: boxTex, emissiveMap: boxTex, emissive: 0xffffff, emissiveIntensity: 0.7, transparent: true, opacity: 0.9 }),
      fake: new THREE.MeshStandardMaterial({ map: fakeTex, emissiveMap: fakeTex, emissive: 0xffffff, emissiveIntensity: 0.6, transparent: true, opacity: 0.9 }),
      banana: new THREE.MeshStandardMaterial({ color: 0xffd93b, roughness: 0.5 }),
      shell: new THREE.MeshStandardMaterial({ color: 0x2ec27e, roughness: 0.3 }),
      homing: new THREE.MeshStandardMaterial({ color: 0xe63946, roughness: 0.3, emissive: 0x440000 }),
      spiny: new THREE.MeshStandardMaterial({ color: 0x2f6bff, roughness: 0.3, emissive: 0x0a1a66 }),
      rim: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 }),
      bomb: new THREE.MeshStandardMaterial({ color: 0x1d1d26, roughness: 0.35, metalness: 0.3 }),
      spark: new THREE.MeshBasicMaterial({ color: 0xffd23f }),
      bullet: new THREE.MeshStandardMaterial({ color: 0x1b1b22, roughness: 0.35, metalness: 0.4 }),
      eye: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x552222 }),
    };

    // メインコースと各枝道のアイテムボックス列
    for (const path of this.track.paths) {
      const hw = path.halfWidth;
      const n = hw < 7 ? 3 : 4;
      for (const s of path.itemRows) {
        for (let k = 0; k < n; k++) {
          const lateral = (k - (n - 1) / 2) * hw * (n === 3 ? 0.55 : 0.42);
          this.addBox(path.pointAt(s, lateral, {}), k);
        }
      }
    }
  }

  addBox(p, k) {
    const mesh = new THREE.Mesh(this.geo.box, this.mat.box);
    mesh.castShadow = true;
    mesh.position.set(p.x, p.surfaceY + 1.4, p.z);
    mesh.rotation.set(0.5, k, 0.3);
    this.group.add(mesh);
    this.boxes.push({ mesh, x: p.x, y: p.surfaceY, z: p.z, active: true, timer: 0, phase: k });
  }

  /** 同時に 1 つまでのアイテムで、いま誰かが持っている・使っているもの */
  activeUnique() {
    const race = this.race;
    return UNIQUE.filter(
      (type) =>
        this.objects.some((o) => o.type === type) ||
        race.karts.some((k) => k.item === type || (k.roulette > 0 && k.pendingItem === type)) ||
        (type === "lightning" && race.karts.some((k) => k.shrinkTimer > 0)),
    );
  }

  update(dt) {
    const race = this.race;
    for (const box of this.boxes) {
      box.mesh.rotation.y += dt * 1.5;
      box.mesh.position.y = box.y + 1.4 + Math.sin(race.clock * 2.5 + box.phase) * 0.18;
      if (!box.active) {
        box.timer -= dt;
        if (box.timer <= 0) {
          box.active = true;
          box.mesh.visible = true;
        }
        continue;
      }
      box.mesh.scale.setScalar(Math.min(1, box.mesh.scale.x + dt * 3));
      for (const k of race.karts) {
        if (k.respawnTimer > 0) continue;
        const dx = k.pos.x - box.x;
        const dz = k.pos.z - box.z;
        if (dx * dx + dz * dz > 2.4 * 2.4) continue;
        box.active = false;
        box.timer = BOX_RESPAWN;
        box.mesh.visible = false;
        box.mesh.scale.setScalar(0.1);
        race.burst(box.x, box.y + 1.4, box.z, [0xff5f6d, 0xffc371, 0x7dffb0, 0x6ec3ff], 26, 9);
        if (!k.item && k.roulette <= 0) {
          k.roulette = k.isPlayer ? 1.2 : 0.8;
          k.pendingItem = rollItem(k.rank, race.karts.length, race.rng, this.activeUnique());
          race.emit("itemBox", k);
        }
        break;
      }
    }

    for (const k of race.karts) {
      // ゴールドダッシュは時間切れでなくなる
      if (k.goldTimer > 0 && (k.goldTimer -= dt) <= 0 && k.item === "gold") k.item = null;
      if (k.roulette <= 0) continue;
      k.roulette -= dt;
      if (k.roulette <= 0) {
        k.item = k.pendingItem;
        k.itemUses = ITEMS[k.item].uses;
        race.emit("itemGet", k, k.item);
      }
    }

    for (const o of this.objects) this.updateObject(o, dt);
    this.updateHeld();
    this.updateKartFx(dt);
    this.collide();
    this.objects = this.objects.filter((o) => {
      if (o.dead) {
        this.group.remove(o.mesh);
        if (o.type === "blast") o.mesh.material.dispose();
      }
      return !o.dead;
    });
  }

  use(kart) {
    const type = kart.item;
    if (!type) return;
    const race = this.race;
    const back = kart.control.back;
    const fx = Math.sin(kart.heading);
    const fz = Math.cos(kart.heading);
    const base = ITEMS[type].held ?? type;
    switch (base) {
      case "boost":
      case "triple":
        kart.giveBoost(1.3);
        race.emit("boostItem", kart);
        break;
      case "gold":
        if (!(kart.goldTimer > 0)) kart.goldTimer = GOLD_TIME;
        kart.giveBoost(1.1, 0xffd23f);
        race.emit("boostItem", kart);
        break;
      case "banana":
      case "fake":
        this.spawn(base, kart, kart.pos.x - fx * 2.8, kart.pos.z - fz * 2.8, 0, 0);
        break;
      case "shell":
      case "homing": {
        const dir = back ? -1 : 1;
        const kind = base === "homing" && !back ? "homing" : "shell";
        const speed = (kind === "homing" ? 50 : 46) + Math.max(0, kart.speed) * (back ? 0 : 0.5);
        const o = this.spawn(kind, kart, kart.pos.x + fx * 2.8 * dir, kart.pos.z + fz * 2.8 * dir, kart.heading + (back ? Math.PI : 0), speed);
        if (kind === "homing") o.target = race.order[kart.rank - 2] ?? null;
        break;
      }
      case "bomb": {
        // 前へ放り投げる（↓ を押しながらなら後ろにそっと置く）
        const dir = back ? -1 : 1;
        const o = this.spawn("bomb", kart, kart.pos.x + fx * 2.8 * dir, kart.pos.z + fz * 2.8 * dir, kart.heading + (back ? Math.PI : 0), back ? 4 : 30 + Math.max(0, kart.speed) * 0.4);
        o.vy = back ? 0 : 9;
        break;
      }
      case "spiny": {
        // 1 位をねらって空を飛んでいき、1 位の上で爆発する
        const o = this.spawn("spiny", kart, kart.pos.x + fx * 2.8, kart.pos.z + fz * 2.8, kart.heading, 60);
        o.target = race.order.find((k) => !k.finished) ?? null;
        race.emit("spiny", kart, o.target);
        break;
      }
      case "ink":
        // 自分より前の全員の画面にスミをかける
        for (const k of race.karts) if (k.rank < kart.rank && !k.finished) k.inkTimer = INK_TIME;
        race.emit("ink", kart);
        break;
      case "horn":
        this.blast(kart.pos.x, kart.y, kart.pos.z, 9, kart, { hitOwner: false, colors: [0x9fe7ff, 0xffffff] });
        race.emit("horn", kart);
        break;
      case "star":
        kart.starTimer = STAR_TIME;
        kart.giveBoost(0.6);
        race.emit("star", kart);
        break;
      case "lightning":
        // 自分以外の全員がスピンして小さくなる。前にいるほど長く縮む
        for (const k of race.karts) {
          if (k === kart || k.finished || k.respawnTimer > 0 || k.starTimer > 0 || k.bulletTimer > 0) continue;
          const t = (k.rank - 1) / Math.max(1, race.karts.length - 1);
          k.shrinkTimer = lerp(6, 2.5, t);
          k.hit(true);
          k.item = null;
          k.roulette = 0;
          race.burst(k.pos.x, k.y + 1.5, k.pos.z, [0xfff27a, 0xffffff], 12, 5);
        }
        race.emit("lightning", kart);
        break;
      case "bullet":
        kart.bulletTimer = BULLET_TIME;
        kart.drifting = false;
        kart.spinTimer = 0;
        race.emit("bullet", kart);
        break;
    }
    race.emit("useItem", kart, type);
    kart.itemUses--;
    if (kart.itemUses <= 0) kart.item = null;
  }

  makeMesh(type) {
    let mesh;
    switch (type) {
      case "banana":
        mesh = new THREE.Mesh(this.geo.banana, this.mat.banana);
        mesh.rotation.set(Math.PI / 2, 0, Math.random() * 6);
        break;
      case "fake":
        mesh = new THREE.Mesh(this.geo.box, this.mat.fake);
        mesh.scale.setScalar(0.85);
        mesh.rotation.set(0.5, 0, 0.3);
        break;
      case "bomb": {
        mesh = new THREE.Group();
        mesh.add(new THREE.Mesh(this.geo.bomb, this.mat.bomb));
        const fuse = new THREE.Mesh(this.geo.fuse, this.mat.rim);
        fuse.position.y = 0.8;
        const spark = new THREE.Mesh(this.geo.spark, this.mat.spark);
        spark.position.y = 1.0;
        mesh.add(fuse, spark);
        mesh.userData.spark = spark;
        break;
      }
      case "blast":
        mesh = new THREE.Mesh(this.geo.blast, new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.8, depthWrite: false }));
        return mesh;
      default: {
        // シェル類：本体と白いふち。トップシェルはトゲと羽つき
        mesh = new THREE.Group();
        mesh.add(new THREE.Mesh(this.geo.shell, this.mat[type]));
        const rim = new THREE.Mesh(this.geo.rim, this.mat.rim);
        rim.rotation.x = Math.PI / 2;
        rim.position.y = -0.15;
        mesh.add(rim);
        if (type === "spiny") {
          for (let i = 0; i < 7; i++) {
            const spike = new THREE.Mesh(this.geo.spike, this.mat.rim);
            const a = (i / 6) * Math.PI * 2;
            const up = i === 6;
            spike.position.set(up ? 0 : Math.sin(a) * 0.42, up ? 0.62 : 0.38, up ? 0 : Math.cos(a) * 0.42);
            spike.lookAt(spike.position.clone().multiplyScalar(3));
            spike.rotateX(Math.PI / 2);
            mesh.add(spike);
          }
          for (const s of [-1, 1]) {
            const wing = new THREE.Mesh(this.geo.wing, this.mat.rim);
            wing.position.set(s * 0.95, 0.1, 0);
            mesh.add(wing);
            (mesh.userData.wings ??= []).push(wing);
          }
        }
      }
    }
    mesh.traverse((m) => (m.castShadow = true));
    return mesh;
  }

  spawn(type, owner, x, z, angle, speed) {
    const mesh = this.makeMesh(type);
    this.group.add(mesh);
    const o = {
      type,
      owner,
      x,
      z,
      y: owner.y,
      vy: 0,
      h: 0, // 地面からの高さ（ボムの放物線・トップシェルの飛行）
      angle,
      speed,
      age: 0,
      life: LIFE[type],
      bounces: 0,
      mesh,
      target: null,
      dead: false,
      path: owner.path ?? this.track,
      proj: { idx: owner.proj.idx },
    };
    this.track.locate(x, z, o, o.proj);
    this.objects.push(o);
    // 置きすぎ防止
    const traps = this.objects.filter((b) => b.type === "banana" || b.type === "fake");
    if (traps.length > 24) traps[0].dead = true;
    return o;
  }

  /** 爆発：半径 radius の中のカートをスピンさせ、置いてあるアイテムを壊す */
  blast(x, y, z, radius, owner, { hitOwner = true, colors = [0xffa040, 0xffd23f, 0xff5030, 0x333333] } = {}) {
    const race = this.race;
    const o = this.spawn("blast", owner, x, z, 0, 0);
    o.y = y;
    o.radius = radius;
    o.mesh.material.color.set(colors[0]);
    o.mesh.position.set(x, y + 1, z);
    for (const k of race.karts) {
      if (k.respawnTimer > 0 || (k === owner && !hitOwner)) continue;
      if (Math.hypot(k.pos.x - x, k.pos.z - z) > radius + KART_RADIUS || Math.abs(k.y - y) > 4) continue;
      if (k.hit()) race.emit("hit", k, { by: owner, type: "blast" });
    }
    for (const q of this.objects) {
      if (q === o || q.type === "blast" || q.dead) continue;
      if (Math.hypot(q.x - x, q.z - z) < radius) q.dead = true;
    }
    race.burst(x, y + 1, z, colors, 40, radius * 1.4);
    race.emit("explode", null, { x, y, z, radius });
  }

  explode(o) {
    if (o.dead) return;
    o.dead = true;
    this.blast(o.x, o.y + o.h, o.z, o.type === "spiny" ? 7 : 7.5, o.owner);
  }

  updateObject(o, dt) {
    if (o.dead) return;
    const track = this.track;
    o.age += dt;
    if (o.type === "blast") {
      const k = o.age / o.life;
      o.mesh.scale.setScalar(o.radius * (0.3 + 0.8 * Math.sqrt(k)));
      o.mesh.material.opacity = 0.8 * (1 - k);
      if (k >= 1) o.dead = true;
      return;
    }
    if (o.age > o.life) {
      if (o.type === "bomb") this.explode(o);
      else o.dead = true;
      return;
    }
    const moving = o.type !== "banana" && o.type !== "fake";
    if (moving) {
      if (o.type === "homing") this.steerHoming(o, dt);
      if (o.type === "spiny" && !this.steerSpiny(o, dt)) return;
      if (o.type === "bomb") {
        o.speed = damp(o.speed, 0, o.h > 0 ? 0.3 : 2.5, dt);
        o.vy -= 26 * dt;
        o.h += o.vy * dt;
        if (o.h <= 0) {
          o.h = 0;
          o.vy = o.vy < -4 ? -o.vy * 0.35 : 0; // 地面で少しはねる
        }
      }
      o.x += Math.sin(o.angle) * o.speed * dt;
      o.z += Math.cos(o.angle) * o.speed * dt;
    }
    const p = track.locate(o.x, o.z, o, o.proj);
    const flying = o.type === "spiny";
    const road = o.path;
    const limit = road.wallOffset - 0.6;
    if (!flying && Math.abs(p.lateral) > limit && road.wallAt(p.s, Math.sign(p.lateral))) {
      const sgn = Math.sign(p.lateral);
      const push = Math.abs(p.lateral) - limit;
      o.x -= p.nx * push * sgn;
      o.z -= p.nz * push * sgn;
      let vx = Math.sin(o.angle);
      let vz = Math.cos(o.angle);
      const vn = (vx * p.nx + vz * p.nz) * sgn;
      if (vn > 0) {
        vx -= 2 * vn * p.nx * sgn;
        vz -= 2 * vn * p.nz * sgn;
        o.angle = Math.atan2(vx, vz);
        if (++o.bounces > 5) o.dead = true;
      }
    }
    // 足場のない所（ギャップ・崖の外）に出たら落ちて消える（トップシェルは飛んでいるので平気）
    if (!p.ground && !flying) o.dead = true;
    if (p.ground) o.y = p.groundY;
    else if (flying) o.y = damp(o.y, p.y, 3, dt);
    o.mesh.position.set(o.x, o.y + (flying ? o.h : LIFT[o.type] + o.h), o.z);
    if (o.type === "shell" || o.type === "homing") o.mesh.rotation.y += dt * 12;
    else if (o.type === "fake") o.mesh.rotation.y += dt * 1.5;
    else if (o.type === "bomb") {
      o.mesh.rotation.y = o.angle;
      o.mesh.userData.spark.visible = Math.floor(o.age * (o.life - o.age < 0.8 ? 20 : 8)) % 2 === 0;
    } else if (flying) {
      o.mesh.rotation.y = o.angle;
      for (const w of o.mesh.userData.wings) w.rotation.z = Math.sin(o.age * 30) * 0.5 * Math.sign(w.position.x);
    }
  }

  steerHoming(o, dt) {
    const t = o.target;
    let aim;
    if (t && !t.finished) {
      const dx = t.pos.x - o.x;
      const dz = t.pos.z - o.z;
      if (dx * dx + dz * dz < 30 * 30) aim = Math.atan2(dx, dz);
      else {
        o.path.pointAt(o.proj.s + 14, clamp(t.proj.lateral, -4, 4), tmp);
        aim = Math.atan2(tmp.x - o.x, tmp.z - o.z);
      }
    } else {
      o.path.pointAt(o.proj.s + 14, 0, tmp);
      aim = Math.atan2(tmp.x - o.x, tmp.z - o.z);
    }
    const turn = 5 * dt;
    o.angle += clamp(wrapAngle(aim - o.angle), -turn, turn);
  }

  /** トップシェル：コースに沿って 1 位まで飛び、近づいたら真上から落ちる。爆発したら false */
  steerSpiny(o, dt) {
    let t = o.target;
    if (!t || t.finished) t = o.target = this.race.order.find((k) => !k.finished) ?? null;
    if (!t) {
      o.dead = true;
      return false;
    }
    const dx = t.pos.x - o.x;
    const dz = t.pos.z - o.z;
    const d = Math.hypot(dx, dz);
    if (d < 2.5 && o.age > 0.5) {
      o.x = t.pos.x;
      o.z = t.pos.z;
      o.y = t.y;
      o.h = 0;
      this.explode(o);
      return false;
    }
    // 近いか、相手が後ろ（自分が 1 位で投げた）なら直接ねらう。遠ければコースに沿って進む
    const behind = this.track.deltaS(t.proj.mainS ?? t.proj.s, o.proj.mainS ?? o.proj.s) < 0;
    let aim;
    if (d < 28 || behind) aim = Math.atan2(dx, dz);
    else {
      o.path.pointAt(o.proj.s + 16, 0, tmp);
      aim = Math.atan2(tmp.x - o.x, tmp.z - o.z);
    }
    const turn = (d < 28 ? 14 : 7) * dt;
    o.angle += clamp(wrapAngle(aim - o.angle), -turn, turn);
    // 近づいたら相手より少し速いくらいまで落として真上から狙う
    o.speed = d < 28 ? Math.max(Math.abs(t.speed) + 14, Math.min(60, d * 2.5)) : 60;
    o.h = d < 18 && o.age > 0.5 ? lerp(0.6, 5, d / 18) : damp(o.h, 5, 4, dt);
    return true;
  }

  /** 持っているトリプル系アイテムを 1 つ消費して身を守る。守れたら true */
  consumeHeld(k) {
    if (!ITEMS[k.item]?.held || k.roulette > 0 || k.itemUses <= 0) return false;
    if (--k.itemUses <= 0) k.item = null;
    return true;
  }

  /** トリプル系：持っている物がカートのまわりを回る */
  updateHeld() {
    const race = this.race;
    for (const k of race.karts) {
      const type = ITEMS[k.item]?.held;
      const n = type && k.roulette <= 0 && k.respawnTimer <= 0 ? k.itemUses : 0;
      let list = this.held.get(k);
      if (!list) this.held.set(k, (list = []));
      if (list.type !== type) {
        for (const m of list) this.group.remove(m);
        list.length = 0;
        list.type = type;
      }
      while (list.length > n) this.group.remove(list.pop());
      while (list.length < n) {
        const m = this.makeMesh(type);
        this.group.add(m);
        list.push(m);
      }
      const size = k.size ?? 1;
      const banana = type === "banana";
      list.forEach((m, i) => {
        const a = race.clock * 4 + (i / n) * Math.PI * 2;
        m.position.set(k.pos.x + Math.sin(a) * 2.4 * size, k.y + (banana ? 0.4 : 0.7) * size, k.pos.z + Math.cos(a) * 2.4 * size);
        if (banana) m.rotation.z += 0.15; // 寝かせてあるので z 軸で回すと水平に回る
        else m.rotation.y += 0.3;
        m.scale.setScalar(size);
      });
    }
  }

  /** スターのオーラ・ジェットの弾の見た目（カートの子にしておき、使うときだけ表示） */
  updateKartFx(dt) {
    const race = this.race;
    for (const k of race.karts) {
      const star = k.starTimer > 0;
      const bullet = k.bulletTimer > 0;
      if (!k.fx && !star && !bullet) continue;
      if (!k.fx) {
        const aura = new THREE.Mesh(this.geo.aura, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false }));
        aura.position.y = 0.9;
        const shell = new THREE.Group();
        const body = new THREE.Mesh(this.geo.bulletBody, this.mat.bullet);
        const nose = new THREE.Mesh(this.geo.bulletNose, this.mat.bullet);
        nose.position.z = 1.3;
        shell.add(body, nose);
        for (const s of [-1, 1]) {
          const eye = new THREE.Mesh(this.geo.eye, this.mat.eye);
          eye.position.set(s * 0.55, 0.55, 1.95);
          const fin = new THREE.Mesh(this.geo.bulletFin, this.mat.rim);
          fin.position.set(s * 1.35, 0, -1.0);
          fin.rotation.z = (s * Math.PI) / 2;
          shell.add(eye, fin);
        }
        const topFin = new THREE.Mesh(this.geo.bulletFin, this.mat.rim);
        topFin.position.set(0, 1.35, -1.0);
        shell.add(topFin);
        shell.position.y = 1.1;
        shell.traverse((m) => (m.castShadow = true));
        k.mesh.add(aura, shell);
        k.fx = { aura, shell };
      }
      k.fx.aura.visible = star;
      k.fx.shell.visible = bullet;
      k.model.body.visible = !bullet;
      for (const w of k.model.wheels) w.visible = !bullet;
      if (star) {
        k.fx.aura.material.color.setHSL((race.clock * 1.5) % 1, 1, 0.6);
        if (Math.random() < 0.6) {
          const a = Math.random() * Math.PI * 2;
          const col = new THREE.Color().setHSL(Math.random(), 1, 0.65).getHex();
          race.particles.spawn(k.pos.x + Math.sin(a) * 1.5, k.y + 0.5 + Math.random() * 1.5, k.pos.z + Math.cos(a) * 1.5, 0, 2, 0, col, 0.4);
        }
      }
      if (bullet && Math.random() < 0.8) {
        const sin = Math.sin(k.heading);
        const cos = Math.cos(k.heading);
        race.particles.spawn(k.pos.x - sin * 2.6, k.y + 1.1, k.pos.z - cos * 2.6, -sin * 6, 0.5, -cos * 6, Math.random() < 0.5 ? 0xdddddd : 0x888888, 0.5);
      }
    }
  }

  collide() {
    const race = this.race;
    for (const o of this.objects) {
      if (o.dead || o.type === "blast" || o.type === "spiny") continue;
      const r = RADIUS[o.type];
      for (const k of race.karts) {
        if ((k === o.owner && o.age < 0.6) || k.respawnTimer > 0) continue;
        const dx = k.pos.x - o.x;
        const dz = k.pos.z - o.z;
        const rr = r + KART_RADIUS;
        if (dx * dx + dz * dz > rr * rr || Math.abs(k.y - (o.y + o.h)) > 2.5) continue;
        if (o.type === "bomb") {
          this.explode(o);
          break;
        }
        o.dead = true;
        if (this.consumeHeld(k)) race.burst(o.x, o.y + 0.6, o.z, [0xffffff, 0xffd93b], 14, 6);
        else if (k.hit()) race.emit("hit", k, { by: o.owner, type: o.type });
        break;
      }
      if (o.dead) continue;
      for (const q of this.objects) {
        if (q === o || q.dead || q.type === "blast" || q.type === "spiny") continue;
        const trap = (t) => t === "banana" || t === "fake";
        if (trap(o.type) && trap(q.type)) continue;
        const dx = q.x - o.x;
        const dz = q.z - o.z;
        if (dx * dx + dz * dz < 1.6 * 1.6) {
          if (o.type === "bomb" || q.type === "bomb") {
            const bomb = o.type === "bomb" ? o : q;
            (bomb === o ? q : o).dead = true;
            this.explode(bomb);
          } else {
            o.dead = q.dead = true;
            race.burst(o.x, o.y + 0.6, o.z, [0xffffff, 0xffd93b], 14, 6);
          }
          break;
        }
      }
    }

    // まわりを回っているシェル・バナナは、ぶつかった相手をスピンさせる
    // 同じ相手には少しの間当たらない（隣の 1 個が続けて当たって一度に何個も減るのを防ぐ）
    for (const [k, list] of this.held) {
      if (!list.length) continue;
      const recent = (list.recent ??= new Map());
      hitCheck: for (const m of list) {
        for (const q of race.karts) {
          if (q === k || q.respawnTimer > 0 || recent.get(q) > race.clock) continue;
          const dx = q.pos.x - m.position.x;
          const dz = q.pos.z - m.position.z;
          const rr = 0.6 + KART_RADIUS;
          if (dx * dx + dz * dz > rr * rr || Math.abs(q.y - k.y) > 2.5) continue;
          if (q.hit()) race.emit("hit", q, { by: k, type: list.type });
          this.consumeHeld(k);
          recent.set(q, race.clock + 1);
          race.burst(m.position.x, m.position.y, m.position.z, [0xffffff, 0xffd93b], 10, 5);
          break hitCheck;
        }
      }
    }
  }
}
