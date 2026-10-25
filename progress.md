# Progress — Short Circuit

## 25 Oct 2026

- **Kickoff.** Read COMMON.md, BUILD_HANDOFF.md, IDEAS.md and the Workbook chapter-4 snapshots. Wrote GAME_IDENTITY.md.
- **Mockups (before development).** The visual helper generated four gameplay mockups in the user's ChatGPT (gpt-image): `docs/visual-targets/` + `PROMPTS.md`.
- **Solver first.** `src/sim/circuit.ts`, nodal analysis with Norton batteries, 0.01 Ω wires and fuses that melt above their rating; 14 physics tests.
- **Laptop restart mid-session.** Work was committed; the visual helper resumed in a new Chrome tab and checked Tripo task history first, so nothing was paid twice.
- **Tripo.** 5 model generations + 2 auto-rigs (190 credits displayed): rigged thief (walk, idle), rigged guard (walk, idle, look_around, frightened), panel, giant bulb, vault door. The thief's run job stalled in Tripo's queue. Details: ASSETS.md.
- **Heist 1 end-to-end**, then the 3D world (cut-away walls, decor, lamps, vision fans, X-ray scanner), the 3D panel close-up, HUD, sound, fail/win screens.
- **Heists 2–6** authored as data, each with tests for the intended solution, the advertised wrong moves and constant strategies.
- **Art pass** against the mockups: darker floors with warm pools, readable characters, solid vision cones, wall decor, hero props, Tripo vault door, hands-up pose on the rig, push-in camera on fail/win.
- **Independent science review + bypass hunt.** Physics verified against Workbook. Two serious exploits (heist 2 bypass, heist 4 softlock) and several medium issues were found and fixed, with regression tests. See PLAYTEST.md.
- **Captures + visual review.** `scripts/capture.mjs` → `docs/captures/`, compared in `docs/VISUAL_REVIEW.md`.
- **Performance.** `scripts/fps.mjs` measured 120 fps (vsync cap) in all six heists at 1600×900, DPR 1, headless Chromium on Apple M2 Max (Metal). JS bundle 814 KB (216 KB gzipped) plus about 5.2 MB of models. Low-end devices not measured.

## Polish round ("make it perfect")

- Tripo second pass: thief run/afraid/cheer, guard run/angry/sit/look-around (0 credits). No new hero models: the shared pool had 25 credits; four models need about 120.
- Scanner X-ray wave + wall-routed wires, intro flyover, objective markers, planning map, guard "?" meters / search / lines / sitting, close calls, slow-mo "!", hit-stop steal, adaptive music, panel slots / drag / feed / device cards / gauge, IBL lighting, adaptive resolution, touch joystick, pause settings.
- Independent UX critique: 18 findings, all addressed (see PLAYTEST.md).

## Hero models (after the credit top-up)

- Tripo generated the Tesla coil, security camera, dynamo and reception desk (4 × 30 credits). Integrated in every heist that uses them, with procedural Tesla arcs and blinking camera LEDs; procedural versions remain as fallbacks.

## Next (not done)

- Real playtests with grade-8 students (fun and learning are unverified).
- Give "current is used up" and "the fuse is in parallel" a consequence of their own.
- AI-animated sneak/point clips (Tripo AI Animation).
- Wire routing that hugs walls in the scanner; more props per room.
