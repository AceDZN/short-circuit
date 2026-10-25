# Assets: Short Circuit (קצר)

All 3D models were generated in **Tripo Studio** (https://studio.tripo3d.ai, the user's signed-in account, existing credits only) on 25 Oct 2026, through the web UI in the user's Chrome. No API, tokens, upgrades or other accounts were used. The gameplay mockups are documented separately in `docs/visual-targets/PROMPTS.md`.

**These meshes are decorative.** They are never colliders, hit volumes or carriers of science state. Wires, current dots, gauges, lamp glow, fuse state and everything else that shows circuit state are procedural and driven by the solver. Give characters and props simple code-side colliders (capsules and boxes).

## Summary

| File | Source task | Rig / clips | Size | Triangles | Facing | Height (bbox, glTF units) |
|---|---|---|---|---|---|---|
| `public/models/thief.glb` | image→3D `a1829d52-efd6-48bc-8fa8-22cfbb78875a` | Mixamo humanoid, 66 joints. **v2 clips:** `walk` (2.33 s), `afraid` (2.58 s), `cheer` (12.08 s), `run` (1.25 s), `idle` (15.33 s) | 1,780,016 B | 19,506 | **+Z** | **1.0** (x ±0.275, z ±0.126), feet at y=0 |
| `public/models/guard.glb` | image→3D `25a002f5-6366-46db-8123-74da1c34b142` | Mixamo humanoid, 65 joints. **v2 clips:** `frightened` (3.38 s), `sit` (7.17 s), `walk` (2.33 s), `look_around` (15.58 s), `run` (1.25 s), `idle` (15.33 s), `angry_01` (3.50 s) | 2,170,688 B | 19,760 | **+Z** | **1.0** (x ±0.338, z ±0.139), feet at y=0 |
| `public/models/panel.glb` | image→3D `f8d65cb5-68b1-43f8-8c4f-3f833cbc47ba` | static | 619,864 B | 16,752 | door faces **+Z** | 1.0 (x ±0.268, z ±0.198), base at y=0 |
| `public/models/exhibit-bulb.glb` | image→3D `96d713cd-ca44-4269-847b-41711d76546a` | static | 712,404 B | 19,567 | plaque faces **+Z** (round) | 1.0 (x ±0.304, z ±0.304), base at y=0 |
| `public/models/vault-door.glb` | text→3D `6e2d0f64-65dc-4024-975d-c31671341c2f` | static | 702,364 B | 18,486 | door face **+Z** | 0.933 (x ±0.5, z ±0.180), base at y=0 |

Task pages: `https://studio.tripo3d.ai/workspace/generate/<task id>`. The rigging and animation pages use the same id under `/workspace/rigging/` and `/workspace/animate/`.

**Units.** Tripo normalizes every model so its largest bbox dimension is 1.0, so nothing is in metres. Scale in code. Suggested scales: thief ×1.7 (≈1.7 m), guard ×1.75, panel ×0.9, bulb ×2.0 (the 2 m hero exhibit), vault door ×2.5. Facing was confirmed by rendering each GLB in Blender 5.2 from the glTF +Z side. All five show their front.

**Skeleton.** Mixamo naming (`mixamorig:Hips` is the root joint, under a node named `Armature`), so Mixamo clips can be retargeted later. Clips were exported with **"Animation stay in Place" ON**, so walk has no root motion and code moves the character. Play clips with `THREE.AnimationMixer` using the names above.

## Credits

The account balance is shared with other crews running at the same time, so the balance drops shown on screen include their spending. The figures below are the displayed task costs, cross-checked against the balance right before and after each click where possible.

| Job | Displayed cost |
|---|---|
| Thief model (image→3D, H3.1, 2K PBR, 20k-tri target) | 30 |
| Guard model (image→3D) | 30 |
| Panel model (image→3D) | 30 |
| Thief Auto Rig (Humanoid, Mixamo preset) | 20 (balance 345→325) |
| Guard Auto Rig (Humanoid, Mixamo preset) | 20 (balance 225→205) |
| Giant bulb model (image→3D) | 30 (balance 205→175) |
| Vault door model (text→3D) | 30 (balance 175→145) |
| Preset animation retargets (idle, walk, run, look_around, frightened) | 0. The balance did not change when they were applied (225→225). |
| GLB exports | 0 |
| **Total for this game** | **190 credits**: 5 model generations (budget 6) + 2 rig jobs (budget 2). Account balance at finish: 145. |

## Shared generation settings

Shown in Tripo's Geometry & Texture panel, which is shared across crews. They were checked before each submit: **HD Model, AI model H3.1 "Best Quality", Ultra Mesh off, AI Complete off, Texture on, 2K texture, PBR on, Remove Lighting off, Triangle topology, polycount 20,000**, privacy "Sharing Only", no Generate-in-Parts, no 8K. Export settings: **GLB, 1K texture, Export Skeleton on, Animation stay in Place on**.

## Per-asset details

### Thief (`thief.glb`)
- **Reference image:** made in ChatGPT image generation (chat https://chatgpt.com/c/6add395f-7b94-83ed-b7cc-35705e5087a9, file "Stylized Cyber Scout Character.png", 1024×1536, sha256 `78797b68…f2a7`). Prompt:
  > Create an image: a 3D character model reference render for image-to-3D conversion. Single full-body character, front view, standing in a neutral A-pose (arms straight, angled ~40° down away from the body, legs slightly apart, feet flat), centered, whole body visible head to toe with margin, plain flat light-grey background, soft even studio lighting, no shadows on the background, no props on the floor, no text. Character: a slim teenage stealth thief for a stylized 3D heist video game (modern stylized PBR, like Fortnite / Overwatch proportions, slightly larger head and hands, NOT chibi). Dark charcoal hoodie with the hood UP, small neon-cyan accent piping on the hoodie seams and cuffs, a compact black headlamp strapped over the hood with a cyan-white lens, dark cargo joggers, black sneakers with cyan soles and laces, fingerless dark gloves, a small dark grey backpack visible at the sides with a cyan-glowing handheld wiring-scanner clipped to a strap. Face visible: friendly, clever, determined teen, neutral expression. Clean readable silhouette.
- **Tripo:** image→3D (single image), task `a1829d52-efd6-48bc-8fa8-22cfbb78875a`. Auto Rig: Humanoid, Skeleton Preset Mixamo. Preset animations applied: `idle`, `walk`.
- **Not delivered: `run`.** The `run` preset retarget was submitted, but its job sat in "Queuing/Retargeting…" for 15+ minutes, through a page reload and one free re-click. It was probably orphaned by the laptop restart that happened mid-session. The export dialog showed it as a broken third entry, and exporting with it selected did nothing, so the GLB was exported with walk + idle only. Fallbacks in code: play `walk` at about 1.6–1.8× `timeScale` for run, and a crouch pose or lowered-hips offset for sneaking.
- **No crouch, sneak, interact or hands-up presets exist** in Tripo's preset library. The closest busted reaction is `afraid` (arms raised near the face), which was not applied because the thief's job queue was stuck. Real hands-up or crouch-sneak clips would need Tripo **AI Animation** at 20 credits each, which is outside the 2-job rig budget.
- Raw: `~/Downloads/sc-thief-raw.glb`, 1,798,872 B, sha256 `3d2ec535ddb96d66572d5ef9bd8e84046d1552da0e7095ff9652d4711a035179`.
- Final: sha256 `0fd84a9854ae8fb1b81e5b42c4aea8988fd30536fa8ae5cb2d9b04ac60adb296`.

### Guard (`guard.glb`)
- **Reference image:** same chat ("Cartoon Museum Security Guard.png", sha256 `2630bacd…0e19`). Prompt:
  > Great. Now the same kind of reference render (same style, same A-pose, front view, plain flat light-grey background, whole body visible, no text) for the second character: a chunky comic museum night guard for the same stylized 3D heist game. Middle-aged, round belly, broad shoulders, short legs, big friendly mustache, sleepy-but-alert eyes. Navy blue security uniform: short-sleeve navy shirt with a gold badge and shoulder patches, navy trousers, black utility belt with a radio and keys, black boots, navy peaked cap with a gold badge. He holds a chunky black flashlight in his right hand, pointing down along his leg (arms still in A-pose). Comic and lovable, not menacing.
- **Tripo:** image→3D, task `25a002f5-6366-46db-8123-74da1c34b142`. Auto Rig: Humanoid / Mixamo. Presets applied: `walk` (patrol), `idle`, `look_around` (investigating a dark room or a "?"), `frightened` (startled "!" / alert).
- The flashlight is part of the mesh, attached to the right hand by skinning. Parent a `SpotLight` to the `mixamorig:RightHand` bone for the beam.
- Raw: `~/Downloads/sc-guard-raw.glb`, 2,297,308 B, sha256 `03939909483f4b7863056fa634fc8636a406c18b117c1794c7a71648dfddcad5`.
- Final: sha256 `63c54f33e4e5bf1ae697743b8b21f6bcf6ddc8bebae86b7c3a9c87fe3efa51f8`.

### Wall panel / fuse box (`panel.glb`)
- **Reference image:** same chat ("Weathered Electrical Panel with Hazard Markings.png", sha256 `9cd2f402…d23f`). Prompt:
  > Now a single 3D game prop reference render for image-to-3D (same stylized PBR style, 3/4 front view, centered, whole object visible, plain flat light-grey background, soft even studio lighting, no text except the sign): a wall-mounted electrical panel / fuse box for a museum heist game. Chunky rectangular grey-green painted steel cabinet (about 60 cm wide, 90 cm tall, 20 cm deep) with slightly rounded edges, rivets, a hinged front door (closed) with a small chrome handle and keyhole, a yellow-and-black diagonal hazard stripe band across the bottom of the door, a yellow triangular high-voltage lightning warning sign on the door, a small glass window showing two glowing neon-cyan indicator lights and the tops of fuses, thick black cable conduits coming out of the top into the wall. Light scuffs and wear, readable silhouette.
- **Tripo:** image→3D, task `f8d65cb5-68b1-43f8-8c4f-3f833cbc47ba`. One closed mesh, so the door does not open. The bbox includes the conduits on top. The cyan indicator lights are baked into the texture. Add an emissive sprite or point light in code if they should react to state. The panel close-up board is procedural.
- Raw: `~/Downloads/sc-panel-raw.glb`, 1,039,900 B, sha256 `0b05736d9333027ba3b82c79ccc011b5c380273bbd012cdcd561a11b06992efa`.
- Final: sha256 `48fdb99816358bd36421b754dc90c42039ccb7fc7ca7e5f0306dfa3410eb4a54`.

### Giant light bulb exhibit (`exhibit-bulb.glb`, the heist-2 target)
- **Reference image:** same chat ("Ready for an image prompt.png", 1145×1374, sha256 `be7433d3…da75`). Prompt:
  > Next prop, same reference-render style (3/4 front view slightly from above, centered, whole object visible, plain flat light-grey background, soft even studio lighting, no text): the hero museum exhibit — a GIANT antique glass light bulb, about 2 meters tall, standing upright on a round dark-wood and brass museum plinth. Clear blown-glass bulb with a few subtle reflections, a thick brass screw base, inside a big coiled tungsten filament glowing warm amber-orange, supported by thin glass stem and wires. Around the plinth base a ring of four short brass posts with a red velvet rope. A small brass plaque on the plinth front. Stylized PBR game asset, readable silhouette.
- **Tripo:** image→3D, task `96d713cd-ca44-4269-847b-41711d76546a`. The Tesla coil was skipped in favour of the bulb (heist target) and the vault door.
- **The glass is opaque.** It is one mesh with one opaque material, and the filament glow is baked into the texture. For a convincing glass look, overlay a slightly larger procedural transparent sphere (`MeshPhysicalMaterial`, transmission or low opacity) and an emissive point light at the filament, roughly at y≈0.6 of model height. Because it is one mesh, the bulb cannot be lifted off its plinth separately. For the steal, hide the whole model or swap in a procedural bulb.
- Raw: `~/Downloads/sc-bulb-raw.glb`, 1,116,756 B, sha256 `204c97325d3ea3795d730777e7ae9f708f029f8962252d458cdc4fd2b44e00c3`.
- Final: sha256 `a4aa76975720fd0033c49006a9b86fb6f3b9a8a94d60d7ee2ea20389c43f083d`.

### Vault door (`vault-door.glb`, optional)
- **Tripo text→3D**, task `6e2d0f64-65dc-4024-975d-c31671341c2f`. Prompt:
  > A round museum bank-vault door, stylized PBR game asset, front view: a thick circular brushed-steel vault door about 2.5 m in diameter set in a square dark steel frame, big chrome spoked wheel handle in the center, ring of large bolts around the rim, heavy hinge on one side, brass combination dial, subtle yellow-black hazard stripe on the frame base, light wear and scratches. Clean readable silhouette, no background.
- Door and frame are one mesh and cannot swing. To open it, slide or fade it in code, or put a procedural disc in front.
- Raw: `~/Downloads/sc-vault-raw.glb`, 1,141,288 B, sha256 `ce1179765406bc20e8cdb0fc1ca97f5b531cbfb56311d54b841ad9fdad46fc3b`.
- Final: sha256 `126f6b03c99875c9b33705d45a0644043eca3075038161b7c1dd7c2a3b77c286`.

## Processing

The raw Tripo exports were already small (1–2.3 MB, 1K JPEG textures), so no decimation was needed and every mesh keeps its full ~17–20k triangles. Each file went through these steps:

```sh
npx --yes @gltf-transform/cli dedup  raw/sc-<name>-raw.glb a.glb
npx --yes @gltf-transform/cli prune  a.glb b.glb --keep-attributes true
npx --yes @gltf-transform/cli webp   b.glb public/models/<final>.glb --quality 85
```

- Textures are 1024² WebP (`EXT_texture_webp`), which `GLTFLoader` reads natively. No Draco or Meshopt is used, so no decoder setup is needed.
- Verified afterwards with `gltf-transform inspect` and a Blender 5.2 headless import. Thief: 1 skin, 66 joints, clips `walk` and `idle`. Guard: 1 skin, 65 joints, clips `frightened`, `walk`, `look_around`, `idle`. Blender import plus a render from the +Z side confirmed the facing for all five.
- Raw downloads stay in `~/Downloads` (`sc-*-raw.glb`) and are not in the repo. Working copies are in the session scratchpad.

## Second pass: 25 Oct 2026, afternoon (animations)

The user asked to "make sure you use good 3d models". The coordinator asked for more clips on the existing rigs plus up to 4 new hero models.

**Balance at the start of this pass: 25 credits** (shared pool, drained by other crews since the first pass ended at 145). That is below the ~40 floor set for new generations, so **no new models were generated**. The Tesla coil, security camera, dynamo and reception desk remain to do; see the follow-ups below. AI Animation (20 credits per clip) was not used either, since it would nearly empty the shared pool.

Preset retargets were confirmed free again: Tripo shows no price on preset cards, and the balance read 25 before and after every click. Exports are free. **Credits spent this pass: 0. Balance left: 25.**

### Thief re-export (`thief.glb`, v2)
- The `run` retarget that stalled in the first pass had completed by this session, so no extra job was needed.
- Presets added: `afraid` (arms up near the face, the closest preset to a busted surrender) and `cheer` (both arms raised overhead in a victory pump; its opening seconds also read as hands-up).
- **Tripo's preset library has no sneak, crouch-walk, surrender or hands-up clip.** The full list was checked: afraid, agree, angry_01–03, basketball_shot, bow, box_01–03, cast_a_spell, cheer, chop, clap, climb, complain_01/02, crossover_dribble, cry, dance_01–06, defeat, defeat_02, depressed, dig, dive, dribble, fall, fire, flee_01/02, flip, fold_arms, football_*, freaky, frightened, front_kick_01/02, frustrated_01/02, greet_01–04, heart_pose, hit_to_*, hug, idle, jump_down, jump, jump_rope_01/02, laugh_01/02, lift_heavy, look_around, make_a_call_01/02, pitch_baseball, play_mobile_game, play_video_game, press-up, run, run_upstairs, scared_01/02, stretch, shoot, shovel, sing_01–04, sit, slash, sob, standing_relax, surf, swagger, swim, turn, volleyball, wait, walk, warm_up, wave_goodbye_01/02. A sneak clip needs AI Animation (20 credits) or stays procedural (crouch offset plus a slowed `walk`).
- Export: GLB, 1K, skeleton on, "Animation stay in Place" on, all 5 clips selected. File name `sc-thief-v2-raw`.
- **Clips (exact names, glTF order):** `walk` (2.33 s), `afraid` (2.58 s), `cheer` (12.08 s), `run` (1.25 s), `idle` (15.33 s).
- Raw: `~/Downloads/sc-thief-v2-raw.glb`, 2,245,304 B, sha256 `0f1ef9b7b4e9d6ee1e14ad9d3860767dfc2f55ea41a4d539eafe7172ea72d98a`.
- Final `public/models/thief.glb`: 1,780,016 B, sha256 `ed6a80103d5c429bab463cb27d3c0f506e4b178e633f1c482b74d91dcda24907`, 19,506 tris, 1 skin / 66 joints, WebP 1024 ×3. Facing +Z, height 1.0, as before.

### Guard re-export (`guard.glb`, v2)
- Presets added: `run`, `angry_01` (arms flared out in a "Hey!" stance, used as the angry/alert reaction; there is no pointing preset), and `sit` (seated idle on an invisible chair, made for the reception desk; Tripo's `sit` includes a lean-on-hand idle).
- The `run` retarget sat in Tripo's queue for about 15 minutes before completing. The queue appears to be shared across the account, so other crews' jobs come first.
- Export: same settings, all 7 clips. File name `sc-guard-v2-raw`.
- **Clips (exact names, glTF order):** `frightened` (3.38 s), `sit` (7.17 s), `walk` (2.33 s), `look_around` (15.58 s), `run` (1.25 s), `idle` (15.33 s), `angry_01` (3.50 s).
- Raw: `~/Downloads/sc-guard-v2-raw.glb`, 2,661,636 B, sha256 `43ea66d550dffbe2c49ff65990a812f76ef4132094808e4405faef179d08393c`.
- Final `public/models/guard.glb`: 2,170,688 B, sha256 `2016361f6cd72aa73d9ef6559a14c6b505493a61705c1657543a4169f5f30473`, 19,760 tris, 1 skin / 65 joints, WebP 1024 ×3. Facing +Z, height 1.0, as before.

### Processing (v2, unchanged pipeline)
`gltf-transform dedup` → `prune --keep-attributes true` → `webp --quality 85`. Verified with a GLB JSON check (skins, joints, clip names and durations, WebP images) and a Blender 5.2 import:
- thief actions `afraid, cheer, idle, run, walk`
- guard actions `angry_01, frightened, idle, look_around, run, sit, walk`
- both with an Armature modifier present

All clips are in-place (no root motion). `run` is a 1.25 s loop, so drive the movement speed in code (~3.5–4 m/s after scaling).

## Known gaps / follow-ups

1. **New hero models not generated (credits).** Tesla coil (`tesla-coil.glb`), wall security camera (`security-camera.glb`, lens +Z), dynamo exhibit (`dynamo.glb`), and curved reception desk (`reception-desk.glb`, ~3 m wide, front +Z). Each costs ~30 credits as image→3D. The balance is 25, so at least ~120 is needed for all four. The ChatGPT reference-image → Tripo image→3D flow above is ready to reuse once credits exist.
2. No sneak/crouch or true surrender clip: AI Animation is 20 credits each, or keep these procedural.
3. The bulb glass and the panel indicator lights are baked and opaque. The code overlays described above are needed for the scanner and alarm looks.

## In-game use (lead)

- `thief.glb` / `guard.glb` are loaded with `GLTFLoader`, cloned with `SkeletonUtils`, normalized to 1.95 m and 2.1 m (stylized and slightly oversized for readability from the isometric camera), facing +Z. Clips are chosen by name: idle → `idle`; walking → `walk`; running → `run`; thief caught → `afraid`; thief escapes → `cheer`; guard looking around → `look_around`; guard noticing the thief → `angry_01`; post guards (heists 1 and 5) → `sit` on a procedural office chair. A procedural character is shown until the GLB loads, and stays if loading fails.
- A procedural hands-up / cheer arm pose (rotating the `mixamorigLeftArm/RightArm/ForeArm` bones after the mixer update) remains as a fallback only for rigs without `afraid`/`cheer` clips.
- `panel.glb` replaces the procedural wall-panel box (fitted to 0.95 m); the cyan LED strip stays procedural so it can pulse when the panel is usable.
- `exhibit-bulb.glb` is the heist-2 gem and the heist-5 exhibit (fitted to 1 m on a pedestal); its filament glow and halo are procedural and follow the solved current through the gem part.
- `vault-door.glb` spans both vault-door tiles in heist 6 and rides the procedural motor-door slab up when the motor current is high enough.
- No generated mesh is a collider or carries science state.
