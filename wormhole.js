// wormhole - the rabbit hole as an actual place.
//
// winding catmull-rom tunnel (heading held over a few segments so the
// corners come out long + smooth), dressed w/ real photoscanned props
// (poly haven, cc0): lanterns + oil lamps that actually light the clay,
// clocks, encyclopedias on recessed shelves, an ornate mirror, framed
// 1630s maps "hung upon pegs", a tumbling suitcase, plus playing cards
// fluttering in the lamplight. hover a prop + it leans toward you.
// the camera IS alice, riding the spline down the inside of the tube.

import * as THREE from "https://esm.sh/three@0.160.0";
import { GLTFLoader } from "https://esm.sh/three@0.160.0/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "https://esm.sh/three@0.160.0/examples/jsm/libs/meshopt_decoder.module.js";
import { RGBELoader } from "https://esm.sh/three@0.160.0/examples/jsm/loaders/RGBELoader.js";
import { EffectComposer } from "https://esm.sh/three@0.160.0/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "https://esm.sh/three@0.160.0/examples/jsm/postprocessing/RenderPass.js";
import { ShaderPass } from "https://esm.sh/three@0.160.0/examples/jsm/postprocessing/ShaderPass.js";
import { OutputPass } from "https://esm.sh/three@0.160.0/examples/jsm/postprocessing/OutputPass.js";

// quality tier - phones + small screens get a lighter scene
const LOW =
  Math.min(innerWidth, innerHeight) < 700 ||
  (navigator.hardwareConcurrency || 8) <= 4;

const TOTAL = 42000;
const FALL_START = 0.1; // keep in sync w/ engine.js
const FALL_END = 0.84;
const ENTER_OVER = 0.03;
const EXIT_OVER = 0.025;
const RADIUS = 4.4;

let fallbackP = 0;
window.addEventListener("scroll", () => {
  fallbackP = Math.min(1, scrollY / (TOTAL - innerHeight));
});
const readP = () => (window.APP ? window.APP.p : fallbackP);

const rand = (a, b) => a + Math.random() * (b - a);

// renderer. no MSAA + a lower pixel ratio on phones, where the heavy scene
// otherwise eats too much gpu memory at the tunnel mouth and crashes the tab
const renderer = new THREE.WebGLRenderer({ antialias: !LOW, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, LOW ? 1.25 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.setClearColor(0x000000, 0);
// if the gpu does bail, don't let it take the whole page down
renderer.domElement.addEventListener(
  "webglcontextlost",
  (e) => e.preventDefault(),
  false,
);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.22;

const wCanvas = renderer.domElement;
wCanvas.id = "wormhole-canvas";
Object.assign(wCanvas.style, {
  position: "fixed",
  top: "0",
  left: "0",
  width: "100%",
  height: "100%",
  zIndex: "3",
  pointerEvents: "none",
  willChange: "clip-path",
});
document.body.insertBefore(wCanvas, document.getElementById("fx-canvas"));

// scene + camera
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x231305, 0.031);
scene.add(new THREE.AmbientLight(0x86603c, 0.8));

const camera = new THREE.PerspectiveCamera(
  78,
  innerWidth / innerHeight,
  0.1,
  300,
);

// warm firelight env for the pbr materials (just reflections)
if (!LOW) {
  new RGBELoader().load("media/fireplace_1k.hdr", (hdr) => {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const env = pmrem.fromEquirectangular(hdr).texture;
    scene.environment = env;
    hdr.dispose();
    pmrem.dispose();
  });
}

// radial motion blur - the feel of speed
const RadialBlurShader = {
  uniforms: {
    tDiffuse: { value: null },
    strength: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float strength;
    varying vec2 vUv;
    void main() {
      vec2 dir = vUv - 0.5;
      vec4 sum = vec4(0.0);
      float total = 0.0;
      for (int i = 0; i < 9; i++) {
        float f = float(i) / 9.0;
        float w = 1.0 - f * 0.7;
        vec2 uv = 0.5 + dir * (1.0 - strength * f);
        sum += texture2D(tDiffuse, uv) * w;
        total += w;
      }
      gl_FragColor = sum / total;
    }
  `,
};

let composer = null;
let blurPass = null;
// ?noblur dev param - deterministic frames for headless checks
const NOBLUR = new URLSearchParams(location.search).has("noblur");
if (!LOW && !NOBLUR) {
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  blurPass = new ShaderPass(RadialBlurShader);
  composer.addPass(blurPass);
  // without this the composer skips tone mapping + srgb and the
  // whole tunnel goes dim - phones (no composer) looked brighter
  composer.addPass(new OutputPass());
}

// the winding path
const ctrlPts = [];
{
  const pos = new THREE.Vector3(0, 0, 0);
  const STEP = 13;
  const N = 46; // shorter shaft = props end up closer together
  let theta = rand(0, Math.PI * 2);
  let tilt = 0.62;
  let thetaRate = 0,
    tiltRate = 0;
  for (let i = 0; i < N; i++) {
    ctrlPts.push(pos.clone());
    if (i % 4 === 0) {
      thetaRate = rand(-0.38, 0.38);
      tiltRate = rand(-0.09, 0.09);
    }
    theta += thetaRate;
    tilt = Math.max(0.45, Math.min(0.95, tilt + tiltRate));
    pos.x += Math.sin(tilt) * Math.cos(theta) * STEP;
    pos.z += Math.sin(tilt) * Math.sin(theta) * STEP;
    pos.y -= Math.cos(tilt) * STEP;
  }
}
const curve = new THREE.CatmullRomCurve3(ctrlPts, false, "catmullrom", 0.5);

// the tube
const earthTex = new THREE.TextureLoader().load("media/earth-2k.jpg");
earthTex.wrapS = earthTex.wrapT = THREE.MirroredRepeatWrapping;
// tubegeometry: u runs along the tube, v wraps around it
earthTex.repeat.set(38, 7);
earthTex.colorSpace = THREE.SRGBColorSpace;
earthTex.anisotropy = renderer.capabilities.getMaxAnisotropy();

const tubeMat = new THREE.MeshStandardMaterial({
  map: earthTex,
  bumpMap: earthTex,
  bumpScale: 0.55,
  color: 0x9d8268,
  roughness: 0.95,
  metalness: 0.0,
  envMapIntensity: 0.22,
  side: THREE.BackSide,
});
scene.add(
  new THREE.Mesh(
    new THREE.TubeGeometry(curve, LOW ? 340 : 560, RADIUS, LOW ? 20 : 28, false),
    tubeMat,
  ),
);

// frame helpers
const _pos = new THREE.Vector3();
const _tan = new THREE.Vector3();
const _n = new THREE.Vector3();
const _b = new THREE.Vector3();
function wallPoint(t, angle, inset, out) {
  curve.getPointAt(t, _pos);
  curve.getTangentAt(t, _tan);
  _n.set(0, 1, 0).cross(_tan);
  if (_n.lengthSq() < 0.01) _n.set(1, 0, 0);
  _n.normalize();
  _b.crossVectors(_tan, _n).normalize();
  out
    .copy(_pos)
    .addScaledVector(_n, Math.cos(angle) * RADIUS * inset)
    .addScaledVector(_b, Math.sin(angle) * RADIUS * inset);
  return out;
}
// the wall angle that points most "up" in world space
function topAngle(t) {
  let best = 0,
    bestY = -1e9;
  const v = new THREE.Vector3();
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 12) {
    wallPoint(t, a, 1, v);
    curve.getPointAt(t, _pos);
    const y = v.y - _pos.y;
    if (y > bestY) {
      bestY = y;
      best = a;
    }
  }
  return best;
}

// glow sprites + a recycled pool of point lights
function glowTexture(inner, outer) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const x = c.getContext("2d");
  const g = x.createRadialGradient(64, 64, 2, 64, 64, 64);
  g.addColorStop(0, inner);
  g.addColorStop(0.25, outer);
  g.addColorStop(1, "rgba(0,0,0,0)");
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
const warmGlowTex = glowTexture("rgba(255,235,190,1)", "rgba(255,150,60,0.45)");
const tealGlowTex = glowTexture("rgba(220,255,250,1)", "rgba(80,200,190,0.4)");
const cueGlowTex = glowTexture("rgba(255,244,214,1)", "rgba(232,200,122,0.5)");

// soft pulsing shimmer that says "hey, look closer at this one"
const _hb = new THREE.Box3();
const _hc = new THREE.Vector3();
function addHaloTo(h) {
  if (h.halo || h.isLamp) return;
  _hb.setFromObject(h.root);
  if (_hb.isEmpty()) return;
  _hb.getCenter(_hc);
  const size = _hb.getSize(new THREE.Vector3()).length();
  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: cueGlowTex,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0,
    }),
  );
  halo.scale.setScalar(Math.min(5.5, size * (h.riser ? 1.15 : 0.85)));
  halo.position.copy(h.root.worldToLocal(_hc.clone()));
  h.root.add(halo);
  h.halo = halo;
  h.phase = rand(0, 6.3);
}

const LANTERNS = []; // {t, group, teal, swayPhase, glow}  the lit ones
const LIGHT_POOL = LOW ? 6 : 9;
const lights = [];
for (let i = 0; i < LIGHT_POOL; i++) {
  const L = new THREE.PointLight(0xffa050, 0, 0, 2);
  scene.add(L);
  lights.push(L);
}
const deepLight = new THREE.PointLight(0xff9a3c, 9000, 0, 1.8);
scene.add(deepLight);
const nearLight = new THREE.PointLight(0xffb070, 80, 0, 2);
scene.add(nearLight);

// daylight spilling in at the mouth of the hole, fades as you sink
const mouthLight = new THREE.PointLight(0xdcebff, 5200, 0, 1.7);
curve.getPointAt(0.002, mouthLight.position);
scene.add(mouthLight);

// candle you seem to hold up to whatever you pull off the wall
const holdLight = new THREE.PointLight(0xffe0b0, 0, 0, 2);
scene.add(holdLight);

// prop placement
const HOVERABLES = []; // {root, hot}
const HANGING = []; // {pivot, phase, speed}
const FLOATING = []; // {mesh, rx, rz}

const gltfLoader = new GLTFLoader();
gltfLoader.setMeshoptDecoder(MeshoptDecoder); // props are meshopt-compressed .glb
const shelfMat = new THREE.MeshStandardMaterial({
  color: 0x4a3019,
  roughness: 0.9,
  envMapIntensity: 0.3,
});
const shelfGeo = new THREE.BoxGeometry(2.3, 0.12, 0.9);
const ropeMat = new THREE.MeshStandardMaterial({ color: 0x241409, roughness: 1 });

function prepModel(g, scale, glowY) {
  const root = g.scene;
  root.scale.setScalar(scale);
  root.userData.glowY = (glowY || 0) * scale;
  root.traverse((o) => {
    if (o.isMesh && o.material) o.material.envMapIntensity = 0.55;
  });
  return root;
}

function addGlow(group, teal, glowScale, y) {
  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: teal ? tealGlowTex : warmGlowTex,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0.6,
    }),
  );
  glow.scale.setScalar(glowScale);
  glow.position.y = y || 0;
  group.add(glow);
  return glow;
}

// lamp stood up against the wall
function placeWallLamp(root, t, teal) {
  const group = new THREE.Group();
  group.add(root);
  const glow = addGlow(group, teal, 2.4, root.userData.glowY);
  wallPoint(t, rand(0, Math.PI * 2), 0.8, group.position);
  group.rotation.y = rand(0, Math.PI * 2);
  scene.add(group);
  LANTERNS.push({ t, group, teal, swayPhase: rand(0, 6.3), glow, glowBase: glow.scale.x, flick: 0.16 });
  HOVERABLES.push({ root: group, hot: 0, isLamp: true });
}

// model dangling from a rope pinned to the upper wall
function placeHanging(root, t, teal, dropFrac) {
  const aTop = topAngle(t) + rand(-0.5, 0.5);
  const anchor = wallPoint(t, aTop, 0.97, new THREE.Vector3());
  const target = curve.getPointAt(t, new THREE.Vector3());
  target.lerp(anchor, 1 - dropFrac);

  const pivot = new THREE.Group();
  pivot.position.copy(anchor);
  scene.add(pivot);

  const drop = target.clone().sub(anchor);
  const len = drop.length();
  const rope = new THREE.Mesh(
    new THREE.CylinderGeometry(0.022, 0.022, len, 5),
    ropeMat,
  );
  rope.position.copy(drop.clone().multiplyScalar(0.5));
  rope.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    drop.clone().normalize(),
  );
  pivot.add(rope);

  const holder = new THREE.Group();
  holder.position.copy(drop);
  holder.add(root);
  const glow = addGlow(holder, teal, 2.6, 0);
  pivot.add(holder);

  LANTERNS.push({ t, group: holder, teal, swayPhase: rand(0, 6.3), glow, glowBase: glow.scale.x, flick: 0.42 });
  const hang = { pivot, phase: rand(0, 6.3), speed: rand(0.5, 0.9), boost: 0 };
  HANGING.push(hang);
  HOVERABLES.push({ root: holder, hot: 0, isLamp: true, hang });
}

// shelf set into the side wall w/ a prop standing on it
function placeShelf(root, t, withLight, hov = true) {
  const group = new THREE.Group();
  group.add(new THREE.Mesh(shelfGeo, shelfMat));
  if (!withLight) root.scale.multiplyScalar(rand(0.92, 1.12));
  root.position.y = 0.07;
  group.add(root);
  if (withLight) {
    const glow = addGlow(group, false, 2.2, root.userData.glowY || 0.8);
    LANTERNS.push({ t, group, teal: false, swayPhase: rand(0, 6.3), glow, glowBase: 2.2, flick: 0.24 });
  }
  const aTop = topAngle(t);
  const side = Math.random() < 0.5 ? 1 : -1;
  wallPoint(t, aTop + (Math.PI / 2) * side, 0.74, group.position);
  group.rotation.y = rand(0, Math.PI * 2);
  scene.add(group);
  // grab just the prop, not the shelf under it
  if (hov) HOVERABLES.push({ root: group, grab: root, hot: 0, isLamp: withLight });
}

// flat against the wall, facing into the shaft
function placeWallFlat(root, t, hov = true) {
  const group = new THREE.Group();
  root.scale.multiplyScalar(rand(0.9, 1.14));
  const wob = new THREE.Group(); // hover gives it a little nudge on its peg
  wob.add(root);
  group.add(wob);
  wallPoint(t, rand(0, Math.PI * 2), 0.92, group.position);
  group.lookAt(curve.getPointAt(t, new THREE.Vector3()));
  group.rotateZ(rand(-0.1, 0.1));
  scene.add(group);
  if (hov) HOVERABLES.push({ root: group, hot: 0, wob, wobAmt: 0 });
}

// growing out of the wall (moss, ferns) - +y points into the shaft
function placeWallPatch(root, t) {
  const group = new THREE.Group();
  root.scale.multiplyScalar(rand(0.75, 1.35));
  group.add(root);
  wallPoint(t, rand(0, Math.PI * 2), 0.99, group.position);
  const n = curve
    .getPointAt(t, new THREE.Vector3())
    .sub(group.position)
    .normalize();
  group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
  group.rotateY(rand(0, Math.PI * 2));
  scene.add(group);
}

// tumbling loose in the shaft
function placeFloating(root, t, inset, hov = true) {
  const group = new THREE.Group();
  root.scale.multiplyScalar(rand(0.88, 1.12));
  group.add(root);
  wallPoint(t, rand(0, Math.PI * 2), inset, group.position);
  group.rotation.set(rand(0, 6.3), rand(0, 6.3), rand(0, 6.3));
  scene.add(group);
  const fl = { mesh: group, rx: rand(0.06, 0.2), rz: rand(0.05, 0.16), stir: 0 };
  FLOATING.push(fl);
  if (hov) HOVERABLES.push({ root: group, hot: 0, fl });
}

// floating dead-centre in the shaft - a set-piece you fall straight past
const CENTERPIECES = [];
function placeCenterpiece(root, t) {
  const group = new THREE.Group();
  root.scale.multiplyScalar(1.7); // it's a set-piece, not a trinket
  group.add(root);
  wallPoint(t, rand(0, Math.PI * 2), 0.15, group.position);
  // top faces up the tunnel so the falling camera reads it like a table
  const tan = curve.getTangentAt(t, new THREE.Vector3());
  group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tan.negate());
  scene.add(group);
  CENTERPIECES.push({ group, base: group.position.clone(), phase: rand(0, 6.3) });
  HOVERABLES.push({ root: group, hot: 0 });
}

// labelled specimens drift up past the falling camera, glowing.
// if it glints and moves, you can catch it
const RISERS = [];
const _rsV = new THREE.Vector3();
function placeRiser(root, spdScale = 1) {
  const group = new THREE.Group();
  group.add(root);
  scene.add(group);
  const rs = {
    group,
    // staggered way below so they show up one at a time, out in the
    // outer lanes - company beside you, not traffic in your face
    tOff: rand(-0.04, 0.4),
    spd: rand(0.0045, 0.009) * spdScale,
    ang: rand(0, 6.3),
    inset: rand(0.45, 0.8),
    phase: rand(0, 6.3),
    snap: true,
  };
  RISERS.push(rs);
  const hov = { root: group, hot: 0, riser: rs };
  HOVERABLES.push(hov);
  return hov;
}

// break a multi-part model (the tea set) into its pieces and let them
// drift loose + at all angles instead of sitting in one tidy tray.
// cups + the pot get tagged so they spill when you grab them.
function scatterParts(root, tMid, sfx) {
  const base = root.scale.x; // prepModel already baked the scale onto root
  for (const part of [...root.children]) {
    part.position.set(0, 0, 0); // pivot each piece about itself
    const group = new THREE.Group();
    group.add(part);
    // a single cup is small, so blow them up so they actually read, and
    // keep them in the dead-centre lane so they sail right through mid-screen
    group.scale.setScalar(base * rand(2.0, 2.7));
    wallPoint(tMid + rand(-0.03, 0.03), rand(0, Math.PI * 2), rand(0.04, 0.22), group.position);
    group.rotation.set(rand(0, 6.3), rand(0, 6.3), rand(0, 6.3));
    scene.add(group);
    const fl = { mesh: group, rx: rand(0.05, 0.2), rz: rand(0.04, 0.16), stir: 0 };
    FLOATING.push(fl);
    const pours = /(cup_small|teapot)/.test(part.name) && !/lid/.test(part.name);
    HOVERABLES.push({ root: group, hot: 0, fl, sfx, spill: pours });
  }
}

const M = (id) => `media/models/${id}/${id}_1k.glb`;
const halfIfLow = (ts) => (LOW ? ts.filter((_, i) => i % 2 === 0) : ts);

// clocks you hear ticking as you go by (t along the curve)
const CLOCK_TS = [0.27, 0.69, 0.44, 0.77, 0.6];

const PROPS = [
  { file: M("Lantern_01"), scale: 2.3, glowY: 1.0, sfx: "metal",
    place(r) {
      for (const t of halfIfLow([0.06, 0.135, 0.21, 0.295, 0.38, 0.475, 0.56, 0.655, 0.74, 0.82, 0.9, 0.955]))
        placeWallLamp(r.clone(), t + rand(-0.01, 0.01), false);
    } },
  { file: M("vintage_oil_lamp"), scale: 2.1, glowY: 0.8, sfx: "metal",
    place(r) {
      for (const t of halfIfLow([0.13, 0.305, 0.47, 0.645, 0.81])) placeShelf(r.clone(), t, true);
    } },
  { file: M("lantern_chandelier_01"), scale: 2.4, sfx: "metal",
    place(r) {
      for (const t of halfIfLow([0.165, 0.45, 0.585, 0.715, 0.86]))
        placeHanging(r.clone(), t, false, 0.55);
    } },
  { file: M("caged_hanging_light"), scale: 2.0, sfx: "metal",
    place(r) {
      placeHanging(r.clone(), 0.3, true, 0.5);
      if (!LOW) placeHanging(r.clone(), 0.66, true, 0.6);
      if (!LOW) placeHanging(r.clone(), 0.94, true, 0.5);
    } },
  { file: M("mantel_clock_01"), scale: 2.7, sfx: "clock", place(r) {
      placeShelf(r.clone(), 0.27, false, false);
      placeShelf(r.clone(), 0.69, false, false);
    } },
  { file: M("alarm_clock_01"), scale: 2.4, sfx: "clock",
    label: "an alarm clock · very late", place(r) {
      placeFloating(r.clone(), 0.44, 0.22);
      placeFloating(r.clone(), 0.77, 0.22);
    } },
  { file: M("book_encyclopedia_set_01"), scale: 2.5, fx: "books", sfx: "books",
    label: "encyclopædias · escaped their shelf", place(r) {
      placeShelf(r.clone(), 0.47, false);
      // rest of them tumble loose in the shaft (67k tris each, go easy)
      placeFloating(r.clone(), 0.2, rand(0.22, 0.35));
      if (!LOW) placeFloating(r.clone(), 0.7, rand(0.22, 0.35));
    } },
  { file: M("wooden_bookshelf_worn"), scale: 2.3, sfx: "wood", place(r) {
      placeWallFlat(r.clone(), 0.3, false);
      if (!LOW) placeWallFlat(r.clone(), 0.78, false);
    } },
  { file: M("tea_set_01"), scale: 2.4, sfx: "porcelain",
    label: "the tea things · someone is expected", place(r) {
      scatterParts(r, 0.55, "porcelain"); // cups + saucers tumble loose
    } },
  { file: M("treasure_chest"), scale: 1.8, fx: "chest", sfx: "chest",
    label: "a chest · it was not locked after all", place(r) {
      placeFloating(r.clone(), 0.745, 0.3); // just one, 103k tris
    } },
  { file: M("ornate_mirror_01"), scale: 3.0, sfx: "glass",
    label: "an ornate looking-glass", place(r) {
      placeRiser(r.clone(), 0.7); // heavy thing, climbs slow
    } },
  { file: M("hanging_picture_frame_01"), scale: 2.8, sfx: "paper", place(r) {
      for (const t of halfIfLow([0.115, 0.255, 0.42, 0.6, 0.72, 0.89]))
        placeWallFlat(r.clone(), t, false);
    } },
  { file: M("vintage_suitcase"), scale: 2.1, sfx: "latch",
    label: "somebody's luggage", place(r) {
      placeFloating(r.clone(), 0.24, 0.32);
      if (!LOW) placeFloating(r.clone(), 0.66, 0.28);
    } },
  { file: M("vintage_telephone_wall_clock"), scale: 2.4, sfx: "clock", place(r) {
      placeWallFlat(r.clone(), 0.6, false);
    } },
  // ambience decor - same vintage look, no hover on these
  { file: M("Rockingchair_01"), scale: 2.2, place(r) {
      placeFloating(r.clone(), 0.4, 0.3, false);
    } },
  { file: M("chess_set"), scale: 1.9, fx: "chess", sfx: "wood",
    label: "a game abandoned mid-move", place(r) {
      placeCenterpiece(r.clone(), 0.32); // dead ahead, you fall right past it
    } },
  { file: M("antique_ceramic_vase_01"), scale: 2.2, place(r) {
      placeShelf(r.clone(), 0.155, false, false);
      if (!LOW) placeShelf(r.clone(), 0.585, false, false);
    } },
  { file: M("Barrel_01"), scale: 1.6, place(r) {
      placeFloating(r.clone(), 0.265, 0.45, false);
      if (!LOW) placeFloating(r.clone(), 0.635, 0.42, false);
    } },
  { file: M("hanging_picture_frame_02"), scale: 2.8, place(r) {
      for (const t of halfIfLow([0.075, 0.345, 0.5, 0.655, 0.77, 0.93]))
        placeWallFlat(r.clone(), t, false);
    } },
  { file: M("hanging_picture_frame_03"), scale: 2.8, place(r) {
      for (const t of halfIfLow([0.225, 0.38, 0.505, 0.665, 0.845]))
        placeWallFlat(r.clone(), t, false);
    } },
  { file: M("fancy_picture_frame_01"), scale: 2.6, place(r) {
      placeWallFlat(r.clone(), 0.295, false);
      if (!LOW) placeWallFlat(r.clone(), 0.535, false);
      if (!LOW) placeWallFlat(r.clone(), 0.755, false);
    } },
  { file: M("fancy_picture_frame_02"), scale: 2.6, place(r) {
      placeWallFlat(r.clone(), 0.18, false);
      if (!LOW) placeWallFlat(r.clone(), 0.445, false);
      if (!LOW) placeWallFlat(r.clone(), 0.69, false);
    } },
  { file: M("standing_picture_frame_01"), scale: 2.2, place(r) {
      placeShelf(r.clone(), 0.345, false, false);
      if (!LOW) placeShelf(r.clone(), 0.655, false, false);
    } },
  { file: M("wine_bottles_01"), scale: 2.0, place(r) {
      placeShelf(r.clone(), 0.215, false, false);
      if (!LOW) placeShelf(r.clone(), 0.715, false, false);
    } },
  // the walls themselves - moss in the damp bits, ferns near the lamps
  { file: M("moss_01"), scale: 3.4, place(r) {
      const n = LOW ? 40 : 90; // 204 tris each, cheap ambience
      for (let i = 0; i < n; i++)
        placeWallPatch(r.clone(), rand(0.03, 0.97));
    } },
  { file: M("fern_02"), scale: 2.2, place(r) {
      const n = LOW ? 14 : 34;
      for (let i = 0; i < n; i++)
        placeWallPatch(r.clone(), rand(0.04, 0.96));
    } },
];

// prop personalities - what a thing does when you look at it
const BOOKFX = []; // books burst apart, flutter, then reshelve
const CHESSFX = []; // chess pieces float up + slowly orbit the board
const CHESTFX = []; // chest lid creaks open over a warm glint
function setupFx(h, kind) {
  const root = h.grab || h.root;
  if (kind === "books") {
    const books = [];
    root.traverse((o) => {
      if (o.name && o.name.includes("_book"))
        books.push({
          node: o,
          rest: o.position.clone(),
          restQ: o.quaternion.clone(),
          dir: new THREE.Vector3(rand(-1, 1), rand(-0.3, 1), rand(-1, 1))
            .normalize()
            .multiplyScalar(rand(0.1, 0.34)),
          spin: new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar(rand(0.6, 2.2)),
          phase: rand(0, 6.3),
        });
    });
    if (books.length) BOOKFX.push({ books, h, burst: 0 });
  } else if (kind === "chess") {
    const pieces = [];
    root.traverse((o) => {
      if (o.name && o.name.startsWith("piece_"))
        pieces.push({ node: o, rest: o.position.clone(), phase: rand(0, 6.3) });
    });
    if (pieces.length) CHESSFX.push({ pieces, h, lift: 0 });
  } else if (kind === "chest") {
    let lid = null;
    root.traverse((o) => {
      if (o.name === "treasure_chest_lid") lid = o;
    });
    if (lid) {
      // a warm glint sitting inside
      const glint = addGlow(lid.parent, false, 1.2, 0.25);
      glint.material.opacity = 0;
      CHESTFX.push({ lid, restX: lid.rotation.x, glint, h, open: 0 });
    }
  }
}

for (const spec of PROPS) {
  gltfLoader.load(
    spec.file,
    (g) => {
      const before = HOVERABLES.length;
      spec.place(prepModel(g, spec.scale, spec.glowY));
      let labelled = false;
      for (let i = before; i < HOVERABLES.length; i++) {
        const h = HOVERABLES[i];
        h.sfx = spec.sfx; // every copy gets its own sound
        // each specimen label only shows up once in the museum -
        // extra copies are still grabbable, just nameless
        if (spec.label && !labelled && !h.isLamp) {
          h.label = spec.label;
          addHaloTo(h);
          labelled = true;
        }
        if (spec.fx) setupFx(h, spec.fx);
      }
    },
    undefined,
    () => {}, // a missing model shouldn't break the scene
  );
}

// the marmalade jar - hero prop, timed to line up w/ its caption
{
  const jar = new THREE.Group();
  const glass = new THREE.Mesh(
    new THREE.CylinderGeometry(0.42, 0.4, 0.95, 18, 1),
    new THREE.MeshStandardMaterial({
      color: 0xd89a4a,
      transparent: true,
      opacity: 0.38,
      roughness: 0.12,
      metalness: 0,
      envMapIntensity: 1.4,
    }),
  );
  const lid = new THREE.Mesh(
    new THREE.CylinderGeometry(0.45, 0.45, 0.12, 18),
    new THREE.MeshStandardMaterial({
      color: 0xb08d57,
      roughness: 0.35,
      metalness: 0.75,
      envMapIntensity: 1.2,
    }),
  );
  lid.position.y = 0.53;

  const lc = document.createElement("canvas");
  lc.width = 256;
  lc.height = 160;
  const lx = lc.getContext("2d");
  lx.fillStyle = "#e9dcbb";
  lx.fillRect(0, 0, 256, 160);
  lx.strokeStyle = "#7a5a2a";
  lx.lineWidth = 5;
  lx.strokeRect(10, 10, 236, 140);
  lx.fillStyle = "#43290f";
  lx.textAlign = "center";
  lx.font = "small-caps 600 38px Georgia, serif";
  lx.fillText("ORANGE", 128, 70);
  lx.fillText("MARMALADE", 128, 116);
  const labelTex = new THREE.CanvasTexture(lc);
  labelTex.colorSpace = THREE.SRGBColorSpace;
  const label = new THREE.Mesh(
    new THREE.CylinderGeometry(0.43, 0.43, 0.5, 18, 1, true, -0.9, 1.8),
    new THREE.MeshStandardMaterial({ map: labelTex, roughness: 0.9, side: THREE.DoubleSide }),
  );
  jar.add(glass, lid, label);
  jar.scale.setScalar(1.6);

  const group = new THREE.Group();
  group.add(jar);
  wallPoint(0.235, rand(0, Math.PI * 2), 0.22, group.position);
  group.rotation.set(0.4, rand(0, 6.3), 0.25);
  scene.add(group);
  FLOATING.push({ mesh: group, rx: 0.05, rz: 0.07 });
  const hov = { root: group, hot: 0, label: "ORANGE MARMALADE — empty", sfx: "glass" };
  HOVERABLES.push(hov);
  addHaloTo(hov);
}

// the landing - heap of sticks + dry leaves
{
  const floorGroup = new THREE.Group();
  const endPos = curve.getPointAt(0.985, new THREE.Vector3());
  const endTan = curve.getTangentAt(0.982, new THREE.Vector3());

  const floorTex = earthTex.clone();
  floorTex.repeat.set(1, 1);
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(RADIUS * 1.08, 26),
    new THREE.MeshStandardMaterial({ map: floorTex, color: 0x3e2d1c, roughness: 1 }),
  );
  floor.lookAt(endTan.clone().negate());
  floorGroup.add(floor);

  // dry leaves
  const leafGeo = new THREE.CircleGeometry(0.16, 6);
  leafGeo.scale(1, 0.55, 1);
  const leafColors = [0x8a5a24, 0x9a6a2a, 0x6e451c, 0xa8782e];
  for (let i = 0; i < (LOW ? 30 : 70); i++) {
    const leaf = new THREE.Mesh(
      leafGeo,
      new THREE.MeshStandardMaterial({
        color: leafColors[i % leafColors.length],
        roughness: 1,
        side: THREE.DoubleSide,
      }),
    );
    const a = rand(0, Math.PI * 2);
    const r = Math.sqrt(Math.random()) * RADIUS * 1.1;
    leaf.position.set(Math.cos(a) * r, Math.sin(a) * r, rand(0.02, 0.3));
    leaf.rotation.set(rand(-0.6, 0.6), rand(-0.6, 0.6), rand(0, 6.3));
    floor.add(leaf);
  }
  // sticks
  for (let i = 0; i < (LOW ? 8 : 16); i++) {
    const stick = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.05, rand(1, 2.4), 5),
      new THREE.MeshStandardMaterial({ color: 0x4a3015, roughness: 1 }),
    );
    const a = rand(0, Math.PI * 2);
    const r = Math.sqrt(Math.random()) * RADIUS * 0.9;
    stick.position.set(Math.cos(a) * r, Math.sin(a) * r, rand(0.1, 0.35));
    stick.rotation.set(Math.PI / 2 + rand(-0.3, 0.3), 0, rand(0, 6.3));
    floor.add(stick);
  }
  floorGroup.position.copy(endPos);
  scene.add(floorGroup);
  window.__floorLight = new THREE.PointLight(0xffa860, 0, 0, 2);
  window.__floorLight.position.copy(endPos).addScaledVector(endTan, -2.5);
  scene.add(window.__floorLight);
}

// pictures off their pegs - public-domain scans in dark wood frames
// that climb glowing past the falling camera (1630 hondius map +
// the original 1865 tenniel engravings, off wikimedia)
{
  const ART = [
    { url: "media/old-map.jpg", label: "a map of the world · 1630" },
    { url: "media/art/tenniel_15.jpg", label: "advice from a caterpillar · Tenniel, 1865" },
    { url: "media/art/tenniel_23.jpg", label: "a cat that grins · Tenniel, 1865" },
    { url: "media/art/tenniel_25.jpg", label: "a mad tea-party · Tenniel, 1865" },
    { url: "media/art/tenniel_29.jpg", label: "the Queen's garden · Tenniel, 1865" },
    { url: "media/art/tenniel_31.jpg", label: "off with its head · Tenniel, 1865" },
    { url: "media/art/tenniel_38.jpg", label: "the Hatter · Tenniel, 1865" },
  ];
  const frameMat = new THREE.MeshStandardMaterial({
    color: 0x3a2410,
    roughness: 0.7,
    envMapIntensity: 0.5,
  });
  const texLoader = new THREE.TextureLoader();
  for (const spec of ART) {
    texLoader.load(spec.url, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      const aspect = tex.image.width / tex.image.height;
      const h = aspect > 1.1 ? 1.7 : 1.95;
      const w = h * aspect;
      const d = 0.1;
      const artMat = new THREE.MeshStandardMaterial({
        map: tex,
        // engravings sit on aged paper, not white
        color: spec.url.includes("tenniel") ? 0xd8c9a3 : 0xffffff,
        roughness: 0.92,
      });
      const picture = new THREE.Group();
      const frame = new THREE.Mesh(
        new THREE.BoxGeometry(w + 0.24, h + 0.24, d),
        frameMat,
      );
      const art = new THREE.Mesh(new THREE.PlaneGeometry(w, h), artMat);
      art.position.z = d / 2 + 0.005;
      picture.add(frame, art);
      const hov = placeRiser(picture);
      hov.label = spec.label;
      hov.sfx = "paper";
      addHaloTo(hov);
    });
  }
}

// roots hugging the walls
{
  const rootMat = new THREE.MeshStandardMaterial({ color: 0x1d1006, roughness: 1 });
  for (let i = 0; i < (LOW ? 10 : 18); i++) {
    const t0 = rand(0.03, 0.9);
    const a0 = rand(0, Math.PI * 2);
    const pts = [];
    for (let s = 0; s <= 5; s++) {
      const v = new THREE.Vector3();
      wallPoint(
        t0 + s * rand(0.004, 0.009),
        a0 + Math.sin(s * 1.7 + i) * 0.9,
        0.97 - Math.abs(Math.sin(s * 2.1)) * 0.06,
        v,
      );
      pts.push(v);
    }
    scene.add(
      new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, rand(0.05, 0.13), 5, false),
        rootMat,
      ),
    );
  }
}

// playing cards
function cardTexture(back) {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 180;
  const x = c.getContext("2d");
  if (back) {
    x.fillStyle = "#8c2f23";
    x.fillRect(0, 0, 128, 180);
    x.strokeStyle = "#d8b67a";
    x.lineWidth = 5;
    x.strokeRect(12, 12, 104, 156);
    x.strokeRect(24, 24, 80, 132);
    x.beginPath();
    x.moveTo(24, 24); x.lineTo(104, 156);
    x.moveTo(104, 24); x.lineTo(24, 156);
    x.lineWidth = 2.5;
    x.stroke();
  } else {
    // aged ivory w/ darkened edges, not stark white
    const g = x.createRadialGradient(64, 90, 20, 64, 90, 120);
    g.addColorStop(0, "#e7dabb");
    g.addColorStop(0.75, "#d9c9a4");
    g.addColorStop(1, "#b8a37a");
    x.fillStyle = g;
    x.fillRect(0, 0, 128, 180);
    x.strokeStyle = "#8a6a3a";
    x.lineWidth = 3;
    x.strokeRect(7, 7, 114, 166);
    x.fillStyle = "#a3221a";
    const heart = (cx, cy, s) => {
      x.beginPath();
      x.moveTo(cx, cy + s * 0.9);
      x.bezierCurveTo(cx - s, cy, cx - s * 0.9, cy - s * 0.8, cx, cy - s * 0.25);
      x.bezierCurveTo(cx + s * 0.9, cy - s * 0.8, cx + s, cy, cx, cy + s * 0.9);
      x.fill();
    };
    heart(64, 88, 30);
    heart(22, 30, 10);
    heart(106, 150, 10);
    x.font = "700 22px Georgia, serif";
    x.textAlign = "center";
    x.fillText("A", 22, 62);
    x.fillText("A", 106, 132);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const cardGeo = new THREE.PlaneGeometry(0.5, 0.72);
const cardFaceMat = new THREE.MeshStandardMaterial({
  map: cardTexture(false),
  roughness: 0.85,
  side: THREE.DoubleSide,
});
const cardBackMat = new THREE.MeshStandardMaterial({
  map: cardTexture(true),
  roughness: 0.85,
  side: THREE.DoubleSide,
});
const CARDS = [];
for (let i = 0; i < (LOW ? 50 : 130); i++) {
  const m = new THREE.Mesh(cardGeo, Math.random() < 0.6 ? cardFaceMat : cardBackMat);
  wallPoint(rand(0.03, 0.99), rand(0, Math.PI * 2), rand(0.22, 0.62), m.position);
  m.rotation.set(rand(0, 6.3), rand(0, 6.3), rand(0, 6.3));
  scene.add(m);
  CARDS.push({
    mesh: m,
    rx: rand(0.4, 1.6),
    ry: rand(0.3, 1.2),
    bobPhase: rand(0, 6.3),
    bobAmp: rand(0.15, 0.5),
    baseX: m.position.x,
    baseY: m.position.y,
    baseZ: m.position.z,
    driftAmp: rand(0.15, 0.45),
  });
}

// loose pages + books that read themselves
const PAGES = [];
const OPENBOOKS = [];
{
  const pc = document.createElement("canvas");
  pc.width = 128;
  pc.height = 180;
  const px = pc.getContext("2d");
  const pg = px.createRadialGradient(64, 90, 30, 64, 90, 130);
  pg.addColorStop(0, "#eadfc0");
  pg.addColorStop(1, "#c2ae86");
  px.fillStyle = pg;
  px.fillRect(0, 0, 128, 180);
  px.strokeStyle = "rgba(74, 52, 28, 0.5)";
  px.lineWidth = 1.5;
  for (let y = 18; y < 168; y += 9) {
    px.beginPath();
    px.moveTo(14, y);
    px.lineTo(14 + 80 + Math.random() * 22, y);
    px.stroke();
  }
  const pageTex = new THREE.CanvasTexture(pc);
  pageTex.colorSpace = THREE.SRGBColorSpace;
  const pageMat = new THREE.MeshStandardMaterial({
    map: pageTex,
    roughness: 1,
    side: THREE.DoubleSide,
  });

  // loose leaves - every other one climbs slowly past the falling camera
  const looseGeo = new THREE.PlaneGeometry(0.32, 0.45);
  for (let i = 0; i < (LOW ? 14 : 30); i++) {
    const m = new THREE.Mesh(looseGeo, pageMat);
    const entry = {
      mesh: m,
      rise: i % 2 === 0, // half the paper streams up past you, half drifts
      rx: rand(0.8, 2.2),
      rz: rand(0.5, 1.5),
      phase: rand(0, 6.3),
      ang: rand(0, Math.PI * 2),
      inset: rand(0.25, 0.6), // close to you but never right in your face
    };
    if (entry.rise) {
      entry.tOff = rand(-0.05, 0.18);
      // now + then one darts up like a startled bird
      entry.spd = i % 6 === 0 ? rand(0.012, 0.017) : rand(0.004, 0.01);
    } else {
      wallPoint(rand(0.03, 0.99), entry.ang, entry.inset, m.position);
      entry.base = m.position.clone();
    }
    m.rotation.set(rand(0, 6.3), rand(0, 6.3), rand(0, 6.3));
    scene.add(m);
    PAGES.push(entry);
  }

  // open books, pages turning on their own
  const halfGeo = new THREE.PlaneGeometry(0.34, 0.48);
  halfGeo.rotateX(-Math.PI / 2); // lay it flat
  halfGeo.translate(0.17, 0, 0); // spine at the origin
  const spineGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.5, 5);
  spineGeo.rotateX(Math.PI / 2);
  function openBook(t, inset) {
    const book = new THREE.Group();
    book.add(new THREE.Mesh(spineGeo, shelfMat));
    const mk = (rz) => {
      const mesh = new THREE.Mesh(halfGeo, pageMat);
      mesh.rotation.z = rz;
      book.add(mesh);
      return mesh;
    };
    mk(-0.25); // right page
    mk(Math.PI + 0.25); // left one
    const turners = [mk(0.6), mk(1.8)];
    const holder = new THREE.Group();
    holder.add(book);
    wallPoint(t, rand(0, Math.PI * 2), inset, holder.position);
    holder.rotation.set(rand(-0.5, 0.5), rand(0, 6.3), rand(-0.4, 0.4));
    scene.add(holder);
    OPENBOOKS.push({
      holder,
      turners,
      phase: rand(0, 6.3),
      speed: rand(0.16, 0.28),
      baseY: holder.position.y,
    });
    const hov = { root: holder, hot: 0, sfx: "books" };
    HOVERABLES.push(hov);
    return hov;
  }
  const ob = openBook(0.18, 0.28);
  ob.label = "a book that reads itself";
  addHaloTo(ob);
  openBook(0.52, 0.24);
  if (!LOW) openBook(0.8, 0.3);
}

// small lives - moths near the lamps, butterflies, beetles
const CRITTERS = [];
{
  function wingTexture(kind) {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const x = c.getContext("2d");
    if (kind === "moth") {
      x.fillStyle = "#d9cfa8";
    } else {
      const g = x.createLinearGradient(0, 0, 64, 0);
      g.addColorStop(0, "#7a3a16");
      g.addColorStop(0.65, "#d8862c");
      g.addColorStop(1, "#2a1c0c");
      x.fillStyle = g;
    }
    x.beginPath();
    x.moveTo(4, 32);
    x.bezierCurveTo(10, 2, 56, 0, 60, 18);
    x.bezierCurveTo(62, 34, 40, 36, 30, 36);
    x.bezierCurveTo(44, 42, 54, 48, 46, 58);
    x.bezierCurveTo(34, 66, 10, 52, 4, 32);
    x.fill();
    if (kind !== "moth") {
      x.fillStyle = "rgba(16,10,4,0.9)";
      x.beginPath();
      x.arc(42, 16, 5, 0, 7);
      x.fill();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }
  const bodyGeo = new THREE.CylinderGeometry(0.012, 0.018, 0.14, 5);
  const bodyMat = new THREE.MeshBasicMaterial({ color: 0x241808 });
  function makeFlier(kind, t) {
    const group = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({
      map: wingTexture(kind),
      transparent: true,
      alphaTest: 0.3,
      side: THREE.DoubleSide,
      opacity: kind === "moth" ? 0.9 : 1,
    });
    const s = kind === "moth" ? 0.17 : 0.26;
    const wingGeo = new THREE.PlaneGeometry(s, s);
    wingGeo.rotateX(-Math.PI / 2); // wings lay flat, flap around the body
    wingGeo.translate(s * 0.55, 0, 0);
    const wl = new THREE.Group();
    const wr = new THREE.Group();
    wl.add(new THREE.Mesh(wingGeo, mat));
    const mr = new THREE.Mesh(wingGeo, mat);
    mr.scale.x = -1;
    wr.add(mr);
    group.add(wl, wr, new THREE.Mesh(bodyGeo, bodyMat));
    scene.add(group);
    const cr = {
      kind, t, group, wl, wr,
      phase: rand(0, 6.3),
      flapSpeed: kind === "moth" ? rand(9, 13) : rand(5, 8),
      range: kind === "moth" ? rand(0.4, 0.7) : rand(0.9, 1.5),
      anchor: new THREE.Vector3(),
      bound: kind !== "moth",
    };
    if (kind !== "moth") wallPoint(t, rand(0, Math.PI * 2), rand(0.25, 0.6), cr.anchor);
    CRITTERS.push(cr);
    return cr;
  }
  for (let i = 0; i < (LOW ? 4 : 8); i++) makeFlier("butterfly", rand(0.05, 0.95));
  for (let i = 0; i < (LOW ? 3 : 6); i++) makeFlier("moth", 0);
  // beetles crawling on the clay
  const beetleGeo = new THREE.SphereGeometry(0.05, 8, 6);
  beetleGeo.scale(1, 0.55, 1.5);
  const beetleMat = new THREE.MeshStandardMaterial({ color: 0x1c1208, roughness: 0.6 });
  for (let i = 0; i < (LOW ? 3 : 6); i++) {
    const group = new THREE.Group();
    group.add(new THREE.Mesh(beetleGeo, beetleMat));
    scene.add(group);
    CRITTERS.push({
      kind: "beetle", t: rand(0.05, 0.95), group,
      a: rand(0, 6.3), dir: Math.random() < 0.5 ? 1 : -1,
      phase: rand(0, 6.3), bound: true,
    });
  }

  // streamers - they rise past you as you fall, each at its own pace
  const fireflyTex = glowTexture("rgba(255,250,200,1)", "rgba(180,220,90,0.5)");
  for (let i = 0; i < (LOW ? 8 : 16); i++) {
    const sp = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: fireflyTex,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        opacity: 0.8,
      }),
    );
    sp.scale.setScalar(rand(0.07, 0.13));
    scene.add(sp);
    CRITTERS.push({
      kind: "firefly", group: sp, bound: true,
      tOff: rand(-0.05, 0.045), spd: rand(0.0035, 0.008),
      ang: rand(0, 6.3), inset: rand(0.3, 0.8), phase: rand(0, 6.3),
    });
  }
  const flyGeo = new THREE.SphereGeometry(0.025, 5, 4);
  const flyMat = new THREE.MeshBasicMaterial({ color: 0x140d06 });
  for (let i = 0; i < (LOW ? 4 : 8); i++) {
    const m = new THREE.Mesh(flyGeo, flyMat);
    scene.add(m);
    CRITTERS.push({
      kind: "fly", group: m, bound: true,
      tOff: rand(-0.05, 0.045), spd: rand(0.006, 0.011),
      ang: rand(0, 6.3), inset: rand(0.3, 0.7), phase: rand(0, 6.3),
    });
  }
  // dragonflies - fastest things in the well
  const dwingGeo = new THREE.PlaneGeometry(0.34, 0.07);
  dwingGeo.translate(0.18, 0, 0);
  const dwingMat = new THREE.MeshBasicMaterial({
    color: 0xbfd4d0,
    transparent: true,
    opacity: 0.45,
    side: THREE.DoubleSide,
  });
  const dbodyGeo = new THREE.CylinderGeometry(0.012, 0.02, 0.34, 5);
  dbodyGeo.rotateX(Math.PI / 2);
  for (let i = 0; i < (LOW ? 1 : 3); i++) {
    const group = new THREE.Group();
    group.add(new THREE.Mesh(dbodyGeo, bodyMat));
    const wl = new THREE.Group();
    const wr = new THREE.Group();
    for (const dz of [-0.06, 0.06]) {
      const a = new THREE.Mesh(dwingGeo, dwingMat);
      a.position.z = dz;
      wl.add(a);
      const b = new THREE.Mesh(dwingGeo, dwingMat);
      b.scale.x = -1;
      b.position.z = dz;
      wr.add(b);
    }
    group.add(wl, wr);
    scene.add(group);
    CRITTERS.push({
      kind: "dragonfly", group, wl, wr, bound: true,
      tOff: rand(-0.05, 0.045), spd: rand(0.012, 0.017),
      ang: rand(0, 6.3), inset: rand(0.35, 0.7), phase: rand(0, 6.3),
      flapSpeed: rand(55, 75),
    });
  }
}

// creepers - green strands dangling off the upper walls
const CREEPERS = [];
{
  const lc = document.createElement("canvas");
  lc.width = lc.height = 64;
  const lx = lc.getContext("2d");
  lx.fillStyle = "#5a7028";
  lx.beginPath();
  lx.moveTo(32, 2);
  lx.bezierCurveTo(58, 18, 56, 44, 32, 62);
  lx.bezierCurveTo(8, 44, 6, 18, 32, 2);
  lx.fill();
  lx.strokeStyle = "#33431a";
  lx.lineWidth = 2;
  lx.beginPath();
  lx.moveTo(32, 4);
  lx.lineTo(32, 60);
  lx.stroke();
  const leafTex = new THREE.CanvasTexture(lc);
  leafTex.colorSpace = THREE.SRGBColorSpace;
  const leafMat = new THREE.MeshStandardMaterial({
    map: leafTex,
    transparent: true,
    alphaTest: 0.4,
    side: THREE.DoubleSide,
    roughness: 1,
  });
  const leafGeo = new THREE.PlaneGeometry(0.22, 0.3);
  const vineMat = new THREE.MeshStandardMaterial({ color: 0x2f3a16, roughness: 1 });
  for (let i = 0; i < (LOW ? 7 : 15); i++) {
    const t0 = rand(0.03, 0.95);
    const pivot = new THREE.Group();
    wallPoint(t0, topAngle(t0) + rand(-0.9, 0.9), 0.985, pivot.position);
    const len = rand(1.6, 3.4);
    const pts = [new THREE.Vector3(0, 0, 0)];
    for (let s = 1; s <= 4; s++)
      pts.push(
        new THREE.Vector3(
          Math.sin(i * 3 + s) * 0.35 * (s / 4),
          -len * (s / 4),
          Math.cos(i * 5 + s * 2) * 0.35 * (s / 4),
        ),
      );
    const crv = new THREE.CatmullRomCurve3(pts);
    pivot.add(new THREE.Mesh(new THREE.TubeGeometry(crv, 12, 0.022, 4, false), vineMat));
    const nl = 5 + ((Math.random() * 6) | 0);
    for (let s = 0; s < nl; s++) {
      const leaf = new THREE.Mesh(leafGeo, leafMat);
      crv.getPointAt(rand(0.15, 1), leaf.position);
      leaf.rotation.set(rand(0, 6.3), rand(0, 6.3), rand(0, 6.3));
      leaf.scale.setScalar(rand(0.7, 1.3));
      pivot.add(leaf);
    }
    scene.add(pivot);
    CREEPERS.push({ pivot, phase: rand(0, 6.3), speed: rand(0.4, 0.8) });
  }
}

// dust motes
{
  const n = LOW ? 300 : 680;
  const pos = new Float32Array(n * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    wallPoint(rand(0.02, 0.99), rand(0, Math.PI * 2), rand(0, 0.8), v);
    pos[i * 3] = v.x;
    pos[i * 3 + 1] = v.y;
    pos[i * 3 + 2] = v.z;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  scene.add(
    new THREE.Points(
      g,
      new THREE.PointsMaterial({
        color: 0xffd9a0,
        size: 0.05,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    ),
  );
}

// tea that slops out of a cup the moment you grab it
const TEADROPS = [];
const dropGeo = new THREE.SphereGeometry(0.045, 6, 5);
const dropMat = new THREE.MeshStandardMaterial({
  color: 0x6f3a16,
  roughness: 0.25,
  metalness: 0,
  transparent: true,
});
function spillTea(obj) {
  const from = obj.getWorldPosition(new THREE.Vector3());
  for (let i = 0; i < 16; i++) {
    const m = new THREE.Mesh(dropGeo, dropMat.clone());
    m.position
      .copy(from)
      .add(new THREE.Vector3(rand(-0.18, 0.18), rand(0, 0.22), rand(-0.18, 0.18)));
    m.scale.setScalar(rand(0.5, 1.3));
    scene.add(m);
    TEADROPS.push({
      mesh: m,
      // a little splash up + out, then gravity takes it
      vel: new THREE.Vector3(rand(-0.35, 0.35), rand(0.15, 0.55), rand(-0.35, 0.35)),
      life: rand(0.7, 1.1),
    });
  }
  if (window.AUDIO && AUDIO.spill) AUDIO.spill();
}

// dust knocked off old wood when you turn a picture or cupboard
const DUSTPUFF = [];
const puffGeo = new THREE.SphereGeometry(0.05, 5, 4);
const puffMat = new THREE.MeshBasicMaterial({
  color: 0x9a8a6a,
  transparent: true,
  opacity: 0.4,
  depthWrite: false,
});
function puffDust(obj) {
  const from = obj.getWorldPosition(new THREE.Vector3());
  for (let i = 0; i < 14; i++) {
    const m = new THREE.Mesh(puffGeo, puffMat.clone());
    m.position
      .copy(from)
      .add(new THREE.Vector3(rand(-0.3, 0.3), rand(-0.3, 0.3), rand(-0.3, 0.3)));
    m.scale.setScalar(rand(0.6, 1.8));
    scene.add(m);
    DUSTPUFF.push({
      mesh: m,
      vel: new THREE.Vector3(rand(-0.13, 0.13), rand(-0.04, 0.18), rand(-0.13, 0.13)),
      life: rand(0.8, 1.4),
    });
  }
  if (window.AUDIO && AUDIO.dust) AUDIO.dust();
}

// a swarm of flies that bursts out near you now and then, buzzing
const flyGeoSwarm = new THREE.SphereGeometry(0.03, 5, 4);
const flyMatSwarm = new THREE.MeshBasicMaterial({ color: 0x0f0904 });
const SWARM = [];
for (let i = 0; i < (LOW ? 8 : 14); i++) {
  const m = new THREE.Mesh(flyGeoSwarm, flyMatSwarm);
  m.visible = false;
  scene.add(m);
  SWARM.push({ mesh: m, phase: rand(0, 6.3), sp: rand(9, 17), r: rand(0.3, 1.2) });
}
const swarmCenter = new THREE.Vector3();
let swarmUntil = -1;
let nextSwarm = 6;
let lastBuzz = 0;

// a few small flickering embers that ride along in the shaft
const EMBERS = [];
for (let i = 0; i < (LOW ? 0 : 3); i++) {
  const light = new THREE.PointLight(0xffb060, 0, 4.5, 2);
  scene.add(light);
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: warmGlowTex,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0.6,
    }),
  );
  sprite.scale.setScalar(0.4);
  scene.add(sprite);
  EMBERS.push({
    light,
    sprite,
    tOff: rand(0.008, 0.05),
    ang: rand(0, 6.3),
    inset: rand(0.45, 0.88),
    phase: rand(0, 6.3),
  });
}

// hover + pick-up.
// glinting props can be taken down as you pass: tap/click to hold one
// out in front of you, drag to turn it over (mouse or touch), tap again
// to set it back careful-like, same as she did w/ the jar.
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2(-2, -2);
const tapVec = new THREE.Vector2();
let hovered = null;
let held = null; // prop that's currently in your hands
const RETURNING = []; // props easing back to where they belong
let heldDist = 3;
let pickupP = 0;
let spinX = 0,
  spinY = 0;
let pDown = null;
let dragLast = null;
let dragging = false;

const grabOf = (h) => h.grab || h.root;

const tagEl = document.createElement("div");
tagEl.className = "specimen-tag";
document.body.appendChild(tagEl);
const hintEl = document.createElement("div");
hintEl.className = "inspect-hint";
hintEl.textContent = "drag to turn it over · tap to put it back";
document.body.appendChild(hintEl);
// a separate, louder cue that follows a thing you can actually grab
const turnEl = document.createElement("div");
turnEl.className = "turn-cue";
turnEl.textContent = "↻ pick it up — turn it over";
document.body.appendChild(turnEl);
const _tagPos = new THREE.Vector3();
const _box = new THREE.Box3();
const _heldT = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _q = new THREE.Quaternion();

function propAt(cx, cy) {
  tapVec.x = (cx / innerWidth) * 2 - 1;
  tapVec.y = -(cy / innerHeight) * 2 + 1;
  raycaster.setFromCamera(tapVec, camera);
  const grabbables = HOVERABLES.filter((h) => !h.isLamp && h.root.visible);
  const roots = grabbables.map((h) => h.root);
  const hits = raycaster.intersectObjects(roots, true);
  if (!hits.length || hits[0].distance > 16) return null;
  let o = hits[0].object;
  while (o && !roots.includes(o)) o = o.parent;
  return grabbables.find((h) => h.root === o) || null;
}

function pickUp(h) {
  const g = grabOf(h);
  held = h;
  h.held = true;
  h.root.userData.held = true;
  h.orig = { pos: g.position.clone(), quat: g.quaternion.clone() };
  h.parentQuatInv = g.parent
    .getWorldQuaternion(new THREE.Quaternion())
    .invert();
  _box.setFromObject(g);
  const size = _box.getSize(_heldT).length() || 2;
  heldDist = Math.min(6.5, Math.max(2.0, size * 0.95));
  pickupP = readP();
  spinX = spinY = 0;
  window.__holding = true; // tells engine to pause the auto-drift
  // while you're holding something, touch-drag turns it, not the page
  document.documentElement.style.touchAction = "none";
  hintEl.classList.add("on");
  turnEl.classList.remove("on"); // the grab cue gives way to the turn hint
  document.body.style.cursor = "grabbing";
  if (window.AUDIO && AUDIO.pick) AUDIO.pick();
  if (h.spill) spillTea(g); // tip a cup and it pours
  else if (h.sfx === "paper" || h.sfx === "wood" || h.sfx === "books")
    puffDust(g); // pictures, cupboards + books cough up dust
}

function putBack() {
  if (!held) return;
  RETURNING.push(held);
  held.held = false;
  held = null;
  window.__holding = false;
  document.documentElement.style.touchAction = "";
  hintEl.classList.remove("on");
  document.body.style.cursor = "";
  if (window.AUDIO && AUDIO.place) AUDIO.place();
}

addEventListener("pointermove", (e) => {
  pointer.x = (e.clientX / innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / innerHeight) * 2 + 1;
  if (!pDown) return;
  if (Math.abs(e.clientX - pDown.x) + Math.abs(e.clientY - pDown.y) > 9)
    dragging = true;
  if (held && dragging && dragLast) {
    spinY += (e.clientX - dragLast.x) * 0.0032;
    spinX += (e.clientY - dragLast.y) * 0.0032;
  }
  dragLast = { x: e.clientX, y: e.clientY };
});
addEventListener("pointerdown", (e) => {
  if (e.target.closest("a, button")) return;
  pDown = { x: e.clientX, y: e.clientY };
  dragLast = { x: e.clientX, y: e.clientY };
  dragging = false;
});
addEventListener("pointerup", (e) => {
  if (!pDown) return;
  // a tap = a press that never moved (timing it is flaky on slow frames)
  const wasTap = !dragging;
  pDown = dragLast = null;
  dragging = false;
  if (!wasTap) return;
  if (held) {
    putBack();
    return;
  }
  const p = readP();
  if (p < FALL_START + 0.004 || p > FALL_END - 0.004) return;
  const h = propAt(e.clientX, e.clientY);
  if (h) pickUp(h);
});
addEventListener("pointercancel", () => {
  pDown = dragLast = null;
  dragging = false;
});

// dev/test hook - grab the nearest pickable prop in view
window.__pickNearest = () => {
  if (held) return held.label;
  let best = null,
    bestD = 1e9;
  for (const h of HOVERABLES) {
    if (h.isLamp || h.held) continue;
    const d = grabOf(h).getWorldPosition(_tagPos).distanceTo(camera.position);
    if (d < bestD) {
      bestD = d;
      best = h;
    }
  }
  if (best) pickUp(best);
  return best ? best.label || "(unlabelled copy)" : null;
};
window.__held = () => (held ? held.label : null);
window.__putBack = () => putBack();
window.__spinHeld = (dy) => { spinY += dy; }; // drives rotation in capture tests

function updateHeld() {
  holdLight.intensity += ((held ? 55 : 0) - holdLight.intensity) * 0.12;
  if (held) {
    const g = grabOf(held);
    camera.updateMatrixWorld();
    // hold the candle up + off to the side, not inside your own head
    holdLight.position
      .set(0.9, 0.7, -heldDist * 0.4)
      .applyMatrix4(camera.matrixWorld);
    _heldT.set(0, -heldDist * 0.07, -heldDist).applyMatrix4(camera.matrixWorld);
    g.parent.worldToLocal(_heldT);
    g.position.lerp(_heldT, 0.16);
    // drag-spin in camera space, plus a slow idle turn when you're not touching it
    const idle = dragging ? 0 : 0.0035;
    _axis
      .setFromMatrixColumn(camera.matrixWorld, 1)
      .normalize()
      .applyQuaternion(held.parentQuatInv);
    g.quaternion.premultiply(_q.setFromAxisAngle(_axis, spinY + idle));
    _axis
      .setFromMatrixColumn(camera.matrixWorld, 0)
      .normalize()
      .applyQuaternion(held.parentQuatInv);
    g.quaternion.premultiply(_q.setFromAxisAngle(_axis, spinX));
    spinX *= 0.9;
    spinY *= 0.9;
    // a real scroll-on sets it back down; the slow auto-fall does not
    if (
      window.__lastScroll &&
      performance.now() - window.__lastScroll < 220 &&
      Math.abs(readP() - pickupP) > 0.004
    )
      putBack();
  }
  for (let i = RETURNING.length - 1; i >= 0; i--) {
    const h = RETURNING[i];
    const g = grabOf(h);
    g.position.lerp(h.orig.pos, 0.13);
    g.quaternion.slerp(h.orig.quat, 0.13);
    if (g.position.distanceTo(h.orig.pos) < 0.03) {
      g.position.copy(h.orig.pos);
      g.quaternion.copy(h.orig.quat);
      h.root.userData.held = false;
      RETURNING.splice(i, 1);
    }
  }
}

let tagShown = null;
function updateHover() {
  if (!held) {
    raycaster.setFromCamera(pointer, camera);
    const roots = HOVERABLES.filter((h) => h.root.visible).map((h) => h.root);
    const hits = raycaster.intersectObjects(roots, true);
    let hit = null;
    if (hits.length) {
      let o = hits[0].object;
      while (o && !roots.includes(o)) o = o.parent;
      hit = HOVERABLES.find((h) => h.root === o) || null;
    }
    if (hit !== hovered) {
      hovered = hit;
      if (hovered) {
        // attention makes stuff stir
        if (hovered.hang) hovered.hang.boost = 1;
        if (hovered.wob !== undefined) hovered.wobAmt = 1;
        if (hovered.fl) hovered.fl.stir = 1;
        // hovering a cup tips it over - tea pours out (on a short cooldown)
        if (hovered.spill && t3 - (hovered._spillT || -1) > 0.8) {
          hovered._spillT = t3;
          spillTea(grabOf(hovered));
        } else if (window.AUDIO && AUDIO.voice && hovered.sfx) {
          // ...everything else just answers in its own voice
          AUDIO.voice(hovered.sfx);
        }
      }
    }
    document.body.style.cursor = hovered
      ? hovered.isLamp
        ? "pointer"
        : "grab"
      : "";
  }
  const tagSrc = held || hovered;
  if (tagSrc !== tagShown) {
    tagShown = tagSrc;
    if (tagSrc && tagSrc.label) {
      tagEl.textContent = tagSrc.label;
      tagEl.classList.add("on");
    } else {
      tagEl.classList.remove("on");
    }
  }
  // the grab cue: shows on anything you can actually pick up (not lamps)
  turnEl.classList.toggle("on", !held && !!hovered && !hovered.isLamp);
  for (const h of HOVERABLES) {
    if (h.held) continue;
    const want = h === hovered && !held ? 1 : 0;
    h.hot += (want - h.hot) * 0.12;
    if (h.hot > 0.004) h.root.scale.setScalar(1 + h.hot * 0.26);
  }
}

function updateTag() {
  // the grab cue rides just under whatever you're hovering
  if (!held && hovered && !hovered.isLamp) {
    grabOf(hovered).getWorldPosition(_tagPos).project(camera);
    if (_tagPos.z > 1) {
      turnEl.classList.remove("on");
    } else {
      turnEl.style.left = ((_tagPos.x * 0.5 + 0.5) * innerWidth).toFixed(0) + "px";
      turnEl.style.top =
        ((-_tagPos.y * 0.5 + 0.5) * innerHeight + 30).toFixed(0) + "px";
    }
  }

  const src = held || hovered;
  if (!src || !src.label) return;
  grabOf(src).getWorldPosition(_tagPos).project(camera);
  if (_tagPos.z > 1) {
    tagEl.classList.remove("on");
    return;
  }
  tagEl.style.left = ((_tagPos.x * 0.5 + 0.5) * innerWidth).toFixed(0) + "px";
  tagEl.style.top =
    ((-_tagPos.y * 0.5 + 0.5) * innerHeight - (held ? 64 : 28)).toFixed(0) +
    "px";
}

// animate
let t3 = 0;
let prevP = 0;
let velP = 0;
let camFov = 78;
let frame = 0;
const camPos = new THREE.Vector3();
const lookPos = new THREE.Vector3();
const _v2 = new THREE.Vector3();

function animate(ts) {
  requestAnimationFrame(animate);
  t3 = ts * 0.001;
  frame++;

  const curP = readP();
  let dP = curP - prevP;
  prevP = curP;
  if (Math.abs(dP) > 0.02) dP = 0; // that's a teleport, not real motion
  velP = velP * 0.88 + dP * 0.12;

  const inPct = Math.max(0, Math.min(1, (curP - FALL_START) / ENTER_OVER));
  const outPct = Math.max(0, Math.min(1, (FALL_END - curP) / EXIT_OVER));
  const iris = Math.min(inPct, outPct);

  if (iris < 0.002) {
    wCanvas.style.clipPath = "circle(0% at 50% 50%)";
    return;
  }
  const easedOpen = 1 - (1 - inPct) * (1 - inPct);
  const easedClose = outPct * outPct;
  wCanvas.style.clipPath = `circle(${(Math.min(easedOpen, easedClose) * 160).toFixed(2)}% at 50% 50%)`;

  const fallProg = Math.max(
    0,
    Math.min(1, (curP - FALL_START) / (FALL_END - FALL_START)),
  );
  // go all the way to ~0.965 so the leaf floor actually shows up at the end
  const tCam = 0.015 + fallProg * 0.95;
  curve.getPointAt(tCam, camPos);
  curve.getPointAt(Math.min(1, tCam + 0.02), lookPos);

  const sway = 0.5 + fallProg * 0.5;
  camPos.x += Math.cos(t3 * 0.31) * 0.34 * sway;
  camPos.z += Math.sin(t3 * 0.23) * 0.34 * sway;
  camPos.y += Math.sin(t3 * 0.17) * 0.12;
  camera.position.copy(camPos);
  lookPos.x += Math.cos(t3 * 0.19) * 0.5;
  lookPos.z += Math.sin(t3 * 0.27) * 0.5;
  camera.up
    .set(0, 0, -1)
    .applyAxisAngle(
      _v2.subVectors(lookPos, camPos).normalize(),
      Math.sin(t3 * 0.12) * 0.18 + velP * 30,
    );
  camera.lookAt(lookPos);

  const targetFov = 78 + Math.abs(velP) * 1500;
  camFov += (Math.min(96, targetFov) - camFov) * 0.1;
  camera.fov = camFov;
  camera.updateProjectionMatrix();

  curve.getPointAt(Math.min(1, tCam + 0.075), deepLight.position);
  nearLight.position.copy(camera.position);
  // under-glow hands off to warm hearth-light on the leaves
  const endFade = Math.max(0, Math.min(1, (tCam - 0.86) / 0.08));
  deepLight.intensity = 9000 * (1 - endFade * 0.92);
  if (window.__floorLight) window.__floorLight.intensity = 520 * endFade;

  // daylight dies off in the first stretch of the fall
  mouthLight.intensity = 5200 * Math.max(0, 1 - fallProg * 5.5);

  // motion blur tracks scroll speed, goes sharp again when you stop to read
  if (blurPass)
    blurPass.uniforms.strength.value +=
      (Math.min(0.28, Math.abs(velP) * 260) - blurPass.uniforms.strength.value) * 0.18;

  updateHeld();

  // clocks tick as you go past them
  if (window.AUDIO && AUDIO.setTick) {
    let prox = 0;
    for (const ct of CLOCK_TS) {
      const d = Math.abs(ct - tCam);
      prox = Math.max(prox, 1 - d / 0.045);
    }
    AUDIO.setTick(Math.max(0, prox));
  }

  // shuffle the light pool onto whatever lanterns are nearest ahead
  let li = 0;
  for (const ln of LANTERNS) {
    const ahead = ln.t - tCam;
    // candle-flame flicker, strongest on the swinging chandeliers
    const flk =
      1 -
      (ln.flick || 0.2) *
        (0.45 + 0.55 * Math.sin(t3 * 9.3 + ln.swayPhase) * Math.sin(t3 * 23.7 + ln.swayPhase * 1.7));
    if (ahead > -0.015 && ahead < 0.085 && li < LIGHT_POOL) {
      const L = lights[li++];
      ln.group.getWorldPosition(L.position);
      L.color.setHex(ln.teal ? 0x6fd8cc : 0xffa050);
      L.intensity = (ln.teal ? 90 : 165) * flk;
    }
    // glows shrink + fade as you pass right next to them
    if (ln.glow && Math.abs(ahead) < 0.06) {
      const d = ln.group.getWorldPosition(_v2).distanceTo(camera.position);
      const k = Math.min(1, d / 7);
      ln.glow.scale.setScalar(ln.glowBase * (0.3 + 0.7 * k));
      ln.glow.material.opacity = 0.6 * Math.min(1, 0.15 + d / 6) * (0.65 + 0.35 * flk);
    }
  }
  for (; li < LIGHT_POOL; li++) lights[li].intensity = 0;

  // hanging props swing from their anchors, harder once stirred
  for (const hp of HANGING) {
    const b = 1 + hp.boost * 3.5;
    hp.pivot.rotation.x = Math.sin(t3 * hp.speed + hp.phase) * 0.1 * b;
    hp.pivot.rotation.z = Math.cos(t3 * hp.speed * 0.8 + hp.phase) * 0.12 * b;
    if (hp.boost > 0.002) hp.boost *= 0.975;
  }
  for (const fl of FLOATING) {
    if (fl.mesh.userData.held) continue; // this one's in your hands
    const s = 1 + fl.stir * 5;
    fl.mesh.rotation.x += fl.rx * 0.016 * s;
    fl.mesh.rotation.z += fl.rz * 0.016 * s;
    if (fl.stir > 0.002) fl.stir *= 0.95;
  }
  // centerpieces hold their spot, bobbing + slowly turning
  for (const cpc of CENTERPIECES) {
    if (cpc.group.userData.held) continue;
    cpc.group.position.y = cpc.base.y + Math.sin(t3 * 0.7 + cpc.phase) * 0.15;
    cpc.group.rotateY(0.0012);
  }
  // encyclopedias burst apart when you look, then reshelve themselves
  for (const fx of BOOKFX) {
    const want = fx.h.held || fx.h === hovered ? 1 : 0;
    fx.burst += (want - fx.burst) * 0.07;
    if (fx.burst > 0.004)
      for (const bk of fx.books) {
        bk.node.position
          .copy(bk.rest)
          .addScaledVector(bk.dir, fx.burst * (1 + 0.25 * Math.sin(t3 * 2.1 + bk.phase)));
        bk.node.rotation.x += bk.spin.x * 0.016 * fx.burst;
        bk.node.rotation.y += bk.spin.y * 0.016 * fx.burst;
        bk.node.quaternion.slerp(bk.restQ, (1 - fx.burst) * 0.12);
      }
  }
  // chess pieces always hover a bit; when you look they rise + circle
  for (const fx of CHESSFX) {
    const want = fx.h.held || fx.h === hovered ? 1 : 0.3;
    fx.lift += (want - fx.lift) * 0.05;
    for (const pc of fx.pieces) {
      pc.node.position.y =
        pc.rest.y +
        0.012 * Math.sin(t3 * 1.6 + pc.phase) +
        fx.lift * (0.1 + 0.05 * Math.sin(t3 * 2.3 + pc.phase));
      const a = fx.lift * 0.6 * Math.sin(t3 * 0.5 + pc.phase * 0.3);
      pc.node.position.x = pc.rest.x * Math.cos(a) - pc.rest.z * Math.sin(a);
      pc.node.position.z = pc.rest.x * Math.sin(a) + pc.rest.z * Math.cos(a);
    }
  }
  // chest opens for whoever looks at it
  for (const fx of CHESTFX) {
    const want = fx.h.held || fx.h === hovered ? 1 : 0;
    fx.open += (want - fx.open) * 0.04;
    fx.lid.rotation.x = fx.restX - fx.open * 0.95;
    fx.glint.material.opacity = fx.open * 0.85;
  }
  for (const c of CARDS) {
    c.mesh.rotation.x += c.rx * 0.016;
    c.mesh.rotation.y += c.ry * 0.016;
    c.mesh.position.set(
      c.baseX + Math.sin(t3 * 0.7 + c.bobPhase * 2) * c.driftAmp,
      c.baseY + Math.sin(t3 * 1.3 + c.bobPhase) * c.bobAmp,
      c.baseZ + Math.cos(t3 * 0.55 + c.bobPhase) * c.driftAmp,
    );
  }
  // small lives flutter when you're near + go still when you're far
  for (const cr of CRITTERS) {
    if (!cr.bound) {
      if (!LANTERNS.length) continue;
      const ln = LANTERNS[(Math.random() * LANTERNS.length) | 0];
      cr.t = ln.t;
      cr.lamp = ln;
      cr.bound = true;
    }
    // streamers live relative to the camera + overtake you going up
    if (cr.spd) {
      cr.tOff -= cr.spd * 0.016;
      if (cr.tOff < -0.06) {
        cr.tOff = rand(0.035, 0.07);
        cr.ang = rand(0, 6.3);
        cr.inset = rand(0.3, 0.8);
      }
      const tt = Math.min(0.995, Math.max(0.005, tCam + cr.tOff));
      wallPoint(tt, cr.ang + Math.sin(t3 * 0.9 + cr.phase) * 0.3, cr.inset, cr.group.position);
      if (cr.kind === "firefly") {
        cr.group.material.opacity =
          0.3 + 0.6 * (0.5 + 0.5 * Math.sin(t3 * 2.3 + cr.phase));
      } else if (cr.kind === "fly") {
        cr.group.position.x += Math.sin(t3 * 21 + cr.phase) * 0.05;
        cr.group.position.y += Math.cos(t3 * 17 + cr.phase) * 0.05;
      } else if (cr.kind === "dragonfly") {
        const df = Math.sin(t3 * cr.flapSpeed + cr.phase) * 0.5;
        cr.wl.rotation.y = df;
        cr.wr.rotation.y = -df;
        cr.group.lookAt(curve.getPointAt(Math.max(0.001, tt - 0.01), _v2));
      }
      continue;
    }
    const near = Math.abs(cr.t - tCam) < 0.08;
    cr.group.visible = near;
    if (!near) continue;
    if (cr.kind === "beetle") {
      cr.a += 0.0017 * cr.dir;
      wallPoint(cr.t + Math.sin(t3 * 0.1 + cr.phase) * 0.003, cr.a, 0.97, cr.group.position);
      cr.group.rotation.y = cr.a;
      continue;
    }
    const f = Math.sin(t3 * cr.flapSpeed + cr.phase) * (cr.kind === "moth" ? 1.0 : 0.75);
    cr.wl.rotation.y = f;
    cr.wr.rotation.y = -f;
    const base = cr.lamp ? cr.lamp.group.getWorldPosition(_v2) : cr.anchor;
    cr.group.position.set(
      base.x + Math.sin(t3 * 0.6 + cr.phase) * cr.range,
      base.y + Math.sin(t3 * 0.43 + cr.phase * 2) * cr.range * 0.8,
      base.z + Math.cos(t3 * 0.5 + cr.phase) * cr.range,
    );
    cr.group.rotation.y = t3 * 0.4 + cr.phase;
    cr.group.rotation.x = Math.sin(t3 * 0.8 + cr.phase) * 0.3;
  }
  // creepers sway in the draught
  for (const cp of CREEPERS) {
    cp.pivot.rotation.x = Math.sin(t3 * cp.speed + cp.phase) * 0.05;
    cp.pivot.rotation.z = Math.cos(t3 * cp.speed * 0.7 + cp.phase) * 0.05;
  }
  // glowing specimens climb past you, catch one if you can
  for (const rs of RISERS) {
    if (rs.group.userData.held) continue;
    rs.tOff -= rs.spd * 0.016;
    if (rs.tOff < -0.06) {
      rs.tOff = rand(0.08, 0.35); // long-ish random gap before the next one shows
      rs.ang = rand(0, 6.3);
      rs.inset = rand(0.45, 0.8);
      rs.snap = true;
    }
    rs.group.visible = rs.tOff < 0.08;
    if (!rs.group.visible) continue;
    const tt = Math.min(0.995, Math.max(0.005, tCam + rs.tOff));
    wallPoint(tt, rs.ang, rs.inset, _rsV);
    if (rs.snap) {
      rs.group.position.copy(_rsV);
      rs.snap = false;
    } else {
      rs.group.position.lerp(_rsV, 0.08); // glides over any jump in the path
    }
    rs.group.lookAt(camera.position); // face always turns to you so it stays readable
    rs.group.rotateZ(Math.sin(t3 * 0.7 + rs.phase) * 0.16);
  }
  // loose pages flutter + curl, some climb slowly past you
  for (const pe of PAGES) {
    const m = pe.mesh;
    m.rotation.x += pe.rx * 0.004;
    m.rotation.z += pe.rz * 0.004;
    m.scale.x = 0.78 + 0.22 * Math.sin(t3 * 2.6 + pe.phase);
    if (pe.rise) {
      pe.tOff -= pe.spd * 0.016;
      if (pe.tOff < -0.06) {
        pe.tOff = rand(0.05, 0.2);
        pe.ang = rand(0, Math.PI * 2);
        pe.inset = rand(0.25, 0.6);
      }
      const tt = Math.min(0.995, Math.max(0.005, tCam + pe.tOff));
      wallPoint(tt, pe.ang, pe.inset, m.position);
    } else {
      m.position.y = pe.base.y + Math.sin(t3 * 1.1 + pe.phase) * 0.3;
    }
  }
  // open books turn their own pages
  for (const ob of OPENBOOKS) {
    if (!ob.holder.userData.held)
      ob.holder.position.y = ob.baseY + Math.sin(t3 * 0.8 + ob.phase) * 0.12;
    for (let i = 0; i < ob.turners.length; i++) {
      const u = (t3 * ob.speed + ob.phase + i * 0.45) % 1;
      const e = u < 0.55 ? u / 0.55 : 1; // turn the page, then let it rest on the left
      const ease = e * e * (3 - 2 * e);
      ob.turners[i].rotation.z = -0.25 + ease * (Math.PI + 0.5);
    }
  }
  // spilled tea: splash up, then fall + fade out
  for (let i = TEADROPS.length - 1; i >= 0; i--) {
    const d = TEADROPS[i];
    d.vel.y -= 0.05; // gravity
    d.mesh.position.addScaledVector(d.vel, 0.05);
    d.mesh.scale.multiplyScalar(0.985);
    d.life -= 0.016;
    d.mesh.material.opacity = Math.max(0, Math.min(1, d.life * 1.6));
    if (d.life <= 0) {
      scene.remove(d.mesh);
      d.mesh.material.dispose();
      TEADROPS.splice(i, 1);
    }
  }
  // dust puffs: drift, swell, fade
  for (let i = DUSTPUFF.length - 1; i >= 0; i--) {
    const d = DUSTPUFF[i];
    d.mesh.position.addScaledVector(d.vel, 0.05);
    d.mesh.scale.multiplyScalar(1.012);
    d.life -= 0.012;
    d.mesh.material.opacity = Math.max(0, d.life * 0.35);
    if (d.life <= 0) {
      scene.remove(d.mesh);
      d.mesh.material.dispose();
      DUSTPUFF.splice(i, 1);
    }
  }

  // a fly swarm bursts out near you every so often, buzzing
  if (t3 > nextSwarm && fallProg > 0.05 && fallProg < 0.95) {
    nextSwarm = t3 + rand(11, 20);
    swarmUntil = t3 + rand(2.6, 4.2);
    wallPoint(Math.min(0.97, tCam + rand(0, 0.04)), rand(0, 6.3), rand(0.1, 0.5), swarmCenter);
    for (const s of SWARM) s.mesh.visible = true;
    if (window.AUDIO && AUDIO.buzz) { AUDIO.buzz(); lastBuzz = t3; }
  }
  if (swarmUntil > 0) {
    if (t3 > swarmUntil) {
      swarmUntil = -1;
      for (const s of SWARM) s.mesh.visible = false;
    } else {
      for (const s of SWARM) {
        s.mesh.position.set(
          swarmCenter.x + Math.sin(t3 * s.sp + s.phase) * s.r + Math.cos(t3 * s.sp * 0.6 + s.phase) * s.r * 0.5,
          swarmCenter.y + Math.cos(t3 * s.sp * 0.8 + s.phase) * s.r,
          swarmCenter.z + Math.sin(t3 * s.sp * 0.7 + s.phase * 1.3) * s.r,
        );
      }
      if (window.AUDIO && AUDIO.buzz && t3 - lastBuzz > 0.95) { AUDIO.buzz(); lastBuzz = t3; }
    }
  }

  // small flickering embers riding along the shaft
  for (const e of EMBERS) {
    const tt = Math.min(0.99, Math.max(0.01, tCam + e.tOff));
    wallPoint(tt, e.ang + Math.sin(t3 * 0.3 + e.phase) * 0.4, e.inset, e.light.position);
    e.sprite.position.copy(e.light.position);
    const flk = 0.5 + 0.5 * Math.sin(t3 * 13 + e.phase) * Math.sin(t3 * 27 + e.phase * 1.7);
    e.light.intensity = 18 + 34 * flk;
    e.sprite.material.opacity = 0.25 + 0.4 * flk;
    e.sprite.scale.setScalar(0.32 + 0.12 * flk);
  }

  // shimmer cue breathes on every hoverable prop, nudged ones settle back
  for (const h of HOVERABLES) {
    if (h.wob && h.wobAmt > 0.003) {
      h.wob.rotation.z = Math.sin(t3 * 12) * 0.1 * h.wobAmt;
      h.wobAmt *= 0.94;
    }
    if (!h.halo) continue;
    const target = h.held
      ? 0
      : h === hovered
        ? h.riser
          ? 0.75
          : 0.55
        : h.riser
          ? 0.34 + 0.2 * (0.5 + 0.5 * Math.sin(t3 * 1.7 + h.phase))
          : 0.16 + 0.12 * (0.5 + 0.5 * Math.sin(t3 * 1.7 + h.phase));
    h.halo.material.opacity += (target - h.halo.material.opacity) * 0.1;
  }

  if (frame % 3 === 0) updateHover(); // raycasting at ~20fps is plenty
  updateTag();

  if (composer) composer.render();
  else renderer.render(scene, camera);

  if (frame === 5) window.__sceneReady = true;
}

animate(0);

window.addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  if (composer) composer.setSize(innerWidth, innerHeight);
});
