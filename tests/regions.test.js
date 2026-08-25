import { describe, it, expect } from 'vitest';
import { walkableRegions, isReachable } from '../src/core/regions.js';
import { EMPTY, WALL } from '../src/core/tiles.js';

const cols = 5;
const rows = 5;
const at = (x, y) => y * cols + x;

/** corredor horizontal de 1 celula de altura, em y=2 */
function corredor() {
  const t = new Uint8Array(cols * rows).fill(WALL);
  for (let x = 1; x <= 3; x++) t[at(x, 2)] = EMPTY;
  return t;
}

describe('walkableRegions com obstaculos temporarios', () => {
  it('sem bloqueio, o corredor e uma componente so', () => {
    const t = corredor();
    const dsu = walkableRegions(t, cols, rows);
    expect(dsu.connected(at(1, 2), at(3, 2))).toBe(true);
  });

  it('uma bomba no meio do corredor parte o mapa em duas regioes', () => {
    const t = corredor();
    const blocked = new Set([at(2, 2)]);
    const dsu = walkableRegions(t, cols, rows, { blocked });
    expect(dsu.connected(at(1, 2), at(3, 2))).toBe(false);
    expect(isReachable(t, cols, rows, at(1, 2), at(3, 2), { blocked })).toBe(false);
    // e sem a bomba volta a conectar (a DSU e reconstruida, nao "desfeita")
    expect(isReachable(t, cols, rows, at(1, 2), at(3, 2))).toBe(true);
  });

  it('a propria celula da bomba nao e alcancavel', () => {
    const t = corredor();
    const blocked = new Set([at(2, 2)]);
    expect(isReachable(t, cols, rows, at(1, 2), at(2, 2), { blocked })).toBe(false);
  });
});
