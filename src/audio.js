/** WebAudio で合成する効果音（音声ファイル不要） */
class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  init() {
    if (this.ctx) {
      this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.35;
    this.master.connect(ctx.destination);

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
      case "bump":
        return this.noise(0.1, 0.15, 600);
      case "lap":
        [784, 988].forEach((f, i) => this.tone(f, 0.18, { type: "triangle", vol: 0.14, delay: i * 0.12 }));
        return;
      case "final":
        [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, 0.2, { type: "triangle", vol: 0.14, delay: i * 0.1 }));
        return;
      case "finish":
        [523, 659, 784, 1047, 784, 1047].forEach((f, i) => this.tone(f, 0.25, { type: "square", vol: 0.1, delay: i * 0.13 }));
        return;
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.35;
    return this.muted;
  }
}

export const sound = new Sound();
