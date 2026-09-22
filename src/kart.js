import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clamp, damp, dampAngle, wrapAngle } from "./utils.js";

export const KART_RADIUS = 1.15;
const GRAVITY = 26;
const SPIN_TIME = 1.25;

/** ドリフトの溜め段階。charge 秒以上ドリフトを続けて離すと boost 秒のダッシュ */
export const DRIFT_LEVELS = [
  { charge: 0.9, boost: 0.6, color: 0x4cc9ff, label: "ブースト!" },
  { charge: 2.0, boost: 1.05, color: 0xff9f1c, label: "スーパーブースト!" },
  { charge: 3.3, boost: 1.5, color: 0xd07bff, label: "ハイパーブースト!" },
];

/** プレイヤーのカートに使う 3D モデル（assets/models/cart3.glb）。読み込み前・失敗時は手作りモデルになる */
const KART_GLB = "./assets/models/cart3.glb";
const GLB_LENGTH = 3.3; // 前後の長さをこのくらいに合わせる（当たり判定 KART_RADIUS に見合う大きさ）
const GLB_YAW = 0; // モデルの前方を +Z（進行方向）へ向ける回転
let glbTemplate = null;

export async function loadKartModel() {
  try {
    const gltf = await new GLTFLoader().loadAsync(KART_GLB);
    const model = gltf.scene;
    model.rotation.y = GLB_YAW;
    // ファイルに書かれた範囲（accessor の min/max）が実際の形とずれていることがあるので頂点から測り直す
    model.traverse((o) => o.isMesh && o.geometry.computeBoundingBox());
    // 大きさと位置をそろえる：前後の長さを GLB_LENGTH に、底面を y=0、中心を原点に
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    model.scale.setScalar(GLB_LENGTH / size.z);
    box.setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());
    model.position.set(-center.x, -box.min.y, -center.z);
    const meshes = [];
    model.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = o.receiveShadow = true;
      meshes.push(o);
    });
    glbTemplate = new THREE.Group().add(model);
    glbTemplate.updateMatrixWorld(true);

    // パーツ分けされたモデルなら、いちばん大きいパーツが車体で残りはタイヤ。
    // タイヤごとに中心へ軸（pivot）を置き、回転と前輪の切れ角をつけられるようにする
    if (meshes.length > 1) {
      const boxes = new Map(meshes.map((m) => [m, new THREE.Box3().setFromObject(m)]));
      const volume = (b) => b.getSize(new THREE.Vector3()).toArray().reduce((a, c) => a * c, 1);
      const chassis = meshes.reduce((a, b) => (volume(boxes.get(b)) > volume(boxes.get(a)) ? b : a));
      for (const mesh of meshes) {
        if (mesh === chassis) continue;
        const c = boxes.get(mesh).getCenter(new THREE.Vector3());
        const pivot = new THREE.Group();
        pivot.name = c.z > 0 ? "wheelPivotFront" : "wheelPivotRear";
        pivot.position.copy(c);
        const wheel = new THREE.Group();
        wheel.name = "wheel";
        pivot.add(wheel);
        glbTemplate.add(pivot);
        glbTemplate.updateMatrixWorld(true);
        wheel.attach(mesh);
      }
    }
  } catch (err) {
    console.warn("カートモデルを読み込めませんでした。手作りモデルを使います", err);
  }
}

/** 読み込んだモデルを使った見た目。タイヤが別パーツなら回転・切れ角も動く */
function buildGlbModel() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const model = glbTemplate.clone();
  body.add(model);
  const wheels = [];
  const frontPivots = [];
  model.traverse((o) => {
    if (o.name === "wheel") wheels.push(o);
    else if (o.name === "wheelPivotFront") frontPivots.push(o);
  });

  const flame = new THREE.Group();
  const flameMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffa62b).multiplyScalar(5), transparent: true, opacity: 0.9 });
  for (const x of [0.3, -0.3]) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.2, 1.1, 8).rotateX(-Math.PI / 2), flameMat);
    cone.position.set(x, 0.6, -GLB_LENGTH / 2 - 0.45);
    flame.add(cone);
  }
  flame.visible = false;
  body.add(flame);

  return { root, body, wheels, frontPivots, flame };
}

function buildModel(color, accent) {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.25 });
  const trim = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.45 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x24262c, roughness: 0.75 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x1b2433, roughness: 0.1, metalness: 0.7 });
  const add = (geo, mat, x, y, z, parent = body) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    parent.add(m);
    return m;
  };

  const rbox = (w, h, d, r = 0.12) => new RoundedBoxGeometry(w, h, d, 3, r);
  add(rbox(1.55, 0.32, 2.6, 0.14), paint, 0, 0.44, 0);
  const nose = add(rbox(1.15, 0.42, 1.1, 0.18), paint, 0, 0.56, 1.3);
  nose.rotation.x = 0.12;
  add(rbox(1.8, 0.2, 0.34, 0.09), trim, 0, 0.36, 1.88);
  add(rbox(0.38, 0.36, 1.4, 0.14), trim, 0.82, 0.54, 0.05);
  add(rbox(0.38, 0.36, 1.4, 0.14), trim, -0.82, 0.54, 0.05);
  add(rbox(1.2, 0.5, 0.65, 0.1), dark, 0, 0.74, -1.0);
  const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff6c8).multiplyScalar(3) });
  for (const x of [0.38, -0.38]) add(new THREE.CircleGeometry(0.11, 12), lampMat, x, 0.6, 1.86);
  const tailMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff3030).multiplyScalar(3) });
  for (const x of [0.45, -0.45]) {
    const tl = add(new THREE.CircleGeometry(0.09, 10), tailMat, x, 0.78, -1.34);
    tl.rotation.y = Math.PI;
  }
  for (const x of [0.35, -0.35]) {
    const ex = add(new THREE.CylinderGeometry(0.1, 0.14, 0.5, 8), dark, x, 0.8, -1.38);
    ex.rotation.x = Math.PI / 2 + 0.35;
  }
  add(new THREE.BoxGeometry(1.9, 0.08, 0.5), trim, 0, 1.2, -1.3);
  add(new THREE.BoxGeometry(0.08, 0.42, 0.3), dark, 0.6, 1.0, -1.3);
  add(new THREE.BoxGeometry(0.08, 0.42, 0.3), dark, -0.6, 1.0, -1.3);
  add(new THREE.BoxGeometry(0.85, 0.65, 0.2), dark, 0, 0.9, -0.55);
  add(new THREE.CylinderGeometry(0.32, 0.4, 0.7, 10), trim, 0, 0.98, -0.2);
  add(new THREE.SphereGeometry(0.38, 16, 12), paint, 0, 1.58, -0.15);
  add(new THREE.BoxGeometry(0.52, 0.2, 0.12), glass, 0, 1.6, 0.2);
  const wheelRing = add(new THREE.TorusGeometry(0.22, 0.045, 6, 14), dark, 0, 1.05, 0.42);
  wheelRing.rotation.x = -0.9;

  const tireMat = new THREE.MeshStandardMaterial({ color: 0x17181b, roughness: 0.9 });
  const hubMat = new THREE.MeshStandardMaterial({ color: 0xd9dde3, roughness: 0.3, metalness: 0.6 });
  const wheels = [];
  const frontPivots = [];
  for (const [x, z, r, front] of [
    [0.88, 0.95, 0.38, true],
    [-0.88, 0.95, 0.38, true],
    [0.92, -0.9, 0.44, false],
    [-0.92, -0.9, 0.44, false],
  ]) {
    const pivot = new THREE.Group();
    pivot.position.set(x, r, z);
    body.add(pivot);
    const wheel = new THREE.Group();
    pivot.add(wheel);
    const tire = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.38, 14).rotateZ(Math.PI / 2), tireMat);
    tire.castShadow = true;
    wheel.add(tire);
    const hub = new THREE.Mesh(new THREE.BoxGeometry(0.4, r * 1.3, 0.16), hubMat);
    wheel.add(hub);
    wheels.push(wheel);
    if (front) frontPivots.push(pivot);
  }

  const flame = new THREE.Group();
  const flameMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffa62b).multiplyScalar(5), transparent: true, opacity: 0.9 });
  for (const x of [0.35, -0.35]) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.2, 1.1, 8).rotateX(-Math.PI / 2), flameMat);
    cone.position.set(x, 0.72, -2.0);
    flame.add(cone);
  }
  flame.visible = false;
  body.add(flame);

  return { root, body, wheels, frontPivots, flame };
}

export class Kart {
  constructor({ index, name, color, accent, isPlayer = false }) {
    Object.assign(this, { index, name, color, isPlayer });
    this.model = index === 0 && glbTemplate ? buildGlbModel() : buildModel(color, accent);
    this.mesh = this.model.root;

    this.control = { throttle: 0, brake: 0, steer: 0, drift: false, item: false, back: false };
    this.prevDrift = false;
    this.prevItem = false;

    this.pos = new THREE.Vector3();
    this.y = 0;
    this.vy = 0;
    this.airborne = false;
    this.heading = 0;
    this.moveAngle = 0; // 実際に進んでいる向き（ドリフト中は heading とずれる）
    this.speed = 0;
    this.pitch = 0;

    this.maxSpeed = 31;
    this.accel = 16;
    this.brakeForce = 32;
    this.reverseMax = 9;
    this.turnRate = 2.05;
    this.grip = 9;
    this.driftGrip = 5;
    this.speedMult = 1;

    this.proj = { idx: 0, s: 0, lateral: 0, y: 0, slope: 0, tx: 0, tz: 1, nx: 1, nz: 0 };
    this.trackIdx = 0;
    this.lap = 0;
    this.maxLap = 0;
    this.progress = 0;
    this.rank = index + 1;
    this.finished = false;
    this.finishTime = null;
    this.lapStart = 0;
    this.lapTimes = [];

    this.item = null;
    this.itemUses = 0;
    this.roulette = 0;
    this.pendingItem = null;

    this.boostTimer = 0;
    this.spinTimer = 0;
    this.stall = 0;
    this.invuln = 0;
    this.drifting = false;
    this.driftDir = 0;
    this.driftSteer = 0;
    this.driftCharge = 0;
    this.driftLevel = 0;
    this.hopPending = false;
    this.offroad = false;
    this.bodyYaw = 0;
    this.wheelSpin = 0;
    this.wrongWayTime = 0;
    this.roll = 0;
    this.launched = false; // 路面から飛び出した（ジャンプ中）
    this.airTime = 0;
    this.trick = false;
    this.trickSpin = 0;
    this.respawnTimer = 0;
    this.respawned = false;
  }

  /** path（メインコースか枝道）の s 地点に置く */
  place(track, s, lateral, path = track) {
    const p = path.pointAt(s, lateral, {});
    this.pos.set(p.x, 0, p.z);
    this.heading = this.moveAngle = p.heading;
    this.speed = 0;
    this.vy = 0;
    this.airborne = this.launched = this.trick = false;
    // 立体交差があっても別の段に吸い付かないよう、s から探索の起点を決める
    path.project(p.x, p.z, path.idxAt(s), this.proj);
    this.path = path;
    this.proj.path = path;
    this.proj.mainS = path.mainS(this.proj.s);
    this.y = this.proj.groundY;
    this.trackIdx = track.idxAt(this.proj.mainS);
    this.syncMesh(0, 0);
  }

  /** アイテムが当たった。無敵中なら false */
  hit() {
    if (this.invuln > 0) return false;
    this.spinTimer = SPIN_TIME;
    this.speed *= 0.3;
    this.drifting = false;
    this.hopPending = false;
    this.driftCharge = 0;
    this.driftLevel = 0;
    this.boostTimer = 0;
    this.invuln = SPIN_TIME + 1;
    this.vy = 5;
    this.airborne = true;
    return true;
  }

  giveBoost(t) {
    this.boostTimer = Math.max(this.boostTimer, t);
  }

  startDrift(dir) {
    this.drifting = true;
    this.hopPending = false;
    this.driftDir = dir;
    this.driftSteer = 0;
    this.driftCharge = 0;
    this.driftLevel = 0;
  }

  endDrift(race, cancelled) {
    if (!cancelled && this.driftLevel > 0) {
      const lvl = DRIFT_LEVELS[this.driftLevel - 1];
      this.giveBoost(lvl.boost);
      race.emit("driftBoost", this, this.driftLevel);
    }
    this.drifting = false;
    this.driftCharge = 0;
    this.driftLevel = 0;
  }

  physics(dt, race) {
    const track = race.track;
    const c = this.control;
    this.boostTimer = Math.max(0, this.boostTimer - dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.stall = Math.max(0, this.stall - dt);
    const spinning = this.spinTimer > 0;
    if (spinning) this.spinTimer -= dt;

    let throttle = c.throttle;
    let brake = c.brake;
    let steer = c.steer;
    if (spinning || this.stall > 0) {
      throttle = 0;
      brake = 0;
    }
    if (spinning) steer = 0;

    // --- 速度
    const path = this.path ?? track;
    this.offroad = Math.abs(this.proj.lateral) > path.halfWidth + 0.8;
    let top = this.maxSpeed * this.speedMult;
    if (this.offroad && this.boostTimer <= 0) top *= 0.52;
    if (this.boostTimer > 0) top += 11;

    const flying = this.airborne && this.launched;
    if (flying) this.speed *= 1 - 0.04 * dt;
    else if (spinning) this.speed = damp(this.speed, 0, 2.5, dt);
    else if (this.speed > top + 0.5) this.speed = damp(this.speed, top, this.offroad ? 2.5 : 1.2, dt);
    else if (throttle && !brake) {
      const a = this.speed < 0 ? this.brakeForce : this.accel * (1 - (0.55 * this.speed) / top);
      this.speed = Math.min(top, this.speed + a * dt);
    } else if (brake && !throttle) {
      if (this.speed > 0.5) this.speed = Math.max(0, this.speed - this.brakeForce * dt);
      else this.speed = Math.max(-this.reverseMax, this.speed - this.accel * 0.7 * dt);
    } else if (throttle && brake) this.speed = damp(this.speed, 0, 1.8, dt);
    else this.speed = damp(this.speed, 0, 0.55, dt);
    if (this.boostTimer > 0 && !spinning && !flying) this.speed = Math.min(top, this.speed + 40 * dt);

    // --- ジャンプ＆ドリフト
    const driftEdge = c.drift && !this.prevDrift;
    this.prevDrift = c.drift;
    if (driftEdge && flying && this.canTrick && !this.trick && !spinning) {
      this.trick = true;
      this.trickSpin = 0;
      race.emit("trick", this);
    }
    if (driftEdge && !this.airborne && !spinning && this.speed > 7) {
      this.vy = 4.5;
      this.airborne = true;
      this.hopPending = true;
    }
    if (this.hopPending) {
      if (c.drift && Math.abs(steer) > 0.3 && this.speed > 7) this.startDrift(Math.sign(steer));
      else if (!this.airborne || !c.drift) this.hopPending = false;
    }
    if (this.drifting && (!c.drift || this.speed < 6 || spinning)) this.endDrift(race, spinning);

    // --- 旋回
    const speedAbs = Math.abs(this.speed);
    let yawRate;
    if (this.drifting) {
      // ドリフト方向へ入れると小さく回り込み、逆へ入れるとほぼまっすぐの大回りになる。
      // キーボードでも押す長さで曲がり具合を調整できるよう入力をなめらかにする
      this.driftSteer = damp(this.driftSteer, clamp(steer * this.driftDir, -1, 1), 8, dt);
      const k = 0.45 + 0.38 * this.driftSteer;
      yawRate = this.driftDir * this.turnRate * k;
      this.driftCharge += dt * (0.75 + 0.55 * Math.abs(steer));
      let lvl = 0;
      DRIFT_LEVELS.forEach((L, i) => {
        if (this.driftCharge >= L.charge) lvl = i + 1;
      });
      if (lvl > this.driftLevel) {
        this.driftLevel = lvl;
        race.emit("driftLevel", this, lvl);
      }
    } else {
      const grip = clamp(speedAbs / 5, 0, 1) * (1 - 0.28 * clamp(speedAbs / this.maxSpeed, 0, 1.3));
      yawRate = steer * this.turnRate * grip * (this.speed < 0 ? -1 : 1);
    }
    if (flying) yawRate *= 0.5;
    if (!spinning) this.heading += yawRate * dt;
    // 凍った路面ではグリップがかなり弱くなって滑る
    this.onIce = path.iceAt(this.proj.s, this.proj.lateral);
    let grip = this.drifting ? this.driftGrip : this.offroad ? this.grip * 0.7 : this.grip;
    if (this.onIce) grip *= 0.22;
    this.moveAngle = this.speed >= 0 ? dampAngle(this.moveAngle, this.heading, grip, dt) : this.heading;

    // --- 移動
    this.pos.x += Math.sin(this.moveAngle) * this.speed * dt;
    this.pos.z += Math.cos(this.moveAngle) * this.speed * dt;
    // 分岐・合流の付近では近い方の道へ乗り移る
    const p = track.locate(this.pos.x, this.pos.z, this, this.proj);
    const road = this.path;

    // --- 壁
    const limit = road.wallOffset - KART_RADIUS;
    if (Math.abs(p.lateral) > limit && road.wallAt(p.s, Math.sign(p.lateral))) {
      const sgn = Math.sign(p.lateral);
      const push = Math.abs(p.lateral) - limit;
      this.pos.x -= p.nx * push * sgn;
      this.pos.z -= p.nz * push * sgn;
      p.lateral = limit * sgn;
      let vx = Math.sin(this.moveAngle) * this.speed;
      let vz = Math.cos(this.moveAngle) * this.speed;
      const vn = (vx * p.nx + vz * p.nz) * sgn;
      if (vn > 0) {
        vx -= p.nx * sgn * vn * 1.5;
        vz -= p.nz * sgn * vn * 1.5;
        const v = Math.hypot(vx, vz) * 0.9;
        if (this.speed >= 0) {
          this.moveAngle = Math.atan2(vx, vz);
          this.speed = v;
          this.heading += wrapAngle(this.moveAngle - this.heading) * 0.5;
        } else {
          this.moveAngle = this.heading = Math.atan2(-vx, -vz);
          this.speed = -v;
        }
        if (vn > 5) race.emit("wall", this, vn);
      }
    }

    // --- 高さ（路面が急に下がれば飛び出す＝ジャンプ）
    const prevY = this.y;
    if (!this.airborne) {
      const expected = this.y + this.vy * dt - GRAVITY * dt * dt;
      if (!p.ground || (p.groundY < expected - 0.04 && this.speed > 6)) {
        this.airborne = true;
        this.launched = true;
        this.airTime = 0;
        // トリックできるのはジャンプ台・崖からの大きなジャンプだけ（丘の小さな浮きは不可）
        this.canTrick = this.vy > 3 || !p.ground || p.ramp > 0;
      } else if (p.groundY - this.y > 0.6) {
        this.y = p.groundY; // 段差を登る
        this.vy = 0;
      } else {
        this.vy = clamp((p.groundY - this.y) / Math.max(dt, 1e-3), -25, 25);
        this.y = p.groundY;
      }
    }
    if (this.airborne) {
      this.airTime += dt;
      this.vy -= GRAVITY * dt;
      this.y += this.vy * dt;
      if (p.ground && this.y <= p.groundY && prevY >= p.groundY - 0.8) this.land(race, p);
      else if (this.y < p.y - 9 || (track.theme.lava && this.y < track.theme.waterLevel)) race.fallOut(this);
    }

    const along = Math.cos(wrapAngle(this.heading - Math.atan2(p.tx, p.tz)));
    const targetPitch = this.airborne && this.launched
      ? -Math.atan2(this.vy, Math.max(Math.abs(this.speed), 5)) * 0.6
      : -Math.atan(p.slope * along + p.rampSlope * along);
    this.pitch = damp(this.pitch, targetPitch, this.airborne ? 4 : 10, dt);
    this.roll = damp(this.roll, Math.atan(p.bank) * along, 8, dt);
    // トリック：空中で 1 回転
    if (this.trick) this.trickSpin = Math.min(Math.PI * 2, this.trickSpin + dt * 14);

    this.syncMesh(dt, steer);
  }

  land(race, p) {
    const along = Math.cos(wrapAngle(this.moveAngle - Math.atan2(p.tx, p.tz)));
    const groundVy = this.speed * (p.slope + p.rampSlope) * along;
    const impact = groundVy - this.vy;
    this.y = p.groundY;
    this.vy = groundVy; // 坂に着地しても跳ね返らないよう路面の上下速度に合わせる
    this.airborne = false;
    if (this.launched) {
      if (this.trick) {
        this.giveBoost(0.9);
        race.emit("trickBoost", this);
      }
      if (impact > 7) race.emit("land", this, impact);
    }
    this.launched = false;
    this.trick = false;
    this.trickSpin = 0;
    this.airTime = 0;
  }

  syncMesh(dt, steer) {
    const m = this.model;
    this.mesh.position.set(this.pos.x, this.y, this.pos.z);
    this.mesh.rotation.set(this.pitch, this.heading, this.roll, "YXZ");
    this.bodyYaw = damp(this.bodyYaw, this.drifting ? this.driftDir * 0.42 : 0, 8, dt);
    const spin = this.spinTimer > 0 ? (1 - this.spinTimer / SPIN_TIME) * Math.PI * 4 : 0;
    m.body.rotation.y = this.bodyYaw + spin;
    this.lean = damp(this.lean ?? 0, steer * 0.08 * clamp(this.speed / 20, 0, 1), 8, dt);
    m.body.rotation.z = this.lean + this.trickSpin * (this.index % 2 ? -1 : 1);
    this.wheelSpin += (this.speed * dt) / 0.4;
    for (const w of m.wheels) w.rotation.x = this.wheelSpin;
    for (const f of m.frontPivots) f.rotation.y = steer * 0.45;
    m.flame.visible = this.boostTimer > 0;
    if (m.flame.visible) m.flame.scale.setScalar(0.8 + Math.random() * 0.6);
    // スピン後の無敵時間は点滅
    this.mesh.visible = !(this.invuln > 0 && this.spinTimer <= 0 && Math.floor(this.invuln * 14) % 2 === 0);
  }
}
