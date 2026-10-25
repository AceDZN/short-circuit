# Playtest record — Short Circuit

25 October 2026. Automation and AI playtests only. **No real student has played this yet, and nothing here shows that the game is fun or that anyone learns from it.** Those need real playtests with 13-year-olds.

## Automated (vitest, `npm test`) — 73 tests, all passing

- **Circuit solver** (`tests/circuit.test.ts`): Ohm's law; open circuits; series (same current, voltages split, one break stops all); parallel (full voltage per branch, currents sum, branches independent); current is not used up; shorts give a huge but finite current; series fuses melt and open the circuit; a bypass wire keeps a series string running; insulators; more resistance gives less current; Kirchhoff's current law at every node of a mixed network.
- **Every heist** (`tests/l1..l6.test.ts`): the intended solution played through public inputs only (walk, interact, panel actions, time). Each test also covers the advertised wrong moves, guard reactions and the constant strategies that must fail. Heist 3 can't be passed by cutting first; heist 6 can't be won by "always cut", "always short" or "cut everything except the alarm"; heist 6 has an exhaustive check of which branch sets fit the 5 A budget.
- **Level sanity** (`tests/levels.test.ts`): map widths, reachable start/exit/panels, unique part ids, and every building starts quiet.

## Independent science review + bypass hunt (AI reviewer)

The reviewer read the Workbook snapshots, the solver, every level and every test, wrote probe scripts, and played heist 1 headless with real keys and mouse (Tab scanner, WASD, E at the panel, clicking a wire, ✂ and C). Verdict: the physics matches the Workbook sources; the stated simplifications (mains as DC, small internal resistance, 2 % device tolerance) are acceptable. No console errors.

| Finding | Status |
|---|---|
| Heist 2: cut the display string, then steal while the guard walks over to fix it → won without the parallel bypass | **Fixed.** After repairing, a guard checks any room that stays dark and finds the empty case. Regression test added. |
| Heist 4: blow the fuse, fix it yourself, enter the archive → the guard still pulls your parts and the door traps you | **Fixed.** A guard who finds the fuse already replaced leaves the panel alone. A general "trapped" safety net ends the heist (retryable) if the thief can reach neither the exit nor any panel. Regression test added. |
| Heist 5: about 22 s before the short is found; a thief still in the west room is surprised | **Mitigated.** A toast warns when the guard starts hunting for the short. |
| Heist 6 wording: "the fuse limits the power" | **Fixed:** "the fuse melts above 5 A; at 12 V that is a 60 W power budget". |
| Heist 5 rewards shorting mains without a real-world warning | **Fixed:** the brief and concept now say never do this for real (arc, burns, fire). |
| Heist 6 solvable by "cut everything except the alarm" | **Fixed:** a guard-post light on the same bus must stay on (cutting it brings the guard); branch currents retuned so only {lasers, loop B} (± camera) fit under 5 A. Fail screens now report the current that melted the fuse. |
| Puddle hazard keyed to current, not voltage | **Fixed:** the hazard is live while the exposed conductor sits at ≥ 30 V. |
| Terms "פאזה/אפס" not used by Workbook | **Fixed:** "חוט הזינה / חוט החזרה". |
| Pencil note "the exception" overstates graphite | **Fixed**, and CURRICULUM.md marks graphite as an extension beyond the saved snapshots. |
| Panel click without a prior hover sometimes misses | **Fixed:** world matrices are updated before raycasting. |
| Phone portrait: HUD overlap, near-black opening frame | **Fixed:** checked at 375×812 in the browser pane, and tap-to-move produces a path. Not tested on a physical phone. |
| "Current is used up" and "the fuse is in parallel" have no gameplay consequence of their own | **Open.** They're covered only by the amp labels and ammeter mode (current equal before and after every bulb) and by the text. |
| Workbook's ohms-law page says "with 3 Ω the current is 12 ÷ 4 = 3 A" (should be 12 ÷ 3 = 4 A) | Reported to the user; the game doesn't repeat it. |

## Lead's own browser checks (built-in browser pane, real GPU)

- Title screen → heist 1; Tab and Space scanner; walking the thief; E at the lobby panel; **clicking the chandelier wire and pressing ✂** cut it (lamp 0 A, inspector shows 12 V across the gap); CCTV inset updates.
- Heist 4 panel: **clicked the 12 V battery in the bag, then two terminals**; the slot turned green and the inspector read 12 V / 0 A until the resistor slot was filled.
- Busted moment: camera push-in, hands-up pose on the rigged thief, guard "!!", stamp card.
- Phone size 375×812: HUD, panel view and tap-to-move work.
- Tripo models confirmed in gameplay: thief and guard (rigged, walk/idle; the guard also plays look-around and frightened), panel, giant bulb, vault door.

## Polish round (same day, after "make it perfect")

Added and checked in the built-in browser and in GPU-headless Chromium:
- Wall-routed scanner wires revealed by an expanding X-ray wave; device amp tags appear as the wave reaches them.
- Intro flyover (exhibit → exit → thief, once per heist per session, skippable), objective markers pinned to the screen edge, a paused planning map (Q / 🗺) with guard patrol routes.
- Guards: "?" meter over the head (slow suspicion, fast confirmation), a slow-motion beat at "!", searching where they last saw you, comic Hebrew lines, sitting at desks (Tripo `sit` clip) until something happens; the angry clip on alert.
- Panel: clickable labelled slots, drag-to-wire with a rubber-band preview, sparks, an effects feed, device cards, stable bag slots. Checked by real clicks in heist 4 (12 V into its slot, then a resistor into its slot → 1.49 A, the motor strains).
- Thief: Tripo `run`, `afraid` (caught) and `cheer` (escaped).
- Fair checkpoint retries (wiring kept, guards back at their posts), close calls, live star goals, animated results with a rank, adaptive music and effects, touch joystick, pause settings, IBL lighting, vignette/grain, adaptive resolution.
- Frame rate after the round: 111–120 fps in heists 1–4 and steady 120 fps in heists 5–6 during play (`scripts/fps.mjs`, M2 Max, 1600×900, DPR 1); the zoomed-out intro is the heaviest view.
- 75 automated tests pass, including new ones for guard search and checkpoint fairness.
- Locomotion is stride-matched (clip speed follows ground speed, measured from the Tripo foot bones), so feet don't slide.

## Independent game-feel / UX critique (AI critic, GPU headless, real input)

The critic played the live build at 1440×900 and 390×844. It found 18 issues; all were addressed:

| Finding | Fix |
|---|---|
| Vision cones showed a 7-tile reach even in the dark | The far cone now stops at the last lit floor (it only ever overestimates); the near flashlight cone is unchanged; moonlight dimmed so "lit" reads clearly. |
| Heist 1 checkpoint restored a doomed state | Checkpoint retries keep your wiring but send guards back to their posts, plus a 2.5 s grace period. Regression test. |
| Fail text blamed the player for the wrong thing | The text comes from what happened (the guard's task, a repair that just turned the camera back on), and the matching hint shows on the fail card. |
| Rewiring consequences invisible while the panel is open | The security-cam inset swings to the device that changed; doors animate while paused; feed lines for a melted fuse ("6.0A > 4A" + flash) and "the guard heard you". |
| No hint inside panels | 💡 button and H inside the panel; heist 1 (tutorial) shows its panel hint automatically. |
| First 30 s lacked a next step; clock ran while reading | Heist 1 step guide (1/5…5/5) with an on-map "כאן" marker; the clock waits for the first move; camera zoomed out ~13 %. |
| Guard's repair race invisible | HUD chip: guard coming to check → walking to the panel → repairing. |
| Panel far from the mockup | Darker steel board, colour frames per circuit, stronger selection glow, device cards. |
| Ohm's law needed a gauge | Analogue ammeter on motors: green "enough" band, red "fuse" band, live needle. |
| Text piled up in the panel | Toasts go into the feed (or to the bottom) while a panel is open, and never block clicks. |
| Insulator looked like a conductor | Insulators are grey and labelled "מבודד · 0 A"; slots turn green only when current flows. |
| Light chip false alarm | Three states: בצל / מואר / באור — רואים אתכם (lit and actually in someone's range and sight). |
| Two identical retry buttons | One button when there's no checkpoint; the ghost star is per attempt. |
| E closed a panel just opened by click | 350 ms debounce. |
| Mobile | Touch wording, objective hidden in panels, larger pick targets. |
| Title lock covered names; Hebrew grammar | Corner lock badge; definite item names ("כפפת הגומי"); "!!" shown as ❗. |
| Flat steal moment | Hit-stop, camera punch-in, the exhibit arcs into the backpack, a dashed green route to the exit. |

## Movement fix (user report: "going through walls, getting stuck")

- **Cause 1 — camera:** the 45° diamond view made WASD (screen-relative) walk diagonally across the grid, so you scraped along walls at odd angles and wedged into corners. The camera is now an axis-aligned 3/4 view (still rotatable in 90° steps): W walks straight up a corridor.
- **Cause 2 — collision:** the body was a square that blocked a whole axis on contact and could be trapped when a door or window shut on its edge. It's now a circle pushed out of walls every step (smooth sliding, rounded corners, pushed clear of a closing door).
- **Cause 3 — keyboard focus:** keys typed while the game didn't have focus went elsewhere (e.g. a chat box). The game now pauses on focus loss and says so.
- **Visibility:** characters hidden behind a wall show an x-ray silhouette (cyan thief, amber guards); furniture doesn't trigger it.
- **Verified:** 18 fuzz runs (6 heists × 3 seeds × 6,000 steps of random walking: the body never overlaps a wall), a door-closing regression test, a diagonal-slide test, and real held-key sessions in every heist (`scripts/walkcheck.mjs`: D/W/A/S move right/up/left/down, stopping cleanly at walls). 95 tests pass.

## Known limits

- No sneak/crouch or pointing clip exists in Tripo's preset library (AI Animation not used). The Tesla coil, dynamo, security camera and reception desk are now Tripo models; the crown and Volta pile remain procedural.
- Guards don't chase. Being seen fills a notice meter; at full you're caught.
- Frame rate: 120 fps (vsync cap) in all six heists, headless Chromium on the M2 Max GPU at 1600×900 (`scripts/fps.mjs`). Low-end hardware not measured.
- Not checked on a physical phone or tablet, or with a screen reader.
