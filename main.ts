// Solmar Bay — entry program for make.fun gta6-01 (Node 22, stdlib only).
//
// The game itself is a folder of static files: game/index.html, its ES
// modules under game/src/, and three.js vendored at game/vendor/. This
// program is the hand-in. It verifies the folder against the gate's caps
// (and against a small manifest of files the game cannot boot without),
// copies game/ and screenshots/ into the output directory, and writes
// dossier.json with the kit's buildDossier library so the judge reads
// exactly the bytes that were built. No install step, no network, no
// generated content: two runs hand in identical bytes.

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The gate's caps, checked here so a bad hand-in fails on this machine
// instead of at the scorer: game/ at most 993 entries and 48 MiB in
// total, game/index.html at most 1 MiB on its own, screenshots/ holding
// 3-4 images of at most 256 KiB each, dossier text at most 160 KiB.
const GAME_MAX_FILES = 993;
const GAME_MAX_BYTES = 48 * 1024 * 1024;
const INDEX_MAX_BYTES = 1024 * 1024;
const SHOT_MIN = 3;
const SHOT_MAX = 4;
const SHOT_MAX_BYTES = 256 * 1024;
const DOSSIER_TEXT_MAX = 163840;

// Files the game cannot start without. The caps above would happily pass
// a folder that is merely small; this manifest is what makes it Solmar Bay.
const REQUIRED_GAME_FILES = [
  'index.html',
  'src/main.js',
  'src/city.js',
  'src/hud.js',
  'src/missions.js',
  'src/vehicles.js',
  'src/pedestrians.js',
  'src/player.js',
  'src/police.js',
  'vendor/three.module.min.js',
];

/** Count entries (files + directories) and bytes under a directory tree. */
function measureTree(dir) {
  let entries = 0;
  let bytes = 0;
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, name.name);
    // The gate refuses symlinks outright — fail here, not at the scorer.
    if (name.isSymbolicLink()) throw new Error(`game/ holds a symlink: ${path}`);
    entries += 1; // every entry counts toward the gate's total
    if (name.isDirectory()) {
      const sub = measureTree(path);
      entries += sub.entries;
      bytes += sub.bytes;
    } else if (name.isFile()) {
      entries += 1;
      bytes += statSync(path).size;
    }
  }
  return { entries, bytes };
}

/* ---------------- Verify ---------------- */

const gameDir = join(here, 'game');
const shotDir = join(here, 'screenshots');

for (const rel of REQUIRED_GAME_FILES) {
  if (!existsSync(join(gameDir, rel))) throw new Error(`game/${rel} is missing — the game cannot boot without it`);
}
const indexSize = statSync(join(gameDir, 'index.html')).size;
if (indexSize > INDEX_MAX_BYTES) {
  throw new Error(`game/index.html is ${indexSize} bytes, over the 1 MiB cap`);
}
const gameSize = measureTree(gameDir);
if (gameSize.entries > GAME_MAX_FILES) {
  throw new Error(`game/ has ${gameSize.entries} entries, over the ${GAME_MAX_FILES} cap`);
}
if (gameSize.bytes > GAME_MAX_BYTES) {
  throw new Error(`game/ is ${gameSize.bytes} bytes, over the 48 MiB cap`);
}

let shotCount = 0;
if (existsSync(shotDir)) {
  const shots = readdirSync(shotDir).filter((n) => !n.startsWith('.'));
  shotCount = shots.length;
  if (shots.length < SHOT_MIN || shots.length > SHOT_MAX) {
    throw new Error(`screenshots/ holds ${shots.length} images, need ${SHOT_MIN} or ${SHOT_MAX}`);
  }
  for (const shot of shots) {
    const size = statSync(join(shotDir, shot)).size;
    if (size > SHOT_MAX_BYTES) {
      throw new Error(`screenshots/${shot} is ${size} bytes, over the 256 KiB cap`);
    }
  }
}

/* ---------------- Hand in ---------------- */

mkdirSync(out, { recursive: true });
cpSync(gameDir, join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(shotDir)) cpSync(shotDir, join(out, 'screenshots'), { recursive: true });

writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: DOSSIER_TEXT_MAX,
    screenshots: { max: SHOT_MAX, max_bytes: SHOT_MAX_BYTES },
    game_max_files: GAME_MAX_FILES,
    game_max_bytes: GAME_MAX_BYTES,
    game_path_max_bytes: 1000,
  }),
);

console.log(
  `Solmar Bay v2 handed in: game/ (${gameSize.entries} entries, ${gameSize.bytes} bytes) + ${shotCount} screenshots -> ${out}`,
);
