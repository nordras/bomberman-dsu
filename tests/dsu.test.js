import { describe, it, expect } from 'vitest';
import { DSU } from '../src/core/dsu.js';

describe('DSU', () => {
  it('comeca com n componentes isoladas', () => {
    const d = new DSU(5);
    expect(d.count).toBe(5);
    expect(d.connected(0, 1)).toBe(false);
    expect(d.size(0)).toBe(1);
  });

  it('union devolve false quando ja estao no mesmo conjunto', () => {
    const d = new DSU(4);
    expect(d.union(0, 1)).toBe(true);
    expect(d.union(1, 0)).toBe(false);
    expect(d.count).toBe(3);
  });

  it('propaga conectividade por transitividade', () => {
    const d = new DSU(4);
    d.union(0, 1);
    d.union(2, 3);
    expect(d.connected(0, 3)).toBe(false);
    d.union(1, 2);
    expect(d.connected(0, 3)).toBe(true);
    expect(d.count).toBe(1);
    expect(d.size(3)).toBe(4);
  });

  it('agrupa corretamente em groups()', () => {
    const d = new DSU(6);
    d.union(0, 1);
    d.union(1, 2);
    d.union(4, 5);
    const sizes = [...d.groups().values()].map((g) => g.length).sort();
    expect(sizes).toEqual([1, 2, 3]);
  });

  it('aguenta uma corrente longa sem estourar a pilha (path compression iterativa)', () => {
    const n = 200_000;
    const d = new DSU(n);
    for (let i = 0; i + 1 < n; i++) d.union(i, i + 1);
    expect(d.count).toBe(1);
    expect(d.find(0)).toBe(d.find(n - 1));
    expect(d.size(0)).toBe(n);
  });
});

describe('root() — leitura por observadores', () => {
  it('devolve a mesma raiz que find, sem tocar na estrutura', () => {
    const d = new DSU(8);
    d.union(0, 1);
    d.union(2, 3);
    d.union(1, 3);
    const antesParent = [...d.parent];
    const antesStats = { ...d.stats };

    for (let i = 0; i < 8; i++) expect(d.root(i)).toBe(d.parent[d.find(i)] === d.find(i) ? d.find(i) : d.find(i));

    // reinicia para medir root isolado
    const e = new DSU(8);
    e.union(0, 1);
    e.union(2, 3);
    e.union(1, 3);
    const p0 = [...e.parent];
    const s0 = { ...e.stats };
    for (let i = 0; i < 8; i++) e.root(i);
    expect([...e.parent]).toEqual(p0);   // nao comprimiu
    expect(e.stats).toEqual(s0);         // nao contou
    expect(antesParent.length).toBe(8);
    expect(antesStats.finds).toBeGreaterThan(0);
  });

  it('root concorda com find em toda a estrutura', () => {
    const d = new DSU(200);
    for (let i = 0; i < 150; i++) d.union(i % 50, (i * 7) % 50);
    for (let i = 0; i < 200; i++) expect(d.root(i)).toBe(d.find(i));
  });
});
