import { DSU } from '../core/dsu.js';
import { isSolid } from '../core/tiles.js';
import { REGION_COLORS } from '../config.js';

/** 0xRRGGBB -> '#rrggbb' */
const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;
/** cor estavel por raiz, a mesma paleta do overlay do jogo */
const colorOf = (root) => hex(REGION_COLORS[root % REGION_COLORS.length]);

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

/**
 * Painel lateral que mostra a DSU trabalhando em tempo real.
 *
 * Sao tres visoes, uma por uso da estrutura no jogo:
 *  - regioes: componentes conexas do chao livre (reconstruida a cada explosao)
 *  - cadeia:  quais bombas vivas detonariam juntas se uma acendesse agora
 *  - kruskal: replay passo a passo da geracao do labirinto
 */
export class DsuPanel {
  /** @param {HTMLElement} root */
  constructor(root) {
    this.root = root;
    this.tab = 'regions';
    this.kruskal = { step: null, playing: false, seed: null };
    /** qual detonacao do historico esta aberta (0 = a mais recente) */
    this.chainSel = 0;
    this.snapshot = null;
    this.build();
  }

  build() {
    const tabs = el('div', 'viz-tabs');
    /** @type {Record<string, HTMLButtonElement>} */
    this.tabButtons = {};
    for (const [key, label] of [
      ['regions', 'Regiões'],
      ['chain', 'Cadeia'],
      ['kruskal', 'Kruskal'],
    ]) {
      const b = el('button', 'viz-tab', label);
      b.onclick = () => {
        this.tab = key;
        this.syncTabs();
        this.render(this.snapshot);
      };
      tabs.append(b);
      this.tabButtons[key] = b;
    }

    this.body = el('div', 'viz-body');
    this.root.append(tabs, this.body);
    this.syncTabs();
  }

  syncTabs() {
    for (const [key, b] of Object.entries(this.tabButtons)) {
      b.classList.toggle('is-active', key === this.tab);
    }
  }

  /**
   * @param {object} snap estado atual do jogo
   * @param {object} snap.map resultado de generateMap (com `steps` e `rooms`)
   * @param {Uint8Array} snap.tiles
   * @param {number} snap.cols
   * @param {number} snap.rows
   * @param {DSU} snap.regionDsu
   * @param {{index:number, fuse:number, range:number}[]} snap.bombs
   * @param {DSU} snap.chainDsu
   * @param {number} snap.playerIndex
   */
  render(snap, { auto = false } = {}) {
    if (!snap) return;
    this.snapshot = snap;

    // novo mapa => reinicia o replay do Kruskal no estado final
    const novoMapa = this.kruskal.seed !== snap.map.seed;
    if (novoMapa) {
      this.kruskal.seed = snap.map.seed;
      this.kruskal.step = snap.map.steps.length;
      this.kruskal.playing = false;
    }

    // o replay do Kruskal so muda por acao do usuario: redesenhar a cada tick
    // do jogo cancelaria o arrasto do slider e gastaria DOM a toa
    if (auto && this.tab === 'kruskal' && !this.kruskal.playing && !novoMapa) return;

    this.body.replaceChildren();
    if (this.tab === 'regions') this.renderRegions(snap);
    else if (this.tab === 'chain') this.renderChain(snap);
    else this.renderKruskal(snap);
  }

  // ---------------------------------------------------------------- comuns

  /**
   * Bloco de contadores da DSU.
   * `components` permite sobrescrever `dsu.count` -- na visao de regioes a DSU
   * cobre o grid inteiro, entao cada parede conta como uma componente propria
   * e o numero bruto nao diz nada ao leitor.
   */
  statsBlock(dsu, extra = [], components = dsu.count) {
    const wrap = el('div', 'viz-stats');
    const rows = [
      ['elementos (n)', dsu.n],
      ['componentes', components],
      ['find()', dsu.stats.finds],
      ['union()', dsu.stats.unions],
      ['uniões efetivas', dsu.stats.merges],
      ['saltos percorridos', dsu.stats.hops],
      ['compressões', dsu.stats.compressions],
      ['profundidade máx.', dsu.stats.maxDepth],
      ...extra,
    ];
    for (const [k, v] of rows) {
      const r = el('div', 'viz-stat');
      r.append(el('span', 'k', k), el('span', 'v', String(v)));
      wrap.append(r);
    }
    return wrap;
  }

  /**
   * A lista `parent[]` propriamente dita. Raiz (i === parent[i]) fica marcada;
   * a cor vem da raiz, entao elementos do mesmo conjunto compartilham a cor.
   */
  parentList(dsu, ids, label = (i) => String(i)) {
    const wrap = el('div', 'viz-arr');
    for (const i of ids) {
      const p = dsu.parent[i];
      const isRoot = p === i;
      const cell = el('div', `viz-cell${isRoot ? ' is-root' : ''}`);
      cell.style.borderColor = colorOf(dsu.root(i));
      cell.append(el('span', 'i', label(i)), el('span', 'p', isRoot ? '•' : label(p)));
      cell.title = `parent[${i}] = ${p}${isRoot ? '  (raiz)' : ''}\nrank=${dsu.rank[i]}  tamanho=${dsu.compSize[i]}`;
      wrap.append(cell);
    }
    return wrap;
  }

  /** lista de componentes: cor, raiz e tamanho */
  groupsList(dsu, ids) {
    const byRoot = new Map();
    for (const i of ids) {
      const r = dsu.root(i);
      byRoot.set(r, (byRoot.get(r) ?? 0) + 1);
    }
    const wrap = el('div', 'viz-groups');
    const sorted = [...byRoot].sort((a, b) => b[1] - a[1]);
    for (const [root, size] of sorted) {
      const row = el('div', 'viz-group');
      const dot = el('span', 'dot');
      dot.style.background = colorOf(root);
      row.append(dot, el('span', 'r', `raiz ${root}`), el('span', 'n', `${size} elem.`));
      wrap.append(row);
    }
    if (!sorted.length) wrap.append(el('p', 'viz-empty', 'nenhum elemento'));
    return wrap;
  }

  /** caixa de texto colapsavel, para explicar o algoritmo sem roubar espaco */
  explainer(titulo, paragrafos, aberto = false) {
    const d = el('details', 'viz-explain');
    d.open = aberto;
    d.append(el('summary', null, titulo));
    for (const p of paragrafos) {
      const el2 = el('p');
      el2.innerHTML = p;
      d.append(el2);
    }
    return d;
  }

  section(title, hint) {
    const h = el('h3', 'viz-h', title);
    if (hint) h.append(el('span', 'hint', hint));
    return h;
  }

  /** ultimas uniões registradas em dsu.log */
  logList(dsu, limit = 10, label = (i) => String(i)) {
    const wrap = el('div', 'viz-log');
    const items = (dsu.log ?? []).slice(-limit).reverse();
    for (const l of items) {
      const row = el('div', `viz-logrow${l.merged ? ' ok' : ' skip'}`);
      row.append(
        el('code', null, `union(${label(l.a)}, ${label(l.b)})`),
        el('span', 'res', l.merged ? `uniu → raiz ${l.ra}` : 'já conectados'),
      );
      wrap.append(row);
    }
    if (!items.length) wrap.append(el('p', 'viz-empty', 'nenhuma união ainda'));
    return wrap;
  }

  // --------------------------------------------------------------- regioes

  renderRegions(snap) {
    const { regionDsu: dsu, tiles, cols, rows, playerIndex, blockedCells } = snap;
    // celulas com bomba nao entram: elas sao o obstaculo que parte a regiao,
    // nao uma regiao de tamanho 1
    const walkable = [];
    for (let i = 0; i < tiles.length; i++) {
      if (!isSolid(tiles[i]) && !blockedCells.has(i)) walkable.push(i);
    }

    const roots = new Set(walkable.map((i) => dsu.root(i)));
    this.body.append(
      this.section('Componentes do chão', 'union de células vizinhas livres'),
      this.statsBlock(
        dsu,
        [['células livres', walkable.length], ['bombas bloqueando', blockedCells.size]],
        roots.size,
      ),
    );

    // o grid e o proprio parent[] desenhado no espaco: cada celula pintada
    // pela cor da sua raiz, com a profundidade real da arvore por cima
    const depths = dsu.depths();
    const grid = el('div', 'viz-grid');
    grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    for (let i = 0; i < cols * rows; i++) {
      const c = el('div', 'g');
      if (isSolid(tiles[i])) {
        c.classList.add('solid');
      } else if (blockedCells.has(i)) {
        c.classList.add('bomb');
        c.title = `célula ${i}: bomba — bloqueia a passagem`;
      } else {
        const root = dsu.root(i);
        c.style.background = colorOf(root);
        if (dsu.parent[i] === i) c.classList.add('root');
        if (i === playerIndex) c.classList.add('you');
        c.style.opacity = String(1 - Math.min(depths[i], 3) * 0.18);
        c.title = `célula ${i} (${i % cols},${(i / cols) | 0})\nparent=${dsu.parent[i]}  raiz=${root}\nprofundidade=${depths[i]}`;
      }
      grid.append(c);
    }
    this.body.append(
      this.section('Mapa por componente', 'cor = raiz · borda = raiz · vermelho = bomba'),
      grid,
      this.section('Conjuntos'),
      this.groupsList(dsu, walkable),
      this.section('parent[]', 'só células livres'),
      this.parentList(dsu, walkable),
    );
  }

  // ---------------------------------------------------------------- cadeia

  renderChain(snap) {
    const { chainDsu: dsu, bombs, cols } = snap;
    const label = (i) => `B${i}`;

    this.body.append(
      this.section('Cadeia de detonação', 'quem explodiria junto agora'),
    );

    if (!bombs.length) {
      this.body.append(el('p', 'viz-empty', 'Nenhuma bomba no mapa. Aperte Espaço para plantar — de preferência duas dentro do alcance uma da outra.'));
      this.renderChainHistory(snap);
      return;
    }

    const list = el('div', 'viz-bombs');
    bombs.forEach((b, i) => {
      const root = dsu.root(i);
      const row = el('div', 'viz-bomb');
      const dot = el('span', 'dot');
      dot.style.background = colorOf(root);
      row.append(
        dot,
        el('span', 'id', label(i)),
        el('span', 'pos', `(${b.index % cols},${(b.index / cols) | 0})`),
        el('span', 'fuse', `${Math.max(0, b.fuse / 1000).toFixed(1)}s`),
        el('span', 'grp', `grupo ${root}`),
      );
      list.append(row);
    });

    this.body.append(
      list,
      this.statsBlock(dsu, [['grupos de detonação', dsu.count]]),
      this.section('Conjuntos'),
      this.groupsList(dsu, bombs.map((_, i) => i)),
      this.section('parent[]'),
      this.parentList(dsu, bombs.map((_, i) => i), label),
      this.section('Últimas operações', 'transitividade em ação'),
      this.logList(dsu, 8, label),
    );
    this.renderChainHistory(snap);
  }

  /**
   * Histórico das detonações. As bombas somem quando explodem, então sem isso
   * o painel ficaria vazio justamente depois do evento que importa.
   */
  renderChainHistory(snap) {
    const hist = snap.chainHistory ?? [];
    this.body.append(this.section('Detonações', `${hist.length} registrada(s)`));
    if (!hist.length) {
      this.body.append(el('p', 'viz-empty', 'Nada detonado ainda nesta partida.'));
      return;
    }

    const sel = Math.min(this.chainSel, hist.length - 1);
    const lista = el('div', 'viz-hist');
    hist.forEach((h, i) => {
      const row = el('div', `viz-hrow${i === sel ? ' current' : ''}`);
      const emCadeia = h.exploded.length > h.triggered;
      row.append(
        el('span', 'n', `#${h.n}`),
        el('span', 'q', `${h.exploded.length} bomba(s)`),
        el('span', 'c', emCadeia ? `cadeia +${h.exploded.length - h.triggered}` : 'sozinha'),
        el('span', 'b', `${h.bricks} tijolo(s)`),
      );
      if (emCadeia) row.classList.add('chained');
      row.onclick = () => {
        this.chainSel = i;
        this.render(this.snapshot);
      };
      lista.append(row);
    });
    this.body.append(lista);

    const h = hist[sel];
    const label = (i) => `B${i}`;
    this.body.append(
      this.section(`Detonação #${h.n}`, `${h.at} · ${h.cells} célula(s) atingida(s)`),
      this.statsBlock(h.dsu, [
        ['bombas envolvidas', h.bombs.length],
        ['detonaram', h.exploded.length],
        ['pavio zerado', h.triggered],
        ['puxadas em cadeia', h.exploded.length - h.triggered],
      ]),
      this.section('parent[] no momento'),
      this.parentList(h.dsu, h.bombs.map((_, i) => i), label),
      this.section('Operações da detonação'),
      this.logList(h.dsu, 12, label),
    );
  }

  // --------------------------------------------------------------- kruskal

  /** reconstroi a DSU das salas aplicando os `n` primeiros passos */
  replayKruskal(map, n) {
    const dsu = new DSU(map.rooms.cols * map.rooms.rows, { trace: true });
    for (let i = 0; i < n; i++) dsu.union(map.steps[i].a, map.steps[i].b);
    return dsu;
  }

  renderKruskal(snap) {
    const { map } = snap;
    const total = map.steps.length;
    const n = Math.max(0, Math.min(this.kruskal.step ?? total, total));
    const dsu = this.replayKruskal(map, n);

    const accepted = map.steps.slice(0, n).filter((s) => s.accepted).length;
    const rejected = n - accepted;

    this.body.append(
      this.section('Kruskal aleatorizado', 'a DSU decide corredor × tijolo'),
      this.explainer('Como funciona', [
        'Cada <b>sala</b> (as células de coordenada ímpar) começa sendo o seu próprio conjunto — são 42 conjuntos de 1 elemento. Cada <b>parede</b> entre duas salas vizinhas é uma aresta candidata.',
        'As arestas são embaralhadas e avaliadas uma a uma. Para cada uma perguntamos à DSU: <code>union(a, b)</code>.',
        'Se as salas estavam em conjuntos <b>diferentes</b>, a união acontece e a parede vira <b>corredor</b>. Essa aresta entra na árvore geradora.',
        'Se já estavam no <b>mesmo</b> conjunto, abrir ali criaria um ciclo — então a parede vira <b>tijolo</b> destrutível (ou, com 14% de chance, um <b>atalho</b>, para o mapa não virar um labirinto de corredor único).',
        'É a DSU que responde "essas duas salas já se comunicam?" em tempo praticamente constante. Sem ela seria uma busca no grafo a cada aresta.',
        'No fim há <b>exatamente n−1 arestas aceitas</b> e <b>uma única componente</b>: o mapa é conexo sem precisar explodir nada. Os tijolos são atalhos opcionais, nunca a única passagem.',
      ]),
    );

    // --- controles de replay ---
    const ctl = el('div', 'viz-ctl');
    const mk = (txt, fn, title) => {
      const b = el('button', 'viz-btn', txt);
      b.title = title ?? '';
      b.onclick = () => {
        fn();
        this.render(this.snapshot);
      };
      return b;
    };
    const slider = el('input', 'viz-slider');
    slider.type = 'range';
    slider.min = '0';
    slider.max = String(total);
    slider.value = String(n);
    slider.oninput = () => {
      this.kruskal.playing = false;
      this.kruskal.step = Number(slider.value);
      this.render(this.snapshot);
    };
    ctl.append(
      mk('⏮', () => { this.kruskal.playing = false; this.kruskal.step = 0; }, 'início'),
      mk('◀', () => { this.kruskal.playing = false; this.kruskal.step = Math.max(0, n - 1); }, 'passo anterior'),
      mk(this.kruskal.playing ? '⏸' : '▶', () => {
        this.kruskal.playing = !this.kruskal.playing;
        if (this.kruskal.playing && n >= total) this.kruskal.step = 0;
      }, 'reproduzir'),
      mk('▶|', () => { this.kruskal.playing = false; this.kruskal.step = Math.min(total, n + 1); }, 'próximo passo'),
      mk('⏭', () => { this.kruskal.playing = false; this.kruskal.step = total; }, 'fim'),
    );
    this.body.append(ctl, slider, el('div', 'viz-step', `aresta ${n} de ${total}   ·   ${accepted} aceitas · ${rejected} rejeitadas`));

    // --- grade de salas: a floresta da DSU no espaco do labirinto ---
    const grid = el('div', 'viz-grid rooms');
    grid.style.gridTemplateColumns = `repeat(${map.rooms.cols}, 1fr)`;
    const current = n > 0 ? map.steps[n - 1] : null;
    for (let i = 0; i < dsu.n; i++) {
      const c = el('div', 'g');
      c.style.background = colorOf(dsu.root(i));
      if (dsu.parent[i] === i) c.classList.add('root');
      if (current && (i === current.a || i === current.b)) c.classList.add('active');
      c.title = `sala ${i}\nparent=${dsu.parent[i]}  raiz=${dsu.root(i)}  rank=${dsu.rank[i]}`;
      grid.append(c);
    }
    this.body.append(
      this.section('Salas por componente', `${dsu.count} componente(s)`),
      grid,
    );

    // --- a fila de arestas, com a decisao de cada uma ---
    const queue = el('div', 'viz-queue');
    const from = Math.max(0, n - 6);
    for (let i = from; i < Math.min(total, from + 14); i++) {
      const s = map.steps[i];
      const done = i < n;
      const row = el('div', `viz-qrow${i === n - 1 ? ' current' : ''}${done ? '' : ' pending'}`);
      row.append(el('code', null, `union(${s.a}, ${s.b})`));
      if (!done) row.append(el('span', 'res', '—'));
      else if (s.accepted) row.append(el('span', 'res ok', 'corredor'));
      else row.append(el('span', `res ${s.braided ? 'braid' : 'skip'}`, s.braided ? 'atalho' : 'tijolo'));
      queue.append(row);
    }
    this.body.append(
      this.section('Fila de arestas', 'aceita → corredor · rejeitada → tijolo'),
      queue,
      this.statsBlock(dsu),
      this.section('parent[] das salas'),
      this.parentList(dsu, Array.from({ length: dsu.n }, (_, i) => i)),
    );
  }

  /** avanca o replay quando esta em play; chamado pelo game loop */
  tick() {
    if (this.tab !== 'kruskal' || !this.kruskal.playing || !this.snapshot) return false;
    const total = this.snapshot.map.steps.length;
    if (this.kruskal.step >= total) {
      this.kruskal.playing = false;
      return true;
    }
    this.kruskal.step++;
    return true;
  }
}
