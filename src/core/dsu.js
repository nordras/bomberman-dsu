/**
 * Disjoint Set Union (Union-Find) com path compression + union by rank.
 *
 * Todas as operacoes sao praticamente O(1) amortizado -- O(alfa(n)),
 * onde alfa e a inversa de Ackermann (<= 4 para qualquer n pratico).
 *
 * A instrumentacao (contadores e log) existe para o painel de visualizacao.
 * Ela e opt-in e nao usa DOM: a estrutura continua sendo JS puro e testavel.
 */
export class DSU {
  /**
   * @param {number} n quantidade de elementos, ids de 0 a n-1
   * @param {object} [opts]
   * @param {boolean} [opts.trace] registra cada union em `this.log`
   */
  constructor(n, { trace = false } = {}) {
    this.n = n;
    this.parent = new Int32Array(n);
    this.rank = new Uint8Array(n);
    this.compSize = new Int32Array(n).fill(1);
    /** quantidade de componentes distintas */
    this.count = n;
    for (let i = 0; i < n; i++) this.parent[i] = i;

    /** contadores para o painel; nao afetam o algoritmo */
    this.stats = { finds: 0, unions: 0, merges: 0, hops: 0, compressions: 0, maxDepth: 0 };
    /** @type {{a:number,b:number,ra:number,rb:number,merged:boolean}[]|null} */
    this.log = trace ? [] : null;
  }

  /**
   * Raiz do conjunto de `x`, aplicando path compression iterativa
   * (sem recursao para nao estourar a pilha em grids grandes).
   * @param {number} x
   * @returns {number} representante do conjunto
   */
  find(x) {
    this.stats.finds++;
    let root = x;
    let depth = 0;
    while (this.parent[root] !== root) {
      root = this.parent[root];
      depth++;
    }
    this.stats.hops += depth;
    if (depth > this.stats.maxDepth) this.stats.maxDepth = depth;

    // segunda passada: aponta todo mundo do caminho direto para a raiz
    while (this.parent[x] !== root) {
      const next = this.parent[x];
      this.parent[x] = root;
      this.stats.compressions++;
      x = next;
    }
    return root;
  }

  /**
   * Une os conjuntos de `a` e `b`.
   * @returns {boolean} true se houve uniao de fato (estavam separados)
   */
  union(a, b) {
    this.stats.unions++;
    let ra = this.find(a);
    let rb = this.find(b);
    if (ra === rb) {
      if (this.log) this.log.push({ a, b, ra, rb, merged: false });
      return false;
    }

    // union by rank: a arvore mais baixa vira filha da mais alta
    if (this.rank[ra] < this.rank[rb]) [ra, rb] = [rb, ra];
    this.parent[rb] = ra;
    this.compSize[ra] += this.compSize[rb];
    if (this.rank[ra] === this.rank[rb]) this.rank[ra]++;
    this.count--;
    this.stats.merges++;
    if (this.log) this.log.push({ a, b, ra, rb, merged: true });
    return true;
  }

  /**
   * Raiz de `x` **sem** comprimir o caminho e **sem** contar estatisticas.
   *
   * E a leitura para observadores (o painel). Usar `find` aqui seria o
   * observador alterando o observado: cada quadro desenhado somaria centenas
   * de `find` aos contadores e ainda achataria as arvores, escondendo a
   * estrutura que o painel quer mostrar.
   * @param {number} x
   * @returns {number}
   */
  root(x) {
    while (this.parent[x] !== x) x = this.parent[x];
    return x;
  }

  /** @returns {boolean} `a` e `b` estao no mesmo conjunto? */
  connected(a, b) {
    return this.find(a) === this.find(b);
  }

  /** @returns {number} tamanho da componente que contem `x` */
  size(x) {
    return this.compSize[this.find(x)];
  }

  /**
   * Agrupa os elementos por raiz.
   * @returns {Map<number, number[]>} raiz -> membros
   */
  groups() {
    const map = new Map();
    for (let i = 0; i < this.n; i++) {
      const r = this.find(i);
      const g = map.get(r);
      if (g) g.push(i);
      else map.set(r, [i]);
    }
    return map;
  }

  /**
   * Profundidade de cada elemento ate a raiz, *sem* comprimir o caminho.
   * Serve so para o painel desenhar a forma real das arvores -- por isso le
   * `parent` direto em vez de chamar `find`, que achataria tudo.
   * @returns {Int32Array}
   */
  depths() {
    const d = new Int32Array(this.n);
    for (let i = 0; i < this.n; i++) {
      let x = i;
      let k = 0;
      while (this.parent[x] !== x) {
        x = this.parent[x];
        k++;
      }
      d[i] = k;
    }
    return d;
  }
}
