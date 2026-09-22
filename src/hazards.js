import * as THREE from "three";
import { KART_RADIUS } from "./kart.js";
import { lerp } from "./utils.js";

/**
 * コース上で邪魔してくる敵（コース定義の hazards で配置）
 *   { type: "crusher", at, lateral: [-5, 5], period: 3.2, stagger: 0.8, size: 5 }  落ちてくる石ブロック
 *   { type: "ufo", at, count: 1, amplitude, speed: 1 }                            左右に往復する UFO
 *   { type: "meteor", from, to, interval: 1.4 }                                    予告して降ってくる隕石
 * threats は NPC がよけるための危険地点のリスト。
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
    this.threats = [];
    const L = this.track.length;
    const hw = this.track.halfWidth;
    for (const h of this.track.def.hazards ?? []) {
      if (h.type === "crusher") {
        (h.lateral ?? [0]).forEach((lateral, j) =>
          this.crushers.push(this.makeCrusher(h.at * L, lateral, h.size ?? 5, h.period ?? 3.2, j * (h.stagger ?? 0.8))),
        );
      } else if (h.type === "ufo") {
        for (let k = 0; k < (h.count ?? 1); k++) {
          this.ufos.push(this.makeUfo(h.at * L + k * 28, h.amplitude ?? hw * 0.75, h.speed ?? 1, k * 2.1));
        }
      } else if (h.type === "meteor") {
        this.zones.push({ s0: h.from * L, len: ((((h.to - h.from) % 1) + 1) % 1) * L, interval: h.interval ?? 1.4, timer: 1 });
      }
    }
    this.meteorGeo = new THREE.IcosahedronGeometry(1.5, 0);
    this.meteorMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff7a2a).multiplyScalar(3) });
    this.trailMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc05a).multiplyScalar(2), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
    this.markerMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff3040).multiplyScalar(2), transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false });
  }

  // ------------------------------------------------------------ 生成

  makeCrusher(s, lateral, size, period, phase) {
    const p = this.track.pointAt(s, lateral, {});
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
    return { s, lateral, size, period, phase, root, block, shadow, top: 9, slammed: false, danger: false };
  }

  makeUfo(s, amp, speed, phase) {
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
    return { base: s, amp, speed, phase, root, lights, beam, s, lateral: 0, y: 0 };
  }

  spawnMeteor(zone) {
    const race = this.race;
    const hw = this.track.halfWidth;
    const s = zone.s0 + race.rng() * zone.len;
    const lateral = lerp(-hw + 1.5, hw - 1.5, race.rng());
    const p = this.track.pointAt(s, lateral, {});
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
    this.meteors.push({ s, lateral, from, to, t: 0, fall: 1.5, marker, rock, dead: false });
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
      if (u > hoverEnd - 0.9 && u < hoverEnd + 1.0) this.threats.push({ s: c.s, lateral: c.lateral, radius: c.size / 2 + 1.8 });
    }

    for (const u of this.ufos) {
      u.s = u.base + Math.sin(t * 0.25 + u.phase) * 12;
      u.lateral = Math.sin(t * u.speed + u.phase) * u.amp;
      const p = this.track.pointAt(u.s, u.lateral, {});
      u.y = p.surfaceY + 3.6 + Math.sin(t * 3 + u.phase) * 0.3;
      u.root.position.set(p.x, u.y, p.z);
      u.root.rotation.y += dt * 2;
      u.lights.forEach((l, k) => l.material.color.setHSL((k / 10 + t * 0.5) % 1, 1, 0.6).multiplyScalar(2.5));
      u.beam.material.opacity = 0.22 + Math.sin(t * 8) * 0.06;
      this.threats.push({ s: u.s, lateral: u.lateral, radius: 5 });
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
      this.threats.push({ s: m.s, lateral: m.lateral, radius: 4.5 });
      if (k >= 1) {
        m.dead = true;
        this.group.remove(m.marker, m.rock);
        this.onImpact(m);
      }
    }
    this.meteors = this.meteors.filter((m) => !m.dead);

    this.collide();
  }

  onSlam(c) {
    const p = this.track.pointAt(c.s, c.lateral, {});
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
      if (k.respawnTimer > 0 || k.invuln > 0) continue;
      for (const c of this.crushers) {
        if (!c.danger) continue;
        const half = c.size / 2 + KART_RADIUS * 0.8;
        if (Math.abs(track.deltaS(k.proj.s, c.s)) < half && Math.abs(k.proj.lateral - c.lateral) < half && Math.abs(k.y - c.root.position.y) < 3) {
          this.hitKart(k);
        }
      }
      for (const u of this.ufos) {
        const d = Math.hypot(k.pos.x - u.root.position.x, k.pos.z - u.root.position.z);
        if (d < 2.1 + KART_RADIUS && k.y < u.y && k.y > u.y - 6) this.hitKart(k);
      }
    }
  }

  hitKart(k) {
    if (k.hit()) this.race.emit("hit", k, { by: null, type: "hazard" });
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
