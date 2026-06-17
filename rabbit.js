// the white rabbit - a real rigged hare that bounds across the
// riverbank before the fall. runs in, stops to check the time (it's
// always late), then bolts off again. takes over from the flat tenniel
// plate, which sticks around as a fallback if this never loads.
//
// model: rigged "european rabbit", 31 baked clips (Run, Walk,
// StandAlert_Checking...). its material uses the deprecated
// KHR_materials_pbrSpecularGlossiness ext that three r160 doesn't read
// anymore, so we re-bind the diffuse texture by hand on load.

import * as THREE from "https://esm.sh/three@0.160.0";
import { GLTFLoader } from "https://esm.sh/three@0.160.0/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "https://esm.sh/three@0.160.0/examples/jsm/libs/meshopt_decoder.module.js";

const LOW =
  Math.min(innerWidth, innerHeight) < 700 ||
  (navigator.hardwareConcurrency || 8) <= 4;

const FALL_START = 0.1; // keep in sync w/ engine.js
const readP = () => (window.APP ? window.APP.p : 0);
const introActive = () => readP() < FALL_START + 0.012;

// phones skip the whole 3d rabbit: a 2nd WebGL context crashes a lot of them
// right at the tunnel mouth, and the flat tenniel plate is already the
// fallback (engine keeps it up since window.__rabbitReady never gets set).
if (!LOW) {
// renderer on its own transparent canvas, sits above the paper
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, LOW ? 1.5 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.setClearColor(0x000000, 0);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

const cv = renderer.domElement;
cv.id = "rabbit-canvas";
Object.assign(cv.style, {
  position: "fixed",
  top: "0",
  left: "0",
  width: "100%",
  height: "100%",
  zIndex: "30", // hops across in front of the opening reference page
  pointerEvents: "none",
});
document.body.appendChild(cv);
cv.style.display = "none";

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(34, innerWidth / innerHeight, 0.1, 100);
function placeCamera() {
  camera.aspect = innerWidth / innerHeight;
  camera.position.set(0, 2.05, 6.3);
  camera.lookAt(0, 1.85, 0); // aim high so the rabbit sits low, under the text
  camera.updateProjectionMatrix();
}
placeCamera();

// soft riverbank daylight
scene.add(new THREE.HemisphereLight(0xfff6e2, 0xb59a6a, 1.15));
const key = new THREE.DirectionalLight(0xfff1d6, 1.5);
key.position.set(-3, 4, 3);
scene.add(key);
const rim = new THREE.DirectionalLight(0xffe9c0, 0.45);
rim.position.set(4, 2, -3);
scene.add(rim);

// soft contact shadow, shrinks when the rabbit's airborne
function shadowTex() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const x = c.getContext("2d");
  const g = x.createRadialGradient(64, 64, 4, 64, 64, 64);
  g.addColorStop(0, "rgba(46,30,12,0.45)");
  g.addColorStop(1, "rgba(46,30,12,0)");
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
const shadow = new THREE.Mesh(
  new THREE.PlaneGeometry(2.2, 2.2),
  new THREE.MeshBasicMaterial({ map: shadowTex(), transparent: true, depthWrite: false }),
);
shadow.rotation.x = -Math.PI / 2;
shadow.position.y = 0.01;
scene.add(shadow);

// state
const world = new THREE.Group(); // drives the x-across move + the hop arc
scene.add(world);
let holder = null; // carries the model + which way it faces
let mixer = null;
let rabbit = null;
const clips = {};
let current = null;
let started = false;
let rootBone = null;
let rootBind = null;

const FACE_Y = Math.PI / 2; // model's forward -> +x (running right), eyeballed
const TARGET_H = 1.1;
const EDGE = 6.6; // off-screen x on either side
const CHECK_X = -2.15; // stops at the left margin, clear of the centred text

const DUR = { in: 2.2, check: 2.6, out: 1.5, gap: 1.0 };
let st = "in";
let phaseStart = 0;

function play(name, fade = 0.25) {
  if (!mixer || !clips[name]) return;
  const a = mixer.clipAction(clips[name]);
  a.reset().fadeIn(fade).play();
  if (current && current !== a) current.fadeOut(fade);
  current = a;
}

function setState(s, now) {
  st = s;
  phaseStart = now;
  if (s === "in" || s === "out") play("Run");
  else if (s === "check")
    play(clips.StandAlert_Checking ? "StandAlert_Checking" : "Alert");
}

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder); // rabbit.glb is meshopt-compressed
loader.load(
  "media/models/rabbit/rabbit.glb",
  async (g) => {
    rabbit = g.scene;

    // diffuse texture is buried in the unsupported specGloss ext,
    // so pull it straight off the parser and re-apply it ourselves
    let tex = null;
    try {
      tex = await g.parser.getDependency("texture", 0);
    } catch (e) {}
    if (tex) tex.colorSpace = THREE.SRGBColorSpace;
    rabbit.traverse((o) => {
      if (o.isMesh) {
        o.frustumCulled = false; // skinned bounds jump around, so don't cull
        o.material = new THREE.MeshStandardMaterial({
          map: tex || null,
          color: tex ? 0xffffff : 0xded7c6,
          roughness: 0.82,
          metalness: 0,
        });
      }
    });

    // Box3.setFromObject is flaky on skinned meshes, so measure the
    // real rest-pose bounds off each geometry's own bounding box
    function measure(obj) {
      const b = new THREE.Box3();
      obj.updateWorldMatrix(true, true);
      obj.traverse((o) => {
        if (o.isMesh && o.geometry) {
          o.geometry.computeBoundingBox();
          b.union(o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld));
        }
      });
      return b;
    }
    let box = measure(rabbit);
    const size = new THREE.Vector3();
    box.getSize(size);
    rabbit.scale.setScalar(TARGET_H / size.y);
    box = measure(rabbit);
    rabbit.position.x -= (box.min.x + box.max.x) / 2;
    rabbit.position.z -= (box.min.z + box.max.z) / 2;
    rabbit.position.y -= box.min.y;

    holder = new THREE.Group();
    holder.rotation.y = FACE_Y;
    holder.add(rabbit);
    world.add(holder);

    // pin the skeleton root so the baked locomotion doesn't drag the
    // rabbit off its mark - we drive the cross-screen motion ourselves
    rabbit.traverse((o) => {
      if (o.isSkinnedMesh && !rootBone) {
        rootBone = o.skeleton.bones[0];
        rootBind = rootBone.position.clone();
      }
    });

    mixer = new THREE.AnimationMixer(rabbit);
    for (const c of g.animations) {
      const m = c.name.match(/EuropeanRabbit_(.+)$/);
      if (m) clips[m[1]] = c;
    }
    window.__rabbitWorld = world;
    window.__rabbitReady = true;
  },
  undefined,
  () => {}, // load failed -> the 2d tenniel plate stays put
);

// animate
let last = 0;
function animate(ts) {
  requestAnimationFrame(animate);
  const now = ts * 0.001;
  const dt = Math.min(0.05, now - last);
  last = now;

  if (!introActive()) {
    if (cv.style.display !== "none") cv.style.display = "none";
    started = false;
    return;
  }
  if (cv.style.display === "none") cv.style.display = "";

  if (mixer) mixer.update(dt);
  // keep the root put horizontally (kills the baked locomotion drift)
  if (rootBone) {
    rootBone.position.x = rootBind.x;
    rootBone.position.z = rootBind.z;
  }

  if (rabbit && holder) {
    if (!started) {
      started = true;
      world.visible = true;
      setState("in", now);
    }
    const e = now - phaseStart;
    if (st === "in") {
      const u = Math.min(1, e / DUR.in);
      world.position.x = -EDGE + (CHECK_X + EDGE) * u;
      holder.rotation.y = FACE_Y;
      if (u >= 1) setState("check", now);
    } else if (st === "check") {
      world.position.x = CHECK_X;
      // turn a touch toward the viewer while it frets about the time
      holder.rotation.y = FACE_Y - 0.5;
      if (e >= DUR.check) setState("out", now);
    } else if (st === "out") {
      const u = Math.min(1, e / DUR.out);
      world.position.x = CHECK_X + (EDGE - CHECK_X) * u;
      holder.rotation.y = FACE_Y;
      if (u >= 1) setState("gap", now);
    } else if (st === "gap") {
      world.visible = false;
      if (e >= DUR.gap) {
        world.visible = true;
        setState("in", now);
      }
    }

    // low bounding arc while running, planted while it's checking
    const running = st === "in" || st === "out";
    world.position.y = running ? 0.12 * Math.abs(Math.sin(now * 8.5)) : 0;

    shadow.position.x = world.position.x;
    shadow.visible = world.visible;
    const hh = world.position.y;
    shadow.scale.setScalar(Math.max(0.35, 1 - hh * 2));
    shadow.material.opacity = 0.45 * Math.max(0, 1 - hh * 2.5);
  }

  renderer.render(scene, camera);
}
requestAnimationFrame(animate);

addEventListener("resize", () => {
  placeCamera();
  renderer.setSize(innerWidth, innerHeight);
});
} // end if (!LOW)
