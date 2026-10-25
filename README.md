# Short Circuit — קצר

A 3D night-heist browser game for Hebrew-speaking grade-8 science students (Israeli curriculum, per [Workbook](https://science.workbook.co.il/grade-8/chapter-4/electric-circuits), chapter 4 "חשמל ומגנטיות").

Gunpoint × Monaco: sneak through the Electric Museum at night, where every camera, laser, alarm loop, motor door and corridor light is a load on a real circuit hidden in the walls. Hold the X-ray scanner to see the current flowing, open wall panels, and rewire them — snip, bridge, short, swap batteries and resistors — so the building's own machines open your path. Guards notice dark rooms, hear popped fuses and come to fix your handiwork. Circuits are the lockpick.

![Lobby, first 30 seconds](docs/captures/actual-01-first-30s.png)
![Panel close-up](docs/captures/actual-02b-panel-closeup.png)

## Run

```bash
npm install
npm run dev        # http://127.0.0.1:5196
npm test           # vitest: circuit solver + every heist
npm run build      # static build in dist/ (works offline)
npm run preview    # http://127.0.0.1:4196
```

Useful URL flags: `?level=N` starts on heist N, `?all=1` unlocks every heist, `?play=1` skips the title screen.

## Controls

| Action | Keyboard / mouse | Touch |
|---|---|---|
| Move | WASD / arrows (camera-relative), or click the floor | on-screen joystick (push fully to run), or tap the floor |
| Run (noisy — guards hear it) | Shift | — |
| Use panel / window / take exhibit | E (or click it) | E button |
| Wiring scanner (X-ray) | hold Space, or Tab to toggle | סורק button |
| Rotate camera 90° | Z / X | ⟲ ⟳ |
| Planning map (paused overview with guard patrol routes) | hold Q | 🗺 |
| Hint (when 💡 glows) | H | 💡 |
| Pause / mute | P or Esc / M | ⏸ / 🔊 |
| In a panel | click a part to measure it; ✂ cuts/re-joins a wire; pick a bag item, then click a labelled slot **or drag from one brass terminal to another** (for a battery, the first terminal is −); Esc closes | same, by tap |

The world is paused while a panel is open (no reading-speed pressure); a live security-camera inset shows the building react to each change, and an effects feed spells it out ("💡 the chandelier went out", "🚪 door opening!", "🚨 alarm loop broken!").

## Game feel

- **X-ray scanner:** a wave sweeps out from the thief and reveals the wiring *inside the walls*, with current dots whose speed follows the solved current.
- **Guards:** a "?" meter fills over their heads (suspicion builds slowly, "!" confirms fast), they walk over to search where they last saw you, investigate dark rooms, answer fuse pops, hunt down a short, and mutter comic Hebrew lines.
- **Readability:** wall-occluded vision cones, a light/shadow chip, noise rings when running, objective markers that pin to the screen edge, an intro flyover of the exhibit and exit, a paused planning map with patrol routes.
- **Rewards:** close-call pops, a hit-stop when you grab the exhibit as it arcs into your backpack, live star goals (exhibit · ghost · par time), animated results with a rank.
- **Sound:** an adaptive synthesized soundtrack (menu → sneak → tension when you're noticed → alarm/win) and layered effects, all generated in code.
- **Polish:** image-based lighting for the PBR Tripo models, bloom, vignette and grain, a camera that leads your movement, adaptive resolution on weaker devices, and a reduced-motion option.

## The six heists (all implemented)

1. **הלובי — Lobby:** open vs closed circuits; conductor (coin) vs insulator (rubber glove).
2. **גלריית האורות — Gallery of Lights:** parallel corridor lamps vs a series display string; bypass the gem bulb before stealing it.
3. **לולאת האזעקה — Alarm Loop:** a series alarm loop; bridge a window sensor in parallel (graphite pencil) before opening it. Cutting first always trips it.
4. **דלת המנוע — Motor Door:** Ohm's law; pick battery + resistance to give the motor ≥ 2 A without melting its 4 A fuse.
5. **האפלה — Blackout:** a deliberate short melts the series fuse of a 220 V wing; a live cable over a puddle teaches wet-skin resistance; an unfused circuit shows why fuses exist.
6. **הכספת — The Vault (transfer, no hints):** a parallel bus whose 5 A fuse is a 60 W budget (P = V·I), a real alarm loop, a decoy loop and a guard-post light that must stay on; "always cut", "always short" and "cut everything but the alarm" all fail.

Details per level: [CURRICULUM.md](CURRICULUM.md). Design: [GAME_IDENTITY.md](GAME_IDENTITY.md). Progress log: [progress.md](progress.md). Playtest record: [PLAYTEST.md](PLAYTEST.md). Mockups vs real captures: [docs/VISUAL_REVIEW.md](docs/VISUAL_REVIEW.md). Models: [ASSETS.md](ASSETS.md).

## Architecture

- `src/sim/circuit.ts` — authoritative DC solver: nodal analysis over a graph of batteries, resistive loads, wires (0.01 Ω) and fuses that melt above their rating. No gameplay special cases.
- `src/sim/game.ts` — deterministic fixed-step heist simulation: thief movement, guard AI (patrol, investigate dark rooms, answer fuse pops, repair panels, re-find a short), vision cones, cameras, lasers, alarm loops, hazards, checkpoints. Pure TypeScript, no Three.js.
- `src/levels/*.ts` — the six heists as data (map, circuits, panels, devices, guards, Hebrew hints and explanations).
- `src/render/` — Three.js world (cut-away walls, X-ray scanner wires with current dots whose speed follows the current, lamps, light pools, vision fans, Tripo models), the 3D panel close-up, particles.
- `src/main.ts` — input, HUD, panel UI, hints, fail/win screens, sound (WebAudio synth), learning log, test hooks (`window.render_game_to_text()`, `window.advanceTime(ms)`).
- `tests/` — solver physics tests and one file per heist: the intended solution through real inputs, the advertised wrong moves, and constant-strategy failures.

## Deploying to Vercel

It is a static Vite site. In Vercel: import `AceDZN/short-circuit`, framework preset **Vite**, build command `npm run build`, output `dist` (also set in `vercel.json`). No environment variables, backend or API keys. All fonts and models are bundled; nothing is fetched at runtime.

## Status

Implemented: all six heists, scanner, 3D panel close-up, guard AI, rigged Tripo thief and guard (walk/idle; guard also look-around and frightened), Tripo panel, giant bulb and vault door, Hebrew RTL UI, sound, hints, checkpoints, learning log, 73 automated tests. Measured 120 fps (vsync cap) on an M2 Max at 1600×900 (`scripts/fps.mjs`). Not verified by real students; see PLAYTEST.md for what was and wasn't checked.
