import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene.js';
import { GameScene } from './scenes/GameScene.js';
import { DsuPanel } from './viz/panel.js';
import { COLS, ROWS, TILE, HUD_H, COLORS } from './config.js';

const panel = new DsuPanel(document.getElementById('viz'));

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: COLS * TILE,
  height: ROWS * TILE + HUD_H,
  backgroundColor: COLORS.bg,
  pixelArt: true,
  scene: [BootScene, GameScene],
  callbacks: {
    // disponivel antes de qualquer cena rodar
    preBoot: (g) => g.registry.set('viz', panel),
  },
});

// util de debug: no dev server, `__game.scene.getScene('game')` expoe o estado
if (import.meta.env.DEV) {
  window.__game = game;
  window.__viz = panel;
}
