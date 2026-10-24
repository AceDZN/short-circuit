# Short Circuit — קצר — build handoff

Read `../COMMON.md` first. Repo `/Users/acedzn/dev/AceDZN-exp/short-circuit` → public `AceDZN/short-circuit`, port 5196 (preview 4196).

## Promise

Gunpoint × Monaco in 3D. A night heist through the Electric Museum: cameras, lasers, alarm loops, motor doors and corridor lights are all loads on real circuits hidden in the walls. Flip on your crew's wiring scanner and the building turns into an X-ray of glowing wires. Sneak, open panels, rewire, short and time things so the guards never see you. The fun is the "I outsmarted the building" moment that Gunpoint nails, plus Monaco's sneaky tension. You learn circuits because circuits are the lockpick.

Map evidence: Gunpoint × Monaco: What's Yours Is Mine — related ✓, density 0.657 (one of the emptiest measured); Gunpoint is in the 83.9th originality percentile. Not a certified gap. See IDEAS.md.

## Curriculum (Workbook grade 8, chapter 4)

[electricity-intro](https://science.workbook.co.il/grade-8/chapter-4/electricity-intro), [electric-circuits](https://science.workbook.co.il/grade-8/chapter-4/electric-circuits), [current-voltage-resistance](https://science.workbook.co.il/grade-8/chapter-4/current-voltage-resistance), [ohms-law](https://science.workbook.co.il/grade-8/chapter-4/ohms-law), [series-parallel](https://science.workbook.co.il/grade-8/chapter-4/series-parallel), [electrical-safety](https://science.workbook.co.il/grade-8/chapter-4/electrical-safety); optional [energy-power-consumption](https://science.workbook.co.il/grade-8/chapter-4/energy-power-consumption) (P = V·I for a power-budget level).

Rules the game uses (all from Workbook): a load works only in a **closed circuit**; **conductors** (metals, graphite, salt water) vs **insulators** (rubber, plastic, wood, dry air); **V = I·R**; **series**: one path, same current everywhere, resistances add, voltage splits, one break stops everything; **parallel**: each branch gets the full voltage, branches are independent, total current is the sum; **short circuit**: near-zero resistance path → huge current → heat → the **fuse** (in series) melts and opens that circuit; wet skin lowers body resistance → dangerous current (safety level).

Misconceptions to catch: "current is used up by the first bulb"; "cutting any wire kills everything" (only in series); "a short is just a normal connection"; "more resistance = more current"; "the fuse is in parallel"; "graphite is a non-metal so it can't conduct".

## Core loop

1. **Scout:** move your thief (third-person isometric, WASD/click-to-move/touch) through rooms; guards patrol with vision cones; cameras sweep.
2. **Scan:** toggle the wiring scanner (hold Tab / button) — walls go translucent and every circuit glows with live current flow (animated dots whose speed ∝ current, plus numbers on demand). Each device shows its role in a circuit you can trace back to a panel.
3. **Rewire:** at a wall panel, open a 3D close-up of the actual circuit: drag wires between terminals, insert or remove components from your bag (wire, resistor, extra battery, bulb, fuse, found conductors/insulators), cut, bridge. Changes apply to the live building immediately.
4. **Consequences in the world:** lights go dark (guards get suspicious and investigate dark rooms), lasers drop, motor doors open only with enough current, alarm loops trigger if their series current stops, fuses blow with a satisfying pop and smoke and a guard walks to the fuse box. Everything is recoverable: getting spotted sends you back to the last checkpoint with the building state intact or reset by choice.
5. **Escape** with the exhibit. Score: time, times spotted, components used, "ghost" bonus.

## Five heists + transfer (vertical slice)

1. **Lobby — closed vs open.** Open the circuit to the lobby lamp to cross in the dark; a cut wire to the camera stops it. A rubber glove vs a coin teaches insulator vs conductor to bridge a gap.
2. **Gallery of Lights — series vs parallel.** A string of display lights in series: removing one kills the whole string (and the guard notices). The corridor lights are parallel: you can kill exactly the one over your path. Rewiring a series string into parallel keeps the room lit while you steal the bulb that's actually the gem.
3. **The Alarm Loop.** A closed-loop alarm: current flows through every window sensor in series and the alarm sounds when it stops. Cutting first = instant alarm. Bridge the sensor in parallel with a wire first, then cut. Graphite pencil works as the bridge.
4. **Motor Door — Ohm's law.** A heavy door motor needs ≥ 2 A; you have a 6 V battery, a 12 V battery and resistors (3 Ω, 6 Ω, 12 Ω). Pick the combination (I = V/R); too much current blows its fuse and jams it. Gauges show V, I, R live.
5. **Blackout — short circuit and fuse.** Short the corridor circuit to blow its series fuse and black out the west wing — but the fuse box is in the guard room, so plan the timing. A puddle under a live cable is a safety hazard: crossing it with exposed wire = instant fail screen explaining wet-skin resistance (no gore).
6. **Transfer: The Vault.** No hints, new building, mixed series/parallel network with a power budget (P = V·I) and a decoy alarm loop. A memorized "always cut" or "always short" approach must fail.

## Rules to keep authoritative (pure TS + tests)

- A real circuit solver for small resistive networks (nodal analysis / Kirchhoff on a graph; ideal batteries, resistive loads, ideal wire ≈ 0.01 Ω so shorts produce large but finite current, fuses as switches that open above a rating). No fake "if series then…" special cases.
- Devices are loads with thresholds (lamp on ≥ x A, door motor ≥ 2 A, alarm triggers when its loop current < threshold).
- Every authored heist has a test for an intended solution, the advertised wrong move (e.g. cutting the alarm loop first triggers it), and constant-strategy failure.

## 3D, camera, art

- Isometric 3D cut-away camera (orthographic or narrow-FOV perspective), rooms with ceilings removed, smooth follow, rotate in 90° steps. The scanner X-ray mode is the hero moment: walls fade to glass, wires glow with moving current.
- Visual thesis: a midnight science museum — deep indigo shadows, warm exhibit spotlights, neon-cyan wiring, a Tesla coil and giant light bulb exhibits; thief in a hoodie with a headlamp. Not toy-industrial, not paper/ink.
- Tripo candidates (≤ 6): the thief (rigged, Mixamo preset: idle, sneak-walk, run, crouch, interact), a guard (rigged: patrol walk, look-around, alert), the wall panel/fuse box, 1–2 hero exhibits (giant bulb, Tesla coil), the vault door. Wires, current, gauges are procedural.

## Acceptance

First 30 seconds: the player sneaks, turns on the scanner, sees current flowing, opens a panel, cuts the right wire and watches the lamp go dark so they can pass. A mistake (guard spots you, alarm trips) is visible, funny and recoverable. Heist 3 can't be passed by cutting first. The transfer heist is solvable without hints.
