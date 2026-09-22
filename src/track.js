import * as THREE from "three";
import { clamp, lerp, smoothstep, wrapAngle } from "./utils.js";
import { buildTrackScene } from "./trackScene.js";
import { Branch } from "./branch.js";

export const DEFAULT_THEME = {
  skyTop: "#2f7fe0",
  skyBottom: "#cfe9ff",
  fog: "#d4e9fb",
  fogNear: 260,
  fogFar: 1500,
  sunDir: [0.45, 0.7, 0.3],
  sun: "#fff1d0",
  grass: ["#5cb947", "#4aa63c", "#6cc651"],
  sand: "#e3cf94",
  rock: "#8a8078",
  snow: "#f4f7fb",
  water: "#2f8fd8",
  waterLevel: -3,
  terrainBase: 1,
  hills: 14,
  mountains: 150,
  offroad: "#b9975b",
  road: "#56595f",
  roadLine: "#f4f4f4",
  curbA: "#e63946",
  curbB: "#f8f8f8",
  wallA: "#1d5fd8",
  wallB: "#f5f5f5",
  treeLeaf: ["#2f8f3a", "#3aa845", "#277a33", "#4cb34f"],
  treeTrunk: "#7a4b2a",
};

/**
 * コース定義からスプラインを作り、1m 間隔のサンプル列を持つ。
 * 物理・AI・アイテムはすべて project() / pointAt() でコース座標（周回距離 s と横位置 lateral）に変換して扱う。
 * lateral は進行方向に対して左が +。
 */
export class Track {
  constructor(def) {
    this.def = def;
    this.theme = { ...DEFAULT_THEME, ...def.theme };
    this.laps = def.laps ?? 3;
    this.halfWidth = (def.roadWidth ?? 18) / 2;
    this.wallOffset = this.halfWidth + (def.shoulderWidth ?? 6);

    const pts = def.points.map(([x, y, z]) => new THREE.Vector3(x, y, z));
    const curve = new THREE.CatmullRomCurve3(pts, true, "centripetal");
    curve.arcLengthDivisions = pts.length * 200;
    this.length = curve.getLength();
    const N = (this.count = Math.max(200, Math.round(this.length)));
    this.segLen = this.length / N;

    const arr = () => new Float32Array(N);
    Object.assign(this, {
      px: arr(), py: arr(), pz: arr(), tx: arr(), tz: arr(), nx: arr(), nz: arr(), slope: arr(), hd: arr(),
      bank: arr(), gapF: new Uint8Array(N), cliffL: new Uint8Array(N), cliffR: new Uint8Array(N),
      bridgeF: new Uint8Array(N), tunnelF: new Uint8Array(N),
    });
    const p = new THREE.Vector3();
    const t = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
      curve.getPointAt(i / N, p);
      curve.getTangentAt(i / N, t);
      const h = Math.hypot(t.x, t.z) || 1;
      this.px[i] = p.x;
      this.py[i] = p.y;
      this.pz[i] = p.z;
      this.tx[i] = t.x / h;
      this.tz[i] = t.z / h;
      this.nx[i] = t.z / h; // 進行方向の左
      this.nz[i] = -t.x / h;
      this.slope[i] = t.y / h;
      this.hd[i] = Math.atan2(t.x / h, t.z / h);
    }

    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < N; i++) {
      minX = Math.min(minX, this.px[i]);
      maxX = Math.max(maxX, this.px[i]);
      minZ = Math.min(minZ, this.pz[i]);
      maxZ = Math.max(maxZ, this.pz[i]);
    }
    this.bounds = { minX, maxX, minZ, maxZ, cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2 };

    const L = this.length;
    this.itemRows = (def.itemBoxRows ?? []).map((at) => at * L);
    this.boostPads = (def.boostPads ?? []).map((b) => ({
      s: b.at * L,
      lateral: b.lateral ?? 0,
      length: b.length ?? 6,
      width: b.width ?? 4.5,
    }));
    this.setupFeatures(def.features ?? []);
    this.animated = [];
    this.closed = true;
    this.id = 0;
    // 枝道（分岐して合流する道）。paths[0] がメインコース
    this.branches = (def.branches ?? []).map((b, i) => new Branch(this, b, i + 1));
    this.paths = [this, ...this.branches];
  }

  idxAt(s) {
    return Math.round(this.wrapS(s) / this.segLen) % this.count;
  }

  /** メインコース上の s はそのまま（Branch と同じ呼び出し方にそろえるため） */
  mainS(s) {
    return this.wrapS(s);
  }

  /**
   * ワールド座標を、いま走っている道（state.path）の座標へ変換する。
   * 分岐・合流の付近では、メインと枝道の近い方へ乗り移る。
   * out には project の結果に加えて path（道）と mainS（メインコース換算の位置）が入る。
   */
  locate(x, z, state, out) {
    let path = state.path ?? this;
    path.project(x, z, out.idx, out);
    const alt = this._alt ?? (this._alt = {});
    if (path === this) {
      for (const b of this.branches) {
        const inSplit = this.inRange({ s0: b.mainFrom - 3, len: this.wrapS(b.splitMainEnd - b.mainFrom) + 6 }, out.s);
        const inMerge = this.inRange({ s0: b.mergeMainStart - 3, len: this.wrapS(b.mainTo - b.mergeMainStart) + 6 }, out.s);
        if (!inSplit && !inMerge) continue;
        b.project(x, z, inSplit ? 0 : b.count - 1, alt);
        // 行ったり来たりしないよう、はっきり近いときだけ乗り移る
        if (Math.abs(alt.lateral) < Math.abs(out.lateral) - 0.8 && Math.abs(alt.lateral) < b.wallOffset + 1) {
          path = b;
          Object.assign(out, alt);
          break;
        }
      }
    } else if (path.inJunction(out.s)) {
      const nearStart = out.s < path.length / 2;
      this.project(x, z, this.idxAt(nearStart ? path.mainFrom : path.mainTo), alt);
      if (Math.abs(alt.lateral) < Math.abs(out.lateral) - 0.8 && Math.abs(alt.lateral) < this.wallOffset + 1) {
        path = this;
        Object.assign(out, alt);
      }
    }
    state.path = path;
    out.path = path;
    out.mainS = path.mainS(out.s);
    return out;
  }

  /**
   * 進行方向に ahead 先の点。メインコースで分岐に差しかかっていて、choose(branch) が true なら枝道側の点を返す。
   * NPC がルートを選んで走るのに使う。
   */
  routePoint(path, s, ahead, lateral, choose, out) {
    out.hw = path.halfWidth;
    if (path !== this) return path.pointAt(s + ahead, lateral, out);
    for (const b of this.branches) {
      const d = this.deltaS(b.mainFrom, s);
      if (d >= -b.splitLen && d < ahead && choose(b)) {
        out.hw = Math.min(this.halfWidth, b.halfWidth);
        return b.pointAt(ahead - d, lateral, out);
      }
    }
    return this.pointAt(s + ahead, lateral, out);
  }

  setupFeatures(features) {
    const L = this.length;
    const span = (f) => ({ ...f, s0: f.from * L, len: ((((f.to - f.from) % 1) + 1) % 1) * L });
    const of = (type) => features.filter((f) => f.type === type);
    this.ramps = of("ramp").map((f) => ({
      s0: f.at * L,
      len: f.length ?? 10,
      height: f.height ?? 2.4,
      lateral: f.lateral ?? 0,
      width: f.width ?? this.halfWidth * 2,
    }));
    this.gaps = of("gap").map(span);
    this.cliffs = of("cliff").map(span);
    this.bridges = of("bridge").map(span);
    this.tunnels = of("tunnel").map(span);
    this.banks = of("bank").map(span);
    this.ruins = of("ruins").map(span);
    this.ice = of("ice").map(span);
    this.shallows = of("shallows").map(span);

    for (let i = 0; i < this.count; i++) {
      const s = i * this.segLen;
      this.gapF[i] = this.inAny(this.gaps, s) ? 1 : 0;
      this.bridgeF[i] = this.inAny(this.bridges, s) ? 1 : 0;
      this.tunnelF[i] = this.inAny(this.tunnels, s) ? 1 : 0;
      this.cliffL[i] = this.cliffSide(s, 1) ? 1 : 0;
      this.cliffR[i] = this.cliffSide(s, -1) ? 1 : 0;
    }
    // 海に沈んだ道：海面より depth だけ沈める（区間の端はなめらかな坂で海へ入る・出る。深いほど坂が長い）
    this.seaF = new Float32Array(this.count);
    for (const r of this.shallows) {
      const ramp = Math.min(r.ramp ?? Math.max(30, (r.depth ?? 0.4) * 8), r.len / 2.2);
      const target = this.theme.waterLevel - (r.depth ?? 0.4);
      for (let i = 0; i < this.count; i++) {
        const d = this.wrapS(i * this.segLen - r.s0);
        if (d > r.len) continue;
        const w = smoothstep(0, ramp, d) * smoothstep(0, ramp, r.len - d);
        this.py[i] = lerp(this.py[i], target, w);
        this.seaF[i] = Math.max(this.seaF[i], w);
      }
    }
    if (this.shallows.length) {
      const N = this.count;
      const py = this.py;
      for (let i = 0; i < N; i++) {
        const a = (i - 2 + N) % N;
        const b = (i + 2) % N;
        if (this.seaF[i] > 0 || this.seaF[a] > 0 || this.seaF[b] > 0) this.slope[i] = (py[(i + 1) % N] - py[(i - 1 + N) % N]) / (2 * this.segLen);
      }
    }
    // バンク：カーブの外側が高くなるように自動で向きを決める
    for (const b of this.banks) {
      const dir = Math.sign(this.turnAngle(b.s0, b.len)) || 1;
      const slope = -dir * Math.tan(((b.angle ?? 12) * Math.PI) / 180);
      for (let i = 0; i < this.count; i++) {
        const d = this.wrapS(i * this.segLen - b.s0);
        if (d > b.len) continue;
        this.bank[i] += slope * smoothstep(0, 25, Math.min(d, b.len - d));
      }
    }
  }

  wrapS(s) {
    return ((s % this.length) + this.length) % this.length;
  }

  /** s 同士の符号付き差（-L/2〜L/2） */
  deltaS(a, b) {
    const L = this.length;
    let d = (a - b) % L;
    if (d > L / 2) d -= L;
    if (d < -L / 2) d += L;
    return d;
  }

  inRange(r, s) {
    return this.wrapS(s - r.s0) <= r.len;
  }

  inAny(list, s) {
    return list.some((r) => this.inRange(r, s));
  }

  /** side: +1 = 左, -1 = 右 */
  cliffSide(s, side) {
    return this.cliffs.some((c) => this.inRange(c, s) && (c.side === "both" || (c.side === "left") === side > 0));
  }

  /** その位置の外側に壁があるか（side: +1 = 左, -1 = 右）。枝道の分岐・合流の区間は枝道側の壁を開ける */
  wallAt(s, side) {
    if (this.inAny(this.gaps, s) || this.cliffSide(s, side)) return false;
    for (const b of this.branches ?? []) {
      if (side === b.splitSide && this.inRange({ s0: b.mainFrom - 2, len: this.wrapS(b.splitMainEnd - b.mainFrom) + 4 }, s)) return false;
      if (side === b.mergeSide && this.inRange({ s0: b.mergeMainStart - 2, len: this.wrapS(b.mainTo - b.mergeMainStart) + 4 }, s)) return false;
    }
    return true;
  }

  /** 凍った路面か（路面の上だけ。路肩の雪は普通に遅くなる） */
  iceAt(s, lateral) {
    return Math.abs(lateral) <= this.halfWidth + 0.5 && this.inAny(this.ice, s);
  }

  rampAt(s, lateral) {
    for (const r of this.ramps) {
      const d = this.wrapS(s - r.s0);
      if (d <= r.len && Math.abs(lateral - r.lateral) <= r.width / 2) return r.height * Math.pow(d / r.len, 1.5);
    }
    return 0;
  }

  hasGround(s, lateral) {
    if (this.inAny(this.gaps, s)) return false;
    if (Math.abs(lateral) > this.wallOffset + 0.3 && this.cliffSide(s, Math.sign(lateral))) return false;
    return true;
  }

  headingAt(s) {
    return this.hd[Math.floor(this.wrapS(s) / this.segLen) % this.count];
  }

  /** s から s+span までの向きの変化。+ は左カーブ */
  turnAngle(s, span) {
    return wrapAngle(this.headingAt(s + span) - this.headingAt(s));
  }

  pointAt(s, lateral, out) {
    const N = this.count;
    const f = this.wrapS(s) / this.segLen;
    const i = Math.floor(f) % N;
    const j = (i + 1) % N;
    const t = f - Math.floor(f);
    out.x = lerp(this.px[i], this.px[j], t) + lerp(this.nx[i], this.nx[j], t) * lateral;
    out.z = lerp(this.pz[i], this.pz[j], t) + lerp(this.nz[i], this.nz[j], t) * lateral;
    out.y = lerp(this.py[i], this.py[j], t);
    out.heading = this.hd[i];
    out.bank = lerp(this.bank[i], this.bank[j], t);
    out.surfaceY = out.y + out.bank * lateral + this.rampAt(s, lateral);
    return out;
  }

  /**
   * ワールド座標 (x, z) をコース座標へ変換。hint を渡すとその周辺だけ探索する。
   * out: { idx, s, lateral, y(中心線), groundY(路面), ground(足場があるか), slope, bank, tx, tz, nx, nz }
   */
  project(x, z, hint, out) {
    const N = this.count;
    const { px, pz } = this;
    let best = 0;
    let bestD = Infinity;
    const lo = hint == null ? 0 : hint - 45;
    const hi = hint == null ? N - 1 : hint + 45;
    for (let k = lo; k <= hi; k++) {
      const i = ((k % N) + N) % N;
      const dx = x - px[i];
      const dz = z - pz[i];
      const d = dx * dx + dz * dz;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    let a = best;
    if ((x - px[best]) * this.tx[best] + (z - pz[best]) * this.tz[best] < 0) a = (best - 1 + N) % N;
    const b = (a + 1) % N;
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
    out.bank = lerp(this.bank[a], this.bank[b], t);
    out.ramp = this.rampAt(out.s, out.lateral);
    out.rampSlope = out.ramp > 0 ? this.rampAt(out.s + 0.5, out.lateral) - this.rampAt(out.s - 0.5, out.lateral) : 0;
    out.groundY = out.y + out.bank * out.lateral + out.ramp;
    out.ground = this.hasGround(out.s, out.lateral);
    out.tx = this.tx[a];
    out.tz = this.tz[a];
    out.nx = nx;
    out.nz = nz;
    return out;
  }

  update(dt, time) {
    for (const tex of this.animated) tex.offset.y -= dt * 1.4;
    for (const { tex, speed } of this.scrolling ?? []) tex.offset.y -= dt * speed;
    if (this.snowfall) this.snowfall.userData.update(dt);
    for (const f of this.torches ?? []) f.scale.set(1, 0.8 + Math.random() * 0.5, 1);
    if (this.water && this.theme.lava) {
      const map = this.water.material.emissiveMap;
      map.offset.set(time * 0.004, time * 0.007);
    }
    if (this.water && !this.theme.frozen && !this.theme.lava) {
      this.water.material.normalMap.offset.set(time * 0.012, time * 0.02);
    }
    for (const b of this.balloons ?? []) b.position.y = b.userData.baseY + Math.sin(time * 0.3 + b.userData.phase) * 3;
  }

  buildScene() {
    return buildTrackScene(this);
  }
}
