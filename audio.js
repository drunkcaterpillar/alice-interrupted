// audio - all synthesized, no asset files.
//   wind: filtered brown noise, tracks fall speed
//   rumble: deep sine, grows w/ depth
//   chime: music-box ping when a memory gets written
//   land: soft thump on the heap of sticks + leaves
// off by default, toggle btn kicks it on (autoplay rules)

(function () {
  const btn = document.getElementById("sound-toggle");
  if (!btn) return;
  const stateEl = btn.querySelector(".st-state");

  let ctx = null;
  let on = false;
  let master, windGain, windFilter, rumbleGain, rumbleOsc, delay, delayGain;
  let padGain, padFilter, subGain;

  function build() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();

    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);

    // brown noise buffer, 2s loop
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    noise.loop = true;

    windFilter = ctx.createBiquadFilter();
    windFilter.type = "lowpass";
    windFilter.frequency.value = 420;
    windFilter.Q.value = 0.6;

    windGain = ctx.createGain();
    windGain.gain.value = 0;

    noise.connect(windFilter).connect(windGain).connect(master);
    noise.start();

    // deep rumble
    rumbleOsc = ctx.createOscillator();
    rumbleOsc.type = "sine";
    rumbleOsc.frequency.value = 38;
    rumbleGain = ctx.createGain();
    rumbleGain.gain.value = 0;
    rumbleOsc.connect(rumbleGain).connect(master);
    rumbleOsc.start();

    // cinematic pad: low minor drone that swells w/ depth
    padFilter = ctx.createBiquadFilter();
    padFilter.type = "lowpass";
    padFilter.frequency.value = 420;
    padFilter.Q.value = 0.9;
    padGain = ctx.createGain();
    padGain.gain.value = 0;
    padFilter.connect(padGain).connect(master);
    // a-minor drone, detuned voices for a thick uneasy chord
    for (const [f, det] of [[110, -7], [110, 8], [130.81, 5], [164.81, -6]]) {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = f;
      o.detune.value = det;
      o.connect(padFilter);
      o.start();
    }

    // sub-bass, deepens as the earth closes in
    const subOsc = ctx.createOscillator();
    subOsc.type = "sine";
    subOsc.frequency.value = 32.7;
    subGain = ctx.createGain();
    subGain.gain.value = 0;
    subOsc.connect(subGain).connect(master);
    subOsc.start();

    // echo bus for the chimes
    delay = ctx.createDelay(1.0);
    delay.delayTime.value = 0.31;
    delayGain = ctx.createGain();
    delayGain.gain.value = 0.32;
    delay.connect(delayGain).connect(delay);
    delayGain.connect(master);

    // tick-tock: every half sec, only audible near a clock
    let hi = true;
    setInterval(() => {
      if (!on || tickLevel < 0.03) return;
      const t = ctx.currentTime;
      const o = ctx.createOscillator();
      o.type = "square";
      o.frequency.value = hi ? 1850 : 1430;
      hi = !hi;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = o.frequency.value;
      bp.Q.value = 9;
      const g = ctx.createGain();
      g.gain.setValueAtTime(tickLevel * 0.16, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.055);
      o.connect(bp).connect(g).connect(master);
      o.start(t);
      o.stop(t + 0.07);
    }, 500);

    // heartbeat: two soft thumps, swells near the bottom of the fall
    setInterval(() => {
      if (!on || heartLevel < 0.03) return;
      const thump = (at) => {
        const o = ctx.createOscillator();
        o.type = "sine";
        o.frequency.setValueAtTime(62, at);
        o.frequency.exponentialRampToValueAtTime(38, at + 0.16);
        const g = ctx.createGain();
        g.gain.setValueAtTime(heartLevel * 0.15, at);
        g.gain.exponentialRampToValueAtTime(0.0001, at + 0.24);
        o.connect(g).connect(master);
        o.start(at);
        o.stop(at + 0.28);
      };
      thump(ctx.currentTime);
      thump(ctx.currentTime + 0.3);
    }, 860);
  }

  let tickLevel = 0;
  let heartLevel = 0;
  let lastVoiceT = -1;

  // little synth primitives for the hover voices
  function ping(f, amp, dur, type = "sine", echo = false) {
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = f;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(amp, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(master);
    if (echo) g.connect(delay);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
  function nburst(dur, freq, Q, amp, pow = 2) {
    const len = Math.max(1, (ctx.sampleRate * dur) | 0);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++)
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, pow);
    const s = ctx.createBufferSource();
    s.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = freq;
    f.Q.value = Q;
    const g = ctx.createGain();
    g.gain.value = amp;
    s.connect(f).connect(g).connect(master);
    s.start();
  }
  function thud(f0, f1, amp, dur) {
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.8);
    const g = ctx.createGain();
    g.gain.setValueAtTime(amp, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
  function clink(base, amp) {
    const t = ctx.currentTime;
    for (const m of [1, 1.71, 2.43]) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = base * m;
      const g = ctx.createGain();
      g.gain.setValueAtTime(amp / m, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28 / m + 0.06);
      o.connect(g).connect(master);
      o.start(t);
      o.stop(t + 0.45);
    }
  }
  function creak() {
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(68, t + 0.5);
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = 340;
    f.Q.value = 6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.04, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    o.connect(f).connect(g).connect(master);
    o.start(t);
    o.stop(t + 0.6);
  }

  function setOn(v) {
    on = v;
    btn.classList.toggle("playing", on);
    stateEl.textContent = on ? "sound on" : "sound off";
    if (on) {
      if (!ctx) build();
      if (ctx.state === "suspended") ctx.resume();
      master.gain.setTargetAtTime(0.9, ctx.currentTime, 0.6);
    } else if (ctx) {
      master.gain.setTargetAtTime(0, ctx.currentTime, 0.25);
    }
  }

  btn.addEventListener("click", () => setOn(!on));

  window.AUDIO = {
    // called every frame w/ fall progress (0-1) and |scroll velocity|
    setFall(mp, vel) {
      if (!on || !ctx) return;
      const speed = Math.min(1, vel * 2600);
      const inFall = mp > 0 && mp < 1;
      const w = inFall ? 0.05 + speed * 0.11 + mp * 0.02 : 0.015;
      windGain.gain.setTargetAtTime(w, ctx.currentTime, 0.35);
      windFilter.frequency.setTargetAtTime(
        320 + speed * 650 + mp * 180,
        ctx.currentTime,
        0.3,
      );
      rumbleGain.gain.setTargetAtTime(
        inFall ? 0.012 + mp * 0.05 : 0,
        ctx.currentTime,
        0.5,
      );
      // drone + sub-bass swell w/ depth. quadratic on purpose so the
      // dread piles up toward the bottom instead of rising evenly
      const depth = inFall ? mp : 0;
      padGain.gain.setTargetAtTime(
        inFall ? 0.035 + depth * depth * 0.15 : 0,
        ctx.currentTime,
        0.6,
      );
      padFilter.frequency.setTargetAtTime(420 + depth * 950, ctx.currentTime, 0.6);
      subGain.gain.setTargetAtTime(
        inFall ? 0.02 + depth * 0.075 : 0,
        ctx.currentTime,
        0.6,
      );
      // heartbeat kicks in halfway down + pushes harder
      heartLevel = inFall ? Math.max(0, (mp - 0.4) / 0.6) : 0;
    },

    // each prop's own sound when you sweep onto it
    voice(kind) {
      if (!on || !ctx) return;
      const t = ctx.currentTime;
      if (t - lastVoiceT < 0.07) return; // don't machine-gun it on fast sweeps
      lastVoiceT = t;
      switch (kind) {
        case "porcelain": // teacups + saucers, a bright tinkle
          ping(2320, 0.05, 0.5, "sine", true);
          ping(3100, 0.032, 0.42, "sine", true);
          ping(2760, 0.026, 0.6, "sine", true);
          break;
        case "books": // encyclopedias shoved - a woody shove + pages flutter
          thud(150, 78, 0.09, 0.32);
          nburst(0.3, 520, 0.8, 0.055, 1.5); // low shove whoosh
          nburst(0.18, 2600, 1.1, 0.05, 2.4); // pages flutter
          break;
        case "paper": // maps + pictures, a dry rustle
          nburst(0.22, 3800, 0.9, 0.05, 2.2);
          break;
        case "wood": // chess, shelves, a woody knock
          nburst(0.04, 900, 3, 0.05, 3);
          thud(190, 120, 0.05, 0.12);
          break;
        case "glass": // mirror, jar, bottles, a glassy ring
          ping(1500, 0.05, 0.55, "sine", true);
          ping(4140, 0.018, 0.4, "sine", true);
          break;
        case "metal": // lanterns, lamps, a metallic clink
          clink(1300, 0.05);
          break;
        case "clock": // ticking things, a single tick
          ping(1850, 0.04, 0.05, "square");
          ping(1430, 0.022, 0.05, "square");
          break;
        case "chest": // the locked chest, a wooden creak
          creak();
          break;
        case "latch": // the suitcase, a little click + thunk
          nburst(0.03, 2200, 1, 0.05, 4);
          thud(220, 140, 0.03, 0.1);
          break;
        default:
          ping(900, 0.03, 0.3, "sine", true);
      }
    },

    // how close the nearest clock is (wormhole.js feeds this)
    setTick(level) {
      tickLevel = level;
    },

    // music-box ping, a memory just got written
    chime(i) {
      if (!on || !ctx) return;
      const t = ctx.currentTime;
      const notes = [659.3, 784, 587.3, 880, 698.5];
      const f = notes[i % notes.length];
      for (const [mult, amp] of [[1, 0.085], [2.01, 0.028], [2.99, 0.012]]) {
        const o = ctx.createOscillator();
        o.type = "sine";
        o.frequency.value = f * mult;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(amp, t + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
        o.connect(g);
        g.connect(master);
        g.connect(delay);
        o.start(t);
        o.stop(t + 2.4);
      }
    },

    // lifting a prop off the wall, a curious little pluck
    pick() {
      if (!on || !ctx) return;
      const t = ctx.currentTime;
      for (const [f, amp, dur] of [[392, 0.07, 0.5], [587.3, 0.05, 0.75]]) {
        const o = ctx.createOscillator();
        o.type = "triangle";
        o.frequency.setValueAtTime(f * 0.985, t);
        o.frequency.linearRampToValueAtTime(f, t + 0.04);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(amp, t + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g);
        g.connect(master);
        g.connect(delay);
        o.start(t);
        o.stop(t + dur + 0.05);
      }
    },

    // setting it back careful-like, a soft wooden tap
    place() {
      if (!on || !ctx) return;
      const t = ctx.currentTime;
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(220, t);
      o.frequency.exponentialRampToValueAtTime(150, t + 0.12);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.06, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      o.connect(g).connect(master);
      o.start(t);
      o.stop(t + 0.35);
    },

    // tea slopping out of a cup - a wet glug that drops in pitch
    spill() {
      if (!on || !ctx) return;
      const t = ctx.currentTime;
      const len = (ctx.sampleRate * 0.5) | 0;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++)
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 1.4);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.setValueAtTime(900, t);
      bp.frequency.exponentialRampToValueAtTime(210, t + 0.45);
      bp.Q.value = 4;
      const g = ctx.createGain();
      g.gain.value = 0.07;
      src.connect(bp).connect(g).connect(master);
      src.start(t);
      // a few bubbly bloops over the top
      for (let k = 0; k < 3; k++) {
        const at = t + k * 0.07;
        const o = ctx.createOscillator();
        o.type = "sine";
        const f = 170 + k * 35;
        o.frequency.setValueAtTime(f * 1.6, at);
        o.frequency.exponentialRampToValueAtTime(f * 0.7, at + 0.1);
        const gg = ctx.createGain();
        gg.gain.setValueAtTime(0.05, at);
        gg.gain.exponentialRampToValueAtTime(0.0001, at + 0.13);
        o.connect(gg).connect(master);
        o.start(at);
        o.stop(at + 0.16);
      }
    },

    // a swarm of flies - sawtooth with a fast wing-flutter on the pitch
    buzz() {
      if (!on || !ctx) return;
      const t = ctx.currentTime;
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = 128;
      const lfo = ctx.createOscillator();
      lfo.type = "square";
      lfo.frequency.value = 52;
      const lg = ctx.createGain();
      lg.gain.value = 24;
      lfo.connect(lg).connect(o.frequency);
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 420;
      bp.Q.value = 3;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.035, t + 0.06);
      g.gain.setValueAtTime(0.035, t + 0.5);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
      o.connect(bp).connect(g).connect(master);
      o.start(t);
      lfo.start(t);
      o.stop(t + 1.2);
      lfo.stop(t + 1.2);
    },

    // dust knocked off old wood - a soft airy pff
    dust() {
      if (!on || !ctx) return;
      const t = ctx.currentTime;
      const len = (ctx.sampleRate * 0.4) | 0;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++)
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.setValueAtTime(1900, t);
      hp.frequency.exponentialRampToValueAtTime(620, t + 0.35);
      const g = ctx.createGain();
      g.gain.value = 0.035;
      src.connect(hp).connect(g).connect(master);
      src.start(t);
    },

    // landing on the heap of sticks and dry leaves
    land() {
      if (!on || !ctx) return;
      const t = ctx.currentTime;
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(82, t);
      o.frequency.exponentialRampToValueAtTime(34, t + 0.5);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.16, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.85);
      o.connect(g).connect(master);
      o.start(t);
      o.stop(t + 1);

      // dry leaf rustle
      const len = ctx.sampleRate * 0.45;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++)
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.2);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 2400;
      bp.Q.value = 0.8;
      const ng = ctx.createGain();
      ng.gain.value = 0.05;
      src.connect(bp).connect(ng).connect(master);
      src.start(t + 0.02);
    },
  };
})();
