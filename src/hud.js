import { ITEMS } from "./items.js";
import { DRIFT_LEVELS } from "./kart.js";
import { formatTime, hexCss, timeHtml } from "./utils.js";

const $ = (id) => document.getElementById(id);
const ITEM_KEYS = Object.keys(ITEMS);

export class HUD {
  constructor() {
    this.root = $("hud");
    this.el = {
      pos: $("pos-num"),
      lap: $("lap-num"),
      lapTotal: $("lap-total"),
      time: $("hud-time"),
      item: $("item-slot"),
      itemCount: $("item-count"),
      speed: $("speed"),
      drift: $("drift-meter"),
      standings: $("standings"),
      toast: $("toast"),
      countdown: $("countdown"),
      warn: $("wrong-way"),
    };
    this.map = $("minimap");
    this.ctx = this.map.getContext("2d");
    this.toastTimer = 0;
    this.lastCount = "";
    this.lastOrder = "";
    this.lastPos = 0;
  }

  show(on) {
    this.root.classList.toggle("hidden", !on);
  }

  setup(race) {
    this.race = race;
    this.el.lapTotal.textContent = race.laps;
    this.lastOrder = "";
    this.lastCount = "";
    this.el.countdown.className = "";
    this.el.countdown.textContent = "";
    this.el.toast.className = "";
    this.toastTimer = 0;

    const t = race.track;
    const { minX, maxX, minZ, maxZ } = t.bounds;
    const size = this.map.width;
    const pad = 16;
    const scale = (size - pad * 2) / Math.max(maxX - minX, maxZ - minZ);
    const ox = (size - (maxX - minX) * scale) / 2;
    const oy = (size - (maxZ - minZ) * scale) / 2;
    // 上が +z、左が +x（運転席から見た向きと一致させる）
    this.toMap = (x, z) => [ox + (maxX - x) * scale, oy + (maxZ - z) * scale];
    this.path = new Path2D();
    for (let i = 0; i <= t.count; i += 3) {
      const [x, y] = this.toMap(t.px[i % t.count], t.pz[i % t.count]);
      if (i === 0) this.path.moveTo(x, y);
      else this.path.lineTo(x, y);
    }
    this.path.closePath();
    // 枝道も同じパスに追加（線が重なって分岐・合流の形になる）
    for (const b of t.branches ?? []) {
      for (let i = 0; i < b.count; i += 3) {
        const [x, y] = this.toMap(b.px[i], b.pz[i]);
        if (i === 0) this.path.moveTo(x, y);
        else this.path.lineTo(x, y);
      }
      const [x, y] = this.toMap(b.px[b.count - 1], b.pz[b.count - 1]);
      this.path.lineTo(x, y);
    }
    this.mapWidth = Math.max(4, t.halfWidth * 2 * scale);
  }

  toast(text, cls = "", duration = 1.6) {
    const el = this.el.toast;
    el.textContent = text;
    el.className = "";
    void el.offsetWidth; // アニメーションを再スタート
    el.className = `show ${cls}`;
    this.toastTimer = duration;
  }

  handleEvent(type, kart, data) {
    const race = this.race;
    if (!race) return;
    const me = kart === race.player;
    switch (type) {
      case "lap":
        if (me) this.toast(`LAP ${data}  ${formatTime(kart.lapTimes.at(-1))}`, "lap");
        break;
      case "finalLap":
        if (me) this.toast("FINAL LAP!", "final", 2);
        break;
      case "finish":
        if (me) this.toast(`FINISH!  ${kart.rank}位`, "final", 4);
        break;
      case "rocket":
        if (me) this.toast("ロケットスタート!", "good");
        break;
      case "trickBoost":
        if (me) this.toast("トリック!", "good", 0.9);
        break;
      case "fall":
        if (me) this.toast("コースアウト!", "bad", 1.4);
        break;
      case "stall":
        if (me) this.toast("エンスト…", "bad");
        break;
      case "driftBoost":
        if (me && data >= 2) this.toast(DRIFT_LEVELS[data - 1].label, "good", 1);
        break;
      case "hit":
        if (me) this.toast("スピン!", "bad", 1);
        else if (data?.by === race.player) this.toast(`${kart.name} にヒット!`, "good", 1.2);
        break;
    }
  }

  update(race, dt) {
    const p = race.player;
    const el = this.el;

    if (p.rank !== this.lastPos) {
      this.lastPos = p.rank;
      el.pos.textContent = p.rank;
      el.pos.parentElement.dataset.rank = p.rank;
      el.pos.parentElement.classList.remove("bump");
      void el.pos.offsetWidth;
      el.pos.parentElement.classList.add("bump");
    }
    el.lap.textContent = Math.min(Math.max(p.lap, 1), race.laps);
    el.time.innerHTML = timeHtml(p.finished ? p.finishTime : race.time);
    el.speed.textContent = Math.round(Math.abs(p.speed) * 3.6);

    // アイテム枠
    if (p.roulette > 0) {
      const k = ITEM_KEYS[Math.floor(performance.now() / 70) % ITEM_KEYS.length];
      el.item.textContent = ITEMS[k].icon;
      el.item.className = "rolling";
      el.itemCount.textContent = "";
    } else if (p.item) {
      el.item.textContent = ITEMS[p.item].icon;
      el.item.className = "ready";
      el.itemCount.textContent = p.itemUses > 1 ? `×${p.itemUses}` : ITEMS[p.item].name;
    } else {
      el.item.textContent = "";
      el.item.className = "";
      el.itemCount.textContent = "";
    }

    // ドリフトゲージ
    if (p.drifting) {
      const lvl = p.driftLevel;
      const next = DRIFT_LEVELS[Math.min(lvl, DRIFT_LEVELS.length - 1)].charge;
      const prev = lvl > 0 ? DRIFT_LEVELS[lvl - 1].charge : 0;
      const frac = lvl >= DRIFT_LEVELS.length ? 1 : (p.driftCharge - prev) / (next - prev);
      el.drift.style.setProperty("--fill", `${Math.min(1, frac) * 100}%`);
      el.drift.style.setProperty("--col", lvl > 0 ? hexCss(DRIFT_LEVELS[lvl - 1].color) : "#ffffff");
      el.drift.classList.add("on");
    } else el.drift.classList.remove("on");

    // 順位表
    const key = race.order.map((k) => k.index).join();
    if (key !== this.lastOrder) {
      this.lastOrder = key;
      el.standings.innerHTML = race.order
        .map((k) => `<li class="${k.isPlayer ? "me" : ""}" style="--c:${hexCss(k.color)}"><b>${k.rank}</b><span>${k.name}</span></li>`)
        .join("");
    }

    // カウントダウン
    if (race.countdownText !== this.lastCount) {
      this.lastCount = race.countdownText;
      el.countdown.textContent = race.countdownText;
      el.countdown.className = "";
      void el.countdown.offsetWidth;
      if (race.countdownText) el.countdown.className = race.countdownText === "GO!" ? "pop go" : "pop";
    }

    el.warn.classList.toggle("show", p.wrongWayTime > 1);
    if (this.toastTimer > 0 && (this.toastTimer -= dt) <= 0) el.toast.className = "";

    this.drawMap(race);
  }

  drawMap(race) {
    const ctx = this.ctx;
    const s = this.map.width;
    ctx.clearRect(0, 0, s, s);
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(0,0,0,0.45)";
    ctx.lineWidth = this.mapWidth + 4;
    ctx.stroke(this.path);
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = this.mapWidth;
    ctx.stroke(this.path);

    const t = race.track;
    const [sx, sy] = this.toMap(t.px[0], t.pz[0]);
    ctx.fillStyle = "#111";
    ctx.fillRect(sx - 5, sy - 2, 10, 4);

    for (const o of race.items.objects) {
      const [x, y] = this.toMap(o.x, o.z);
      ctx.fillStyle = o.type === "banana" ? "#ffd93b" : o.type === "homing" ? "#e63946" : "#2ec27e";
      ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
    }
    const karts = [...race.karts].sort((a, b) => (a.isPlayer ? 1 : 0) - (b.isPlayer ? 1 : 0));
    for (const k of karts) {
      const [x, y] = this.toMap(k.pos.x, k.pos.z);
      ctx.beginPath();
      ctx.arc(x, y, k.isPlayer ? 6 : 4.5, 0, Math.PI * 2);
      ctx.fillStyle = hexCss(k.color);
      ctx.fill();
      ctx.lineWidth = k.isPlayer ? 2.5 : 1.5;
      ctx.strokeStyle = k.isPlayer ? "#fff" : "rgba(0,0,0,0.6)";
      ctx.stroke();
    }
  }
}
