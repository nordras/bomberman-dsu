export const COLS = 15;      // precisa ser impar (labirinto de salas/paredes)
export const ROWS = 13;      // idem
export const TILE = 40;      // px por celula
export const HUD_H = 48;     // faixa de status acima do tabuleiro

export const STEP_MS = 130;  // duracao de um passo do jogador
export const FUSE_MS = 2000; // pavio da bomba
export const FLAME_MS = 480; // duracao da chama
export const MAX_BOMBS = 3;
export const BOMB_RANGE = 2;

export const COLORS = {
  bg: 0x14141d,
  floorA: 0x1c1c28,
  floorB: 0x202030,
  wall: 0x3c3c52,
  wallTop: 0x4d4d68,
  brick: 0x8a5636,
  brickTop: 0xa5683f,
  player: 0x4fd1c5,
  bomb: 0x14141a,
  fuse: 0xffd166,
  flameCore: 0xffe08a,
  flameEdge: 0xff6b35,
  exit: 0xa06cff,
  text: 0xd8d8ea,
};

/** paleta usada pelo overlay de componentes conexas (tecla C) */
export const REGION_COLORS = [
  0x4fd1c5, 0xf6ad55, 0xa06cff, 0x63b3ed, 0xf687b3,
  0x9ae6b4, 0xfc8181, 0xd6bcfa, 0x81e6d9, 0xfbd38d,
];

// --- sprites e audio ---
export const PLAYER_SCALE = TILE / 32;   // sheet 32x32 -> preenche o tile
export const BOMB_SCALE = TILE / 16 * 0.8; // bomba um pouco menor que o tile
export const FLAME_SCALE = TILE / 16;    // chama preenche o tile inteiro
export const BGM_VOLUME = 0.175;
export const SFX_VOLUME = 0.5;    // bomba e morte
export const WALK_VOLUME = 0.3;   // passos, em loop enquanto anda
// tempo sem andar antes de cortar o som de passos: evita picotar entre um
// passo e o proximo quando a tecla continua pressionada
export const WALK_STOP_MS = 140;
export const VIZ_INTERVAL_MS = 125; // frequencia de atualizacao do painel da DSU
