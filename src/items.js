import * as THREE from "three";
import { KART_RADIUS } from "./kart.js";
import { clamp, lerp, wrapAngle } from "./utils.js";

/** アイテム一覧。追加する場合は ITEMS・WEIGHTS・ItemSystem.use() に足す */
export const ITEMS = {
  boost: { name: "ダッシュ", icon: "🚀", uses: 1 },
  triple: { name: "トリプルダッシュ", icon: "🚀", uses: 3 },
  banana: { name: "バナナ", icon: "🍌", uses: 1 },
  shell: { name: "シェル", icon: "🟢", uses: 1 },
  homing: { name: "ホーミング", icon: "🎯", uses: 1 },
};

// [先頭のときの重み, 最後尾のときの重み]
const WEIGHTS = {
  banana: [45, 4],
  shell: [35, 14],
  boost: [16, 26],
  triple: [0, 28],
  homing: [4, 28],
};

export function rollItem(rank, total, rng) {
  const t = (rank - 1) / Math.max(1, total - 1);
  const entries = Object.entries(WEIGHTS).map(([k, [a, b]]) => [k, lerp(a, b, t)]);
  let r = rng() * entries.reduce((sum, [, w]) => sum + w, 0);
  for (const [k, w] of entries) {
    if ((r -= w) <= 0) return k;
  }
  return "boost";
}

const BOX_RESPAWN = 2.5;
const tmp = { x: 0, y: 0, z: 0, heading: 0 };

function boxTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d");
  const g = ctx.createLinearGradient(0, 0, 128, 128);
  ["#ff5f6d", "#ffc371", "#7dffb0", "#6ec3ff", "#c77dff"].forEach((col, i) => g.addColorStop(i / 4, col));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, 118, 118);
  ctx.font = "bold 86px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
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

    this.geo = {
      box: new THREE.BoxGeometry(1.7, 1.7, 1.7),
      banana: new THREE.TorusGeometry(0.5, 0.2, 8, 12, Math.PI * 1.1),
      shell: new THREE.SphereGeometry(0.6, 14, 10),
      rim: new THREE.TorusGeometry(0.6, 0.1, 6, 16),
    };
    const boxTex = boxTexture();
    this.mat = {
      box: new THREE.MeshStandardMaterial({ map: boxTex, emissiveMap: boxTex, emissive: 0xffffff, emissiveIntensity: 0.7, transparent: true, opacity: 0.9 }),
      banana: new THREE.MeshStandardMaterial({ color: 0xffd93b, roughness: 0.5 }),
      shell: new THREE.MeshStandardMaterial({ color: 0x2ec27e, roughness: 0.3 }),
      homing: new THREE.MeshStandardMaterial({ color: 0xe63946, roughness: 0.3, emissive: 0x440000 }),
      rim: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 }),
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
          k.pendingItem = rollItem(k.rank, race.karts.length, race.rng);
          race.emit("itemBox", k);
        }
        break;
      }
    }

    for (const k of race.karts) {
      if (k.roulette <= 0) continue;
      k.roulette -= dt;
      if (k.roulette <= 0) {
        k.item = k.pendingItem;
        k.itemUses = ITEMS[k.item].uses;
        race.emit("itemGet", k, k.item);
      }
    }

    for (const o of this.objects) this.updateObject(o, dt);
    this.collide();
    this.objects = this.objects.filter((o) => {
      if (o.dead) this.group.remove(o.mesh);
      return !o.dead;
    });
  }

  use(kart) {
    const type = kart.item;
    if (!type) return;
    const back = kart.control.back;
    const fx = Math.sin(kart.heading);
    const fz = Math.cos(kart.heading);
    switch (type) {
      case "boost":
      case "triple":
        kart.giveBoost(1.3);
        this.race.emit("boostItem", kart);
        break;
      case "banana":
        this.spawn("banana", kart, kart.pos.x - fx * 2.8, kart.pos.z - fz * 2.8, 0, 0);
        break;
      case "shell":
      case "homing": {
        const dir = back ? -1 : 1;
        const kind = type === "homing" && !back ? "homing" : "shell";
        const speed = (kind === "homing" ? 50 : 46) + Math.max(0, kart.speed) * (back ? 0 : 0.5);
        const o = this.spawn(kind, kart, kart.pos.x + fx * 2.8 * dir, kart.pos.z + fz * 2.8 * dir, kart.heading + (back ? Math.PI : 0), speed);
        if (kind === "homing") o.target = this.race.order[kart.rank - 2] ?? null;
        break;
      }
    }
    this.race.emit("useItem", kart, type);
    kart.itemUses--;
    if (kart.itemUses <= 0) kart.item = null;
  }

  spawn(type, owner, x, z, angle, speed) {
    let mesh;
    if (type === "banana") {
      mesh = new THREE.Mesh(this.geo.banana, this.mat.banana);
      mesh.rotation.set(Math.PI / 2, 0, Math.random() * 6);
    } else {
      mesh = new THREE.Group();
      mesh.add(new THREE.Mesh(this.geo.shell, type === "homing" ? this.mat.homing : this.mat.shell));
      const rim = new THREE.Mesh(this.geo.rim, this.mat.rim);
      rim.rotation.x = Math.PI / 2;
      rim.position.y = -0.15;
      mesh.add(rim);
    }
    mesh.traverse((m) => (m.castShadow = true));
    this.group.add(mesh);
    const o = {
      type,
      owner,
      x,
      z,
      y: owner.y,
      angle,
      speed,
      age: 0,
      life: type === "banana" ? Infinity : type === "homing" ? 12 : 8,
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
    const bananas = this.objects.filter((b) => b.type === "banana");
    if (bananas.length > 24) bananas[0].dead = true;
    return o;
  }

  updateObject(o, dt) {
    const track = this.track;
    o.age += dt;
    if (o.age > o.life) o.dead = true;
    if (o.type !== "banana") {
      if (o.type === "homing") this.steerHoming(o, dt);
      o.x += Math.sin(o.angle) * o.speed * dt;
      o.z += Math.cos(o.angle) * o.speed * dt;
    }
    const p = track.locate(o.x, o.z, o, o.proj);
    const road = o.path;
    const limit = road.wallOffset - 0.6;
    if (Math.abs(p.lateral) > limit && road.wallAt(p.s, Math.sign(p.lateral))) {
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
    // 足場のない所（ギャップ・崖の外）に出たら落ちて消える
    if (!p.ground) o.dead = true;
    o.y = p.groundY;
    o.mesh.position.set(o.x, o.y + (o.type === "banana" ? 0.25 : 0.6), o.z);
    if (o.type !== "banana") o.mesh.rotation.y += dt * 12;
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

  collide() {
    const race = this.race;
    for (const o of this.objects) {
      if (o.dead) continue;
      const r = o.type === "banana" ? 0.9 : 0.7;
      for (const k of race.karts) {
        if ((k === o.owner && o.age < 0.6) || k.respawnTimer > 0) continue;
        const dx = k.pos.x - o.x;
        const dz = k.pos.z - o.z;
        const rr = r + KART_RADIUS;
        if (dx * dx + dz * dz > rr * rr || Math.abs(k.y - o.y) > 2.5) continue;
        o.dead = true;
        if (k.hit()) race.emit("hit", k, { by: o.owner, type: o.type });
        break;
      }
      if (o.dead) continue;
      for (const q of this.objects) {
        if (q === o || q.dead || (o.type === "banana" && q.type === "banana")) continue;
        const dx = q.x - o.x;
        const dz = q.z - o.z;
        if (dx * dx + dz * dz < 1.6 * 1.6) {
          o.dead = q.dead = true;
          race.burst(o.x, o.y + 0.6, o.z, [0xffffff, 0xffd93b], 14, 6);
          break;
        }
      }
    }
  }
}
