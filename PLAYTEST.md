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

## Known limits

- The thief has no run, crouch or surrender clip (Tripo run job stalled); see VISUAL_REVIEW.md.
- Guards don't chase. Being seen fills a notice meter; at full you're caught.
- Frame rate: 120 fps (vsync cap) in all six heists, headless Chromium on the M2 Max GPU at 1600×900 (`scripts/fps.mjs`). Low-end hardware not measured.
- Not checked on a physical phone or tablet, or with a screen reader.
