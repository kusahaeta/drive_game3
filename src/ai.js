import { clamp, wrapAngle } from "./utils.js";

const tmp = { x: 0, y: 0, z: 0, heading: 0 };

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
  }

  update(dt) {
    const k = this.kart;
    const race = this.race;
    const track = race.track;
    const c = k.control;
    const hw = track.halfWidth;
    c.item = false;
    c.back = false;

    const s = k.proj.s;
    const turnAhead = track.turnAngle(s + 4, 30);
    let lane = (this.lane + Math.sin(race.time * this.wander + this.phase) * 0.25) * hw;
    lane += clamp(turnAhead * 1.4, -1, 1) * hw * 0.45; // カーブの内側へ寄る
    lane += this.avoid(lane);
    lane = clamp(lane, -hw + 2, hw - 2);

    track.pointAt(s + 7 + Math.max(0, k.speed) * 0.5, lane, tmp);
    const diff = wrapAngle(Math.atan2(tmp.x - k.pos.x, tmp.z - k.pos.z) - k.heading);
    let steer = clamp(diff * 2.6, -1, 1);
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
    for (const o of this.race.items.objects) {
      if (o.owner === k && o.age < 1) continue;
      const ds = track.deltaS(o.proj.s, k.proj.s);
      if (ds < 2 || ds > 28) continue;
      const dl = o.proj.lateral - lane;
      if (Math.abs(dl) < 3) shift += (dl > 0 ? -1 : 1) * (3 - Math.abs(dl)) * 1.3;
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
        const d = track.deltaS(o.proj.s, k.proj.s);
        return d > min && d < max && Math.abs(o.proj.lateral - k.proj.lateral) < 5;
      });
    switch (k.item) {
      case "boost":
      case "triple":
        fire = !k.offroad && Math.abs(turnAhead) < 0.3;
        break;
      case "banana":
        fire = near(-20, -3) || this.itemTimer < -8;
        break;
      case "shell":
        if (near(4, 40)) fire = true;
        else if (near(-12, -3)) fire = back = true;
        else fire = this.itemTimer < -10;
        break;
      case "homing":
        fire = k.rank > 1 || this.itemTimer < -12;
        break;
    }
    if (fire && this.rng() < this.aggro + 0.2) {
      k.control.item = true;
      k.control.back = back;
      this.itemTimer = 0.4 + (this.rng() * 2.5) / this.aggro;
    }
  }
}
