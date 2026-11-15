// Iron Curtain - sound, made on the spot with the Web Audio API (no sound files).
// A low drone with radio hiss under everything; teletype clicks for the news, distant thunder for
// battles, Morse pips for a new year, a warning tone when a war breaks out. The drone darkens as
// tension rises. Browsers only allow sound after the first click or key press, so it starts then.
(function () {
  const KEY = 'iron-curtain-sound';
  let ctx = null, master = null, on = true, droneF = null, dread = null, noiseBuf = null;
  try { on = localStorage.getItem(KEY) !== 'off'; } catch (e) { }

  function init() {
    if (ctx || !(window.AudioContext || window.webkitAudioContext)) return;
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
    master = ctx.createGain(); master.gain.value = on ? 0.55 : 0; master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    drone();
  }
  const noise = () => { const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; return s; };
  // the room hums: two low detuned saws through a slow filter, and a little radio hiss
  function drone() {
    const g = ctx.createGain(); g.gain.value = 0.05; g.connect(master);
    droneF = ctx.createBiquadFilter(); droneF.type = 'lowpass'; droneF.frequency.value = 160; droneF.Q.value = 3; droneF.connect(g);
    for (const f of [55, 55.35, 82.4]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(droneF); o.start(); }
    const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 0.05; lg.gain.value = 60; lfo.connect(lg); lg.connect(droneF.frequency); lfo.start();
    // dread: a dissonant tone that only sounds when the world is close to the edge
    dread = ctx.createGain(); dread.gain.value = 0; dread.connect(master);
    const o2 = ctx.createOscillator(); o2.type = 'triangle'; o2.frequency.value = 77.8; o2.connect(dread); o2.start();
    const hiss = noise(), hf = ctx.createBiquadFilter(), hg = ctx.createGain();
    hf.type = 'bandpass'; hf.frequency.value = 2200; hf.Q.value = 0.6; hg.gain.value = 0.006;
    hiss.connect(hf); hf.connect(hg); hg.connect(master); hiss.start();
    const hl = ctx.createOscillator(), hlg = ctx.createGain(); hl.frequency.value = 0.13; hlg.gain.value = 0.004; hl.connect(hlg); hlg.connect(hg.gain); hl.start();
  }
  function env(node, t, peak, attack, decay) { node.gain.setValueAtTime(0, t); node.gain.linearRampToValueAtTime(peak, t + attack); node.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay); }
  // the teletype: a run of short dry clicks
  function teletype(n) {
    if (!ctx) return;
    let t = ctx.currentTime + 0.05;
    for (let i = 0; i < n; i++) {
      const s = noise(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      f.type = 'highpass'; f.frequency.value = 2500 + Math.random() * 1500; s.connect(f); f.connect(g); g.connect(master);
      env(g, t, 0.07 + Math.random() * 0.04, 0.002, 0.025);
      s.start(t, Math.random()); s.stop(t + 0.05);
      t += 0.035 + Math.random() * 0.05 + (Math.random() < 0.12 ? 0.15 : 0);
    }
  }
  // far-off guns: a low rumble and a thump
  function boom(delay, power) {
    if (!ctx) return;
    const t = ctx.currentTime + delay, s = noise(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = 'lowpass'; f.frequency.value = 120 + Math.random() * 160; s.connect(f); f.connect(g); g.connect(master);
    env(g, t, 0.35 * power, 0.015, 1.6 + Math.random()); s.start(t, Math.random()); s.stop(t + 3);
    const o = ctx.createOscillator(), og = ctx.createGain(); o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(32, t + 0.5);
    o.connect(og); og.connect(master); env(og, t, 0.25 * power, 0.01, 0.6); o.start(t); o.stop(t + 0.8);
  }
  function battles(n) { for (let i = 0; i < Math.min(n, 8); i++) boom(0.6 + i * 0.35 + Math.random() * 0.4, 0.6 + Math.random() * 0.5); }
  // Morse pips at the turn of a year (dot-dot-dot-dash: V)
  function morse() {
    if (!ctx) return;
    let t = ctx.currentTime + 0.1;
    for (const len of [0.07, 0.07, 0.07, 0.22]) {
      const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.value = 760; o.connect(g); g.connect(master);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.045, t + 0.008); g.gain.setValueAtTime(0.045, t + len); g.gain.linearRampToValueAtTime(0, t + len + 0.01);
      o.start(t); o.stop(t + len + 0.02); t += len + 0.09;
    }
  }
  // a war breaks out: a falling two-tone call
  function alarm() {
    if (!ctx) return;
    let t = ctx.currentTime + 0.05;
    for (let i = 0; i < 2; i++) for (const f of [523, 392]) {
      const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'square'; o.frequency.value = f;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400;
      o.connect(lp); lp.connect(g); g.connect(master); env(g, t, 0.035, 0.02, 0.32); o.start(t); o.stop(t + 0.4); t += 0.3;
    }
  }
  // the closer to nuclear war, the darker and more uneasy the hum
  function tension(v) {
    if (!ctx) return;
    const t = ctx.currentTime;
    droneF.frequency.setTargetAtTime(160 + v * 2.2, t, 2);
    dread.gain.setTargetAtTime(v >= 70 ? 0.012 + (v - 70) * 0.0012 : 0, t, 2);
  }
  function toggle() {
    on = !on;
    try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch (e) { }
    init();
    if (master) master.gain.setTargetAtTime(on ? 0.55 : 0, ctx.currentTime, 0.2);
    return on;
  }
  for (const ev of ['pointerdown', 'keydown']) document.addEventListener(ev, init, { once: true });
  window.SFX = { init, teletype, boom, battles, morse, alarm, tension, toggle, get on() { return on; } };
})();
