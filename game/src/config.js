// Solmar Bay — world constants. One source of truth for sizes the city builder,
// the traffic, the pedestrians and the minimap all agree on.
/** Distance between two neighbouring road centrelines, in metres. */
export const PITCH = 58;
/** Road half-width (asphalt), in metres. */
export const ROAD_HALF = 7;
/** Sidewalk half-width beyond the asphalt. */
export const WALK_HALF = 11;
/** Number of roads each way (roads at k * PITCH for k in -3..3). */
export const ROAD_COUNT = 7;
/** City half-extent (outer sidewalk edge). */
export const CITY_HALF = 3 * PITCH + WALK_HALF; // 185
/** South edge: the beach starts here, the ocean beyond it. */
export const BEACH_Z = CITY_HALF + 6;
/** Ocean plane starts here. */
export const OCEAN_Z = BEACH_Z + 26;
/** How far a car may drive before the world wraps it back (keeps traffic inside). */
export const DRIVE_LIMIT = CITY_HALF + 2;
/** Seeded default world seed (URL ?seed= overrides it). */
export const DEFAULT_SEED = 20261117;
/** Money the player starts with on a new game. */
export const START_CASH = 120;
/** Pistol price at Ironworks Gun Shop. */
export const PISTOL_PRICE = 400;
/** Bribe price per wanted star at the Fixer. */
export const BRIBE_PER_STAR = 250;
/** Car repair price at the paint shop. */
export const REPAIR_PRICE = 150;
/** How many golden shells are hidden around the city. */
export const SHELL_COUNT = 20;
/** Shell pickup reward. */
export const SHELL_REWARD = 75;
/** Hospital treatment price (was a magic 100 in the shop code). */
export const HEAL_PRICE = 100;
/** Taxi fare payout range. */
export const FARE_PAY_MIN = 60;
export const FARE_PAY_MAX = 99;
/** Autosave interval while playing, in seconds. */
export const AUTOSAVE_SECONDS = 15;
/** Highest wanted level. */
export const MAX_STARS = 5;

/** Colour palette for traffic cars (sun-soaked, slightly desaturated). */
export const CAR_COLORS = [
  0xc0392b, 0x2471a3, 0xf1c40f, 0x2e4053, 0x7d3c98, 0x17a589, 0xd35400,
  0x95a5a6, 0x1abc9c, 0x922b21, 0x5d6d7e, 0xb7950b, 0x6c3483, 0xe67e22,
];
/** Names the game gives its cars, shown in the speedometer. */
export const CAR_NAMES = [
  'Vortex GT', 'Comet LX', 'Harbor Cruiser', 'Sunset Coupe', 'Bay Runner',
  'Palma Van', 'Dune Buggy', 'Marlin S', 'Coral Sedan', 'Tropic Truck',
];
/** Pedestrian shirt colours. */
export const PED_COLORS = [
  0xe74c3c, 0x3498db, 0x2ecc71, 0xf39c12, 0x9b59b6, 0x1abc9c,
  0xecf0f1, 0xfd79a8, 0x00cec9, 0x6c5ce7, 0xe17055, 0x00b894,
];
