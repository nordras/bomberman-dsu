/** Tipos de celula do grid. */
export const EMPTY = 0; // chao livre
export const WALL = 1;  // parede indestrutivel
export const BRICK = 2; // bloco destrutivel

/** @param {number} t @returns {boolean} bloqueia movimento? */
export const isSolid = (t) => t === WALL || t === BRICK;

/** @param {number} t @returns {boolean} bloqueia a propagacao da explosao? */
export const blocksBlast = (t) => t === WALL;
