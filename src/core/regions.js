import { DSU } from './dsu.js';
import { isSolid } from './tiles.js';

/**
 * Componentes conexas do chao livre, via DSU.
 *
 * Nota importante sobre DSU: ela so sabe *unir*. Como colocar uma bomba ou
 * uma parede "separa" uma componente (split), nao da para atualizar a
 * estrutura incrementalmente -- reconstruimos do zero. Num grid 15x13 isso
 * custa ~200 unions, ou seja, nada. Esse `blocked` e justamente o caso que
 * expoe a limitacao: cada bomba plantada invalida a estrutura inteira.
 *
 * @param {Uint8Array} tiles
 * @param {number} cols
 * @param {number} rows
 * @param {object} [opts]
 * @param {boolean} [opts.trace] liga o log de unions na DSU
 * @param {Set<number>} [opts.blocked] celulas livres que mesmo assim bloqueiam
 *   a passagem (bombas, por exemplo)
 * @returns {DSU} DSU sobre todos os indices do grid (celulas solidas ficam
 *   isoladas em componentes de tamanho 1 e devem ser ignoradas)
 */
export function walkableRegions(tiles, cols, rows, { trace = false, blocked } = {}) {
  const dsu = new DSU(cols * rows, { trace });
  const solid = blocked
    ? (i) => isSolid(tiles[i]) || blocked.has(i)
    : (i) => isSolid(tiles[i]);

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      if (solid(i)) continue;
      if (x + 1 < cols && !solid(i + 1)) dsu.union(i, i + 1);
      if (y + 1 < rows && !solid(i + cols)) dsu.union(i, i + cols);
    }
  }
  return dsu;
}

/**
 * O destino e alcancavel a partir da origem andando so por chao livre?
 * @param {Uint8Array} tiles
 * @param {number} cols
 * @param {number} rows
 * @param {number} from indice linear
 * @param {number} to indice linear
 * @param {object} [opts] mesmas opcoes de `walkableRegions`
 * @returns {boolean}
 */
export function isReachable(tiles, cols, rows, from, to, opts) {
  if (isSolid(tiles[from]) || isSolid(tiles[to])) return false;
  if (opts?.blocked?.has(from) || opts?.blocked?.has(to)) return false;
  return walkableRegions(tiles, cols, rows, opts).connected(from, to);
}
