import Phaser from 'phaser';
import { generateMap } from '../core/mapgen.js';
import { blastCells, chainGroups } from '../core/blast.js';
import { walkableRegions } from '../core/regions.js';
import { EMPTY, WALL, BRICK, isSolid } from '../core/tiles.js';
import {
  COLS, ROWS, TILE, HUD_H, STEP_MS, FUSE_MS, FLAME_MS,
  MAX_BOMBS, BOMB_RANGE, COLORS, REGION_COLORS,
  PLAYER_SCALE, BOMB_SCALE, FLAME_SCALE, BGM_VOLUME, VIZ_INTERVAL_MS,
  SFX_VOLUME, WALK_VOLUME, WALK_STOP_MS,
} from '../config.js';
import { SFX } from '../assets.js';
import { pickAvoidingRepeat } from '../core/pick.js';

/** quantas detonacoes o painel guarda para consulta */
const MAX_CHAIN_HISTORY = 12;

/** chave em localStorage com a preferencia de som */
const MUTE_KEY = 'bomberman-dsu:mute';

/** peca da cruz -> animacao, conforme o eixo e se e ponta */
const PIECE_ANIM = { c: 'exp-center', h: 'exp-h', v: 'exp-v' };
const TIP_ANIM = { h: 'exp-tip-h', v: 'exp-tip-v' };

export class GameScene extends Phaser.Scene {
  constructor() {
    super('game');
  }

  create() {
    this.gfx = this.add.graphics().setDepth(0);

    this.playerSprite = this.add.sprite(0, 0, 'player', 0)
      .setScale(PLAYER_SCALE)
      .setDepth(20);

    this.hudText = this.add.text(12, 8, '', {
      fontFamily: 'ui-monospace, Consolas, monospace',
      fontSize: '13px',
      color: '#d8d8ea',
      lineSpacing: 4,
    }).setDepth(50);

    this.statusText = this.add.text(
      (COLS * TILE) / 2,
      HUD_H + (ROWS * TILE) / 2,
      '',
      {
        fontFamily: 'ui-monospace, Consolas, monospace',
        fontSize: '20px',
        color: '#ffffff',
        backgroundColor: '#000000cc',
        padding: { x: 18, y: 12 },
        align: 'center',
      },
    ).setOrigin(0.5).setDepth(50).setVisible(false);

    this.cursors = this.input.keyboard.createCursorKeys();
    this.keySpace = this.input.keyboard.addKey('SPACE');
    this.keyR = this.input.keyboard.addKey('R');
    this.keyC = this.input.keyboard.addKey('C');
    this.keyM = this.input.keyboard.addKey('M');
    this.input.keyboard.addCapture('SPACE,UP,DOWN,LEFT,RIGHT');

    this.showRegions = false;
    /** painel lateral de visualizacao, criado em main.js */
    this.viz = this.registry.get('viz');
    this.vizAcc = 0;
    this.startMusic();
    this.reset();
  }

  /**
   * O navegador so libera audio depois de um gesto do usuario. O Phaser expoe
   * isso em `sound.locked` e avisa pelo evento UNLOCKED.
   */
  startMusic() {
    this.bgm = this.sound.add('bgm', { loop: true, volume: BGM_VOLUME });
    // O `volume` do config nao chega ao no de ganho nesta versao do Phaser:
    // fica registrado em `bgm.config` mas o gain segue em 1, e a trilha toca
    // no volume cheio. Aplicar explicitamente e o que de fato funciona.
    this.bgm.setVolume(BGM_VOLUME);
    this.buildSfx();

    // a preferencia sobrevive a um F5: quem mutou nao leva a trilha de novo
    this.applyMute(localStorage.getItem(MUTE_KEY) === '1');
    if (this.sound.locked) {
      this.sound.once(Phaser.Sound.Events.UNLOCKED, () => this.playBgm());
    } else {
      this.playBgm();
    }

    // Uma aba esquecida em segundo plano nao pode ficar tocando musica: o
    // `pauseOnBlur` do Phaser depende do foco da janela, que nem sempre muda
    // quando a aba some. A Page Visibility API cobre esse caso.
    this.onVisibility = () => {
      if (document.hidden) this.bgm.pause();
      else this.playBgm();
    };
    document.addEventListener('visibilitychange', this.onVisibility);

    this.muteButton = document.getElementById('mute');
    if (this.muteButton) this.muteButton.onclick = () => this.toggleMute();
    this.syncMuteButton();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      document.removeEventListener('visibilitychange', this.onVisibility);
      if (this.muteButton) this.muteButton.onclick = null;
      this.bgm.stop();
      for (const g of Object.values(this.sfx ?? {})) for (const snd of g.sounds) snd.stop();
    });
  }

  /** Alterna o mudo; a tecla M e o botao caem os dois aqui. */
  toggleMute() {
    this.applyMute(!this.muted);
  }

  /**
   * A cena e a dona do estado de mudo.
   *
   * Nao da para reler `this.sound.mute` logo apos escrever: no WebAudio o
   * getter le o ganho do no de audio, que so muda no proximo bloco de
   * processamento. Perguntar ao motor deixaria o botao um clique atrasado.
   * @param {boolean} muted
   */
  applyMute(muted) {
    this.muted = muted;
    this.sound.mute = muted;
    localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
    this.syncMuteButton();
  }

  /** Mantem o botao de HTML refletindo o estado guardado na cena. */
  syncMuteButton() {
    if (!this.muteButton) return;
    this.muteButton.setAttribute('aria-pressed', String(this.muted));
    this.muteButton.querySelector('.ico').textContent = this.muted ? '🔇' : '🔊';
  }

  /**
   * Instancia os efeitos. Cada grupo guarda suas variacoes e qual foi a
   * ultima tocada, para o sorteio nunca repetir a amostra anterior.
   */
  buildSfx() {
    /** @type {Record<string, {sounds: Phaser.Sound.BaseSound[], last: number}>} */
    this.sfx = {};
    for (const [nome, urls] of Object.entries(SFX)) {
      const loop = nome === 'walk';
      const volume = loop ? WALK_VOLUME : SFX_VOLUME;
      const sounds = urls.map((_, i) => {
        const snd = this.sound.add(`sfx-${nome}-${i}`, { loop });
        snd.setVolume(volume); // o volume do config nao chega ao no de ganho
        return snd;
      });
      this.sfx[nome] = { sounds, last: -1 };
    }
    this.walkIdle = WALK_STOP_MS; // comeca parado
  }

  /**
   * Sorteia uma variacao do grupo, sem repetir a ultima (ver `core/pick.js`).
   * @param {string} nome
   * @returns {Phaser.Sound.BaseSound|null}
   */
  pickSfx(nome) {
    const g = this.sfx?.[nome];
    if (!g || !g.sounds.length) return null;
    const i = pickAvoidingRepeat(g.sounds.length, g.last);
    g.last = i;
    return g.sounds[i];
  }

  /** Toca uma variacao do efeito, do inicio. */
  playSfx(nome) {
    const snd = this.pickSfx(nome);
    if (!snd) return;
    if (snd.isPlaying) snd.stop();
    snd.play();
  }

  /**
   * Passos: as amostras tem ~1s (varios passos), entao nao servem como
   * one-shot por celula -- tocam em loop enquanto o jogador anda. O corte usa
   * um respiro de WALK_STOP_MS para nao picotar entre um passo e o proximo
   * quando a seta segue pressionada.
   */
  updateWalkSound(delta) {
    if (!this.sfx) return;
    const andando = this.state === 'playing' && this.player.moving;
    this.walkIdle = andando ? 0 : this.walkIdle + delta;

    const tocando = this.sfx.walk.sounds.find((s) => s.isPlaying);
    if (andando && !tocando) {
      const snd = this.pickSfx('walk'); // variacao nova a cada retomada
      if (snd) snd.play();
    } else if (tocando && this.walkIdle >= WALK_STOP_MS) {
      tocando.stop();
    }
  }

  /** Silencia os passos na hora (morte, vitoria, novo mapa). */
  stopWalkSound() {
    for (const s of this.sfx?.walk.sounds ?? []) if (s.isPlaying) s.stop();
    this.walkIdle = WALK_STOP_MS;
  }

  /** Toca ou retoma a trilha, respeitando o mudo e a aba estar visivel. */
  playBgm() {
    if (document.hidden || this.bgm.isPlaying) return;
    if (this.bgm.isPaused) this.bgm.resume();
    else this.bgm.play();
  }

  /** Gera um mapa novo e zera o estado da partida. */
  reset(seed = Math.floor(Math.random() * 2 ** 31)) {
    const map = generateMap({ cols: COLS, rows: ROWS, seed });
    this.map = map;
    this.tiles = map.tiles;
    this.exitIndex = map.exit;
    this.exitRevealed = false;

    this.player = {
      gx: map.spawn.x,
      gy: map.spawn.y,
      fromX: map.spawn.x,
      fromY: map.spawn.y,
      t: 1,
      moving: false,
      facing: 'down',
    };

    for (const b of this.bombs ?? []) b.sprite.destroy();
    /** @type {{index:number, range:number, fuse:number, sprite:Phaser.GameObjects.Sprite}[]} */
    this.bombs = [];

    for (const f of (this.flames ?? new Map()).values()) f.sprite.destroy();
    /** @type {Map<number, {ttl:number, sprite:Phaser.GameObjects.Sprite}>} */
    this.flames = new Map();

    this.bricksDestroyed = 0;
    this.chainsTriggered = 0;
    /** detonacoes ja ocorridas, mais recente primeiro @type {object[]} */
    this.chainHistory = [];
    this.detonationCount = 0;
    this.chainDsu = null;
    this.state = 'playing';
    this.statusText.setVisible(false);
    this.regionDsu = null;

    this.stopWalkSound();
    this.playerSprite.setVisible(true).setFlipX(false).play('walk-down');
    this.playerSprite.anims.pause();
    this.syncPlayerSprite();
    this.pushViz();
  }

  idx(x, y) {
    return y * COLS + x;
  }

  /** centro em pixels da celula */
  cx(i) {
    return (i % COLS) * TILE + TILE / 2;
  }

  cy(i) {
    return ((i / COLS) | 0) * TILE + HUD_H + TILE / 2;
  }

  /** Celula caminhavel e sem bomba em cima? */
  canWalk(x, y) {
    if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return false;
    const i = this.idx(x, y);
    if (isSolid(this.tiles[i])) return false;
    return !this.bombs.some((b) => b.index === i);
  }

  update(_time, delta) {
    if (Phaser.Input.Keyboard.JustDown(this.keyR)) this.reset();
    if (Phaser.Input.Keyboard.JustDown(this.keyM)) this.toggleMute();
    if (Phaser.Input.Keyboard.JustDown(this.keyC)) {
      this.showRegions = !this.showRegions;
      this.regionDsu = null;
    }

    if (this.state === 'playing') {
      this.updateMovement(delta);
      this.updateBombs(delta);
      this.checkPlayer();
    }
    this.updateFlames(delta);
    this.updateWalkSound(delta);

    this.syncPlayerSprite();
    this.drawTerrain();
    this.drawHud();

    // o painel nao precisa de 60fps: 8x por segundo ja parece tempo real
    this.vizAcc += delta;
    if (this.viz?.tick() || this.vizAcc >= VIZ_INTERVAL_MS) {
      this.vizAcc = 0;
      this.pushViz(true);
    }
  }

  /**
   * A DSU do chao livre e reconstruida sob demanda (DSU nao sabe fazer
   * split, entao qualquer mudanca no mapa invalida a estrutura inteira).
   * O `trace` alimenta o log de operacoes do painel.
   */
  ensureRegionDsu() {
    if (!this.regionDsu) {
      // as bombas contam como obstaculo: plantar uma pode partir o mapa em
      // duas regioes, e e exatamente esse split que a DSU nao sabe desfazer
      this.regionDsu = walkableRegions(this.tiles, COLS, ROWS, {
        trace: true,
        blocked: new Set(this.bombs.map((b) => b.index)),
      });
    }
    return this.regionDsu;
  }

  /**
   * A DSU da cadeia so muda quando o conjunto de bombas ou o mapa muda.
   * Sem cache ela seria refeita 8x por segundo so para o painel ler.
   */
  ensureChainDsu() {
    if (!this.chainDsu) {
      this.chainDsu = chainGroups(this.bombs, this.tiles, COLS, ROWS, { trace: true });
    }
    return this.chainDsu;
  }

  /**
   * Guarda o retrato de uma detonacao. Sem isso os dados da cadeia sumiriam
   * no instante mais interessante: quando as bombas deixam de existir.
   */
  recordDetonation({ dsu, bombs, exploded, cells, bricks }) {
    this.detonationCount += 1;
    this.chainHistory.unshift({
      n: this.detonationCount,
      at: new Date().toLocaleTimeString(),
      dsu, // a DSU daquele instante, com parent/rank/log/stats congelados
      bombs, // todas as bombas vivas na hora: o indice casa com parent[]
      exploded, // quais delas foram detonadas
      triggered: exploded.filter((i) => bombs[i].fuse <= 0).length,
      cells,
      bricks,
    });
    if (this.chainHistory.length > MAX_CHAIN_HISTORY) {
      this.chainHistory.length = MAX_CHAIN_HISTORY;
    }
  }

  /**
   * Envia o estado atual das tres DSUs para o painel lateral.
   * @param {boolean} [auto] true quando vem do game loop (e nao de um evento)
   */
  pushViz(auto = false) {
    if (!this.viz) return;
    this.viz.render({
      map: this.map,
      tiles: this.tiles,
      cols: COLS,
      rows: ROWS,
      regionDsu: this.ensureRegionDsu(),
      blockedCells: new Set(this.bombs.map((b) => b.index)),
      bombs: this.bombs,
      chainDsu: this.ensureChainDsu(),
      chainHistory: this.chainHistory,
      playerIndex: this.idx(this.player.gx, this.player.gy),
    }, { auto });
  }

  updateMovement(delta) {
    const p = this.player;

    if (p.moving) {
      p.t += delta / STEP_MS;
      if (p.t >= 1) {
        p.t = 1;
        p.moving = false;
      }
      return;
    }

    if (Phaser.Input.Keyboard.JustDown(this.keySpace)) this.placeBomb();

    let dx = 0;
    let dy = 0;
    if (this.cursors.left.isDown) dx = -1;
    else if (this.cursors.right.isDown) dx = 1;
    else if (this.cursors.up.isDown) dy = -1;
    else if (this.cursors.down.isDown) dy = 1;

    if (dx === 0 && dy === 0) return;

    p.facing = dx < 0 ? 'left' : dx > 0 ? 'right' : dy < 0 ? 'up' : 'down';

    const nx = p.gx + dx;
    const ny = p.gy + dy;
    if (!this.canWalk(nx, ny)) return;

    p.fromX = p.gx;
    p.fromY = p.gy;
    p.gx = nx;
    p.gy = ny;
    p.t = 0;
    p.moving = true;
  }

  /** Posiciona e anima o sprite do jogador conforme o estado logico. */
  syncPlayerSprite() {
    const p = this.player;
    const s = this.playerSprite;
    const e = Phaser.Math.Easing.Sine.InOut(p.t);
    s.x = Phaser.Math.Linear(p.fromX, p.gx, e) * TILE + TILE / 2;
    s.y = Phaser.Math.Linear(p.fromY, p.gy, e) * TILE + HUD_H + TILE / 2;

    if (this.state !== 'playing') return;

    // o sheet so traz o perfil esquerdo: o direito sai espelhando
    const anim = p.facing === 'up' ? 'walk-up'
      : p.facing === 'down' ? 'walk-down'
        : 'walk-side';
    s.setFlipX(p.facing === 'right');
    if (s.anims.getName() !== anim) s.play(anim);

    // anima so enquanto anda; parado, congela no primeiro quadro
    if (p.moving) {
      if (s.anims.isPaused) s.anims.resume();
    } else if (!s.anims.isPaused) {
      s.anims.pause(s.anims.currentAnim.frames[0]);
    }
  }

  placeBomb() {
    if (this.bombs.length >= MAX_BOMBS) return;
    const i = this.idx(this.player.gx, this.player.gy);
    if (this.bombs.some((b) => b.index === i)) return;

    const sprite = this.add.sprite(this.cx(i), this.cy(i), 'bomb', 0)
      .setScale(BOMB_SCALE)
      .setDepth(10)
      .play('bomb-idle');
    this.bombs.push({ index: i, range: BOMB_RANGE, fuse: FUSE_MS, sprite });
    this.playSfx('placeBomb');
    this.regionDsu = null; // a bomba e um obstaculo novo: refaz as regioes
    this.chainDsu = null;  // e muda quem alcanca quem
    this.pushViz();
  }

  updateBombs(delta) {
    if (this.bombs.length === 0) return;
    for (const b of this.bombs) {
      b.fuse -= delta;
      // o pulso acelera conforme o pavio acaba
      b.sprite.anims.timeScale = 1 + 2 * (1 - Math.max(0, b.fuse) / FUSE_MS);
    }

    const ready = [];
    this.bombs.forEach((b, i) => {
      if (b.fuse <= 0) ready.push(i);
    });
    if (ready.length === 0) return;

    // --- DSU: descobre quem detona junto com quem (transitividade de graca) ---
    const dsu = this.ensureChainDsu();
    const roots = new Set(ready.map((i) => dsu.find(i)));
    const bombsAntes = this.bombs.map((b) => ({ index: b.index, range: b.range, fuse: b.fuse }));
    const explodedIdx = [];
    const bricksAntes = this.bricksDestroyed;

    const exploding = [];
    const remaining = [];
    this.bombs.forEach((b, i) => {
      if (roots.has(dsu.find(i))) {
        exploding.push(b);
        explodedIdx.push(i);
      } else {
        remaining.push(b);
      }
    });
    if (exploding.length > ready.length) this.chainsTriggered++;

    // monta a cruz de todas as bombas com o mapa AINDA intacto
    /** @type {Map<number, {index:number, axis:string, tip:number}>} */
    const pieces = new Map();
    for (const b of exploding) {
      for (const c of blastCells(this.tiles, COLS, ROWS, b.index, b.range)) {
        const prev = pieces.get(c.index);
        if (!prev) pieces.set(c.index, c);
        else if (prev.axis !== c.axis) pieces.set(c.index, { index: c.index, axis: 'c', tip: 0 });
        else if (prev.tip !== 0 && c.tip === 0) pieces.set(c.index, c); // haste vence ponta
      }
    }

    for (const [i, piece] of pieces) {
      if (this.tiles[i] === BRICK) {
        this.tiles[i] = EMPTY;
        this.bricksDestroyed++;
        if (i === this.exitIndex) this.exitRevealed = true;
      }
      this.spawnFlame(i, piece);
    }

    this.recordDetonation({
      dsu,
      bombs: bombsAntes,
      exploded: explodedIdx,
      cells: pieces.size,
      bricks: this.bricksDestroyed - bricksAntes,
    });

    for (const b of exploding) b.sprite.destroy();
    this.bombs = remaining;
    this.chainDsu = null; // mudaram as bombas e o mapa
    this.regionDsu = null; // o mapa mudou: overlay e painel refazem a DSU
    this.cameras.main.shake(140, 0.007);
    this.pushViz();
  }

  /** Cria (ou renova) o sprite de chama de uma celula, ja orientado. */
  spawnFlame(i, piece) {
    this.flames.get(i)?.sprite.destroy();

    const anim = piece.tip !== 0 ? TIP_ANIM[piece.axis] : PIECE_ANIM[piece.axis];
    const sprite = this.add.sprite(this.cx(i), this.cy(i), 'bomb')
      .setScale(FLAME_SCALE)
      .setDepth(30)
      .play(anim);

    // no sheet, as pontas apontam para cima (eixo v) e para a direita (eixo h)
    if (piece.axis === 'v' && piece.tip > 0) sprite.setFlipY(true);
    if (piece.axis === 'h' && piece.tip < 0) sprite.setFlipX(true);

    this.flames.set(i, { ttl: FLAME_MS, sprite });
  }

  updateFlames(delta) {
    for (const [i, f] of this.flames) {
      f.ttl -= delta;
      if (f.ttl <= 0) {
        f.sprite.destroy();
        this.flames.delete(i);
      }
    }
  }

  checkPlayer() {
    const i = this.idx(this.player.gx, this.player.gy);
    if (this.flames.has(i)) {
      this.state = 'dead';
      this.stopWalkSound();
      this.playSfx('death');
      this.playerSprite.setFlipX(false).play('die');
      this.playerSprite.once('animationcomplete', () => {
        this.statusText.setText('VOCE EXPLODIU\nR para tentar de novo').setVisible(true);
      });
      return;
    }
    if (this.exitRevealed && i === this.exitIndex && !this.player.moving) {
      this.state = 'won';
      this.stopWalkSound();
      this.playerSprite.anims.pause();
      this.statusText.setText('SAIDA ENCONTRADA!\nR para um novo mapa').setVisible(true);
    }
  }

  // ---------- terreno: segue procedural (nao ha sprites de tile) ----------

  drawTerrain() {
    const g = this.gfx;
    g.clear();

    if (this.showRegions) this.ensureRegionDsu();

    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const i = this.idx(x, y);
        const px = x * TILE;
        const py = y * TILE + HUD_H;
        const t = this.tiles[i];

        if (t === WALL) {
          g.fillStyle(COLORS.wall).fillRect(px, py, TILE, TILE);
          g.fillStyle(COLORS.wallTop).fillRect(px, py, TILE, 5);
        } else if (t === BRICK) {
          g.fillStyle(COLORS.brick).fillRect(px + 1, py + 1, TILE - 2, TILE - 2);
          g.fillStyle(COLORS.brickTop).fillRect(px + 1, py + 1, TILE - 2, 5);
        } else {
          const base = (x + y) % 2 === 0 ? COLORS.floorA : COLORS.floorB;
          g.fillStyle(base).fillRect(px, py, TILE, TILE);

          if (this.showRegions && this.regionDsu) {
            const c = REGION_COLORS[this.regionDsu.find(i) % REGION_COLORS.length];
            g.fillStyle(c, 0.22).fillRect(px, py, TILE, TILE);
          }
          if (i === this.exitIndex && this.exitRevealed) {
            g.fillStyle(COLORS.exit, 0.9).fillRect(px + 6, py + 6, TILE - 12, TILE - 12);
            g.fillStyle(COLORS.bg).fillRect(px + 13, py + 13, TILE - 26, TILE - 26);
          }
        }
      }
    }
  }

  drawHud() {
    const s = this.map.stats;
    this.hudText.setText([
      `bombas ${this.bombs.length}/${MAX_BOMBS}   tijolos ${this.bricksDestroyed}`
      + `   cadeias ${this.chainsTriggered}   saida ${this.exitRevealed ? 'revelada' : 'oculta'}`
      + `   som ${this.muted ? 'off' : 'on'}`,
      `seed ${this.map.seed}   kruskal ${s.carved} corredores / ${s.bricks} tijolos`
      + `   ${s.rooms} salas em ${s.components} componente(s)${this.showRegions ? '   [overlay ON]' : ''}`,
    ]);
  }
}
