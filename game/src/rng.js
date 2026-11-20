// Solmar Bay — deterministic randomness (v2).
//
// The city, the traffic and the staged screenshot scenes are all dealt from
// one mulberry32 stream, so a given seed always deals the same bay: same
// buildings, same palms, same shells. Math.random is only ever used for
// things that are allowed to differ run to run (fare payouts, walk phases).

/** mulberry32: a small, fast, seedable PRNG. Returns floats in [0, 1). */
export function mulberry32(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) | 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), 1 | t);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Integer in [min, max], both ends included, from a seeded stream. */
export function randInt(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}

/** Float in [min, max) from a seeded stream. */
export function randRange(rng, min, max) {
  return min + rng() * (max - min);
}

/** One element of an array, chosen by a seeded stream. */
export function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

/** True with probability p, rolled on a seeded stream. */
export function chance(rng, p) {
  return rng() < p;
}

/** A shuffled copy of an array (the original is left alone). */
export function shuffle(rng, arr) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}
