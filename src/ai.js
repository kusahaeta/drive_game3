import { clamp, wrapAngle } from "./utils.js";

const tmp = { x: 0, y: 0, z: 0, heading: 0 };
const near = { x: 0, y: 0, z: 0, heading: 0 };
const far = { x: 0, y: 0, z: 0, heading: 0 };

/**
 * NPC の運転。プレイヤーと同じ kart.control を操作するだけなので、
 * 物理・アイテムのルールはプレイヤーと共通。
 */
export class AIDriver {
  constructor(kart, race, rng, { speed = 0.95, aggro = 0.8 } = {}) {
    this.kart = kart;
    this.race = race;
    this.rng = rng;
    this.baseSpeed = speed;
    this.aggro = aggro;
    this.lane = (rng() * 2 - 1) * 0.35;
    this.phase = rng() * Math.PI * 2;
    this.wander = 0.15 + rng() * 0.3;
    this.itemTimer = 1 + rng() * 3;
    this.stuckTime = 0;
    this.reverseTime = 0;
    this.doesTricks = rng() < 0.35 + aggro * 0.6;
    this.routes = {};
    this.choose = (b) => this.chooseBranch(b);
  }

  /** 分岐でどちらへ行くか（周回ごとに決め直す） */
  chooseBranch(b) {
    const lap = this.kart.lap;
    if (this.routes[b.id]?.lap !== lap) this.routes[b.id] = { lap, take: this.rng() < b.aiChance };
    return this.routes[b.id].take;
  }

  update(dt) {
    const k = this.kart;
    const race = this.race;
    const track = race.track;
    const c = k.control;
    const path = k.path ?? track;
    c.item = false;
    c.back = false;

    // 分岐ではルートを選び、選んだ道に沿って先を見る
    const s = k.proj.s;
    track.routePoint(path, s, 4, 0, this.choose, near);
    track.routePoint(path, s, 34, 0, this.choose, far);
    const turnAhead = wrapAngle(far.heading - near.heading);
    const hw = Math.min(path.halfWidth, far.hw);
    let lane = (this.lane + Math.sin(race.time * this.wander + this.phase) * 0.25) * hw;
    lane += clamp(turnAhead * 1.4, -1, 1) * hw * 0.45; // カーブの内側へ寄る
    lane += this.avoid(lane);
    lane = clamp(lane, -hw + 2, hw - 2);

    track.routePoint(path, s, 7 + Math.max(0, k.speed) * 0.5, lane, this.choose, tmp);
    const diff = wrapAngle(Math.atan2(tmp.x - k.pos.x, tmp.z - k.pos.z) - k.heading);
    let steer = clamp(diff * 2.6, -1, 1);
    // スミで前が見えない間はハンドルがふらつく
    if (k.inkTimer > 0) steer = clamp(steer + Math.sin(race.time * 2.3 + this.phase) * 0.45, -1, 1);
    let throttle = 1;
    let brake = 0;
    if (Math.abs(diff) > 1.0 && k.speed > 14) {
      throttle = 0;
      brake = 1;
    }

    // 壁に引っかかったらバック
    if (this.reverseTime > 0) {
      this.reverseTime -= dt;
      throttle = 0;
      brake = 1;
      steer = -Math.sign(diff);
    } else if (Math.abs(k.speed) < 2 && race.state !== "countdown" && k.spinTimer <= 0 && k.stall <= 0 && !k.airborne) {
      this.stuckTime += dt;
      if (this.stuckTime > 1.3) {
        this.reverseTime = 0.9;
        this.stuckTime = 0;
      }
    } else this.stuckTime = 0;

    if (k.drifting) {
      const ending = Math.abs(turnAhead) < 0.15 || Math.sign(turnAhead) !== k.driftDir;
      c.drift = !ending;
    } else {
      c.drift = Math.abs(turnAhead) > 0.5 && k.speed > 18 && Math.abs(diff) < 0.6;
    }

    // ジャンプ中はトリック（ドリフトボタンを押し直す）
    if (k.airborne && k.launched && k.canTrick && !k.trick && k.airTime > 0.08 && this.doesTricks) c.drift = !k.prevDrift;

    c.throttle = throttle;
    c.brake = brake;
    c.steer = steer;
    this.useItems(dt, turnAhead);
  }

  /** 前方のバナナや飛んでくる弾をよける横移動量 */
  avoid(lane) {
    const k = this.kart;
    const track = this.race.track;
    let shift = 0;
    const path = k.path ?? track;
    for (const o of this.race.items.objects) {
      if ((o.owner === k && o.age < 1) || (o.path ?? track) !== path || o.type === "spiny" || o.type === "blast") continue;
      const ds = path.deltaS(o.proj.s, k.proj.s);
      if (ds < 2 || ds > 28) continue;
      const dl = o.proj.lateral - lane;
      if (Math.abs(dl) < 3) shift += (dl > 0 ? -1 : 1) * (3 - Math.abs(dl)) * 1.3;
    }
    // 敵（クラッシャー・UFO・隕石の落下地点）もよける
    for (const h of this.race.hazards?.threats ?? []) {
      if ((h.path ?? track) !== path) continue;
      const ds = path.deltaS(h.s, k.proj.s);
      if (ds < -2 || ds > (h.look ?? 35)) continue;
      let lateral = h.lateral;
      if (h.vl != null) {
        // 動いている敵は、追いついた時にいそうな所をよける
        const tt = Math.min(1.5, Math.max(0, ds) / Math.max(5, k.speed - (h.vs ?? 0)));
        lateral = Math.max(-h.hw, Math.min(h.hw, lateral + h.vl * tt));
      }
      const dl = lateral - lane;
      if (Math.abs(dl) < h.radius) shift += (dl > 0 ? -1 : 1) * (h.radius - Math.abs(dl)) * 1.1;
    }
    return shift;
  }

  useItems(dt, turnAhead) {
    const k = this.kart;
    if (!k.item || k.roulette > 0 || this.race.state === "countdown") return;
    this.itemTimer -= dt;
    if (this.itemTimer > 0) return;
    const track = this.race.track;
    let fire = false;
    let back = false;
    const near = (min, max) =>
      this.race.karts.some((o) => {
        if (o === k) return false;
        const d = track.deltaS(o.proj.mainS ?? o.proj.s, k.proj.mainS ?? k.proj.s);
        return d > min && d < max && o.path === k.path && Math.abs(o.proj.lateral - k.proj.lateral) < 5;
      });
    switch (k.item) {
      case "boost":
      case "triple":
      case "gold":
        fire = !k.offroad && Math.abs(turnAhead) < 0.3;
        break;
      case "banana":
      case "banana3":
      case "fake":
        fire = near(-20, -3) || this.itemTimer < -8;
        break;
      case "shell":
      case "shell3":
        if (near(4, 40)) fire = true;
        else if (near(-12, -3)) fire = back = true;
        else fire = this.itemTimer < -10;
        break;
      case "bomb":
        if (near(6, 30)) fire = true;
        else if (near(-12, -3)) fire = back = true;
        else fire = this.itemTimer < -8;
        break;
      case "homing":
      case "homing3":
        fire = k.rank > 1 || this.itemTimer < -12;
        break;
      case "spiny":
        fire = k.rank > 2 || this.itemTimer < -6;
        break;
      case "ink":
        fire = k.rank > 1;
        break;
      case "horn": {
        // 近くに相手がいるか、トップシェルが自分に向かってきたら鳴らす
        const spiny = this.race.items.objects.some((o) => o.type === "spiny" && o.target === k && Math.hypot(o.x - k.pos.x, o.z - k.pos.z) < 25);
        fire = spiny || near(-8, 8) || this.itemTimer < -15;
        break;
      }
      case "star":
      case "lightning":
        fire = true;
        break;
      case "bullet":
        fire = !k.airborne;
        break;
    }
    if (fire && this.rng() < this.aggro + 0.2) {
      k.control.item = true;
      k.control.back = back;
      this.itemTimer = 0.4 + (this.rng() * 2.5) / this.aggro;
    }
  }
}
