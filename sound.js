// Iron Curtain - sound, made on the spot with the Web Audio API (no sound files).
// Quiet music under everything: slow minor chords with now and then a soft piano note, darker as the world
// gets closer to the edge. On top, a few soft effects: a paper tick for fresh news, distant guns for battles,
// a bell for a new year, a low brass swell when a war breaks out. Browsers only allow sound after the first
// click or key press, so it starts then. The 🔊 button turns it all off (and the game remembers).
(function () {
  const KEY = 'iron-curtain-sound';
  let ctx = null, master = null, musicBus = null, sfxBus = null, padFilter = null, on = true, noiseBuf = null, tensionV = 15, lastTick = 0;
  try { on = localStorage.getItem(KEY) !== 'off'; } catch (e) { }
  const VOL = 0.5;

  function init() {
    if (ctx || !(window.AudioContext || window.webkitAudioContext)) return;
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    master = ctx.createGain(); master.gain.value = on ? VOL : 0;
    // a little room around everything
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 3;
    master.connect(comp); comp.connect(ctx.destination);
    musicBus = ctx.createGain(); musicBus.gain.value = 0.16; musicBus.connect(master);
    sfxBus = ctx.createGain(); sfxBus.gain.value = 0.5; sfxBus.connect(master);
    padFilter = ctx.createBiquadFilter(); padFilter.type = 'lowpass'; padFilter.frequency.value = 900; padFilter.Q.value = 0.4; padFilter.connect(echo(musicBus));
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    music();
  }
  // a soft echo, so the notes ring like in a large room
  function echo(out) {
    const inp = ctx.createGain(), dl = ctx.createDelay(1.5), fb = ctx.createGain(), wet = ctx.createGain(), lp = ctx.createBiquadFilter();
    dl.delayTime.value = 0.42; fb.gain.value = 0.32; wet.gain.value = 0.35; lp.type = 'lowpass'; lp.frequency.value = 1800;
    inp.connect(out); inp.connect(dl); dl.connect(lp); lp.connect(fb); fb.connect(dl); lp.connect(wet); wet.connect(out);
    return inp;
  }
  const hz = midi => 440 * Math.pow(2, (midi - 69) / 12);
  const noise = () => { const s = ctx.createBufferSource(); s.buffer = noiseBuf; return s; };

  // ---- the music: a slow progression in D minor; darker chords when tension is high ----
  const CALM = [[50, 57, 62, 65], [46, 53, 58, 62], [41, 48, 53, 57], [45, 52, 57, 61], [50, 57, 62, 65], [43, 50, 55, 58], [46, 53, 58, 62], [45, 52, 55, 61]];
  const DARK = [[50, 57, 62, 65], [49, 56, 62, 65], [46, 53, 58, 61], [45, 51, 57, 60]];
  const SCALE = [62, 64, 65, 67, 69, 70, 72, 74, 77];
  const BAR = 7.5;                                                       // seconds a chord lasts
  let nextBar = 0, barN = 0;
  function pad(notes, t, len) {
    for (const m of notes) for (const det of [-4, 4]) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = m < 48 ? 'sine' : 'triangle'; o.frequency.value = hz(m); o.detune.value = det;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(m < 48 ? 0.11 : 0.05, t + 2.5); g.gain.setValueAtTime(m < 48 ? 0.11 : 0.05, t + len - 0.5); g.gain.linearRampToValueAtTime(0, t + len + 2.5);
      o.connect(g); g.connect(padFilter); o.start(t); o.stop(t + len + 2.6);
    }
  }
  function pluck(m, t, v) {                                              // a soft piano-like note
    for (const [mult, gv] of [[1, 1], [2, 0.25], [3, 0.08]]) {
      const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.value = hz(m) * mult;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.09 * v * gv, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 3.2 / mult);
      o.connect(g); g.connect(padFilter); o.start(t); o.stop(t + 3.4);
    }
  }
  function music() {
    nextBar = ctx.currentTime + 0.5;
    setInterval(() => {
      if (!ctx || document.hidden) return;
      while (nextBar < ctx.currentTime + 2) {
        const dark = tensionV >= 60, prog = dark ? DARK : CALM, chord = prog[barN % prog.length];
        pad(chord, nextBar, BAR);
        // a few notes of melody over the chord, not every bar
        if (Math.random() < (dark ? 0.35 : 0.6)) {
          const n = 1 + Math.floor(Math.random() * 3);
          for (let i = 0; i < n; i++) {
            const pool = SCALE.filter(m => chord.some(c => (m - c) % 12 === 0) || Math.random() < 0.3);
            pluck(pool[Math.floor(Math.random() * pool.length)], nextBar + 1 + i * (1.2 + Math.random() * 1.4), 0.6 + Math.random() * 0.4);
          }
        }
        nextBar += BAR; barN++;
      }
    }, 500);
  }

  // ---- effects ----
  // fresh news: a soft paper tick (not more than once every few seconds)
  function teletype() {
    if (!ctx || ctx.currentTime - lastTick < 3) return; lastTick = ctx.currentTime;
    for (const dt of [0, 0.09]) {
      const t = ctx.currentTime + 0.05 + dt, s = noise(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      f.type = 'bandpass'; f.frequency.value = 2600; f.Q.value = 1.2; s.connect(f); f.connect(g); g.connect(sfxBus);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.05, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      s.start(t, Math.random()); s.stop(t + 0.08);
    }
  }
  // distant guns: a muffled thud, far away
  function boom(delay, power) {
    if (!ctx) return;
    const t = ctx.currentTime + delay, s = noise(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = 'lowpass'; f.frequency.value = 90 + Math.random() * 50; s.connect(f); f.connect(g); g.connect(sfxBus);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.22 * power, t + 0.04); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
    s.start(t, Math.random()); s.stop(t + 2);
  }
  function battles(n) { for (let i = 0; i < Math.min(n, 3); i++) boom(0.8 + i * 0.7 + Math.random() * 0.5, 0.5 + Math.random() * 0.4); }
  // a new year: a soft bell
  function morse() {
    if (!ctx) return;
    const t = ctx.currentTime + 0.15;
    for (const [m, dt] of [[74, 0], [81, 0.18]]) for (const [mult, gv] of [[1, 1], [2.76, 0.3], [5.4, 0.12]]) {
      const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.value = hz(m) * mult;
      g.gain.setValueAtTime(0, t + dt); g.gain.linearRampToValueAtTime(0.05 * gv, t + dt + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 2.4 / mult);
      o.connect(g); g.connect(echo(sfxBus)); o.start(t + dt); o.stop(t + dt + 2.5);
    }
  }
  // a war breaks out: a low brass swell, two notes
  function alarm() {
    if (!ctx) return;
    let t = ctx.currentTime + 0.1;
    for (const [m, len] of [[50, 0.9], [45, 1.6]]) {
      const f = ctx.createBiquadFilter(), g = ctx.createGain(); f.type = 'lowpass'; f.frequency.setValueAtTime(300, t); f.frequency.linearRampToValueAtTime(900, t + 0.4); f.Q.value = 1;
      for (const det of [-6, 6]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = hz(m); o.detune.value = det; o.connect(f); o.start(t); o.stop(t + len + 0.5); }
      f.connect(g); g.connect(sfxBus);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.06, t + 0.35); g.gain.setValueAtTime(0.06, t + len - 0.3); g.gain.linearRampToValueAtTime(0, t + len + 0.4);
      t += len * 0.8;
    }
  }
  // the closer to nuclear war, the darker the music
  function tension(v) {
    tensionV = v;
    if (!ctx) return;
    padFilter.frequency.setTargetAtTime(v >= 70 ? 550 : v >= 50 ? 750 : 900, ctx.currentTime, 3);
  }
  function toggle() {
    on = !on;
    try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch (e) { }
    init();
    if (master) master.gain.setTargetAtTime(on ? VOL : 0, ctx.currentTime, 0.3);
    return on;
  }
  for (const ev of ['pointerdown', 'keydown']) document.addEventListener(ev, init, { once: true });
  window.SFX = { init, teletype, boom, battles, morse, alarm, tension, toggle, get on() { return on; } };
})();
