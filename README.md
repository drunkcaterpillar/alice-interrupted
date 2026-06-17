# alice, interrupted

You're Alice now. Scroll down the rabbit hole. 🐇

**▸ [play it](https://drunkcaterpillar.github.io/alice-interrupted/)**

Fall through a long, winding tunnel full of victorian junk, from teacups to clocks, a chess set, a marmalade jar, and books that come apart when you grab them -- and land at a door to the garden.

### how to use it
- **Turn the sound on.** it's half the experience.
- **Scroll** to fall (and if you let go, it keeps drifting down on its own).
- **Touch anything that glints** -- pick it up, spin it around, take a closer look. (the teacups spill)

Best on a laptop. Also works on a phone, just slower.

### the why (optional)
Alice's fall in the book takes *forever* as she reads jar labels, does mental math, gets bored. Turns out there's real neuroscience for why a fall can feel that long, and Carroll kind of nailed it in 1865 without trying. I didn't want the site to feel like homework, and this is mostly just a fun scroll-driven 3js project, but all of that lives behind the door if you're curious.

### built with

- Vanilla **HTML / CSS / JS**
- **Three.js** for the 3d tunnel; straight off a cdn, no npm + a custom motion-blur shader and raycasting for the grab-and-spin props
- **Web Audio API** for everything you hear (all synthesized)
- Canvas 2D for the dust and light
- Props are meshopt-compressed `.glb` (poly haven)
- Fonts from **Google Fonts**

Run it locally with any static server:

```
python3 -m http.server 8000
```

…then open `localhost:8000`.

### borrowed bits
credited [behind the door](https://drunkcaterpillar.github.io/alice-interrupted/faq.html)
