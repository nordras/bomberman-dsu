import { describe, it, expect } from 'vitest';
import { pickAvoidingRepeat } from '../src/core/pick.js';

describe('pickAvoidingRepeat', () => {
  it('com uma opcao so, devolve sempre 0', () => {
    expect(pickAvoidingRepeat(1, -1)).toBe(0);
    expect(pickAvoidingRepeat(1, 0)).toBe(0);
  });

  it('na primeira vez sorteia entre todas', () => {
    const n = 3;
    const vistos = new Set();
    for (const r of [0, 0.4, 0.7, 0.99]) vistos.add(pickAvoidingRepeat(n, -1, () => r));
    expect([...vistos].sort()).toEqual([0, 1, 2]);
  });

  it('nunca devolve o indice anterior', () => {
    for (const n of [2, 3, 5]) {
      for (let last = 0; last < n; last++) {
        for (let k = 0; k < 200; k++) {
          expect(pickAvoidingRepeat(n, last)).not.toBe(last);
        }
      }
    }
  });

  it('devolve sempre um indice valido', () => {
    for (let k = 0; k < 500; k++) {
      const i = pickAvoidingRepeat(3, k % 3);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThan(3);
    }
  });

  it('cobre todas as outras opcoes de forma equilibrada', () => {
    const n = 3;
    const last = 1;
    const conta = [0, 0, 0];
    for (let k = 0; k < 3000; k++) conta[pickAvoidingRepeat(n, last)] += 1;
    expect(conta[last]).toBe(0);
    // as outras duas devem ficar perto de 50% cada
    for (const i of [0, 2]) expect(conta[i]).toBeGreaterThan(1200);
  });

  it('uma sequencia longa nunca tem dois iguais seguidos', () => {
    let last = -1;
    const seq = [];
    for (let k = 0; k < 400; k++) {
      last = pickAvoidingRepeat(3, last);
      seq.push(last);
    }
    for (let k = 1; k < seq.length; k++) expect(seq[k]).not.toBe(seq[k - 1]);
    expect(new Set(seq).size).toBe(3); // e ainda assim usa as tres
  });

  it('trata um `last` fora do intervalo como se nao houvesse anterior', () => {
    const i = pickAvoidingRepeat(3, 9, () => 0.99);
    expect(i).toBe(2);
  });
});
