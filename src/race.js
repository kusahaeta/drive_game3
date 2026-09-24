import * as THREE from "three";
import { Track } from "./track.js";
import { Kart, DRIFT_LEVELS, BOOST_COLOR } from "./kart.js";
import { AIDriver } from "./ai.js";
import { ItemSystem } from "./items.js";
import { HazardSystem } from "./hazards.js";
import { clamp, damp, lerp, mulberry32 } from "./utils.js";

/** 出場する 8 台。0 番がプレイヤー、残り 7 台が NPC */
export const RACERS = [
  { name: "YOU", color: 0xe63946, accent: 0xffffff },
  { name: "ソラ", color: 0x3a86ff, accent: 0xffd23f },
  { name: "ミドリ", color: 0x2ec27e, accent: 0xffffff },
  { name: "レモン", color: 0xffd23f, accent: 0x3a3a3a },
  { name: "サクラ", color: 0xff70a6, accent: 0xffffff },
  { name: "コハク", color: 0xff8c42, accent: 0x2b2d42 },
  { name: "シオン", color: 0x8e5cf7, accent: 0xffd23f },
  { name: "アクア", color: 0x20c4d8, accent: 0xffffff },
];

export const DIFFICULTIES = {
  easy: { label: "かんたん", aiSpeed: [0.86, 0.92], rubber: 0.06, aggro: 0.45 },
  normal: { label: "ふつう", aiSpeed: [0.92, 0.98], rubber: 0.09, aggro: 0.75 },
  hard: { label: "むずかしい", aiSpeed: [0.97, 1.02], rubber: 0.12, aggro: 1 },
};

const PLAYER_GRID_SLOT = 5; // 0 がポールポジション
const COUNTDOWN = 4;
const BULLET_SPEED = 50;
const tmp = { x: 0, y: 0, z: 0, heading: 0 };

export class Race {
  constructor({ scene, trackDef, difficulty = "normal", particles, sound, demo = false, onEvent = () => {} }) {
    this.scene = scene;
    this.particles = particles;
    this.sound = sound;
    this.demo = demo;
    this.onEvent = onEvent;
    this.diff = DIFFICULTIES[difficulty] ?? DIFFICULTIES.normal;
    this.rng = mulberry32(demo ? 1234 : (Math.random() * 1e9) | 0);

    this.group = new THREE.Group();
    scene.add(this.group);
    this.track = new Track(trackDef);
    this.music = trackDef.music;
    this.group.add(this.track.buildScene());
    this.laps = demo ? Infinity : this.track.laps;

    this.clock = 0; // カウントダウン込みの経過時間
    this.time = 0; // レースタイム
    this.state = demo ? "racing" : "countdown"; // countdown → racing → finished → done
    this.countdown = COUNTDOWN;
    this.countdownText = "";
    this.goTimer = 0;
    this.finishCounter = 0;
    this.resultTimer = 0;

    this.karts = RACERS.map((r, i) => new Kart({ index: i, ...r, isPlayer: i === 0 && !demo }));
    this.player = this.karts[0];

    // グリッド：NPC はランダム、プレイヤーは固定位置
    const npcs = this.karts.slice(1).sort(() => this.rng() - 0.5);
    const grid = [...npcs];
    grid.splice(PLAYER_GRID_SLOT, 0, this.player);
    grid.forEach((k, slot) => {
      const row = Math.floor(slot / 2);
      const side = slot % 2 === 0 ? 1 : -1;
      k.place(this.track, this.track.length - 7 - row * 7 - (slot % 2) * 3.5, side * this.track.halfWidth * 0.42);
      this.group.add(k.mesh);
    });

    this.drivers = new Map();
    for (const k of this.karts) {
      const pilot = k === this.player;
      const speed = pilot ? 1 : lerp(this.diff.aiSpeed[0], this.diff.aiSpeed[1], this.rng());
      this.drivers.set(k, new AIDriver(k, this, mulberry32((this.rng() * 1e9) | 0), { speed, aggro: this.diff.aggro }));
    }

    this.items = new ItemSystem(this);
    this.group.add(this.items.group);
    this.hazards = new HazardSystem(this);
    this.group.add(this.hazards.group);
    this.order = [...grid];
    this.updateRanks();
  }

  update(dt, input) {
    this.clock += dt;
    this.track.update(dt, this.clock);
    if (this.state === "countdown") this.updateCountdown(dt);
    else this.time += dt;
    if (this.goTimer > 0 && (this.goTimer -= dt) <= 0) this.countdownText = "";

    const live = this.state !== "countdown";
    for (const k of this.karts) {
      const c = k.control;
      if (k.isPlayer && !k.finished) input.readDriving(c);
      else this.drivers.get(k).update(dt);

      if (!live) {
        // スタートダッシュ判定用にアクセルを押し始めたタイミングを記録
        if (c.throttle && k.throttleAt == null) k.throttleAt = this.countdown;
        if (!c.throttle) k.throttleAt = null;
        c.throttle = c.brake = c.steer = 0;
        c.drift = c.item = false;
      }

      k.speedMult = k.isPlayer || this.demo ? 1 : this.rubberBand(k);
      if (k.respawnTimer > 0) {
        this.updateRespawn(k, dt);
        continue;
      }
      if (k.bulletTimer > 0) this.moveBullet(k, dt);
      else k.physics(dt, this);

      if (c.item && !k.prevItem && k.item && k.roulette <= 0 && k.spinTimer <= 0 && k.bulletTimer <= 0) this.items.use(k);
      k.prevItem = c.item;
      this.checkBoostPads(k);
    }

    this.collideKarts();
    this.items.update(dt);
    this.hazards.update(dt);
    for (const k of this.karts) this.updateProgress(k);
    this.updateRanks();
    this.updateEffects();
    this.updatePlayerState(dt);

    if (this.state === "finished") {
      this.resultTimer += dt;
      if (this.resultTimer > 5 || this.karts.every((k) => k.finished)) this.state = "done";
    }
  }

  updateCountdown(dt) {
    this.countdown -= dt;
    const n = this.countdown > 3 ? 0 : Math.ceil(this.countdown);
    if (n !== this.lastCount && n >= 1) {
      this.lastCount = n;
      this.countdownText = String(n);
      this.sound.play("count");
    }
    if (this.countdown > 0) return;

    this.state = "racing";
    this.countdownText = "GO!";
    this.goTimer = 1;
    this.sound.play("go");
    if (!this.demo) this.sound.playMusic(this.music, true); // BGM はスタートと同時に
    for (const k of this.karts) {
      const drv = this.drivers.get(k);
      // プレイヤー：「1」の間にアクセルを押すとロケットスタート、早すぎるとエンスト
      if (k.isPlayer) {
        if (k.throttleAt != null && k.throttleAt > 0.25 && k.throttleAt < 1.05) {
          k.giveBoost(1.1);
          this.emit("rocket", k);
        } else if (k.throttleAt != null && k.throttleAt > 2.2) {
          k.stall = 0.9;
          this.emit("stall", k);
        }
      } else if (drv.rng() < 0.45 + this.diff.aggro * 0.3) k.giveBoost(0.9);
      k.throttleAt = null;
    }
  }

  /** コースから落ちた：少し待ってからコース上に戻す */
  fallOut(k) {
    if (k.respawnTimer > 0) return;
    k.respawnTimer = 1.4;
    k.fallS = k.proj.s;
    k.fallPath = k.path ?? this.track;
    k.speed = 0;
    k.drifting = false;
    k.boostTimer = 0;
    this.emit("fall", k);
  }

  updateRespawn(k, dt) {
    k.respawnTimer -= dt;
    k.mesh.visible = false;
    if (k.respawnTimer > 0) return;
    let s = k.fallS;
    const path = k.fallPath ?? this.track;
    if (path === this.track) {
      // ギャップの途中で落ちたら向こう岸へ
      for (const g of this.track.gaps) {
        if (this.track.inRange(g, s) || this.track.inRange(g, s + 8)) s = g.s0 + g.len + 8;
      }
    } else s = Math.min(Math.max(s, 3), path.length - 3);
    const lap = k.lap;
    const prevIdx = k.trackIdx;
    k.place(this.track, s, 0, path);
    k.trackIdx = prevIdx; // 周回判定を place で飛ばさない
    k.lap = lap;
    k.y += 4;
    k.airborne = true;
    k.invuln = 2;
    k.respawned = true;
    k.mesh.visible = true;
    this.burst(k.pos.x, k.y, k.pos.z, [0xffffff, 0x9fd3ff], 20, 6);
  }

  /** ジェット中：操作は受け付けず、NPC と同じルート選びでコースの中央を高速で進む（壁・穴は無視） */
  moveBullet(k, dt) {
    const drv = this.drivers.get(k);
    const path = k.path ?? this.track;
    const lateral = damp(k.proj.lateral, 0, 2.5, dt);
    this.track.routePoint(path, k.proj.s, BULLET_SPEED * dt, lateral, drv.choose, tmp);
    k.pos.x = tmp.x;
    k.pos.z = tmp.z;
    k.heading = k.moveAngle = tmp.heading;
    k.speed = BULLET_SPEED;
    this.track.locate(k.pos.x, k.pos.z, k, k.proj);
    k.y = damp(k.y, tmp.surfaceY ?? tmp.y, 10, dt);
    k.vy = 0;
    k.airborne = k.launched = k.trick = k.drifting = false;
    k.pitch = damp(k.pitch, -Math.atan(k.proj.slope ?? 0), 8, dt);
    k.roll = 0;
    k.boostTimer = Math.max(k.boostTimer, 0.1);
    k.syncMesh(dt, 0);
    if ((k.bulletTimer -= dt) <= 0) {
      k.bulletTimer = 0;
      k.giveBoost(0.8);
      k.invuln = 1;
    }
  }

  /** 後ろの NPC は少し速く、前の NPC は少し遅く */
  rubberBand(k) {
    const base = this.drivers.get(k).baseSpeed;
    const gap = this.player.progress - k.progress;
    const r = this.diff.rubber;
    return base + (gap > 0 ? Math.min(gap / 220, 1) * r : Math.max(gap / 300, -1) * r * 0.6);
  }

  checkBoostPads(k) {
    const path = k.path ?? this.track;
    for (const pad of path.boostPads) {
      const ds = path.deltaS(k.proj.s, pad.s);
      if (ds >= 0 && ds <= pad.length && Math.abs(k.proj.lateral - pad.lateral) < pad.width / 2 + 0.4 && !k.airborne) {
        if (k.boostTimer < 0.5) this.emit("boostPad", k);
        k.giveBoost(1.0);
      }
    }
  }

  collideKarts() {
    const R = 2.3;
    const ks = this.karts;
    for (let i = 0; i < ks.length; i++) {
      for (let j = i + 1; j < ks.length; j++) {
        const a = ks[i];
        const b = ks[j];
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        const d2 = dx * dx + dz * dz;
        if (d2 > R * R || d2 < 1e-6 || Math.abs(a.y - b.y) > 2.5 || a.respawnTimer > 0 || b.respawnTimer > 0) continue;
        // スター・ジェットは体当たりでスピンさせ、小さくなったカートは踏みつぶされる
        const strong = (k) => k.starTimer > 0 || k.bulletTimer > 0;
        for (const [x, y] of [[a, b], [b, a]]) {
          if ((strong(x) && !strong(y)) || (y.shrinkTimer > 0 && !(x.shrinkTimer > 0) && !strong(y))) {
            if (y.hit()) this.emit("hit", y, { by: x, type: strong(x) ? "ram" : "squash" });
          }
        }
        const d = Math.sqrt(d2);
        const nx = dx / d;
        const nz = dz / d;
        // スター・ジェット側は押し返されず減速もしない。相手だけをはじき飛ばす
        if (strong(a) !== strong(b)) {
          const weak = strong(a) ? b : a;
          const s = weak === b ? 1 : -1;
          weak.pos.x += nx * s * (R - d);
          weak.pos.z += nz * s * (R - d);
          continue;
        }
        const ov = (R - d) / 2;
        a.pos.x -= nx * ov;
        a.pos.z -= nz * ov;
        b.pos.x += nx * ov;
        b.pos.z += nz * ov;
        const van = (Math.sin(a.moveAngle) * nx + Math.cos(a.moveAngle) * nz) * a.speed;
        const vbn = (Math.sin(b.moveAngle) * nx + Math.cos(b.moveAngle) * nz) * b.speed;
        const rel = van - vbn;
        if (rel <= 0) continue;
        // 押した側が減速、押された側が少し加速
        if (Math.abs(van) > Math.abs(vbn)) {
          a.speed -= Math.sign(a.speed) * rel * 0.3;
          b.speed += rel * 0.2;
        } else {
          b.speed -= Math.sign(b.speed) * rel * 0.3;
          a.speed += rel * 0.2;
        }
        if (rel > 3) this.emit("bump", a, { other: b, rel, x: (a.pos.x + b.pos.x) / 2, y: (a.y + b.y) / 2, z: (a.pos.z + b.pos.z) / 2 });
      }
    }
  }

  updateProgress(k) {
    // 枝道の上でもメインコースに換算した位置（mainS）で周回と順位を数える
    const N = this.track.count;
    const mainS = k.proj.mainS ?? k.proj.s;
    const idx = Math.floor(mainS / this.track.segLen) % N;
    const prev = k.trackIdx;
    if (prev > N * 0.75 && idx < N * 0.25) k.lap++;
    else if (prev < N * 0.25 && idx > N * 0.75) k.lap--;
    k.trackIdx = idx;
    k.progress = k.lap * this.track.length + mainS;

    if (k.lap <= k.maxLap) return;
    k.maxLap = k.lap;
    if (k.lap >= 2) k.lapTimes.push(this.time - k.lapStart);
    k.lapStart = k.lap === 1 ? 0 : this.time;
    if (k.lap > this.laps) {
      k.finished = true;
      k.finishTime = this.time;
      k.finishOrder = ++this.finishCounter;
      this.emit("finish", k);
      if (k === this.player) this.state = "finished";
    } else if (k.lap === this.laps && this.laps > 1) this.emit("finalLap", k);
    else if (k.lap > 1) this.emit("lap", k, k.lap);
  }

  updateRanks() {
    this.order = [...this.karts].sort((a, b) => {
      if (a.finished && b.finished) return a.finishOrder - b.finishOrder;
      if (a.finished !== b.finished) return a.finished ? -1 : 1;
      return b.progress - a.progress;
    });
    this.order.forEach((k, i) => (k.rank = i + 1));
  }

  updatePlayerState(dt) {
    const p = this.player;
    const dir = Math.sin(p.heading) * p.proj.tx + Math.cos(p.heading) * p.proj.tz;
    const wrong = !this.demo && this.state === "racing" && dir < -0.3 && Math.abs(p.speed) > 3;
    p.wrongWayTime = wrong ? p.wrongWayTime + dt : 0;
    const active = !this.demo && this.state !== "done";
    this.sound.engine(clamp(Math.abs(p.speed) / p.maxSpeed, 0, 1.4), p.boostTimer > 0, active);
    this.sound.drift(active && p.drifting && !p.airborne, p.driftLevel);
    // アイテム抽選中（獲得するアイテムが決まるまで）は刻み音を鳴らし続ける
    if (p.roulette > 0) {
      const tick = Math.floor(p.roulette * 14);
      if (tick !== Math.floor((p.roulette + dt) * 14)) this.sound.play("roulette", tick);
    }
  }

  updateEffects() {
    const P = this.particles;
    for (const k of this.karts) {
      if (k.pos.distanceToSquared(this.player.pos) > 140 * 140) continue;
      const a = k.heading + k.bodyYaw;
      const sin = Math.sin(a);
      const cos = Math.cos(a);
      const rear = (side) => [k.pos.x + cos * 0.9 * side - sin * 1.0, k.y + 0.15, k.pos.z - sin * 0.9 * side - cos * 1.0];
      if (k.drifting && !k.airborne) {
        const col = k.driftLevel > 0 ? DRIFT_LEVELS[k.driftLevel - 1].color : 0xdddddd;
        for (const side of [1, -1]) {
          if (Math.random() < 0.6) {
            const [x, y, z] = rear(side);
            P.spawn(x, y, z, (Math.random() - 0.5) * 3 - sin * 2, 1 + Math.random() * 2, (Math.random() - 0.5) * 3 - cos * 2, col, 0.25);
          }
        }
      }
      if (k.boostTimer > 0) {
        const [x, y, z] = rear(0);
        const col = k.boostColor === BOOST_COLOR ? (Math.random() < 0.5 ? 0xffd23f : 0xff6b1a) : Math.random() < 0.3 ? 0xffffff : k.boostColor;
        P.spawn(x, y + 0.6, z, -sin * 4, 0.5, -cos * 4, col, 0.25);
      }
      // 水の中：浅い所では水しぶき、潜ったら泡
      const wl = this.track.theme.waterLevel;
      if (k.inWater && k.y < wl - 1.4) {
        if (Math.random() < 0.25) {
          const [x, y, z] = rear(Math.random() < 0.5 ? 1 : -1);
          P.spawn(x, y + 0.3, z, (Math.random() - 0.5) * 1.5, 6 + Math.random() * 3, (Math.random() - 0.5) * 1.5, 0x6fb8d8, 0.45);
        }
      } else if (k.inWater && Math.abs(k.speed) > 5) {
        for (const side of [1, -1]) {
          if (Math.random() < 0.8) {
            const [x, , z] = rear(side);
            const out = side * (2 + Math.random() * 2);
            P.spawn(x, wl + 0.1, z, cos * out - sin * 2, 2.5 + Math.random() * 3, -sin * out - cos * 2, Math.random() < 0.6 ? 0xffffff : 0x9fd8ff, 0.45);
          }
        }
      } else if (k.offroad && Math.abs(k.speed) > 8 && Math.random() < 0.5) {
        const [x, y, z] = rear(Math.random() < 0.5 ? 1 : -1);
        P.spawn(x, y, z, (Math.random() - 0.5) * 2, 1.5, (Math.random() - 0.5) * 2, 0x9b7a4a, 0.5);
      }
    }
  }

  burst(x, y, z, colors, count, speed) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.6);
      this.particles.spawn(x, y, z, Math.cos(a) * v, 2 + Math.random() * speed * 0.6, Math.sin(a) * v, colors[i % colors.length], 0.6 + Math.random() * 0.4);
    }
  }

  // こすれた所から (nx, nz) 側と進行方向の後ろへ飛ぶ火花
  sparks(x, y, z, nx, nz, count, kart) {
    const bx = -Math.sin(kart.moveAngle) * kart.speed * 0.25;
    const bz = -Math.cos(kart.moveAngle) * kart.speed * 0.25;
    for (let i = 0; i < count; i++) {
      const side = (Math.random() < 0.5 ? 1 : -1) * (1 + Math.random() * 3);
      const out = 1 + Math.random() * 4;
      const col = i % 3 === 0 ? 0xffffff : i % 3 === 1 ? 0xffd23f : 0xff8a2a;
      this.particles.spawn(x, y, z, nx * out + nz * side + bx, 2 + Math.random() * 4, nz * out - nx * side + bz, col, 0.2 + Math.random() * 0.25);
    }
  }

  emit(type, kart, data) {
    // 敵（クラッシャー・隕石）の効果音は位置 data で近さを判定
    if (!kart) {
      if (!this.demo && data && Math.hypot(data.x - this.player.pos.x, data.z - this.player.pos.z) < 60) this.sound.play(type);
      if (!this.demo) this.onEvent(type, kart, data);
      return;
    }
    const isPlayer = kart === this.player && !this.demo;
    const near = !this.demo && kart.pos.distanceToSquared(this.player.pos) < 45 * 45;
    switch (type) {
      case "driftLevel":
        if (isPlayer) this.sound.play("charge", data);
        break;
      case "driftBoost":
        if (isPlayer) this.sound.play("boost");
        this.burst(kart.pos.x, kart.y + 0.4, kart.pos.z, [DRIFT_LEVELS[data - 1].color], 12, 5);
        break;
      case "boostPad":
      case "boostItem":
      case "rocket":
        if (isPlayer) this.sound.play("boost");
        break;
      case "wall":
        if (isPlayer) this.sound.play("wall", data);
        if (isPlayer || near) this.sparks(kart.pos.x + kart.wallNx * 0.9, kart.y + 0.4, kart.pos.z + kart.wallNz * 0.9, -kart.wallNx, -kart.wallNz, Math.min(18, data * 1.2), kart);
        break;
      case "bump": {
        const o = data.other;
        if (isPlayer || o === this.player) this.sound.play("bump");
        if (isPlayer || near) {
          const d = Math.hypot(o.pos.x - kart.pos.x, o.pos.z - kart.pos.z) || 1;
          this.sparks(data.x, data.y + 0.5, data.z, (o.pos.z - kart.pos.z) / d, -(o.pos.x - kart.pos.x) / d, Math.min(10, data.rel * 1.5), kart);
        }
        break;
      }
      case "trick":
        if (isPlayer) this.sound.play("trick");
        break;
      case "trickBoost":
        if (isPlayer) this.sound.play("boost");
        this.burst(kart.pos.x, kart.y + 0.5, kart.pos.z, [0xffd23f, 0xffffff], 14, 5);
        break;
      case "land":
        if (isPlayer) this.sound.play("land", data);
        this.burst(kart.pos.x, kart.y + 0.2, kart.pos.z, [0xd8c8a8, 0xffffff], 10, 4);
        break;
      case "splash":
        this.burst(kart.pos.x, this.track.theme.waterLevel + 0.2, kart.pos.z, [0xffffff, 0x9fd8ff, 0x5fb8f0], 22, 6);
        if (isPlayer || near) this.sound.play("splash");
        break;
      case "fall":
        if (this.track.theme.lava) this.burst(kart.pos.x, this.track.theme.waterLevel + 0.5, kart.pos.z, [0xff7a2a, 0xffd23f, 0x552211], 26, 8);
        if (isPlayer || near) this.sound.play("fall");
        break;
      case "hit":
        this.burst(kart.pos.x, kart.y + 1, kart.pos.z, [0xffffff, 0xffd23f, 0xff5f6d], 24, 8);
        if (near || isPlayer) this.sound.play("hit");
        break;
      case "itemBox":
        if (isPlayer) this.sound.play("box");
        break;
      case "itemGet":
        if (isPlayer) this.sound.play("get");
        break;
      case "useItem":
        if (near && !["star", "lightning", "bullet", "horn", "ink"].includes(data)) this.sound.play("throw");
        break;
      case "star":
      case "bullet":
        if (isPlayer) this.sound.play(type);
        break;
      case "horn":
        if (isPlayer || near) this.sound.play("horn");
        break;
      case "lightning":
        if (!this.demo) this.sound.play("thunder");
        break;
      case "ink":
        if (!this.demo && (isPlayer || this.player.inkTimer > 0)) this.sound.play("ink");
        break;
      case "spiny":
        if (isPlayer || data === this.player) this.sound.play("spiny");
        break;
      case "lap":
        if (isPlayer) this.sound.play("lap");
        break;
      case "finalLap":
        if (isPlayer) {
          this.sound.play("final");
          this.sound.musicTempo(1.15); // 最終ラップは BGM を速く
        }
        break;
      case "finish":
        if (isPlayer) this.sound.play("finish");
        break;
    }
    if (!this.demo) this.onEvent(type, kart, data);
  }

  results() {
    return this.order.map((k) => ({
      index: k.index,
      rank: k.rank,
      name: k.name,
      color: k.color,
      isPlayer: k.isPlayer,
      time: k.finished ? k.finishTime : null,
      best: k.lapTimes.length ? Math.min(...k.lapTimes) : null,
    }));
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse((o) => {
      o.geometry?.dispose();
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of mats) {
        m.map?.dispose();
        m.dispose();
      }
    });
  }
}
