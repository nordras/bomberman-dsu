import { DSU } from './dsu.js';
import { mulberry32, shuffle } from './rng.js';
import { EMPTY, WALL, BRICK } from './tiles.js';

/**
 * Gera o labirinto com Kruskal aleatorizado sobre uma DSU.
 *
 * Modelagem: celulas em coordenadas impares sao "salas"; as celulas pares
 * entre duas salas sao as "paredes candidatas" (arestas do grafo).
 * Embaralhamos as arestas e, para cada uma:
 *
 *   - find(a) != find(b)  -> union e a parede vira CHAO (aresta da arvore
 *                            geradora, garante conectividade total)
 *   - find(a) == find(b)  -> a parede vira BRICK (destrutivel), ou CHAO com
 *                            probabilidade `braid`, criando atalhos/ciclos
 *
 * Como a arvore geradora e sempre chao, o mapa e 100% conexo *sem* precisar
 * explodir nada -- os tijolos sao atalhos opcionais.
 *
 * @param {object} [opts]
 * @param {number} [opts.cols] largura em celulas (impar)
 * @param {number} [opts.rows] altura em celulas (impar)
 * @param {number} [opts.seed]
 * @param {number} [opts.braid] chance de uma aresta rejeitada virar chao
 * @returns {{cols:number, rows:number, tiles:Uint8Array, seed:number,
 *            spawn:{x:number,y:number}, exit:number, stats:object,
 *            rooms:{cols:number,rows:number}, steps:object[]}}
 */
export function generateMap({ cols = 15, rows = 13, seed = Date.now(), braid = 0.14 } = {}) {
  if (cols % 2 === 0 || rows % 2 === 0) {
    throw new Error('cols e rows precisam ser impares');
  }
  const rng = mulberry32(seed);
  const tiles = new Uint8Array(cols * rows).fill(WALL);
  const idx = (x, y) => y * cols + x;

  const roomCols = (cols - 1) >> 1;
  const roomRows = (rows - 1) >> 1;
  const roomId = (rx, ry) => ry * roomCols + rx;

  // 1. toda sala e chao
  for (let ry = 0; ry < roomRows; ry++) {
    for (let rx = 0; rx < roomCols; rx++) {
      tiles[idx(2 * rx + 1, 2 * ry + 1)] = EMPTY;
    }
  }

  // 2. arestas candidatas entre salas vizinhas
  /** @type {{a:number, b:number, wall:number}[]} */
  const edges = [];
  for (let ry = 0; ry < roomRows; ry++) {
    for (let rx = 0; rx < roomCols; rx++) {
      if (rx + 1 < roomCols) {
        edges.push({ a: roomId(rx, ry), b: roomId(rx + 1, ry), wall: idx(2 * rx + 2, 2 * ry + 1) });
      }
      if (ry + 1 < roomRows) {
        edges.push({ a: roomId(rx, ry), b: roomId(rx, ry + 1), wall: idx(2 * rx + 1, 2 * ry + 2) });
      }
    }
  }
  shuffle(edges, rng);

  // 3. Kruskal: a DSU decide o que e corredor e o que e tijolo
  const dsu = new DSU(roomCols * roomRows);
  /** @type {{a:number,b:number,wall:number,accepted:boolean,braided:boolean}[]} */
  const steps = [];
  let carved = 0;
  let bricks = 0;
  for (const e of edges) {
    const accepted = dsu.union(e.a, e.b);
    let braided = false;
    if (accepted) {
      tiles[e.wall] = EMPTY;
      carved++;
    } else if (rng() < braid) {
      tiles[e.wall] = EMPTY; // braiding: cria ciclos, deixa o mapa menos "corredor"
      carved++;
      braided = true;
    } else {
      tiles[e.wall] = BRICK;
      bricks++;
    }
    steps.push({ a: e.a, b: e.b, wall: e.wall, accepted, braided });
  }

  // 4. area de spawn livre no canto superior esquerdo
  const spawn = { x: 1, y: 1 };
  for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [2, 0], [0, 2]]) {
    const x = spawn.x + dx;
    const y = spawn.y + dy;
    if (x < cols - 1 && y < rows - 1 && tiles[idx(x, y)] === BRICK) {
      tiles[idx(x, y)] = EMPTY;
      bricks--;
    }
  }

  // 5. saida escondida sob um tijolo aleatorio
  const brickIndexes = [];
  for (let i = 0; i < tiles.length; i++) if (tiles[i] === BRICK) brickIndexes.push(i);
  const exit = brickIndexes.length
    ? brickIndexes[Math.floor(rng() * brickIndexes.length)]
    : idx(cols - 2, rows - 2);

  return {
    cols,
    rows,
    tiles,
    seed,
    spawn,
    exit,
    stats: { rooms: dsu.n, components: dsu.count, carved, bricks },
    /** grade de salas do labirinto, para o painel reproduzir o Kruskal */
    rooms: { cols: roomCols, rows: roomRows },
    /** ordem exata em que as arestas foram avaliadas, para replay */
    steps,
  };
}
