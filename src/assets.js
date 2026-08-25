// Os imports passam pelo Vite: viram URLs com hash no build e sao
// verificados em tempo de compilacao (erro se o arquivo sumir).
import playerSheetUrl from './images/bomberman-sprite.png';
import bombSheetUrl from './images/bomb-sprite.png';
import bgmUrl from './audio/bomberman5_ost.mp3';
import walk1Url from './audio/Walking 1.wav';
import walk2Url from './audio/Walking 2.wav';
import deathUrl from './audio/death-fx.mp3';
import bomb1Url from './audio/place_bomb_bomberman-fx-1.mp3';
import bomb2Url from './audio/place_bomb_bomberman-fx-2.mp3';
import bomb3Url from './audio/place_bomb_bomberman-fx-3.mp3';

export { playerSheetUrl, bombSheetUrl, bgmUrl };

/**
 * Efeitos sonoros. As variacoes ficam em array: o jogo sorteia uma a cada uso,
 * o que evita o efeito de "metralhadora" de ouvir sempre a mesma amostra.
 */
export const SFX = {
  walk: [walk1Url, walk2Url],
  death: [deathUrl],
  placeBomb: [bomb1Url, bomb2Url, bomb3Url],
};

/** bomberman-sprite.png: grade 32x32 com 1px de margem, 10 colunas x 8 linhas */
export const PLAYER_SHEET = { frameWidth: 32, frameHeight: 32, margin: 1, spacing: 0, cols: 10 };

/**
 * bomb-sprite.png: grade 16x16 com 1px de espacamento, fundo OPACO.
 * O sheet tem logo e texto na metade direita, entao so as 8 primeiras
 * colunas prestam. Refatiamos em 8 colunas (em vez das 15 que o Phaser
 * calcularia) para que o indice do frame seja `linha * 8 + coluna`.
 */
export const BOMB_SHEET = {
  frameWidth: 16,
  frameHeight: 16,
  spacing: 1,
  cols: 8,
  rows: 8,
  /** cor de fundo a ser recortada (chroma key), exata: 48 cores na imagem */
  chromaKey: [112, 146, 190],
};
