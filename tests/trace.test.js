import { describe, it, expect } from 'vitest';
import { DSU } from '../src/core/dsu.js';
import { generateMap } from '../src/core/mapgen.js';

describe('instrumentacao da DSU', () => {
  it('nao guarda log quando o trace esta desligado', () => {
    const d = new DSU(4);
    d.union(0, 1);
    expect(d.log).toBeNull();
  });

  it('registra uniao efetiva e uniao redundante', () => {
    const d = new DSU(4, { trace: true });
    d.union(0, 1);
    d.union(1, 0);
    expect(d.log).toHaveLength(2);
    expect(d.log[0]).toMatchObject({ a: 0, b: 1, merged: true });
    expect(d.log[1]).toMatchObject({ a: 1, b: 0, merged: false });
  });

  it('conta finds, unioes e compressoes', () => {
    const d = new DSU(5);
    d.union(0, 1);
    d.union(1, 2);
    d.union(2, 3);
    expect(d.stats.unions).toBe(3);
    expect(d.stats.merges).toBe(3);
    // cada union chama find duas vezes
    expect(d.stats.finds).toBe(6);
    expect(d.stats.compressions).toBeGreaterThanOrEqual(0);
  });

  it('path compression achata a arvore: o mesmo find fica mais barato', () => {
    const d = new DSU(64);
    for (let i = 0; i + 1 < 64; i++) d.union(i, i + 1);
    const antes = d.stats.hops;
    d.find(63);
    const primeiro = d.stats.hops - antes;
    const meio = d.stats.hops;
    d.find(63);
    expect(d.stats.hops - meio).toBeLessThanOrEqual(primeiro);
    expect(d.stats.hops - meio).toBeLessThanOrEqual(1);
  });

  it('depths() nao altera a estrutura (nao comprime)', () => {
    const d = new DSU(8);
    d.union(0, 1);
    d.union(2, 3);
    d.union(1, 3);
    const antes = [...d.parent];
    const prof = d.depths();
    expect([...d.parent]).toEqual(antes);
    expect(prof.length).toBe(8);
    for (let i = 0; i < 8; i++) if (d.parent[i] === i) expect(prof[i]).toBe(0);
  });
});

describe('replay do Kruskal', () => {
  it('expoe os passos na ordem avaliada, um por aresta', () => {
    const m = generateMap({ seed: 123 });
    const { cols: rc, rows: rr } = m.rooms;
    // arestas de uma grade rc x rr
    const esperado = (rc - 1) * rr + rc * (rr - 1);
    expect(m.steps).toHaveLength(esperado);
    expect(m.steps.every((s) => typeof s.accepted === 'boolean')).toBe(true);
  });

  it('as arestas aceitas formam exatamente uma arvore geradora', () => {
    const m = generateMap({ seed: 2024 });
    const n = m.rooms.cols * m.rooms.rows;
    const aceitas = m.steps.filter((s) => s.accepted);
    expect(aceitas).toHaveLength(n - 1);
  });

  it('reproduzir os passos leva ao mesmo estado final', () => {
    const m = generateMap({ seed: 555 });
    const n = m.rooms.cols * m.rooms.rows;

    const replay = new DSU(n);
    for (const s of m.steps) {
      // a decisao gravada tem de bater com a que a DSU toma no replay
      expect(replay.union(s.a, s.b)).toBe(s.accepted);
    }
    expect(replay.count).toBe(1);
  });

  it('replay parcial e prefixo do total: componentes so diminuem', () => {
    const m = generateMap({ seed: 99 });
    const n = m.rooms.cols * m.rooms.rows;
    let anterior = n + 1;
    for (let k = 0; k <= m.steps.length; k += 7) {
      const d = new DSU(n);
      for (let i = 0; i < k; i++) d.union(m.steps[i].a, m.steps[i].b);
      expect(d.count).toBeLessThanOrEqual(anterior);
      anterior = d.count;
    }
  });
});
