// Solmar Bay — entry program for make.fun gta6-01 (Node 22, standard library only).
//
// The game lives in game/ as plain static files: game/index.html plus its ES modules,
// three.js vendored as game/vendor/three.module.min.js, no network request anywhere.
// This program hands the entry in: it copies game/ and screenshots/ from beside this
// file into /output (or MAKEFUN_OUTPUT_DIR outside the grader) and writes
// /output/dossier.json with the kit's buildDossier library, so the judge reads the
// game exactly as it was built. It does nothing else: no install, no network, no
// generated files, so both grader runs write identical bytes.

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Gate caps from the kit's reference/gate.json, enforced here so a bad entry is
// refused locally instead of at the scorer: game/ at most 993 entries and 48 MiB,
// screenshots at most 4 files of 256 KiB each, dossier text at most 160 KiB.
const GAME_MAX_FILES = 993;
const GAME_MAX_BYTES = 48 * 1024 * 1024;
const SHOT_MAX = 4;
const SHOT_MAX_BYTES = 256 * 1024;

function countEntries(dir) {
  let files = 0;
  let bytes = 0;
  for (const name of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, name.name);
    if (name.isDirectory()) {
      const sub = countEntries(path);
      files += sub.files;
      bytes += sub.bytes;
    } else if (name.isFile()) {
      files += 1;
      bytes += statSync(path).size;
    }
    files += 1; // the directory entry itself counts toward the gate's total
  }
  return { files, bytes };
}

const gameDir = join(here, 'game');
const shotDir = join(here, 'screenshots');
if (!existsSync(join(gameDir, 'index.html'))) throw new Error('game/index.html is missing');
const gameSize = countEntries(gameDir);
if (gameSize.files > GAME_MAX_FILES) throw new Error(`game/ has ${gameSize.files} entries, over the 993 cap`);
if (gameSize.bytes > GAME_MAX_BYTES) throw new Error(`game/ is ${gameSize.bytes} bytes, over the 48 MiB cap`);
if (existsSync(shotDir)) {
  const shots = readdirSync(shotDir).filter((n) => !n.startsWith('.'));
  if (shots.length < 3 || shots.length > SHOT_MAX) throw new Error(`screenshots/ holds ${shots.length} images, need 3 or 4`);
  for (const shot of shots) {
    const size = statSync(join(shotDir, shot)).size;
    if (size > SHOT_MAX_BYTES) throw new Error(`screenshots/${shot} is ${size} bytes, over the 256 KiB cap`);
  }
}

mkdirSync(out, { recursive: true });
cpSync(gameDir, join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(shotDir)) cpSync(shotDir, join(out, 'screenshots'), { recursive: true });

writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: SHOT_MAX, max_bytes: SHOT_MAX_BYTES },
    game_max_files: GAME_MAX_FILES,
    game_max_bytes: GAME_MAX_BYTES,
    game_path_max_bytes: 1000,
  }),
);

console.log(`Solmar Bay handed in: game/ (${gameSize.files} entries, ${gameSize.bytes} bytes) + screenshots/ -> ${out}`);
