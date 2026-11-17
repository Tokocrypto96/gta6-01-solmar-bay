// Solmar Bay — tiny deterministic RNG (mulberry32) so the city, the traffic and the
// screenshot scenes are the same for the same seed, every run.
/** A seeded random function returning floats in [0, 1). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Integer in [min, max] from a seeded rng. */
export function randInt(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}

/** One element of an array, from a seeded rng. */
export function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

/** Float in [min, max) from a seeded rng. */
export function randRange(rng, min, max) {
  return min + rng() * (max - min);
}

/** True with probability p (0..1) from a seeded rng. */
export function chance(rng, p) {
  return rng() < p;
}

/** Shuffle a copy of an array in place order, from a seeded rng. */
export function shuffle(rng, arr) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
