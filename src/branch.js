import * as THREE from "three";
import { clamp, lerp, wrapAngle } from "./utils.js";

/**
 * 枝道（分岐して合流する道）。メインコースの from 地点で分かれ、points を通って to 地点で合流する。
 * メインコース（Track）と同じ問い合わせ（pointAt / project / wallAt など）に答えるので、
 * カート・NPC・アイテムはどちらの道にいても同じように扱える。
 * s は枝道の始点からの距離（0〜length）。範囲外の s はメインコースへつながる位置として扱う。
 *
 * コース定義：branches: [{ from, to, points: [[x, y, z], ...], width, noWalls, elevated, itemBoxRows, boostPads, aiChance }]
 */
export class Branch {
  constructor(main, def, id) {
    this.main = main;
    this.def = def;
    this.id = id;
    this.closed = false;
    this.halfWidth = (def.width ?? main.halfWidth * 2) / 2;
    this.wallOffset = this.halfWidth + (def.shoulderWidth ?? main.wallOffset - main.halfWidth);
    this.noWalls = !!def.noWalls; // 壁なし：はみ出すと落ちる
    this.canyon = !!def.elevated; // 下の地形を谷（水・溶岩）まで掘り下げる
    this.aiChance = def.aiChance ?? 0.5;

    const L = main.length;
    this.mainFrom = def.from * L;
    this.mainTo = def.to * L;
    this.mainSpan = main.wrapS(this.mainTo - this.mainFrom);

    // 分岐点・合流点でメインコースと向きがそろうよう、前後にメインコース上の点を足してスプラインを作る
    const m = (s) => {
      const p = main.pointAt(s, 0, {});
      return new THREE.Vector3(p.x, p.y, p.z);
    };
    const ctrl = [m(this.mainFrom - 15), m(this.mainFrom), ...def.points.map(([x, y, z]) => new THREE.Vector3(x, y, z)), m(this.mainTo), m(this.mainTo + 15)];
    const curve = new THREE.CatmullRomCurve3(ctrl, false, "centripetal");
    curve.arcLengthDivisions = ctrl.length * 300;
    const lengths = curve.getLengths();
    const div = lengths.length - 1;
    const total = lengths[div];
    const at = (k) => lengths[Math.round((k / (ctrl.length - 1)) * div)];
    const a = at(1);
    const b = at(ctrl.length - 2);
    this.length = b - a;
    const N = (this.count = Math.max(20, Math.round(this.length)));
    this.segLen = this.length / (N - 1);

    const arr = () => new Float32Array(N);
    Object.assign(this, {
      px: arr(), py: arr(), pz: arr(), tx: arr(), tz: arr(), nx: arr(), nz: arr(), slope: arr(), hd: arr(), bank: arr(),
      gapF: new Uint8Array(N), cliffL: new Uint8Array(N), cliffR: new Uint8Array(N), bridgeF: new Uint8Array(N), tunnelF: new Uint8Array(N),
    });
    const p = new THREE.Vector3();
    const t = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
      const u = (a + (i / (N - 1)) * (b - a)) / total;
      curve.getPointAt(u, p);
      curve.getTangentAt(u, t);
      const h = Math.hypot(t.x, t.z) || 1;
      this.px[i] = p.x;
      this.py[i] = p.y;
      this.pz[i] = p.z;
      this.tx[i] = t.x / h;
      this.tz[i] = t.z / h;
      this.nx[i] = t.z / h;
      this.nz[i] = -t.x / h;
      this.slope[i] = t.y / h;
      this.hd[i] = Math.atan2(t.x / h, t.z / h);
    }

    // 分岐・合流の区間（メインコースと道が重なっている長さ）と、枝道がメインのどちら側へ出るか
    const q = {};
    const apart = main.wallOffset + this.wallOffset + 1;
    const measure = (from, step) => {
      for (let k = 0; k < N; k++) {
        const i = from + k * step;
        main.project(this.px[i], this.pz[i], main.idxAt(step > 0 ? this.mainFrom : this.mainTo), q);
        if (Math.abs(q.lateral) > apart || k === N - 1) return { len: k * this.segLen, side: Math.sign(q.lateral) || 1, mainS: q.s };
      }
    };
    const split = measure(0, 1);
    const merge = measure(N - 1, -1);
    this.splitLen = split.len;
    this.splitSide = split.side;
    this.splitMainEnd = split.mainS;
    this.mergeLen = merge.len;
    this.mergeSide = merge.side;
    this.mergeMainStart = merge.mainS;

    const pads = def.boostPads ?? [];
    this.boostPads = pads.map((d) => ({ s: d.at * this.length, lateral: d.lateral ?? 0, length: d.length ?? 6, width: d.width ?? 4.5 }));
    this.itemRows = (def.itemBoxRows ?? []).map((f) => f * this.length);
  }

  /** 枝道上の s をメインコース上の位置（順位・周回の計算用）に換算 */
  mainS(s) {
    return this.main.wrapS(this.mainFrom + (clamp(s, 0, this.length) / this.length) * this.mainSpan);
  }

  wrapS(s) {
    return clamp(s, 0, this.length);
  }

  deltaS(a, b) {
    return a - b;
  }

  idxAt(s) {
    return clamp(Math.round(s / this.segLen), 0, this.count - 1);
  }

  pointAt(s, lateral, out) {
    // 範囲外はメインコースの続きへ
    if (s < 0) return this.main.pointAt(this.mainFrom + s, lateral, out);
    if (s > this.length) return this.main.pointAt(this.mainTo + (s - this.length), lateral, out);
    const f = s / this.segLen;
    const i = Math.min(Math.floor(f), this.count - 2);
    const j = i + 1;
    const t = f - i;
    out.x = lerp(this.px[i], this.px[j], t) + lerp(this.nx[i], this.nx[j], t) * lateral;
    out.z = lerp(this.pz[i], this.pz[j], t) + lerp(this.nz[i], this.nz[j], t) * lateral;
    out.y = lerp(this.py[i], this.py[j], t);
    out.heading = this.hd[i];
    out.bank = 0;
    out.surfaceY = out.y;
    return out;
  }

  headingAt(s) {
    if (s < 0) return this.main.headingAt(this.mainFrom + s);
    if (s > this.length) return this.main.headingAt(this.mainTo + (s - this.length));
    return this.hd[this.idxAt(s)];
  }

  turnAngle(s, span) {
    return wrapAngle(this.headingAt(s + span) - this.headingAt(s));
  }

  inJunction(s) {
    return s < this.splitLen + 2 || s > this.length - this.mergeLen - 2;
  }

  /** side: +1 = 左, -1 = 右。分岐・合流の区間では、メインコース側の壁を開ける */
  wallAt(s, side) {
    if (this.noWalls) return false;
    if (s < this.splitLen + 2 && side === -this.splitSide) return false;
    if (s > this.length - this.mergeLen - 2 && side === -this.mergeSide) return false;
    return true;
  }

  hasGround(s, lateral) {
    if (Math.abs(lateral) <= this.wallOffset + 0.3) return true;
    return !this.noWalls || this.inJunction(s);
  }

  iceAt() {
    return false;
  }

  project(x, z, hint, out) {
    const N = this.count;
    const { px, pz } = this;
    let best = 0;
    let bestD = Infinity;
    const lo = hint == null ? 0 : Math.max(0, hint - 45);
    const hi = hint == null ? N - 1 : Math.min(N - 1, hint + 45);
    for (let i = lo; i <= hi; i++) {
      const dx = x - px[i];
      const dz = z - pz[i];
      const d = dx * dx + dz * dz;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    let a = best;
    if ((x - px[best]) * this.tx[best] + (z - pz[best]) * this.tz[best] < 0) a = best - 1;
    a = clamp(a, 0, N - 2);
    const b = a + 1;
    const sx = px[b] - px[a];
    const sz = pz[b] - pz[a];
    const t = clamp(((x - px[a]) * sx + (z - pz[a]) * sz) / (sx * sx + sz * sz || 1), 0, 1);
    const cx = px[a] + sx * t;
    const cz = pz[a] + sz * t;
    const nx = lerp(this.nx[a], this.nx[b], t);
    const nz = lerp(this.nz[a], this.nz[b], t);
    out.idx = best;
    out.s = (a + t) * this.segLen;
    out.lateral = (x - cx) * nx + (z - cz) * nz;
    out.y = lerp(this.py[a], this.py[b], t);
    out.slope = lerp(this.slope[a], this.slope[b], t);
    out.bank = 0;
    out.ramp = 0;
    out.rampSlope = 0;
    out.groundY = out.y;
    out.ground = this.hasGround(out.s, out.lateral);
    out.tx = this.tx[a];
    out.tz = this.tz[a];
    out.nx = nx;
    out.nz = nz;
    return out;
  }
}
