import Phaser from 'phaser';
import {
  playerSheetUrl, bombSheetUrl, bgmUrl, SFX, PLAYER_SHEET, BOMB_SHEET,
} from '../assets.js';
import { COLS, ROWS, TILE, HUD_H, COLORS } from '../config.js';

/** indice do frame na grade do bomberman (10 colunas) */
const P = (row, col) => row * PLAYER_SHEET.cols + col;
/** indice do frame na grade refatiada da bomba (8 colunas) */
const B = (row, col) => row * BOMB_SHEET.cols + col;

/**
 * Carrega os assets, trata o fundo opaco do sheet da bomba e registra as
 * animacoes. So depois entra na GameScene.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  preload() {
    const w = COLS * TILE;
    const h = ROWS * TILE + HUD_H;

    // o mp3 tem ~3.5 MB: sem barra de progresso a tela fica preta por segundos
    const bar = this.add.graphics();
    const label = this.add.text(w / 2, h / 2 - 24, 'carregando...', {
      fontFamily: 'ui-monospace, Consolas, monospace',
      fontSize: '13px',
      color: '#8a8aa5',
    }).setOrigin(0.5);

    this.load.on('progress', (p) => {
      bar.clear();
      bar.fillStyle(0x2a2a3a).fillRect(w / 2 - 120, h / 2, 240, 6);
      bar.fillStyle(COLORS.player).fillRect(w / 2 - 120, h / 2, 240 * p, 6);
    });
    this.load.once('complete', () => {
      bar.destroy();
      label.destroy();
    });

    this.load.spritesheet('player', playerSheetUrl, {
      frameWidth: PLAYER_SHEET.frameWidth,
      frameHeight: PLAYER_SHEET.frameHeight,
      margin: PLAYER_SHEET.margin,
      spacing: PLAYER_SHEET.spacing,
    });
    // carregado como imagem crua: o fatiamento vem depois do chroma key
    this.load.image('bombRaw', bombSheetUrl);
    this.load.audio('bgm', bgmUrl);
    // uma chave por variacao: 'sfx-placeBomb-0', 'sfx-placeBomb-1', ...
    for (const [nome, urls] of Object.entries(SFX)) {
      urls.forEach((url, i) => this.load.audio(`sfx-${nome}-${i}`, url));
    }
  }

  create() {
    this.buildBombTexture();
    this.buildAnimations();
    this.scene.start('game');
  }

  /**
   * O sheet da bomba nao tem canal alpha util: o fundo e um azul solido.
   * Copiamos para uma CanvasTexture, zeramos o alpha *apenas* nos pixels
   * exatamente iguais ao chroma key (o branco e nucleo de explosao, nao pode
   * ser tocado) e fatiamos em 8 colunas.
   */
  buildBombTexture() {
    const src = this.textures.get('bombRaw').getSourceImage();
    const tex = this.textures.createCanvas('bomb', src.width, src.height);
    const ctx = tex.getContext();
    ctx.drawImage(src, 0, 0);

    const img = ctx.getImageData(0, 0, src.width, src.height);
    const [kr, kg, kb] = BOMB_SHEET.chromaKey;
    const px = img.data;
    for (let i = 0; i < px.length; i += 4) {
      if (px[i] === kr && px[i + 1] === kg && px[i + 2] === kb) px[i + 3] = 0;
    }
    ctx.putImageData(img, 0, 0);
    tex.refresh();

    const { frameWidth: fw, frameHeight: fh, spacing: sp, cols, rows } = BOMB_SHEET;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        tex.add(r * cols + c, 0, c * (fw + sp), r * (fh + sp), fw, fh);
      }
    }

    // a copia crua ja cumpriu seu papel; nada mais aponta para ela
    this.textures.remove('bombRaw');
  }

  buildAnimations() {
    const frames = (key, list) => list.map((frame) => ({ key, frame }));

    // --- jogador: 3 frames por direcao ---
    // linha 0 = frente, linha 2 = costas, linha 3 = perfil (esquerda).
    // O perfil direito sai por flipX, entao a linha 1 fica de reserva.
    const walk = [
      ['walk-down', P(0, 0), [P(0, 0), P(0, 1), P(0, 2)]],
      ['walk-up', P(2, 0), [P(2, 0), P(2, 1), P(2, 2)]],
      ['walk-side', P(3, 0), [P(3, 0), P(3, 1), P(3, 2)]],
    ];
    for (const [key, , list] of walk) {
      this.anims.create({
        key,
        frames: frames('player', list),
        frameRate: 10,
        repeat: -1,
      });
    }
    // linha 4: derretendo ate virar bolha (9 frames), roda uma vez
    this.anims.create({
      key: 'die',
      frames: frames('player', Array.from({ length: 9 }, (_, i) => P(4, i))),
      frameRate: 10,
      repeat: 0,
    });

    // --- bomba: linha 0, colunas 0-3, pulsando (vai e volta) ---
    this.anims.create({
      key: 'bomb-idle',
      frames: frames('bomb', [B(0, 0), B(0, 1), B(0, 2), B(0, 3)]),
      frameRate: 8,
      repeat: -1,
      yoyo: true,
    });

    // --- explosao: colunas = peca, linhas 1..5 = quadros da animacao ---
    const EXPLOSION_PIECES = {
      'exp-center': 1, // cruz, onde a bomba estava
      'exp-tip-v': 0,  // ponta vertical (aponta para cima; flipY para baixo)
      'exp-tip-h': 2,  // ponta horizontal (aponta para a direita; flipX p/ esquerda)
      'exp-v': 3,      // haste vertical
      'exp-h': 4,      // haste horizontal
    };
    for (const [key, col] of Object.entries(EXPLOSION_PIECES)) {
      this.anims.create({
        key,
        frames: frames('bomb', [1, 2, 3, 4, 5].map((row) => B(row, col))),
        frameRate: 11,
        repeat: 0,
      });
    }
  }
}
