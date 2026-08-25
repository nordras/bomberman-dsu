import { describe, it, expect } from 'vitest';
import { generateMap } from '../src/core/mapgen.js';
import { walkableRegions, isReachable } from '../src/core/regions.js';
import { chainGroups, blastTiles } from '../src/core/blast.js';
import { EMPTY, WALL, BRICK, isSolid } from '../src/core/tiles.js';

describe('generateMap', () => {
  it('rejeita dimensoes pares', () => {
    expect(() => generateMap({ cols: 14, rows: 13 })).toThrow();
  });

  it('e deterministico para a mesma seed', () => {
    const a = generateMap({ seed: 42 });
    const b = generateMap({ seed: 42 });
    expect([...a.tiles]).toEqual([...b.tiles]);
    expect(a.exit).toBe(b.exit);
  });

  it('fecha a borda com paredes indestrutiveis', () => {
    const { tiles, cols, rows } = generateMap({ seed: 7 });
    for (let x = 0; x < cols; x++) {
      expect(tiles[x]).toBe(WALL);
      expect(tiles[(rows - 1) * cols + x]).toBe(WALL);
    }
    for (let y = 0; y < rows; y++) {
      expect(tiles[y * cols]).toBe(WALL);
      expect(tiles[y * cols + cols - 1]).toBe(WALL);
    }
  });

  it('a arvore geradora deixa o mapa conexo SEM explodir nada', () => {
    for (let seed = 0; seed < 60; seed++) {
      const { tiles, cols, rows, spawn, exit } = generateMap({ seed });
      const dsu = walkableRegions(tiles, cols, rows);

      // todo chao livre pertence a uma unica componente
      const roots = new Set();
      for (let i = 0; i < tiles.length; i++) {
        if (!isSolid(tiles[i])) roots.add(dsu.find(i));
      }
      expect(roots.size, `seed ${seed}`).toBe(1);

      // e a saida fica sob um tijolo alcancavel a partir do spawn
      const spawnIdx = spawn.y * cols + spawn.x;
      expect(tiles[exit]).toBe(BRICK);
      const opened = Uint8Array.from(tiles);
      opened[exit] = EMPTY;
      expect(isReachable(opened, cols, rows, spawnIdx, exit)).toBe(true);
    }
  });

  it('mantem o spawn livre para o jogador se mexer', () => {
    const { tiles, cols, spawn } = generateMap({ seed: 99 });
    const i = spawn.y * cols + spawn.x;
    expect(tiles[i]).toBe(EMPTY);
    const vizinhosLivres = [i + 1, i + cols].filter((n) => tiles[n] === EMPTY);
    expect(vizinhosLivres.length).toBeGreaterThan(0);
  });
});

describe('blast', () => {
  // grid 5x5 de chao com paredes na borda
  const cols = 5;
  const rows = 5;
  const makeGrid = () => {
    const t = new Uint8Array(cols * rows).fill(EMPTY);
    for (let x = 0; x < cols; x++) {
      t[x] = WALL;
      t[(rows - 1) * cols + x] = WALL;
    }
    for (let y = 0; y < rows; y++) {
      t[y * cols] = WALL;
      t[y * cols + cols - 1] = WALL;
    }
    return t;
  };

  it('para na parede e logo apos o primeiro tijolo', () => {
    const t = makeGrid();
    t[2 * cols + 3] = BRICK; // tijolo a direita do centro
    const hit = blastTiles(t, cols, rows, 2 * cols + 2, 3);
    expect(hit).toContain(2 * cols + 3);
    expect(hit).not.toContain(2 * cols + 4); // parede alem do tijolo
    expect(hit).toContain(1 * cols + 2);
    expect(hit).toContain(3 * cols + 2);
  });

  it('encadeia bombas por transitividade', () => {
    const t = makeGrid();
    const at = (x, y) => y * cols + x;
    // A(1,1) -- B(1,3) -- C(3,3): A nao alcanca C diretamente
    const bombs = [
      { index: at(1, 1), range: 2 },
      { index: at(1, 3), range: 2 },
      { index: at(3, 3), range: 2 },
    ];
    const dsu = chainGroups(bombs, t, cols, rows);
    expect(dsu.count).toBe(1);
    expect(dsu.connected(0, 2)).toBe(true);
  });

  it('nao encadeia bombas separadas por parede', () => {
    const t = makeGrid();
    const at = (x, y) => y * cols + x;
    t[at(2, 1)] = WALL;
    const bombs = [
      { index: at(1, 1), range: 1 },
      { index: at(3, 1), range: 1 },
    ];
    const dsu = chainGroups(bombs, t, cols, rows);
    expect(dsu.count).toBe(2);
  });
});
