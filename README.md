# VoxelCraft

A browser-based, Minecraft-style voxel game built **from scratch** with HTML5, CSS3
and vanilla JavaScript (ES2024). No frameworks, no Three.js/Babylon, no build step —
the entire renderer, physics, world generation and UI are hand-written.

## Run it

Just open `index.html` in a modern browser (Chrome, Edge, Firefox). No server, no
install. Everything (textures, sounds) is generated procedurally at runtime, so there
are no external assets to load.

> Tip: a WebGL-capable browser is required. Click the canvas to lock the mouse.

## Controls

| Action | Key |
| --- | --- |
| Move | `W` `A` `S` `D` |
| Jump / swim up | `Space` |
| Run / descend (fly) | `Shift` |
| Look | Mouse |
| Break / attack | Left click (hold to break) |
| Place / use | Right click |
| Select hotbar | Mouse wheel or `1`–`9` |
| Inventory & crafting | `E` |
| Toggle fly | `F` |
| Debug overlay | `F3` |
| Pause / menu | `Esc` |

## Features

- **Engine:** custom WebGL renderer, projection/view matrices, vertex & index
  buffers, procedural texture atlas, back-face + frustum culling, fog.
- **World:** infinite procedural terrain (Perlin/fBm), biomes, mountains, valleys,
  beaches, seas, 3D-noise caves, ore distribution and trees.
- **Chunks:** 16×128×16 chunks streamed around the player with budgeted generation,
  meshing and unloading. Includes both a culled mesher and a greedy mesher.
- **Lighting:** flood-fill skylight + block light (torches) with ambient occlusion.
- **Gameplay:** breaking (hardness + progress + particles), placing (face-aware,
  collision-checked), block drops, survival health/hunger with fall & starvation
  damage, creative mode with flight.
- **Physics:** gravity, swept AABB collision, jumping, swimming, auto-step for mobs.
- **Entities:** passive animals (cow, pig, chicken, sheep) and hostile mobs
  (zombie, skeleton, spider) with wander/chase/attack AI, day/night spawning.
- **Inventory & crafting:** hotbar, stacking, drag-and-drop, 2×2 and 3×3 recipes.
- **Day/night:** animated sky gradient, sun/moon-driven light level, in-game clock.
- **Weather:** clear / rain / storm with overlay particles and ambient audio.
- **Audio:** fully synthesized SFX and ambient music via the Web Audio API.
- **Saving:** chunks (run-length encoded), player, inventory, time and weather
  persisted to IndexedDB (with a localStorage fallback).

## Project structure

```
index.html        entry point, loads modules in dependency order
style.css         HUD / menu / inventory styling
main.js           game bootstrap, loop, day/night, weather, interaction, saving
engine/
  math.js         mat4 / vec3 helpers
  noise.js        seedable Perlin / fBm noise
  block.js        block registry + procedural texture atlas
  camera.js       first-person camera + frustum
  input.js        keyboard / mouse / pointer lock
  renderer.js     WebGL programs, buffers, draw passes
  chunk.js        chunk storage (blocks + light)
  lighting.js     skylight + block-light flood fill
  mesher.js       culled mesher with AO
  greedyMesher.js greedy quad-merging mesher
  world.js        terrain / caves / ores / trees + block accessor
  chunkManager.js streaming, remeshing, culled rendering
  collision.js    AABB voxel collision
  physics.js      gravity / integration constants
shaders/
  voxel.glsl.js   GLSL sources (voxel, sky, entity)
entities/
  player.js       movement, raycast, stats
  mob.js          base mob (AI + physics + cuboid rendering)
  animal.js       passive animals
  zombie.js       hostile mobs
inventory.js      hotbar + storage + stacking
crafting.js       shaped / shapeless recipes
save.js           IndexedDB persistence
audio.js          Web Audio SFX + music
ui.js             HUD, menus, inventory screen
```

All modules attach to a single global `MC` namespace and load as ordered classic
scripts, which keeps the game runnable directly from the filesystem (`file://`)
without a bundler or module server.
