import * as THREE from "three";
import { KART_RADIUS } from "./kart.js";
import { lerp } from "./utils.js";

/**
 * コース上で邪魔してくる敵（コース定義の hazards で配置）
 *   { type: "crusher", at, lateral: [-5, 5], period: 3.2, stagger: 0.8, size: 5 }  落ちてくる石ブロック
 *   { type: "ufo", at, count: 1, amplitude, speed: 1 }                            左右に往復する UFO
 *   { type: "meteor", from, to, interval: 1.4 }                                    予告して降ってくる隕石
 *   { type: "snowball", from, to, count: 3, speed: 15, radius: 2.2, fire: false }  to から from へ（逆走方向に）転がる大雪玉（fire: true で大火の玉）
 *   { type: "firebar", at, lateral: 0, length: 7, speed: 1.6 }                     道の上で水平に回る火の玉の棒
 *   { type: "pendulum", at, lateral: [-4.25, 4.25], length: 9, speed: 1.6, phase: 0, stagger: π, amplitude: 0.37 }
 *                                                                                  道を横切って振れる丸太の振り子（lateral の位置に 1 本ずつ。stagger は丸太ごとの振りのずれ）
 *   { type: "penguin", from, to, count: 3, speed: 10 }                             凍った道を腹ばいで斜めに滑り、壁で跳ね返るペンギン
 *   { type: "crab", at, count: 2, speed: 4 }                                       道を横歩きで往復する大ガニ
 *   { type: "lightning", from, to, count: 1, interval: 2.4 }                       車の上へ寄ってきて雷を落とす雷雲
 *   { type: "tornado", from, to, count: 1, speed: 6 }                              蛇行しながら道を行き来するつむじ風（当たると巻き上げられる）
 *   どれも branch: 1 などを付けると、その番号の枝道の上に置ける（位置はその枝道の長さに対する割合）
 * threats は NPC がよけるための危険地点のリスト（vs, vl を付けると動きを先読みしてよける。hw はその横の範囲）。
 */
export class HazardSystem {
  constructor(race) {
    this.race = race;
    this.track = race.track;
    this.group = new THREE.Group();
    this.crushers = [];
    this.ufos = [];
    this.zones = [];
    this.meteors = [];
    this.snowballs = [];
    this.firebars = [];
    this.pendulums = [];
    this.crabs = [];
    this.penguins = [];
    this.clouds = [];
    this.tornados = [];
    this.threats = [];
    for (const h of this.track.def.hazards ?? []) {
      const path = h.branch ? this.track.paths[h.branch] : this.track;
      const L = path.length;
      const hw = path.halfWidth;
      const span = () => ((((h.to - h.from) % 1) + 1) % 1) * L;
      if (h.type === "crusher") {
        (h.lateral ?? [0]).forEach((lateral, j) =>
          this.crushers.push(this.makeCrusher(path, h.at * L, lateral, h.size ?? 5, h.period ?? 3.2, j * (h.stagger ?? 0.8))),
        );
      } else if (h.type === "ufo") {
        for (let k = 0; k < (h.count ?? 1); k++) {
          this.ufos.push(this.makeUfo(path, h.at * L + k * 28, h.amplitude ?? hw * 0.75, h.speed ?? 1, k * 2.1));
        }
      } else if (h.type === "snowball") {
        const zone = { path, s0: h.from * L, len: span() };
        const count = h.count ?? 3;
        for (let k = 0; k < count; k++) {
          this.snowballs.push(this.makeSnowball(zone, h.speed ?? 15, h.radius ?? 2.2, (k / count) * zone.len, !!h.fire));
        }
      } else if (h.type === "meteor") {
        this.zones.push({ path, s0: h.from * L, len: span(), interval: h.interval ?? 1.4, timer: 1 });
      } else if (h.type === "firebar") {
        this.firebars.push(this.makeFirebar(path, h.at * L, h.lateral ?? 0, h.length ?? 7, h.speed ?? 1.6));
      } else if (h.type === "pendulum") {
        const lats = h.lateral == null ? [-hw * 0.5, hw * 0.5] : [].concat(h.lateral);
        this.pendulums.push(this.makePendulum(path, h.at * L, lats, h.length ?? 9, h.speed ?? 1.6, h.phase ?? 0, h.stagger ?? Math.PI, h.amplitude ?? 0.37));
      } else if (h.type === "penguin") {
        const zone = { path, s0: h.from * L, len: span() };
        const count = h.count ?? 3;
        for (let k = 0; k < count; k++) this.penguins.push(this.makePenguin(zone, h.speed ?? 10, k, count));
      } else if (h.type === "crab") {
        for (let k = 0; k < (h.count ?? 2); k++) {
          this.crabs.push(this.makeCrab(path, h.at * L + k * 14, h.speed ?? 4, k * 0.37));
        }
      } else if (h.type === "lightning") {
        const zone = { path, s0: h.from * L, len: span() };
        for (let k = 0; k < (h.count ?? 1); k++) {
          this.clouds.push(this.makeCloud(zone, h.interval ?? 2.4, ((k + 0.5) / (h.count ?? 1)) * zone.len, 1 + k * 1.3));
        }
      } else if (h.type === "tornado") {
        const zone = { path, s0: h.from * L, len: span() };
        const count = h.count ?? 1;
        for (let k = 0; k < count; k++) this.tornados.push(this.makeTornado(zone, h.speed ?? 6, k / count));
      }
    }
    this.meteorGeo = new THREE.IcosahedronGeometry(1.5, 0);
    this.meteorMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff7a2a).multiplyScalar(3) });
    this.trailMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc05a).multiplyScalar(2), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
    this.boltGeo = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true).translate(0, 0.5, 0);
    this.boltMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfffbe0).multiplyScalar(3) });
    this.boltGlowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x9fc8ff).multiplyScalar(2), transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false });
    this.markerMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff3040).multiplyScalar(2), transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false });
  }

  // ------------------------------------------------------------ 生成

  makeCrusher(path, s, lateral, size, period, phase) {
    const p = path.pointAt(s, lateral, {});
    const stone = canvasTex((ctx, w, h) => {
      ctx.fillStyle = "#6f7c96";
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 400; i++) {
        ctx.fillStyle = i % 2 ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.1)";
        ctx.fillRect(Math.random() * w, Math.random() * h, 3, 3);
      }
      ctx.fillStyle = "#4a556c";
      for (const [x, y] of [[14, 14], [w - 14, 14], [14, h - 14], [w - 14, h - 14]]) {
        ctx.beginPath();
        ctx.arc(x, y, 7, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    const face = canvasTex((ctx, w, h) => {
      ctx.drawImage(stone.image, 0, 0);
      // 怒った目と眉、歯
      for (const x of [40, 88]) {
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.ellipse(x, 56, 16, 20, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#111";
        ctx.beginPath();
        ctx.arc(x + (x < 64 ? 5 : -5), 60, 8, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = "#1a1d26";
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.moveTo(20, 26);
      ctx.lineTo(58, 42);
      ctx.moveTo(108, 26);
      ctx.lineTo(70, 42);
      ctx.stroke();
      ctx.fillStyle = "#1a1d26";
      ctx.fillRect(30, 90, 68, 22);
      ctx.fillStyle = "#fff";
      for (let x = 34; x < 96; x += 12) {
        ctx.beginPath();
        ctx.moveTo(x, 90);
        ctx.lineTo(x + 5, 102);
        ctx.lineTo(x + 10, 90);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(x, 112);
        ctx.lineTo(x + 5, 100);
        ctx.lineTo(x + 10, 112);
        ctx.fill();
      }
    });
    const side = new THREE.MeshLambertMaterial({ map: stone });
    const front = new THREE.MeshLambertMaterial({ map: face });
    // BoxGeometry のマテリアル順は +x, -x, +y, -y, +z, -z。-z（向かってくる車の側）に顔
    const block = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), [side, side, side, side, front, front]);
    block.castShadow = true;
    const root = new THREE.Group();
    root.position.set(p.x, p.surfaceY, p.z);
    root.rotation.y = p.heading;
    root.add(block);
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(size * 0.6, 24),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.2;
    root.add(shadow);
    this.group.add(root);
    return { path, s, lateral, size, period, phase, root, block, shadow, top: 9, slammed: false, danger: false };
  }

  makeUfo(path, s, amp, speed, phase) {
    const root = new THREE.Group();
    const hull = new THREE.Mesh(
      new THREE.SphereGeometry(3, 28, 12).scale(1, 0.28, 1),
      new THREE.MeshStandardMaterial({ color: 0xb8c2d6, metalness: 0.7, roughness: 0.3 }),
    );
    hull.castShadow = true;
    root.add(hull);
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(1.4, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x7fe8ff, emissive: 0x2aa8d8, emissiveIntensity: 1.2, transparent: true, opacity: 0.85 }),
    );
    dome.position.y = 0.5;
    root.add(dome);
    const lights = [];
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      const l = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      l.position.set(Math.cos(a) * 2.7, 0, Math.sin(a) * 2.7);
      root.add(l);
      lights.push(l);
    }
    const beam = new THREE.Mesh(
      new THREE.ConeGeometry(2.6, 3.4, 24, 1, true).translate(0, -1.7, 0),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(0x7dffcf).multiplyScalar(1.6), transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    beam.position.y = -0.3;
    root.add(beam);
    this.group.add(root);
    return { path, base: s, amp, speed, phase, root, lights, beam, s, lateral: 0, y: 0 };
  }

  makeSnowball(zone, speed, radius, offset, fire) {
    const mesh = new THREE.Mesh(
      new THREE.IcosahedronGeometry(radius, 2),
      fire
        ? new THREE.MeshStandardMaterial({ color: 0xff5a1a, emissive: new THREE.Color(0xff7a20), emissiveIntensity: 2.2, roughness: 0.6, flatShading: true })
        : new THREE.MeshStandardMaterial({ color: 0xf4f8ff, roughness: 0.85, flatShading: true }),
    );
    mesh.castShadow = true;
    this.group.add(mesh);
    const ball = { zone, speed, radius, mesh, dust: fire ? [0xff7a2a, 0xffd23f] : [0xffffff, 0xdfeaff], d: offset, lateral: 0, s: 0, pos: new THREE.Vector3() };
    this.rerollSnowball(ball);
    return ball;
  }

  /** 道の上で水平に回る、火の玉を並べた棒 */
  makeFirebar(path, s, lateral, length, speed) {
    const p = path.pointAt(s, lateral, {});
    const root = new THREE.Group();
    root.position.set(p.x, p.surfaceY, p.z);
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.9, 1.1, 1.6, 12),
      new THREE.MeshLambertMaterial({ color: 0x5a524c }),
    );
    post.position.y = 0.8;
    post.castShadow = true;
    root.add(post);
    const arm = new THREE.Group();
    arm.position.y = 1.3;
    root.add(arm);
    const ballMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff8a2a).multiplyScalar(3) });
    const n = Math.max(3, Math.round(length / 1.2));
    const balls = [];
    for (let k = 1; k <= n; k++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 8), ballMat);
      b.position.set((k / n) * length, 0, 0);
      arm.add(b);
      balls.push(b);
    }
    this.group.add(root);
    return { path, s, lateral, length, speed, root, arm, balls, heading: p.heading, world: new THREE.Vector3() };
  }

  /**
   * 石の門から吊られ、道を横切って振れる丸太。lats の位置に 1 本ずつ吊る。
   * 振れ幅が小さく、振れている間ずっと車の高さを通るので、道のどこを走っていても当たりうる。
   * 石柱は路肩いっぱいに立っていて（ぶつかると壁のように押し返される）、路肩からは回り込めない。
   */
  makePendulum(path, s, lats, length, speed, phase, stagger, amp) {
    const p = path.pointAt(s, 0, {});
    const q = path.pointAt(s, 1, {});
    const top = length + 1.5;
    const root = new THREE.Group();
    root.position.set(p.x, p.surfaceY + top, p.z);
    root.rotation.y = p.heading;
    // ローカル +x がコースの横位置の + 側か -側か
    const sx = Math.sign(Math.cos(p.heading) * (q.x - p.x) - Math.sin(p.heading) * (q.z - p.z)) || 1;
    // 門：路肩をふさぐ苔むした石柱 2 本と横木
    const stoneMat = new THREE.MeshLambertMaterial({ color: 0x7d7a66, flatShading: true });
    const mossMat = new THREE.MeshLambertMaterial({ color: 0x4c8a34, flatShading: true });
    const hw = path.halfWidth;
    const wide = Math.max(1.6, (path.wallOffset ?? hw + 2) - hw + 0.6);
    const reach = hw + wide / 2;
    for (const side of [1, -1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(wide, top + 1.2, 2.4), stoneMat);
      post.position.set(side * reach, -(top + 1.2) / 2 + 1.2, 0);
      post.castShadow = true;
      const moss = new THREE.Mesh(new THREE.BoxGeometry(wide + 0.2, 0.5, 2.6), mossMat);
      moss.position.set(side * reach, 1.1, 0);
      root.add(post, moss);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(reach * 2 + wide, 1.2, 2.2), stoneMat);
    beam.position.y = 0.4;
    beam.castShadow = true;
    root.add(beam);
    // 振れる部分：つる 2 本と丸太（丸太の向きは道に沿う）
    const vineMat = new THREE.MeshLambertMaterial({ color: 0x3f6a26 });
    const vineGeo = new THREE.CylinderGeometry(0.12, 0.12, length, 5);
    const bark = new THREE.MeshLambertMaterial({ color: 0x6b4a2e, flatShading: true });
    const rings = new THREE.MeshLambertMaterial({ color: 0xc9a06a });
    const logGeo = new THREE.CylinderGeometry(1, 1, 6, 10);
    const logs = lats.map((lateral, j) => {
      const swing = new THREE.Group();
      swing.position.x = sx * lateral;
      root.add(swing);
      for (const z of [-1.8, 1.8]) {
        const vine = new THREE.Mesh(vineGeo, vineMat);
        vine.position.set(0, -length / 2, z);
        swing.add(vine);
      }
      const log = new THREE.Mesh(logGeo, [bark, rings, rings]);
      log.rotation.x = Math.PI / 2;
      log.position.y = -length;
      log.castShadow = true;
      swing.add(log);
      return { swing, log, phase: phase + j * stagger, world: new THREE.Vector3(), danger: false };
    });
    this.group.add(root);
    return {
      path, s, speed, amp, root, logs,
      post: reach - wide / 2,
      center: new THREE.Vector3(p.x, 0, p.z),
      lat: new THREE.Vector2(q.x - p.x, q.z - p.z),
      fwd: new THREE.Vector2(Math.sin(p.heading), Math.cos(p.heading)),
      ground: p.surfaceY,
    };
  }

  /**
   * 凍った道を腹ばいで滑るペンギン。道を斜めに横切り、道の端で跳ね返る。
   * 半分は車と同じ向きに、半分は向かってくる向きに滑る。
   */
  makePenguin(zone, speed, k, count) {
    const black = new THREE.MeshLambertMaterial({ color: 0x1d2330, flatShading: true });
    const white = new THREE.MeshLambertMaterial({ color: 0xf4f6fa, flatShading: true });
    const orange = new THREE.MeshLambertMaterial({ color: 0xff9a1f, flatShading: true });
    const root = new THREE.Group();
    // 腹ばい：体の長い軸がローカル +z（進む向き）
    const body = new THREE.Group();
    root.add(body);
    const back = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10).scale(0.85, 0.7, 1.5), black);
    back.position.y = 0.75;
    back.castShadow = true;
    const belly = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.55).scale(0.8, 0.66, 1.42), white);
    belly.position.y = 0.72;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.62, 12, 10), black);
    head.position.set(0, 1.05, 1.45);
    const face = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 8).scale(1, 0.9, 0.6), white);
    face.position.set(0, 1.0, 1.78);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.5, 6).rotateX(Math.PI / 2), orange);
    beak.position.set(0, 1.0, 2.1);
    body.add(back, belly, head, face, beak);
    for (const x of [-0.24, 0.24]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial({ color: 0x111111 }));
      eye.position.set(x, 1.22, 1.93);
      body.add(eye);
    }
    // ひれは横に広げてパタパタ、足は後ろに伸ばす
    const flippers = [];
    for (const side of [-1, 1]) {
      const f = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6).scale(0.7, 0.12, 0.35), black);
      f.position.set(side * 1.1, 0.75, 0.2);
      body.add(f);
      flippers.push({ f, side });
      const foot = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6).scale(0.18, 0.1, 0.35), orange);
      foot.position.set(side * 0.3, 0.45, -1.55);
      body.add(foot);
    }
    this.group.add(root);
    const hw = zone.path.halfWidth - 1.2;
    const dirS = k % 2 ? -1 : 1;
    return {
      zone, root, body, flippers, hw,
      // 道に沿った速さと横の速さ（斜めに滑る）
      vs: dirS * speed * 0.55,
      vl: (k % 4 < 2 ? 1 : -1) * speed * 0.8,
      d: ((k + 0.5) / count) * zone.len,
      lateral: lerp(-hw, hw, ((k * 0.618) % 1)),
      s: 0, pos: new THREE.Vector3(), grow: 1,
    };
  }

  /** 道を横歩きで往復する大ガニ（向かってくる車の方を向いている） */
  makeCrab(path, s, speed, phase) {
    const p = path.pointAt(s, 0, {});
    const shell = new THREE.MeshLambertMaterial({ color: 0xe8452c, flatShading: true });
    const belly = new THREE.MeshLambertMaterial({ color: 0xffa27a, flatShading: true });
    const root = new THREE.Group();
    const body = new THREE.Group();
    root.add(body);
    const top = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8).scale(1.7, 0.75, 1.2), shell);
    top.position.y = 1.4;
    top.castShadow = true;
    const under = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2).scale(1.6, 0.5, 1.1), belly);
    under.position.y = 1.35;
    body.add(top, under);
    // 目（-z が向かってくる車の側）
    for (const x of [-0.55, 0.55]) {
      const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.8, 6), shell);
      stalk.position.set(x, 2.3, -0.7);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      eye.position.set(x, 2.75, -0.7);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), new THREE.MeshBasicMaterial({ color: 0x111111 }));
      pupil.position.set(x, 2.78, -0.92);
      body.add(stalk, eye, pupil);
    }
    // はさみ
    const claws = [];
    for (const side of [-1, 1]) {
      const arm = new THREE.Group();
      arm.position.set(side * 1.5, 1.4, -0.9);
      const upper = new THREE.Mesh(new THREE.SphereGeometry(0.7, 10, 8).scale(0.8, 0.7, 1.3), shell);
      upper.position.z = -0.6;
      const pincer = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1, 6).rotateX(-Math.PI / 2), shell);
      pincer.position.set(side * 0.2, 0.3, -1.5);
      arm.add(upper, pincer);
      body.add(arm);
      claws.push({ arm, pincer, side });
    }
    // 脚は左右 3 本ずつ
    const legs = [];
    const legGeo = new THREE.CylinderGeometry(0.12, 0.08, 1.8, 5).translate(0, -0.9, 0);
    for (const side of [-1, 1]) {
      for (let k = 0; k < 3; k++) {
        const leg = new THREE.Mesh(legGeo, shell);
        leg.position.set(side * 1.3, 1.3, -0.4 + k * 0.6);
        leg.rotation.z = side * 0.9;
        body.add(leg);
        legs.push({ leg, side, k });
      }
    }
    root.rotation.y = p.heading;
    this.group.add(root);
    return { path, s, speed, phase, root, body, claws, legs, lateral: 0, amp: path.halfWidth - 2.2, pos: new THREE.Vector3(), moving: false };
  }

  /** 車の上へ寄ってきて雷を落とす雷雲 */
  makeCloud(zone, interval, offset, delay) {
    const mat = new THREE.MeshLambertMaterial({ color: 0x3c4150, emissive: 0x000000, flatShading: true });
    const mesh = new THREE.Group();
    for (const [x, y, z, r] of [[0, 0, 0, 2.6], [2.4, -0.3, 0.4, 2], [-2.4, -0.2, -0.3, 2.1], [0.9, 0.9, -1.2, 1.8], [-1, 0.6, 1.3, 1.7], [0, -0.6, 1.8, 1.6]]) {
      const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), mat);
      puff.position.set(x, y, z);
      mesh.add(puff);
    }
    const marker = new THREE.Mesh(new THREE.RingGeometry(2.6, 3.6, 28), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffe14a).multiplyScalar(2), transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }));
    marker.rotation.x = -Math.PI / 2;
    marker.visible = false;
    const bolt = new THREE.Group();
    bolt.visible = false;
    this.group.add(mesh, marker, bolt);
    return {
      zone, interval, mesh, mat, marker, bolt,
      s: zone.s0 + offset, lateral: 0, from: { s: 0, lateral: 0 }, target: { s: 0, lateral: 0 },
      state: "rest", timer: delay, hit: new THREE.Vector3(),
    };
  }

  /** 蛇行しながら道を行き来するつむじ風 */
  makeTornado(zone, speed, offset) {
    const tex = canvasTex((ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < 26; i++) {
        const y = Math.random() * h;
        ctx.strokeStyle = `rgba(${200 + Math.random() * 40},${160 + Math.random() * 40},${110 + Math.random() * 30},${0.35 + Math.random() * 0.5})`;
        ctx.lineWidth = 3 + Math.random() * 6;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.bezierCurveTo(w * 0.3, y - 14, w * 0.7, y + 14, w, y - 6);
        ctx.stroke();
      }
    });
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const root = new THREE.Group();
    const layers = [];
    const n = 6;
    for (let i = 0; i < n; i++) {
      const r0 = 0.9 + i * 0.55;
      const layer = new THREE.Mesh(new THREE.CylinderGeometry(r0 + 0.55, r0, 2.4, 16, 1, true), mat);
      layer.position.y = 1.2 + i * 2.1;
      root.add(layer);
      layers.push(layer);
    }
    this.group.add(root);
    return { zone, speed, root, layers, tex, d: offset * zone.len, dir: 1, phase: offset * 7, s: 0, lateral: 0, pos: new THREE.Vector3() };
  }

  rerollSnowball(ball) {
    const hw = ball.zone.path.halfWidth;
    ball.lateral = lerp(-hw + ball.radius, hw - ball.radius, this.race.rng());
  }

  spawnMeteor(zone) {
    const race = this.race;
    const hw = zone.path.halfWidth;
    const s = zone.s0 + race.rng() * zone.len;
    const lateral = lerp(-hw + 1.5, hw - 1.5, race.rng());
    const p = zone.path.pointAt(s, lateral, {});
    const marker = new THREE.Mesh(new THREE.RingGeometry(2.4, 3.4, 28), this.markerMat);
    marker.rotation.x = -Math.PI / 2;
    marker.position.set(p.x, p.surfaceY + 0.25, p.z);
    const rock = new THREE.Group();
    rock.add(new THREE.Mesh(this.meteorGeo, this.meteorMat));
    const trail = new THREE.Mesh(new THREE.ConeGeometry(1.3, 9, 12, 1, true).translate(0, 4.5, 0), this.trailMat);
    rock.add(trail);
    this.group.add(marker, rock);
    // 斜め上（進行方向の前方寄り）から落ちてくる
    const from = new THREE.Vector3(p.x + Math.sin(p.heading) * 30, p.surfaceY + 70, p.z + Math.cos(p.heading) * 30);
    const to = new THREE.Vector3(p.x, p.surfaceY, p.z);
    // 尾（+y）が落ちてくる方向の後ろを向くように
    rock.position.copy(to);
    rock.lookAt(from);
    rock.rotateX(Math.PI / 2);
    this.meteors.push({ path: zone.path, s, lateral, from, to, t: 0, fall: 1.5, marker, rock, dead: false });
  }

  // ------------------------------------------------------------ 更新

  update(dt) {
    const race = this.race;
    const t = race.clock;
    this.threats.length = 0;

    for (const c of this.crushers) {
      const hoverEnd = c.period - 1.3;
      const u = (t + c.phase) % c.period;
      let h = c.top + Math.sin(t * 2 + c.phase) * 0.3;
      let shake = 0;
      if (u >= hoverEnd && u < hoverEnd + 0.45) shake = 0.25;
      else if (u >= hoverEnd + 0.45 && u < hoverEnd + 0.6) h = lerp(c.top, 0, (u - hoverEnd - 0.45) / 0.15);
      else if (u >= hoverEnd + 0.6 && u < hoverEnd + 1.0) h = 0;
      else if (u >= hoverEnd + 1.0) h = lerp(0, c.top, (u - hoverEnd - 1.0) / 0.3);
      if (h === 0 && !c.slammed) {
        c.slammed = true;
        this.onSlam(c);
      }
      if (u < hoverEnd) c.slammed = false;
      c.block.position.set((Math.random() - 0.5) * shake, h + c.size / 2, (Math.random() - 0.5) * shake);
      const near = 1 - Math.min(1, h / c.top);
      c.shadow.scale.setScalar(0.5 + near * 0.6);
      c.shadow.material.opacity = 0.2 + near * 0.4;
      c.danger = h < 2.2;
      if (u > hoverEnd - 0.9 && u < hoverEnd + 1.0) this.threats.push({ path: c.path, s: c.s, lateral: c.lateral, radius: c.size / 2 + 1.8 });
    }

    for (const u of this.ufos) {
      u.s = u.base + Math.sin(t * 0.25 + u.phase) * 12;
      u.lateral = Math.sin(t * u.speed + u.phase) * u.amp;
      const p = u.path.pointAt(u.s, u.lateral, {});
      u.y = p.surfaceY + 3.6 + Math.sin(t * 3 + u.phase) * 0.3;
      u.root.position.set(p.x, u.y, p.z);
      u.root.rotation.y += dt * 2;
      u.lights.forEach((l, k) => l.material.color.setHSL((k / 10 + t * 0.5) % 1, 1, 0.6).multiplyScalar(2.5));
      u.beam.material.opacity = 0.22 + Math.sin(t * 8) * 0.06;
      this.threats.push({ path: u.path, s: u.s, lateral: u.lateral, radius: 5 });
    }

    // 大雪玉：ゾーンの終わりから始まりへ向かって転がり落ちる
    const p = {};
    const p0 = {};
    for (const b of this.snowballs) {
      if (race.state !== "countdown") b.d += b.speed * dt;
      if (b.d > b.zone.len) {
        b.d -= b.zone.len;
        this.rerollSnowball(b);
      }
      b.s = b.zone.s0 + b.zone.len - b.d;
      b.zone.path.pointAt(b.s, b.lateral, p);
      b.pos.set(p.x, p.surfaceY + b.radius, p.z);
      b.mesh.position.copy(b.pos);
      // 進行方向（コースの逆向き）に転がる回転
      b.mesh.rotation.set(-b.d / b.radius, p.heading, 0, "YXZ");
      // 転がり始めと終わりは小さく
      const grow = Math.min(1, b.d / 12, (b.zone.len - b.d) / 12);
      b.mesh.scale.setScalar(Math.max(0.05, grow));
      if (grow > 0.8 && race.rng() < dt * 8) race.burst(p.x, p.surfaceY + 0.3, p.z, b.dust, 2, 3);
      // 向かってくるので NPC は遠くから（look）よけ始める
      this.threats.push({ path: b.zone.path, s: b.s, lateral: b.lateral, radius: b.radius + 2.2, look: 70 });
    }

    // ファイアバー：回転させ、先の方の火の玉の位置を NPC に教える
    for (const f of this.firebars) {
      const a = t * f.speed;
      f.arm.rotation.y = a;
      // arm のローカル +x を回した方向。コース座標（前後 ds・左右 dl）に直す
      const wx = Math.cos(a);
      const wz = -Math.sin(a);
      const fx = Math.sin(f.heading);
      const fz = Math.cos(f.heading);
      for (const r of [f.length * 0.5, f.length]) {
        const ds = wx * fx + wz * fz;
        const dl = wx * fz - wz * fx;
        this.threats.push({ path: f.path, s: f.s + ds * r, lateral: f.lateral + dl * r, radius: 2.2 });
      }
    }

    if (race.state !== "countdown") {
      for (const z of this.zones) {
        if ((z.timer -= dt) <= 0) {
          z.timer = z.interval * (0.6 + race.rng() * 0.8);
          this.spawnMeteor(z);
        }
      }
    }
    for (const m of this.meteors) {
      m.t += dt;
      const k = Math.min(1, m.t / m.fall);
      m.rock.position.lerpVectors(m.from, m.to, k * k);
      m.marker.scale.setScalar(1.3 - k * 0.5 + Math.sin(m.t * 20) * 0.05);
      this.threats.push({ path: m.path, s: m.s, lateral: m.lateral, radius: 4.5 });
      if (k >= 1) {
        m.dead = true;
        this.group.remove(m.marker, m.rock);
        this.onImpact(m);
      }
    }
    this.meteors = this.meteors.filter((m) => !m.dead);

    // 振り子の丸太：低い所を通る間だけ当たる
    for (const pd of this.pendulums) {
      for (const lg of pd.logs) {
        lg.swing.rotation.z = Math.sin(t * pd.speed + lg.phase) * pd.amp;
        lg.log.getWorldPosition(lg.world);
        const h = lg.world.y - pd.ground;
        lg.danger = h < 2.8;
        if (h < 5) {
          const dx = lg.world.x - pd.center.x;
          const dz = lg.world.z - pd.center.z;
          const lateral = (dx * pd.lat.x + dz * pd.lat.y) / pd.lat.lengthSq();
          this.threats.push({ path: pd.path, s: pd.s, lateral, radius: 3.2 });
        }
      }
    }

    // 大ガニ：端で一休みしながら横歩きで往復する
    for (const c of this.crabs) {
      const u = (t * c.speed / (4 * c.amp) + c.phase) % 1;
      const tri = (u < 0.5 ? 4 * u - 1 : 3 - 4 * u) * 1.35;
      c.moving = Math.abs(tri) < 1;
      c.lateral = Math.max(-1, Math.min(1, tri)) * c.amp;
      c.path.pointAt(c.s, c.lateral, p0);
      c.pos.set(p0.x, p0.surfaceY, p0.z);
      c.root.position.copy(c.pos);
      c.root.rotation.y = p0.heading;
      const step = c.moving ? t * 16 : 0;
      c.body.position.y = c.moving ? Math.abs(Math.sin(step)) * 0.15 : 0;
      for (const l of c.legs) l.leg.rotation.x = c.moving ? Math.sin(step + l.k * 2.1 + l.side) * 0.45 : 0;
      for (const cl of c.claws) {
        cl.arm.rotation.x = -0.3 + Math.sin(t * (c.moving ? 3 : 7) + cl.side) * 0.25;
        cl.pincer.rotation.y = cl.side * Math.max(0, Math.sin(t * 9 + cl.side)) * 0.5;
      }
      this.threats.push({ path: c.path, s: c.s, lateral: c.lateral, radius: 3.4 });
    }

    // ペンギン：ゾーンの中を斜めに滑り、道の端で跳ね返る。ゾーンの端まで来たら反対の端から出直す
    for (const g of this.penguins) {
      const z = g.zone;
      if (race.state !== "countdown") {
        g.d += g.vs * dt;
        g.lateral += g.vl * dt;
      }
      if (g.lateral > g.hw) (g.lateral = g.hw), (g.vl = -Math.abs(g.vl));
      if (g.lateral < -g.hw) (g.lateral = -g.hw), (g.vl = Math.abs(g.vl));
      if (g.d > z.len) g.d -= z.len;
      if (g.d < 0) g.d += z.len;
      g.s = z.s0 + g.d;
      z.path.pointAt(g.s, g.lateral, p0);
      g.pos.set(p0.x, p0.surfaceY, p0.z);
      g.root.position.copy(g.pos);
      // 進む向き：道の向き＋横の速さの分だけ斜め。横位置の + は左（道の法線 n の向き）
      const q = z.path.pointAt(g.s + Math.sign(g.vs), g.lateral + g.vl / Math.abs(g.vs), {});
      g.root.rotation.y = Math.atan2(q.x - p0.x, q.z - p0.z);
      // ゾーンの出入りは小さく
      g.grow = Math.max(0.05, Math.min(1, g.d / 8, (z.len - g.d) / 8));
      g.root.scale.setScalar(g.grow);
      g.body.rotation.z = Math.sin(t * 5 + g.d) * 0.12;
      for (const f of g.flippers) f.f.rotation.z = f.side * (0.3 + Math.sin(t * 14 + g.d) * 0.35);
      if (g.grow > 0.8 && Math.random() < dt * 10) race.burst(p0.x, p0.surfaceY + 0.2, p0.z, [0xffffff, 0xcfeaff], 2, 2);
      // 動く向き（vs, vl）も教えて、NPC が追いついた時にいる所をよけさせる
      this.threats.push({ path: z.path, s: g.s, lateral: g.lateral, radius: 4.6, look: 100, vs: g.vs, vl: g.vl, hw: g.hw });
    }

    // 雷雲：車の行く先へ寄ってきて、黄色い印で予告してから雷を落とす
    for (const c of this.clouds) this.updateCloud(c, dt, t);

    // つむじ風：ゾーンを行ったり来たりしながら左右に蛇行する
    for (const w of this.tornados) {
      if (race.state !== "countdown") w.d += w.speed * w.dir * dt;
      if (w.d > w.zone.len) (w.d = w.zone.len), (w.dir = -1);
      if (w.d < 0) (w.d = 0), (w.dir = 1);
      w.s = w.zone.s0 + w.d;
      w.lateral = Math.sin(t * 0.8 + w.phase) * (w.zone.path.halfWidth - 2.5);
      w.zone.path.pointAt(w.s, w.lateral, p0);
      w.pos.set(p0.x, p0.surfaceY, p0.z);
      w.root.position.copy(w.pos);
      w.layers.forEach((l, i) => {
        l.rotation.y += dt * (7 - i * 0.6);
        l.position.x = Math.sin(t * 2.3 + i * 0.7) * 0.3 * i;
        l.position.z = Math.cos(t * 1.9 + i * 0.7) * 0.3 * i;
      });
      w.tex.offset.x -= dt * 0.8;
      if (Math.random() < dt * 14) race.burst(p0.x, p0.surfaceY + 0.4, p0.z, [0xc8a070, 0xe6cfa0], 2, 5);
      this.threats.push({ path: w.zone.path, s: w.s, lateral: w.lateral, radius: 4, look: 50 });
    }

    this.collide();
  }

  updateCloud(c, dt, t) {
    const race = this.race;
    const path = c.zone.path;
    const inZone = (s) => ((((s - c.zone.s0) % path.length) + path.length) % path.length) <= c.zone.len;
    const clampS = (s) => {
      const d = (((s - c.zone.s0) % path.length) + path.length) % path.length;
      return d <= c.zone.len ? s : c.zone.s0 + (d - c.zone.len < path.length - d ? c.zone.len : 0);
    };
    const hw = path.halfWidth - 1.5;
    c.timer -= dt;
    if (c.state === "rest") {
      c.mat.emissive.setRGB(0, 0, 0);
      if (c.timer <= 0 && race.state !== "countdown") {
        const near = race.karts.filter((k) => (k.path ?? this.track) === path && k.respawnTimer <= 0 && inZone(k.proj.s));
        c.prey = near.length ? near[Math.floor(race.rng() * near.length)] : null;
        c.target.s = c.zone.s0 + race.rng() * c.zone.len;
        c.target.lateral = lerp(-hw, hw, race.rng());
        c.from.s = c.s;
        c.from.lateral = c.lateral;
        c.state = "move";
        c.timer = 0.7;
      }
    } else if (c.state === "move") {
      // 狙った車が 0.9 秒後にいそうな所（印が出たあとハンドルを切ればよけられる）
      if (c.prey) {
        c.target.s = clampS(c.prey.proj.s + Math.max(0, c.prey.speed) * (c.timer + 0.9));
        c.target.lateral = Math.max(-hw, Math.min(hw, c.prey.proj.lateral));
      }
      const k = 1 - Math.max(0, c.timer) / 0.7;
      const e = k * k * (3 - 2 * k);
      c.s = c.from.s + path.deltaS(c.target.s, c.from.s) * e;
      c.lateral = lerp(c.from.lateral, c.target.lateral, e);
      if (c.timer <= 0) {
        c.state = "charge";
        c.timer = 0.9;
        const q = path.pointAt(c.target.s, c.target.lateral, {});
        c.hit.set(q.x, q.surfaceY, q.z);
        c.marker.position.set(q.x, q.surfaceY + 0.25, q.z);
        c.marker.visible = true;
      }
    } else if (c.state === "charge") {
      const f = Math.sin(t * 40) > 0.3 ? 0.35 + (1 - c.timer / 0.9) * 0.6 : 0.05;
      c.mat.emissive.setRGB(f, f, f * 0.6);
      c.marker.scale.setScalar(1.25 - (1 - c.timer / 0.9) * 0.35 + Math.sin(t * 24) * 0.05);
      if (c.timer <= 0) {
        c.state = "strike";
        c.timer = 0.25;
        this.strike(c);
      }
    } else if (c.state === "strike") {
      c.mat.emissive.setRGB(1.2, 1.2, 0.9);
      c.bolt.visible = Math.sin(t * 60) > -0.5;
      if (c.timer <= 0) {
        c.state = "rest";
        c.timer = c.interval * (0.7 + race.rng() * 0.6);
        c.bolt.visible = false;
        c.marker.visible = false;
      }
    }
    const p = path.pointAt(c.s, c.lateral, {});
    c.mesh.position.set(p.x, p.surfaceY + 17 + Math.sin(t * 1.3 + c.zone.s0) * 0.4, p.z);
    c.mesh.rotation.y = t * 0.1;
    if (c.state !== "rest") this.threats.push({ path, s: c.target.s, lateral: c.target.lateral, radius: 4.5 });
  }

  strike(c) {
    const race = this.race;
    // 雲の底から印までジグザグの稲妻
    c.bolt.clear();
    const top = new THREE.Vector3(c.mesh.position.x, c.mesh.position.y - 1.5, c.mesh.position.z);
    const pts = [top];
    const n = 7;
    for (let i = 1; i < n; i++) {
      const v = new THREE.Vector3().lerpVectors(top, c.hit, i / n);
      v.x += (Math.random() - 0.5) * 2.4;
      v.z += (Math.random() - 0.5) * 2.4;
      pts.push(v);
    }
    pts.push(c.hit.clone());
    const up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < pts.length - 1; i++) {
      const dir = new THREE.Vector3().subVectors(pts[i + 1], pts[i]);
      const len = dir.length();
      dir.normalize();
      for (const [mat, r] of [[this.boltMat, 0.2], [this.boltGlowMat, 0.7]]) {
        const seg = new THREE.Mesh(this.boltGeo, mat);
        seg.position.copy(pts[i]);
        seg.quaternion.setFromUnitVectors(up, dir);
        seg.scale.set(r, len, r);
        c.bolt.add(seg);
      }
    }
    c.bolt.visible = true;
    race.burst(c.hit.x, c.hit.y + 0.5, c.hit.z, [0xfff27a, 0xffffff, 0x9fd3ff], 26, 9);
    race.emit("thunder", null, c.hit);
    for (const k of race.karts) {
      if (k.respawnTimer > 0) continue;
      if (Math.hypot(k.pos.x - c.hit.x, k.pos.z - c.hit.z) < 3.2 + KART_RADIUS && Math.abs(k.y - c.hit.y) < 3) this.hitKart(k);
    }
  }


  onSlam(c) {
    const p = c.path.pointAt(c.s, c.lateral, {});
    this.race.burst(p.x, p.surfaceY + 0.3, p.z, [0xd8d0ff, 0xffffff], 18, 7);
    this.race.emit("slam", null, p);
  }

  onImpact(m) {
    const race = this.race;
    race.burst(m.to.x, m.to.y + 0.5, m.to.z, [0xff7a2a, 0xffd23f, 0xffffff], 30, 10);
    race.emit("meteor", null, m.to);
    for (const k of race.karts) {
      if (k.respawnTimer > 0) continue;
      const d = Math.hypot(k.pos.x - m.to.x, k.pos.z - m.to.z);
      if (d < 3.6 + KART_RADIUS && Math.abs(k.y - m.to.y) < 3) this.hitKart(k);
    }
  }

  collide() {
    const track = this.track;
    for (const k of this.race.karts) {
      if (k.respawnTimer <= 0) for (const pd of this.pendulums) this.blockPost(k, pd);
    }
    for (const k of this.race.karts) {
      if (k.respawnTimer > 0 || k.invuln > 0) continue;
      for (const c of this.crushers) {
        if (!c.danger) continue;
        const half = c.size / 2 + KART_RADIUS * 0.8;
        if ((k.path ?? track) !== c.path) continue;
        if (Math.abs(c.path.deltaS(k.proj.s, c.s)) < half && Math.abs(k.proj.lateral - c.lateral) < half && Math.abs(k.y - c.root.position.y) < 3) {
          this.hitKart(k);
        }
      }
      for (const f of this.firebars) {
        for (const ball of f.balls) {
          ball.getWorldPosition(f.world);
          if (Math.hypot(k.pos.x - f.world.x, k.pos.z - f.world.z) < 0.55 + KART_RADIUS && Math.abs(k.y + 0.8 - f.world.y) < 1.6) {
            this.hitKart(k);
            break;
          }
        }
      }
      for (const b of this.snowballs) {
        if (b.mesh.scale.x < 0.8) continue;
        const d = Math.hypot(k.pos.x - b.pos.x, k.pos.z - b.pos.z);
        if (d < b.radius + KART_RADIUS && Math.abs(k.y - (b.pos.y - b.radius)) < 3) this.hitKart(k);
      }
      for (const u of this.ufos) {
        const d = Math.hypot(k.pos.x - u.root.position.x, k.pos.z - u.root.position.z);
        if (d < 2.1 + KART_RADIUS && k.y < u.y && k.y > u.y - 6) this.hitKart(k);
      }
      for (const pd of this.pendulums) {
        for (const lg of pd.logs) {
          if (!lg.danger) continue;
          // 丸太は道に沿って長い（長さ 6・半径 1）
          const dx = k.pos.x - lg.world.x;
          const dz = k.pos.z - lg.world.z;
          const along = dx * pd.fwd.x + dz * pd.fwd.y;
          const across = dx * pd.fwd.y - dz * pd.fwd.x;
          if (Math.abs(along) < 3 + KART_RADIUS * 0.6 && Math.abs(across) < 1 + KART_RADIUS && k.y < lg.world.y + 1 && k.y + 1.6 > lg.world.y - 1) this.hitKart(k);
        }
      }
      for (const g of this.penguins) {
        if (g.grow > 0.8 && Math.hypot(k.pos.x - g.pos.x, k.pos.z - g.pos.z) < 1.3 + KART_RADIUS && Math.abs(k.y - g.pos.y) < 2.5) this.hitKart(k);
      }
      for (const c of this.crabs) {
        if (Math.hypot(k.pos.x - c.pos.x, k.pos.z - c.pos.z) < 1.9 + KART_RADIUS && Math.abs(k.y - c.pos.y) < 2.5) this.hitKart(k);
      }
      for (const w of this.tornados) {
        // 巻き込まれると高く放り上げられる
        if (Math.hypot(k.pos.x - w.pos.x, k.pos.z - w.pos.z) < 2.3 + KART_RADIUS && k.y - w.pos.y < 10 && k.y - w.pos.y > -2 && this.hitKart(k)) k.vy = 13;
      }
    }
  }

  /** 振り子の門の石柱（路肩をふさいでいる）は壁のように押し返す。スピンはしない */
  blockPost(k, pd) {
    if ((k.path ?? this.track) !== pd.path) return;
    const ds = pd.path.deltaS(k.proj.s, pd.s);
    const inS = 1.2 + KART_RADIUS - Math.abs(ds);
    const inL = Math.abs(k.proj.lateral) - (pd.post - KART_RADIUS);
    if (inS <= 0 || inL <= 0) return;
    const latLen = pd.lat.length();
    let nx, nz, push;
    if (inL < inS) {
      // 石柱の内側の面：道の内側へ押し戻す
      const sgn = Math.sign(k.proj.lateral);
      nx = (-pd.lat.x / latLen) * sgn;
      nz = (-pd.lat.y / latLen) * sgn;
      push = inL;
    } else {
      // 石柱の手前（奥）の面：前後へ押し戻す
      const sgn = ds < 0 ? -1 : 1;
      nx = pd.fwd.x * sgn;
      nz = pd.fwd.y * sgn;
      push = inS;
    }
    k.pos.x += nx * push;
    k.pos.z += nz * push;
    // 石柱へ向かう速さを消す
    let vx = Math.sin(k.moveAngle) * k.speed;
    let vz = Math.cos(k.moveAngle) * k.speed;
    const vn = -(vx * nx + vz * nz);
    if (vn <= 0) return;
    vx += nx * vn * 1.3;
    vz += nz * vn * 1.3;
    const v = Math.hypot(vx, vz) * 0.9;
    if (k.speed >= 0) {
      k.moveAngle = Math.atan2(vx, vz);
      k.speed = v;
    } else {
      k.moveAngle = Math.atan2(-vx, -vz);
      k.speed = -v;
    }
    if (vn > 5) {
      k.wallNx = -nx;
      k.wallNz = -nz;
      this.race.emit("wall", k, vn);
    }
  }

  hitKart(k) {
    if (!k.hit()) return false;
    this.race.emit("hit", k, { by: null, type: "hazard" });
    return true;
  }
}

function canvasTex(draw) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  draw(c.getContext("2d"), 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
