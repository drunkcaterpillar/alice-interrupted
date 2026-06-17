// effects - atmosphere layers, no deps.
//   bg-canvas: base colour / sky / warmth / flash
//   fx-canvas: dust motes, light rays, speed streaks
// both get painted from engine.js's one raf loop

const bgC = document.getElementById("bg-canvas");
const bgX = bgC.getContext("2d");
const fxC = document.getElementById("fx-canvas");
const fxX = fxC.getContext("2d");
const DP = Math.min(devicePixelRatio, 2);

function sizeCanvases() {
  for (const c of [bgC, fxC]) {
    c.width = innerWidth * DP;
    c.height = innerHeight * DP;
    c.style.width = innerWidth + "px";
    c.style.height = innerHeight + "px";
  }
}
sizeCanvases();
addEventListener("resize", sizeCanvases);

// state, engine sets these each frame
window.fx = {
  bgColor: [8, 6, 4],
  dustAlpha: 0,
  rayAlpha: 0,
  streakSpeed: 0,
  warmth: 0,
  flash: 0,
  shake: 0,
  mouthGlow: 0, // daylight bleeding in from the hole's mouth up top
};

// background
window.paintBg = function () {
  const W = bgC.width,
    H = bgC.height,
    f = window.fx;

  bgX.save();
  if (f.shake > 0.01) {
    bgX.translate(
      (Math.random() - 0.5) * f.shake * 10 * DP,
      (Math.random() - 0.5) * f.shake * 10 * DP,
    );
  }

  bgX.fillStyle = `rgb(${f.bgColor[0]},${f.bgColor[1]},${f.bgColor[2]})`;
  bgX.fillRect(0, 0, W, H);

  if (f.warmth > 0.01) {
    bgX.fillStyle = `rgba(32,20,9,${f.warmth * 0.3})`;
    bgX.fillRect(0, 0, W, H);
  }

  // pale daylight from the opening up top, dies off as you sink
  if (f.mouthGlow > 0.01) {
    const g = bgX.createLinearGradient(0, 0, 0, H * 0.45);
    g.addColorStop(0, `rgba(214,228,248,${f.mouthGlow * 0.5})`);
    g.addColorStop(0.5, `rgba(190,205,225,${f.mouthGlow * 0.16})`);
    g.addColorStop(1, "rgba(0,0,0,0)");
    bgX.fillStyle = g;
    bgX.fillRect(0, 0, W, H * 0.45);
  }

  if (f.flash > 0.01) {
    bgX.fillStyle = `rgba(255,245,220,${f.flash})`;
    bgX.fillRect(0, 0, W, H);
  }

  bgX.restore();
};

// particles
const R = Math.random;
const TAU = Math.PI * 2;
const dust = [],
  rays = [],
  streaks = [];

for (let i = 0; i < 80; i++)
  dust.push({
    x: R(), y: R(),
    s: R() * 2 + 0.3,
    sp: R() * 0.1 + 0.02,
    dr: (R() - 0.5) * 0.3,
    ph: R() * TAU,
    a: R() * 0.25 + 0.05,
  });
for (let i = 0; i < 6; i++)
  rays.push({
    x: R(),
    ang: (R() - 0.5) * 0.15,
    w: R() * 3 + 1,
    len: R() * 0.5 + 0.4,
    a: R() * 0.03 + 0.01,
    ph: R() * TAU,
  });
for (let i = 0; i < 50; i++)
  streaks.push({
    x: R(), y: R(),
    sp: R() * 2 + 1,
    len: R() * 150 + 30,
    a: R() * 0.08 + 0.02,
  });

const lerp = (a, b, t) => a + (b - a) * t;
let frame = 0;

window.paintFx = function () {
  const f = window.fx;
  const W = innerWidth,
    H = innerHeight;
  frame++;

  fxX.setTransform(DP, 0, 0, DP, 0, 0);
  fxX.clearRect(0, 0, W, H);
  fxX.globalCompositeOperation = "lighter";

  // rays
  if (f.rayAlpha > 0.005) {
    const wr = lerp(180, 230, f.warmth),
      wg = lerp(170, 200, f.warmth),
      wb = lerp(160, 140, f.warmth);
    for (const r of rays) {
      const sw = Math.sin(frame * 0.004 + r.ph) * 15;
      const x = r.x * W + sw;
      fxX.save();
      fxX.translate(x, 0);
      fxX.rotate(r.ang);
      fxX.fillStyle = `rgba(${wr},${wg},${wb},${r.a * f.rayAlpha})`;
      fxX.fillRect(-r.w / 2, -50, r.w, r.len * H + 50);
      fxX.fillStyle = `rgba(${wr},${wg},${wb},${r.a * f.rayAlpha * 0.3})`;
      fxX.fillRect(-r.w * 2, -50, r.w * 4, r.len * H + 50);
      fxX.restore();
    }
  }

  // streaks
  if (f.streakSpeed > 0.01) {
    const sa = Math.min(1, f.streakSpeed);
    fxX.lineWidth = 0.5;
    for (const s of streaks) {
      s.y = (s.y + (s.sp * f.streakSpeed) / H) % (1 + s.len / H);
      const y = s.y * H;
      fxX.strokeStyle = `rgba(210,200,180,${s.a * sa})`;
      fxX.beginPath();
      fxX.moveTo(s.x * W, y);
      fxX.lineTo(s.x * W, y - s.len * sa);
      fxX.stroke();
    }
  }

  // dust motes
  if (f.dustAlpha > 0.01) {
    const wr = lerp(200, 230, f.warmth),
      wg = lerp(190, 210, f.warmth),
      wb = lerp(170, 155, f.warmth);
    for (const d of dust) {
      d.y += d.sp / H;
      d.x += (d.dr + Math.sin(frame * 0.008 + d.ph) * 0.15) / W;
      if (d.y > 1.01) {
        d.y = -0.01;
        d.x = R();
      }
      if (d.x < -0.01) d.x = 1.01;
      if (d.x > 1.01) d.x = -0.01;
      const flk = 0.5 + Math.sin(frame * 0.025 + d.ph) * 0.5;
      const a = d.a * f.dustAlpha * flk;
      const x = d.x * W,
        y = d.y * H;
      fxX.fillStyle = `rgba(${wr},${wg},${wb},${a})`;
      fxX.beginPath();
      fxX.arc(x, y, d.s, 0, TAU);
      fxX.fill();
      fxX.fillStyle = `rgba(${wr},${wg},${wb},${a * 0.12})`;
      fxX.beginPath();
      fxX.arc(x, y, d.s * 5, 0, TAU);
      fxX.fill();
    }
  }

  fxX.globalCompositeOperation = "source-over";
};
