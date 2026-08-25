/**
 * PRNG deterministico (mulberry32). Mesma seed => mesmo mapa,
 * o que torna a geracao testavel e reproduzivel.
 * @param {number} seed
 * @returns {() => number} funcao que devolve float em [0, 1)
 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Fisher-Yates in-place usando o rng fornecido.
 * @template T
 * @param {T[]} arr
 * @param {() => number} rng
 * @returns {T[]} o proprio array, embaralhado
 */
export function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
