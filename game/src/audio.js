// Solmar Bay — all sound is synthesized with WebAudio: no audio files, no network.
// A tiny step-sequenced music loop (bass + pad + hats), engine hum, sirens, gunshots,
// punches, pickups and mission jingles, all from oscillators and filtered noise.
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.musicTimer = null;
    this.musicStep = 0;
    this.engineOsc = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenTimer = null;
    this.started = false;
  }

  /** Must be called from a user gesture (the New Game click). */
  start() {
    if (this.started) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      this.started = true;
      this.startMusic();
    } catch {
      this.started = false;
    }
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master && this.ctx) this.master.gain.value = muted ? 0 : 0.5;
  }

  /** Short filtered-noise burst (gunshot, punch, crash). */
  noiseBurst(duration, filterFreq, gain, type = 'lowpass') {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * duration));
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = filterFreq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    src.start(t);
  }

  /** One oscillator note with an envelope. */
  tone(freq, duration, type = 'sine', gain = 0.2, slideTo = null, delay = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + duration);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }

  shoot() { this.noiseBurst(0.14, 1800, 0.5, 'highpass'); this.tone(160, 0.09, 'square', 0.16, 60); }
  punch() { this.noiseBurst(0.08, 400, 0.4); }
  crash() { this.noiseBurst(0.3, 500, 0.5); }
  pickup() { this.tone(880, 0.12, 'sine', 0.22); this.tone(1318, 0.18, 'sine', 0.2, null, 0.09); }
  cash() {
    [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.14, 'triangle', 0.2, null, i * 0.07));
  }
  missionDone() {
    [392, 523, 659, 784].forEach((f, i) => this.tone(f, 0.22, 'triangle', 0.22, null, i * 0.1));
  }
  missionFail() { this.tone(220, 0.5, 'sawtooth', 0.16, 110); }
  busted() { this.tone(330, 0.3, 'square', 0.14, 165); this.tone(165, 0.6, 'square', 0.14, 82, 0.3); }
  horn() { this.tone(370, 0.28, 'square', 0.12); this.tone(466, 0.28, 'square', 0.1); }
  door() { this.noiseBurst(0.06, 900, 0.2); }

  /** Continuous engine hum whose pitch follows speed; call every frame while driving. */
  setEngine(running, speedNorm) {
    if (!this.ctx) return;
    if (!running) {
      if (this.engineOsc) {
        try { this.engineOsc.stop(); } catch { /* already stopped */ }
        this.engineOsc = null;
        this.engineGain = null;
      }
      return;
    }
    if (!this.engineOsc) {
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineFilter = this.ctx.createBiquadFilter();
      this.engineFilter.type = 'lowpass';
      this.engineFilter.frequency.value = 900;
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0.0;
      this.engineOsc.connect(this.engineFilter);
      this.engineFilter.connect(this.engineGain);
      this.engineGain.connect(this.master);
      this.engineOsc.start();
    }
    const t = this.ctx.currentTime;
    this.engineOsc.frequency.setTargetAtTime(55 + speedNorm * 165, t, 0.08);
    this.engineFilter.frequency.setTargetAtTime(500 + speedNorm * 1600, t, 0.08);
    this.engineGain.gain.setTargetAtTime(this.muted ? 0 : 0.05 + speedNorm * 0.06, t, 0.08);
  }

  /** Two-tone police siren while any police car is near; call every frame. */
  setSiren(on) {
    if (!this.ctx) return;
    if (!on) {
      if (this.sirenOsc) {
        try { this.sirenOsc.stop(); } catch { /* already stopped */ }
        this.sirenOsc = null;
        this.sirenGain = null;
      }
      // Stop the flip chain too: without this, a pending flip restarts the
      // chain on the NEXT siren and two chains toggle the same oscillator.
      if (this.sirenTimer) { clearTimeout(this.sirenTimer); this.sirenTimer = null; }
      return;
    }
    if (!this.sirenOsc) {
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenOsc.type = 'triangle';
      this.sirenGain = this.ctx.createGain();
      this.sirenGain.gain.value = 0.0;
      this.sirenOsc.connect(this.sirenGain);
      this.sirenGain.connect(this.master);
      this.sirenOsc.start();
      // Alternate 660 / 880 Hz every 0.45 s.
      const flip = () => {
        if (!this.sirenOsc) return;
        const f = this.sirenOsc.frequency.value > 770 ? 660 : 880;
        this.sirenOsc.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.05);
        this.sirenGain.gain.setTargetAtTime(this.muted ? 0 : 0.045, this.ctx.currentTime, 0.05);
        this.sirenTimer = setTimeout(flip, 450);
      };
      flip();
    }
  }

  /** Laid-back sunset-drive loop: Am – F – C – G bass, soft pad, hats. 8 steps a bar. */
  startMusic() {
    if (!this.ctx || this.musicTimer) return;
    const bassRoots = [55, 43.65, 65.41, 49]; // A1 F1 C2 G1, one bar each
    const chords = [[220, 261.6, 329.6], [174.6, 220, 261.6], [261.6, 329.6, 392], [196, 246.9, 293.7]];
    const stepDur = 0.21;
    this.musicTimer = setInterval(() => {
      if (!this.ctx || this.muted) { this.musicStep += 1; return; }
      const step = this.musicStep % 32;
      const bar = Math.floor(step / 8);
      const inBar = step % 8;
      if (inBar === 0) this.tone(bassRoots[bar], 1.5, 'sine', 0.16);
      if (inBar === 0 || inBar === 4) {
        chords[bar].forEach((f) => this.tone(f, 1.1, 'triangle', 0.035));
      }
      if (inBar % 2 === 0) this.noiseBurst(0.03, 6000, 0.05, 'highpass');
      if (inBar === 2 || inBar === 6) this.tone(740 + bar * 20, 0.1, 'sine', 0.05);
      this.musicStep += 1;
    }, stepDur * 1000);
  }
}
