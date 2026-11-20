// Solmar Bay — tuning constants for the whole game (v2).
//
// Everything that more than one module needs to agree on lives here: the
// street grid's dimensions, the prices at the shops, the economy of the
// golden shells and taxi fares, and the rank ladder the HUD climbs as Jay
// earns. One definition each — no magic numbers scattered through the code.

/* ------------------------------------------------------------------ */
/* Street grid                                                         */
/* ------------------------------------------------------------------ */

/** Metres between the centrelines of two neighbouring streets. */
export const PITCH = 58;
/** Half the width of the asphalt itself. */
export const ROAD_HALF = 7;
/** Half the width of the road plus its sidewalks. */
export const WALK_HALF = 11;
/** Streets run at k * PITCH for k in -3..3, so seven each way. */
export const ROAD_COUNT = 7;
/** Half-extent of the built city: the outer sidewalk edge. */
export const CITY_HALF = 3 * PITCH + WALK_HALF; // 185
/** South of this line the pavement gives way to sand. */
export const BEACH_Z = CITY_HALF + 6;
/** The water starts here; the sand strip sits between BEACH_Z and OCEAN_Z. */
export const OCEAN_Z = BEACH_Z + 26;
/** Traffic that drives past this radius is wrapped back into the city. */
export const DRIVE_LIMIT = CITY_HALF + 2;
/** World seed used unless the URL carries ?seed=. */
export const DEFAULT_SEED = 20261117;

/* ------------------------------------------------------------------ */
/* Economy                                                             */
/* ------------------------------------------------------------------ */

/** Cash in Jay's pocket at the start of a new game. */
export const START_CASH = 120;
/** Ironworks Gun Shop asking price for the pistol. */
export const PISTOL_PRICE = 400;
/** What the Fixer charges to wipe one wanted star. */
export const BRIBE_PER_STAR = 250;
/** Paint shop respray + repair bill. */
export const REPAIR_PRICE = 150;
/** Solmar General's treatment bill. */
export const HEAL_PRICE = 100;
/** Golden shells hidden around the city, and what each one pays. */
export const SHELL_COUNT = 20;
export const SHELL_REWARD = 75;
/** Taxi fare payout window, rolled per drop-off. */
export const FARE_PAY_MIN = 60;
export const FARE_PAY_MAX = 99;
/** Seconds of play between autosaves. */
export const AUTOSAVE_SECONDS = 15;
/** The wanted ladder tops out at five stars. */
export const MAX_STARS = 5;

/* ------------------------------------------------------------------ */
/* Rank ladder (the HUD's RP bar)                                      */
/* ------------------------------------------------------------------ */

/**
 * Street ranks, lowest first. `rp` is the lifetime earnings (totalEarned)
 * at which the rank is reached: every dollar Jay banks — jobs, fares,
 * shells — is also a point of reputation.
 */
export const RANKS = [
  { name: 'Dock Rat', rp: 0 },
  { name: 'Runner', rp: 300 },
  { name: 'Wheelman', rp: 800 },
  { name: 'Fixer', rp: 1600 },
  { name: 'Shot Caller', rp: 2800 },
  { name: 'Bay Legend', rp: 4500 },
  { name: 'King of the Bay', rp: 7000 },
];

/**
 * Where a lifetime-earnings figure sits on the ladder:
 * { level (1-based), name, into, span, progress 0..1, next (name or null) }.
 */
export function rankFor(rp) {
  let idx = 0;
  for (let i = 0; i < RANKS.length; i += 1) {
    if (rp >= RANKS[i].rp) idx = i;
  }
  const cur = RANKS[idx];
  const next = RANKS[idx + 1] ?? null;
  const into = rp - cur.rp;
  const span = next ? next.rp - cur.rp : 1;
  return {
    level: idx + 1,
    name: cur.name,
    into,
    span,
    progress: next ? Math.min(1, into / span) : 1,
    next: next ? next.name : null,
  };
}

/* ------------------------------------------------------------------ */
/* Palettes                                                            */
/* ------------------------------------------------------------------ */

/** Traffic paint: sun-bleached brights and a few sober fleet colours. */
export const CAR_COLORS = [
  0xc0392b, 0x2471a3, 0xf1c40f, 0x2e4053, 0x7d3c98, 0x17a589, 0xd35400,
  0x95a5a6, 0x1abc9c, 0x922b21, 0x5d6d7e, 0xb7950b, 0x6c3483, 0xe67e22,
  0xf5eeda, 0x273746, 0xca6f1e, 0x148f77,
];
/** Model names the speedometer shows for the car Jay is driving. */
export const CAR_NAMES = [
  'Vortex GT', 'Comet LX', 'Harbor Cruiser', 'Sunset Coupe', 'Bay Runner',
  'Palma Van', 'Dune Buggy', 'Marlin S', 'Coral Sedan', 'Tropic Truck',
  'Estero Wagon', 'Vice Roadster',
];
/** Pedestrian shirt colours — boardwalk bright. */
export const PED_COLORS = [
  0xe74c3c, 0x3498db, 0x2ecc71, 0xf39c12, 0x9b59b6, 0x1abc9c,
  0xecf0f1, 0xfd79a8, 0x00cec9, 0x6c5ce7, 0xe17055, 0x00b894,
  0xff7675, 0x74b9ff, 0xffeaa7, 0x55efc4,
];
