// Synthesised sound effects (WebAudio, no sample files).
// The context is created on the first user gesture, as browsers require.
let ctx = null, master = null, noiseBuf = null;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export const sfx = {
  unlock() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.7;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  },
  // Big boom: filtered noise tail + low sine thump. Volume falls with distance.
  explosion(power = 20, dist = 0) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const vol = clamp(power / 28, 0.25, 1.5) * Math.max(0.12, 1 - dist / 170);
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(2200, t);
    lp.frequency.exponentialRampToValueAtTime(140, t + 1.8);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 2.0);
    src.connect(lp).connect(g).connect(master);
    src.start(t, Math.random());
    src.stop(t + 2.1);
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(95, t);
    o.frequency.exponentialRampToValueAtTime(26, t + 1.0);
    const og = ctx.createGain();
    og.gain.setValueAtTime(vol * 0.9, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
    o.connect(og).connect(master);
    o.start(t);
    o.stop(t + 1.3);
  },
  // Short crack for rifle / pistol shots.
  shot(vol = 0.35, dist = 0) {
    if (!ctx) return;
    const t = ctx.currentTime, v = vol * Math.max(0.15, 1 - dist / 120);
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 900;
    const g = ctx.createGain();
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    src.connect(hp).connect(g).connect(master);
    src.start(t, Math.random());
    src.stop(t + 0.14);
  },
  // Tank main gun: a heavier shot with a rumble.
  cannon(dist = 0) {
    this.shot(0.8, dist);
    this.explosion(8, dist);
  },
  // Dull metallic thud for vehicle crashes.
  crash(power = 5) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.25);
    const g = ctx.createGain();
    g.gain.setValueAtTime(clamp(power / 25, 0.05, 0.5), t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + 0.35);
  },
  // Looping rotor drone (helicopters): created lazily, faded by caller via gain.
  alarm() {
    if (!ctx) return;
    const t = ctx.currentTime;
    for (let i = 0; i < 2; i++) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(i ? 660 : 520, t);
      o.frequency.linearRampToValueAtTime(i ? 520 : 660, t + 0.6);
      o.frequency.linearRampToValueAtTime(i ? 660 : 520, t + 1.2);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.06, t + 0.1);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
      o.connect(g).connect(master);
      o.start(t);
      o.stop(t + 1.6);
    }
  },
};
