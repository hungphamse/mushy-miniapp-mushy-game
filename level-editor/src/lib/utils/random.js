export const RNG_ALGORITHM_VERSION = 'mulberry32-hash31-v1';

export function hashSeed(seed) {
  const value = String(seed);
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(31, hash) + value.charCodeAt(index) | 0;
  }

  return hash >>> 0;
}

export function seededRandom(seed) {
  let state = hashSeed(seed);

  return function random() {
    state |= 0;
    state = state + 0x6D2B79F5 | 0;
    let next = Math.imul(state ^ state >>> 15, 1 | state);
    next = next + Math.imul(next ^ next >>> 7, 61 | next) ^ next;
    return ((next ^ next >>> 14) >>> 0) / 4294967296;
  };
}
