import { describe, it, expect } from 'vitest';
import { blastCells, blastTiles } from '../src/core/blast.js';
import { EMPTY, WALL, BRICK } from '../src/core/tiles.js';

const cols = 7;
const rows = 7;
const at = (x, y) => y * cols + x;

function grid() {
  const t = new Uint8Array(cols * rows).fill(EMPTY);
  for (let x = 0; x < cols; x++) {
    t[at(x, 0)] = WALL;
    t[at(x, rows - 1)] = WALL;
  }
  for (let y = 0; y < rows; y++) {
    t[at(0, y)] = WALL;
    t[at(cols - 1, y)] = WALL;
  }
  return t;
}

/** indexa o resultado por celula, para assercoes legiveis */
const byIndex = (cells) => new Map(cells.map((c) => [c.index, c]));

describe('blastCells', () => {
  it('cobre exatamente as mesmas celulas que blastTiles', () => {
    const t = grid();
    t[at(4, 3)] = BRICK;
    const origin = at(3, 3);
    const a = [...blastTiles(t, cols, rows, origin, 2)].sort((x, y) => x - y);
    const b = blastCells(t, cols, rows, origin, 2).map((c) => c.index).sort((x, y) => x - y);
    expect(b).toEqual(a);
  });

  it('classifica centro, haste e ponta com o sentido certo', () => {
    const t = grid();
    const origin = at(3, 3);
    const m = byIndex(blastCells(t, cols, rows, origin, 2));

    expect(m.get(origin)).toMatchObject({ axis: 'c', tip: 0 });
    // alcance 2: o passo 1 e haste, o passo 2 e ponta
    expect(m.get(at(4, 3))).toMatchObject({ axis: 'h', tip: 0 });
    expect(m.get(at(5, 3))).toMatchObject({ axis: 'h', tip: 1 });
    expect(m.get(at(2, 3))).toMatchObject({ axis: 'h', tip: 0 });
    expect(m.get(at(1, 3))).toMatchObject({ axis: 'h', tip: -1 });
    expect(m.get(at(3, 5))).toMatchObject({ axis: 'v', tip: 1 });
    expect(m.get(at(3, 1))).toMatchObject({ axis: 'v', tip: -1 });
  });

  it('vira ponta quando a parede corta o alcance antes do limite', () => {
    const t = grid();
    t[at(5, 3)] = WALL;
    const m = byIndex(blastCells(t, cols, rows, at(3, 3), 3));
    expect(m.get(at(4, 3))).toMatchObject({ axis: 'h', tip: 1 });
    expect(m.has(at(5, 3))).toBe(false);
  });

  it('o tijolo e sempre ponta e encerra a direcao', () => {
    const t = grid();
    t[at(4, 3)] = BRICK;
    const m = byIndex(blastCells(t, cols, rows, at(3, 3), 3));
    expect(m.get(at(4, 3))).toMatchObject({ axis: 'h', tip: 1 });
    expect(m.has(at(5, 3))).toBe(false);
  });
});
