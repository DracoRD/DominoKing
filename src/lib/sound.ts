class DominoAudioSynth {
  private ctx: AudioContext | null = null;
  public muted = false;

  private ensureContext(): AudioContext | null {
    if (this.muted || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public playDominoSlam(heavy = false) {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Sharp ivory-on-wood transient click
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(heavy ? 185 : 240, now);
    osc.frequency.exponentialRampToValueAtTime(55, now + 0.08);
    gain.gain.setValueAtTime(heavy ? 0.42 : 0.28, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.1);

    // High resonant ivory clack
    const clack = ctx.createOscillator();
    const clackGain = ctx.createGain();
    clack.type = 'sine';
    clack.frequency.setValueAtTime(heavy ? 1150 : 1420, now);
    clack.frequency.exponentialRampToValueAtTime(420, now + 0.035);
    clackGain.gain.setValueAtTime(0.16, now);
    clackGain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
    clack.connect(clackGain);
    clackGain.connect(ctx.destination);
    clack.start(now);
    clack.stop(now + 0.045);
  }

  public playTableKnock() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    [0, 0.12].forEach((offset) => {
      const now = ctx.currentTime + offset;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.exponentialRampToValueAtTime(60, now + 0.06);
      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.075);
    });
  }

  public playCapicuaFanfare() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, idx) => {
      const now = ctx.currentTime + idx * 0.08;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.38);
    });
  }

  public playCoinChime() {
    const ctx = this.ensureContext();
    if (!ctx) return;
    [987.77, 1318.51].forEach((freq, idx) => {
      const now = ctx.currentTime + idx * 0.07;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.27);
    });
  }
}

export const soundFx = new DominoAudioSynth();
