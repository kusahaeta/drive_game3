/** WebAudio で合成する効果音と、コースごとの BGM（mp3 をループ再生） */
class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  init() {
    if (this.ctx) {
      this.ctx.resume();
      if (this.musicSrc && !this.musicPaused) this.bgm.play().catch(() => {});
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.35;
    // 水中では高音をカットしてこもった音に
    this.muffle = ctx.createBiquadFilter();
    this.muffle.type = "lowpass";
    this.muffle.frequency.value = 20000;
    this.master.connect(this.muffle).connect(ctx.destination);

    // BGM も master を通すのでミュートや水中のこもりが効く
    this.bgm = new Audio();
    this.bgm.loop = true;
    this.musicGain = ctx.createGain();
    this.musicGain.gain.value = 0.6;
    ctx.createMediaElementSource(this.bgm).connect(this.musicGain).connect(this.master);
    if (this.musicSrc) this.playMusic(this.musicSrc, true);

    this.engFilter = ctx.createBiquadFilter();
    this.engFilter.type = "lowpass";
    this.engFilter.frequency.value = 900;
    this.engGain = ctx.createGain();
    this.engGain.gain.value = 0;
    this.engFilter.connect(this.engGain).connect(this.master);
    this.eng = [ctx.createOscillator(), ctx.createOscillator()];
    this.eng[0].type = "sawtooth";
    this.eng[1].type = "square";
    this.eng[1].detune.value = 8;
    for (const o of this.eng) {
      o.frequency.value = 60;
      o.connect(this.engFilter);
      o.start();
    }

    const len = ctx.sampleRate * 0.5;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }

  underwater(on) {
    if (!this.ctx || this.isUnderwater === on) return;
    this.isUnderwater = on;
    this.muffle.frequency.setTargetAtTime(on ? 500 : 20000, this.ctx.currentTime, 0.08);
  }

  engine(ratio, boosting, active) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const f = 55 + ratio * 150 + (boosting ? 45 : 0);
    this.eng[0].frequency.setTargetAtTime(f, t, 0.05);
    this.eng[1].frequency.setTargetAtTime(f * 0.5, t, 0.05);
    this.engGain.gain.setTargetAtTime(active ? 0.05 + ratio * 0.05 : 0, t, 0.1);
  }

  tone(freq, dur, { type = "square", vol = 0.15, slide = 0, delay = 0 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  noise(dur, vol, freq = 800) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur);
  }

  play(name, arg) {
    switch (name) {
      case "count":
        return this.tone(440, 0.22, { vol: 0.18 });
      case "go":
        return this.tone(880, 0.6, { vol: 0.2 });
      case "box":
        return this.tone(700, 0.12, { type: "triangle", slide: 500, vol: 0.12 });
      case "roulette":
        return this.tone(1300, 0.03, { vol: 0.04 });
      case "get":
        [660, 880, 1100].forEach((f, i) => this.tone(f, 0.1, { type: "triangle", vol: 0.12, delay: i * 0.06 }));
        return;
      case "boost":
        this.tone(220, 0.45, { type: "sawtooth", slide: 700, vol: 0.1 });
        return this.noise(0.4, 0.12, 2000);
      case "charge":
        return this.tone(500 + arg * 250, 0.08, { type: "triangle", vol: 0.1 });
      case "throw":
        return this.tone(600, 0.15, { type: "triangle", slide: -300, vol: 0.12 });
      case "hit":
        this.noise(0.35, 0.3, 1200);
        return this.tone(500, 0.5, { type: "sawtooth", slide: -420, vol: 0.12 });
      case "wall":
        return this.noise(0.15, Math.min(0.3, 0.05 + arg * 0.02), 400);
      case "trick":
        return this.tone(900, 0.15, { type: "triangle", slide: 600, vol: 0.12 });
      case "land":
        return this.noise(0.18, Math.min(0.3, 0.08 + arg * 0.01), 300);
      case "fall":
        return this.tone(700, 0.9, { type: "triangle", slide: -560, vol: 0.14 });
      case "slam":
        this.noise(0.4, 0.35, 220);
        return this.tone(90, 0.35, { type: "sine", slide: -40, vol: 0.25 });
      case "meteor":
        this.noise(0.6, 0.3, 700);
        return this.tone(160, 0.5, { type: "sawtooth", slide: -100, vol: 0.12 });
      case "splash":
        return this.noise(0.45, 0.18, 1500);
      case "bump":
        return this.noise(0.1, 0.15, 600);
      case "lap":
        [784, 988].forEach((f, i) => this.tone(f, 0.18, { type: "triangle", vol: 0.14, delay: i * 0.12 }));
        return;
      case "final":
        return this.finalLapAlarm();
      case "finish":
        [523, 659, 784, 1047, 784, 1047].forEach((f, i) => this.tone(f, 0.25, { type: "square", vol: 0.1, delay: i * 0.13 }));
        return;
    }
  }

  /** BGM を流す。同じ曲なら続きから（restart で頭から）。init 前なら覚えておいて init で流す */
  playMusic(src, restart = false) {
    const same = src === this.musicSrc;
    this.musicSrc = src;
    this.musicPaused = false;
    if (!this.bgm) return;
    if (!src) return this.bgm.pause();
    this.musicTempo(1);
    if (!same || !this.bgm.src) this.bgm.src = src;
    else if (restart) this.bgm.currentTime = 0;
    this.bgm.play().catch(() => {});
  }

  /** BGM のテンポ（1 = 元の速さ）。音の高さは変えない */
  musicTempo(rate) {
    if (!this.bgm) return;
    this.bgm.preservesPitch = true;
    this.bgm.playbackRate = rate;
  }

  /** BGM を止めて忘れる（次に playMusic するまで resumeMusic や init でも鳴らない） */
  stopMusic() {
    this.musicSrc = null;
    this.bgm?.pause();
  }

  pauseMusic() {
    this.musicPaused = true;
    this.bgm?.pause();
  }

  resumeMusic() {
    this.musicPaused = false;
    if (this.musicSrc) this.bgm?.play().catch(() => {});
  }

  /** 最終ラップの焦らせるジングル：警報のような高い2音 → 駆け上がり → 和音。その間 BGM を下げる */
  finalLapAlarm() {
    if (!this.ctx) return;
    [988, 1319, 988, 1319, 988, 1319].forEach((f, i) => this.tone(f, 0.08, { vol: 0.1, delay: i * 0.09 }));
    [784, 880, 988, 1047, 1175, 1319, 1480].forEach((f, i) => this.tone(f, 0.06, { vol: 0.09, delay: 0.6 + i * 0.05 }));
    [1568, 1976].forEach((f) => this.tone(f, 0.55, { vol: 0.08, delay: 0.97 }));
    this.tone(110, 0.9, { type: "sawtooth", slide: 110, vol: 0.08 }); // 低音のうなりで緊張感
    if (this.musicGain) {
      const t = this.ctx.currentTime;
      const g = this.musicGain.gain;
      g.cancelScheduledValues(t);
      g.setTargetAtTime(0.15, t, 0.03);
      g.setTargetAtTime(0.6, t + 1.3, 0.2);
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.35;
    return this.muted;
  }
}

export const sound = new Sound();
