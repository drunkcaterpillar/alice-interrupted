// engine. one smoothed scroll value drives every layer.
// only touch the dom when state actually changes

const TOTAL = 42000;
const FALL_START = 0.1;
const FALL_END = 0.84;
const clamp = (x) => Math.max(0, Math.min(1, x));

let targetP = 0;
let dbgHold = false;
// the well drifts on its own even if you never scroll, but it has to
// back off the second you touch anything - otherwise it fights the
// wheel and scrolling feels busted
const AUTODRIFT = !matchMedia("(prefers-reduced-motion: reduce)").matches;
let lastInput = 0;
// __lastScroll = last time you *scrolled* (not just tapped). while holding
// a prop, a drag-to-turn (touchmove) shouldn't count as scrolling on.
window.__lastScroll = 0;
for (const ev of ["wheel", "touchstart", "touchmove", "keydown", "pointerdown"])
  addEventListener(
    ev,
    () => {
      lastInput = performance.now();
      const scrolled =
        ev === "wheel" ||
        ((ev === "touchmove" || ev === "keydown") && !window.__holding);
      if (scrolled) window.__lastScroll = lastInput;
    },
    { passive: true },
  );
addEventListener("scroll", () => {
  if (dbgHold) return;
  targetP = Math.min(1, scrollY / (TOTAL - innerHeight));
});

// dev helper: ?p=0.3 jumps straight to that point
const dbgP = parseFloat(new URLSearchParams(location.search).get("p"));
if (!isNaN(dbgP)) {
  dbgHold = true;
  targetP = dbgP;
  addEventListener("load", () => {
    scrollTo(0, dbgP * (TOTAL - innerHeight));
    setTimeout(() => (dbgHold = false), 300);
  });
}

// smoothed progress + velocity, wormhole.js reads these
window.APP = { p: 0, vel: 0 };

// elements
const $ = (id) => document.getElementById(id);
const hero = $("hero"), sub = $("sub");
const mcL = $("mc-left"), mcR = $("mc-right");
const mclI = $("mcl-inner"), mcrI = $("mcr-inner");
const hudT = $("hud-timer"), hudM = $("hud-mem");
const tVal = $("timer-val"), dVal = $("depth-val"), mVal = $("mem-val");
const scrollP = $("scroll-prompt");
const fin = $("finale"), finI = $("finale-inner");
const refpage = $("refpage");
const diveLine = $("dive-line");
const door = $("door");
const rabbitPlate = $("rabbit-plate");
const soundBtn = $("sound-toggle");
const textLayer = document.querySelector(".text-layer");

// memory sequence - what her brain wrote down.
// every card is carroll word-for-word, chapter I 1865
const MEMS = [
  { at: 0.0,  side: "left",
    txt: "…she found herself falling<br>down what seemed to be<br>a very deep well." },
  { at: 0.09, side: "right",
    txt: "She looked at the sides of the well,<br>and noticed that they were filled<br>with cupboards and book-shelves:<br>here and there she saw maps<br>and pictures hung upon pegs." },
  { at: 0.2,  side: "left",
    txt: 'She took down a jar from one<br>of the shelves as she passed;<br>it was labelled <em>‘ORANGE MARMALADE’</em>,<br>but to her great disappointment<br>it was empty.<br><span style="opacity:0.55;font-size:0.85em">She did not like to drop the jar<br>for fear of killing somebody underneath.</span>' },
  { at: 0.31, side: "right",
    txt: "Either the well was very deep,<br>or she fell very slowly,<br>for she had plenty of time<br>as she went down to look about her,<br>and to wonder what was<br>going to happen next." },
  { at: 0.42, side: "left",
    txt: "‘I wonder how many miles<br>I’ve fallen by this time?’<br>she said aloud.<br>‘I must be getting somewhere near<br>the centre of the earth.’" },
  { at: 0.53, side: "right",
    txt: "‘Dinah’ll miss me very much<br>to-night, I should think!<br>I hope they’ll remember<br>her saucer of milk at tea-time.’" },
  { at: 0.64, side: "left",
    txt: "‘Do cats eat bats?<br>Do bats eat cats?’<br><br>…she couldn’t answer either question,<br>so it didn’t much matter<br>which way she put it." },
  { at: 0.76, side: "right",
    txt: "‘Well!’ thought Alice to herself,<br>‘after such a fall as this,<br>I shall think nothing of<br>tumbling down stairs!’" },
  { at: 0.88, side: "left",
    txt: "…when suddenly, thump! thump!<br>down she came upon a heap<br>of sticks and dry leaves,<br>and the fall was over." },
  { at: 0.955, side: "right",
    txt: "Alice was not a bit hurt,<br>and she jumped up<br>on to her feet in a moment." },
];


// aftermath beats - the two lines that bridge the fall to the door
const HERO = {
  after1: ["She would remember<br>falling for a long time.", ""],
};

// finale lives as static markup in index.html; engine just reveals it.
// wire up the foot links once
let finaleEls = [];
(function buildFinale() {
  finaleEls = [...finI.querySelectorAll("[data-fin]")];

  document.getElementById("again-link").addEventListener("click", (e) => {
    e.preventDefault();
    scrollTo(0, 0); // smoothed p rewinds the whole tunnel
  });
  const share = document.getElementById("share-link");
  share.addEventListener("click", async (e) => {
    e.preventDefault();
    const url = location.href.split("?")[0];
    try {
      if (navigator.share) {
        await navigator.share({
          title: "1.2 Seconds",
          text: "She fell for 1.2 seconds and remembered hours. Fall down the rabbit hole:",
          url,
        });
      } else {
        await navigator.clipboard.writeText(url);
        share.textContent = "link copied";
        setTimeout(() => (share.textContent = "share ↗"), 2000);
      }
    } catch {}
  });
})();

// ui helpers - all state-diffed so we don't thrash the dom
const S = {
  heroKey: null, heroTimer: null,
  memIdx: -1,
  hudOn: null, finaleOn: null, rabbitOn: null,
  memCount: -1, timerTxt: "", depthTxt: "",
  dive: -2, dlOp: -1, doorOpen: -1, promptOn: null,
  cardSeen: false, cardDwell: 0,
};

function setHero(key) {
  if (S.heroKey === key) return;
  S.heroKey = key;
  clearTimeout(S.heroTimer);
  hero.classList.remove("on");
  sub.classList.remove("on");
  if (!key) return;
  const [t, s] = HERO[key];
  S.heroTimer = setTimeout(() => {
    hero.innerHTML = t;
    sub.textContent = s;
    hero.classList.add("on");
    if (s) sub.classList.add("on");
  }, 330);
}

function setMemory(idx) {
  if (S.memIdx === idx) return;
  S.memIdx = idx;

  if (idx < 0) {
    mcL.classList.remove("on");
    mcR.classList.remove("on");
    return;
  }
  const m = MEMS[idx];

  // caption goes on the opposite side from the memory
  const capSide = m.side === "left" ? "right" : "left";
  const el = capSide === "left" ? mcL : mcR;
  const other = capSide === "left" ? mcR : mcL;
  const inner = capSide === "left" ? mclI : mcrI;
  inner.innerHTML = `<div class="mc-text">${m.txt}</div>`;
  el.classList.add("on");
  other.classList.remove("on");

  if (window.AUDIO) AUDIO.chime(idx);
}


function setFlag(name, el, on, cls = "on") {
  if (S[name] === on) return;
  S[name] = on;
  el.classList.toggle(cls, on);
}

// render
let landFx = 0;     // flash+shake, decays after landing
let landed = false; // crossed the landing line this pass
let prevMp = 0;
let fallMs = 0;     // real ms spent inside the fall
let lastTime = 0;

function render(time) {
  requestAnimationFrame(render);
  const dt = Math.min(120, time - lastTime);
  lastTime = time;

  // auto-fall: keep sinking when you're not actively scrolling. while
  // you're holding/inspecting a prop it still drifts, just slower, so the
  // fall never dead-stops; otherwise it kicks back in soon after you stop.
  if (
    AUTODRIFT &&
    !dbgHold &&
    targetP > FALL_START + 0.001 &&
    targetP < FALL_END - 0.005
  ) {
    if (window.__holding) scrollBy(0, 0.13 * dt);
    else if (time - lastInput > 800) scrollBy(0, 0.6 * dt);
  }

  // gate: a fast scroll can't blow past the title card. hold the scroll
  // at it until it's actually been on screen a moment, then let go
  if (!S.cardSeen && !dbgHold && targetP > 0.078) {
    targetP = 0.078;
    const maxY = 0.078 * (TOTAL - innerHeight);
    if (scrollY > maxY + 1) scrollTo(0, maxY);
  }

  // smooth the scroll - this is where the "flow" comes from
  const A = window.APP;
  const prev = A.p;
  A.p += (targetP - A.p) * 0.085;
  A.vel = A.vel * 0.9 + (A.p - prev) * 0.1;
  const p = A.p;
  const f = window.fx;

  // ...once the card has been up long enough, drop the gate for good
  if (!S.cardSeen && p >= 0.066) {
    S.cardDwell += dt;
    if (S.cardDwell > 1500) S.cardSeen = true;
  }

  // defaults
  f.dustAlpha = 0;
  f.rayAlpha = 0;
  f.streakSpeed = 0;
  f.warmth = 0;
  f.flash = 0;
  f.shake = 0;
  f.mouthGlow = 0;
  f.bgColor = [233, 222, 198]; // page colour; the fall overrides it w/ earth

  // clear the "fetching plates..." note once the 3d scene has drawn
  if (!S.sceneReady && window.__sceneReady) {
    S.sceneReady = true;
    refpage.classList.add("ready");
  }
  setFlag("promptOn", scrollP, p >= 0.003, "hide");

  let heroKey = null;
  let hudOn = false, rabbitOn = false;
  let finaleP = 0;
  let openDive = -1;
  let openCard = 0;
  let mp = p >= FALL_END ? 1 : 0;

  // opening - the reference page turns like a book page, then the title
  // card ("alice, interrupted") holds before the fall begins
  if (p < FALL_START) {
    openDive = clamp((p - 0.03) / 0.026); // the page flip, 0->1
    // title card: fades in, holds on a plateau, fades out before the fall
    openCard = clamp((p - 0.05) / 0.008) * (1 - clamp((p - 0.086) / 0.012));
    f.dustAlpha = 0.06 + openDive * 0.09;
    f.warmth = clamp((p - 0.05) / 0.045) * 0.34;
    f.streakSpeed = Math.max(0, p - 0.09) * 28;
    rabbitOn = p < 0.05; // the rabbit darts across while you read
  }
  // the fall
  else if (p < FALL_END) {
    mp = (p - FALL_START) / (FALL_END - FALL_START);
    // 3d tunnel carries the scene now, 2d layer just adds warm
    // dust, a bit of light shaft and the dying daylight
    const day = Math.max(0, 1 - mp * 5.5);
    f.dustAlpha = 0.14;
    f.warmth = 0.55;
    f.rayAlpha = 0.05 + day * 0.3;
    f.mouthGlow = day;
    // page gives way to earth as you sink past the mouth
    f.bgColor = [16 + 217 * day, 9 + 213 * day, 4 + 194 * day];

    hudOn = true;
    fallMs += dt;

    // hud values
    const timerTxt = (mp * 1.2).toFixed(2) + "s";
    if (timerTxt !== S.timerTxt) { S.timerTxt = timerTxt; tVal.textContent = timerTxt; }
    const depthTxt = Math.round(mp * 4000).toLocaleString("en-US") + " mi";
    if (depthTxt !== S.depthTxt) { S.depthTxt = depthTxt; dVal.textContent = depthTxt; }
    const mc = Math.floor(Math.pow(mp, 1.3) * 88);
    if (mc !== S.memCount) { S.memCount = mc; mVal.textContent = mc; }

    // active memory
    let active = -1;
    for (let i = MEMS.length - 1; i >= 0; i--) {
      const m = MEMS[i];
      const dur = (MEMS[i + 1]?.at || 1.02) - m.at;
      if (mp >= m.at && mp < m.at + dur * 0.88) { active = i; break; }
    }
    setMemory(active);

    // landing
    if (mp >= 0.895 && prevMp < 0.895) {
      landFx = 1;
      if (window.AUDIO) AUDIO.land();
    }
  }
  // aftermath
  else if (p < 0.865) {
    const t = (p - FALL_END) / 0.025;
    f.dustAlpha = 0.11;
    f.warmth = 0.2;
    // climbing back onto the page
    const k = Math.min(1, t * 1.8);
    f.bgColor = [16 + 217 * k, 9 + 213 * k, 4 + 194 * k];
    heroKey = "after1";
  }
  // transition
  else if (p < 0.878) {
    f.dustAlpha = 0.07;
    finaleP = ((p - 0.865) / 0.013) * 0.18;
  }
  // finale
  else {
    f.dustAlpha = 0.04;
    finaleP = 0.18 + ((p - 0.878) / 0.122) * 0.82;
  }
  prevMp = mp;

  // opening visuals - flip the reference page, hold the title card
  if (openDive >= 0) {
    if (Math.abs(openDive - S.dive) > 0.003) {
      S.dive = openDive;
      refpage.style.setProperty("--dive", openDive.toFixed(3));
      refpage.style.visibility = openDive >= 0.999 ? "hidden" : "visible";
    }
    if (Math.abs(openCard - S.dlOp) > 0.01) {
      S.dlOp = openCard;
      diveLine.style.opacity = openCard.toFixed(3);
      diveLine.classList.toggle("on", openCard > 0.02);
    }
  } else if (S.dive !== 2) {
    // past the opening - make sure the page is fully gone
    S.dive = 2;
    refpage.style.setProperty("--dive", "1");
    refpage.style.visibility = "hidden";
    if (S.dlOp !== 0) {
      S.dlOp = 0;
      diveLine.style.opacity = "0";
      diveLine.classList.remove("on");
    }
  }

  // landing flash/shake decay
  if (landFx > 0.01) {
    f.flash = Math.max(f.flash, landFx * 0.4);
    f.shake = Math.max(f.shake, landFx * 0.55);
    landFx *= 0.93;
  }

  // apply shared state
  setHero(heroKey);
  setFlag("hudT", hudT, hudOn);
  setFlag("hudM", hudM, hudOn);
  // 3d rabbit takes over from the flat tenniel plate once it loads
  if (window.__rabbitReady) rabbitOn = false;
  setFlag("rabbitOn", rabbitPlate, rabbitOn);
  setFlag("soundCue", soundBtn, p > 0.004 && p < 0.095, "notice");
  setFlag(
    "onPaper",
    document.body,
    p < FALL_START + 0.004 || p >= FALL_END,
    "on-paper",
  );
  setFlag("besidePlate", textLayer, rabbitOn, "beside-plate");
  if (p < FALL_START) setMemory(-1);
  if (p >= FALL_END) setMemory(-1);

  // finale - reveal the lines, then swing the door open as you scroll on
  const finOn = finaleP > 0;
  setFlag("finaleOn", fin, finOn);
  if (finOn) {
    const stage = [0.0, 0.24, 0.5]; // lede, the turn, then door + foot
    for (const el of finaleEls) {
      const k = +el.dataset.fin;
      const o = Math.max(0, Math.min(1, (finaleP - stage[k]) * 4.5));
      el.style.opacity = o.toFixed(3);
    }
    const open = Math.max(0, Math.min(1, (finaleP - 0.56) / 0.4));
    if (Math.abs(open - S.doorOpen) > 0.004) {
      S.doorOpen = open;
      door.style.setProperty("--open", open.toFixed(3));
    }
  }

  // companion layers
  if (window.AUDIO) AUDIO.setFall(mp, Math.abs(A.vel));

  window.paintBg(time);
  window.paintFx(time);
}

requestAnimationFrame(render);
