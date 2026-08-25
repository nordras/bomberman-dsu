import { DSU } from './dsu.js';
import { BRICK, blocksBlast } from './tiles.js';

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/**
 * Celulas atingidas por uma bomba, parando em parede e apos o primeiro tijolo.
 * @param {Uint8Array} tiles
 * @param {number} cols
 * @param {number} rows
 * @param {number} origin indice linear da bomba
 * @param {number} range alcance em celulas por direcao
 * @returns {number[]} indices atingidos (inclui a propria origem)
 */
export function blastTiles(tiles, cols, rows, origin, range) {
  const out = [origin];
  const ox = origin % cols;
  const oy = (origin / cols) | 0;

  for (const [dx, dy] of DIRS) {
    for (let step = 1; step <= range; step++) {
      const x = ox + dx * step;
      const y = oy + dy * step;
      if (x < 0 || y < 0 || x >= cols || y >= rows) break;
      const i = y * cols + x;
      if (blocksBlast(tiles[i])) break;
      out.push(i);
      if (tiles[i] === BRICK) break; // tijolo absorve o resto da chama
    }
  }
  return out;
}

/**
 * Igual a `blastTiles`, mas descreve tambem *que parte* da cruz cada celula e.
 * E geometria pura (nao desenha nada); quem renderiza traduz para sprites.
 *
 * @param {Uint8Array} tiles
 * @param {number} cols
 * @param {number} rows
 * @param {number} origin
 * @param {number} range
 * @returns {{index:number, axis:'c'|'h'|'v', tip:number}[]}
 *   `axis` 'c' e o centro; `tip` e 0 no meio da haste, ou +1/-1 na ponta,
 *   indicando o sentido (direita/baixo = +1).
 */
export function blastCells(tiles, cols, rows, origin, range) {
  const out = [{ index: origin, axis: 'c', tip: 0 }];
  const ox = origin % cols;
  const oy = (origin / cols) | 0;

  for (const [dx, dy] of DIRS) {
    const axis = dx !== 0 ? 'h' : 'v';
    const sign = dx + dy; // +1 para direita/baixo, -1 para esquerda/cima
    for (let step = 1; step <= range; step++) {
      const x = ox + dx * step;
      const y = oy + dy * step;
      if (x < 0 || y < 0 || x >= cols || y >= rows) break;
      const i = y * cols + x;
      if (blocksBlast(tiles[i])) break;

      // e ponta quando acabou o alcance, quando o proximo passo bate em
      // parede/borda, ou quando esta celula e um tijolo (que absorve a chama)
      const nx = x + dx;
      const ny = y + dy;
      const nextBlocked = nx < 0 || ny < 0 || nx >= cols || ny >= rows
        || blocksBlast(tiles[ny * cols + nx]);
      const isTip = step === range || nextBlocked || tiles[i] === BRICK;

      out.push({ index: i, axis, tip: isTip ? sign : 0 });
      if (tiles[i] === BRICK) break;
    }
  }
  return out;
}

/**
 * Agrupa bombas que se detonam em cadeia, usando DSU.
 *
 * Duas bombas ficam no mesmo conjunto quando o raio de uma alcanca a posicao
 * da outra. A transitividade sai de graca: A pega B, B pega C => A, B e C
 * explodem juntas mesmo que A nunca alcance C diretamente.
 *
 * @param {{index:number, range:number}[]} bombs
 * @param {Uint8Array} tiles
 * @param {number} cols
 * @param {number} rows
 * @param {object} [opts] repassado ao construtor da DSU (ex.: `{trace:true}`)
 * @returns {DSU} conjuntos indexados pela posicao de `bombs`
 */
export function chainGroups(bombs, tiles, cols, rows, opts) {
  const dsu = new DSU(bombs.length, opts);
  const byTile = new Map();
  bombs.forEach((b, i) => byTile.set(b.index, i));

  bombs.forEach((b, i) => {
    for (const t of blastTiles(tiles, cols, rows, b.index, b.range)) {
      const j = byTile.get(t);
      if (j !== undefined && j !== i) dsu.union(i, j);
    }
  });
  return dsu;
}
