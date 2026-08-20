# Starwake — Quest 3 WebXR space-flight game

A gate-and-asteroid runner built with four playable ships — Rocket,
Transport Shuttle, E-45 Aircraft, and Intergalactic Spaceship — plus the
Transport Shuttle again as the stationary "dock here" gate at the end of
each wave. Fly forward automatically; steer to bank through glowing rings
for score, dodge or shoot asteroids, and dock with the shuttle to warp to
the next wave. 6 waves, 3 lives, escalating speed.

Runs in any modern desktop browser, and in immersive VR on the **Meta Quest
3 Browser** via WebXR.

## Controls

- **Desktop:** Arrow keys or WASD to steer, Space (or click) to shoot
  straight ahead / confirm menus, **C** to swap ships.
- **Quest 3:** Steer by physically tilting the **right controller** — point
  it the way you want to go, like a flight stick. **Trigger** shoots in
  whatever direction you're currently pointing (not just straight ahead) and
  also confirms menus. **A** = next ship, **B** = previous ship. **Grip**
  opens the in-VR sound settings panel.

## Switching ships

Press **C** (desktop) or **A**/**B** on the right controller (VR) to cycle
Rocket → Transport Shuttle → E-45 Aircraft → Intergalactic Spaceship (A goes
forward through the list, B goes backward). A "NOW FLYING" notice confirms
the swap. Each ship has its own size, engine glow, and exhaust trail tuned
individually.

## End-of-wave replay

After docking with the shuttle, the camera turns to face the path you just
flew, then rises into a bird's-eye view showing every ring from that wave —
green for ones you flew through, red for ones you missed, each still
showing its point value. It holds that overview for a couple seconds, then
glides back down to exactly where you docked. Press Space (desktop) or the
trigger (VR) at any time to skip straight to the wave-clear screen.

## Sound

- A looping ambient soundtrack plays once you press Start.
- Steering has a directional blip (pitch = up/down, stereo pan = left/right)
  plus a continuous engine hum that rises with how hard you're maneuvering.
- Shooting, ring passes/misses, asteroid kills, level-ups, damage, ship
  swaps, and menu confirms all have their own sound effects — everything is
  generated procedurally in code except the soundtrack itself, so there's
  nothing extra to load.
- Click the **gear icon** (top right) for **Music** and **Sound Effects**
  volume faders on desktop. Levels are remembered between visits (via
  localStorage).
- **In VR**, use the **grip button** to open/close an in-scene 3D version of
  the same sound panel — point a controller at a slider and hold the
  **trigger** to drag it. This works reliably regardless of whether the
  browser supports WebXR's DOM Overlay feature, so it's the one to use on
  the Quest Browser. Gameplay pauses while the panel is open.

## Running it

This is a static site — three files matter: `index.html`, `js/main.js`,
and the `assets/` folder. It needs to be served over HTTP(S), not opened
as a `file://` URL (the browser will block loading the model/texture files).

### Quick local test (desktop browser only)

```bash
cd starwake
python3 -m http.server 8080
```

Then open `http://localhost:8080` in your desktop browser. This works for
the desktop/mouse-and-keyboard mode, but **WebXR requires a secure context**
(https, or exactly `localhost`), so a plain `http://<your-lan-ip>:8080` URL
will NOT expose the "Enter VR" button when opened on the headset.

### Testing on the actual Quest 3 headset

WebXR only activates on a secure origin, so pick one of these:

1. **Easiest — free static hosting.** Push the `starwake/` folder to
   [GitHub Pages](https://pages.github.com/), [Vercel](https://vercel.com/),
   [Netlify](https://www.netlify.com/), or similar. You'll get a free
   `https://…` URL — open it in the Quest Browser and tap **Enter VR**.

2. **Local tunnel.** Run the local server above, then expose it with a
   tool like `ngrok http 8080` or `cloudflared tunnel --url http://localhost:8080`.
   Open the resulting `https://` URL on the headset.

3. **Self-signed local HTTPS** (no internet round-trip, but the headset
   will show a "connection not private" warning you have to click through):
   ```bash
   npx http-server -S -C cert.pem -K key.pem -p 8443
   ```
   then browse to `https://<your-lan-ip>:8443` on the Quest.

## Adding your soundtrack

The looping soundtrack is already wired up at `assets/audio/soundtrack.mp3`
(converted from the WAV you provided). To swap it for something else, just
replace that file — see `assets/audio/README.txt`. Its volume is controlled
by the in-game Music fader (gear icon, top right), independent of the
Sound Effects fader that controls every other sound in the game.

## Notes on the source assets

- `assets/rocket/` — your `12217_rocket_v1_l1.obj` model, renamed for
  clean relative paths, used as one of the player ships.
- `assets/shuttle/` — the "Transport Shuttle" OBJ + textures. The original
  `.mtl` had broken Windows-style backslash paths and a couple of typo'd
  PNG references pointing at files that didn't exist in the archive; I
  rewrote it (`shuttle.mtl`) with clean forward-slash paths to the actual
  JPGs included in `53-obj.rar`. It's used both as a playable ship and as
  the stationary "dock here to advance" target at the end of each wave.
- `assets/e45/` — the E-45 Aircraft OBJ variant from your archive. Its
  textures were originally 3072×3072 (several MB each); I downscaled the
  ones actually used (diffuse, normal, glass) to 1536×1536/1024×1024 and
  rewrote the `.mtl` with clean paths and no spaces in filenames (the
  original had spaces in texture filenames, which is fragile for OBJ/MTL
  parsing).
- `assets/intergalactic/` — the Intergalactic Spaceship OBJ. Its `.mtl`
  pointed at a `../textures/` folder that wasn't included in the archive
  you uploaded, so there are no image textures for this one — it uses a
  plain metallic-gray material instead. If you have the original texture
  files, upload them and I can wire them in.
- The two `.blend` files from `41-blender.rar` aren't included — they're
  Blender project files, not something a browser can load directly, and
  the OBJ export already covers the shuttle's geometry and textures.
- The soundtrack (`assets/audio/soundtrack.mp3`) is converted from the WAV
  ambient track you provided ("zone2-council-ambience"), trimmed down to
  mp3 to keep the download size reasonable.
