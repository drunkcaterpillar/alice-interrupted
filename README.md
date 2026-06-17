# alice, interrupted

scroll down the rabbit hole. 🐇

**▸ [play it](https://drunkcaterpillar.github.io/alice-interrupted/)**

you fall through a long, winding tunnel full of victorian junk — teacups, clocks, a chess set, a marmalade jar, books that come apart when you grab them — and land at a door. step through.

### how to use it
- **turn the sound on.** it's half the experience.
- **scroll** to fall (let go and it keeps drifting down on its own).
- **touch anything that glints** — pick it up, spin it around, the teacups spill.

best on a laptop. works on a phone, just heavier.

### the why (optional)
alice's fall in the book takes *forever* — she reads jar labels, does mental math, gets bored. turns out there's real neuroscience for why a fall can feel that long, and carroll kind of nailed it in 1865 without trying. i didn't want the site to feel like homework, so all of that lives behind the door if you're curious.

### built with
no framework, no build step. just files.

- vanilla **html / css / js**
- **three.js** for the 3d tunnel — straight off a cdn, no npm — plus a custom motion-blur shader and raycasting for the grab-and-turn props
- the **web audio api** for everything you hear (all synthesized, there are zero audio files)
- canvas 2d for the dust and light
- props are meshopt-compressed `.glb` (poly haven, cc0); fonts from google fonts

run it locally with any static server:

```
python3 -m http.server 8000
```

…then open `localhost:8000`.

### borrowed bits
the carved door, the garden, the rabbit, and all the props are credited [behind the door](https://drunkcaterpillar.github.io/alice-interrupted/faq.html). the words are lewis carroll's, 1865.
